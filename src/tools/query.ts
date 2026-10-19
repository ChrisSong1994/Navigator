/**
 * 「当前开着哪个工具」以及工具页还开着什么，和地址栏的同步。
 *
 * 首页是 `/`，工具页是 `/?tool=json`：刷新、把链接发给别人、以及「弹出到独立窗口」开出去的那个
 * 窗口（它带 `?tool=json&popup=1`），都靠这个参数落到同一个工具上。
 *
 * 工具页要打开的那份本地文件走 `?file=`（只有 Markdown 用，见 tools/Markdown/lib/source.ts）。
 * 这两个参数都是「这一页当前开着什么」，所以换工具、返回首页时一起作废。
 *
 * 用 replaceState 而不是 pushState：换工具和返回首页都不进历史记录，返回首页走工具页左上角那个箭头。
 */
export const TOOL_QUERY = 'tool'

/** 工具页要打开的那份本地文件地址（扩展把 file:// 的导航换到工具页时挂上，见 public/service_worker.js） */
export const FILE_QUERY = 'file'

export function toolFromQuery(): string | null {
  return new URLSearchParams(window.location.search).get(TOOL_QUERY)
}

export function fileFromQuery(): string | null {
  return new URLSearchParams(window.location.search).get(FILE_QUERY)
}

/** 「这份文档已经不是地址栏那份了」（换了一份 / 清空了），把参数摘掉 */
export function clearFileQuery(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(FILE_QUERY)
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function setToolQuery(key: string | null): void {
  const url = new URL(window.location.href)
  if (key) url.searchParams.set(TOOL_QUERY, key)
  else url.searchParams.delete(TOOL_QUERY)
  // ?file= 只是「打开这份文件」的一次性入口，换工具就作废
  url.searchParams.delete(FILE_QUERY)
  // 别的参数（比如弹窗的 popup=1）原样留着，所以是在当前查询串上增删，不是整个换掉
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function clearToolQuery(): void {
  setToolQuery(null)
}
