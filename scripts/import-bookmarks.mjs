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

const TOKEN = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<DL\s*\/?>|<\/DL>/gi

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .trim()
}

function readAttr(attrs, name) {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  return match ? decodeEntities(match[1]) : ''
}

const createNode = (name, toolbar = false) => ({ name, toolbar, links: [], folders: [] })

const rootNode = createNode('书签栏')
let current = rootNode
const stack = []
let pendingFolder = null
let anchorCount = 0

const html = readFileSync(inputPath, 'utf8')
let token
while ((token = TOKEN.exec(html)) !== null) {
  const [text] = token
  if (token[1] !== undefined) {
    // 文件夹标题：先记住，等紧随其后的 <DL> 真正进入
    const toolbar = /PERSONAL_TOOLBAR_FOLDER\s*=\s*"true"/i.test(token[1])
    pendingFolder = createNode(decodeEntities(token[2]), toolbar)
  } else if (token[3] !== undefined) {
    const href = readAttr(token[3], 'HREF')
    const linkText = decodeEntities(token[4])
    if (href) {
      current.links.push({ icon: keepIcons ? readAttr(token[3], 'ICON') : '', href, text: linkText || href })
      anchorCount += 1
    }
  } else if (text.startsWith('<DL')) {
    if (pendingFolder) {
      current.folders.push(pendingFolder)
      stack.push(current)
      current = pendingFolder
      pendingFolder = null
    } else {
      // 顶层（书签栏）自己的 <DL>，或跟在链接后的嵌套结构：只为配对而压栈
      stack.push(null)
    }
  } else if (text.startsWith('</DL')) {
    const parent = stack.pop()
    if (parent) current = parent
  }
}

if (anchorCount === 0) fail(`✗ 没有从 ${rel(inputPath)} 里解析出任何书签，格式可能不是 Chrome 导出文件`)

// ---------------------------------------------------------------- 转成分组

const DEFAULT_GROUP_ID = 'default'
const DEFAULT_GROUP_TITLE = '常用'

/** 书签栏节点：带 PERSONAL_TOOLBAR_FOLDER 的顶层文件夹，退化为「名字与根同名」或第一个顶层文件夹 */
const toolbarNode =
  rootNode.folders.find((folder) => folder.toolbar) ??
  rootNode.folders.find((folder) => folder.name === rootNode.name) ??
  rootNode.folders[0] ??
  null

const groups = {}

function addGroup(id, title, links) {
  const existing = groups[id]
  if (!existing) {
    groups[id] = { title, links: [...links] }
    return
  }
  const known = new Set(existing.links.map((link) => link.href))
  for (const link of links) {
    if (!known.has(link.href)) existing.links.push(link)
  }
}

// 书签栏的直接链接 + 顶层游离链接，统一放到「常用」
const commonLinks = [...(toolbarNode?.links ?? []), ...rootNode.links]
if (commonLinks.length > 0) addGroup(DEFAULT_GROUP_ID, DEFAULT_GROUP_TITLE, commonLinks)

const visited = new Set()
function walk(folder, titles) {
  if (folder.links.length > 0) addGroup(titles.join('/'), titles.join(' / '), folder.links)
  for (const child of folder.folders) walk(child, [...titles, child.name])
}

for (const folder of toolbarNode?.folders ?? []) {
  visited.add(folder)
  walk(folder, [folder.name])
}
for (const folder of rootNode.folders) {
  if (visited.has(folder) || folder === toolbarNode) continue
  walk(folder, [folder.name])
}

const groupCount = Object.keys(groups).length
const linkCount = Object.values(groups).reduce((total, group) => total + group.links.length, 0)

if (groupCount === 0) fail('✗ 解析结果里没有分组，已放弃写入')

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
    '    primaryColor: "", // 留空表示使用 antd 默认主色',
    `    linkFontSize: ${DEFAULT_SETTINGS.linkFontSize}, // 链接文字字号 12~20`,
    `    linkCardGap: ${DEFAULT_SETTINGS.linkCardGap}, // 卡片之间 / 列表行之间的间距 4~48`,
    '    themeMode: "system", // system | light | dark',
    '    viewMode: "card", // card | list',
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
