import { randomUUID } from 'node:crypto';
import { getDb } from './core.js';
import type { PapyrusLogger } from '../utils/logger.js';

export interface ExtensionRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  rating: number;
  downloads: number;
  is_enabled: number;
  is_builtin: number;
  update_available: number;
  latest_version: string | null;
  tags: string;
  config: string;
  installed_at: number;
  updated_at: number;
}

export interface CreateExtensionInput {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  enabled?: boolean;
  isBuiltin?: boolean;
  config?: Record<string, unknown>;
}

export function loadAllExtensions(logger?: PapyrusLogger): ExtensionRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM extensions ORDER BY name').all() as unknown as ExtensionRecord[];
  logger?.info(`查询扩展: ${rows.length} 条`);
  return rows;
}

export function getExtensionById(id: string): ExtensionRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM extensions WHERE id = ?').get(id) as ExtensionRecord | undefined;
  return row ?? null;
}

export function installExtension(input: CreateExtensionInput, logger?: PapyrusLogger): ExtensionRecord {
  const database = getDb();
  const now = Date.now() / 1000;
  const ext: ExtensionRecord = {
    id: input.id ?? `ext-${randomUUID()}`,
    name: input.name,
    description: input.description ?? '',
    version: input.version ?? '1.0.0',
    author: input.author ?? 'Unknown',
    rating: 0,
    downloads: 0,
    is_enabled: input.enabled ? 1 : 0,
    is_builtin: input.isBuiltin ? 1 : 0,
    update_available: 0,
    latest_version: null,
    tags: '[]',
    config: JSON.stringify(input.config ?? {}),
    installed_at: now,
    updated_at: now,
  };
  const existing = database.prepare('SELECT id FROM extensions WHERE id = ?').get(ext.id) as { id: string } | undefined;
  if (existing) {
    throw new Error(`扩展 ${ext.id} 已存在`);
  }
  database.prepare(
    `INSERT INTO extensions (id, name, description, version, author, rating, downloads, is_enabled, is_builtin, update_available, latest_version, tags, config, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ext.id, ext.name, ext.description, ext.version, ext.author, ext.rating, ext.downloads,
    ext.is_enabled, ext.is_builtin, ext.update_available, ext.latest_version, ext.tags, ext.config, ext.installed_at, ext.updated_at);
  logger?.info(`安装扩展: ${ext.id}`);
  return ext;
}

export function uninstallExtension(id: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM extensions WHERE id = ?');
  const result = stmt.run(id);
  logger?.info(`卸载扩展: ${id}`);
  return result.changes > 0;
}

export function setExtensionEnabled(id: string, enabled: boolean, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('UPDATE extensions SET is_enabled = ?, updated_at = ? WHERE id = ?');
  const result = stmt.run(enabled ? 1 : 0, Date.now() / 1000, id);
  logger?.info(`扩展 ${enabled ? '启用' : '禁用'}: ${id}`);
  return result.changes > 0;
}

export function checkExtensionUpdates(logger?: PapyrusLogger): { id: string; hasUpdate: boolean; currentVersion: string; latestVersion: string }[] {
  const database = getDb();
  const rows = database.prepare('SELECT id, version, latest_version FROM extensions WHERE is_builtin = 0').all() as Array<{ id: string; version: string; latest_version: string | null }>;
  return rows.map(r => ({
    id: r.id,
    hasUpdate: r.latest_version !== null && r.latest_version !== r.version,
    currentVersion: r.version,
    latestVersion: r.latest_version ?? r.version,
  }));
}

export function updateExtensionConfig(id: string, config: Record<string, unknown>, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const now = Date.now() / 1000;
  const stmt = database.prepare('UPDATE extensions SET config = ?, updated_at = ? WHERE id = ?');
  const result = stmt.run(JSON.stringify(config), now, id);
  logger?.info(`更新扩展配置: ${id}`);
  return result.changes > 0;
}

export function getExtensionStats(): { total: number; enabled: number; builtin: number } {
  const database = getDb();
  const total = (database.prepare('SELECT COUNT(*) as c FROM extensions').get() as { c: number }).c;
  const enabled = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_enabled = 1').get() as { c: number }).c;
  const builtin = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_builtin = 1').get() as { c: number }).c;
  return { total, enabled, builtin };
}
