/**
 * 搜索时的节点高亮：直接操作 DOM，因为命中的是画布渲染出来的 foreignObject。
 * 竖着搬自 developer-assistant 的 GraphView/lib/utils/search.ts。
 */

export const searchQuery = (param: string) => {
  return document.querySelectorAll(param)
}

export const cleanupHighlight = () => {
  const nodes = document.querySelectorAll('foreignObject.searched, .highlight')
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    node.classList.remove('searched', 'highlight')
  }
}

export const highlightMatchedNodes = (nodes: NodeListOf<Element>, selectedNode: number) => {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const foreignObject = node.parentElement?.closest('foreignObject')
    if (foreignObject) foreignObject.classList.add('searched')
  }

  nodes[selectedNode]?.classList.add('highlight')
}
