import { useEffect, useState } from 'react'
import type { ThemeMode } from '../config/schema.ts'

export type ResolvedTheme = 'light' | 'dark'

/** 解析 themeMode（跟随系统 / 浅色 / 深色），并把结果写到 html[data-theme] 上供 CSS 与 tailwind 使用 */
export function useResolvedTheme(mode: ThemeMode): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  return resolved
}
