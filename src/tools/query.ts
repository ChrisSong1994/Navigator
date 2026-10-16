/**
 * 「当前开着哪个工具」和地址栏的同步。
 *
 * 首页是 `/`，工具页是 `/?tool=json`：刷新、把链接发给别人、以及「弹出到独立窗口」开出去的那个
 * 窗口（它带 `?tool=json&popup=1`），都靠这个参数落到同一个工具上。
 *
 * 用 replaceState 而不是 pushState：换工具和返回首页都不进历史记录，返回首页走工具页左上角那个箭头。
 */
export const TOOL_QUERY = 'tool'

export function toolFromQuery(): string | null {
  return new URLSearchParams(window.location.search).get(TOOL_QUERY)
}

export function setToolQuery(key: string | null): void {
  const url = new URL(window.location.href)
  if (key) url.searchParams.set(TOOL_QUERY, key)
  else url.searchParams.delete(TOOL_QUERY)
  // 别的参数（比如弹窗的 popup=1）原样留着，所以是在当前查询串上增删，不是整个换掉
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function clearToolQuery(): void {
  setToolQuery(null)
}
