import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AIConfig } from '../../src/ai/config.js';

describe('AIConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create default config when file does not exist', () => {
    const config = new AIConfig(tempDir);
    expect(config.config.current_provider).toBe('liyuan-deepseek');
    expect(config.config.current_model).toBe('deepseek-v4-pro');
    expect(config.config.parameters.temperature).toBe(0.7);
    expect(config.config.features.agent_enabled).toBe(false);
  });

  it('should persist and reload config', () => {
    const config1 = new AIConfig(tempDir);
    config1.config.current_provider = 'moonshot';
    config1.config.current_model = 'kimi-k2.5';
    config1.saveConfig();

    const config2 = new AIConfig(tempDir);
    expect(config2.config.current_provider).toBe('moonshot');
    expect(config2.config.current_model).toBe('kimi-k2.5');
  });

  it('should normalize invalid parameters on load', () => {
    const configFile = path.join(tempDir, 'ai_config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      current_provider: 'openai',
      current_model: 'gpt-3.5-turbo',
      parameters: {
        temperature: 'invalid',
        max_tokens: 'also-invalid',
      },
    }), 'utf8');

    const config = new AIConfig(tempDir);
    expect(config.config.parameters.temperature).toBe(0.7);
    expect(config.config.parameters.max_tokens).toBe(2000);
  });

  it('should preserve current_provider/current_model on reload', () => {
    const configFile = path.join(tempDir, 'ai_config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      current_provider: 'user-custom-provider',
      current_model: 'user-custom-model',
      parameters: {},
      features: {},
      log: {},
    }), 'utf8');

    const config = new AIConfig(tempDir);
    expect(config.config.current_provider).toBe('user-custom-provider');
    expect(config.config.current_model).toBe('user-custom-model');
  });

  it('should return deep copy from getMaskedConfig', () => {
    const config = new AIConfig(tempDir);
    const masked = config.getMaskedConfig();
    masked.current_provider = 'mutated';
    expect(config.config.current_provider).not.toBe('mutated');
  });

  it('should save and load log config', () => {
    const config = new AIConfig(tempDir);
    config.setLogConfig({
      log_dir: tempDir,
      log_level: 'INFO',
      max_log_files: 5,
      log_rotation: true,
    });
    expect(config.getLogConfig().log_level).toBe('INFO');

    const config2 = new AIConfig(tempDir);
    expect(config2.getLogConfig().log_level).toBe('INFO');
  });
});
