import { BgColorsOutlined } from '@ant-design/icons'
import { Button, Col, Row, Tooltip, message } from 'antd'

import EditableInput from './EditableInput.tsx'
import type { Cmyk, ColorKind, Hsl, Hsv, Rgb } from './lib/color.ts'

/**
 * 取色面板下面那五格输入框（原 Fields.tsx）：HEX 占满一行，右边挂吸色按钮，
 * 下面 RGB / CMYK / HSV / HSL 四个各占四分之一。文案带 ° 和 %，跟原版一致。
 *
 * 判定和换算全交给 lib/color.ts 的 hsvFromInput：写错就什么都不发生（输入框里留着用户正在打的字）。
 */

/** 原版写死 span={6}，窄屏会挤成一团，这里按断点摊开 */
const FIELD_COL = { xs: 24, sm: 12, lg: 6 }

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

interface FieldsProps {
  rgb: Rgb
  hsl: Hsl
  hsv: Hsv
  cmyk: Cmyk
  hex: string
  onChange: (kind: ColorKind, text: string) => void
}

export default function Fields({ rgb, hsl, hsv, cmyk, hex, onChange }: FieldsProps) {
  const rgbValue = `${rgb.r}, ${rgb.g}, ${rgb.b}`
  const hslValue = `${Math.round(hsl.h)}°, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%`
  const hsvValue = `${Math.round(hsv.h)}°, ${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`
  const cmykValue = `${Math.round(cmyk.c * 100)}%, ${Math.round(cmyk.m * 100)}%, ${Math.round(cmyk.y * 100)}%, ${Math.round(cmyk.k * 100)}%`

  // Chrome / Edge 有，Firefox / Safari 没有，也不在 lib.dom 的类型里，就地取一下
  const handleEyeDropper = () => {
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
    if (!EyeDropper) {
      message.warning('当前浏览器不支持吸色')
      return
    }
    new EyeDropper()
      .open()
      .then((result) => onChange('hex', result.sRGBHex))
      .catch((error: unknown) => {
        // 用户按 Esc 取消会以 AbortError reject，那不是毛病，别往控制台里刷
        if ((error as DOMException)?.name !== 'AbortError') console.warn('handleEyeDropper error', error)
      })
  }

  return (
    <section className="color-tool-fields">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <div className="color-tool-fields-hex">
            <EditableInput
              style={{ flex: 1 }}
              labelPosition="center"
              label="HEX"
              value={hex}
              onChange={(text) => onChange('hex', text)}
            />
            <Tooltip placement="bottom" title="吸取颜色">
              <Button
                type="text"
                aria-label="吸取颜色"
                style={{ margin: '0 8px' }}
                icon={<BgColorsOutlined />}
                onClick={handleEyeDropper}
              />
            </Tooltip>
          </div>
        </Col>
        <Col {...FIELD_COL}>
          <EditableInput labelPosition="left" label="RGB" value={rgbValue} onChange={(text) => onChange('rgb', text)} />
        </Col>
        <Col {...FIELD_COL}>
          <EditableInput
            labelPosition="left"
            label="CMYK"
            value={cmykValue}
            onChange={(text) => onChange('cmyk', text)}
          />
        </Col>
        <Col {...FIELD_COL}>
          <EditableInput labelPosition="left" label="HSV" value={hsvValue} onChange={(text) => onChange('hsv', text)} />
        </Col>
        <Col {...FIELD_COL}>
          <EditableInput labelPosition="left" label="HSL" value={hslValue} onChange={(text) => onChange('hsl', text)} />
        </Col>
      </Row>
    </section>
  )
}
