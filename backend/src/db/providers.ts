import { toErrorMessage } from '../utils/helpers.js';
import { randomUUID } from 'node:crypto';
import { getDb, jsonFromStr } from './core.js';
import { encryptApiKey, decryptApiKey } from '../core/crypto.js';
import type { Provider } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

function inferProviderType(baseUrl: string | undefined, fallbackType: string | undefined): string {
  if (fallbackType && fallbackType !== 'custom') return fallbackType;
  const url = (baseUrl ?? '').toLowerCase();
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('liyuanstudio')) return 'liyuan-deepseek';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('google') || url.includes('gemini')) return 'gemini';
  if (url.includes('moonshot')) return 'moonshot';
  if (url.includes('siliconflow')) return 'siliconflow';
  if (url.includes('localhost:11434') || url.includes('ollama')) return 'ollama';
  return fallbackType ?? 'custom';
}

export function loadAllProviders(logger?: PapyrusLogger): Provider[] {
  const database = getDb();
  const providerStmt = database.prepare('SELECT * FROM providers ORDER BY created_at');
  const providerRows = providerStmt.all() as Array<{
    id: string; type: string; name: string; base_url: string; enabled: number; is_default: number;
  }>;

  const keyStmt = database.prepare('SELECT * FROM api_keys WHERE provider_id = ? ORDER BY name');
  const modelStmt = database.prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY name');

  const providers: Provider[] = [];
  for (const row of providerRows) {
    const keyRows = keyStmt.all(row.id) as Array<{ id: string; name: string; encrypted_key: string }>;
    const apiKeys = keyRows.map(k => ({ id: k.id, name: k.name, key: decryptApiKey(k.encrypted_key) }));

    const modelRows = modelStmt.all(row.id) as Array<{
      id: string; name: string; model_id: string; port: string; capabilities: string; api_key_id: string; enabled: number;
    }>;
    const models = modelRows.map(m => ({
      id: m.id, name: m.name, modelId: m.model_id, port: m.port,
      capabilities: jsonFromStr(m.capabilities) as string[], apiKeyId: m.api_key_id ?? null, enabled: Boolean(m.enabled),
    }));

    providers.push({
      id: row.id, type: row.type, name: row.name, baseUrl: row.base_url,
      enabled: Boolean(row.enabled), isDefault: Boolean(row.is_default), apiKeys, models,
    });
  }

  const seenProviders = new Set<string>();
  const dedupedProviders: Provider[] = [];
  for (const p of providers) {
    const key = `${p.type}|${p.name}|${p.baseUrl}`;
    if (seenProviders.has(key)) continue;
    seenProviders.add(key);
    const seenModels = new Set<string>();
    const dedupedModels = p.models.filter(m => {
      if (seenModels.has(m.modelId)) return false;
      seenModels.add(m.modelId);
      return true;
    });
    dedupedProviders.push({ ...p, models: dedupedModels });
  }

  return dedupedProviders;
}

export function saveProvider(provider: Partial<Provider> & { id?: string }, logger?: PapyrusLogger): string {
  const database = getDb();
  const providerType = inferProviderType(provider.baseUrl, provider.type);
  let providerId: string;
  if (provider.id) {
    providerId = provider.id;
  } else {
    const existing = database.prepare('SELECT id FROM providers WHERE type = ? AND name = ? AND base_url = ?').get(providerType, provider.name ?? '', provider.baseUrl ?? '') as { id: string } | undefined;
    if (existing) {
      providerId = existing.id;
    } else {
      providerId = `p-${providerType}-${randomUUID()}`;
    }
  }
  const existingRow = database.prepare('SELECT id FROM providers WHERE id = ?').get(providerId) as { id: string } | undefined;
  const now = Date.now() / 1000;
  if (existingRow) {
    database.prepare(
      'UPDATE providers SET type = ?, name = ?, base_url = ?, enabled = ?, updated_at = ? WHERE id = ?'
    ).run(providerType, provider.name ?? providerType, provider.baseUrl ?? '', provider.enabled ? 1 : 0, now, providerId);
  } else {
    database.prepare(
      'INSERT INTO providers (id, type, name, base_url, enabled, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(providerId, providerType, provider.name ?? providerType, provider.baseUrl ?? '', provider.enabled ? 1 : 0, provider.isDefault ? 1 : 0, now, now);
  }
  logger?.info(`保存 provider: ${providerId}`);
  return providerId;
}

export function deleteProvider(providerId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM providers WHERE id = ?');
  const result = stmt.run(providerId);
  logger?.info(`Provider deleted: ${providerId}`);
  return result.changes > 0;
}

export function setDefaultProvider(providerId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  database.exec('UPDATE providers SET is_default = 0');
  const stmt = database.prepare('UPDATE providers SET is_default = 1 WHERE id = ?');
  const result = stmt.run(providerId);
  logger?.info(`Default provider set: ${providerId}`);
  return result.changes > 0;
}

export function updateProviderEnabled(providerId: string, enabled: boolean, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('UPDATE providers SET enabled = ? WHERE id = ?');
  const result = stmt.run(enabled ? 1 : 0, providerId);
  logger?.info(`Provider enabled updated: ${providerId} = ${enabled}`);
  return result.changes > 0;
}

// ===== API Keys =====

export function saveApiKey(providerId: string, apiKey: { id?: string; name?: string; key: string }, logger?: PapyrusLogger): string {
  const database = getDb();
  const keyId = apiKey.id ?? randomUUID();
  const now = Date.now() / 1000;
  const existing = database.prepare('SELECT id FROM api_keys WHERE id = ?').get(keyId) as { id: string } | undefined;
  if (existing) {
    database.prepare('UPDATE api_keys SET provider_id = ?, name = ?, encrypted_key = ?, created_at = COALESCE(created_at, ?) WHERE id = ?')
      .run(providerId, apiKey.name ?? 'default', encryptApiKey(apiKey.key), now, keyId);
  } else {
    database.prepare('INSERT INTO api_keys (id, provider_id, name, encrypted_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(keyId, providerId, apiKey.name ?? 'default', encryptApiKey(apiKey.key), now);
  }
  logger?.info(`API key saved: ${keyId}`);
  return keyId;
}

export function deleteApiKey(keyId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM api_keys WHERE id = ?');
  const result = stmt.run(keyId);
  logger?.info(`API key deleted: ${keyId}`);
  return result.changes > 0;
}

// ===== Models =====

export function saveModel(providerId: string, model: { id?: string; name?: string; modelId?: string; port?: string; capabilities?: string[]; apiKeyId?: string | null; enabled?: boolean }, logger?: PapyrusLogger): string {
  const database = getDb();
  const modelId = model.id ?? `${providerId}-${model.modelId}-${randomUUID()}`;
  const now = Date.now() / 1000;
  const existing = database.prepare('SELECT id FROM provider_models WHERE id = ?').get(modelId) as { id: string } | undefined;
  if (existing) {
    database.prepare(
      'UPDATE provider_models SET provider_id = ?, name = ?, model_id = ?, port = ?, capabilities = ?, api_key_id = ?, enabled = ? WHERE id = ?'
    ).run(providerId, model.name ?? model.modelId ?? '', model.modelId ?? '', model.port ?? 'openai-compat', JSON.stringify(model.capabilities ?? []), model.apiKeyId ?? null, model.enabled ? 1 : 0, modelId);
  } else {
    database.prepare(
      'INSERT INTO provider_models (id, provider_id, name, model_id, port, capabilities, api_key_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(modelId, providerId, model.name ?? model.modelId ?? '', model.modelId ?? '', model.port ?? 'openai-compat', JSON.stringify(model.capabilities ?? []), model.apiKeyId ?? null, model.enabled ? 1 : 0);
  }
  logger?.info(`Model saved: ${modelId}`);
  return modelId;
}

export function deleteModel(modelId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM provider_models WHERE id = ?');
  const result = stmt.run(modelId);
  logger?.info(`Model deleted: ${modelId}`);
  return result.changes > 0;
}

// ===== DB queries for AI provider config =====

export function getProviderConfigFromDB(providerType: string): {
  api_key: string;
  base_url: string;
  models: string[];
} | null {
  try {
    const dbProviders = loadAllProviders();
    const dbProvider = dbProviders.find((p) => p.type === providerType);
    if (!dbProvider) return null;
    const firstKey = dbProvider.apiKeys.find((k) => k.key.trim() !== '');
    return {
      api_key: firstKey?.key ?? '',
      base_url: dbProvider.baseUrl ?? '',
      models: dbProvider.models
        .filter((m) => m.enabled)
        .map((m) => m.modelId)
        .filter((m) => m.length > 0),
    };
  } catch (e) {
    console.warn('从数据库获取 provider 配置失败:', toErrorMessage(e));
    return null;
  }
}

export function getProviderApiKeyFromDB(providerType: string): string | null {
  try {
    const dbProviders = loadAllProviders();
    const dbProvider = dbProviders.find((p) => p.type === providerType);
    if (!dbProvider) return null;
    const firstKey = dbProvider.apiKeys.find((k) => k.key.trim() !== '');
    return firstKey?.key ?? null;
  } catch (e) {
    console.warn('从数据库获取 API key 失败:', toErrorMessage(e));
    return null;
  }
}
