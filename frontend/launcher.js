/**
 * Papyrus 启动器 — 同时启动后端和 Vite 前端
 */
import { spawn } from 'child_process';
import { createServer, createConnection } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5173;
const TIMEOUT_MS = 30000;

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

async function portInUse(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port, '127.0.0.1');
  });
}

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function poll() {
      const sock = createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`后端启动超时 (${timeoutMs / 1000}s)`));
        } else {
          setTimeout(poll, 300);
        }
      });
    }
    poll();
  });
}

const children = [];

function cleanup() {
  for (const child of children) child.kill();
}

async function main() {
  log(colors.cyan, 'Papyrus 启动器\n');

  const backendRunning = await portInUse(BACKEND_PORT);

  if (backendRunning) {
    log(colors.green, '检测到后端已在运行，直接启动前端...\n');
  } else {
    log(colors.yellow, '正在启动后端服务器...');
    const backend = spawn('npx', ['tsx', 'watch', 'src/api/server.ts'], {
      cwd: join(projectRoot, 'backend'),
      stdio: 'inherit',
      shell: true,
    });
    children.push(backend);

    backend.on('error', err => {
      log(colors.red, `启动后端失败: ${err.message}`);
      process.exit(1);
    });

    try {
      await waitForPort(BACKEND_PORT, TIMEOUT_MS);
      log(colors.green, `后端已启动: http://127.0.0.1:${BACKEND_PORT}\n`);
    } catch (err) {
      log(colors.red, err.message);
      backend.kill();
      process.exit(1);
    }
  }

  log(colors.yellow, '正在启动前端开发服务器...');
  const frontend = spawn('npx', ['vite', '--port', String(FRONTEND_PORT)], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: platform() === 'win32',
  });
  children.push(frontend);

  frontend.on('error', err => {
    log(colors.red, `启动前端失败: ${err.message}`);
    process.exit(1);
  });
}

// 退出时杀掉子进程，避免残留
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
// Windows 的 SIGINT 不会自动传播到子进程，额外用 exit 兜底
if (platform() === 'win32') process.on('exit', cleanup);

main();
