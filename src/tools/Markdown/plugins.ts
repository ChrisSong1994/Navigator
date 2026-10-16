/**
 * bytemd 的插件装配。原项目 pages/Markdown/index.tsx 顶部那段照搬，只把注释掉的导入/下载下拉菜单去掉了
 * （那个功能由工具栏接手，见 components/Toolbar.tsx）。
 *
 * 顺序也照原样：gfm → highlight → frontmatter → breaks → gemoji → math → mediumZoom → mermaid。
 *
 * mermaid / highlight.js / katex 都是插件内部 `await import(...)` 的，只有文档真的用上某个语法时
 * 才会去拉对应的 chunk，所以插件全开着不等于每次打开都要下载这些大件。
 */
import breaks from '@bytemd/plugin-breaks'
import frontmatter from '@bytemd/plugin-frontmatter'
import gemoji from '@bytemd/plugin-gemoji'
import gfm from '@bytemd/plugin-gfm'
import highlight from '@bytemd/plugin-highlight'
import math from '@bytemd/plugin-math'
import mediumZoom from '@bytemd/plugin-medium-zoom'
import mermaid from '@bytemd/plugin-mermaid'
import type { BytemdPlugin } from 'bytemd'

import GFM_ZH from '@bytemd/plugin-gfm/locales/zh_Hans.json'
import MATH_ZH from '@bytemd/plugin-math/locales/zh_Hans.json'
import MERMAID_ZH from '@bytemd/plugin-mermaid/locales/zh_Hans.json'

/**
 * 模块级常量，不是每次渲染新建的数组。
 *
 * @bytemd/react 是把 props 整个 `$set` 给编辑器实例、并且以 props 身份为依赖的，
 * 每次渲染换一份新数组会让它每帧白跑一遍。
 */
export const PLUGINS: BytemdPlugin[] = [
  gfm({ locale: GFM_ZH }),
  highlight(),
  frontmatter(),
  breaks(),
  gemoji(),
  math({ locale: MATH_ZH }),
  mediumZoom(),
  mermaid({ locale: MERMAID_ZH }),
]
