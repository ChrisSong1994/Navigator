import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * 被点中的节点。
 *
 * 点击树上的节点会把它挂到 `window.$node` 上（原版如此），方便在控制台里接着扒 ——
 * 这是 AST 浏览器最常用的动作。同时挂在 context 里，是为了让「当前选中的那个」在树上显示 = $node。
 */

type SetSelectedNode = (node: unknown, cb?: () => void) => void

const SelectedNodeContext = createContext<SetSelectedNode | null>(null)

export function useSelectedNode(): SetSelectedNode {
  const context = useContext(SelectedNodeContext)
  if (!context) {
    throw new Error('useSelectedNode 必须放在 SelectedNodeProvider 里')
  }
  return context
}

let unselectCallback: (() => void) | null = null

function setSelectedNode(node: unknown, cb?: () => void): void {
  // 换选之前先把上一个的选中态清掉
  unselectCallback?.()

  if (node) {
    ;(window as unknown as { $node?: unknown }).$node = node
    unselectCallback = cb ?? null
  } else {
    unselectCallback = null
    delete (window as unknown as { $node?: unknown }).$node
  }
}

export function SelectedNodeProvider({ children }: { children: ReactNode }) {
  return (
    <SelectedNodeContext.Provider value={setSelectedNode}>{children}</SelectedNodeContext.Provider>
  )
}
