/**
 * URL 解析工具。原项目 pages/UrlParse 是「输入框 + Descriptions」：
 *
 * 1、输入地址实时解析（不是等点按钮才解析）
 * 2、展示长度 / 协议 / 用户名 / 密码 / 主机 / 端口 / 路径 / 哈希 / 查询参数
 * 3、查询参数单独用一层 Descriptions 展开
 * 4、没输入时把字段说明当空态；地址非法时给一句能照着改的提示
 *
 * 上游解析失败时会把上一次的结果留在页面上（`setIsFail` 只改输入框颜色），这里改成
 * 「失败就不展示旧结果」，避免用户以为那是对当前地址的解析。
 */
import { ExportOutlined, GlobalOutlined, SyncOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Input, Tooltip, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { isEmpty } from '../../lib/util.ts'
import { parseUrlRecord, URL_FIELDS } from './lib/url.ts'
import './UrlParse.css'

const LABEL_STYLE = { width: 140 }

const POPUP = {
  windowName: 'navigator-url-popup',
  channelName: 'navigator-url-tool',
  width: 900,
  height: 760,
} as const

const UrlParseTool = () => {
  const [url, setUrl] = useState('')
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)
  const urlRef = useRef(url)

  useEffect(() => {
    urlRef.current = url
  }, [url])

  const trimmed = url.trim()
  const parsed = useMemo(() => parseUrlRecord(trimmed), [trimmed])
  const failed = trimmed !== '' && parsed === null

  const handleOpenPopup = () => {
    const opened = openToolPopup('url', POPUP)
    if (opened.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (opened.status === 'focused') message.info('URL 弹窗已存在，已聚焦')
  }

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前地址递过去
        bridge.send({ type: 'state', value: urlRef.current })
        return
      }
      if (incoming.type === 'state' || incoming.type === 'update') {
        setUrl(incoming.value ?? '')
      }
    })
    bridgeRef.current = bridge

    // 弹窗这边喊一声，主窗口会把当前地址回过来
    if (popup) bridge.send({ type: 'hello' })

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
  }, [popup])

  const handleSyncToMain = () => {
    bridgeRef.current?.send({ type: 'update', value: url })
    message.success('已同步到主窗口')
  }

  return (
    <div className="url-parse-tool-root">
      <div className="url-parse-tool-search-row">
        <Input.Search
          className="url-parse-tool-search"
          allowClear
          size="large"
          placeholder="在这里输入网址..."
          prefix={<GlobalOutlined />}
          status={failed ? 'error' : undefined}
          enterButton="解析"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onSearch={(value) => setUrl(value.trim())}
        />
        {popup ? (
          <Tooltip title="同步到主窗口">
            <Button
              size="large"
              type="text"
              icon={<SyncOutlined />}
              aria-label="同步到主窗口"
              onClick={handleSyncToMain}
            />
          </Tooltip>
        ) : (
          <Tooltip title="弹出到独立窗口">
            <Button
              size="large"
              type="text"
              icon={<ExportOutlined />}
              aria-label="弹出到独立窗口"
              onClick={handleOpenPopup}
            />
          </Tooltip>
        )}
      </div>

      {failed ? (
        <Alert
          className="url-parse-tool-alert"
          type="error"
          showIcon
          message="URL 解析失败"
          description="请确认地址完整，并包含协议，例如 https://example.com/path?q=1。"
        />
      ) : null}

      {parsed ? (
        <Descriptions bordered column={1} size="middle">
          {URL_FIELDS.map((field) => {
            if (field.key === 'searchParams') {
              const entries = Object.entries(parsed.searchParams)
              if (entries.length === 0) return null
              return (
                <Descriptions.Item key={field.key} label={field.key} styles={{ label: LABEL_STYLE }}>
                  <Descriptions bordered column={1} size="small">
                    {entries.map(([key, value]) => (
                      <Descriptions.Item key={key} label={key} styles={{ label: LABEL_STYLE }}>
                        <span className="url-parse-tool-value">{value}</span>
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </Descriptions.Item>
              )
            }

            const value = parsed[field.key]
            if (isEmpty(value)) return null
            return (
              <Descriptions.Item key={field.key} label={field.key} styles={{ label: LABEL_STYLE }}>
                <span className="url-parse-tool-value">{value}</span>
              </Descriptions.Item>
            )
          })}
        </Descriptions>
      ) : (
        <div className="url-parse-tool-guide">
          <Descriptions bordered column={1} size="middle">
            {URL_FIELDS.map((field) => (
              <Descriptions.Item key={field.key} label={field.key} styles={{ label: LABEL_STYLE }}>
                {field.description}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>
      )}
    </div>
  )
}

export default UrlParseTool
