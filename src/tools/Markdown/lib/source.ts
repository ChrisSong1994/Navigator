/**
 * 地址栏 `?file=` 送过来的那份本地文档。
 *
 * 扩展把浏览器里的 file:// 导航拦下来（见 public/service_worker.js），整页换成
 * `index.html?tool=markdown&file=<文件地址>`，正文到这里才去读。于是「打开本机的 .md」和
 * 「拖一份 .md 进来」在工具里走的是同一条路：读一份文件、写历史、切演示模式。
 *
 * 读这件事只有扩展态做得到，而且要求扩展拿到了 file:///* 的访问权、用户那边的
 * 「允许访问文件网址」也是开的（chrome://extensions → 本扩展详情）。读不到不额外处理：
 * 页面已经跳过来了，退回原生页面没意义 —— 给一句能照着修的说明就好（READ_FILE_HINT）。
 *
 * 地址里的文件在磁盘上改了，刷新页面就能看到新的：参数一直留在地址栏里（见 index.tsx 里
 * 什么时候才把它摘掉）。代价是浏览器后退会退回那个 file:// 地址、又被扩展换回来。
 */
import type { PickedFile } from '../../../lib/file.ts'

/** 读不到文件时空态里那句话。两种原因都会落到这儿：没开文件访问权、或者文件不在原处了 */
export const READ_FILE_HINT =
  '读不到这份文件。如果是本机上的文件，请在 chrome://extensions 的扩展详情里打开「允许访问文件网址」；也可能是它被移走或改名了。'

/** 拿不到文件名时的兜底（地址最后一段是空的，或者那份文件本来就没有名字） */
const FALLBACK_NAME = '未命名文档'

/**
 * 文件名从地址里取：最后一段，并去掉百分号转义。
 * `file:///Users/me/%E8%AE%BE%E8%AE%A1.md` → `设计.md`
 */
export function fileNameFromUrl(address: string): string {
  const path = address.split(/[?#]/)[0]
  const segment = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(segment) || FALLBACK_NAME
  } catch {
    // 参数里有截断的百分号转义（`%E8` 这种半截的），decodeURIComponent 会抛；
    // 一个名字不值得把整次打开弄失败，原样用
    return segment || FALLBACK_NAME
  }
}

/**
 * 把地址里的那份文件读成一份文档。
 *
 * 只认 file://：这个参数本来是扩展自己挂上去的，但从地址栏手改一个出来也不该让扩展页面
 * 变成本机文件之外的取数口子（扩展的 host_permissions 里还有几个搜索站）。
 */
export async function readUrlDocument(address: string): Promise<PickedFile> {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new Error('这个地址读不了')
  }
  if (url.protocol !== 'file:') throw new Error('这里只打开本机文件')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`读取文件失败：HTTP ${response.status}`)
  return { name: fileNameFromUrl(address), content: await response.text() }
}
