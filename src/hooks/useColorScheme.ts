import { useEffect, useState } from 'react'

export type ColorScheme = 'light' | 'dark'

const read = (): ColorScheme =>
  document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : document.documentElement.dataset.theme === 'light'
      ? 'light'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

/**
 * 当前是浅色还是深色。
 *
 * 原项目这里调 Mantine 的 useComputedColorScheme；本项目的主题由 useResolvedTheme 统一写在
 * html[data-theme] 上，所以直接读属性并盯着它的变化就行，不用再引第二套主题系统。
 */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(read)

  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return scheme
}
