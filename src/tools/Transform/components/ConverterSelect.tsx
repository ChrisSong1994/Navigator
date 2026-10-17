import { Select } from 'antd'
import { memo } from 'react'

import { CONVERTERS } from '../lib/converters.ts'

/**
 * 转换器下拉。上游标签写的是「语言：」，可下拉里是「JSON 转 YAML」这种转换器，不是语言，改成「转换：」。
 *
 * 另外上游把整个 `TransformOptions`（每条都带一个 `component` 字段，值是 React 组件）直接喂给 antd
 * `Select` 的 `options`，等于让 antd 去序列化组件；这里只传 value / label。
 */
const OPTIONS = CONVERTERS.map((converter) => ({ value: converter.key, label: converter.label }))

export interface ConverterSelectProps {
  value: string
  onChange: (key: string) => void
}

const ConverterSelect = (props: ConverterSelectProps) => (
  <Select
    value={props.value}
    style={{ minWidth: 220 }}
    onChange={props.onChange}
    options={OPTIONS}
    aria-label="转换"
  />
)

export default memo(ConverterSelect)
