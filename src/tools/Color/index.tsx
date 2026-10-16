/**
 * 颜色工具。原项目 pages/Color/index.tsx 的界面与交互照搬，篮子外的东西换成浏览器能力：
 *
 * - 取色面板：原版深依赖 react-color（ColorWrap / Hue / Saturation / GooglePointer + helpers/color），
 *   这里自己画，见 Picker.tsx；换算与校验全在 lib/color.ts。
 * - 记录：原版存 Electron 的 userData，这里存 localStorage，见 lib/records.ts。
 * - 吸入屏幕上的颜色（EyeDropper）、复制色值走浏览器 API。
 */
import { FormOutlined } from '@ant-design/icons'
import { Button, Empty } from 'antd'
import { useMemo, useState } from 'react'

import { useConfig } from '../../config/configContext.ts'
import { DEFAULT_PRIMARY_COLOR } from '../../config/schema.ts'
import Picker from './Picker.tsx'
import ColorRecordList from './Record.tsx'
import { derive, hexToRgb, hsvFromInput, hsvFromRgb } from './lib/color.ts'
import type { ColorKind, Hsv } from './lib/color.ts'
import { addRecord, readRecords, writeRecords } from './lib/records.ts'
import type { ColorRecord } from './lib/records.ts'
import './Color.css'

export default function ColorTool() {
  const { settings } = useConfig()

  // 原版开局是应用主题色（THEME_COLOR），这里对应配置里的主色。只当初始值，之后再改主色不会动它。
  const [hsv, setHsv] = useState<Hsv>(() =>
    hsvFromRgb(hexToRgb(settings.primaryColor || DEFAULT_PRIMARY_COLOR), 0),
  )
  const value = useMemo(() => derive(hsv), [hsv])
  const [records, setRecords] = useState<ColorRecord[]>(() => readRecords())

  /** 记录下来就得落盘，改完立刻写一次（localStorage 同步写，不值得为它做防抖） */
  const updateRecords = (next: ColorRecord[]) => {
    setRecords(next)
    writeRecords(next)
  }

  // 五格输入框：算不出来（打了一半、写错了）就什么都不做，输入框里留着用户正在打的字
  const handleInput = (kind: ColorKind, text: string) => {
    const next = hsvFromInput(kind, text, hsv.h)
    if (next) setHsv(next)
  }

  const handleRecord = () => {
    updateRecords(addRecord(records, value.hex))
  }

  // 点记录回到那个颜色；灰阶记录的色相没有意义，从 0 起（原版 handleSelect 传的也是 0）
  const handleSelect = (hex: string) => {
    setHsv(hsvFromRgb(hexToRgb(hex), 0))
  }

  return (
    <div className="color-tool-root">
      <Picker value={value} onChange={setHsv} onInput={handleInput} />

      <Button type="primary" icon={<FormOutlined />} onClick={handleRecord}>
        记录一下
      </Button>

      {records.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录数据" />
      ) : (
        <ColorRecordList
          data={records}
          onChange={(next) => updateRecords(next)}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}
