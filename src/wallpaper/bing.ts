/**
 * Bing 每日壁纸客户端。
 *
 * 官方 HPImageArchive 通常只提供最近约 8 天数据，因此第一版按“最近可用壁纸”
 * 提供选择和自动轮播，不做任意历史日期。扩展环境经 service worker 请求以绕过 CORS，
 * 普通网页环境直接请求；失败时由调用方回退配置里的 wallpaperUrl。
 */
export interface BingWallpaper {
  /** YYYY-MM-DD */
  date: string
  /** Bing 返回的 YYYYMMDD */
  rawDate: string
  /** 可直接作为背景图的绝对地址 */
  url: string
  /** 列表用小图地址 */
  thumbnailUrl: string
  title: string
  copyright: string
}

interface BingImage {
  startdate?: unknown
  url?: unknown
  urlbase?: unknown
  title?: unknown
  copyright?: unknown
}

interface BingResponse {
  images?: unknown
}

interface BingMessageResponse {
  ok: boolean
  body?: string
  error?: string
}

const BING_API = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN'

function hasExtensionRuntime(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage)
}

function normalizeBingUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value
  return `https://www.bing.com${value.startsWith('/') ? '' : '/'}${value}`
}

function formatDate(rawDate: string): string {
  if (!/^\d{8}$/.test(rawDate)) return rawDate
  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
}

function parseWallpaper(image: BingImage): BingWallpaper | null {
  if (typeof image.url !== 'string' || !image.url.trim()) return null
  const rawDate = typeof image.startdate === 'string' ? image.startdate.trim() : ''
  const url = normalizeBingUrl(image.url.trim())
  const urlbase = typeof image.urlbase === 'string' && image.urlbase.trim() ? image.urlbase.trim() : null
  return {
    date: formatDate(rawDate),
    rawDate,
    url,
    thumbnailUrl: urlbase ? normalizeBingUrl(`${urlbase}_400x240.jpg`) : url,
    title: typeof image.title === 'string' ? image.title.trim() : '',
    copyright: typeof image.copyright === 'string' ? image.copyright.trim() : '',
  }
}

/** 解析 Bing HPImageArchive JSON；字段缺失或格式异常时返回空数组。 */
export function parseBingWallpapers(body: string): BingWallpaper[] {
  let parsed: BingResponse
  try {
    parsed = JSON.parse(body) as BingResponse
  } catch {
    return []
  }
  if (!Array.isArray(parsed.images)) return []
  return parsed.images
    .filter((image): image is BingImage => typeof image === 'object' && image !== null)
    .map(parseWallpaper)
    .filter((image): image is BingWallpaper => image !== null)
}

/** 获取 Bing 最近壁纸。普通网页若被 CORS 拦截，会抛出错误交给运行时降级。 */
export async function fetchBingWallpapers(signal?: AbortSignal): Promise<BingWallpaper[]> {
  let body = ''

  if (hasExtensionRuntime()) {
    const response = (await chrome.runtime.sendMessage({ type: 'BING_WALLPAPER_FETCH' })) as BingMessageResponse | undefined
    if (!response?.ok || typeof response.body !== 'string') {
      throw new Error(response?.error || 'Bing 壁纸请求失败')
    }
    body = response.body
  } else {
    const response = await fetch(BING_API, { signal, credentials: 'omit' })
    if (!response.ok) throw new Error(`Bing 壁纸请求失败：HTTP ${response.status}`)
    body = await response.text()
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const images = parseBingWallpapers(body)
  if (images.length === 0) throw new Error('Bing 壁纸接口没有返回可用图片')
  return images
}

export { BING_API }
