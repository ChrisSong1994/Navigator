/**
 * 颜色记录。
 *
 * 原版把记录塞进 Electron 的 userData（`localData.color`），浏览器里换成 localStorage ——
 * 跟 `Json/lib/history.ts` 一个路子：解析失败当空列表，写不进去就认了（配额满了不该把工具带进沟里）。
 *
 * 一条记录就是一个色值 + 一个可改的名字，几十字节，所以不像 JSON 历史那样设上限。
 * 增删改是纯函数，localStorage 那两句单独放着，好让 `scripts/check-tools.mjs` 能直接测。
 */

const STORAGE_KEY = 'navigator.color.records'

export interface ColorRecord {
  key: string
  value: string
  title: string
}

let idSeq = 0

/** 原版是 @fett/utils 的 genTimeBasedId：时间戳 36 进制 + 自增序，同一毫秒里连点也不会撞 */
export function nextRecordId(now = Date.now()): string {
  idSeq += 1
  return `${now.toString(36)}-${idSeq.toString(36)}`
}

/** 新记录追加在末尾（原版也是往后加，界面上看着就是「按记录顺序排」） */
export function addRecord(items: ColorRecord[], hex: string, now = Date.now()): ColorRecord[] {
  return [...items, { key: nextRecordId(now), value: hex, title: hex }]
}

export function removeRecord(items: ColorRecord[], key: string): ColorRecord[] {
  return items.filter((item) => item.key !== key)
}

export function renameRecord(items: ColorRecord[], key: string, title: string): ColorRecord[] {
  return items.map((item) => (item.key === key ? { ...item, title } : item))
}

/** 读档：坏的、不是数组的、字段不全的，一律当没记录 */
export function readRecords(): ColorRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ColorRecord =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as ColorRecord).key === 'string' &&
        typeof (item as ColorRecord).value === 'string' &&
        typeof (item as ColorRecord).title === 'string',
    )
  } catch {
    return []
  }
}

/** 存档：写不进去（比如配额满）就别抛，记录留在这一屏里还能用 */
export function writeRecords(items: ColorRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (error) {
    console.warn('颜色记录写入失败', error)
  }
}
