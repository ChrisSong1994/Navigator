import { Input } from 'antd'
import type { InputRef } from 'antd'
import { useEffect, useRef, useState } from 'react'

/**
 * 记录标题的就地编辑（原 components/ToggleEditText）：点一下变输入框，失焦或回车提交，
 * 内容空白就回落到 defaultValue。
 *
 * 原版用 @fett/utils 的 isEmpty 判空，这里 value 已经 trim 过，空串本身就是假值，一句就够。
 */
interface ToggleEditTextProps {
  value: string
  defaultValue?: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function ToggleEditText({
  value,
  onChange,
  placeholder = '',
  defaultValue = '未命名',
}: ToggleEditTextProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (text: string) => {
    const next = text.trim()
    onChange(next || defaultValue)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span className="color-tool-record-title" title={value} onClick={() => setEditing(true)}>
        {value}
      </span>
    )
  }

  return (
    <Input
      className="color-tool-record-title-input"
      ref={inputRef}
      placeholder={placeholder}
      defaultValue={value}
      variant="borderless"
      onBlur={(event) => commit(event.target.value)}
      onPressEnter={(event) => commit(event.currentTarget.value)}
    />
  )
}
