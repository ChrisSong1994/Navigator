import MonacoEditor from '@monaco-editor/react'
import { Spin } from 'antd'
import { memo } from 'react'

import { DEFAULT_OPTIONS } from '../../../../components/Editor/index.ts'
import type { EEditorLanguage } from '../../../../components/Editor/index.ts'
// 副作用导入：装上 monaco 实例、worker 与本工具额外要的语法着色，必须在 MonacoEditor 挂载前跑完
import '../../../../components/Editor/monaco.ts'
import './languages.ts'
import { useConfig } from '../../../../config/configContext.ts'
import { useResolvedTheme } from '../../../../hooks/useResolvedTheme.ts'

export interface TransformEditorProps {
  language: EEditorLanguage
  value: string
  /** 右边那块是只读输出 */
  editable?: boolean
  onChange?: (value: string) => void
}

/**
 * 转换器用的编辑器外壳。只有变换本身需要，所以没搬 JSON 工具那套（导入按钮、拖文件进来、空态提示、
 * 报错面板）—— 那些都绑在 JSON 的文件类型上，而本工具不上传也不下载文件。
 */
const TransformEditor = (props: TransformEditorProps) => {
  const { language, value, editable = true, onChange } = props

  const { settings } = useConfig()
  const theme = useResolvedTheme(settings.themeMode)

  return (
    <MonacoEditor
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      language={language}
      height="100%"
      loading={<Spin />}
      options={{ ...DEFAULT_OPTIONS, readOnly: !editable }}
      value={value}
      onChange={(next) => onChange?.(next ?? '')}
    />
  )
}

export default memo(TransformEditor)
