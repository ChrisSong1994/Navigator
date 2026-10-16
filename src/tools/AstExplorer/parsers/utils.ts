import type { Parser, Range } from './types.ts'

/**
 * 大多数 ESTree 风格的 AST（babel / acorn）都是 `{type, start, end}`，
 * 下面两个是默认实现，parser 没自己写就继承它们。
 */
export function defaultNodeToRange(node: any): Range | undefined {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  if (Array.isArray(node.range) && node.range.length >= 2) {
    return [node.range[0], node.range[1]]
  }
  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return [node.start, node.end]
  }
  return undefined
}

export function defaultGetNodeName(node: any): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  return typeof node.type === 'string' ? node.type : undefined
}

/**
 * ESTree 里这几个键下面的子节点默认展开着看更顺眼。
 * 数组本身没有 type，所以只能靠 key 认；Program 靠 type 认。
 */
const OPEN_BY_DEFAULT_KEYS = new Set([
  'body',
  'elements',
  'declarations',
  'expression',
])

export function estreeOpensByDefault(node: any, key: string | undefined): boolean {
  if (!node || typeof node !== 'object') {
    return false
  }
  if (node.type === 'Program') {
    return true
  }
  return typeof key === 'string' && OPEN_BY_DEFAULT_KEYS.has(key)
}

/** 给 parser 补上 nodeToRange / getNodeName 的默认值 */
export function withParserDefaults<T extends Parser>(parser: T): T {
  return {
    nodeToRange: defaultNodeToRange,
    getNodeName: defaultGetNodeName,
    ...parser,
  }
}

/** ESTree 系 parser 的公共部分，babel / acorn 都 spread 它 */
export const defaultESTreeParserInterface = {
  nodeToRange: defaultNodeToRange,
  getNodeName: defaultGetNodeName,
  opensByDefault: estreeOpensByDefault,
}
