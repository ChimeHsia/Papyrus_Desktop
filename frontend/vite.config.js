import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')
)
const appVersion = rootPkg.version ?? 'unknown'

// TS + React 19 + Arco 脚手架
export default defineConfig({
  base: './', // Electron 需要相对路径来加载本地文件
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react({
      // 如需保留 `import React from 'react'` 则使用 classic 运行时
      // jsxRuntime: 'classic',
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 把大的第三方库拆分成单独的 chunk，便于缓存
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react')) {
              return 'react-vendor';
            }
            if (id.includes('@arco-design')) {
              return 'arco-vendor';
            }
            return 'vendor';
          }
        }
      }
    },
    // 生产构建时不生成 source map，加快构建
    sourcemap: false,
  },
})
