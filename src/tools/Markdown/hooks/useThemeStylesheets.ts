import { useEffect } from 'react'

import type { ColorScheme } from '../../../hooks/useColorScheme.ts'
import { THEME_STYLESHEETS } from '../lib/theme.ts'

/** 挂出去的那几张 <link> 靠这个属性认领，免得把别人的样式表一起删了 */
const MARKER = 'data-markdown-theme'

/**
 * 用 module 级的缓存记住已挂的 <link>：StrictMode 下这个 effect 会跑两遍，
 * 每次新建一批再删掉旧的也没什么错，但复用同一个元素能少一次样式重算。
 *
 * 0 / 1 是当前主题那两份，2 / 3 是打印用的亮色那两份。**顺序有意义**（见 useThemeStylesheets）。
 */
const links: (HTMLLinkElement | null)[] = [null, null, null, null]

function ensureLink(index: number, media?: 'print'): HTMLLinkElement {
  const existing = links[index]
  if (existing && existing.isConnected) return existing

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.setAttribute(MARKER, String(index))
  // media="print" 的那两份在屏幕下不参与匹配，只有进了打印才生效
  if (media) link.media = media
  document.head.appendChild(link)
  links[index] = link
  return link
}

/**
 * 按当前主题挂上预览区的两张主题样式表（见 lib/theme.ts 里为什么要走 <link>）。
 *
 * 另外再挂一对 `media="print"` 的亮色表（THEME_STYLESHEETS.light）。深色模式下正文是 #f0f6fc、
 * 代码高亮是 vs2015 那套浅色，而 Chrome 默认不打印底纹（深色底那两块根本不会印出来）——
 * 结果就是白纸上一片几乎看不见的浅色字。所以打印时改由亮色那两份说了算：两套表选择器结构相同、
 * 权重也相同，胜负只看文档顺序，**打印这两份必须 append 在当前主题那两份之后**，2 / 3 这两个位置就是为它留的。
 * 屏幕下它们 media 不匹配、一点作用都没有，所以两条渲染路径互不干扰。
 *
 * 不用 beforeprint / afterprint 去换 href：那是在打印前异步重新加载样式表，等快照时换没换好说不准。
 */
export function useThemeStylesheets(scheme: ColorScheme): void {
  useEffect(() => {
    const [markdownHref, hljsHref] = THEME_STYLESHEETS[scheme]
    ensureLink(0).href = markdownHref
    ensureLink(1).href = hljsHref

    // 打印这两份固定用亮色那套，与当前主题无关，挂一次就够
    const [printMarkdownHref, printHljsHref] = THEME_STYLESHEETS.light
    ensureLink(2, 'print').href = printMarkdownHref
    ensureLink(3, 'print').href = printHljsHref
  }, [scheme])
}
