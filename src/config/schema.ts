/**
 * 导航精灵配置结构定义 + 校验/规范化。
 *
 * 该文件同时被 Node 脚本（scripts/*.mjs，Node 原生类型擦除直接运行 .ts）与浏览器运行时引用，
 * 所以这里只放纯逻辑：不引用 localStorage / DOM / JSON 文件。
 *
 * 配置文件（global_original.json5 / src/global_runtime.json / localStorage）三者结构完全一致：
 *
 *   { settings: {...}, groups: { [分组id]: { title, links: [{ icon, href, text }] } } }
 */

export type ThemeMode = 'system' | 'light' | 'dark'
export type ViewMode = 'card' | 'list'
export type SearchEngine = 'google' | 'baidu' | 'bing'
export type WallpaperMode = 'none' | 'bing' | 'rotation' | 'url'

export interface NavLink {
  /** base64 data URL 或图片地址，空串表示使用首字母色块兜底 */
  icon: string
  href: string
  text: string
}

export interface NavGroup {
  title: string
  links: NavLink[]
}

export interface NavSettings {
  siteTitle: string
  /** 站点 logo：base64 data URL 或图片地址，空串表示不显示 */
  siteLogo: string
  /** 空串表示使用内置默认主色 */
  primaryColor: string
  linkFontSize: number
  linkCardGap: number
  themeMode: ThemeMode
  viewMode: ViewMode
  /** 新标签页主搜索框使用的搜索引擎 */
  searchEngine: SearchEngine
  /** 搜索结果 / 直接输入的网址是否在新窗口打开 */
  searchOpenInNewTab: boolean
  /** 导航分组里的链接是否在新窗口打开 */
  linkOpenInNewTab: boolean
  /** 壁纸模式：关闭 / Bing 单张 / Bing 自动轮播 / 自定义地址 */
  wallpaperMode: WallpaperMode
  /** 当前生效的图片直链；Bing 轮播和选择模式都会落成这个字段 */
  wallpaperUrl: string
  /** 自动轮播间隔（分钟） */
  wallpaperInterval: number
  /** 壁纸压暗程度 0~80，保证前景文字可读 */
  wallpaperDim: number
  /** 壁纸模糊半径 0~20 */
  wallpaperBlur: number
}

export interface NavConfig {
  settings: NavSettings
  groups: Record<string, NavGroup>
}

export const LINK_FONT_SIZE_RANGE: readonly [number, number] = [12, 20]
export const LINK_CARD_GAP_RANGE: readonly [number, number] = [4, 48]
export const WALLPAPER_INTERVAL_RANGE: readonly [number, number] = [5, 1440]
export const WALLPAPER_DIM_RANGE: readonly [number, number] = [0, 80]
export const WALLPAPER_BLUR_RANGE: readonly [number, number] = [0, 20]
export const WALLPAPER_URL_MAX_LENGTH = 2048
export const DEFAULT_PRIMARY_COLOR = '#2f54eb'
export const DEFAULT_WALLPAPER_INTERVAL = 60

export const DEFAULT_SETTINGS: NavSettings = {
  siteTitle: '导航精灵',
  siteLogo: '',
  primaryColor: '',
  linkFontSize: 14,
  linkCardGap: 16,
  themeMode: 'system',
  viewMode: 'card',
  searchEngine: 'google',
  searchOpenInNewTab: true,
  linkOpenInNewTab: true,
  wallpaperMode: 'none',
  wallpaperUrl: '',
  wallpaperInterval: DEFAULT_WALLPAPER_INTERVAL,
  wallpaperDim: 30,
  wallpaperBlur: 0,
}

export const DEFAULT_CONFIG: NavConfig = {
  settings: { ...DEFAULT_SETTINGS },
  groups: {},
}

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark']
const VIEW_MODES: readonly ViewMode[] = ['card', 'list']
const SEARCH_ENGINES: readonly SearchEngine[] = ['google', 'baidu', 'bing']
const WALLPAPER_MODES: readonly WallpaperMode[] = ['none', 'bing', 'rotation', 'url']

export interface ValidationIssue {
  /** 出问题的配置路径，例如 groups.学习.links[3].href */
  path: string
  message: string
  level: 'error' | 'warn'
}

export interface ParseResult {
  /** 校验通过时的规范化配置；存在 error 时为 null */
  config: NavConfig | null
  issues: ValidationIssue[]
  errors: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验并规范化配置：补齐缺省项、剔除未知字段、记录类型错误。
 * 返回的 config 恒为完整结构（缺失的可选字段用默认值填充）。
 */
export function parseConfig(input: unknown): ParseResult {
  const issues: ValidationIssue[] = []
  const error = (path: string, message: string) => issues.push({ path, message, level: 'error' })
  const warn = (path: string, message: string) => issues.push({ path, message, level: 'warn' })

  const settings: NavSettings = { ...DEFAULT_SETTINGS }
  const groups: Record<string, NavGroup> = {}

  if (!isPlainObject(input)) {
    error('', '配置必须是一个对象，例如 { settings: {...}, groups: {...} }')
    return { config: null, issues, errors: issues.filter((i) => i.level === 'error').map(describeIssue) }
  }

  for (const key of Object.keys(input)) {
    if (key !== 'settings' && key !== 'groups') warn(key, `未知的顶层字段 "${key}"，已忽略`)
  }

  // ---------- settings ----------
  if (input.settings !== undefined) {
    if (!isPlainObject(input.settings)) {
      error('settings', 'settings 必须是对象')
    } else {
      const raw = input.settings
      for (const key of Object.keys(raw)) {
        if (!(key in DEFAULT_SETTINGS)) warn(`settings.${key}`, `未知的配置项 "settings.${key}"，已忽略`)
      }
      if (raw.siteTitle !== undefined) {
        if (typeof raw.siteTitle !== 'string') error('settings.siteTitle', 'siteTitle 必须是字符串')
        else settings.siteTitle = raw.siteTitle.trim() || DEFAULT_SETTINGS.siteTitle
      }
      if (raw.siteLogo !== undefined) {
        if (typeof raw.siteLogo !== 'string') error('settings.siteLogo', 'siteLogo 必须是字符串（base64 data URL 或图片地址）')
        else settings.siteLogo = raw.siteLogo.trim()
      }
      if (raw.primaryColor !== undefined) {
        if (typeof raw.primaryColor !== 'string') error('settings.primaryColor', `primaryColor 必须是字符串，留空表示使用默认主色 ${DEFAULT_PRIMARY_COLOR}`)
        else settings.primaryColor = raw.primaryColor.trim()
      }
      if (raw.linkFontSize !== undefined) {
        const value = readRange(raw.linkFontSize, 'settings.linkFontSize', LINK_FONT_SIZE_RANGE, error)
        if (value !== null) settings.linkFontSize = value
      }
      if (raw.linkCardGap !== undefined) {
        const value = readRange(raw.linkCardGap, 'settings.linkCardGap', LINK_CARD_GAP_RANGE, error)
        if (value !== null) settings.linkCardGap = value
      }
      if (raw.themeMode !== undefined) {
        if (typeof raw.themeMode !== 'string' || !THEME_MODES.includes(raw.themeMode as ThemeMode)) {
          error('settings.themeMode', `themeMode 只能是 ${THEME_MODES.join(' / ')}`)
        } else {
          settings.themeMode = raw.themeMode as ThemeMode
        }
      }
      if (raw.viewMode !== undefined) {
        if (typeof raw.viewMode !== 'string' || !VIEW_MODES.includes(raw.viewMode as ViewMode)) {
          error('settings.viewMode', `viewMode 只能是 ${VIEW_MODES.join(' / ')}`)
        } else {
          settings.viewMode = raw.viewMode as ViewMode
        }
      }
      if (raw.searchEngine !== undefined) {
        if (typeof raw.searchEngine !== 'string' || !SEARCH_ENGINES.includes(raw.searchEngine as SearchEngine)) {
          error('settings.searchEngine', `searchEngine 只能是 ${SEARCH_ENGINES.join(' / ')}`)
        } else {
          settings.searchEngine = raw.searchEngine as SearchEngine
        }
      }
      if (raw.searchOpenInNewTab !== undefined) {
        if (typeof raw.searchOpenInNewTab !== 'boolean') {
          error('settings.searchOpenInNewTab', 'searchOpenInNewTab 必须是布尔值')
        } else {
          settings.searchOpenInNewTab = raw.searchOpenInNewTab
        }
      }
      if (raw.linkOpenInNewTab !== undefined) {
        if (typeof raw.linkOpenInNewTab !== 'boolean') {
          error('settings.linkOpenInNewTab', 'linkOpenInNewTab 必须是布尔值')
        } else {
          settings.linkOpenInNewTab = raw.linkOpenInNewTab
        }
      }
      if (raw.wallpaperMode !== undefined) {
        if (typeof raw.wallpaperMode !== 'string' || !WALLPAPER_MODES.includes(raw.wallpaperMode as WallpaperMode)) {
          error('settings.wallpaperMode', `wallpaperMode 只能是 ${WALLPAPER_MODES.join(' / ')}`)
        } else {
          settings.wallpaperMode = raw.wallpaperMode as WallpaperMode
        }
      }
      if (raw.wallpaperUrl !== undefined) {
        if (typeof raw.wallpaperUrl !== 'string') {
          error('settings.wallpaperUrl', 'wallpaperUrl 必须是图片地址字符串')
        } else {
          const url = raw.wallpaperUrl.trim()
          if (url.length > WALLPAPER_URL_MAX_LENGTH) {
            error('settings.wallpaperUrl', `wallpaperUrl 不能超过 ${WALLPAPER_URL_MAX_LENGTH} 个字符`)
          } else if (url && !isAllowedWallpaperUrl(url)) {
            error('settings.wallpaperUrl', 'wallpaperUrl 必须是 https / http 图片地址或 Bing 返回的 /th?... 地址')
          } else {
            settings.wallpaperUrl = url
          }
        }
      }
      if (raw.wallpaperInterval !== undefined) {
        const value = readRange(raw.wallpaperInterval, 'settings.wallpaperInterval', WALLPAPER_INTERVAL_RANGE, error)
        if (value !== null) settings.wallpaperInterval = value
      }
      if (raw.wallpaperDim !== undefined) {
        const value = readRange(raw.wallpaperDim, 'settings.wallpaperDim', WALLPAPER_DIM_RANGE, error)
        if (value !== null) settings.wallpaperDim = value
      }
      if (raw.wallpaperBlur !== undefined) {
        const value = readRange(raw.wallpaperBlur, 'settings.wallpaperBlur', WALLPAPER_BLUR_RANGE, error)
        if (value !== null) settings.wallpaperBlur = value
      }
    }
  }

  // ---------- groups ----------
  if (input.groups !== undefined) {
    if (!isPlainObject(input.groups)) {
      error('groups', 'groups 必须是对象映射，形如 { 分组id: { title, links: [...] } }')
    } else {
      for (const [groupId, rawGroup] of Object.entries(input.groups)) {
        const gPath = `groups.${groupId}`
        if (!groupId.trim()) {
          error('groups', '分组 id 不能为空字符串')
          continue
        }
        if (!isPlainObject(rawGroup)) {
          error(gPath, '分组必须是对象，形如 { title, links: [...] }')
          continue
        }
        for (const key of Object.keys(rawGroup)) {
          if (key !== 'title' && key !== 'links') warn(`${gPath}.${key}`, `未知的分组字段 "${key}"，已忽略`)
        }
        let title = groupId
        if (rawGroup.title === undefined) {
          warn(`${gPath}.title`, `分组缺少 title，已用 id "${groupId}" 代替`)
        } else if (typeof rawGroup.title !== 'string' || !rawGroup.title.trim()) {
          error(`${gPath}.title`, 'title 必须是非空字符串')
        } else {
          title = rawGroup.title.trim()
        }

        const links: NavLink[] = []
        const seenHref = new Set<string>()
        if (rawGroup.links === undefined) {
          error(`${gPath}.links`, '缺少 links 数组（没有链接可以写成 links: []）')
        } else if (!Array.isArray(rawGroup.links)) {
          error(`${gPath}.links`, 'links 必须是数组')
        } else {
          rawGroup.links.forEach((rawLink, index) => {
            const lPath = `${gPath}.links[${index}]`
            if (!isPlainObject(rawLink)) {
              error(lPath, '链接必须是对象，形如 { icon, href, text }')
              return
            }
            for (const key of Object.keys(rawLink)) {
              if (key !== 'icon' && key !== 'href' && key !== 'text') warn(`${lPath}.${key}`, `未知的链接字段 "${key}"，已忽略`)
            }
            if (typeof rawLink.href !== 'string' || !rawLink.href.trim()) {
              error(`${lPath}.href`, 'href 必须是非空字符串')
              return
            }
            const href = rawLink.href.trim()
            if (!/^(https?:)?\/\//i.test(href) && !href.startsWith('/') && !href.startsWith('./')) {
              warn(`${lPath}.href`, `"${href}" 不是常见的 http(s) 链接，请确认`)
            }
            if (typeof rawLink.text !== 'string' || !rawLink.text.trim()) {
              error(`${lPath}.text`, 'text 必须是非空字符串')
              return
            }
            let icon = ''
            if (rawLink.icon !== undefined) {
              if (typeof rawLink.icon !== 'string') {
                error(`${lPath}.icon`, 'icon 必须是字符串（base64 data URL 或图片地址），留空表示用首字母兜底')
                return
              }
              icon = rawLink.icon.trim()
            }
            if (seenHref.has(href)) warn(`${lPath}.href`, `分组内重复的链接 "${href}"`)
            seenHref.add(href)
            links.push({ icon, href, text: rawLink.text.trim() })
          })
          if (links.length === 0) warn(`${gPath}.links`, '分组内没有任何链接，页面上不会显示')
        }
        groups[groupId] = { title, links }
      }
      if (Object.keys(groups).length === 0) warn('groups', '配置里没有任何分组')
    }
  } else {
    warn('groups', '配置缺少 groups，页面将没有内容')
  }

  const errors = issues.filter((i) => i.level === 'error').map(describeIssue)
  return { config: errors.length ? null : { settings, groups }, issues, errors }
}

function readRange(value: unknown, path: string, [min, max]: readonly [number, number], error: (path: string, message: string) => void): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    error(path, `${path.split('.').pop()} 必须是数字`)
    return null
  }
  if (value < min || value > max) {
    error(path, `${path.split('.').pop()} 需要落在 ${min} ~ ${max} 之间，当前为 ${value}`)
    return null
  }
  return Math.round(value)
}

/** 配置只接受可直接放进 <img src> 的地址；Bing API 返回的相对地址在客户端会归一化为完整 https 地址 */
export function isAllowedWallpaperUrl(value: string): boolean {
  if (value.startsWith('/')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** 把配置里的 Bing 相对地址补成可跨页面加载的绝对地址 */
export function resolveWallpaperUrl(value: string): string {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) return value
  if (value.startsWith('/')) return `https://www.bing.com${value}`
  return value
}

export function describeIssue(issue: ValidationIssue): string {
  const label = issue.level === 'error' ? '错误' : '警告'
  return issue.path ? `[${label}] ${issue.path}: ${issue.message}` : `[${label}] ${issue.message}`
}

/** 按固定字段顺序序列化，保证同一份语义的配置有稳定的字符串形态（用于 diff 与 hash） */
export function serializeConfig(config: NavConfig, space = 2): string {
  return JSON.stringify(toCanonical(config), null, space)
}

function toCanonical(config: NavConfig) {
  const groups: Record<string, unknown> = {}
  for (const [id, group] of Object.entries(config.groups)) {
    groups[id] = {
      title: group.title,
      links: group.links.map((link) => ({ icon: link.icon, href: link.href, text: link.text })),
    }
  }
  return {
    settings: {
      siteTitle: config.settings.siteTitle,
      siteLogo: config.settings.siteLogo,
      primaryColor: config.settings.primaryColor,
      linkFontSize: config.settings.linkFontSize,
      linkCardGap: config.settings.linkCardGap,
      themeMode: config.settings.themeMode,
      viewMode: config.settings.viewMode,
      searchEngine: config.settings.searchEngine,
      searchOpenInNewTab: config.settings.searchOpenInNewTab,
      linkOpenInNewTab: config.settings.linkOpenInNewTab,
      wallpaperMode: config.settings.wallpaperMode,
      wallpaperUrl: config.settings.wallpaperUrl,
      wallpaperInterval: config.settings.wallpaperInterval,
      wallpaperDim: config.settings.wallpaperDim,
      wallpaperBlur: config.settings.wallpaperBlur,
    },
    groups,
  }
}
