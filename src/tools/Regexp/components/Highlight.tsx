import { memo } from 'react'
import type { ReactNode } from 'react'

import { MAX_HIGHLIGHT } from '../lib/regex.ts'
import type { RegexpMatch } from '../lib/regex.ts'

export interface HighlightProps {
  text: string
  matches: RegexpMatch[]
  /** 当前选中的那一处（明细表里展开的那行）；点高亮处回设 */
  activeKey: number | null
  onSelect: (key: number) => void
}

/**
 * 原文高亮。上游是给每一处匹配套一个 Popover（`<Popover><b>…</b></Popover>`），命中上千处就是
 * 上千个浮层实例；这里只画 <mark>，点一下回设 activeKey，信息在明细表里看。
 *
 * 零宽匹配（`^`、`\b`、`(?=…)`）长度为 0，<mark> 里没有内容，屏幕上什么都看不见 ——
 * 画成一条 2px 的竖线，既能看见也能点。
 *
 * 渲染量单独限流到 MAX_HIGHLIGHT：明细表可以列 5000 条（受 MAX_MATCHES 限），
 * 但 5000 个 DOM 节点会把滚动拖垮。超出的部分照原样当普通文本显示，调用方在状态行说明。
 */
const Highlight = (props: HighlightProps) => {
  const { text, matches, activeKey, onSelect } = props

  const visible = matches.slice(0, MAX_HIGHLIGHT)
  const parts: ReactNode[] = []
  let cursor = 0

  for (const match of visible) {
    // 区间应当单调递增；防御一下异常的 lastIndex（理论上不会，但宁可少画不乱画）
    if (match.index < cursor) continue
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))

    const zeroWidth = match.length === 0
    parts.push(
      <mark
        key={match.key}
        className={zeroWidth ? 'regexp-tool-mark regexp-tool-mark-zero' : 'regexp-tool-mark'}
        data-active={activeKey === match.key ? 'true' : undefined}
        data-parity={match.key % 2 === 0 ? 'even' : 'odd'}
        role="button"
        tabIndex={0}
        title={`第 ${match.key} 处：${match.value || '（零宽匹配）'}`}
        onClick={() => onSelect(match.key)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(match.key)
          }
        }}
      >
        {zeroWidth ? '' : match.value}
      </mark>,
    )
    cursor = match.index + match.length
  }

  if (cursor < text.length) parts.push(text.slice(cursor))

  return <div className="regexp-tool-highlight">{parts}</div>
}

export default memo(Highlight)