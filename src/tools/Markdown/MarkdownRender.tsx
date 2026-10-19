import { UploadOutlined } from '@ant-design/icons'
import { Viewer } from '@bytemd/react'
import { Button, Empty } from 'antd'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { PLUGINS } from './plugins.ts'

/** 目录里的一条标题 */
interface Heading {
  /** 1-6，对应 h1-h6 */
  level: number
  text: string
}

/** 层级换算缩进时的兜底基准：最浅的一级不缩进（真正的基准取文档里最浅的那个标题） */
const MIN_HEADING_LEVEL = 1

/** 标题越过栏顶多少像素算「当前这一节」，留一点余量免得刚好压线时来回跳 */
const ACTIVE_MARKER = 8

/** 距底不足这么多像素就算「滚到底了」，此时直接点亮最后一条（见 handleScroll） */
const BOTTOM_EPSILON = 2

/** 标题文字：标题里可以有换行或行尾空格，目录里要单行、干净 */
function cleanHeadingText(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 演示模式：只读渲染整份文档，左侧是文档目录。
 *
 * 渲染直接用 `@bytemd/react` 的 `Viewer` —— 和编辑模式的 `Editor` 同一个包、同一份 plugins、
 * 同一条 hast 管线，输出的就是编辑器预览区那段 `div.markdown-body`，两边长得一模一样，
 * 不用再引一个 markdown 渲染器（也就不会出现预览与演示两套排版）。
 *
 * 目录里的标题**从渲染后的 DOM 里取**，不自己扫一遍 markdown 源码：bytemd 自己的侧栏 TOC 就是
 * 这么做的（见 node_modules/bytemd/dist/index.js 里预览区的 `querySelectorAll('h1,...')`）。
 * 扫源码的话 setext 标题（`===` 下划线那种）、代码块里的 `#`、frontmatter 都得自己照顾一遍，
 * 而 DOM 里的就是真正渲染出来的东西，永远对得上。锚点也顺带成立：标题带 `user-content-` 前缀的 id。
 *
 * 高度还是 useFillHeight 量出来的（和编辑模式同一套），滚动发生在正文那一栏内部，不是整页滚。
 */
export function MarkdownRender({
  value,
  fileName,
  emptyReason,
  onUpload,
}: {
  value: string
  fileName: string | null
  /** 打开地址栏那份本地文件失败时的说明（见 index.tsx 的 readFailure）：空态说的就不是「还没有文档」了 */
  emptyReason?: string | null
  /** 空文档时那个「上传 Markdown」按钮，接的是工具栏的导入 */
  onUpload: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  // 不留余量：正文一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)

  const [headings, setHeadings] = useState<Heading[]>([])
  const [active, setActive] = useState(0)
  /** 最浅的那一级，缩进的基准（文档从 h2 起的话，h2 就是第一层，不缩进） */
  const [baseLevel, setBaseLevel] = useState(MIN_HEADING_LEVEL)
  /** 标题元素表，与 headings 同序，点目录时按它 scrollIntoView */
  const headingEls = useRef<HTMLElement[]>([])
  /** 用户刚点的那一项；不为 null 时滚动高亮让位（见 handleScroll 与下面那对监听） */
  const pickedRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    // Viewer 是 dangerouslySetInnerHTML，value 一变整块 DOM 重建 —— 元素表必须跟着这一次一起重取，
    // 不能跨渲染缓存节点（旧节点已经游离了）。layout effect 保证在绘制前就绪，目录不会先空一帧
    const els = Array.from(pane.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).filter(
      // 脚注插件会自己补一个「Footnotes」的 sr-only 小标题（id 是 user-content-footnote-label），
      // 那不是文档里的标题，别占目录一行
      (el) => !el.classList.contains('sr-only'),
    )
    headingEls.current = els
    const levels = els.map((el) => Number(el.tagName.slice(1)))
    setHeadings(els.map((el, index) => ({ level: levels[index], text: cleanHeadingText(el.textContent) })))
    setBaseLevel(levels.length ? Math.min(...levels) : MIN_HEADING_LEVEL)
    // 换了一份文档就回到顶部，别沿用上一份的滚动位置
    pane.scrollTop = 0
    pickedRef.current = null
    setActive(0)
  }, [value])

  // 滚动高亮：取「最后一个已经越过栏顶的标题」。用 rAF 合并，滚动一帧算一次就够
  const frameRef = useRef(0)
  const handleScroll = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      const pane = paneRef.current
      if (!pane) return

      // 刚点过目录：那一项就是当前项，别让位置判断把它抢走。
      //
      // 为什么不能只按位置判：末尾几节后面没有足够的内容把它们顶到栏顶（正文栏已经到底了），
      // 位置判断会把高亮判给别的项，用户点了第四节却高亮第五节。「顶到栏顶」这件事只有
      // 用户自己滚开时才该让位，「点了一次滚动条没动」不该让位 —— 所以锁的解除条件是
      // 「用户自己动手」（见下面那对监听），而不是滚动位置。
      if (pickedRef.current !== null) return

      // 滚到底时最后一节可能永远够不到栏顶（它后面没有足够的内容把它顶上去），这种时候直接点亮最后一条
      const atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= BOTTOM_EPSILON
      if (atBottom && headingEls.current.length) {
        setActive(headingEls.current.length - 1)
        return
      }

      const top = pane.getBoundingClientRect().top
      let next = 0
      headingEls.current.forEach((el, index) => {
        if (el.getBoundingClientRect().top - top <= ACTIVE_MARKER) next = index
      })
      setActive(next)
    })
  }, [])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  /**
   * 用户一动手就解锁「点目录」那把锁（见 handleScroll）。
   *
   * 认这四种动作就是认「是人滚的」：滚轮 / 触屏拖 / 拖滚动条或点正文（pointerdown）/ 键盘翻页。
   * 都是 capture 阶段挂上去的，抢在 React 的 onScroll 之前把锁摘掉，紧接着那次滚动就能正常判高亮。
   *
   * 代价是纯程序滚动（脚本、find-in-page 跳过去之类）不解锁：那种情况下高亮会停在点的那一项，
   * 等用户下一次动手才跟上 —— 比「点了目录高亮乱跑」划算。
   */
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const clearPick = () => {
      pickedRef.current = null
    }
    const types = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    types.forEach((type) => pane.addEventListener(type, clearPick, true))
    return () => types.forEach((type) => pane.removeEventListener(type, clearPick, true))
  }, [])

  const handlePick = (index: number) => {
    // 先落高亮再滚：等滚动事件回来才更新的话，点完那一下会闪回旧项。
    // 顺手锁上：点的那一项要一直是高亮，直到用户自己再滚（见 handleScroll）
    pickedRef.current = index
    setActive(index)
    headingEls.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 空文档（清空 / 拖进来一个空文件 / 地址栏那份没读出来）给空态，不画一版空白正文。
  // 后一种情况保留「上传 Markdown」那条退路：文件读不到还能自己选一份进来
  if (!value.trim()) {
    return (
      <div className="markdown-render-root markdown-render-empty" ref={hostRef} style={{ height }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyReason ? '读不到这份文件' : '还没有文档'}
        >
          <Button type="primary" icon={<UploadOutlined />} onClick={onUpload}>
            上传 Markdown
          </Button>
        </Empty>
        <p className="markdown-render-empty-hint">
          {emptyReason ?? '也可以把 .md 直接拖进窗口，或从工具栏的历史记录里回填一份'}
        </p>
      </div>
    )
  }

  return (
    <div className="markdown-render-root" ref={hostRef} style={{ height }}>
      {/* 文档没有标题时不留空列，正文自己撑满 */}
      {headings.length ? (
        <aside className="markdown-render-toc">
          <div className="markdown-render-toc-head">
            <span className="markdown-render-toc-title">文档目录</span>
            <span className="markdown-render-toc-file" title={fileName ?? undefined}>
              {fileName ?? '未命名文档'}
            </span>
          </div>
          <nav className="markdown-render-toc-nav spirit-scroll" aria-label="文档目录">
            <ol className="markdown-render-toc-list">
              {headings.map((heading, index) => (
                <li key={`${index}-${heading.text}`}>
                  <button
                    type="button"
                    className="markdown-render-toc-item"
                    data-active={index === active ? 'true' : undefined}
                    aria-current={index === active ? 'location' : undefined}
                    // 层级决定缩进：最浅的一级留 8px 基础内边距，每深一级多 12px
                    style={{ paddingLeft: 8 + (heading.level - baseLevel) * 12 }}
                    title={heading.text}
                    onClick={() => handlePick(index)}
                  >
                    {heading.text || '（无标题）'}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      ) : null}

      <div className="markdown-render-pane spirit-scroll" ref={paneRef} onScroll={handleScroll}>
        <Viewer value={value} plugins={PLUGINS} />
      </div>
    </div>
  )
}
