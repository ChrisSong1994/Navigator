import * as YAML from 'yaml'

import { yamlNodeName, yamlNodeRange } from './node.ts'
import type { Parser } from '../types.ts'

/**
 * YAML 解析，用 yaml v2 的 `parseDocument`。
 *
 * 原版这份是针对 yaml v1 写的，到 v2 上节点挂的东西全变了（见 node.ts 的说明）：
 *   - 节点没有 `type` 字段，而上游的树是按 `node.type || node.kind || 'Object'` 取名字的，
 *     于是 YAML 树上每个节点都显示成 "Object"；
 *   - `range` 是三段的，直接拿来高亮会多选一截。
 *
 * 还有一点：`parseDocument` 语法错误不抛异常，收在 `doc.errors` 里，
 * 所以这里实现 getErrors 让页面能补上红条 —— 树照常显示已经解析出来的那部分。
 *
 * 原版另有 yaml-ast-parser 一份实现，那个包早没人维护了，三类 MVP 里没有它。
 *
 * 这里没跟别的解析器一样用 `loadParser: () => import('yaml')`：树 adapter 在 render 期间
 * 就要认节点类型（node.ts 静态导入 yaml），打包器已经知道这个模块进了 AST 工具的 chunk，
 * 再写动态导入只会换来一句 INEFFECTIVE_DYNAMIC_IMPORT，不如写成静态的，跟实际行为对上。
 */

export const yamlParser: Parser = {
  id: 'yaml',
  displayName: 'yaml',
  version: '2.x',
  homepage: 'https://eemeli.org/yaml/',
  editorLanguage: 'yaml',

  loadParser: () => Promise.resolve(YAML),

  parse(yaml: any, code: string) {
    const document = yaml.parseDocument(code)
    // 空内容：contents 是 null，这不是语法错误
    if (document.contents == null && document.errors.length === 0) {
      return null
    }
    return document
  },

  nodeToRange: yamlNodeRange,
  getNodeName: yamlNodeName,

  getErrors(result: any) {
    const errors: any[] = result?.errors ?? []
    return errors.map((error: any) => error.message)
  },
}
