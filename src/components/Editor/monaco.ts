/**
 * monaco 的装配。JSON 工具与 Transform 工具共用（本文件从 src/tools/Json/components/Editor/monaco.ts 原样搬来）。
 *
 * 两件事必须在这里做完，否则在扩展里直接是坏的：
 *
 * 1. `@monaco-editor/react` 默认从 CDN 拉 monaco，MV3 的 CSP 会拦下（仓库也明令不许远程代码）。
 *    loader.config({ monaco }) 把实例换成打进包里的这一份。
 * 2. monaco 自己也要 worker（词法分析、JSON 校验）。Vite 的 `?worker` 导入会把它切成独立产物，
 *    扩展态 worker-src 'self' 下能加载。
 *
 * 这里只引 editor.api + json 语言（两个工具都要的基础），不引 monaco-editor 的包入口 —— 那个入口会把
 * 80 多种语言全拖进来。各工具额外要的语言在自己的 languages.ts 里注册：那个模块进哪个 chunk，
 * 语言就只让谁付这份字节。
 *
 * 编辑器功能（查找替换、折叠、多光标…）不在 editor.api 里，得单独引一层：见 ./contributions.ts。
 *
 * 模块级副作用（loader.config 与 MonacoEnvironment 各只能设一次），所以必须共用这一份，不能各写各的。
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
// 编辑器功能（查找替换 / 折叠 / 注释…）。副作用导入，必须在 MonacoEditor 挂载前跑完
import './contributions.ts'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
}

loader.config({ monaco })

export default monaco
