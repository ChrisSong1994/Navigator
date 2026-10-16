import type { RefObject } from 'react'

/**
 * 自动聚焦：光标在源码里挪到哪个节点，树就把那个节点滚进视野。
 *
 * 树的渲染是深度优先的，「光标落在哪个节点上」是每个 Element 各自算出来的
 * （isInRange / hasChildrenInRange），所以没法自上而下发号施令：
 * 每个命中的叶子在 render 里把自己登记进来（'add'），树滚一次（'focus'）。
 *
 * 一次只有一个节点命中时直接滚它；命中多个（光标落在某层边界上）时挑离视野中心最近的那个。
 */

let nodes: Set<RefObject<HTMLElement>>

export default function focusNodes(message: 'init' | 'add' | 'focus', arg?: any): void {
  switch (message) {
    case 'init':
      nodes = new Set()
      break

    case 'add':
      if (nodes) nodes.add(arg)
      break

    case 'focus': {
      const root = arg?.current as HTMLElement | null
      if (!root || !nodes) return

      if (nodes.size === 1) {
        nodes.values().next().value?.current?.scrollIntoView()
        return
      }
      if (nodes.size <= 1) return

      const rootRect = root.getBoundingClientRect()
      const center = (rootRect.y + rootRect.height) / 2 + rootRect.y

      let closest: [HTMLElement, number] | null = null
      for (const ref of nodes) {
        if (!ref.current) continue
        const rect = ref.current.getBoundingClientRect()
        const distance = rect.y - center
        const minDistance = Math.min(Math.abs(distance), Math.abs(distance + rect.height))
        if (!closest || closest[1] > minDistance) {
          closest = [ref.current, minDistance]
        }
      }
      closest?.[0].scrollIntoView()
      break
    }
  }
}
