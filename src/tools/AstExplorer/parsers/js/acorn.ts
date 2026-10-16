import { defaultESTreeParserInterface } from '../utils.ts'
import type { Parser } from '../types.ts'

export const acorn: Parser = {
  ...defaultESTreeParserInterface,
  id: 'acorn',
  displayName: 'acorn',
  version: '8.x',
  homepage: 'https://github.com/acornjs/acorn',
  editorLanguage: 'javascript',

  /**
   * 原版是从 jsdelivr 拉 dist/acorn.mjs —— 扩展的 CSP 不允许远程脚本，也禁止 new Function，
   * 所以这里换成打包进产物的普通动态 import（和 @babel/parser 一样，用到才下载）。
   */
  loadParser: () => import('acorn'),

  parse(acorn: any, code: string, options?: any) {
    const comments: any[] = []
    const tokens: any[] = []

    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      ranges: true,
      ...options,
      onComment: comments,
      onToken: tokens,
    })

    if (comments.length > 0) {
      ast.comments = comments
    }
    if (tokens.length > 0) {
      ast.tokens = tokens
    }

    return ast
  },

  /**
   * 原版走 parsers/utils/location.ts 里的 getNodeLocation，
   * 那其实就是「有 range 用 range，否则用 start/end」——和默认实现等价，
   * 所以整个 location.ts（118 行的预设表）没有搬过来的必要。
   */
}
