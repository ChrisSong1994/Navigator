import MonacoEditor from '@monaco-editor/react'
import { Spin } from 'antd'
import { memo } from 'react'

import { DEFAULT_OPTIONS, EEditorLanguage } from '../../../components/Editor/index.ts'
// 副作用导入：装上 monaco 实例与 worker，必须在 MonacoEditor 挂载前跑完
import '../../../components/Editor/monaco.ts'
import { useConfig } from '../../../config/configContext.ts'
import { useResolvedTheme } from '../../../hooks/useResolvedTheme.ts'

export interface RegexpEditorProps {
  value: string
  editable?: boolean
  onChange?: (value: string) => void
}

/**
 * 正则工具用的 monaco 外壳，照 Transform 的 TransformEditor 写。
 *
 * 文本按 plaintext 着色：待匹配的可能是任意内容（日志、CSV、代码片段），猜语言只会着色出错。
 * 上游这里用的是 antd TextArea（没有行号），本仓库的工具都以 monaco 为准，所以换掉。
 */
const RegexpEditor = (props: RegexpEditorProps) => {
  const { value, editable = true, onChange } = props

  const { settings } = useConfig()
  const theme = useResolvedTheme(settings.themeMode)

  return (
    <MonacoEditor
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      language={EEditorLanguage.PLAINTEXT}
      height="100%"
      loading={<Spin />}
      options={{
        ...DEFAULT_OPTIONS,
        readOnly: !editable,
        // 正则工具里最常做的是「看某一段在哪一列」，行号要保留；wordWrap 已在 DEFAULT_OPTIONS 里开着
      }}
      value={value}
      onChange={(next) => onChange?.(next ?? '')}
    />
  )
}

export default memo(RegexpEditor)