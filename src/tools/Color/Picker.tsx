import { useMemo, useRef } from 'react'

import Fields from './Fields.tsx'
import { clamp01, rgbToCmyk } from './lib/color.ts'
import type { ColorKind, ColorValue, Hsv } from './lib/color.ts'

/**
 * 取色面板（原 Picker.tsx）。
 *
 * 原版是 `ColorWrap(Color)` —— 状态、色相换算、指针组件（GooglePointer / GooglePointerCircle）、
 * 拖拽监听全在 react-color 里。这里自己画：横轴饱和度、纵轴明度的方板用两层 CSS 渐变叠出来，
 * 色相条是一条六段渐变，两处指针就是白圈；拖拽走 Pointer Events，不再往 window 上挂 mousemove。
 *
 * 状态不在这儿：面板只报「新的 hsv 是多少」，派生值由 index.tsx 算。
 */

const PANEL_STEP = 0.01

interface PickerProps {
  value: ColorValue
  /** 拖面板 / 色相条 */
  onChange: (hsv: Hsv) => void
  /** 五格输入框 */
  onInput: (kind: ColorKind, text: string) => void
}

export default function Picker({ value, onChange, onInput }: PickerProps) {
  const { hsv, rgb, hsl, hex } = value
  const cmyk = useMemo(() => rgbToCmyk(rgb), [rgb])

  const panelRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  // 一根指针按住就一直归它拖，指针事件本身不区分「按下前」和「按下中」
  const dragging = useRef(false)

  const moveSaturation = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange({
      ...hsv,
      s: clamp01((clientX - rect.left) / rect.width),
      v: 1 - clamp01((clientY - rect.top) / rect.height),
    })
  }

  const moveHue = (clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect) return
    // 取整到度、360 收成 0，原版 react-color 的 Hue 也是这个口径
    onChange({ ...hsv, h: Math.round(clamp01((clientX - rect.left) / rect.width) * 360) % 360 })
  }

  const capture = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    // 捕获指针，拖出面板边界还能收到 move
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePanelDown = (event: React.PointerEvent<HTMLDivElement>) => {
    capture(event)
    moveSaturation(event.clientX, event.clientY)
  }

  const handlePanelMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveSaturation(event.clientX, event.clientY)
  }

  const handleHueDown = (event: React.PointerEvent<HTMLDivElement>) => {
    capture(event)
    moveHue(event.clientX)
  }

  const handleHueMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveHue(event.clientX)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // 键盘微调：原版 react-color 也能用方向键，这里一方板一次 1%、色相条一次 1°
  const handleSaturationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, Hsv> = {
      ArrowLeft: { ...hsv, s: clamp01(hsv.s - PANEL_STEP) },
      ArrowRight: { ...hsv, s: clamp01(hsv.s + PANEL_STEP) },
      ArrowUp: { ...hsv, v: clamp01(hsv.v + PANEL_STEP) },
      ArrowDown: { ...hsv, v: clamp01(hsv.v - PANEL_STEP) },
    }
    const next = keys[event.key]
    if (!next) return
    event.preventDefault()
    onChange(next)
  }

  const handleHueKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    onChange({ ...hsv, h: (hsv.h + step + 360) % 360 })
  }

  return (
    <div className="color-tool-picker">
      <div className="color-tool-select">
        <div className="color-tool-swatch" style={{ background: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` }} />
        <div
          ref={panelRef}
          className="color-tool-saturation"
          tabIndex={0}
          aria-label="饱和度和明度"
          onPointerDown={handlePanelDown}
          onPointerMove={handlePanelMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleSaturationKeyDown}
        >
          {/* 下层是白→纯色的横向渐变（饱和度），上层是透明→黑（明度） */}
          <div
            className="color-tool-saturation-gradient"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
            }}
          />
          <span
            className="color-tool-pointer"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>
      </div>

      <div
        ref={hueRef}
        className="color-tool-hue"
        tabIndex={0}
        aria-label="色相"
        onPointerDown={handleHueDown}
        onPointerMove={handleHueMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleHueKeyDown}
      >
        <span className="color-tool-pointer color-tool-pointer-hue" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>

      <div>
        <Fields rgb={rgb} hsl={hsl} hsv={hsv} cmyk={cmyk} hex={hex} onChange={onInput} />
      </div>
    </div>
  )
}
