import { printParseErrorCode } from 'jsonc-parser'
import type { ParseError } from 'jsonc-parser'

import type { Parser } from '../types.ts'

/**
 * JSON 解析。
 *
 * 原版用的是 json-to-ast：它的节点是 `{type, value, loc, children}`，name 取 `type`，
 * 而且上游的 json tree adapter 把 nodeToRange 写成了 `() => null` —— 于是 JSON 树既没有源码高亮，
 * 也没法按光标自动展开。
 *
 * 这里换成仓库里本来就有的 jsonc-parser（Json 工具在用，不新增依赖），并把节点摊平成
 * `{type, value, start, end, key, children}` —— 去掉 jsonc 自己的 `length`/`offset`/`parent`：
 *   - `length` 是致命的：树用「有没有数字 length」判断数组，jsonc 的每个节点都带 length，
 *     于是对象会被当成数组渲染成 `[ ... ]`；
 *   - `parent` 是回指，摆在树里只会让人晕；
 *   - 换成 start/end 之后，位置信息的隐藏开关和 estree 那套是同一个键名。
 *
 * json-to-ast 遇到语法错误会抛，jsonc 的 parseTree 不抛而是把错误收进数组，
 * 所以这里显式把第一处错误抛出去，红条的行为跟原来一致。
 */

interface JsonNode {
  type: string
  value?: unknown
  key?: JsonNode
  children?: JsonNode[]
  start: number
  end: number
  [key: string]: unknown
}

/** 把 jsonc 的节点摊成树认识的形状 */
export function normalizeJsonNode(node: any): JsonNode | undefined {
  if (!node || typeof node !== 'object') {
    return undefined
  }

  const start: number = node.offset
  const end: number = node.offset + node.length

  switch (node.type) {
    case 'object':
    case 'array': {
      const children = (node.children ?? [])
        .map((child: any) => normalizeJsonNode(child))
        .filter(Boolean)
      return { type: node.type, children, start, end }
    }
    case 'property': {
      const [key, value] = node.children ?? []
      const normalized: JsonNode = {
        type: 'property',
        key: normalizeJsonNode(key),
        start,
        end,
      }
      // 值写坏了（比如 `{"a": }`）时 jsonc 只给出 key 一个子节点
      if (value) normalized.value = normalizeJsonNode(value)
      return normalized
    }
    default:
      return { type: node.type, value: node.value, start, end }
  }
}

/** 把第一处语法错误说成人话：原因 + 第几行第几列 */
export function describeJsonError(error: ParseError, code: string): string {
  const before = code.slice(0, error.offset)
  const line = before.split('\n').length
  const column = error.offset - before.lastIndexOf('\n')
  return `${printParseErrorCode(error.error)}（第 ${line} 行 第 ${column} 列）`
}

export const jsoncParser: Parser = {
  id: 'jsonc',
  displayName: 'jsonc-parser',
  version: '3.x',
  homepage: 'https://github.com/microsoft/node-jsonc-parser',
  editorLanguage: 'json',

  loadParser: () => import('jsonc-parser'),

  parse(jsonc: any, code: string) {
    const errors: ParseError[] = []
    const root = jsonc.parseTree(code, errors)

    // 空内容不是语法错误，交给界面上显示空状态
    if (!root) {
      return null
    }
    if (errors.length > 0) {
      throw new Error(describeJsonError(errors[0], code))
    }

    return normalizeJsonNode(root)
  },

  nodeToRange(node: any) {
    if (node && typeof node.start === 'number' && typeof node.end === 'number') {
      return [node.start, node.end]
    }
  },

  getNodeName(node: any) {
    return node && typeof node.type === 'string' ? node.type : undefined
  },
}
