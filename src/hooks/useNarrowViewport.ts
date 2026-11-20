import { useEffect, useState } from 'react'

/**
 * 「窗口现在是不是窄屏」（默认 < 768px）。用于把左右分栏改成上下分栏这类结构性切换 ——
 * 靠 CSS 做不到：antd Splitter 的方向是 JS 决定的，两个面板的排布也跟方向走。
 *
 * 初值同步取一次，不留「先按宽屏画一帧、再跳成窄屏」的空档。
 */
export function useNarrowViewport(maxWidth = 768): boolean {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(`(max-width: ${maxWidth}px)`).matches,
  )

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [maxWidth])

  return narrow
}
