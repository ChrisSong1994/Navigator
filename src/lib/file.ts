/**
 * 文件导入 / 保存。原项目这两件事走 Electron（Events.getFileFromLocalPath / saveFileToLocal + 文件路径），
 * 浏览器里对应的是 <input type="file"> 和 File System Access API（不支持时退到 <a download>）。
 *
 * 路径在这里是拿不到也留不住的，所以历史记录改成存内容，见 ./history.ts。
 *
 * JSON 与 Markdown 共用这一份，各自的 accept / 类型描述 / MIME / 后缀当参数传进来。
 */

export interface PickedFile {
  name: string
  content: string
}

export interface SavedFile {
  name: string
}

export interface TextFileKind {
  /** 文件选择框的 accept 串 */
  accept: string
  /** 保存对话框里那句类型描述，比如「JSON 文件」 */
  description: string
  /** Blob 的 MIME */
  mime: string
  /** 没有后缀的建议名用得上，比如 Untitled + .md */
  extension: string
}

/** 保存对话框的取消；Chrome 抛 AbortError，别的实现可能抛别的 */
function isAbort(error: unknown): boolean {
  return (error as DOMException | undefined)?.name === 'AbortError'
}

/**
 * 弹系统文件选择框。用户取消时 change 事件不会触发，只能靠窗口重新获得焦点来判断——
 * 拿到焦点后再等一小会儿，能选中文件的路径下 change 会先到。
 */
export function pickTextFile(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept

    let settled = false
    const finish = (value: PickedFile | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve(value)
    }
    const handleFocus = () => {
      setTimeout(() => finish(null), 300)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      void file.text().then((content) => finish({ name: file.name, content }))
    })
    window.addEventListener('focus', handleFocus, { once: true })
    input.click()
  })
}

/** 拖进编辑器或直接被别的按钮调用：File 已经在手上，不用再弹选择框 */
export async function readDroppedFile(file: File): Promise<PickedFile> {
  return { name: file.name, content: await file.text() }
}

function downloadText(content: string, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // 交出去之后再撤销，太早会让下载拿不到内容
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

interface SaveFilePickerOptions {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}

declare global {
  interface Window {
    showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

/**
 * 保存成文件。优先用系统保存框（能拿到用户取的名字，正好记进历史）；
 * 用户点了取消就返回 null（不写历史）；不支持这个 API 就退到下载，用建议名记历史。
 */
export async function saveTextFile(
  content: string,
  suggestedName: string,
  kind: TextFileKind,
): Promise<SavedFile | null> {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: kind.description,
            accept: { [kind.mime]: [kind.extension] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return { name: handle.name }
    } catch (error) {
      if (isAbort(error)) return null
      // 别的情况（比如权限策略拦下了）落下去走下载
    }
  }

  downloadText(content, suggestedName, kind.mime)
  return { name: suggestedName }
}
