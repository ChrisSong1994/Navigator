import { createContext, useContext } from 'react'

export interface LinkSortSnapshot {
  /** 正在被拖动的条目 id；没有则为空 */
  activeId: string | null
}

const defaultValue: LinkSortSnapshot = { activeId: null }

export const LinkSortContext = createContext(defaultValue)

/** 链接项通过它读取拖拽状态，避免直接订阅 dnd-kit 的全局更新 */
export function useLinkSortSnapshot(): LinkSortSnapshot {
  return useContext(LinkSortContext)
}
