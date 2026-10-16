import { MedicineBoxOutlined } from '@ant-design/icons'
import MonacoEditor from '@monaco-editor/react'
import { Spin } from 'antd'
import { memo, useEffect, useMemo, useState } from 'react'

import { useResolvedTheme } from '../../../../hooks/useResolvedTheme.ts'
import { useConfig } from '../../../../config/configContext.ts'
import { pickTextFile, readDroppedFile } from '../../../lib/file.ts'
import { JSON_FILE_KIND } from '../../lib/kind.ts'
import { debounce, isEmpty } from '../../../lib/util.ts'
import { DEFAULT_OPTIONS, EEditorLanguage } from './index.ts'
// 副作用导入：装上 monaco 实例和 worker，必须在 MonacoEditor 挂载前跑完
import './monaco.ts'

export interface IBaseEditorProps {
  language?: EEditorLanguage
  value?: string
  onChange?: (value: string) => void
  style?: Record<string, string | number>
  options?: Record<string, unknown>
  onImport?: () => Promise<string | null>
  tipShow?: boolean
  editable?: boolean
}

const BaseEditor = (props: IBaseEditorProps) => {
  const {
    language = EEditorLanguage.PLAINTEXT,
    value = '',
    onChange,
    style = {},
    options = {},
    onImport,
    tipShow = false,
    editable = true,
  } = props

  const { settings } = useConfig()
  const theme = useResolvedTheme(settings.themeMode)
  const [dragging, setDragging] = useState(false)

  // 防抖只按 onChange 的身份重建；调用方传的都是 setState（引用稳定），
  // 所以不会出现「重建把待触发的那一下吃掉」
  const emit = useMemo(() => debounce(onChange ?? (() => {}), 300), [onChange])
  useEffect(() => () => emit.cancel(), [emit])

  const handleFileImport = async () => {
    if (onImport) {
      const next = await onImport()
      if (next) onChange?.(next)
      return
    }
    const picked = await pickTextFile(JSON_FILE_KIND.accept)
    if (picked) onChange?.(picked.content)
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    onChange?.((await readDroppedFile(file)).content)
  }

  return (
    <div
      className="json-tool-editor"
      style={style}
      onDragOver={(event) => {
        // 不拦默认行为的话 drop 事件根本不会来
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {isEmpty(value) && tipShow ? (
        <button type="button" className="json-tool-editor-tip" onClick={handleFileImport}>
          <MedicineBoxOutlined className="json-tool-editor-tip-icon" />
          <span>请输入文本信息或点击图标导入文本文件</span>
        </button>
      ) : null}
      <MonacoEditor
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        language={language}
        height="100%"
        loading={<Spin />}
        options={{
          ...DEFAULT_OPTIONS,
          ...options,
          readOnly: !editable,
        }}
        value={value}
        onChange={(next) => emit(next ?? '')}
      />
      {dragging ? <div className="json-tool-editor-drop">松开即可导入文件</div> : null}
    </div>
  )
}

export default memo(BaseEditor)
