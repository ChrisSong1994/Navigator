/**
 * 颜色换算与文本解析。
 *
 * 原版这些活分在两处：react-color 的 `helpers/color`（里子是 tinycolor2）负责 hex / rgb / hsl / hsv
 * 与各种校验，`pages/Color/convert.ts` 负责 cmyk。这里合成一份纯函数，好处是能直接进
 * `scripts/check-tools.mjs` 冒烟 —— 颜色算错一步用户当场就能看见，值得有断言兜着。
 *
 * 口径跟原版一致：hex 是小写 `#rrggbb`，rgb 取整到 0..255，hsl / hsv 的 s / l / v 是 0..1 的小数
 * （h 是 0..360，显示时才乘 100 补上 ° 和 %）。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsv {
  h: number
  s: number
  v: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export interface Cmyk {
  c: number
  m: number
  y: number
  k: number
}

/** hsv 是唯一真相，其余三个由它派生（见 derive） */
export interface ColorValue {
  hsv: Hsv
  rgb: Rgb
  hsl: Hsl
  hex: string
}

/** 界面上那五格输入框，键名对应各自的标签 */
export type ColorKind = 'hex' | 'rgb' | 'hsv' | 'hsl' | 'cmyk'

/** 每格输入框里数字的个数：rgb / hsv / hsl 三个，cmyk 四个，hex 走另一条路 */
const ARITY: Record<Exclude<ColorKind, 'hex'>, number> = { rgb: 3, hsv: 3, hsl: 3, cmyk: 4 }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

/** 把角度收进 [0, 360) */
export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0
  return ((hue % 360) + 360) % 360
}

/**
 * 百分数和小数的两种写法都收：50 → 0.5，0.5 → 0.5。
 * 原版 convert.ts 的 formatCmyk 就是这条规矩（`c > 1 ? c / 100 : c`），这里推广到 hsv / hsl。
 */
function toFraction(value: number): number {
  return clamp01(value > 1 ? value / 100 : value)
}

/* 十六进制 ---------------------------------------------------------------- */

/** 认 #rgb / #rgba / #rrggbb / #rrggbbaa（tinycolor 也认这几个），transparent 之类不认 */
export function isValidHex(text: unknown): boolean {
  return typeof text === 'string' && /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text.trim())
}

/** 非法输入退成黑色，调用方先用 isValidHex 挡一道 */
export function hexToRgb(hex: string): Rgb {
  const text = String(hex ?? '')
    .trim()
    .replace(/^#/, '')
  // 缩写补位：#1d2 → #11dd22
  const expanded = text.length <= 4 ? text.replace(/./g, (char) => char + char) : text
  return {
    r: parseInt(expanded.slice(0, 2), 16) || 0,
    g: parseInt(expanded.slice(2, 4), 16) || 0,
    b: parseInt(expanded.slice(4, 6), 16) || 0,
  }
}

export function rgbToHex(rgb: Rgb): string {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/* rgb / hsv / hsl --------------------------------------------------------- */

export function rgbToHsv(rgb: Rgb): Hsv {
  const r = clamp(rgb.r, 0, 255) / 255
  const g = clamp(rgb.g, 0, 255) / 255
  const b = clamp(rgb.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }

  return { h: normalizeHue(h), s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb(hsv: Hsv): Rgb {
  const h = normalizeHue(hsv.h)
  const s = clamp01(hsv.s)
  const v = clamp01(hsv.v)
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  // 色相环六段：0-60 红→黄、60-120 黄→绿 …… 每段哪个通道最大是固定的
  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = clamp(rgb.r, 0, 255) / 255
  const g = clamp(rgb.g, 0, 255) / 255
  const b = clamp(rgb.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }

  return {
    h: normalizeHue(h),
    s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)),
    l,
  }
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = normalizeHue(hsl.h)
  const s = clamp01(hsl.s)
  const l = clamp01(hsl.l)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/* cmyk ------------------------------------------------------------------- */

// 下面两条搬自原版 pages/Color/convert.ts，只改了参数名
export function rgbToCmyk(rgb: Rgb): Cmyk {
  const r = clamp(rgb.r, 0, 255) / 255
  const g = clamp(rgb.g, 0, 255) / 255
  const b = clamp(rgb.b, 0, 255) / 255
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 }
  return {
    c: clamp01((1 - r - k) / (1 - k)),
    m: clamp01((1 - g - k) / (1 - k)),
    y: clamp01((1 - b - k) / (1 - k)),
    k: clamp01(k),
  }
}

export function cmykToRgb(cmyk: Cmyk): Rgb {
  const c = clamp01(cmyk.c)
  const m = clamp01(cmyk.m)
  const y = clamp01(cmyk.y)
  const k = clamp01(cmyk.k)
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  }
}

/* 派生值与输入解析 ------------------------------------------------------- */

/**
 * hsv 是唯一真相，另外三个都由它算出来。
 *
 * 灰阶（s = 0，纯黑 / 纯白 / 灰）时色相在数学上没有意义，但界面上那根色相条的位置得留着 ——
 * 原版 ColorWrap 靠 oldHue 干这件事（`if (hsl.s === 0) hsl.h = oldHue`），这里直接让 hsl.h 跟上 hsv.h。
 */
export function derive(hsv: Hsv): ColorValue {
  const safe: Hsv = { h: normalizeHue(hsv.h), s: clamp01(hsv.s), v: clamp01(hsv.v) }
  const rgb = hsvToRgb(safe)
  const hsl = rgbToHsl(rgb)
  if (hsl.s === 0) hsl.h = safe.h
  return { hsv: safe, rgb, hsl, hex: rgbToHex(rgb) }
}

/** 由 rgb 反推 hsv；灰阶时保留调用方传进来的色相，别让色相条跳回 0（原版 oldHue 的等价物） */
export function hsvFromRgb(rgb: Rgb, fallbackHue = 0): Hsv {
  const hsv = rgbToHsv(rgb)
  if (hsv.s === 0) hsv.h = normalizeHue(fallbackHue)
  return hsv
}

/**
 * 把一格输入框里的文本拆成数字：剥掉 ° 和 %，按逗号分段，个数对得上且全是数字才算数，
 * 否则返回 null。原版这一步是 react-color 的 isvalidColorString，判不过就什么都不发生 ——
 * 输入框里留着用户正在打的字，不打断他。
 */
export function parseColorString(kind: ColorKind, text: unknown): number[] | null {
  if (kind === 'hex' || typeof text !== 'string') return null
  const parts = text.split(',').map((part) => part.replace(/[°%\s]/g, ''))
  if (parts.length !== ARITY[kind]) return null
  const values = parts.map((part) => (part === '' ? Number.NaN : Number(part)))
  return values.every((value) => Number.isFinite(value)) ? values : null
}

/**
 * 输入框那一格 → hsv。五格各走各的路：
 * hex / rgb / hsl / cmyk 先落到 rgb 再反推 hsv，hsv 一格直连（省掉一次 rgb 取整的来回量化）。
 */
export function hsvFromInput(kind: ColorKind, text: unknown, fallbackHue = 0): Hsv | null {
  if (kind === 'hex') {
    const raw = typeof text === 'string' ? text.trim() : ''
    return isValidHex(raw) ? hsvFromRgb(hexToRgb(raw), fallbackHue) : null
  }

  const values = parseColorString(kind, text)
  if (!values) return null

  if (kind === 'hsv') {
    return {
      h: normalizeHue(values[0]),
      s: toFraction(values[1]),
      v: toFraction(values[2]),
    }
  }

  let rgb: Rgb
  if (kind === 'rgb') {
    rgb = { r: clamp(values[0], 0, 255), g: clamp(values[1], 0, 255), b: clamp(values[2], 0, 255) }
  } else if (kind === 'hsl') {
    // 原版这一格有毛病：它把 HSL 拆出来的三个数当成 hsv 塞给 tinycolor（`{ h, s, v, source: 'hsl' }`），
    // tinycolor 按键名认 hsv，于是「输 HSL 出来的是 HSV」。这里按 hsl 正确换算，是有意修的。
    rgb = hslToRgb({ h: values[0], s: toFraction(values[1]), l: toFraction(values[2]) })
  } else {
    rgb = cmykToRgb({
      c: toFraction(values[0]),
      m: toFraction(values[1]),
      y: toFraction(values[2]),
      k: toFraction(values[3]),
    })
  }

  return hsvFromRgb(rgb, fallbackHue)
}
