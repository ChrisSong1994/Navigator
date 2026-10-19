/**
 * 「什么算一份 Markdown 文档」以及相关文案。
 *
 * 放公共层而不是工具里，是因为**首页也要用它**（首页拖入 .md 直接进 Markdown 工具的演示模式），
 * 而首页不能反过来 import 工具的 lib（会成环，见 Json/Markdown 的 lib/kind.ts 顶上的那条规矩）。
 * 后缀表从这里出去，工具的 accept 串由它拼出来，这份判定只此一处、不会漂。
 */

/** 认这几个后缀；只看结尾，`a.md.bak` 不算 */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.txt'] as const

/**
 * 拖进来的文件算不算 Markdown（整窗拖入用它挡掉图片、PDF 之类）。
 *
 * 主要看后缀：macOS 上 .md 的 `File.type` 常常是空串，只认 MIME 的话拖进来全被拒。
 * 但有些来源（剪贴板、别的系统）给的是准的，两种都认。
 */
export function isMarkdownLike(file: { name: string; type: string }): boolean {
  const name = file.name.toLowerCase()
  if (MARKDOWN_EXTENSIONS.some((ext) => name.endsWith(ext))) return true
  return file.type === 'text/markdown' || file.type === 'text/plain'
}

/**
 * 工具页里拖进来不是 Markdown 时的提示。首页那份实例不提示：
 * 首页只认 md，别的文件不拦不提示、只当没发生（见 App.tsx 里那份 useWindowFileDrop）。
 */
export const MARKDOWN_REJECT_MESSAGE = '只认 Markdown 文档（.md / .markdown / .txt）'
