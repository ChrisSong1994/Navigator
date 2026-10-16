/**
 * monaco 的装配。
 *
 * 两件事必须在这里做完，否则在扩展里直接是坏的：
 *
 * 1. `@monaco-editor/react` 默认从 CDN 拉 monaco，MV3 的 CSP 会拦下（仓库也明令不许远程代码）。
 *    loader.config({ monaco }) 把实例换成打进包里的这一份。
 * 2. monaco 自己也要 worker（词法分析、JSON 校验）。Vite 的 `?worker` 导入会把它切成独立产物，
 *    扩展态 worker-src 'self' 下能加载。
 *
 * 只引 editor.api + json 语言，不引 monaco-editor 的包入口 —— 那个入口会把 80 多种语言全拖进来。
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
}

loader.config({ monaco })

export default monaco
