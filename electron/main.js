/**
 * Electron 主进程
 *
 * 负责：
 * - 窗口创建与管理
 * - 后端进程启动
 * - 系统托盘集成
 * - 平台特定适配
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');

// 跨 productName 变更保留用户数据目录兼容性
app.setName('papyrus');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const { createDiagnosticWindow } = require('./diagnostic-window');

// 为后端 API 保护生成每个会话的认证令牌
const PAPYRUS_AUTH_TOKEN = crypto.randomBytes(32).toString('base64url');

// 用于诊断的内存日志存储
const startupLogs = [];
const originalLog = console.log;
const originalError = console.error;

// 配置
const CONFIG = {
  frontendDevUrl: 'http://localhost:5173',
  backendPort: 8000,
  backendHost: '127.0.0.1',
  healthCheckInterval: 500,
  backendStartupTimeout: 60000,
};

// 全局状态
let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;
let isDevMode = !app.isPackaged;

// 路径
const getPaths = () => {
  const resourcesPath = isDevMode 
    ? path.join(__dirname, '..') 
    : process.resourcesPath;
  
  return {
    resourcesPath,
    assetsPath: path.join(resourcesPath, 'assets'),
    frontendDistPath: path.join(__dirname, '..', 'frontend', 'dist'),
    iconPath: path.join(resourcesPath, 'assets', getIconName()),
  };
};

// 获取平台特定的图标名称
function getIconName() {
  switch (process.platform) {
    case 'win32': return 'icon.ico';
    case 'darwin': return 'icon.icns';
    default: return 'icon.png';
  }
}

// 获取后端可执行文件信息
function getBackendExecutableInfo() {
  if (isDevMode) {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['tsx', 'watch', 'src/api/server.ts'],
      cwd: path.join(__dirname, '..', 'backend'),
    };
  }

  // 生产环境中，后端通过 extraResources 放置在 resources/backend 中
  return {
    // 生产环境中，process.execPath 是 Electron 可执行文件本身。
    // 设置 ELECTRON_RUN_AS_NODE=1 使其以 Node.js 模式运行。
    command: process.execPath,
    args: [path.join(process.resourcesPath, 'backend', 'dist', 'api', 'server.js')],
    cwd: path.join(process.resourcesPath, 'backend'),
  };
}

// 日志工具
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // 存储在内存中供诊断使用
  startupLogs.push({ timestamp, message, level });
  
  // 生产环境也写入日志文件
  if (!isDevMode) {
    try {
      const logDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `main-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(logFile, logMessage + '\n');
    } catch (e) {
      // 如果文件日志写入失败，至少控制台还有输出
      console.error('Failed to write to log file:', e);
    }
  }
}

// 检查后端是否就绪
async function checkBackendHealth() {
  return new Promise((resolve) => {
    const http = require('http');
    const options = {
      hostname: CONFIG.backendHost,
      port: CONFIG.backendPort,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// 等待后端就绪
async function waitForBackend(timeout = CONFIG.backendStartupTimeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const isReady = await checkBackendHealth();
    if (isReady) {
      log('Backend is ready');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, CONFIG.healthCheckInterval));
  }
  
  throw new Error('Backend failed to start within timeout');
}

// 启动 Node.js 后端
async function startBackend() {
  const paths = getPaths();

  log(`Environment Info:`);
  log(`  isDevMode: ${isDevMode}`);
  log(`  resourcesPath: ${paths.resourcesPath}`);
  log(`  userData: ${app.getPath('userData')}`);

  const { command, args, cwd } = getBackendExecutableInfo();

  log(`Starting backend: ${command} ${args.join(' ')}`);
  log(`Backend cwd: ${cwd}`);

  const env = {
    ...process.env,
    PAPYRUS_DATA_DIR: app.getPath('userData'),
    PAPYRUS_PORT: CONFIG.backendPort.toString(),
    PAPYRUS_AUTH_TOKEN: PAPYRUS_AUTH_TOKEN,
  };

  // 生产环境中，Electron 可执行文件充当后端的 Node.js 运行时。
  // ELECTRON_RUN_AS_NODE 告诉 Electron 以无头 Node.js 模式运行，而非启动 GUI。
  if (!isDevMode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  backendProcess = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: false,
    env,
  });

  // 处理后端输出
  backendProcess.stdout?.on('data', (data) => {
    log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    log(`[Backend Error] ${data.toString().trim()}`, 'error');
  });

  backendProcess.on('error', (error) => {
    log(`Backend process error: ${error.message}`, 'error');
    if (!isQuitting) {
      dialog.showErrorBox('后端启动错误', `无法启动后端服务: ${error.message}\n\n请检查程序是否完整安装。`);
    }
  });

  backendProcess.on('exit', (code, signal) => {
    log(`Backend process exited with code ${code}, signal ${signal}`);
    if (!isQuitting && code !== 0) {
      log('Backend crashed unexpectedly', 'error');
      if (mainWindow) {
        mainWindow.webContents.send('backend-crashed');
      }
    }
  });

  // 等待后端就绪
  try {
    await waitForBackend();
    log('Backend started successfully');
  } catch (error) {
    log(`Backend failed to start: ${error.message}`, 'error');
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    throw new Error(`后端服务启动失败: ${error.message}`);
  }
}

// 停止 Node 后端
function stopBackend() {
  if (!backendProcess) return;

  const pid = backendProcess.pid;
  log(`Stopping backend process (PID: ${pid})...`);

  if (process.platform === 'win32') {
    // 使用数组参数的 spawn 避免 shell 注入
    const { spawnSync } = require('child_process');
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'pipe' });
    } catch (e) {
      log(`taskkill failed, falling back to SIGTERM: ${e.message}`, 'error');
      try {
        backendProcess.kill('SIGTERM');
      } catch {
        // process already dead
      }
    }
    // 确认进程确实已结束
    const checkResult = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { stdio: 'pipe' });
    const checkOutput = checkResult.stdout?.toString() || '';
    if (checkOutput.includes(String(pid))) {
      // 进程仍在运行——强制终止
      log(`Process ${pid} still alive after first kill, retrying...`, 'error');
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'pipe' });
    }
  } else {
    backendProcess.kill('SIGTERM');
    // 等待 3 秒，然后 SIGKILL
    setTimeout(() => {
      try {
        backendProcess?.kill('SIGKILL');
      } catch {
        // already dead
      }
    }, 3000);
  }

  backendProcess = null;
  log('Backend process stopped');
}

// 创建主窗口
function createWindow() {
  const paths = getPaths();
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // 准备就绪前不显示
    icon: paths.iconPath,
    title: 'Papyrus Desktop',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      devTools: isDevMode,
    },
    // 无框窗口——隐藏原生标题栏
    // macOS: 使用 hiddenInset 保留红/黄/绿窗口按钮
    // Windows/Linux: 使用 hidden 隐藏整个标题栏
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
  });

  // 设置内容安全策略以降低 XSS 风险
  // unsafe-inline 用于 React/CSS-in-JS；connect-src 允许 AI API 调用
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:* https:; img-src 'self' file: data: http://127.0.0.1:* http://localhost:* https: blob:; media-src 'self' http://127.0.0.1:* http://localhost:* blob:; font-src 'self' data:; frame-src 'self';",
        ],
      },
    });
  });

  // 加载内容
  if (isDevMode) {
    log(`Loading development URL: ${CONFIG.frontendDevUrl}`);
    mainWindow.loadURL(CONFIG.frontendDevUrl);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(paths.frontendDistPath, 'index.html');
    log(`Loading production file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  // 根据平台设置应用菜单
  // macOS: 完整的应用菜单（系统菜单栏包含 File、Edit、View、Window、Help）
  // Windows/Linux: 仅保留键盘快捷键所需的编辑菜单
  // 注意：Windows/Linux 的文件/编辑在自定义标题栏中，但需要编辑菜单支持快捷键
  const isMac = process.platform === 'darwin';
  
  if (isMac) {
    // macOS: 使用原生菜单栏
    const template = [
      {
        label: 'Papyrus',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          { role: 'close' } // Cmd+W
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    // Windows/Linux: 仅保留键盘快捷键的编辑菜单
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ]));
  }
  
  // 窗口事件处理
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDevMode) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform !== 'darwin' && tray) {
      try {
        event.preventDefault();
        mainWindow.hide();
        tray.displayBalloon({
          iconType: 'info',
          title: 'Papyrus Desktop',
          content: 'Papyrus Desktop is running in the background. Click the tray icon to restore.',
        });
      } catch (trayErr) {
        log(`Tray operation failed, allowing normal close: ${trayErr.message}`, 'error');
        tray = null;
      }
    }
    // 如果托盘不可用，让窗口正常关闭，以免用户被困
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 安全：打开前验证 URL
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { action: 'deny' };
    }
    if (allowedProtocols.includes(parsed.protocol)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// 创建系统托盘
function createTray() {
  const paths = getPaths();
  
  try {
    tray = new Tray(paths.iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Papyrus Desktop',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open Data Folder',
        click: () => {
          const dataPath = app.getPath('userData');
          shell.openPath(dataPath);
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Papyrus Desktop');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createWindow();
      }
    });

    log('Tray created successfully');
  } catch (error) {
    log(`Failed to create tray: ${error.message}`, 'error');
  }
}

// IPC 处理程序
function setupIPC() {
  // 获取应用版本
  ipcMain.handle('app:getVersion', () => app.getVersion());
  
  // 获取平台信息
  ipcMain.handle('app:getPlatform', () => process.platform);
  
  // 检查是否为开发模式
  ipcMain.handle('app:isDev', () => isDevMode);

  // 获取后端认证令牌（供渲染进程的 API 请求使用）
  ipcMain.handle('app:getAuthToken', () => PAPYRUS_AUTH_TOKEN);

  // 退出应用（设置 isQuitting 使 window.close() 真正退出）
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  // 打开外部链接
  ipcMain.handle('shell:openExternal', async (event, url) => {
  // 安全：对协议进行白名单验证，防止通过危险协议实现 RCE
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    const allowedDomains = [
      'github.com',
      'githubusercontent.com',
      'papyrus.liyuanstudio.com',
      'openai.com',
      'anthropic.com',
      'google.com',
      'googleapis.com',
      'deepseek.com',
      'siliconflow.cn',
      'moonshot.cn',
    ];
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      throw new Error('Invalid URL');
    }
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error('Disallowed protocol');
    }
    if (parsed.protocol !== 'mailto:') {
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
      if (!isAllowed) {
        throw new Error('Disallowed domain: ' + hostname);
      }
    }
    await shell.openExternal(url);
  });
  
  // 打开数据文件夹
  ipcMain.handle('shell:openDataFolder', () => {
    const dataPath = app.getPath('userData');
    shell.openPath(dataPath);
  });

  // 打开任意文件夹（带路径验证）
  ipcMain.handle('shell:openFolder', async (event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') {
      throw new Error('Invalid folder path');
    }
    const resolved = path.resolve(folderPath);
    const dataDir = app.getPath('userData');
    const homeDir = os.homedir();
    const documentsDir = path.join(homeDir, 'Documents');
    const downloadsDir = path.join(homeDir, 'Downloads');
    const isUnderDataDir = resolved === dataDir || resolved.startsWith(dataDir + path.sep);
    const isUnderDocuments = resolved === documentsDir || resolved.startsWith(documentsDir + path.sep);
    const isUnderDownloads = resolved === downloadsDir || resolved.startsWith(downloadsDir + path.sep);
    if (!isUnderDataDir && !isUnderDocuments && !isUnderDownloads) {
      throw new Error('Path outside allowed directories');
    }
    await shell.openPath(resolved);
  });

  // 最小化到托盘
  ipcMain.handle('window:minimizeToTray', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });
  
  // 窗口控制
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      // 触发 close 事件，由事件处理托盘逻辑
      mainWindow.close();
    }
  });
  
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
  
  // 检查后端健康状态
  ipcMain.handle('backend:checkHealth', async () => {
    return await checkBackendHealth();
  });
  
  // 重启后端
  let lastBackendRestart = 0;
  ipcMain.handle('backend:restart', async () => {
    // 安全：限制后端重启频率以防止 DoS
    const now = Date.now();
    if (now - lastBackendRestart < 30000) {
      throw new Error('Backend restart rate limited: please wait 30 seconds');
    }
    lastBackendRestart = now;
    stopBackend();
    await startBackend();
    return true;
  });
  
  // 选择文件夹对话框
  ipcMain.handle('dialog:selectFolder', async (event, defaultPath) => {
    if (!mainWindow) return { canceled: true };
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath: defaultPath || app.getPath('userData'),
    });
    
    return result;
  });
}

// 安全：已移除根证书安装以防止 MITM 攻击。
// 自签名根证书绝不应安装到系统信任存储中。

// 单实例锁——必须在 app.whenReady() 之前检查，防止
// 第二个实例初始化后端进程和创建窗口
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log('Another instance is already running, quitting...');
  app.quit();
  // 因 app.quit() 而无法到达此处，但为清晰显式返回
}

app.on('second-instance', () => {
  log('Second instance detected, focusing window');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});



// 应用事件处理
app.whenReady().then(async () => {
  log('App is ready');
  
  try {
    // 安全：已移除根证书安装以防止 MITM 攻击。
    
    // 检查后端是否已在运行（例如由 start-dev.bat 启动）
    const isBackendAlreadyRunning = await checkBackendHealth();
    
    if (isBackendAlreadyRunning) {
      log('Backend is already running (likely started by dev script), skipping backend startup');
    } else {
      // 仅当后端未在运行时才启动
      await startBackend();
    }
    
    // 在创建窗口之前注册 IPC 处理程序，以便渲染进程
    // 可以在加载时立即获取认证令牌。
    setupIPC();

    // 创建窗口和托盘
    createWindow();
    createTray();
    
  } catch (error) {
    log(`Failed to initialize: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    
    // 收集诊断信息
    const paths = getPaths();
    const { command, args, cwd } = getBackendExecutableInfo();

    const diagnosticPaths = {
      resourcesPath: paths.resourcesPath,
      backendCommand: command,
      backendArgs: args,
      backendCwd: cwd,
      userData: app.getPath('userData'),
      __dirname: __dirname,
      processResourcesPath: process.resourcesPath,
    };
    
    // 显示诊断窗口
    createDiagnosticWindow(startupLogs, diagnosticPaths, error);
    
    // 同时显示简单错误对话框
    dialog.showErrorBox(
      'Initialization Error', 
      `Failed to start: ${error.message}\n\nDiagnostic window opened with details.`
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 在 Windows/Linux 上，保持应用在托盘运行
    // 除非显式请求，否则不退出
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopBackend();
});

app.on('quit', () => {
  log('App is quitting');
});

// 安全：防止创建新窗口并验证 URL
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    let parsed;
    try {
      parsed = new URL(navigationUrl);
    } catch (e) {
      return;
    }
    if (allowedProtocols.includes(parsed.protocol)) {
      shell.openExternal(navigationUrl);
    }
  });
});

// 处理开发模式下的证书错误
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDevMode) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        log(`[SECURITY WARNING] Ignoring certificate error for ${url} in dev mode`, 'warning');
        event.preventDefault();
        callback(true);
        return;
      }
    } catch {
      // invalid URL, fall through to deny
    }
  }
  callback(false);
});

// 终止所有 Papyrus 进程（用于 Windows 安装程序/更新程序）
// 警告：此函数仅应由安装程序/更新程序调用，不应由应用自身调用
// 在应用启动期间调用此函数将杀死应用自身
function killAllPapyrusProcesses() {
  if (process.platform !== 'win32') return;
  
  try {
    log('Killing any existing Papyrus processes...');
    // 终止 Papyrus Desktop.exe（主应用）
    try {
      execSync('taskkill /F /IM "Papyrus Desktop.exe" 2>nul', { stdio: 'pipe' });
      log('Killed Papyrus Desktop.exe processes');
    } catch (e) {
      // 未找到进程或已杀死
    }
    // 等待进程完全终止
    execSync('timeout /t 1 /nobreak >nul 2>&1', { stdio: 'pipe' });
  } catch (error) {
    log(`Error killing processes: ${error.message}`, 'error');
  }
}

// 注意：此处有意不调用 killAllPapyrusProcesses()。
// 它只应由安装程序/更新程序调用，以避免应用杀死自身。
// 参见：https://github.com/electron/electron/issues/36554

// 错误处理
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  log(error.stack, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'error');
});
