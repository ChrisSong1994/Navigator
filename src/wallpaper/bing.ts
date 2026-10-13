/**
 * Bing 每日壁纸客户端。
 *
 * 官方 HPImageArchive 通常只提供最近约 8 天数据，因此第一版按“最近可用壁纸”
 * 提供选择和自动轮播，不做任意历史日期。Bing 列表只在浏览器扩展环境通过
 * service worker 请求；普通网页不支持 Bing 列表，仍可使用配置里的自定义图片地址。
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

/** 获取 Bing 最近壁纸。仅扩展环境通过 service worker 请求，网页环境不支持。 */
export async function fetchBingWallpapers(signal?: AbortSignal): Promise<BingWallpaper[]> {
  let body = ''

  if (hasExtensionRuntime()) {
    const response = (await chrome.runtime.sendMessage({ type: 'BING_WALLPAPER_FETCH' })) as BingMessageResponse | undefined
    if (!response?.ok || typeof response.body !== 'string') {
      throw new Error(response?.error || 'Bing 壁纸请求失败')
    }
    body = response.body
  } else {
    throw new Error('Bing 壁纸列表仅在浏览器扩展中可用，请安装扩展或改用图片地址')
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const images = parseBingWallpapers(body)
  if (images.length === 0) throw new Error('Bing 壁纸接口没有返回可用图片')
  return images
}

export { BING_API }
