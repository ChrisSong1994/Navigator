import {
  ClearOutlined,
  DeleteOutlined,
  ExportOutlined,
  HistoryOutlined,
  SaveOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Empty, Popover, Tooltip } from 'antd'
import type { ReactNode } from 'react'

import Copy from '../../components/Copy.tsx'
import type { HistoryItem } from '../../lib/history.ts'
import { formatTime } from '../../lib/util.ts'

/**
 * 编辑器上方那排图标按钮，照 JSON 工具的工具栏写：
 * 复制 → 导入 → 保存 → 历史 → 【弹出窗口 / 同步】→ 清除。
 *
 * 原项目这一段是注释掉的（导入/下载下拉菜单），只留了空的 SAVE_ICON / IMPORT_ICON 常量；
 * 这里接上，动作与 JSON 工具一致（导入 / 导出 .md / 历史 / 弹窗）。
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

export interface ToolbarProps {
  value: string
  history: HistoryItem[]
  /** 当前处于弹窗模式：最后一个动作从「弹出到独立窗口」换成「同步到主窗口」 */
  popup: boolean
  onImport: () => void
  onSave: () => void
  onClear: () => void
  onPickHistory: (item: HistoryItem) => void
  onDeleteHistory: (item: HistoryItem) => void
  onClearHistory: () => void
  onOpenPopup: () => void
  onSyncToMain: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { history } = props

  const historyList = (
    <div className="markdown-tool-history">
      <div className="markdown-tool-history-title">
        <span>历史记录</span>
        {/* 原项目靠「回读某个文件失败就删掉这条」顺带清理，浏览器里回读不存在了，
            替代动作就是给一个明面上的清空入口，否则历史只进不出 */}
        <Button type="text" size="small" icon={<ClearOutlined />} onClick={props.onClearHistory}>
          清空
        </Button>
      </div>
      {history.length ? (
        history.map((item) => (
          <div className="markdown-tool-history-row" key={item.id}>
            <button
              type="button"
              className="markdown-tool-history-item"
              disabled={item.contentOmitted}
              title={item.contentOmitted ? '这条内容过大，没有保留下来' : item.name}
              onClick={() => props.onPickHistory(item)}
            >
              <span className="markdown-tool-history-info">
                <span className="markdown-tool-history-name">{item.name}</span>
                <span className="markdown-tool-history-date">{formatTime(item.time)}</span>
              </span>
              <span className="markdown-tool-history-note">
                {item.contentOmitted ? '内容过大，未保留' : '点击回填'}
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
        <div className="markdown-tool-history-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
        </div>
      )}
    </div>
  )

  return (
    <div className="markdown-tool-toolbar">
      <Copy value={props.value} />
      <ToolbarButton title="导入" icon={<UploadOutlined />} onClick={props.onImport} />
      <ToolbarButton title="保存" icon={<SaveOutlined />} onClick={props.onSave} />

      <Popover placement="bottomLeft" trigger="click" content={historyList}>
        <Button
          type="text"
          icon={<HistoryOutlined />}
          aria-label="历史记录"
          data-active={history.length ? 'true' : undefined}
        />
      </Popover>

      <span className="markdown-tool-toolbar-spacer" />

      {props.popup ? (
        <ToolbarButton title="同步到主窗口" icon={<SyncOutlined />} onClick={props.onSyncToMain} />
      ) : (
        <ToolbarButton title="弹出到独立窗口" icon={<ExportOutlined />} onClick={props.onOpenPopup} />
      )}
      <ToolbarButton title="清除" icon={<DeleteOutlined />} onClick={props.onClear} />
    </div>
  )
}
