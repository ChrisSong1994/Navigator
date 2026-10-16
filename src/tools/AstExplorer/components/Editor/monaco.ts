/**
 * monaco 的装配。跟 Json 工具那份（Json/components/Editor/monaco.ts）是同样的两件事：
 *
 * 1. `@monaco-editor/react` 默认从 CDN 拉 monaco，MV3 的 CSP 会拦下（仓库也明令不许远程代码）。
 *    loader.config({ monaco }) 把实例换成打进包里的这一份。
 * 2. monaco 自己的 worker（词法分析、JSON 校验）要用 Vite 的 `?worker` 导入切成独立产物，
 *    扩展态 worker-src 'self' 下才加载得到。
 *
 * 差别在于语言：Json 工具只要 json 一种，AST 工具要 javascript / json / yaml 三种。
 * 这三种都只引 basic-languages 里对应的 contribution，不引 monaco-editor 的包入口
 * —— 那个入口会把 80 多种语言全拖进来。
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
}

loader.config({ monaco })

export default monaco
