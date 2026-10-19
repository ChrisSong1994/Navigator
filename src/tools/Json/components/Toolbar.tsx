import {
  AlignLeftOutlined,
  ApartmentOutlined,
  ClearOutlined,
  CompressOutlined,
  DeleteOutlined,
  ExportOutlined,
  HistoryOutlined,
  MedicineBoxOutlined,
  SaveOutlined,
  SearchOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Empty, Popover, Tooltip } from 'antd'
import type { ReactNode } from 'react'

import Copy from '../../../components/Copy.tsx'
import type { HistoryItem } from '../../../lib/history.ts'
import { formatTime } from '../../../lib/util.ts'

/**
 * 编辑器上方那排图标按钮，顺序与原项目一致：
 * 复制 → 导入 → 保存 → 美化 → 压缩 → 修复 → 历史 → JSONPath → Graph → 【弹出窗口 / 同步】→ 清除。
 *
 * 原项目用自定义 iconfont，这里全部换成 antd 图标（对应关系见各自的 title）。
 */
function ToolbarButton({
  title,
  icon,
  onClick,
  active,
}: {
  title: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <Tooltip title={title} placement="bottom">
      <Button
        type="text"
        icon={icon}
        aria-label={title}
        data-active={active ? 'true' : undefined}
        onClick={onClick}
      />
    </Tooltip>
  )
}

export interface ToolbarProps {
  value: string
  history: HistoryItem[]
  /** 当前处于弹窗模式：最后一个动作从「弹出到独立窗口」换成「同步到主窗口」 */
  popup: boolean
  jsonPathOpen: boolean
  graphOpen: boolean
  onImport: () => void
  onSave: () => void
  onFormat: () => void
  onCompress: () => void
  onRepair: () => void
  onClear: () => void
  onPickHistory: (item: HistoryItem) => void
  onDeleteHistory: (item: HistoryItem) => void
  onClearHistory: () => void
  onToggleJsonPath: () => void
  onToggleGraph: () => void
  onOpenPopup: () => void
  onSyncToMain: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { history } = props

  const historyList = (
    <div className="json-tool-history">
      <div className="json-tool-history-title">
        <span>历史记录</span>
        {/* 原项目靠「回读某个文件失败就删掉这条」顺带清理，浏览器里回读不存在了，
            替代动作就是给一个明面上的清空入口，否则历史只进不出 */}
        <Button type="text" size="small" icon={<ClearOutlined />} onClick={props.onClearHistory}>
          清空
        </Button>
      </div>
      {history.length ? (
        history.map((item) => {
          // 内容过大没保留下来、但记着来源文件地址的，点一下能按地址重读（见 JsonTool）；
          // 没有来源的（拖入 / 导入来的）就只剩名字，仍然点不动
          const reReadable = Boolean(item.contentOmitted && item.source)
          return (
            <div className="json-tool-history-row" key={item.id}>
              <button
                type="button"
                className="json-tool-history-item"
                disabled={item.contentOmitted && !reReadable}
                title={
                  item.contentOmitted
                    ? reReadable
                      ? '这条内容过大，没有保留下来；点击从源文件重新读取'
                      : '这条内容过大，没有保留下来'
                    : item.name
                }
                onClick={() => props.onPickHistory(item)}
              >
                <span className="json-tool-history-info">
                  <span className="json-tool-history-name">{item.name}</span>
                  <span className="json-tool-history-date">{formatTime(item.time)}</span>
                </span>
                <span className="json-tool-history-note">
                  {item.contentOmitted ? (reReadable ? '内容过大，点击重读' : '内容过大，未保留') : '点击回填'}
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
          )
        })
      ) : (
        <div className="json-tool-history-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
        </div>
      )}
    </div>
  )

  return (
    <div className="json-tool-toolbar">
      <Copy value={props.value} />
      <ToolbarButton title="导入" icon={<UploadOutlined />} onClick={props.onImport} />
      <ToolbarButton title="保存" icon={<SaveOutlined />} onClick={props.onSave} />
      <ToolbarButton title="美化" icon={<AlignLeftOutlined />} onClick={props.onFormat} />
      <ToolbarButton title="压缩" icon={<CompressOutlined />} onClick={props.onCompress} />
      <ToolbarButton title="修复" icon={<MedicineBoxOutlined />} onClick={props.onRepair} />

      <Popover placement="bottomLeft" trigger="click" content={historyList}>
        <Button
          type="text"
          icon={<HistoryOutlined />}
          aria-label="历史记录"
          data-active={history.length ? 'true' : undefined}
        />
      </Popover>

      <ToolbarButton
        title="切换 JSON Path"
        icon={<SearchOutlined />}
        active={props.jsonPathOpen}
        onClick={props.onToggleJsonPath}
      />
      <ToolbarButton
        title="切换 JSON Graph"
        icon={<ApartmentOutlined />}
        active={props.graphOpen}
        onClick={props.onToggleGraph}
      />

      <span className="json-tool-toolbar-spacer" />

      {props.popup ? (
        <ToolbarButton title="同步到主窗口" icon={<SyncOutlined />} onClick={props.onSyncToMain} />
      ) : (
        <ToolbarButton title="弹出到独立窗口" icon={<ExportOutlined />} onClick={props.onOpenPopup} />
      )}
      <ToolbarButton title="清除" icon={<DeleteOutlined />} onClick={props.onClear} />
    </div>
  )
}
