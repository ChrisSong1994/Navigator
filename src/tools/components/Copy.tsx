import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { Button, Tooltip, message } from 'antd'
import { useEffect, useRef, useState } from 'react'

/**
 * 复制按钮。原项目用 react-copy-to-clipboard + @emotion/css，这里就是一句 navigator.clipboard，
 * 少两个依赖；复制成功那个绿色勾和 1 秒回退照原样。
 */
export default function Copy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current)
    },
    [],
  )

  const handleCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // 剪贴板权限被策略挡下时会 reject，别让它变成一个没人处理的 Promise
      message.error('复制失败')
      return
    }
    setCopied(true)
    timer.current = setTimeout(() => setCopied(false), 1000)
  }

  return (
    <Tooltip title="复制" placement="bottom">
      <Button
        type="text"
        aria-label="复制"
        onClick={handleCopy}
        icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
      />
    </Tooltip>
  )
}
