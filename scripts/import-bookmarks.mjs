#!/usr/bin/env node
/**
 * pnpm import:bookmarks
 *
 * 把 Chrome 书签导出（书签栏 → HTML 文件）转换成导航精灵的源配置 global_original.json5。
 *
 *   pnpm import:bookmarks                      默认读 chrome_bookmarks_demo.html → 覆盖 global_original.json5
 *   pnpm import:bookmarks --no-icons           丢弃 base64 图标（配置体积会小很多，页面用首字母色块兜底）
 *   pnpm import:bookmarks --input a.html --output b.json5
 *   pnpm import:bookmarks --dry-run            只打印统计，不写文件
 *
 * 转换规则：
 *   - 书签栏（PERSONAL_TOOLBAR_FOLDER）里的直接链接 + 顶层游离链接 → 分组 id "default"（title 常用）
 *   - 每个子文件夹 → 分组 id 为相对书签栏的路径（如 "学习/刷题"），title 为 "学习 / 刷题"
 *   - 书签栏之外的顶层文件夹（如「其他书签」）→ 各自成为分组
 *   - 文件夹里没有直接链接（只有子文件夹）时不会生成空分组
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBookmarksHtml } from '../src/config/bookmarks.ts'
import { DEFAULT_SETTINGS } from '../src/config/schema.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const hasFlag = (flag) => argv.includes(flag)
const readArg = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const inputPath = resolve(root, readArg('--input', 'chrome_bookmarks_demo.html'))
const outputPath = resolve(root, readArg('--output', 'global_original.json5'))
const keepIcons = !hasFlag('--no-icons')
const dryRun = hasFlag('--dry-run')
const rel = (path) => relative(root, path)

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(inputPath)) fail(`✗ 找不到书签文件 ${rel(inputPath)}`)

// ---------------------------------------------------------------- 解析 HTML

// 解析逻辑与配置面板的上传共用同一份实现（src/config/bookmarks.ts），避免两边分叉
const html = readFileSync(inputPath, 'utf8')
let groups
let groupCount
let linkCount
try {
  const parsed = parseBookmarksHtml(html, { keepIcons })
  groups = parsed.groups
  groupCount = parsed.stats.groups
  linkCount = parsed.stats.links
} catch (error) {
  fail(`✗ ${rel(inputPath)} 解析失败：${error.message}`)
}

// ---------------------------------------------------------------- 生成 JSON5

const q = (value) => JSON.stringify(value)

function renderLink(link) {
  return `        { icon: ${q(link.icon)}, href: ${q(link.href)}, text: ${q(link.text)} },`
}

function render() {
  const lines = [
    '// 全局源配置信息',
    '// 由 `pnpm import:bookmarks` 从 Chrome 书签导出生成，可手工增删改；改完执行 `pnpm refresh` 同步到 src/global_runtime.json',
    '{',
    '  settings: {',
    `    siteTitle: ${q(DEFAULT_SETTINGS.siteTitle)},`,
    '    siteLogo: "", // 站点 logo，base64 data URL 或图片地址，留空则不显示',
    '    primaryColor: "", // 留空表示使用内置默认主色 #2f54eb',
    `    linkFontSize: ${DEFAULT_SETTINGS.linkFontSize}, // 链接文字字号 12~20`,
    `    linkCardGap: ${DEFAULT_SETTINGS.linkCardGap}, // 卡片之间 / 列表行之间的间距 4~48`,
    '    themeMode: "system", // system | light | dark',
    '    viewMode: "card", // card | list',
    '    searchEngine: "google", // google | baidu | bing',
    '    searchOpenInNewTab: true, // 搜索结果 / 直接输入的网址是否新开窗口',
    '    linkOpenInNewTab: true, // 点击导航链接是否新开窗口',
    '  },',
    '  groups: {',
  ]
  let firstGroup = true
  for (const [id, group] of Object.entries(groups)) {
    lines.push(`    ${q(id)}: {`)
    lines.push(`      title: ${q(group.title)},`)
    lines.push('      links: [')
    if (firstGroup) {
      lines.push('        // icon 为 base64 data URL 或图片地址，留空则用首字母色块兜底')
      firstGroup = false
    }
    for (const link of group.links) lines.push(renderLink(link))
    lines.push('      ],')
    lines.push('    },')
  }
  lines.push('  },')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

const output = render()
const sizeKb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1)
const summary = `解析出 ${linkCount} 条链接 / ${groupCount} 个分组${keepIcons ? '' : '（已丢弃图标）'} / ${sizeKb} KB`

if (dryRun) {
  console.log(`✓ ${summary}（--dry-run，未写入文件）`)
  process.exit(0)
}

writeFileSync(outputPath, output, 'utf8')
console.log(`✓ ${summary}\n  ${rel(inputPath)} → ${rel(outputPath)}，接着执行 pnpm refresh 生成运行时配置。`)
