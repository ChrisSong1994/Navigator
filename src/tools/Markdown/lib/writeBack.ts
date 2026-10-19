/**
 * 把编辑中的内容写回它原来那个本地文件（`file://` 打开的那份）。
 *
 * 浏览器里没有「按路径写文件」这回事：扩展拿不到路径，`fetch(file://…, { method: 'PUT' })`
 * 看着返回 200，磁盘上一个字节都没动（试过）。能写的只有 `FileSystemFileHandle`，
 * 而句柄只能从系统保存框里拿到 —— 也就是用户在那一刻亲眼选定了哪个文件。
 * 于是两条路：
 *
 * 1、手上已经有句柄（上次写回时记下的，见 lib/sourceHandle.ts）→ 申请写权限后直接写；
 * 2、没有 → 弹一次系统保存框让用户选定那个文件，写进去，并把句柄记下来，下次走上面那条。
 *
 * 客户端里只有「要不要弹框」这点差别，所以对外就是一个 writeIntoHandle 加一个 pickAndWrite。
 */
import { pickSaveHandle } from '../../../lib/file.ts'
import { MARKDOWN_FILE_KIND } from './kind.ts'

export type WriteResult =
  | { status: 'written'; name: string; handle: FileSystemFileHandle }
  /** 用户在系统保存框里点了取消：什么都没发生，不必吭声 */
  | { status: 'cancelled' }
  /** 句柄不能用了：文件被删 / 挪走 / 权限没给。调用方该把它忘掉，改用另存为 */
  | { status: 'blocked' }
  /** 浏览器没有文件写入这套 API（Firefox 就没有） */
  | { status: 'unsupported' }
  | { status: 'failed'; reason: string }

/** 这些错都意味着「这个句柄废了」，不是「这次写失败了」 */
const DEAD_HANDLE_ERRORS = new Set(['NotFoundError', 'NotAllowedError', 'SecurityError'])

/**
 * 句柄现在有没有写权限。
 *
 * 刚选中的句柄直接就是 granted；从 IndexedDB 里翻出来的是要重新申请的（Chrome 会弹一次
 * 「允许写入」）—— 这也是为什么第一次写回之后才真的不用再管，见 lib/sourceHandle.ts。
 */
async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const target = handle as FileSystemFileHandle & {
    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  // 没有这套 API 的实现：能拿到句柄就说明用户许过了
  if (!target.queryPermission || !target.requestPermission) return true
  try {
    if ((await target.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    return (await target.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/** 写回手上这个句柄 */
export async function writeIntoHandle(
  handle: FileSystemFileHandle,
  content: string,
): Promise<WriteResult> {
  if (!(await ensureWritePermission(handle))) return { status: 'blocked' }
  try {
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return { status: 'written', name: handle.name, handle }
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    if (name && DEAD_HANDLE_ERRORS.has(name)) return { status: 'blocked' }
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 弹一次系统保存框选定文件再写进去。第一次写回源文件、以及「另存为…」都走这里 ——
 * 对用户来说是两件事，对浏览器来说都是「选个文件写进去」。
 */
export async function pickAndWrite(content: string, suggestedName: string): Promise<WriteResult> {
  const handle = await pickSaveHandle(suggestedName, MARKDOWN_FILE_KIND)
  if (handle === null) return { status: 'cancelled' }
  if (handle === undefined) return { status: 'unsupported' }
  return writeIntoHandle(handle, content)
}
