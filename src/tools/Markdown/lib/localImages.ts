/**
 * 本地文档里的图片：把 markdown 里的相对地址按文档所在目录解析成 `file://` 绝对地址。
 *
 * 为什么需要这一步：markdown 原样交给 bytemd 时，`![](./pic.png)` 会按**页面**的地址解析 ——
 * 扩展态落到 `chrome-extension://<id>/pic.png`，开发态落到 `http://localhost:.../pic.png`，
 * 都不是文档旁边那张图。只有「这份文档来自哪个文件」是已知的（`?file=` 打开的、历史里按
 * `file://` 地址重读的）才谈得上解析；拖到页面里的 `File` 对象没有路径，那种情况无解。
 *
 * 为什么不做成改写正文：正文是用户要编辑、要保存回源文件的，地址必须是原文。
 * 所以走 bytemd 插件的 `rehype` 钩子，只改渲染出来的 hast。
 *
 * 另外两个容易踩的点：
 *
 * 1. bytemd 的 `rehype` 插件在 **sanitize 之后**执行（见 node_modules/bytemd/dist/index.js 的
 *    getProcessor）。默认 sanitizer 的 `src` 只允许 http/https，`file://` 会在 sanitize 那步被
 *    整个删掉 —— 我们在这里补回去的地址反而不会被删。相对地址本来就能过 sanitize。
 * 2. 写进 hast 的 `src` 得是绝对地址。插件拿不到页面的 base，也没法改 `<base>`。
 */
import type { ViewerProps } from '@bytemd/react'
import type { BytemdPlugin } from 'bytemd'

/** bytemd 的 sanitize 配置类型（它没有导出 Schema，从 Props 里取） */
type SanitizeSchema = Parameters<NonNullable<ViewerProps['sanitize']>>[0]

/** hast 里我们只关心元素和它们的属性，不为一个插件把整棵树的类型都引进来 */
interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** 带协议的地址（`http:` / `data:` / `file:` / `C:`）：这些不归我们重写 */
const SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:/

/**
 * 文档的图片基准目录：`file:///a/b/doc.md` → `file:///a/b/`。
 * 不是本地文件（或地址坏了）就返回 null，调用方据此不做任何重写。
 */
export function imageBaseFromSource(source: string | null): string | null {
  if (!source) return null
  try {
    const url = new URL(source)
    if (url.protocol !== 'file:') return null
    // `new URL('.', url)` 顺带丢掉地址里的查询串与锚点
    return new URL('.', url).href
  } catch {
    return null
  }
}

/**
 * 把一个图片地址解析成绝对 `file://` 地址；不需要/不能解析的返回 null（调用方保持原样）。
 *
 * - `./pic.png`、`pic.png`、`../img/pic.png` → 按基准目录解析
 * - `/tmp/pic.png` → `file:///tmp/pic.png`（根路径在本地文档里就是磁盘绝对路径）
 * - `https://…`、`data:…`、`file:…` → null，原样交给页面
 */
export function resolveLocalImageUrl(src: string, base: string): string | null {
  if (!src || src.startsWith('#') || SCHEME.test(src)) return null
  try {
    const url = new URL(src, base)
    return url.protocol === 'file:' ? url.href : null
  } catch {
    return null
  }
}

function rewriteImages(node: HastNode, base: string): void {
  if (node.type === 'element' && node.tagName === 'img') {
    const src = node.properties?.src
    if (typeof src === 'string') {
      const resolved = resolveLocalImageUrl(src, base)
      if (resolved) node.properties = { ...node.properties, src: resolved }
    }
  }
  for (const child of node.children ?? []) rewriteImages(child, base)
}

/** 给 bytemd 的插件：在渲染阶段把本地图片地址补成绝对 `file://` 地址 */
export function createLocalImagePlugin(base: string): BytemdPlugin {
  return {
    rehype: (processor) =>
      processor.use(() => (tree: HastNode) => {
        rewriteImages(tree, base)
      }),
  }
}

/**
 * 只在「文档来自本地文件」时启用：放行 `img src` 的 `file:` 协议。
 *
 * sanitize 在插件的 rehype 之前跑，默认 schema 的 `src` 只认 http/https，所以 markdown 里
 * 直接写 `![](file:///…/pic.png)` 的，等不到插件去处理就被删掉了。相对路径不重写成绝对地址
 * 的话浏览器也不知道基准目录，所以仍然走插件（见 createLocalImagePlugin）。
 *
 * 拖入 / 导入的文档不启用（调用方传 undefined）：那不是用户自己磁盘上的一份文档，
 * 没必要让它去探本机路径。
 */
export function allowLocalImageProtocols(schema: SanitizeSchema): SanitizeSchema {
  const protocols = schema.protocols ?? {}
  const src = protocols.src ?? []
  if (src.includes('file')) return schema
  return { ...schema, protocols: { ...protocols, src: [...src, 'file'] } }
}

/** markdown 里内联图片（`![alt](src)`）与 HTML `<img src="…">` 的地址 */
const IMAGE_REFERENCES = [
  /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g,
  /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
]

function looksLocal(src: string): boolean {
  // `//host/path` 是协议相对地址，交给页面去解析
  return !SCHEME.test(src) && !src.startsWith('//')
}

/**
 * 文中是否引用了本地图片（相对路径 / 根路径）。没有来源地址的文档只用来提示用户：
 * 这些图在浏览器里解析不了，不是渲染坏了。只看图片语法，粗判即可。
 */
export function hasLocalImageRefs(markdown: string): boolean {
  for (const pattern of IMAGE_REFERENCES) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(markdown); match; match = pattern.exec(markdown)) {
      if (looksLocal(match[1])) return true
    }
  }
  return false
}
