/**
 * Electron 预加载脚本
 *
 * 安全地向渲染进程暴露 API。
 * 所有主进程与渲染进程之间的通信都通过此脚本。
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露受保护的方法，让渲染进程可以使用
// ipcRenderer 而不暴露整个对象
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isDev: () => ipcRenderer.invoke('app:isDev'),
  // 安全说明：getAuthToken 暴露给了渲染进程。如果渲染进程发生 XSS，
  // 攻击者可能窃取此令牌。建议通过 ipcRenderer 代理 API 调用，而非暴露原始令牌。
  getAuthToken: () => ipcRenderer.invoke('app:getAuthToken'),

  // Shell 操作
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openDataFolder: () => ipcRenderer.invoke('shell:openDataFolder'),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:openFolder', folderPath),

  // 窗口操作
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // 后端操作
  checkBackendHealth: () => ipcRenderer.invoke('backend:checkHealth'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),

  // 对话框操作
  selectFolder: (defaultPath) => ipcRenderer.invoke('dialog:selectFolder', defaultPath),
});

// 暴露环境信息
contextBridge.exposeInMainWorld('electronEnv', {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PLATFORM: process.platform,
});

// 记录预加载脚本已加载
console.log('[Preload] Electron API exposed successfully');
