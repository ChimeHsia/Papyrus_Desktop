import { toErrorMessage } from '../utils/helpers.js';
import { AIConfig } from './config.js';
import { paths } from '../utils/paths.js';
import { loadAllProviders } from '../db/database.js';

export let aiConfig = new AIConfig(paths.dataDir);

export function initAIConfig(): void {
  try {
    const dbProviders = loadAllProviders();
    const defaultProvider = dbProviders.find((p) => p.isDefault && p.type && p.enabled);
    if (defaultProvider && defaultProvider.type) {
      aiConfig.config.current_provider = defaultProvider.type;
      const enabledModels = defaultProvider.models
        .filter((m) => m.enabled)
        .map((m) => m.modelId)
        .filter((m): m is string => !!m);
      if (enabledModels.length > 0 && !enabledModels.includes(aiConfig.config.current_model)) {
        aiConfig.config.current_model = enabledModels[0]!;
      }
    }
    aiConfig.saveConfig();
  } catch (e) {
    console.warn('启动时初始化 AI 配置失败:', toErrorMessage(e));
  }
}

export function resetAIConfig(dataDir?: string): void {
  aiConfig = new AIConfig(dataDir ?? paths.dataDir);
}
