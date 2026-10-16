import { isAlias, isDocument, isMap, isPair, isScalar, isSeq } from 'yaml'

import type { Range } from '../types.ts'

/**
 * yaml v2 节点的读法。parser 和树 adapter 都要用，单独放一份，免得两处各写一套然后不一致。
 *
 * 这里跟 'yaml' 是静态导入（不是 loadParser 那种动态），所以 yaml 会被打进 AST 工具的 chunk ——
 * 换取的是「不用靠构造器名字认节点」。构造器名字在打包压缩后未必还叫 YAMLMap，
 * 而这个名字是直接显示给用户看的，不敢赌。
 */

/** yaml 的 range 是三段的 [start, valueEnd, nodeEnd]，nodeEnd 还带着后面的空白/换行，取前两段 */
export function yamlNodeRange(node: any): Range | undefined {
  const range = node?.range
  if (Array.isArray(range) && typeof range[0] === 'number') {
    const end = typeof range[1] === 'number' ? range[1] : range[0]
    return [range[0], Math.max(range[0], end)]
  }
  return undefined
}

/** yaml v2 的节点没有 type 字段，名字只能靠类型判断。Pair 在 v2 上没有 range，靠 key/value 子节点高亮 */
export function yamlNodeName(node: any): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  if (isMap(node)) return 'YAMLMap'
  if (isSeq(node)) return 'YAMLSeq'
  if (isScalar(node)) return 'Scalar'
  if (isAlias(node)) return 'Alias'
  if (isPair(node)) return 'Pair'
  if (isDocument(node)) return 'Document'
  // Document 上的 options / schema 这些普通对象不给名字，前面那个键已经说明是什么了
  return undefined
}
