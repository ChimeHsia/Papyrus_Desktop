/**
 * Electron API 的 TypeScript 类型定义
 * 
 * 此文件提供 electronAPI 对象的类型定义
 * 由 preload 脚本暴露。
 */

export interface ElectronAPI {
  /** 获取应用版本 */
  getVersion(): Promise<string>;
  
  /** 获取当前平台 (win32, darwin, linux) */
  getPlatform(): Promise<string>;
  
  /** 检查是否在开发模式下运行 */
  isDev(): Promise<boolean>;
  
  /** 在默认浏览器中打开外部 URL */
  openExternal(url: string): Promise<void>;
  
  /** 打开应用数据文件夹 */
  openDataFolder(): Promise<void>;

  /** 在系统文件管理器中打开任意文件夹 */
  openFolder(folderPath: string): Promise<void>;

  /** 最小化到系统托盘 */
  minimizeToTray(): Promise<void>;
  
  /** 最小化窗口 */
  minimizeWindow(): Promise<void>;
  
  /** 最大化/还原窗口 */
  maximizeWindow(): Promise<void>;
  
  /** 关闭窗口 */
  closeWindow(): Promise<void>;

  /** 退出整个应用 */
  quitApp(): Promise<void>;

  /** 获取后端认证令牌 */
  getAuthToken(): Promise<string | null>;

  /** 检查窗口是否最大化 */
  isMaximized(): Promise<boolean>;
  
  /** 检查后端是否健康 */
  checkBackendHealth(): Promise<boolean>;
  
  /** 重启后端进程 */
  restartBackend(): Promise<boolean>;
  
  /** 使用原生对话框选择文件夹 */
  selectFolder(defaultPath?: string): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export interface ElectronEnv {
  /** 当前 Node 环境 */
  NODE_ENV: string;
  
  /** 当前平台 */
  PLATFORM: string;
}

declare global {
  interface Window {
    /** 用于主进程通信的 Electron API */
    electronAPI: ElectronAPI;
    
    /** 环境信息 */
    electronEnv: ElectronEnv;
  }
}

export {};
