/**
 * 把 JSON 文本解析成「节点 + 边」，给结构图画布用。
 * 竖着搬自 developer-assistant 的 GraphView/lib/jsonParser.ts（其源头是 JSON Crack，Apache-2.0）。
 */
import { parseTree, getNodePath, type Node } from 'jsonc-parser'

import type { EdgeData, NodeData, NodeRow } from '../types.ts'
import { calculateNodeSize } from './utils/calculateNodeSize.ts'

export type Graph = {
  nodes: NodeData[]
  edges: EdgeData[]
}

export const parser = (json: string): Graph => {
  const jsonTree = parseTree(json)
  if (!jsonTree) return { nodes: [], edges: [] }

  const nodes: NodeData[] = []
  const edges: EdgeData[] = []
  let nodeId = 1
  let edgeId = 1

  function traverse(node: Node, parentId?: string) {
    const id = String(nodeId++)
    const text: NodeRow[] = []

    // 父节点在数组里的话，先连一条无边标签的线
    if (parentId !== undefined && node.parent?.type === 'array') {
      edges.push({
        id: String(edgeId++),
        from: parentId,
        to: id,
        text: '',
      })
    }

    const isArray = node.type === 'array'
    const isRootArray = !node.parent || node.parent.type === 'array'
    if (isArray && isRootArray) {
      const { width, height } = calculateNodeSize(`[${node.children?.length ?? '0'} items]`)
      nodes.push({
        id,
        text: [
          {
            key: null,
            value: `[${node.children?.length ?? 0} items]`,
            type: 'array',
            childrenCount: node.children?.length,
          },
        ],
        width,
        height,
        path: [],
      })

      node.children?.forEach((child) => {
        traverse(child, id)
      })

      return id
    }

    node.children?.forEach((child) => {
      if (!child.children || !child.children[1]) return traverse(child, id)

      const key = child.children[0].value ?? null
      const valueNode = child.children[1]
      const type = valueNode.type

      if (type === 'array') {
        const targetIds: string[] = []

        valueNode.children?.forEach((arrayChild) => {
          const arrayChildId = traverse(arrayChild, undefined)
          if (arrayChildId) targetIds.push(arrayChildId)
        })

        text.push({
          key,
          value: valueNode.value,
          type,
          to: targetIds.length > 0 ? targetIds : undefined,
          childrenCount: valueNode.children?.length,
        })

        targetIds.forEach((targetId) => {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: targetId,
            text: key ?? null,
          })
        })
      } else if (type === 'object') {
        const objectNodeId = traverse(valueNode, id)
        text.push({
          key,
          value: valueNode.value,
          type,
          childrenCount: Object.keys(valueNode.children ?? {}).length,
          ...(objectNodeId && { to: [objectNodeId] }),
        })

        if (objectNodeId) {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: objectNodeId,
            text: key ?? null,
          })
        }
      } else {
        text.push({
          key,
          value: valueNode.value,
          type,
        })
      }
    })

    // 兜住数组里空对象 [{}] 这种情况
    if (node.parent?.type === 'array' && node.type === 'object' && node.children?.length === 0) {
      text.push({
        key: null,
        value: '{0 keys}',
        type: 'object',
        childrenCount: 0,
      })
    }

    const appendParentKey = () => {
      const getParentKey = (targetNode: Node) => {
        const path = getNodePath(targetNode) as (string | number)[]
        return path?.pop()?.toString()
      }

      if (!node.parent) {
        return { parentKey: getParentKey(node), parentType: node.type }
      }

      if (node.parent.type === 'array') {
        return { parentKey: getParentKey(node.parent), parentType: 'array' }
      }

      if (node.parent.type === 'property') {
        return { parentKey: getParentKey(node), parentType: 'object' }
      }

      return {
        parentKey: getParentKey(node),
        parentType: node.parent.type.replace('property', 'object'),
      }
    }

    // 字符串 / 数字 / 布尔 / null 这类没有子节点的，自己就是一个节点
    if (text.length === 0) {
      if (typeof node.value === 'undefined') return
      const { width, height } = calculateNodeSize(node.value)

      nodes.push({
        id,
        text: [
          {
            key: null,
            value: node.value,
            type: node.type,
          },
        ],
        width,
        height,
        path: getNodePath(node),
        ...appendParentKey(),
      })
    } else {
      // 传数组给 calculateNodeSize 是让它按「键: 值」逐行量宽高
      let measured: string | [string, string][] = ''

      if (text.some((row) => row.key !== null)) {
        measured = text.map((row) => {
          const keyStr = row.key === null ? '' : row.key
          if (row.type === 'object') return [keyStr, `{${row.childrenCount ?? 0} keys}`]
          if (row.type === 'array') return [keyStr, `[${row.childrenCount ?? 0} items]`]
          if (row.value === null) return [keyStr, 'null']

          return [keyStr, `${row.value}`]
        })
      } else {
        measured = `${text[0].value}`
      }

      const { width, height } = calculateNodeSize(measured)
      nodes.push({
        id,
        text,
        width,
        height,
        path: getNodePath(node),
        ...appendParentKey(),
      })
    }

    return id // 给父节点拿去做连线用
  }

  traverse(jsonTree)
  return { nodes, edges }
}
