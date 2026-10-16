import { CloseOutlined } from '@ant-design/icons'

import ToggleEditText from './ToggleEditText.tsx'
import { removeRecord, renameRecord } from './lib/records.ts'
import type { ColorRecord } from './lib/records.ts'

/**
 * 记录列表（原 Record.tsx）：一格颜色 + 一个可改的名字，指上去右上角冒出删除按钮，
 * 点色块把当前取色切回这个颜色。
 *
 * 原版把 `defaultValue` 传成了 `item.value`，所以 ToggleEditText 里「未命名」那个兜底其实到不了 ——
 * 名字改空会回到色值。照搬，不自作主张改。
 */
interface RecordProps {
  data: ColorRecord[]
  onChange: (data: ColorRecord[]) => void
  onSelect: (hex: string) => void
}

export default function ColorRecordList({ data, onChange, onSelect }: RecordProps) {
  const handleTitleChange = (key: string) => (title: string) => {
    onChange(renameRecord(data, key, title))
  }

  const handleRemove = (key: string) => () => {
    onChange(removeRecord(data, key))
  }

  return (
    <div className="color-tool-record">
      {data.map((item) => (
        <div className="color-tool-record-item" key={item.key}>
          <CloseOutlined className="color-tool-record-remove" onClick={handleRemove(item.key)} />
          <div
            className="color-tool-record-swatch"
            style={{ backgroundColor: item.value }}
            title={item.value}
            onClick={() => onSelect(item.value)}
          />
          <ToggleEditText
            placeholder="未命名"
            defaultValue={item.value}
            value={item.title}
            onChange={handleTitleChange(item.key)}
          />
        </div>
      ))}
    </div>
  )
}
