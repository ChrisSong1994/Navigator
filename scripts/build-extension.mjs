#!/usr/bin/env node
/**
 * 生成 Chrome / Edge 可加载的 MV3 目录（dist-extension/）。
 *
 * Vite 的 GitHub Pages 构建会设置 VITE_BASE_PATH=/<repo>/；扩展页面必须使用 `/`
 * 或相对路径，因此这里显式清空基础路径，避免把扩展资源指向不存在的子目录。
 * VITE_EXTENSION=1 让 vite.config.ts 多带上 popup.html 这个入口（扩展图标的弹窗），
 * 网页版构建不带它。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist-extension')

execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-extension', '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_PATH: '/', VITE_EXTENSION: '1' },
})

for (const file of ['manifest.json', 'service_worker.js']) {
  cpSync(resolve(root, 'public', file), resolve(dist, file))
}

const manifestPath = resolve(dist, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.chrome_url_overrides?.newtab !== 'index.html') {
  throw new Error('扩展构建失败：manifest 没有正确覆盖新标签页')
}
if (manifest.action?.default_popup !== 'popup.html') {
  throw new Error('扩展构建失败：manifest 没有把 popup.html 挂到扩展图标上')
}

// 两个页面入口（新标签页 + 扩展弹窗）都不许有内联脚本：MV3 的 CSP 会直接拦掉
for (const file of ['index.html', 'popup.html']) {
  const html = readFileSync(resolve(dist, file), 'utf8')
  if (!html.includes('/assets/')) {
    throw new Error(`扩展构建失败：${file} 没有引用构建资源`)
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    throw new Error(`扩展构建失败：${file} 含内联脚本，会触发 MV3 CSP`)
  }
}

for (const file of ['theme-init.js', 'service_worker.js']) {
  readFileSync(resolve(dist, file), 'utf8')
}

console.log('扩展构建完成：请在 chrome://extensions 开启开发者模式，选择“加载已解压的扩展程序”并指向 dist-extension/')
