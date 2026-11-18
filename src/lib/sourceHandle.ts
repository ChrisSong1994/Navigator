/**
 * 记住「这个 file:// 地址是磁盘上的哪个文件」，保存时才能直接写回去。Markdown 与 JSON 共用。
 *
 * 句柄（`FileSystemFileHandle`）可以塞进 IndexedDB 留着以后用 —— 结构化克隆认它 ——
 * 于是只有第一次要过系统保存框，之后点「写回源文件」直接写。
 *
 * 分两层存：
 * - IndexedDB 是记性，跨会话；
 * - 内存那份是为了「点保存那一瞬间要同步判断有没有句柄」：系统保存框和权限申请都要求用户手势，
 *   中间夹一个 IndexedDB 读就多一层不确定。打开文档时先捞好（preload），点的时候同步取（peek）。
 *
 * 记错了也不至于写坏文件：写之前用户还在系统框里亲眼看着是哪一份；句柄真失效了
 * （文件被删 / 权限被收回）writeIntoHandle 会返回 blocked，那时 forget 掉改走另存为。
 *
 * IndexedDB 用不了（隐私模式、被拦）就当没有记性：每次都过一遍系统框，功能一样。
 */
// 库名沿用 Markdown 时期的名字：两个工具共用一个库，换名字会让已经记下的句柄全部失效
const DB_NAME = 'navigator.markdown.sources'
const STORE_NAME = 'handles'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打不开 IndexedDB'))
  })
}

/** 一次操作开一次库：一天没几次，不值得做连接池。任何失败都当「没有记性」，别往上抛 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDatabase()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'))
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

const readHandle = (url: string) =>
  withStore<FileSystemFileHandle>('readonly', (store) => store.get(url))
const putHandle = (url: string, handle: FileSystemFileHandle) =>
  withStore('readwrite', (store) => store.put(handle, url))
const dropHandle = (url: string) =>
  withStore('readwrite', (store) => store.delete(url))

/** 文件所在目录（`file:///a/b/doc.md` → `file:///a/b/`）；不是本地文件地址就 null */
function directoryOf(address: string): string | null {
  try {
    const url = new URL(address)
    if (url.protocol !== 'file:') return null
    return new URL('.', url).href
  } catch {
    return null
  }
}

/**
 * 目录提示在存储里的 key。单独加前缀，和「文件地址 → 句柄」那些 key 区分开。
 * 记的是「这个目录里某个文件的句柄」—— 保存框拿到文件句柄会开在它的父目录，
 * 所以同目录里的任意一份文件都能当这个目录的定位器。
 */
const directoryKey = (directory: string) => `dir:${directory}`

export interface SourceHandleStore {
  /** 把记性里的句柄捞进内存。打开一份来自本地文件的文档时调一次 */
  preload: (url: string) => Promise<void>
  /** 现在手上有没有这份文件的句柄（同步，见文件头） */
  peek: (url: string) => FileSystemFileHandle | null
  /**
   * 同目录下别的文件记过的句柄（同步）。第一次写回时拿不到这份文件自己的句柄，
   * 但只要有同目录任意一份的，保存框就能精确开在这个目录（见 lib/file.ts 的 startIn）。
   */
  peekDirectory: (url: string) => FileSystemFileHandle | null
  /** 记下这个文件（用户刚在系统框里选定了它） */
  remember: (url: string, handle: FileSystemFileHandle) => void
  /** 忘掉它（句柄失效了，或者用户把这份文档另存到别处了） */
  forget: (url: string) => void
}

export function createSourceHandleStore(): SourceHandleStore {
  const memory = new Map<string, FileSystemFileHandle>()
  const directories = new Map<string, FileSystemFileHandle>()

  return {
    async preload(url) {
      const directory = directoryOf(url)
      // 这个文件自己的句柄
      if (!memory.has(url)) {
        const handle = await readHandle(url)
        if (handle) memory.set(url, handle)
      }
      // 同目录的定位提示：有它保存框才能开在源文件旁边
      if (directory && !directories.has(directory)) {
        const hint = await readHandle(directoryKey(directory))
        if (hint) directories.set(directory, hint)
      }
    },

    peek: (url) => memory.get(url) ?? null,

    peekDirectory(url) {
      const directory = directoryOf(url)
      return directory ? (directories.get(directory) ?? null) : null
    },

    remember(url, handle) {
      memory.set(url, handle)
      const directory = directoryOf(url)
      if (directory) {
        directories.set(directory, handle)
        void putHandle(directoryKey(directory), handle)
      }
      // 落盘失败只是下次要多弹一次系统框，不影响这次写回
      void putHandle(url, handle)
    },

    forget(url) {
      const forgotten = memory.get(url)
      memory.delete(url)
      void dropHandle(url)
      const directory = directoryOf(url)
      // 目录提示也记在同一份存储里：失效了就一直带着它，下次还得靠它定位 ——
      // 这里只在它指向的正是这份文件时一起清掉（别的文件写回时又会被重新记上）
      if (directory && forgotten && directories.get(directory) === forgotten) {
        directories.delete(directory)
        void dropHandle(directoryKey(directory))
      }
    },
  }
}
