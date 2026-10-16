import React from 'react'
import { Edge } from 'reaflow'
import type { EdgeProps } from 'reaflow'

import useGraph from '../stores/useGraph.ts'
import { useColorScheme } from '../hooks/useColorScheme.ts'

/** 连线：点一下跳到它指向的节点；悬停变蓝 */
const CustomEdgeWrapper = (props: EdgeProps) => {
  const colorScheme = useColorScheme()
  const viewPort = useGraph((state) => state.viewPort)
  const edges = useGraph((state) => state.edges)
  const [hovered, setHovered] = React.useState(false)

  const handleClick = () => {
    const targetNodeId = edges.find((edge) => edge.id === props.properties?.id)?.to
    const targetNodeDom = document.querySelector(
      `[data-id$="node-${targetNodeId}"]`,
    ) as HTMLElement | null
    if (targetNodeDom?.parentElement) {
      viewPort?.camera.centerFitElementIntoView(targetNodeDom.parentElement, {
        elementExtraMarginForZoom: 150,
      })
    }
  }

  return (
    <Edge
      containerClassName={`edge-${props.id}`}
      onClick={handleClick}
      onEnter={() => setHovered(true)}
      onLeave={() => setHovered(false)}
      style={{
        stroke: colorScheme === 'dark' ? '#444444' : '#BCBEC0',
        ...(hovered && { stroke: '#3B82F6' }),
        strokeWidth: 1.5,
      }}
      {...props}
    />
  )
}

export const CustomEdge = React.memo(CustomEdgeWrapper)
