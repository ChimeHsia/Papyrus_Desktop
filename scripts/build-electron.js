#!/usr/bin/env node
/**
 * Electron 构建脚本
 *
 * 用法：
 *   node scripts/build-electron.js dev          - 开发模式
 *   node scripts/build-electron.js build        - 为当前平台构建
 *   node scripts/build-electron.js build:win    - 为 Windows 构建
 *   node scripts/build-electron.js build:mac    - 为 macOS 构建
 *   node scripts/build-electron.js build:linux  - 为 Linux 构建
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 控制台输出的颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(60), 'cyan');
  console.log('');
}

function error(message) {
  log(`❌ ERROR: ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

// 检查命令是否存在
function commandExists(command) {
  try {
    const cmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 执行命令并处理错误
function exec(command, options = {}) {
  const defaultOptions = {
    stdio: 'inherit',
    shell: true,  // 修复：改为 true 以支持 && 等 shell 语法
    cwd: process.cwd(),
  };
  
  try {
    execSync(command, { ...defaultOptions, ...options });
    return true;
  } catch (e) {
    if (!options.ignoreError) {
      error(`Command failed: ${command}\n${e.message}`);
    }
    return false;
  }
}

// 获取平台特定的构建命令
function getBuildCommand(target) {
  const baseCommand = 'npx electron-builder --config .electron-builder.config.js';
  
  switch (target) {
    case 'win':
    case 'windows':
      return `${baseCommand} --win`;
    case 'mac':
    case 'macos':
    case 'darwin':
      return `${baseCommand} --mac`;
    case 'linux':
      return `${baseCommand} --linux`;
    case 'all':
      return `${baseCommand} --win --mac --linux`;
    default:
      return baseCommand;
  }
}

// 检查前置条件
function checkPrerequisites() {
  logSection('Checking Prerequisites');
  
  // 检查 Node.js
  const nodeVersion = process.version;
  log(`Node.js version: ${nodeVersion}`, 'dim');
  
  // 检查前端依赖是否已安装
  const frontendNodeModules = path.join('frontend', 'node_modules');
  if (!fs.existsSync(frontendNodeModules)) {
    log('Frontend dependencies not found. Installing...', 'yellow');
    exec('cd frontend && npm install');
  }
  
  // 检查根目录依赖是否已安装
  const rootNodeModules = path.join('node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    log('Root dependencies not found. Installing...', 'yellow');
    exec('npm install');
  }
  
  success('Prerequisites check passed');
}

// 构建前端
function buildFrontend() {
  logSection('Building Frontend');
  
  // 清理之前的构建
  const distPath = path.join('frontend', 'dist');
  if (fs.existsSync(distPath)) {
    log('Cleaning previous frontend build...', 'dim');
    fs.rmSync(distPath, { recursive: true, force: true });
  }
  
  // 构建前端
  exec('cd frontend && npm run build');
  
  if (!fs.existsSync(distPath)) {
    error('Frontend build failed: dist folder not found');
  }
  
  success('Frontend built successfully');
}

// 构建后端
function buildBackend() {
  logSection('Building Node.js Backend');

  const backendPath = path.join('backend');
  if (!fs.existsSync(backendPath)) {
    error('Backend directory not found. Please ensure backend/ exists.');
  }

  // 检查后端依赖是否已安装
  const backendNodeModules = path.join('backend', 'node_modules');
  if (!fs.existsSync(backendNodeModules)) {
    log('Backend dependencies not found. Installing...', 'yellow');
    exec('cd backend && npm install');
  }

  // 清理之前的构建
  const distBackendPath = path.join('backend', 'dist');
  if (fs.existsSync(distBackendPath)) {
    log('Cleaning previous backend build...', 'dim');
    fs.rmSync(distBackendPath, { recursive: true, force: true });
  }

  // 编译 TypeScript
  log('Compiling TypeScript backend...');
  exec('cd backend && npm run build');

  // 验证构建输出
  const serverJsPath = path.join(distBackendPath, 'api', 'server.js');
  if (!fs.existsSync(serverJsPath)) {
    error(`Backend build failed: server.js not found in ${distBackendPath}`);
  }

  success('Node.js backend built successfully');
  return true;
}

// 释放端口（跨平台）— 修复版本
function killPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    log(`Invalid port: ${port}`, 'red');
    return;
  }
  try {
    if (process.platform === 'win32') {
      // Windows：使用 netstat 查找 PID 并使用 taskkill 终止
      const { spawnSync } = require('child_process');
      const netstatResult = spawnSync('netstat', ['-ano'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const findstrResult = spawnSync('findstr', [`:${port}`], { encoding: 'utf8', input: netstatResult.stdout, stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = (findstrResult.stdout || '').trim().split('\n');
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        // 修复：更准确的 PID 提取 - 匹配 LISTENING 后的数字
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          const pid = match[1];
          try {
            spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
            log(`Released port ${port} (PID: ${pid})`, 'green');
          } catch (e) {
            log(`Failed to kill process ${pid}`, 'yellow');
          }
        }
      }
    } else {
      // macOS/Linux: use lsof to find and kill processes
      const { spawnSync } = require('child_process');
      try {
        const lsofResult = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const pids = (lsofResult.stdout || '').trim().split('\n');
        for (const pid of pids) {
          if (pid) {
            spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
            log(`Released port ${port} (PID: ${pid})`, 'green');
          }
        }
      } catch (e) {
        // 端口未在使用，忽略
      }
    }
  } catch (e) {
    // 端口未在使用或出错，忽略
  }
}

// 开发模式
function devMode() {
  logSection('Starting Development Mode');
  
  // 修复：检查 wait-on 模块是否存在
  let waitOn;
  try {
    waitOn = require('wait-on');
  } catch (e) {
    log('wait-on module not found. Installing...', 'yellow');
    exec('npm install wait-on --save-dev');
    waitOn = require('wait-on');
  }

  // 启动前释放端口
  log('Checking port usage...');
  killPort(8000);
  killPort(5173);
  
  // 等待端口完全释放
  log('Waiting for ports to be released...', 'dim');
  // 修复：使用 Node.js 的同步等待
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  
  // 启动前端
  log('Starting frontend...');
  const frontend = spawn('npm', ['run', 'dev:frontend'], {
    cwd: path.join(process.cwd(), 'frontend'),
    stdio: 'inherit'
  });
  
  // 启动后端
  log('Starting backend...');
  const backend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(process.cwd(), 'backend'),
    stdio: 'inherit',
    env: process.env
  });
  
  // 处理后端错误
  backend.on('error', (err) => {
    log(`Backend failed to start: ${err.message}`, 'red');
    frontend.kill();
    process.exit(1);
  });
  
  // 等待两个服务就绪
  log('Waiting for services to be ready...');
  waitOn({
    resources: ['http://localhost:5173', 'http://localhost:8000/api/health'],
    timeout: 60000,
    interval: 1000
  }, (err) => {
    if (err) {
      log('Services failed to start in time', 'red');
      frontend.kill();
      backend.kill();
      process.exit(1);
    }
    
    log('Services ready, starting Electron...');
    
    // 更可靠的 Electron 路径查找
    let electronPath;
    try {
      const electronModulePath = require.resolve('electron');
      // 尝试多种可能的路径
      const possiblePaths = [
        path.join(path.dirname(electronModulePath), '..', 'dist', 'electron.exe'),
        path.join(path.dirname(electronModulePath), '..', 'dist', 'electron'),
        path.join(path.dirname(electronModulePath), '..', '..', '.bin', 'electron.cmd'),
        path.join(path.dirname(electronModulePath), 'cli.js'),
      ];
      
      electronPath = possiblePaths.find(p => fs.existsSync(p));
      
      if (!electronPath) {
        // 回退到使用 npx electron
        electronPath = 'electron';
      }
    } catch (e) {
      electronPath = 'electron';
    }

    const electronEnv = { ...process.env };
    delete electronEnv.ELECTRON_RUN_AS_NODE;

    const electron = spawn(electronPath, ['.'], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: electronEnv
    });
    
    // 处理清理
    process.on('SIGINT', () => {
      electron.kill();
      frontend.kill();
      backend.kill();
      process.exit(0);
    });
    
    electron.on('close', () => {
      frontend.kill();
      backend.kill();
      process.exit(0);
    });
  });
}

// 构建 Electron 应用
function buildElectron(target) {
  logSection(`Building Electron App (${target || 'current platform'})`);

  const command = getBuildCommand(target);

  log(`Running: ${command}`, 'dim');
  exec(command);
  
  // 手动复制 frontend/dist 目录到正确的位置
  const distPath = path.join('dist-electron', 'win-unpacked', 'resources', 'app', 'frontend', 'dist');
  const srcPath = path.join('frontend', 'dist');
  
  if (fs.existsSync(srcPath)) {
    log(`Copying frontend/dist to ${distPath}...`, 'dim');
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    fs.cpSync(srcPath, distPath, { recursive: true });
    log('Frontend dist copied successfully', 'green');
  }
  
  success(`Electron app built successfully!`);
  log(`Output location: ${path.join('dist-electron')}`, 'dim');
}

// 构建前同步版本
function syncVersion() {
  log('Syncing version...', 'dim');
  const syncScript = path.join(__dirname, 'sync-version.js');
  if (fs.existsSync(syncScript)) {
    try {
      execSync('node "' + syncScript + '"', { stdio: 'inherit', shell: true });
    } catch (e) {
      log('Version sync failed, continuing build...', 'yellow');
    }
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';
  
  log('', 'reset');
  log('╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║        Papyrus Desktop Electron Build Script           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');
  
  switch (command) {
    case 'dev':
      checkPrerequisites();
      syncVersion();
      devMode();
      break;

    case 'build':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron();
      break;

    case 'build:win':
    case 'build:windows':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('win');
      break;

    case 'build:mac':
    case 'build:macos':
    case 'build:darwin':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('mac');
      break;

    case 'build:linux':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('linux');
      break;

    case 'build:all':
      checkPrerequisites();
      syncVersion();
      buildFrontend();
      buildBackend();
      buildElectron('all');
      break;
      
    case 'help':
    case '-h':
    case '--help':
      console.log(`
Usage: node scripts/build-electron.js [command]

Commands:
  dev                    Start development mode
  build                  Build for current platform
  build:win              Build for Windows (x64)
  build:mac              Build for macOS (arm64, x64)
  build:linux            Build for Linux (x64)
  build:all              Build for all platforms
  help                   Show this help message

Examples:
  node scripts/build-electron.js dev
  node scripts/build-electron.js build:win
      `);
      break;
      
    default:
      error(`Unknown command: ${command}\nRun 'node scripts/build-electron.js help' for usage information.`);
  }
}

// 运行主函数
main();
