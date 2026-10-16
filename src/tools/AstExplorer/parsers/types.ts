/**
 * AST 浏览器的 parser / category 描述。
 *
 * 原版 types/index.ts 里还有 Transformer、renderSettings、getDefaultOptions、forEachProperty、
 * _ignoredProperties 这些字段：Transformer 因为扩展的 CSP 跑不了用户代码（见计划里那一条），
 * 其余几个在原来的流程里根本没被读到（树的行/键隐藏是 TreeAdapter 自己的 configs 说了算，
 * parser 上那份 locationProps / typeProps 是死的）。所以这里只留真正被用到的字段。
 */

/** 源码里的一段区间，[起始偏移, 结束偏移] */
export type Range = [number, number]

/** 各 parser 吐出来的节点形状千差万别，这里不假装能统一类型 */
type AstNode = any

export interface Parser<P = any, O = any> {
  id: string
  displayName: string
  version?: string
  homepage?: string
  /** 动态 import 解析库。开着别的语言时，这个库根本不会被下载 */
  loadParser: () => Promise<P>
  parse: (parser: P, code: string, options?: O) => AstNode
  /** 节点 → 源码区间。给不出来就返回 undefined，树和源码高亮都靠它 */
  nodeToRange?: (node: AstNode) => Range | undefined
  /** 节点在树里显示成什么名字，比如 Identifier / YAMLMap */
  getNodeName?: (node: AstNode) => string | undefined
  /**
   * 有些解析库不抛异常，而是把语法错误收在结果里（yaml 就是这样）。
   * 页面拿这个补上红条；会抛异常的那些 parser 不写这个。
   */
  getErrors?: (result: AstNode) => string[]
  /** 源码编辑器用哪种词法，比如 javascript / json / yaml */
  editorLanguage?: string
  [key: string]: unknown
}

export interface Category {
  id: string
  displayName: string
  parsers: Parser[]
  /** 一进来就摆进编辑器的示例代码 */
  codeExample?: string
}
