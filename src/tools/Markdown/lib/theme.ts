/**
 * 预览区的两套主题文件：markdown-body 的排版色（github-markdown-css）与代码块高亮色（highlight.js）。
 *
 * 为什么用 `?url` 挂 <link> 而不是直接 import：
 * 这两对文件是「亮/暗各一份、类名完全相同」的静态主题，直接 import 就是两份规则永远同时生效、
 * 谁后加载谁赢，跟当前主题没关系；github-markdown-css 虽然通篇用 CSS 变量，亮暗两份的变量块也同名，
 * 一样没法同时导入。所以拿地址、按主题挂一份、切换时换掉旧的。
 *
 * 原项目固定亮色（只 import 了 light 与 hljs 的 vs）。这里两套都带，跟随站点的亮/暗。
 */
import markdownDark from 'github-markdown-css/github-markdown-dark.css?url'
import markdownLight from 'github-markdown-css/github-markdown-light.css?url'
import hljsDark from 'highlight.js/styles/vs2015.css?url'
import hljsLight from 'highlight.js/styles/vs.css?url'

import type { ColorScheme } from '../../../hooks/useColorScheme.ts'

/** 每套两张：第一张管 .markdown-body 的排版，第二张管 .hljs 的代码高亮 */
export const THEME_STYLESHEETS: Record<ColorScheme, [string, string]> = {
  light: [markdownLight, hljsLight],
  dark: [markdownDark, hljsDark],
}
