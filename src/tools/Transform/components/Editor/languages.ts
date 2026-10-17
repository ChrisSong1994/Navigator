/**
 * 本工具多要的 monaco 语言。
 *
 * 共享的 `src/components/Editor/monaco.ts` 只装了基准（editor.api + json 语言），因为那个文件进哪个 chunk
 * 是固定的 —— 往里加语言，JSON 工具也得跟着付这份字节。这里只给 Transform 自己装。
 *
 * basic-languages 提供的是 monarch 语法着色，纯前端规则，不需要额外的 worker（普通的 editor worker 就够）。
 * 特意不引 `language/typescript/ts.worker`：它只为补全与类型检查存在，而 DEFAULT_OPTIONS 里
 * quickSuggestions 是关的、转换器也不需要智能提示，引了就是白搭几 MB 产物。
 */
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution'
