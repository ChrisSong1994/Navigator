import type { editor } from 'monaco-editor/esm/vs/editor/editor.api'

/**
 * 编辑器语言。原项目这里是个 enum（26 种语言），但 `erasableSyntaxOnly` 不让写 enum，
 * 就退成 const 对象 + 联合类型，调用点写法不变。
 *
 * 从 JSON 工具挪到公共层：JSON 只要 JSON，Transform 要的是下面那一串。多列出的值不花任何字节，
 * 真正决定引不引语言的是各处自己的 languages.ts。
 */
export const EEditorLanguage = {
  PLAINTEXT: 'plaintext',
  JSON: 'json',
  YAML: 'yaml',
  GO: 'go',
  JAVA: 'java',
  KOTLIN: 'kotlin',
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  SQL: 'mysql',
} as const

export type EEditorLanguage = (typeof EEditorLanguage)[keyof typeof EEditorLanguage]

/** 原项目那套编辑器选项，原样搬 */
export const DEFAULT_OPTIONS = {
  acceptSuggestionOnError: false,
  contextmenu: false,
  fontSize: 14,
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 4,
  automaticLayout: true,
  scrollBeyondLastLine: false, // 设置编辑器是否可以滚动到最后一行之后
  minimap: { enabled: false },
  folding: true, // 是否启用代码折叠
  wordWrap: 'on', // 默认自动换行
  quickSuggestions: false,
  renderValidationDecorations: 'off',
  codeLens: false,
  maxTokenizationLineLength: 5000,
  unicodeHighlight: {
    ambiguousCharacters: false, // 关闭字符串内特殊字符高亮，为了性能
  },
} as Partial<editor.IEditorOptions>
