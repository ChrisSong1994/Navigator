import { defaultESTreeParserInterface } from '../utils.ts'
import type { Parser } from '../types.ts'

/**
 * 插件列表照搬原版：Babel 8 里大部分插件已经默认开启，但名字仍然被接受，
 * 显式写出来是为了让不同 Babel 版本下解析结果一致。
 */
const PLUGINS = [
  'asyncGenerators',
  'bigInt',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'decorators-legacy',
  'doExpressions',
  'dynamicImport',
  'exportDefaultFrom',
  'exportNamespaceFrom',
  'functionBind',
  'functionSent',
  'importMeta',
  'logicalAssignment',
  'nullishCoalescingOperator',
  'numericSeparator',
  'objectRestSpread',
  'optionalCatchBinding',
  'optionalChaining',
  'partialApplication',
  'throwExpressions',
  'topLevelAwait',
  'typescript',
  'jsx',
]

export const babel: Parser = {
  ...defaultESTreeParserInterface,
  id: 'babel',
  displayName: '@babel/parser',
  version: '8.x',
  homepage: 'https://babeljs.io/docs/babel-parser',
  editorLanguage: 'javascript',

  loadParser: () => import('@babel/parser'),

  parse(parser: any, code: string, options?: any) {
    return parser.parse(code, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: PLUGINS,
      ...options,
    })
  },

  nodeToRange(node: any) {
    if (typeof node.start === 'number' && typeof node.end === 'number') {
      return [node.start, node.end]
    }
  },

  getNodeName(node: any) {
    if (typeof node.type === 'string') {
      return node.type
    }
    // 注释节点（leadingComments 之类）的 type 是 { label: 'CommentLine' } 这种对象
    if (node.type && typeof node.type === 'object') {
      return `Token (${node.type.label})`
    }
  },
}
