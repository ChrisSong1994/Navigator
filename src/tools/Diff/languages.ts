/**
 * Diff 工具的语言列表与语法着色。
 *
 * 上游 `pages/Diff` 的语言下拉来自 `EDITOR_LANGUAGE_OPTIONS`（`EEditorLanguage` 的 26 个值），
 * 但那边是拿 monaco 的完整 `/vs` 目录跑的。这里只装了 editor.api + json（见公共的
 * `components/Editor/monaco.ts`），所以本工具用到的其余语言得自己引。
 *
 * `json5` 与 `toml` 在 monaco 的 basic-languages 里没有对应实现，保留在下拉里但不着色，
 * 与上游行为一致；其余语言都引 basic-languages 的 monarch 规则（纯前端着色，不需要额外 worker）。
 */
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution'
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'

export type DiffLanguage =
  | 'plaintext'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'scss'
  | 'sql'
  | 'java'
  | 'css'
  | 'html'
  | 'less'
  | 'php'
  | 'go'
  | 'shell'
  | 'ruby'
  | 'rust'
  | 'python'
  | 'yaml'
  | 'xml'
  | 'kotlin'
  | 'dart'
  | 'swift'
  | 'objective-c'
  | 'toml'
  | 'json5'
  | 'markdown'
  | 'lua'

/** 与上游 `Object.values(EEditorLanguage)` 的顺序保持一致 */
export const DIFF_LANGUAGE_OPTIONS: { value: DiffLanguage; label: string }[] = [
  { value: 'plaintext', label: 'plaintext' },
  { value: 'json', label: 'json' },
  { value: 'javascript', label: 'javascript' },
  { value: 'typescript', label: 'typescript' },
  { value: 'scss', label: 'scss' },
  { value: 'sql', label: 'sql' },
  { value: 'java', label: 'java' },
  { value: 'css', label: 'css' },
  { value: 'html', label: 'html' },
  { value: 'less', label: 'less' },
  { value: 'php', label: 'php' },
  { value: 'go', label: 'go' },
  { value: 'shell', label: 'shell' },
  { value: 'ruby', label: 'ruby' },
  { value: 'rust', label: 'rust' },
  { value: 'python', label: 'python' },
  { value: 'yaml', label: 'yaml' },
  { value: 'xml', label: 'xml' },
  { value: 'kotlin', label: 'kotlin' },
  { value: 'dart', label: 'dart' },
  { value: 'swift', label: 'swift' },
  { value: 'objective-c', label: 'objective-c' },
  { value: 'toml', label: 'toml' },
  { value: 'json5', label: 'json5' },
  { value: 'markdown', label: 'markdown' },
  { value: 'lua', label: 'lua' },
]
