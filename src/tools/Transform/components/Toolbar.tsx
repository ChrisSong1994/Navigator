import {
  ClearOutlined,
  DeleteOutlined,
  ExportOutlined,
  HistoryOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Empty, Popover, Tooltip } from 'antd'
import type { ReactNode } from 'react'

import Copy from '../../../components/Copy.tsx'
import type { HistoryItem } from '../../../lib/history.ts'
import { formatTime } from '../../../lib/util.ts'

/**
 * 编辑器上方那排图标按钮，照 JSON / Markdown 两个工具的工具栏写：
 * 复制 → 历史 → 【弹出窗口 / 同步】→ 清除。本工具不上传也不下载文件，所以没有导入 / 保存那两项。
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
  /** 复制的是右边那份转换结果 */
  value: string
  history: HistoryItem[]
  /** 当前处于弹窗模式：最后一个动作从「弹出到独立窗口」换成「同步到主窗口」 */
  popup: boolean
  onPickHistory: (item: HistoryItem) => void
  onDeleteHistory: (item: HistoryItem) => void
  onClearHistory: () => void
  onOpenPopup: () => void
  onSyncToMain: () => void
  onClear: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { history } = props

  const historyList = (
    <div className="transform-tool-history">
      <div className="transform-tool-history-title">
        <span>历史记录</span>
        <Button type="text" size="small" icon={<ClearOutlined />} onClick={props.onClearHistory}>
          清空
        </Button>
      </div>
      {history.length ? (
        history.map((item) => (
          <div className="transform-tool-history-row" key={item.id}>
            <button
              type="button"
              className="transform-tool-history-item"
              disabled={item.contentOmitted}
              title={item.contentOmitted ? '这条内容过大，没有保留下来' : item.name}
              onClick={() => props.onPickHistory(item)}
            >
              <span className="transform-tool-history-info">
                <span className="transform-tool-history-name">{item.name}</span>
                <span className="transform-tool-history-date">{formatTime(item.time)}</span>
              </span>
              <span className="transform-tool-history-note">
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
        <div className="transform-tool-history-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
        </div>
      )}
    </div>
  )

  return (
    <div className="transform-tool-toolbar">
      <Copy value={props.value} />

      <Popover placement="bottomLeft" trigger="click" content={historyList}>
        <Button
          type="text"
          icon={<HistoryOutlined />}
          aria-label="历史记录"
          data-active={history.length ? 'true' : undefined}
        />
      </Popover>

      <span className="transform-tool-toolbar-spacer" />

      {props.popup ? (
        <ToolbarButton title="同步到主窗口" icon={<SyncOutlined />} onClick={props.onSyncToMain} />
      ) : (
        <ToolbarButton title="弹出到独立窗口" icon={<ExportOutlined />} onClick={props.onOpenPopup} />
      )}
      <ToolbarButton title="清除" icon={<DeleteOutlined />} onClick={props.onClear} />
    </div>
  )
}
