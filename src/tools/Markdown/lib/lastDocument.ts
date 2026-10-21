/**
 * 刷新后把「上次开着的那份文档」找回来。
 *
 * 地址栏 `?file=` 打开的那份本来就能靠参数重读（见 index.tsx 里读文件那个 effect），但**拖入 / 导入 /
 * 从历史回填**打开的那份没有地址栏凭据 —— 页面一刷新，组件里的状态就没了，只能看到示例文档，
 * 看着就像文档丢了。所以这里把当前这份文档的名字、正文、来源地址和模式一起存进 localStorage，
 * 下次进工具页时（既没有首页交接、也没有 `?file=`）拿它垫底。
 *
 * 只此一份、键固定，不是历史：不参与 20 条上限、也不按文件名去重。几处边界：
 *
 * - 存的是**当前编辑中的内容**，不是磁盘上的内容：刷新后照旧看到自己没保存的改动。
 *   想让磁盘上的新版生效，从 `?file=` 那条路进来（那边每次刷新都重读）。
 * - 清空文档也算一种状态，照存不误：否则刷新后一份空文档又变回示例文档。
 *   真正没有存档（从没进来过、或站点数据被清）时才回落到示例文档。
 * - 正文超过 MAX_CONTENT_BYTES 就不存正文：localStorage 那点配额经不起。有来源地址的只留
 *   「名字 + 地址」，恢复时照着地址重读（与历史里 contentOmitted 的处理一致）；没有来源的就整份不存。
 * - 写不进去（配额满、隐私模式）一律吞掉：存档是锦上添花，不该把编辑器拖垮。
 */
import type { MarkdownMode } from './mode.ts'

/** 这份存档的键：一份文档一个键，没有多实例 */
export const LAST_DOCUMENT_KEY = 'navigator.markdown.document'

/**
 * 正文上限。历史那边是 256 KB（要放 20 条），这里只有一份，可以宽一点，
 * 但仍得给同一站点下的其他数据留出配额。
 */
export const MAX_CONTENT_BYTES = 1024 * 1024

export interface LastDocument {
  /** 文件名；没有名字（拖入 / 导入拿不到路径）时为 null */
  name: string | null
  content: string
  /** 来源地址（`file://…`）：有它才能写回源文件、解析相对图片 */
  source: string | null
  /** 当时停在哪个模式，刷新后照旧 */
  mode: MarkdownMode
  /** 正文因为太大没存下来（此时 content 是空串，靠 source 重读） */
  contentOmitted?: boolean
}

function byteSize(text: string): number {
  return new Blob([text]).size
}

/** 存档文本 → 文档。坏掉的、形状不对的一律当没存过 */
export function parseLastDocument(raw: string | null): LastDocument | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Partial<LastDocument>
    if (typeof value.content !== 'string') return null
    const source = typeof value.source === 'string' && value.source ? value.source : null
    return {
      name: typeof value.name === 'string' && value.name ? value.name : null,
      content: value.content,
      source,
      mode: value.mode === 'view' ? 'view' : 'edit',
      // 不落盘，由「有来源地址却没有正文」推出来：真正空白的文档会照存 content: ''
      contentOmitted: !value.content && Boolean(source),
    }
  } catch {
    return null
  }
}

/**
 * 文档 → 存档文本。
 *
 * 返回 `undefined` 表示「这次别动存档」：太大的文档又没有来源地址，存不了也删不得 ——
 * 删掉只会让上一份也一并丢掉。
 */
export function serializeLastDocument(doc: LastDocument): string | undefined {
  const tooLarge = byteSize(doc.content) > MAX_CONTENT_BYTES
  if (tooLarge && !doc.source) return undefined
  return JSON.stringify({
    name: doc.name,
    // 太大的正文只留个空串，恢复时按 source 重读（见 LastDocument.contentOmitted）
    content: tooLarge ? '' : doc.content,
    source: doc.source,
    mode: doc.mode,
  })
}

export function readLastDocument(): LastDocument | null {
  try {
    return parseLastDocument(window.localStorage.getItem(LAST_DOCUMENT_KEY))
  } catch {
    // 隐私模式 / 站点数据被禁：当没有存档
    return null
  }
}

/** 读档 → 存档 */
export function writeLastDocument(doc: LastDocument): void {
  const text = serializeLastDocument(doc)
  if (text === undefined) return
  try {
    window.localStorage.setItem(LAST_DOCUMENT_KEY, text)
  } catch {
    // 忽略：见文件头
  }
}
