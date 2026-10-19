/**
 * 工具的历史记录（存内容型）。JSON 与 Markdown 两个工具共用，各自的 localStorage 键不同。
 *
 * 原项目把历史交给 Electron 的 userData：一条记录是「文件路径 + 名字 + 时间」，点一下按路径回读文件。
 * 浏览器里既拿不到路径、也不能凭路径重读，所以这里改成**存内容**：点一下把内容灌回编辑器。
 *
 * 代价是 localStorage 那 5MB 的配额。所以：单条过大就只留名字和时间（内容留空，界面上点不动），
 * 整块写不进去就从最旧的开始砍，直到写得进去 —— 宁可少记几条，不能让历史读写把工具搞崩。
 * 留了名字的条目若还记着来源文件地址（source），点一下可以照着它重读，见 JSON / Markdown 工具的 index.tsx。
 */

/** 原项目上限 20 条，沿用 */
const LIMIT = 20

/** 单条内容超过这个大小就不存内容了，只留名字和时间 */
const MAX_CONTENT_BYTES = 256 * 1024

export interface HistoryItem {
  id: string
  name: string
  /** 文件内容；超过 MAX_CONTENT_BYTES 时是空串，此时 contentOmitted 为 true */
  content: string
  time: number
  contentOmitted?: boolean
  /**
   * 程序用的标识，去重键取 `meta ?? name`。
   *
   * name 是给人看的、meta 是给程序看的：JSON 与 Markdown 记的是文件，name 就是文件名，两者合一；
   * Transform 的输入没有文件名，name 是「JSON 转 YAML」这种转换器名（重复出现很正常），
   * 得另有一个 meta 记转换器 key，点历史时才知道该切回哪个转换器。
   */
  meta?: string
  /**
   * 这份文档当初是从哪个本地文件来的（`file://` 地址）：Markdown / JSON 从地址栏 `?file=`
   * 打开时记下。Markdown 回填时跟着回来，于是「保存」还能问一句要不要写回源文件
   * （见 tools/Markdown/lib/writeBack.ts）；两个工具都靠它在内容过大没留下来时重新读取。
   * 不进去重键：同一个文件名还是同一条历史，只是内容换成了新来源。
   */
  source?: string
}

function bytesOf(text: string): number {
  return new Blob([text]).size
}

/**
 * 写一条历史时的附带信息，都是选填。
 *
 * 参数越长越容易写错位置（`add(items, name, content, undefined, undefined, url)` 这种），
 * 而这三样平时都用不上，所以合成一个袋子传。
 */
export interface HistoryExtra {
  /** 记录时间，默认当下；测试里要固定时间 */
  now?: number
  /** 程序标识，见 HistoryItem.meta */
  meta?: string
  /** 源文件链接，见 HistoryItem.source */
  source?: string
}

/**
 * 不去重的写入：一条就是一条。
 *
 * Transform 的每次转换都是独立记录 —— 同一个转换器粘十份不同的 JSON 该留十条，
 * 不该像「同一个文件存两次」那样只剩最后一条。
 */
export function prependHistoryEntry(
  items: HistoryItem[],
  name: string,
  content: string,
  { now = Date.now(), meta, source }: HistoryExtra = {},
): HistoryItem[] {
  const item: HistoryItem = {
    id: `${now}-${meta ?? name}`,
    name,
    content: bytesOf(content) > MAX_CONTENT_BYTES ? '' : content,
    time: now,
  }
  if (meta) item.meta = meta
  if (source) item.source = source
  if (!item.content) item.contentOmitted = true

  return [item, ...items].slice(0, LIMIT)
}

/** 新记录插最前，同名替换（原项目是按文件路径去重），超出上限截断。去重键是 `meta ?? name` */
export function addHistoryEntry(
  items: HistoryItem[],
  name: string,
  content: string,
  extra: HistoryExtra = {},
): HistoryItem[] {
  const key = extra.meta ?? name
  return prependHistoryEntry(
    items.filter((entry) => (entry.meta ?? entry.name) !== key),
    name,
    content,
    extra,
  )
}

export function removeHistoryEntry(items: HistoryItem[], id: string): HistoryItem[] {
  return items.filter((item) => item.id !== id)
}

export interface HistoryStore {
  read: () => HistoryItem[]
  write: (items: HistoryItem[]) => void
  add: (items: HistoryItem[], name: string, content: string, extra?: HistoryExtra) => HistoryItem[]
  /** 不去重的版本，语义见 prependHistoryEntry */
  prepend: (items: HistoryItem[], name: string, content: string, extra?: HistoryExtra) => HistoryItem[]
  remove: (items: HistoryItem[], id: string) => HistoryItem[]
}

/**
 * 一个工具一份存储：键不一样，读写逻辑一模一样。
 *
 * 「存档读档都别让历史坏掉或被历史拖垮」——解析失败当空历史，写不进去就丢掉最旧的再试，
 * 这些是调出来的，所以两处用同一份实现而不是各写一遍。
 */
export function createHistoryStore(storageKey: string): HistoryStore {
  const read = (): HistoryItem[] => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter(
          (item): item is HistoryItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as HistoryItem).id === 'string' &&
            typeof (item as HistoryItem).name === 'string',
        )
        .slice(0, LIMIT)
    } catch {
      return []
    }
  }

  const write = (items: HistoryItem[]): void => {
    let pending = items
    // 配额不够时从最旧的开始丢；丢光了还写不进去就放弃，历史功能不该把工具拖死
    for (;;) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(pending))
        return
      } catch {
        if (pending.length === 0) return
        pending = pending.slice(0, -1)
      }
    }
  }

  return { read, write, add: addHistoryEntry, prepend: prependHistoryEntry, remove: removeHistoryEntry }
}
