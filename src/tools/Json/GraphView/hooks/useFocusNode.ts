import { useEffect, useState } from 'react'

import useGraph from '../stores/useGraph.ts'
import { cleanupHighlight, highlightMatchedNodes, searchQuery } from '../lib/utils/search.ts'
import { useDebouncedValue } from './useDebouncedValue.ts'

/**
 * 画布上的节点搜索。
 * 竖着搬自 developer-assistant 的 GraphView/hooks/useFocusNode.ts，只把 Mantine 的
 * useDebouncedValue 换成本项目自己的实现（这里返回单个值，不返回元组）。
 */
export function useFocusNode() {
  const viewPort = useGraph((state) => state.viewPort)
  const [selectedNode, setSelectedNode] = useState(0)
  const [nodeCount, setNodeCount] = useState(0)
  const [value, setValue] = useState('')
  const debouncedValue = useDebouncedValue(value, 600)

  /** Enter 换下一个命中节点 */
  const skip = () => setSelectedNode((current) => (current + 1) % nodeCount)

  useEffect(() => {
    if (!value) {
      cleanupHighlight()
      setSelectedNode(0)
      setNodeCount(0)
      return
    }

    if (!viewPort || !debouncedValue) return
    // 画布上的值都渲染在 span[data-key] 上，用属性选择器找
    const matchedNodes: NodeListOf<Element> = searchQuery(`span[data-key*='${debouncedValue}' i]`)
    const matchedNode: Element | null = matchedNodes[selectedNode] || null

    cleanupHighlight()

    if (matchedNode?.parentElement) {
      highlightMatchedNodes(matchedNodes, selectedNode)
      setNodeCount(matchedNodes.length)

      viewPort.camera.centerFitElementIntoView(matchedNode.parentElement, {
        elementExtraMarginForZoom: 400,
      })
    } else {
      setSelectedNode(0)
      setNodeCount(0)
    }
  }, [selectedNode, debouncedValue, value, viewPort])

  return [value, setValue, skip, nodeCount, selectedNode] as const
}
