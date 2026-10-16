/**
 * 结构图的状态（zustand）。
 *
 * 原项目这份 store 是从 JSON Crack 整包抄来的，里面一大半字段（selectedNode / fullscreen /
 * path / setZoomFactor / clearGraph …）在这个项目里只有注释掉的代码引用过，所以只搬真正用到的。
 *
 * 另外原项目的 setGraph 在节点数超限时只是提前 return，nodes 会留着上一份图的旧数据；
 * 这里顺手把它清空，再给上层一个 aboveSupportedLimit 好提示用户。
 */
import { create } from 'zustand'
import type { CanvasDirection } from 'reaflow'
import type { ViewPort } from 'react-zoomable-ui'

import { SUPPORTED_LIMIT } from '../constants.ts'
import type { EdgeData, NodeData } from '../types.ts'
import { parser } from '../lib/jsonParser.ts'

export interface Graph {
  viewPort: ViewPort | null
  direction: CanvasDirection
  loading: boolean
  nodes: NodeData[]
  edges: EdgeData[]
  aboveSupportedLimit: boolean
}

interface GraphActions {
  setGraph: (json?: string) => void
  setLoading: (loading: boolean) => void
  setDirection: (direction: CanvasDirection) => void
  setViewPort: (viewPort: ViewPort) => void
  focusFirstNode: () => void
  zoomIn: () => void
  zoomOut: () => void
  centerView: () => void
}

const useGraph = create<Graph & GraphActions>((set, get) => ({
  viewPort: null,
  direction: 'RIGHT',
  loading: true,
  nodes: [],
  edges: [],
  aboveSupportedLimit: false,

  setGraph: (data) => {
    if (!data) {
      set({ nodes: [], edges: [], aboveSupportedLimit: false, loading: false })
      return
    }

    const { nodes, edges } = parser(data)

    if (nodes.length > SUPPORTED_LIMIT) {
      set({ nodes: [], edges: [], aboveSupportedLimit: true, loading: false })
      return
    }

    set({ nodes, edges, aboveSupportedLimit: false })
  },

  setLoading: (loading) => set({ loading }),
  setViewPort: (viewPort) => set({ viewPort }),

  setDirection: (direction = 'RIGHT') => {
    set({ direction })
    // 换方向之后 ELK 要重排，等它画完再对齐视口（原项目也是等 200ms）
    setTimeout(() => get().centerView(), 200)
  },

  focusFirstNode: () => {
    const rootNode = document.querySelector("g[id$='node-1']")
    get().viewPort?.camera?.centerFitElementIntoView(rootNode as HTMLElement, {
      elementExtraMarginForZoom: 100,
    })
  },

  zoomIn: () => {
    const { viewPort } = get()
    viewPort?.camera?.recenter(viewPort.centerX, viewPort.centerY, viewPort.zoomFactor + 0.1)
  },

  zoomOut: () => {
    const { viewPort } = get()
    viewPort?.camera?.recenter(viewPort.centerX, viewPort.centerY, viewPort.zoomFactor - 0.1)
  },

  centerView: () => {
    const { viewPort } = get()
    viewPort?.updateContainerSize()

    const canvas = document.querySelector('.jsongraph-canvas') as HTMLElement | null
    if (canvas) viewPort?.camera?.centerFitElementIntoView(canvas)
  },
}))

export default useGraph
