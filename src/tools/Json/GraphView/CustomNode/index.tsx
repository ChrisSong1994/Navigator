import React from 'react'
import { Node } from 'reaflow'
import type { NodeProps } from 'reaflow'

import type { NodeData } from '../types.ts'
import { ObjectNode } from './ObjectNode.tsx'
import { TextNode } from './TextNode.tsx'

export interface CustomNodeProps {
  node: NodeData
  x: number
  y: number
  hasCollapse?: boolean
}

/** 画布上的一个节点：第一行有 key 说明是对象（多行渲染），没有就是单个值 */
const CustomNodeWrapper = (nodeProps: NodeProps<NodeData>) => (
  <Node
    {...nodeProps}
    animated={false}
    label={null as never}
    onEnter={(ev) => {
      ev.currentTarget.style.stroke = '#3B82F6'
    }}
    onLeave={(ev) => {
      ev.currentTarget.style.stroke = '#BCBEC0'
    }}
    style={{
      fill: '#ffffff',
      stroke: '#BCBEC0',
      strokeWidth: 1,
    }}
  >
    {({ node, x, y }) => {
      const hasKey = nodeProps.properties.text[0].key
      if (!hasKey) return <TextNode node={nodeProps.properties as NodeData} x={x} y={y} />

      return <ObjectNode node={node as NodeData} x={x} y={y} />
    }}
  </Node>
)

export const CustomNode = React.memo(CustomNodeWrapper)
