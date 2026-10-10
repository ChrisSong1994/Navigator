/**
 * Chrome 书签导出（HTML）与导航精灵分组之间的双向转换。
 *
 * 纯逻辑：不引用 DOM、也不引用 node 内建 —— 浏览器（配置面板上传 / 导出）与
 * scripts/import-bookmarks.mjs（裸 node 直接跑 .ts）共用这一份实现，
 * 避免两边各写一份解析器之后慢慢分叉。
 *
 * 转换规则（与 pnpm import:bookmarks 的约定一致）：
 *   - 书签栏（PERSONAL_TOOLBAR_FOLDER）里的直接链接 + 顶层游离链接 → 分组 id "default"（标题「常用」）
 *   - 每个子文件夹 → 分组 id 为相对书签栏的路径（如 "学习/刷题"），标题为 "学习 / 刷题"
 *   - 书签栏之外的顶层文件夹（如「其他书签」）→ 各自成为分组
 *   - 文件夹里没有直接链接（只有子文件夹）时不会生成空分组
 *
 * 导出就是上面规则的反向：标题按 " / " 拆成文件夹层级（与解析时 join(' / ') 对称），
 * id 为 "default" 的分组则写成书签栏的直属链接。
 */
import type { NavGroup, NavLink } from './schema.ts'

export interface BookmarkStats {
  groups: number
  links: number
  /** 带图标的链接条数（图标是 base64 data URL，体积大头） */
  icons: number
  /** 这份分组序列化成 JSON 后的字节数，用于提示会往 localStorage 写多少 */
  bytes: number
}

export interface BookmarkParseResult {
  groups: Record<string, NavGroup>
  stats: BookmarkStats
}

export const DEFAULT_GROUP_ID = 'default'
export const DEFAULT_GROUP_TITLE = '常用'

/** 统计一组分组：条数、带图标的条数、序列化成 JSON 后的字节数（用于上传预览显示体积） */
export function groupStats(groups: Record<string, NavGroup>): BookmarkStats {
  const links = Object.values(groups).flatMap((group) => group.links)
  return {
    groups: Object.keys(groups).length,
    links: links.length,
    icons: links.filter((link) => link.icon).length,
    bytes: new TextEncoder().encode(JSON.stringify(groups)).length,
  }
}

/** 解析不出书签时抛这个，调用方直接把 message 展示给用户 */
export class BookmarkParseError extends Error {}

interface BookmarkNode {
  name: string
  toolbar: boolean
  links: NavLink[]
  folders: BookmarkNode[]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .trim()
}

function readAttr(attrs: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  return match ? decodeEntities(match[1]) : ''
}

const createNode = (name: string, toolbar = false): BookmarkNode => ({ name, toolbar, links: [], folders: [] })

/** 把书签 HTML 解析成一棵文件夹树 + 顶层游离链接 */
function parseTree(html: string, keepIcons: boolean): { root: BookmarkNode; anchorCount: number } {
  // 正则写在函数里而不是模块级：带 g 标志的正则会记住 lastIndex，多次解析会互相干扰
  const tokenPattern = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<DL\s*\/?>|<\/DL>/gi

  const root = createNode('书签栏')
  let current = root
  const stack: (BookmarkNode | null)[] = []
  let pendingFolder: BookmarkNode | null = null
  let anchorCount = 0

  let token: RegExpExecArray | null
  while ((token = tokenPattern.exec(html)) !== null) {
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

  return { root, anchorCount }
}

/**
 * 解析 Chrome 书签导出 HTML。
 * 解析不出任何书签、或最终没有任何分组时抛 BookmarkParseError。
 */
export function parseBookmarksHtml(html: string, options: { keepIcons?: boolean } = {}): BookmarkParseResult {
  const keepIcons = options.keepIcons ?? true
  const { root, anchorCount } = parseTree(html, keepIcons)

  if (anchorCount === 0) {
    throw new BookmarkParseError('没有解析出任何书签，格式可能不是 Chrome 导出的书签文件')
  }

  const groups: Record<string, NavGroup> = {}
  const addGroup = (id: string, title: string, links: NavLink[]) => {
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

  /** 书签栏节点：带 PERSONAL_TOOLBAR_FOLDER 的顶层文件夹，退化为「名字与根同名」或第一个顶层文件夹 */
  const toolbarNode =
    root.folders.find((folder) => folder.toolbar) ??
    root.folders.find((folder) => folder.name === root.name) ??
    root.folders[0] ??
    null

  // 书签栏的直接链接 + 顶层游离链接，统一放到「常用」
  const commonLinks = [...(toolbarNode?.links ?? []), ...root.links]
  if (commonLinks.length > 0) addGroup(DEFAULT_GROUP_ID, DEFAULT_GROUP_TITLE, commonLinks)

  const visited = new Set<BookmarkNode>()
  const walk = (folder: BookmarkNode, titles: string[]) => {
    if (folder.links.length > 0) addGroup(titles.join('/'), titles.join(' / '), folder.links)
    for (const child of folder.folders) walk(child, [...titles, child.name])
  }

  for (const folder of toolbarNode?.folders ?? []) {
    visited.add(folder)
    walk(folder, [folder.name])
  }
  for (const folder of root.folders) {
    if (visited.has(folder) || folder === toolbarNode) continue
    walk(folder, [folder.name])
  }

  if (Object.keys(groups).length === 0) throw new BookmarkParseError('解析结果里没有分组，请确认文件是 Chrome 导出的书签')

  return { groups, stats: groupStats(groups) }
}

// ---------------------------------------------------------------- 导出成 Chrome 书签 HTML

export interface RenderBookmarksOptions {
  /** 书签栏文件夹名，默认「书签栏」 */
  toolbarName?: string
  /** <TITLE> / <H1> 用的文档标题，默认 Bookmarks（与 Chrome 自己导出的一致） */
  documentTitle?: string
}

interface BookmarkFolder {
  name: string
  /** 保持配置里的顺序：链接与子文件夹交错 */
  children: ({ link: NavLink } | { folder: BookmarkFolder })[]
}

/** 标题 → 文件夹层级；与解析时的 join(' / ') 对称 */
function folderPath(title: string): string[] {
  return title
    .split(' / ')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/** 沿路径下钻，缺哪层补哪层 */
function descend(root: BookmarkFolder, path: string[]): BookmarkFolder {
  let node = root
  for (const name of path) {
    const existing = node.children.find((child) => 'folder' in child && child.folder.name === name)
    if (existing && 'folder' in existing) {
      node = existing.folder
      continue
    }
    const folder: BookmarkFolder = { name, children: [] }
    node.children.push({ folder })
    node = folder
  }
  return node
}

/** 去掉没有任何内容的文件夹（对应解析时「空文件夹不生成分组」） */
function prune(folder: BookmarkFolder): void {
  folder.children = folder.children.filter((child) => {
    if (!('folder' in child)) return true
    prune(child.folder)
    return child.folder.children.length > 0
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const INDENT = '    '

/**
 * 把分组渲染成 Chrome 能导入的书签 HTML（NETSCAPE-Bookmark-file-1）。
 *
 * 版式对齐 chrome_bookmarks_demo.html：每层缩进 4 空格、`</DT>` 省略、`</DL><p>` 与自己的
 * `<DL><p>` 同缩进、没有图标的链接不写 ICON 属性。
 *
 * 不写 ADD_DATE / LAST_MODIFIED：配置里没有这两个时间，凭空写"现在"会让 Chrome 的书签
 * 「添加时间」全部变成导入时间，还不如交给 Chrome 自己按导入时刻处理。
 */
export function renderBookmarksHtml(groups: Record<string, NavGroup>, options: RenderBookmarksOptions = {}): string {
  const toolbarName = options.toolbarName ?? '书签栏'
  const documentTitle = options.documentTitle ?? 'Bookmarks'

  const toolbar: BookmarkFolder = { name: toolbarName, children: [] }
  for (const [id, group] of Object.entries(groups)) {
    // id 为 default 的那个分组就是书签栏直属链接（与解析约定对应）
    const target = descend(toolbar, id === DEFAULT_GROUP_ID ? [] : folderPath(group.title))
    for (const link of group.links) target.children.push({ link })
  }
  prune(toolbar)

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${escapeHtml(documentTitle)}</TITLE>`,
    `<H1>${escapeHtml(documentTitle)}</H1>`,
    '<DL><p>',
  ]

  const writeLink = (link: NavLink, level: number) => {
    const icon = link.icon ? ` ICON="${escapeHtml(link.icon)}"` : ''
    lines.push(`${INDENT.repeat(level)}<DT><A HREF="${escapeHtml(link.href)}"${icon}>${escapeHtml(link.text)}</A>`)
  }

  const writeFolder = (folder: BookmarkFolder, level: number) => {
    const toolbarFlag = folder === toolbar ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''
    lines.push(`${INDENT.repeat(level)}<DT><H3${toolbarFlag}>${escapeHtml(folder.name)}</H3>`)
    lines.push(`${INDENT.repeat(level)}<DL><p>`)
    for (const child of folder.children) {
      if ('link' in child) writeLink(child.link, level + 1)
      else writeFolder(child.folder, level + 1)
    }
    lines.push(`${INDENT.repeat(level)}</DL><p>`)
  }

  writeFolder(toolbar, 1)
  lines.push('</DL><p>')
  return `${lines.join('\n')}\n`
}
