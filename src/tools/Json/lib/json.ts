/**
 * JSON 工具的纯逻辑：解析 / 格式化 / 压缩 / 修复 / 转义 / 去转义。
 *
 * 不 import React，也不碰 DOM，所以 scripts/check-tools.mjs 能直接在 node 里跑。
 *
 * 解析顺序是「先严格 JSON，再 JSON5 兜底」。JSON5 是 JSON 的超集，这一条链路同时覆盖了
 * 严格校验和「容忍注释 / 单引号 / 尾逗号 / 无引号键」两种输入，不必再挂一个 lint 库。
 */
import JSON5 from 'json5'
import { jsonrepair } from 'jsonrepair'

/** 源文本是靠哪套语法解析通的；命中 json5 时界面要标出来，免得用户以为自己的输入是严格 JSON */
export type JsonSyntax = 'json' | 'json5'

/** 解析失败：message 是清掉位置尾巴后的引擎原文，line / column 是尽力还原的位置，excerpt 是出错位置附近的一小段 */
export interface JsonParseError {
  ok: false
  message: string
  line: number | null
  column: number | null
  excerpt: string
}

export interface JsonParsed {
  ok: true
  data: unknown
  syntax: JsonSyntax
}

/** 文本加工成功：text 是产物，syntax 记下源文本是靠什么解析通的 */
export interface JsonTextResult {
  ok: true
  text: string
  syntax: JsonSyntax
}

export type JsonParseResult = JsonParsed | JsonParseError
export type JsonTextOutcome = JsonTextResult | JsonParseError

/** 常见转义序列 → 原字符；JSON.parse 走不通时逐序列还原，认不出的原样留着 */
const UNESCAPE_MAP: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }

/** excerpt 里出错行前后各留多少个字符，免得一行几万字的压缩 JSON 把错误面板撑爆 */
const EXCERPT_RADIUS = 40

/**
 * 引擎报错尾巴上的位置信息由 line / column 单独展示，这里从原文摘掉，只留「哪儿错了」。
 *   V8    Expected double-quoted property name in JSON at position 7 (line 1 column 8)
 *   JSON5 JSON5: invalid end of input at 1:6
 */
function tidyMessage(message: string): string {
  return message
    .replace(/^JSON5:\s*/, '')
    .replace(/\s+in JSON\b/, '')
    .replace(/\s+at position \d+(\s+\(line \d+ column \d+\))?$/, '')
    .replace(/\s+at \d+:\d+$/, '')
    .trim()
}

/** 只有字节偏移时自己换算行列，口径与 V8 的 line / column 一致（都是 1 基） */
function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(offset, source.length))
  let line = 1
  let lineStart = 0
  for (let index = 0; index < end; index += 1) {
    if (source[index] === '\n') {
      line += 1
      lineStart = index + 1
    }
  }
  return { line, column: end - lineStart + 1 }
}

/**
 * 从引擎报错里抠出位置：V8 优先给「(line 3 column 1)」，JSON5 给「at 1:6」，
 * 老引擎只给「at position 12」那就自己换算。都拿不到就返回 null，界面只显示报错原文。
 */
function locate(source: string, message: string): { line: number | null; column: number | null } {
  const explicit = message.match(/\(line (\d+) column (\d+)\)/)
  if (explicit) return { line: Number(explicit[1]), column: Number(explicit[2]) }

  const json5 = message.match(/ at (\d+):(\d+)$/)
  if (json5) return { line: Number(json5[1]), column: Number(json5[2]) }

  const offset = message.match(/at position (\d+)/)
  if (!offset) return { line: null, column: null }
  return offsetToLineColumn(source, Number(offset[1]))
}

/** 出错那一行的一小段 + 一行指到出错列的 caret；超长的行只截出错位置附近的窗口 */
function excerptAt(source: string, line: number, column: number): string {
  const text = source.split('\n')[line - 1]
  if (text === undefined) return ''

  const index = column - 1
  const start = Math.max(0, index - EXCERPT_RADIUS)
  const end = Math.min(text.length, index + EXCERPT_RADIUS)
  const head = start > 0 ? '…' : ''
  const tail = end < text.length ? '…' : ''
  // 制表符在等宽字体里宽度不定，展开成空格让 caret 对得齐；只影响这一小段展示
  const visible = text.slice(start, end).replaceAll('\t', ' ')
  // 位置可能落在行尾之后（比如「提前结束」类报错），caret 贴到最后一个字符右边即可
  const caret = Math.min(Math.max(index - start, 0), visible.length)

  return `${head}${visible}${tail}\n${' '.repeat(head.length + caret)}^`
}

function failure(message: string, source: string, line: number | null, column: number | null): JsonParseError {
  return {
    ok: false,
    message,
    line,
    column,
    excerpt: line === null || column === null ? '' : excerptAt(source, line, column),
  }
}

/**
 * 严格 JSON 优先，失败回退 JSON5。
 * 两个引擎都失败时用严格 JSON 的报错：对严格输入它的措辞更准，位置也是按原文本算的；
 * 只有严格 JSON 没能给出位置时才退到 JSON5 的报错。
 */
export function parseJsonText(text: string): JsonParseResult {
  try {
    return { ok: true, data: JSON.parse(text) as unknown, syntax: 'json' }
  } catch (strictError) {
    try {
      return { ok: true, data: JSON5.parse(text) as unknown, syntax: 'json5' }
    } catch (looseError) {
      const strict = (strictError as Error).message
      const strictAt = locate(text, strict)
      if (strictAt.line !== null) return failure(tidyMessage(strict), text, strictAt.line, strictAt.column)

      const loose = (looseError as Error).message
      const looseAt = locate(text, loose)
      return failure(tidyMessage(loose), text, looseAt.line, looseAt.column)
    }
  }
}

/** 解析通过后重新序列化：给了 indent 就是美化，不给就是压缩成一行 */
function serialize(text: string, indent?: number): JsonTextOutcome {
  const parsed = parseJsonText(text)
  if (!parsed.ok) return parsed
  return { ok: true, text: JSON.stringify(parsed.data, null, indent), syntax: parsed.syntax }
}

/** 美化：默认 2 空格缩进 */
export function formatJson(text: string, indent = 2): JsonTextOutcome {
  return serialize(text, indent)
}

/** 压缩：去掉所有缩进与换行 */
export function minifyJson(text: string): JsonTextOutcome {
  return serialize(text)
}

/** 修复：先交给 jsonrepair 补全，再重新解析一遍，落成合法 JSON 的序列化产物 */
export function repairJsonText(text: string): JsonTextOutcome {
  if (!text.trim()) return failure('没有可修复的内容', text, null, null)

  let repaired: string
  try {
    repaired = jsonrepair(text)
  } catch (error) {
    return failure(`修复失败：${(error as Error).message}`, text, null, null)
  }

  const parsed = parseJsonText(repaired)
  if (!parsed.ok) return parsed
  // 行结构跟着输入走：本来就是多行就美化，本来就是一行就保持一行
  return { ok: true, text: JSON.stringify(parsed.data, null, text.includes('\n') ? 2 : undefined), syntax: parsed.syntax }
}

/**
 * 转义：把整段文本变成「能内联进代码里的字符串」的内容，也就是去掉外层引号的 JSON 字符串。
 * 交给 JSON.stringify 做，引号 / 反斜杠 / 换行 / 制表符的顺序天然正确。
 */
export function escapeJsonText(text: string): string {
  return JSON.stringify(text).slice(1, -1)
}

/**
 * 去转义：正常情况整段就是「一个被转义过的字符串」，包上引号交给 JSON.parse 还原。
 * 粘的若是本来就带裸引号的 JSON 片段，JSON.parse 会失败，这时逐序列还原——
 * 对已经没转义的文本来说这个替换是恒等的，所以不会把原文改坏。
 */
export function unescapeJsonText(text: string): string {
  try {
    return JSON.parse(`"${text}"`) as string
  } catch {
    return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, sequence: string) =>
      sequence[0] === 'u' ? String.fromCharCode(Number.parseInt(sequence.slice(1), 16)) : UNESCAPE_MAP[sequence],
    )
  }
}
