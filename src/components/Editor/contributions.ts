/**
 * monaco 的编辑器功能（contribution）。
 *
 * `editor.api` 只导出 API，**不带任何编辑器功能** —— 查找替换、折叠、括号匹配、注释、多光标这些
 * 都是独立模块，谁不引谁就没有。所以之前在这个项目里按 ⌘F / Ctrl+F 会漏到浏览器自己的查找，
 * 编辑器连 find widget 都根本没建出来，`DEFAULT_OPTIONS` 里的 `folding: true` 也一直没生效。
 *
 * monaco 官方的全集是 `monaco-editor/esm/vs/editor/editor.all.js`，但里面一半功能这几个文本工具
 * 用不上（codelens、codeAction、inlineEdit、gotoSymbol、stickyScroll…），全引进来白白多出近 1MB。
 * 这里列的是「一个文本编辑器该有的手感」，各工具共用一份；要加功能就往这里加一行，
 * 别在各自的 monaco.ts 里另起一套。
 *
 * 故意没引的：dnd / dropOrPasteInto —— 编辑器要接住「拖文件进来导入」这件事，是外面那层
 * 容器的 onDrop 在做（见 Json/BaseEditor），让 monaco 也插手只会两边抢事件。
 */
// 基础编辑命令（撤销重做、光标移动、剪切复制粘贴的实现）
import 'monaco-editor/esm/vs/editor/browser/coreCommands'
// 查找 / 替换：⌘F、Ctrl+F、⌘H。**浏览器抢走搜索框就是这个模块没引**
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
// 代码折叠（DEFAULT_OPTIONS 里 folding: true 依赖它）
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
// 括号匹配 / 跳转
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/transpose'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo'
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations'
// 注释（⌘/）与自动缩进
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation'
// 悬停提示 / 补全
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2'
// 链接可点、同名词高亮
import 'monaco-editor/esm/vs/editor/contrib/links/browser/links'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter'
// 空文档占位、只读提示
import 'monaco-editor/esm/vs/editor/contrib/placeholderText/browser/placeholderText.contribution'
import 'monaco-editor/esm/vs/editor/contrib/readOnlyMessage/browser/contribution'
// 错误跳转（F8）/ 格式化 / Tab 键模式 / 超长行保护
import 'monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError'
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode'
import 'monaco-editor/esm/vs/editor/contrib/longLinesHelper/browser/longLinesHelper'
// find widget 的图标字体（codicon），不引的话按钮上是空方块
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles'
