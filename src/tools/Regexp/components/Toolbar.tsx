import { ClearOutlined, DeleteOutlined, ExportOutlined, HistoryOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Empty, Popover, Tooltip } from 'antd'
import type { ReactNode } from 'react'

import type { HistoryItem } from '../../../lib/history.ts'
import { formatTime } from '../../../lib/util.ts'

/**
 * 正则工具顶部那排右侧的图标按钮，照 Transform / JSON 的工具栏写：
 * 历史 → 【弹出窗口 / 同步】→ 清除。左边是 pattern 输入与两个下拉，由 index.tsx 摆。
 *
 * 复制按钮不在这里：这个工具能复制的只有「替换结果」，它长在右侧结果面板自己的头部
 * （看匹配结果时没有可复制的东西 —— 原文本来就在左边编辑器里）。
 */
function ToolbarButton({
  title,
  icon,
  onClick,
}: {
  title: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip title={title} placement="bottom">
      <Button type="text" icon={icon} aria-label={title} onClick={onClick} />
    </Tooltip>
  )
}

/** 历史条目旁边那句「这份内容长什么样」：第一行非空内容，够认出来就行 */
function previewOf(content: string): string {
  const line = content.split('\n').find((item) => item.trim()) ?? ''
  return line.trim()
}

export interface ToolbarProps {
  history: HistoryItem[]
  /** 当前处于弹窗模式：最后一个动作从「弹出到独立窗口」换成「同步到主窗口」 */
  popup: boolean
  /** 「清除」清的是待匹配文本；已经是空的就把按钮置灰 */
  canClear: boolean
  onPickHistory: (item: HistoryItem) => void
  onDeleteHistory: (item: HistoryItem) => void
  onClearHistory: () => void
  onOpenPopup: () => void
  onSyncToMain: () => void
  onClear: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { history, popup } = props

  const historyList = (
    <div className="regexp-tool-history">
      <div className="regexp-tool-history-title">
        <span>历史记录</span>
        <Button type="text" size="small" icon={<ClearOutlined />} onClick={props.onClearHistory}>
          清空
        </Button>
      </div>
      {history.length ? (
        history.map((item) => (
          <div className="regexp-tool-history-row" key={item.id}>
            <button
              type="button"
              className="regexp-tool-history-item"
              disabled={item.contentOmitted}
              title={item.contentOmitted ? '这条内容过大，没有保留下来' : item.name}
              onClick={() => props.onPickHistory(item)}
            >
              <span className="regexp-tool-history-info">
                <span className="regexp-tool-history-name">{item.name}</span>
                <span className="regexp-tool-history-date">{formatTime(item.time)}</span>
              </span>
              <span className="regexp-tool-history-note">
                {item.contentOmitted ? '内容过大，未保留' : previewOf(item.content)}
              </span>
            </button>
            <Tooltip title="删除这条">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除历史 ${item.name}`}
                onClick={() => props.onDeleteHistory(item)}
              />
            </Tooltip>
          </div>
        ))
      ) : (
        <div className="regexp-tool-history-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
        </div>
      )}
    </div>
  )

  return (
    <div className="regexp-tool-toolbar-right">
      <Tooltip title="历史记录" placement="bottom">
        <Popover placement="bottomRight" trigger="click" content={historyList}>
          <Button
            type="text"
            icon={<HistoryOutlined />}
            aria-label="历史记录"
            data-active={history.length ? 'true' : undefined}
          />
        </Popover>
      </Tooltip>

      {popup ? (
        <ToolbarButton title="同步到主窗口" icon={<SyncOutlined />} onClick={props.onSyncToMain} />
      ) : (
        <ToolbarButton title="弹出到独立窗口" icon={<ExportOutlined />} onClick={props.onOpenPopup} />
      )}
      <Tooltip title="清除待匹配文本" placement="bottom">
        <Button
          type="text"
          icon={<DeleteOutlined />}
          aria-label="清除待匹配文本"
          disabled={!props.canClear}
          onClick={props.onClear}
        />
      </Tooltip>
    </div>
  )
}