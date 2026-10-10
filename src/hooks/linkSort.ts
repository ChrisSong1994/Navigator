import { createContext, useContext } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface DropTarget {
  groupId: string
  index: number
}

export interface LinkSortValue {
  /** 搜索过滤时关闭拖拽：此时列出来的是子集，下标和真实配置对不上 */
  sortable: boolean
  /** 正被拖起来的那一条 */
  dragging: DropTarget | null
  /** 指针当前压住的那一条，用来画落点高亮 */
  over: DropTarget | null
  startPress: (event: ReactPointerEvent<HTMLElement>, groupId: string, index: number) => void
  /** 刚拖完的那一下 click 要吞掉，否则松手就跳转 */
  swallowClick: () => boolean
}

const defaultValue: LinkSortValue = {
  sortable: false,
  dragging: null,
  over: null,
  startPress: () => undefined,
  swallowClick: () => false,
}

/**
 * 拖拽排序的 context。注意：消费它的组件会随着拖拽高亮一起重渲染，
 * 所以单条链接（LinkItem）不直接订阅，而是由分组视图订阅后把 isOver / isDragged 当 props 传下去，
 * memo 才能挡住其余 1000+ 条链接的重渲染。
 */
export const LinkSortContext = createContext<LinkSortValue>(defaultValue)

export function useLinkSort(): LinkSortValue {
  return useContext(LinkSortContext)
}
