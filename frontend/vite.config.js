import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TS + React 19 + Arco scaffold - 优化打包体积
export default defineConfig({
  base: './', // Required for Electron to load files locally
  plugins: [
    react({
      // keep classic runtime if you still want `import React from 'react'`
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
    // 启用代码压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        // 删除 console 和 debugger
        drop_console: true,
        drop_debugger: true,
        // 更激进的压缩
        passes: 2,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      },
      mangle: {
        // 更激进的变量名混淆
        safari10: true,
      },
    },
    // 代码分割策略
    rollupOptions: {
      output: {
        // 手动代码分割
        manualChunks: {
          // React 核心库单独打包
          'react-vendor': ['react', 'react-dom'],
          // Arco Design 单独打包
          'arco-vendor': ['@arco-design/web-react'],
          // Markdown 处理
          'markdown-vendor': ['markdown-it'],
        },
        // 资源文件命名
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
        // 代码块命名
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
    // 减小 chunk 大小警告阈值
    chunkSizeWarningLimit: 500,
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 启用 source map（生产环境可关闭）
    sourcemap: false,
    // 清空输出目录
    emptyOutDir: true,
    // 资源内联阈值（小于 4KB 的资源内联为 base64）
    assetsInlineLimit: 4096,
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@arco-design/web-react',
      'markdown-it',
    ],
    exclude: [],
  },
})
