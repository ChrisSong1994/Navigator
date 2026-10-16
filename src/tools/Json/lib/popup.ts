/**
 * 「弹出到独立窗口」与两个窗口之间的内容同步。
 *
 * 原项目走 Electron：Events.openToolWindow 在弹窗里塞一份快照，主窗口监听 'toolWindow:update' 收同步。
 * 浏览器里对应的是 window.open + BroadcastChannel —— 开发态（localhost）和扩展态（chrome-extension://）
 * 两个窗口都同源，BroadcastChannel 都通。
 *
 * 原项目还带一句「最多只能同时打开 3 个 JSON 窗口」，但它的分支顺序是先判已有窗口、再判数量，
 * 所以第二次点击永远是「已存在，已聚焦」，那条上限提示在实际操作里到不了。这里保留真正会发生的行为：
 * 一个弹窗窗口（固定窗口名，重复点击聚焦而不是再开一个），内容靠 BroadcastChannel 双向同步。
 */
import { TOOL_QUERY } from '../../query.ts'

/** 弹窗的窗口名。同名 window.open 会复用已存在的那个窗口 */
const WINDOW_NAME = 'navigator-json-popup'

const CHANNEL_NAME = 'navigator-json-tool'

/** 弹窗自己靠这个查询参数知道「我是那个弹出来的窗口」；开着哪个工具走 ?tool=（见 tools/query.ts） */
export const POPUP_QUERY = 'popup'

export interface ToolMessage {
  type: 'hello' | 'state' | 'update'
  value?: string
  name?: string | null
}

export interface Bridge {
  send: (message: ToolMessage) => void
  close: () => void
}

/** 当前页面是不是那个被弹出来的窗口 */
export function isPopupPage(): boolean {
  return new URLSearchParams(window.location.search).get(POPUP_QUERY) === '1'
}

export interface OpenPopupResult {
  status: 'opened' | 'focused' | 'blocked'
  window: Window | null
}

/** 我们开出去的那个弹窗；用来区分「新开一个」和「把已有的叫到前面」 */
let livePopup: Window | null = null

/** 打开（或聚焦）JSON 弹窗。返回值交给调用方决定弹哪句提示 */
export function openJsonPopup(): OpenPopupResult {
  if (livePopup && !livePopup.closed) {
    livePopup.focus()
    return { status: 'focused', window: livePopup }
  }

  // 不加 noopener：要留住返回的窗口引用才能调 focus
  const url = `${window.location.pathname}?${TOOL_QUERY}=json&${POPUP_QUERY}=1`
  const popup = window.open(url, WINDOW_NAME, 'popup=1,width=1100,height=800')
  if (!popup) return { status: 'blocked', window: null }

  livePopup = popup
  popup.focus()
  return { status: 'opened', window: popup }
}

/** 一端一个桥。同一个页面里开两个同名 BroadcastChannel 会收到两份消息，别重复建 */
export function createBridge(onMessage: (message: ToolMessage) => void): Bridge {
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<ToolMessage>) => {
    const data = event.data
    if (data && typeof data.type === 'string') onMessage(data)
  }
  return {
    send: (message) => channel.postMessage(message),
    close: () => {
      channel.onmessage = null
      channel.close()
    },
  }
}
