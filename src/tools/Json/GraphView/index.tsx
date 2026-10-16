import React, { useEffect, useMemo, useState } from 'react'
import { Empty, Spin } from 'antd'
import { Canvas } from 'reaflow'
import type { ElkRoot } from 'reaflow'
import { Space } from 'react-zoomable-ui'
import styled from 'styled-components'
import { useLongPress } from 'use-long-press'

import { SUPPORTED_LIMIT } from './constants.ts'
import { CustomEdge } from './CustomEdge/index.tsx'
import { CustomNode } from './CustomNode/index.tsx'
import { ZoomControl } from './ZoomControl.tsx'
import ScreenAction from './ScreenAction.tsx'
import useGraph from './stores/useGraph.ts'
import { useColorScheme } from './hooks/useColorScheme.ts'
import { useDebouncedValue } from './hooks/useDebouncedValue.ts'
import { debounce } from '../lib/util.ts'

/**
 * JSON 结构图（reaflow + ELK 布局）。
 * 竖着搬自 developer-assistant 的 GraphView/index.tsx：Mantine 的 MantineProvider / Box /
 * LoadingOverlay 换成 antd 的 Spin / Empty，配色换成 Json.css 里的 --json-tool-graph-*，
 * 尺寸也不再写死「100vh - 100px」，交给外层 .json-tool-graph 撑。
 */
const StyledEditorWrapper = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;

  background-color: var(--json-tool-graph-canvas);
  background-image: linear-gradient(var(--json-tool-graph-line-1) 1.5px, transparent 1.5px),
    linear-gradient(90deg, var(--json-tool-graph-line-1) 1.5px, transparent 1.5px),
    linear-gradient(var(--json-tool-graph-line-2) 1px, transparent 1px),
    linear-gradient(90deg, var(--json-tool-graph-line-2) 1px, transparent 1px);
  background-position: -1.5px -1.5px, -1.5px -1.5px, -1px -1px, -1px -1px;
  background-size: 100px 100px, 100px 100px, 20px 20px, 20px 20px;

  :active {
    cursor: move;
  }

  /* 长按拖动时先别响应按钮，免得一按就点开了 */
  .dragging,
  .dragging button {
    pointer-events: none;
  }

  text {
    fill: var(--json-tool-graph-text) !important;
  }

  rect {
    fill: var(--json-tool-graph-node);
  }
`

const layoutOptions = {
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
}

const GraphCanvas = (props: { value: string }) => {
  const setGraph = useGraph((state) => state.setGraph)
  const setLoading = useGraph((state) => state.setLoading)
  const centerView = useGraph((state) => state.centerView)
  const direction = useGraph((state) => state.direction)
  const nodes = useGraph((state) => state.nodes)
  const edges = useGraph((state) => state.edges)
  const colorScheme = useColorScheme()
  const [paneWidth, setPaneWidth] = useState(2000)
  const [paneHeight, setPaneHeight] = useState(2000)

  useEffect(() => {
    setGraph(props.value)
  }, [props.value, setGraph])

  const onLayoutChange = React.useCallback(
    (layout: ElkRoot) => {
      if (layout.width && layout.height) {
        const areaSize = layout.width * layout.height
        // 新图和旧图占的面积差太多，说明布局整个变了，得重新居中
        const changeRatio = Math.abs((areaSize * 100) / (paneWidth * paneHeight) - 100)

        setPaneWidth(layout.width + 50)
        setPaneHeight((layout.height as number) + 50)

        setTimeout(() => {
          window.requestAnimationFrame(() => {
            if (changeRatio > 70) centerView()
            setLoading(false)
          })
        })
      }
    },
    [paneHeight, paneWidth, centerView, setLoading],
  )

  return (
    <Canvas
      className="jsongraph-canvas"
      onLayoutChange={onLayoutChange}
      node={(p) => <CustomNode {...p} />}
      edge={(p) => <CustomEdge {...p} />}
      nodes={nodes}
      edges={edges}
      arrow={null}
      maxHeight={paneHeight}
      maxWidth={paneWidth}
      height={paneHeight}
      width={paneWidth}
      direction={direction}
      layoutOptions={layoutOptions}
      key={[direction, colorScheme].join('-')}
      pannable={false}
      zoomable={false}
      animated={false}
      readonly={true}
      dragEdge={null}
      dragNode={null}
      fit={true}
    />
  )
}

export function GraphView({ value }: { value: string }) {
  const setViewPort = useGraph((state) => state.setViewPort)
  const viewPort = useGraph((state) => state.viewPort)
  const loading = useGraph((state) => state.loading)
  const nodes = useGraph((state) => state.nodes)
  const aboveSupportedLimit = useGraph((state) => state.aboveSupportedLimit)
  const debouncedLoading = useDebouncedValue(loading, 300)

  const bindLongPress = useLongPress(
    () => {
      document.querySelector('.jsongraph-canvas')?.classList.add('dragging')
    },
    {
      threshold: 150,
      onFinish: () => {
        document.querySelector('.jsongraph-canvas')?.classList.remove('dragging')
      },
    },
  )

  const blurOnClick = React.useCallback(() => {
    if ('activeElement' in document) (document.activeElement as HTMLElement)?.blur()
  }, [])

  // 视口动过之后把 viewPort 重新登记一次，节点搜索才知道往哪儿对焦（原项目同样，防抖 300ms）
  const onViewPortUpdated = useMemo(
    () =>
      debounce(() => {
        if (viewPort) setViewPort(viewPort)
      }, 300),
    [viewPort, setViewPort],
  )

  useEffect(() => () => onViewPortUpdated.cancel(), [onViewPortUpdated])

  const empty = nodes.length === 0

  return (
    <div id="jsongraph" className="json-tool-graph">
      {empty || aboveSupportedLimit ? (
        <div className="json-tool-graph-hint">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              aboveSupportedLimit ? `节点超过 ${SUPPORTED_LIMIT} 个，画不下` : '还没有可以画的节点'
            }
          />
        </div>
      ) : null}

      {!empty && debouncedLoading ? (
        <div className="json-tool-graph-loading">
          <Spin />
        </div>
      ) : null}

      <ZoomControl />
      <ScreenAction />

      <StyledEditorWrapper
        onContextMenu={(event) => event.preventDefault()}
        onClick={blurOnClick}
        {...bindLongPress}
      >
        <Space
          onUpdated={() => onViewPortUpdated()}
          onCreate={setViewPort}
          onContextMenu={(event) => event.preventDefault()}
          treatTwoFingerTrackPadGesturesLikeTouch
          pollForElementResizing
        >
          <GraphCanvas value={value} />
        </Space>
      </StyledEditorWrapper>
    </div>
  )
}
