/**
 * 按住不松 → 拖拽排序。
 *
 * 页面上有 1000+ 条链接，拖拽的关键是不能让每次指针移动都触发 React 更新：
 * 指针事件统一挂在 window 上（只在有按压 / 拖拽时干活），落点用 elementFromPoint +
 * data-nav-item 反查，只有"跨过某一条链接"时才 setState 换一次高亮。
 * 真正的顺序变更在松手时一次性提交给 moveLinkTo。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import { LinkSortContext } from '../hooks/linkSort.ts'
import type { DropTarget, LinkSortValue } from '../hooks/linkSort.ts'

/** 按住多久算"抓住了" */
const LONG_PRESS_MS = 240
/** 位移超过这个值就认为用户在滚动 / 选文字，不算长按 */
const MOVE_TOLERANCE = 8
/** 指针进入视口上下这么多像素内开始自动滚动 */
const EDGE = 88
const EDGE_STEP = 16
/** 拖拽结束后这段时间内的 click 全部吞掉 */
const CLICK_GUARD_MS = 400

interface PendingPress {
  timer: number
  x: number
  y: number
  groupId: string
  index: number
}

export function LinkSortProvider({ sortable, children }: { sortable: boolean; children: ReactNode }) {
  const { moveLinkTo } = useConfig()
  const [dragging, setDragging] = useState<DropTarget | null>(null)
  const [over, setOver] = useState<DropTarget | null>(null)

  const pendingRef = useRef<PendingPress | null>(null)
  const draggingRef = useRef<DropTarget | null>(null)
  const overRef = useRef<DropTarget | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const guardRef = useRef(0)
  /** 拖拽中贴着边缘自动滚动时用来判断"已经滚到头了"，避免滚动事件自己触发自己 */
  const scrollRef = useRef(0)

  const cancelPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pendingRef.current = null
  }, [])

  const applyOver = useCallback((target: DropTarget | null) => {
    const previous = overRef.current
    if (previous?.groupId === target?.groupId && previous?.index === target?.index) return
    overRef.current = target
    setOver(target)
  }, [])

  const evaluate = useCallback(() => {
    const { x, y } = pointerRef.current
    const element = document.elementFromPoint(x, y)
    const item = element instanceof Element ? element.closest<HTMLElement>('[data-nav-item]') : null
    const groupId = item?.dataset.groupId
    const index = item ? Number(item.dataset.index) : Number.NaN
    applyOver(groupId && Number.isFinite(index) ? { groupId, index } : null)
  }, [applyOver])

  const autoScroll = useCallback(() => {
    const { y } = pointerRef.current
    if (y < EDGE) window.scrollBy(0, -EDGE_STEP)
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, EDGE_STEP)
  }, [])

  const finishDrag = useCallback(
    (apply: boolean) => {
      const from = draggingRef.current
      const to = overRef.current
      draggingRef.current = null
      overRef.current = null
      guardRef.current = Date.now() + CLICK_GUARD_MS
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDragging(null)
      setOver(null)
      if (apply && from && to && (from.groupId !== to.groupId || from.index !== to.index)) {
        moveLinkTo(from.groupId, from.index, to.groupId, to.index)
      }
    },
    [moveLinkTo],
  )

  const swallowClick = useCallback(() => Date.now() < guardRef.current, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (pending) {
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > MOVE_TOLERANCE) cancelPending()
        return
      }
      if (!draggingRef.current) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      autoScroll()
      evaluate()
    }
    const onUp = () => {
      if (pendingRef.current) {
        cancelPending()
        return
      }
      if (draggingRef.current) finishDrag(true)
    }
    const onCancel = () => {
      cancelPending()
      if (draggingRef.current) finishDrag(false)
    }
    const onScroll = () => {
      if (!draggingRef.current) return
      // 边缘自动滚动会连着触发 scroll：滚不动了就停，别自己转自己
      const y = window.scrollY
      if (y === scrollRef.current) return
      scrollRef.current = y
      autoScroll()
      evaluate()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('scroll', onScroll)
      cancelPending()
      if (draggingRef.current) finishDrag(false)
    }
  }, [autoScroll, cancelPending, evaluate, finishDrag])

  const startPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, groupId: string, index: number) => {
      if (!sortable || event.button !== 0) return
      // 触摸屏按住是"长按"，交给浏览器 / Dropdown 的长按菜单，不做拖拽
      if (event.pointerType === 'touch') return
      cancelPending()
      const { clientX: x, clientY: y } = event
      const timer = window.setTimeout(() => {
        const pending = pendingRef.current
        if (!pending) return
        pendingRef.current = null
        const target = { groupId: pending.groupId, index: pending.index }
        draggingRef.current = target
        overRef.current = target
        pointerRef.current = { x: pending.x, y: pending.y }
        scrollRef.current = window.scrollY
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
        setDragging(target)
        setOver(target)
      }, LONG_PRESS_MS)
      pendingRef.current = { timer, x, y, groupId, index }
    },
    [cancelPending, sortable],
  )

  const value = useMemo<LinkSortValue>(
    () => ({ sortable, dragging, over, startPress, swallowClick }),
    [dragging, over, sortable, startPress, swallowClick],
  )

  return <LinkSortContext.Provider value={value}>{children}</LinkSortContext.Provider>
}
