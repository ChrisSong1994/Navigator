import { useEffect, useRef, useState } from 'react'

/**
 * 整窗拖入文件：拖到窗口里任何地方都算数（不是只有某一块落点），返回「正在拖」给遮罩用。
 *
 * 两个地方挂它：Markdown 工具页（拖进来就渲染这份文档）和首页（拖进来直接进 Markdown 演示模式）。
 * 首页那份靠 `enabled` 在工具页打开时关掉 —— 不然窗口上两套监听同时在，工具里拖入会顺带触发首页的「换工具」。
 *
 * 三个要点：
 *
 * 1. **捕获阶段监听**。编辑器里的 CodeMirror 自己会处理拖拽事件，冒泡阶段未必轮得到我们；
 *    捕获阶段还能顺手 preventDefault 掉浏览器「拿这个文件打开新页面」的默认行为。
 * 2. **只认文件拖拽**。`dataTransfer.types` 里没有 `Files` 的一律不理 —— 在编辑器里选中一段文字
 *    拖动、拖链接、拖浏览器标签都会派发 drag 事件，不挡的话遮罩会莫名其妙地亮。
 * 3. **进出计数**。dragover / dragleave 会对着子元素反复触发，靠一次 dragleave 收遮罩会闪；
 *    另外拖出窗口时最外层不一定会派发 dragleave（`relatedTarget` 为 null 就是真出去了）。
 *
 * 收不收这个文件由调用方说了算（`accept`），判定要等 `drop` 才有文件名：
 * 拖动过程中浏览器只肯说「有文件」，`.md` 还是 `.png` 是落地才知道的。
 */
export function useWindowFileDrop({
  enabled = true,
  accept,
  onFile,
  onReject,
}: {
  /** 关掉时不挂监听、遮罩也归零（首页在工具页打开时就是这么关的） */
  enabled?: boolean
  /** 不传就是全收。返回 false 的文件交给 onReject（没传 onReject 就只当没发生） */
  accept?: (file: File) => boolean
  onFile: (file: File) => void
  onReject?: (file: File) => void
}): boolean {
  const [dragging, setDragging] = useState(false)

  /*
   * 关掉的那一刻把遮罩收回（否则下次回到首页会顶着一块没人拖的遮罩）。
   * 放在渲染期就地改而不是 effect 里：effect 里 setState 会引出一次级联渲染，lint 也拦这种写法。
   * 上面那句判断同时就是收敛条件 —— 改完 dragging 是 false，不会再进来。
   */
  if (!enabled && dragging) setDragging(false)

  // 回调每次渲染都是新的，又不想因为它换掉监听（换的那一下正好落下的文件会漏掉），走 ref 读最新的
  const handlers = useRef({ accept, onFile, onReject })
  useEffect(() => {
    handlers.current = { accept, onFile, onReject }
  })

  useEffect(() => {
    if (!enabled) return

    let depth = 0

    const carriesFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const handleEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth += 1
      setDragging(true)
    }

    const handleOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      // 不拦默认行为的话 drop 根本不会派发到页面上
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0 || event.relatedTarget === null) {
        depth = 0
        setDragging(false)
      }
    }

    const handleDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)

      // 多文件只取第一个，原项目的拖拽也是这个规矩
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      if (handlers.current.accept && !handlers.current.accept(file)) {
        handlers.current.onReject?.(file)
        return
      }
      handlers.current.onFile(file)
    }

    // capture=true：见上面第 1 条
    const options = { capture: true } as const
    window.addEventListener('dragenter', handleEnter, options)
    window.addEventListener('dragover', handleOver, options)
    window.addEventListener('dragleave', handleLeave, options)
    window.addEventListener('drop', handleDrop, options)
    return () => {
      window.removeEventListener('dragenter', handleEnter, options)
      window.removeEventListener('dragover', handleOver, options)
      window.removeEventListener('dragleave', handleLeave, options)
      window.removeEventListener('drop', handleDrop, options)
    }
  }, [enabled])

  return enabled && dragging
}
