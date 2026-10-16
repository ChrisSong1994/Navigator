import type { JSONPath, Node } from 'jsonc-parser'

/** 一个节点里的一行：key 为 null 表示这一行没有键（根数组、数组元素） */
export interface NodeRow {
  key: string | null
  value: string | number | null
  type: Node['type']
  childrenCount?: number
  to?: string[]
}

export interface NodeData {
  id: string
  text: NodeRow[]
  width: number
  height: number
  path?: JSONPath
}

export interface EdgeData {
  id: string
  from: string
  to: string
  text: string | null
}
