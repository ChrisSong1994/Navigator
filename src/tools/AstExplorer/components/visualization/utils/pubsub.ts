/**
 * 树和源码编辑器之间的传话筒：树上悬停 → 源码高亮。
 *
 * 两边隔着一个 AST 面板和一个 monaco 实例，直接传 props 要穿过整棵树，
 * 所以用最小的一对订阅/发布。发布用 setTimeout 推后一拍（原版如此）：
 * 鼠标扫过树的时候每次 hover 都会发一次，同步回调会在事件处理里连着改 monaco 的装饰，
 * 推后一拍等于天然合并。
 */

export type Topic = 'HIGHLIGHT' | 'CLEAR_HIGHLIGHT'

export interface HighlightPayload {
  node: unknown
  range: [number, number]
}

type Handler = (data: any) => void
type Unsubscriber = () => void

const subscribers: Record<string, Handler[]> = {}

export function subscribe(topic: Topic, handler: Handler): Unsubscriber {
  const handlers = subscribers[topic] ?? (subscribers[topic] = [])
  if (handlers.indexOf(handler) === -1) {
    handlers.push(handler)
  }

  return () => {
    const index = handlers.indexOf(handler)
    if (index > -1) {
      handlers.splice(index, 1)
    }
  }
}

export function publish(topic: Topic, data?: HighlightPayload): void {
  if (!subscribers[topic]) {
    return
  }
  setTimeout(() => {
    // 这一拍之内可能已经退订了
    for (const handler of subscribers[topic] ?? []) {
      handler(data)
    }
  }, 0)
}
