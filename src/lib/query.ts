/**
 * 「打开新标签页并直接展开配置面板」的地址参数。
 *
 * 扩展弹窗里的「配置面板」按钮开出去的就是 `index.html?settings=1`。参数与面板开关双向对齐
 * （照 tools/query.ts 的 `?tool=` 那套）：首帧按它决定面板开不开，关掉面板时再把它抹掉 ——
 * 不然用户手动关了一次，刷新又被弹出来。
 */
export const SETTINGS_QUERY = 'settings'

/** 地址栏带 `?settings=1` 时打开配置面板 */
export function settingsFromQuery(): boolean {
  return new URLSearchParams(window.location.search).get(SETTINGS_QUERY) === '1'
}

/** 关掉配置面板时同步地址栏；参数本来就不在就什么也不做（replaceState，不进历史记录） */
export function clearSettingsQuery(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(SETTINGS_QUERY)) return
  url.searchParams.delete(SETTINGS_QUERY)
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}
