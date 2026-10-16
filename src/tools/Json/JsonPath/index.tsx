import { CaretDownOutlined, FileSearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input, Space } from 'antd'
import { JSONPathJS } from 'jsonpath-js'
import { memo, useMemo, useState } from 'react'

import BaseEditor from '../components/Editor/BaseEditor.tsx'
import { EEditorLanguage } from '../components/Editor/index.ts'
import CheatSheet from './CheatSheet.tsx'

/** 结果面板是只读输出，给它一个固定的高（外层再按可用高度约束） */
const RESULT_STYLE = { height: '100%' }

/** jsonpath-js 没有导出它的 JsonValue 类型，从 find 的入参上取 */
type JsonInput = Parameters<JSONPathJS['find']>[0]

/**
 * JSONPath 查询面板。取值走 jsonpath-js 的 JSONPathJS(表达式).find(数据)，跟原项目一致。
 *
 * 与原来的差别：`value` 换成「解析成功的那个对象，没解析通就是 null」，没通的时候直接说明白，
 * 而不是拿一个空的 {} 去查询，让人以为表达式写错了。
 */
function JsonPath(props: { value: unknown | null }) {
  const [jsonpath, setJsonpath] = useState('$')

  // 查询是纯计算，渲染期算出来就行，不必先进 state 再补一次渲染
  const { result, error } = useMemo(() => {
    if (props.value === null) return { result: '', error: '' }
    try {
      const found = new JSONPathJS(jsonpath).find(props.value as JsonInput)
      return { result: JSON.stringify(found, null, 2) ?? '', error: '' }
    } catch (caught) {
      return { result: '', error: (caught as Error).message }
    }
  }, [jsonpath, props.value])

  const cheatSheet = useMemo(() => <CheatSheet />, [])

  return (
    <div className="json-tool-jsonpath">
      <div className="json-tool-jsonpath-header">
        <Input
          allowClear
          size="large"
          addonBefore="JSONPath"
          placeholder="输入 JSONPath 表达式"
          value={jsonpath}
          onChange={(event) => setJsonpath(event.target.value)}
        />
        <Dropdown trigger={['click']} popupRender={() => cheatSheet}>
          <Button style={{ width: 140, marginLeft: 12 }} type="primary" size="large">
            <Space>
              <FileSearchOutlined /> 语法参考
              <CaretDownOutlined />
            </Space>
          </Button>
        </Dropdown>
      </div>

      <div
        className={
          error || props.value === null
            ? 'json-tool-jsonpath-text is-error'
            : 'json-tool-jsonpath-text is-tip'
        }
      >
        {props.value === null
          ? '左侧内容还不是合法 JSON，先把它改对（或点「修复」）再查。'
          : error || '输入符合 JSONPath 的表达式，点击「语法参考」查看更多语法。'}
      </div>

      <BaseEditor
        style={RESULT_STYLE}
        language={EEditorLanguage.JSON}
        value={result}
        tipShow={false}
        editable={false}
      />
    </div>
  )
}

export default memo(JsonPath)
