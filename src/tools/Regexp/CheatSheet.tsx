import { Divider, Table } from 'antd'
import type { TableColumnsType } from 'antd'

import { DATASOURCE, EXAMPLE_DATASOURCE } from './lib/cheatsheet.ts'
import type { CheatSheetRow } from './lib/cheatsheet.ts'

/**
 * 正则语法速查表（content 给 Popover 用）。数据在 lib/cheatsheet.ts —— 那句「上游把转义弄丢了」
 * 的说明和数据修正都写在那儿，`pnpm check:tools` 也在那边断言。
 *
 * 样式上游是写死的白底 + `height: calc(100vh - 150px)`，深色模式下白底黑字；这里交给
 * Regexp.css 的 .regexp-tool-cheatsheet，明暗两套都走 --spirit-* token。
 */
const COLUMNS: TableColumnsType<CheatSheetRow> = [
  { title: '语法', dataIndex: 'syntax' },
  { title: '描述', dataIndex: 'description' },
]

// 示例表把「描述」放前面：找「邮箱怎么写」比找那串符号快
const EXAMPLE_COLUMNS: TableColumnsType<CheatSheetRow> = [
  { title: '描述', dataIndex: 'description' },
  { title: '语法', dataIndex: 'syntax' },
]

const CheatSheet = () => {
  return (
    <div className="regexp-tool-cheatsheet">
      <Divider size="small">语法速查表</Divider>
      <Table<CheatSheetRow>
        columns={COLUMNS}
        dataSource={DATASOURCE}
        rowKey="syntax"
        size="small"
        pagination={false}
      />
      <Divider size="small">常用示例</Divider>
      <Table<CheatSheetRow>
        columns={EXAMPLE_COLUMNS}
        dataSource={EXAMPLE_DATASOURCE}
        rowKey="description"
        size="small"
        pagination={false}
      />
    </div>
  )
}

export default CheatSheet