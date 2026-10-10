import type { SearchEngine } from '../config/schema.ts'

export interface SearchEngineOption {
  key: SearchEngine
  label: string
  searchUrl: string
  suggestUrl: string
}

/** 与 HomeTab 保持一致的三个搜索引擎。URL 里的 ${keyword} 使用 encodeURIComponent 后替换。 */
export const SEARCH_ENGINE_OPTIONS: readonly SearchEngineOption[] = [
  {
    key: 'google',
    label: 'Google',
    searchUrl: 'https://www.google.com/search?q=${keyword}&oq=${keyword}&sourceid=chrome&ie=utf-8',
    suggestUrl: 'https://www.google.com.hk/complete/search?hl=zh-CN&q=${keyword}&client=gws-wiz&start=0',
  },
  {
    key: 'baidu',
    label: '百度',
    searchUrl: 'https://www.baidu.com/s?wd=${keyword}&tn=baidu&ie=utf-8',
    suggestUrl: 'https://www.baidu.com/sugrec?wd=${keyword}&prod=pc',
  },
  {
    key: 'bing',
    label: '必应',
    searchUrl: 'https://cn.bing.com/search?q=${keyword}&pq=${keyword}&from=form',
    suggestUrl:
      'https://cn.bing.com/AS/Suggestions?pt=page.serp&bq=a&mkt=zh-cn&ds=mobileweb&qry=${keyword}&cp=1&csr=1&zis=1&msbqf=false&pths=1&cvid=A56BE7B7802A40F89FC5D0505AAE4B9C',
  },
] as const

const BY_KEY = new Map(SEARCH_ENGINE_OPTIONS.map((engine) => [engine.key, engine]))

export function getSearchEngine(key: SearchEngine): SearchEngineOption {
  return BY_KEY.get(key) ?? SEARCH_ENGINE_OPTIONS[0]
}

function fillTemplate(template: string, keyword: string): string {
  return template.replaceAll('${keyword}', encodeURIComponent(keyword))
}

export function buildSearchUrl(key: SearchEngine, keyword: string): string {
  return fillTemplate(getSearchEngine(key).searchUrl, keyword)
}

export function buildSuggestUrl(key: SearchEngine, keyword: string): string {
  return fillTemplate(getSearchEngine(key).suggestUrl, keyword)
}

/** 输入的是完整 URL 或裸域名时直接打开；其余内容交给所选搜索引擎。 */
export function buildNavigationUrl(key: SearchEngine, rawInput: string): string {
  const input = rawInput.trim()
  if (/^https?:\/\//i.test(input)) return input
  if (/^[^\s.]+(?:\.[^\s.]+)+(?:[/:?#].*)?$/u.test(input)) return `https://${input}`
  return buildSearchUrl(key, input)
}
