import type { NavLink } from '../config/schema.ts'

const ICON_COLORS = ['#1677ff', '#13c2c2', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#f5222d', '#2f54eb']

function colorFor(text: string): string {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return ICON_COLORS[hash % ICON_COLORS.length]
}

/** 有图标用图标，没有图标用首字母色块兜底 */
export function LinkIcon({ link, size = 16 }: { link: NavLink; size?: number }) {
  if (link.icon) {
    return (
      <img
        src={link.icon}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className="shrink-0 rounded-[3px] object-contain"
        style={{ width: size, height: size }}
      />
    )
  }
  const label = Array.from(link.text)[0] ?? '?'
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[3px] font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(link.text), fontSize: Math.round(size * 0.62), lineHeight: 1 }}
    >
      {label}
    </span>
  )
}
