import { CloseOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { memo } from 'react'

import { pickTextFile } from '../../../../lib/file.ts'
import { JSON_FILE_KIND } from '../../lib/kind.ts'
import { isEmpty } from '../../../../lib/util.ts'
import { EEditorLanguage } from '../../../../components/Editor/index.ts'
import BaseEditor from './BaseEditor.tsx'

interface IProps {
  value: string
  onChange: (value: string) => void
  style?: Record<string, string | number>
  /** 解析报错文案（含位置与插入符那段），来自 lib/json.ts 的 JsonParseError */
  error?: string | null
  onRepair: () => void
  onErrorClose?: () => void
}

const JsonEditor = (props: IProps) => {
  const { value, onChange, style, error, onRepair, onErrorClose } = props
  const errorShow = !isEmpty(error)

  return (
    <div className="json-tool-editor-wrap">
      <BaseEditor
        style={style}
        language={EEditorLanguage.JSON}
        value={value}
        tipShow={true}
        onImport={async () => (await pickTextFile(JSON_FILE_KIND.accept))?.content ?? null}
        onChange={onChange}
      />
      {errorShow ? (
        <div className="json-tool-error-panel" role="alert">
          <div className="json-tool-error-text">{error}</div>
          <Tooltip title="尽量把这段内容补成合法 JSON">
            <Button size="small" onClick={onRepair}>
              修复
            </Button>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label="关闭报错"
            onClick={onErrorClose}
          />
        </div>
      ) : null}
    </div>
  )
}

export default memo(JsonEditor)
