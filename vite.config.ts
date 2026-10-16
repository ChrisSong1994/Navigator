import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages 项目页部署在 https://<user>.github.io/<repo>/ 下，CI 通过 VITE_BASE_PATH 注入
const base = process.env.VITE_BASE_PATH || '/'

/** 开发 / 预览服务器端口；被占用时 Vite 仍会自动往后找一个可用端口 */
const PORT = 8899

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { port: PORT },
  preview: { port: PORT },
  resolve: {
    alias: {
      // reaflow 内联的 base64 ELK worker 在扩展页面会被 CSP（script-src 'self'）拦掉，
      // 换成主线程算布局的版本；详见 src/tools/Json/GraphView/lib/elkMainThread.ts
      'elkjs/lib/elk-api': fileURLToPath(
        new URL('./src/tools/Json/GraphView/lib/elkMainThread.ts', import.meta.url),
      ),
    },
  },
  build: {
    // 内置配置（含 base64 图标）本身就有 MB 级别，放宽提示阈值
    chunkSizeWarningLimit: 2048,
  },
})
