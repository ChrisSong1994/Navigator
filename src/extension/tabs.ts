/**
 * 弹窗与标签页 / 扩展地址打交道的部分（Chrome API 只在这一层出现）。
 *
 * 导航精灵首页是 `index.html`，工具页是 `index.html?tool=json`，配置面板靠 `index.html?settings=1` ——
 * 弹窗点了这些入口都是用 chrome.tabs.create 开一个新的新标签页，不动用户当前正在看的页面。
 *
 * 读当前标签页只需要 manifest 里的 activeTab（点扩展图标即临时授权），不需要 "tabs"：
 * 没有授权时 chrome.tabs.query 仍然返回标签页，只是 url / title / favIconUrl 是 undefined，
 * 这时弹窗退回成手填地址的形态（普通网页里打开 popup.html 调样式时也是这样）。
 */

export interface ActivePage {
  /** 当前标签页地址；读不到时是空串 */
  url: string
  title: string
  /**
   * 可以直接写进配置的图标地址。
   * 只留 http(s) 的图标直链，以及很短的 data:image（页面内联 svg 图标时 Chrome 会给这种）；
   * 太长的 data URL 会把 chrome.storage.sync 的分片配额吃掉，不值得。
   */
  icon: string
}

const EMPTY_PAGE: ActivePage = { url: '', title: '', icon: '' }
const MAX_INLINE_ICON_LENGTH = 2048

function hasTabs(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.tabs?.query)
}

/** 本扩展的页面前缀（chrome-extension://<id>/）；不在扩展环境里返回空串 */
function extensionOrigin(): string {
  try {
    return chrome.runtime.getURL('')
  } catch {
    // chrome 或 chrome.runtime 不存在（普通网页里打开 popup.html）
    return ''
  }
}

/** 读当前窗口的活动标签页；没有扩展环境或没有 activeTab 授权时返回空 */
export async function readActivePage(): Promise<ActivePage> {
  if (!hasTabs()) return EMPTY_PAGE
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) return EMPTY_PAGE
    const icon = tab.favIconUrl ?? ''
    return {
      url: tab.url ?? '',
      title: (tab.title ?? '').trim(),
      icon: isUsableIcon(icon) ? icon : '',
    }
  } catch {
    return EMPTY_PAGE
  }
}

function isUsableIcon(icon: string): boolean {
  if (/^https?:\/\//i.test(icon)) return true
  return /^data:image\//i.test(icon) && icon.length <= MAX_INLINE_ICON_LENGTH
}

/** 不能收藏的原因；能收藏时返回 null。文案直接给用户看 */
export function unfavoritableReason(url: string): string | null {
  if (!url) return '读不到当前页地址，可以手动填写'
  if (isOwnPage(url)) return '当前页就是导航精灵，不用收藏'
  if (/^https?:\/\//i.test(url)) return null
  return '只支持收藏 http(s) 网页'
}

/** 是不是导航精灵自己的页面（扩展页 / 新标签页覆盖后的地址） */
export function isOwnPage(url: string): boolean {
  if (!url) return false
  const origin = extensionOrigin()
  if (origin && url.startsWith(origin)) return true
  return /^(chrome|edge|brave|vivaldi):\/\/(newtab|startpage)\/?$/i.test(url)
}

/** 首页地址（带查询参数） */
function indexUrl(query: string): string {
  const relative = query ? `index.html?${query}` : 'index.html'
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(relative)
  // 普通网页里（pnpm dev 打开 /popup.html）按相对路径来，方便本地调样式
  return new URL(relative, window.location.href).toString()
}

function openTab(url: string): void {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url })
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** 在新的新标签页里打开某个工具 */
export function openToolTab(toolKey: string): void {
  openTab(indexUrl(`tool=${encodeURIComponent(toolKey)}`))
}

export function openHomeTab(): void {
  openTab(indexUrl(''))
}

/** 打开新标签页并直接展开右侧配置面板 */
export function openSettingsTab(): void {
  openTab(indexUrl('settings=1'))
}

/** 关掉弹窗本身（点完工具/入口就该消失，不然会挡住刚打开的页面） */
export function closePopup(): void {
  window.close()
}
