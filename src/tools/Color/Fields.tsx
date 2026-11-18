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

/**
 * 吸管图标。@ant-design/icons 里没有滴管（只有 BgColors / FontColors），
 * 照 antd 图标的约定画一个：24px、currentColor 描边，随按钮文字色走，暗色模式不用另配。
 */
function EyeDropperIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </svg>
  )
}

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
                icon={<EyeDropperIcon />}
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
