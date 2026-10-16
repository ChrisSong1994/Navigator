import MonacoEditor from '@monaco-editor/react'
import { Spin } from 'antd'
import { memo, useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api'

import { useConfig } from '../../../../config/configContext.ts'
import { useResolvedTheme } from '../../../../hooks/useResolvedTheme.ts'
// 副作用导入：装上 monaco 实例和 worker，必须在 MonacoEditor 挂载前跑完
import './monaco.ts'

/**
 * AST 工具的编辑器面板。
 *
 * 跟 Json 工具那个 BaseEditor 的区别：这里要拿编辑器实例做两件事 ——
 * 读光标位置（喂给树的自动聚焦）和盖高亮装饰（树上悬停时标出对应源码）。
 * BaseEditor 没有 onMount，为这个去改它会把「导入文件 / 拖拽 / 防抖」那一套也牵扯进来，
 * 所以这里另写一个薄的；编辑器选项也就地写一份，不跨工具引 Json 那边的。
 */

const SOURCE_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 4,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  folding: true,
  // 源码里带高亮装饰，行内容别因为长 AST 名字被折得很难看
  wordWrap: 'off',
  quickSuggestions: false,
  renderValidationDecorations: 'off',
  codeLens: false,
  contextmenu: false,
  maxTokenizationLineLength: 5000,
  unicodeHighlight: { ambiguousCharacters: false },
}

export interface IProps {
  value: string
  onChange?: (value: string) => void
  language: string
  readOnly?: boolean
  /** 光标位置（字符偏移量）变了 */
  onCursorChange?: (offset: number) => void
  /** 拿到 / 交还编辑器实例，页面用它盖高亮装饰 */
  onEditorChange?: (editor: editor.IStandaloneCodeEditor | null) => void
}

const AstEditor = ({
  value,
  onChange,
  language,
  readOnly = false,
  onCursorChange,
  onEditorChange,
}: IProps) => {
  const { settings } = useConfig()
  const theme = useResolvedTheme(settings.themeMode)

  // onMount 只在挂载时跑一次，里面要用的回调得看最新的那份，所以转存到 ref。
  // 在 effect 里更新（不在 render 里写 ref）：onMount 和光标事件都是 effect 之后才发生的，晚一拍不影响
  const handlers = useRef({ onCursorChange, onEditorChange })
  useEffect(() => {
    handlers.current = { onCursorChange, onEditorChange }
  })

  useEffect(
    () => () => {
      handlers.current.onEditorChange?.(null)
    },
    [],
  )

  return (
    <div className="ast-tool-editor">
      <MonacoEditor
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        language={language}
        height="100%"
        loading={<Spin />}
        options={readOnly ? { ...SOURCE_OPTIONS, readOnly: true } : SOURCE_OPTIONS}
        value={value}
        onChange={(next) => onChange?.(next ?? '')}
        onMount={(instance) => {
          handlers.current.onEditorChange?.(instance)

          instance.onDidChangeCursorPosition((event) => {
            handlers.current.onCursorChange?.(instance.getModel()?.getOffsetAt(event.position) ?? -1)
          })

          // 挂载时先报一次当前光标位置，省得不动光标就一直没有 position
          const model = instance.getModel()
          const position = instance.getPosition()
          if (model && position) {
            handlers.current.onCursorChange?.(model.getOffsetAt(position))
          }
        }}
      />
    </div>
  )
}

export default memo(AstEditor)
