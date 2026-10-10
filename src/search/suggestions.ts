import { buildSearchUrl, buildSuggestUrl, getSearchEngine } from './engines.ts'
import type { SearchEngine } from '../config/schema.ts'

export interface SearchSuggestion {
  keyword: string
  url: string
}

interface SuggestMessageResponse {
  ok: boolean
  body?: string
  error?: string
}

function hasExtensionRuntime(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage)
}

function googleSuggestions(body: string): SearchSuggestion[] {
  let text = body.trim()
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open >= 0 && close > open) text = text.slice(open + 1, close)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const list = Array.isArray(parsed[0]) ? parsed[0] : Array.isArray(parsed[1]) ? parsed[1] : []
  return list
    .map((item) => (Array.isArray(item) ? String(item[0] ?? '').trim() : ''))
    .filter(Boolean)
    .map((value) => ({ keyword: value, url: buildSearchUrl('google', value) }))
}

function jsonSuggestions(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function baiduSuggestions(body: string): SearchSuggestion[] {
  const parsed = jsonSuggestions(body) as { g?: Array<{ q?: unknown }> } | null
  if (!parsed?.g) return []
  return parsed.g
    .map((item) => (typeof item.q === 'string' ? item.q.trim() : ''))
    .filter(Boolean)
    .map((value) => ({ keyword: value, url: buildSearchUrl('baidu', value) }))
}

function bingSuggestions(body: string): SearchSuggestion[] {
  const parsed = jsonSuggestions(body) as { s?: Array<{ q?: unknown; u?: unknown }> } | null
  if (!parsed?.s) return []
  return parsed.s
    .map((item) => (typeof item.q === 'string' ? item.q.replace(/[\uE000\uE001]/g, '').trim() : ''))
    .filter(Boolean)
    .map((value) => ({ keyword: value, url: buildSearchUrl('bing', value) }))
}

/** 把不同搜索引擎的联想响应统一成 { keyword, url }。 */
export function parseSearchSuggestions(engine: SearchEngine, body: string, keyword: string): SearchSuggestion[] {
  const suggestions =
    engine === 'google'
      ? googleSuggestions(body)
      : engine === 'baidu'
        ? baiduSuggestions(body)
        : bingSuggestions(body)

  const deduped = suggestions.filter((item, index, list) => list.findIndex((other) => other.keyword === item.keyword) === index)
  if (deduped.length === 0) return []
  if (deduped[0].keyword !== keyword) {
    return [{ keyword, url: buildSearchUrl(engine, keyword) }, ...deduped].slice(0, 8)
  }
  return deduped.slice(0, 8)
}

/**
 * 扩展环境交给 service worker 取联想，绕过页面的跨域限制。
 * 普通网页环境尝试直接 fetch；被 CORS 拦截时静默返回空数组，不影响主搜索。
 */
export async function fetchSearchSuggestions(
  engine: SearchEngine,
  keyword: string,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  const query = keyword.trim()
  if (!query) return []
  const suggestUrl = buildSuggestUrl(engine, query)
  let body = ''

  if (hasExtensionRuntime()) {
    const response = (await chrome.runtime.sendMessage({
      type: 'SEARCH_SUGGEST_FETCH',
      payload: { url: suggestUrl },
    })) as SuggestMessageResponse | undefined
    if (!response?.ok || typeof response.body !== 'string') return []
    body = response.body
  } else {
    const response = await fetch(suggestUrl, { signal, credentials: 'omit' })
    if (!response.ok) return []
    body = await response.text()
  }

  if (signal?.aborted) return []
  return parseSearchSuggestions(engine, body, query)
}

export { getSearchEngine }
