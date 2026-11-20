import { Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'

import type { RegexpMatch, RegexpMatchGroup } from '../lib/regex.ts'

/** 一页 20 行；条数多的时候翻页比无限滚动好定位 */
const PAGE_SIZE = 20

interface MatchTableProps {
  matches: RegexpMatch[]
  /** 当前展开 / 选中的那一处，与高亮区联动；null 表示都没选 */
  activeKey: number | null
  onSelect: (key: number | null) => void
}

type MatchRow = RegexpMatch

const columns: TableColumnsType<MatchRow> = [
  { title: '#', dataIndex: 'key', width: 56, align: 'right' },
  {
    title: '位置',
    key: 'range',
    width: 130,
    render: (_, row) => (
      <span className="regexp-tool-num">{`[${row.index}, ${row.index + row.length})`}</span>
    ),
  },
  { title: '长度', dataIndex: 'length', width: 72, align: 'right' },
  {
    title: '匹配内容',
    key: 'value',
    render: (_, row) =>
      row.length === 0 ? (
        <span className="regexp-tool-muted">（零宽匹配）</span>
      ) : (
        <span className="regexp-tool-match-value">{row.value}</span>
      ),
  },
]

/** 分组表：上游把它塞进浮层里，这里放在行展开区 —— 能一次对着看几处，不用来回点 */
function GroupTable({ groups }: { groups: RegexpMatchGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="regexp-tool-muted regexp-tool-groups-empty">这个 pattern 没有捕获分组</div>
    )
  }

  return (
    <div className="regexp-tool-groups">
      {groups.map((group) => (
        <div className="regexp-tool-group-row" key={group.key}>
          <span className="regexp-tool-group-key">
            {group.name ? `$${group.key} <${group.name}>` : `$${group.key}`}
          </span>
          <span className="regexp-tool-num">
            {group.index === null ? '—' : `[${group.index}, ${group.index + group.length})`}
          </span>
          {group.value === undefined ? (
            <span className="regexp-tool-muted">未参与匹配</span>
          ) : group.length === 0 ? (
            <span className="regexp-tool-muted">（空）</span>
          ) : (
            <span className="regexp-tool-match-value">{group.value}</span>
          )}
        </div>
      ))}
    </div>
  )
}

const MatchTable = (props: MatchTableProps) => {
  const { matches, activeKey, onSelect } = props
  /** 用户自己翻到的那一页。选中某处时的页不存这里，由 activeKey 推出来 */
  const [page, setPage] = useState(1)

  /**
   * 实际翻到哪一页，渲染期直接算，不靠 effect 同步：
   *
   * - 选中某处（点高亮、点行）时永远停在它那一页 —— 否则「展开了却看不见」；
   * - 否则用用户翻到的那页，但按当前结果条数夹一下：结果变少以后旧页码可能已经不存在。
   */
  const lastPage = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const current = activeKey === null
    ? Math.min(page, lastPage)
    : Math.min(Math.ceil(activeKey / PAGE_SIZE), lastPage)

  return (
    <Table<MatchRow>
      className="regexp-tool-table"
      size="small"
      rowKey="key"
      dataSource={matches}
      columns={columns}
      pagination={{
        current,
        pageSize: PAGE_SIZE,
        hideOnSinglePage: true,
        size: 'small',
        onChange: setPage,
      }}
      expandable={{
        // 与高亮区联动：点高亮处就展开这行，点行也回设高亮
        expandedRowKeys: activeKey === null ? [] : [activeKey],
        onExpand: (expanded, record) => onSelect(expanded ? record.key : null),
        expandedRowRender: (record) => <GroupTable groups={record.groups} />,
      }}
      onRow={(record) => ({
        // 点已经展开的那一行就收起来
        onClick: () => onSelect(record.key === activeKey ? null : record.key),
        className: record.key === activeKey ? 'regexp-tool-row-active' : undefined,
      })}
    />
  )
}

export default MatchTable