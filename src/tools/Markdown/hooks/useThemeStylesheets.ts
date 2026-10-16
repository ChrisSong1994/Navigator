import { useEffect } from 'react'

import type { ColorScheme } from '../../hooks/useColorScheme.ts'
import { THEME_STYLESHEETS } from '../lib/theme.ts'

/** 挂出去的那两张 <link> 靠这个属性认领，免得把别人的样式表一起删了 */
const MARKER = 'data-markdown-theme'

/**
 * 按当前主题挂上预览区的两张主题样式表（见 lib/theme.ts 里为什么要走 <link>）。
 *
 * 用 module 级的缓存记住已挂的 <link>：StrictMode 下这个 effect 会跑两遍，
 * 每次新建一批再删掉旧的也没什么错，但复用同一个元素能少一次样式重算。
 */
const links: (HTMLLinkElement | null)[] = [null, null]

function ensureLink(index: number): HTMLLinkElement {
  const existing = links[index]
  if (existing && existing.isConnected) return existing

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.setAttribute(MARKER, String(index))
  document.head.appendChild(link)
  links[index] = link
  return link
}

export function useThemeStylesheets(scheme: ColorScheme): void {
  useEffect(() => {
    const [markdownHref, hljsHref] = THEME_STYLESHEETS[scheme]
    ensureLink(0).href = markdownHref
    ensureLink(1).href = hljsHref
  }, [scheme])
}
