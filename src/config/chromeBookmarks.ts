/**
 * 与 chrome.bookmarks API 的手动双向同步。
 *
 * 仅扩展环境可用：
 *   - pullChromeBookmarks 读取书签栏，转成导航分组；
 *   - pushChromeBookmarks 把当前分组写入书签栏下的「导航精灵」文件夹，且只重建这个文件夹。
 *
 * 推送会在「导航精灵」文件夹里保存一份可被 Chrome 原生管理的副本；拉取时如果这个文件夹存在，
 * 就只读取它，避免把用户自己的其他书签混进导航配置。
 */
import { DEFAULT_GROUP_ID, DEFAULT_GROUP_TITLE, groupStats } from './bookmarks.ts'
import type { BookmarkParseResult } from './bookmarks.ts'
import type { NavGroup, NavLink } from './schema.ts'

export const CHROME_BOOKMARK_FOLDER = '导航精灵'

export interface ChromeBookmarkPushResult {
  folders: number
  links: number
  /** 因不是可直接写入书签的绝对 http(s) 链接而跳过的条数 */
  skipped: number
}

export function chromeBookmarksAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.bookmarks?.getTree)
}

function toolbarOf(root: chrome.bookmarks.BookmarkTreeNode | undefined): chrome.bookmarks.BookmarkTreeNode | undefined {
  const roots = root?.children ?? []
  return roots.find((node) => node.folderType === 'bookmarks-bar') ?? roots[0]
}

function nodeLinks(children: chrome.bookmarks.BookmarkTreeNode[] | undefined): NavLink[] {
  return (children ?? [])
    .filter((node) => Boolean(node.url))
    .map((node) => ({ icon: '', href: node.url ?? '', text: node.title || node.url || '' }))
}

function addGroup(groups: Record<string, NavGroup>, id: string, title: string, links: NavLink[]): void {
  const existing = groups[id]
  if (!existing) {
    groups[id] = { title, links: [...links] }
    return
  }

  const known = new Set(existing.links.map((link) => link.href))
  for (const link of links) {
    if (known.has(link.href)) continue
    known.add(link.href)
    existing.links.push(link)
  }
}

/**
 * 读取 Chrome 书签并转成与 HTML 导入一致的分组。
 *
 * - 存在「导航精灵」文件夹时，只读取该文件夹（往返同步不会被重复嵌套）；
 * - 不存在时读取书签栏：直属链接 → default / 常用，其他文件夹（含嵌套）→ 路径分组；
 * - 「其他书签」和「移动设备书签」不会参与拉取。
 */
export async function pullChromeBookmarks(): Promise<BookmarkParseResult> {
  if (!chromeBookmarksAvailable()) throw new Error('当前不是扩展环境，无法读取 Chrome 书签')

  const tree = await chrome.bookmarks.getTree()
  const toolbar = toolbarOf(tree[0])
  if (!toolbar) throw new Error('没有找到 Chrome 书签栏')

  const pluginFolder = (toolbar.children ?? []).find((node) => !node.url && node.title === CHROME_BOOKMARK_FOLDER)
  const source = pluginFolder ?? toolbar
  const groups: Record<string, NavGroup> = {}

  const directLinks = nodeLinks(source.children)
  if (directLinks.length > 0) addGroup(groups, DEFAULT_GROUP_ID, DEFAULT_GROUP_TITLE, directLinks)

  const walk = (folder: chrome.bookmarks.BookmarkTreeNode, titles: string[]) => {
    const links = nodeLinks(folder.children)
    if (links.length > 0) addGroup(groups, titles.join('/'), titles.join(' / '), links)
    for (const child of folder.children ?? []) {
      if (!child.url) walk(child, [...titles, child.title || '未命名'])
    }
  }

  for (const child of source.children ?? []) {
    if (!child.url) walk(child, [child.title || '未命名'])
  }

  if (Object.keys(groups).length === 0) throw new Error('Chrome 书签里没有可同步的链接')
  return { groups, stats: groupStats(groups) }
}

function isBookmarkUrl(href: string): boolean {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function folderPath(title: string): string[] {
  return title
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * 把导航分组推送 / 覆盖到 Chrome 书签栏下的「导航精灵」文件夹。
 *
 * 只重建这一个文件夹，其他书签完全不动。配置里的相对链接以及非 http(s) 链接无法可靠地写成
 * Chrome 书签，会在 result.skipped 中返回，而不是让整次推送中途失败。
 */
export async function pushChromeBookmarks(groups: Record<string, NavGroup>): Promise<ChromeBookmarkPushResult> {
  if (!chromeBookmarksAvailable()) throw new Error('当前不是扩展环境，无法写入 Chrome 书签')

  const tree = await chrome.bookmarks.getTree()
  const toolbar = toolbarOf(tree[0])
  if (!toolbar) throw new Error('没有找到 Chrome 书签栏')

  const entries = Object.entries(groups)
    .map(([id, group]) => ({ id, group, links: group.links.filter((link) => isBookmarkUrl(link.href)) }))
    .filter((entry) => entry.links.length > 0)
  const skipped = Object.values(groups).reduce((total, group) => total + group.links.length, 0) - entries.reduce((total, entry) => total + entry.links.length, 0)
  if (entries.length === 0) throw new Error('当前没有可写入 Chrome 书签的 http(s) 链接')

  const oldFolders = (await chrome.bookmarks.getChildren(toolbar.id)).filter((node) => !node.url && node.title === CHROME_BOOKMARK_FOLDER)
  for (const folder of oldFolders) await chrome.bookmarks.removeTree(folder.id)

  const container = await chrome.bookmarks.create({ parentId: toolbar.id, title: CHROME_BOOKMARK_FOLDER })
  const folderCache = new Map<string, string>()
  let folders = 0
  let links = 0

  const ensurePath = async (path: string[]): Promise<string> => {
    let parentId = container.id
    let cacheKey = ''

    for (const name of path) {
      cacheKey = cacheKey ? `${cacheKey}\u0000${name}` : name
      let folderId = folderCache.get(cacheKey)
      if (!folderId) {
        folderId = (await chrome.bookmarks.create({ parentId, title: name })).id
        folderCache.set(cacheKey, folderId)
        folders += 1
      }
      parentId = folderId
    }

    return parentId
  }

  for (const entry of entries) {
    const parentId = await ensurePath(entry.id === DEFAULT_GROUP_ID ? [] : folderPath(entry.group.title))
    for (const link of entry.links) {
      await chrome.bookmarks.create({
        parentId,
        title: link.text || link.href,
        url: link.href,
      })
      links += 1
    }
  }

  return { folders, links, skipped }
}
