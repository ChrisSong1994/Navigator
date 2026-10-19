/**
 * 「什么算一份 JSON 文件」。
 *
 * 放公共层而不是工具里，是因为**首页也要用它**（首页拖入 .json 直接进 JSON 工具），
 * 而首页不能反过来 import 工具的 lib（会成环，见 Markdown/lib/kind.ts 上的那条规矩）。
 * 后缀表从这里出去，service worker 是纯 JS、进不了构建，只能在 scripts/check-tools.mjs 里比对。
 *
 * 只认 json / json5：JSON 工具本身能吃 JSON5（lib/json.ts 里有兜底解析），导入框也收它；
 * jsonc 不单列 —— 带注释的配置工具照样解析得了，但把它当成「一类文件」会让人以为导出也保注释。
 */

/** 认这几个后缀；只看结尾，`a.json.bak` 不算 */
export const JSON_EXTENSIONS = ['.json', '.json5'] as const

/**
 * 拖进来的文件算不算 JSON（首页整窗拖入用它分流）。
 *
 * 主要看后缀：macOS 上 .json 的 `File.type` 往往是空串或 application/json，
 * 但别的来源（剪贴板、别的系统）给的不一定准，两种都认。
 */
export function isJsonLike(file: { name: string; type: string }): boolean {
  const name = file.name.toLowerCase()
  if (JSON_EXTENSIONS.some((ext) => name.endsWith(ext))) return true
  return file.type === 'application/json' || file.type === 'application/json5'
}
