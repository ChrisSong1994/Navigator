/**
 * 工具的历史记录（存内容型）。JSON 与 Markdown 两个工具共用，各自的 localStorage 键不同。
 *
 * 原项目把历史交给 Electron 的 userData：一条记录是「文件路径 + 名字 + 时间」，点一下按路径回读文件。
 * 浏览器里既拿不到路径、也不能凭路径重读，所以这里改成**存内容**：点一下把内容灌回编辑器。
 *
 * 代价是 localStorage 那 5MB 的配额。所以：单条过大就只留名字和时间（内容留空、界面上禁用），
 * 整块写不进去就从最旧的开始砍，直到写得进去 —— 宁可少记几条，不能让历史读写把工具搞崩。
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
}

function bytesOf(text: string): number {
  return new Blob([text]).size
}

/** 新记录插最前，同名替换（原项目是按文件路径去重），超出上限截断 */
export function addHistoryEntry(
  items: HistoryItem[],
  name: string,
  content: string,
  now = Date.now(),
): HistoryItem[] {
  const item: HistoryItem = {
    id: `${now}-${name}`,
    name,
    content: bytesOf(content) > MAX_CONTENT_BYTES ? '' : content,
    time: now,
  }
  if (!item.content) item.contentOmitted = true

  return [item, ...items.filter((entry) => entry.name !== name)].slice(0, LIMIT)
}

export function removeHistoryEntry(items: HistoryItem[], id: string): HistoryItem[] {
  return items.filter((item) => item.id !== id)
}

export interface HistoryStore {
  read: () => HistoryItem[]
  write: (items: HistoryItem[]) => void
  add: (items: HistoryItem[], name: string, content: string, now?: number) => HistoryItem[]
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

  return { read, write, add: addHistoryEntry, remove: removeHistoryEntry }
}
