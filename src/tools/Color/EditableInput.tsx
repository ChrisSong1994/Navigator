import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { Button, Tooltip, message } from 'antd'
import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * 带复制按钮的输入框（原 components/EditableInput）。
 *
 * 两处跟原版不一样：
 * 1. 原版的 onChange 出参是 `{ [label.toLowerCase()]: value }` —— 那是 react-color 的 ColorWrap 合同，
 *    这边直接给文本，省掉一层「拿键名猜是哪一格」。
 * 2. 原来用 @emotion/css 摆复制按钮，这里就是一条 .color-tool-input-copy。
 *
 * 有一处行为照搬：正在打字时父组件传下来的新值不覆盖输入框里的字（否则每敲一个字符都会被打回去），
 * 失焦时才回落到父组件认下的那个值。原版靠 blurValue / currentValue 两个 state 绕出来，这里就是一个
 * 「当前是否聚焦」的判断。
 */
interface EditableInputProps {
  label: string
  labelPosition?: 'left' | 'center' | 'right'
  value: string
  onChange: (text: string) => void
  style?: CSSProperties
}

const display = (value: string) => String(value ?? '').toUpperCase()

export default function EditableInput({
  label,
  labelPosition = 'center',
  value,
  onChange,
  style,
}: EditableInputProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => display(value))
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (inputRef.current !== document.activeElement) setText(display(value))
  }, [value])

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current)
    },
    [],
  )

  const handleCopy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板权限被策略挡下时会 reject，别让它变成一个没人处理的 Promise
      message.error('复制失败')
      return
    }
    setCopied(true)
    timer.current = setTimeout(() => setCopied(false), 1000)
  }

  return (
    <div className="color-tool-input-wrap" style={style}>
      <input
        ref={inputRef}
        id={inputId}
        className="color-tool-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(event.target.value)
        }}
        // 失焦回到父组件认下的值：打了一半的残值不留在这儿
        onBlur={() => setText(display(value))}
      />
      <label className={`color-tool-input-label color-tool-input-label-${labelPosition}`} htmlFor={inputId}>
        {label}
      </label>

      <span className="color-tool-input-copy">
        <Tooltip title="复制" placement="bottom">
          <Button
            type="text"
            size="small"
            aria-label={`复制 ${label}`}
            onClick={handleCopy}
            icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
          />
        </Tooltip>
      </span>
    </div>
  )
}
