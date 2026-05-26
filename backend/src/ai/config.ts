import { toErrorMessage } from '../utils/helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../utils/paths.js';

export interface ParametersConfig {
  temperature: number;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
}

export interface FeaturesConfig {
  auto_hint: boolean;
  auto_explain: boolean;
  context_length: number;
  agent_enabled: boolean;
  cache_enabled: boolean;
}

export interface LogConfig {
  log_dir: string;
  log_level: string;
  max_log_files: number;
  log_rotation: boolean;
}

export interface AIConfigData {
  current_provider: string;
  current_model: string;
  parameters: ParametersConfig;
  features: FeaturesConfig;
  log: LogConfig;
}

const LOCAL_PROVIDERS = new Set([
  'ollama',
  'lm-studio',
  'localai',
  'tabbyapi',
  'koboldcpp',
  'text-generation-webui',
  'llamacpp',
]);

function toFloat(value: unknown, defaultValue: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function toInt(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function toStr(value: unknown, defaultValue = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

function isValidAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

export function isPrivateUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', '[::ffff:127.0.0.1]'].includes(hostname)) {
      return true;
    }
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) {
      return true;
    }
    if (/^0x[0-9a-f]+$/i.test(hostname)) {
      return true;
    }
    if (/^2130706433$/.test(hostname) || /^3232235521$/.test(hostname)) {
      return true;
    }
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(hostname)) {
      return true;
    }
    if (/^\[?::1\]?$/.test(hostname) || /^\[?fe80:/i.test(hostname)) {
      return true;
    }
  } catch {
    // 忽略无效 URL
  }
  return false;
}

export class AIConfig {
  configFile: string;
  config: AIConfigData;

  constructor(dataDir: string = paths.dataDir) {
    this.configFile = path.join(dataDir, 'ai_config.json');
    this.config = this.buildDefaultConfig();
    this.loadConfig();
  }

  private buildDefaultConfig(): AIConfigData {
    const defaultLogDir = path.join(paths.dataDir, 'logs');
    return {
      current_provider: 'liyuan-deepseek',
      current_model: 'deepseek-v4-pro',
      parameters: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 2000,
        presence_penalty: 0.0,
        frequency_penalty: 0.0,
      },
      features: {
        auto_hint: false,
        auto_explain: false,
        context_length: 10,
        agent_enabled: false,
        cache_enabled: false,
      },
      log: {
        log_dir: defaultLogDir,
        log_level: 'DEBUG',
        max_log_files: 10,
        log_rotation: false,
      },
    };
  }

  private normalizeParametersConfig(raw: unknown, fallback: ParametersConfig): ParametersConfig {
    if (raw === null || typeof raw !== 'object') return { ...fallback };
    const dict = raw as Record<string, unknown>;
    return {
      temperature: dict.temperature !== undefined ? toFloat(dict.temperature, fallback.temperature) : fallback.temperature,
      top_p: dict.top_p !== undefined ? toFloat(dict.top_p, fallback.top_p) : fallback.top_p,
      max_tokens: dict.max_tokens !== undefined ? toInt(dict.max_tokens, fallback.max_tokens) : fallback.max_tokens,
      presence_penalty: dict.presence_penalty !== undefined ? toFloat(dict.presence_penalty, fallback.presence_penalty) : fallback.presence_penalty,
      frequency_penalty: dict.frequency_penalty !== undefined ? toFloat(dict.frequency_penalty, fallback.frequency_penalty) : fallback.frequency_penalty,
    };
  }

  private normalizeFeaturesConfig(raw: unknown, fallback: FeaturesConfig): FeaturesConfig {
    if (raw === null || typeof raw !== 'object') return { ...fallback };
    const dict = raw as Record<string, unknown>;
    return {
      auto_hint: Boolean(dict.auto_hint ?? fallback.auto_hint),
      auto_explain: Boolean(dict.auto_explain ?? fallback.auto_explain),
      context_length: toInt(dict.context_length ?? fallback.context_length, fallback.context_length),
      agent_enabled: Boolean(dict.agent_enabled ?? fallback.agent_enabled),
      cache_enabled: Boolean(dict.cache_enabled ?? fallback.cache_enabled),
    };
  }

  private normalizeLogConfig(raw: unknown, fallback: LogConfig): LogConfig {
    if (raw === null || typeof raw !== 'object') return { ...fallback };
    const dict = raw as Record<string, unknown>;
    return {
      log_dir: dict.log_dir !== undefined ? toStr(dict.log_dir, fallback.log_dir) : fallback.log_dir,
      log_level: dict.log_level !== undefined ? toStr(dict.log_level, fallback.log_level) : fallback.log_level,
      max_log_files: toInt(dict.max_log_files ?? fallback.max_log_files, fallback.max_log_files),
      log_rotation: Boolean(dict.log_rotation ?? fallback.log_rotation),
    };
  }

  loadConfig(): void {
    if (!fs.existsSync(this.configFile)) {
      this.config = this.buildDefaultConfig();
      this.saveConfig();
      return;
    }

    try {
      const content = fs.readFileSync(this.configFile, 'utf8');
      const loaded: unknown = JSON.parse(content);
      if (loaded === null || typeof loaded !== 'object') {
        this.config = this.buildDefaultConfig();
        return;
      }
      const dict = loaded as Record<string, unknown>;
      const defaultConfig = this.buildDefaultConfig();

      this.config = {
        current_provider: toStr(dict.current_provider, defaultConfig.current_provider),
        current_model: toStr(dict.current_model, defaultConfig.current_model),
        parameters: this.normalizeParametersConfig(dict.parameters, defaultConfig.parameters),
        features: this.normalizeFeaturesConfig(dict.features, defaultConfig.features),
        log: this.normalizeLogConfig(dict.log, defaultConfig.log),
      };
    } catch (e) {
      console.error('AI 配置加载失败，已重置为默认配置:', toErrorMessage(e));
      this.config = this.buildDefaultConfig();
    }
  }

  saveConfig(): void {
    const dir = path.dirname(this.configFile);
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${this.configFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.config, null, 2), 'utf8');
    fs.renameSync(tempFile, this.configFile);
  }

  getMaskedConfig(): AIConfigData {
    return JSON.parse(JSON.stringify(this.config));
  }

  getCurrentModel(): string {
    return this.config.current_model;
  }

  getParameters(): ParametersConfig {
    return this.config.parameters;
  }

  getLogConfig(): LogConfig {
    return this.config.log;
  }

  setLogConfig(config: LogConfig): void {
    this.config.log = this.normalizeLogConfig(config, this.buildDefaultConfig().log);
    this.saveConfig();
  }
}
