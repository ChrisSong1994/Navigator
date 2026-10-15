import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import { LinkSortContext } from './linkSortContext.ts'
import type { LinkSortSnapshot } from './linkSortContext.ts'

interface SortableLinkData {
  groupId: string
  index: number
}

function readLinkData(data: DragEndEvent['active']['data']['current']): SortableLinkData | null {
  const groupId = data?.groupId
  const index = data?.index
  if (typeof groupId !== 'string' || typeof index !== 'number') return null
  return { groupId, index }
}

function readLinkId(id: string | number): SortableLinkData | null {
  const value = String(id)
  if (!value.startsWith('link:')) return null
  const [, encodedGroupId, rawIndex] = value.split(':')
  if (!encodedGroupId || !rawIndex) return null
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0) return null
  return { groupId: decodeURIComponent(encodedGroupId), index }
}

/** 从拖拽的原始按下事件定位到实际可点击元素（链接 / 按钮），用于只抑制那一个元素的补发 click。 */
function getInteractiveTarget(event: Event): HTMLElement | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const interactive = target.closest('a[href], button, [role="button"]')
  return interactive instanceof HTMLElement ? interactive : null
}

/**
 * 页面链接的拖拽容器。
 *
 * 同一个 DndContext 包住全部可见分组，因此卡片和列表都能在同一分组内排序，也能跨分组移动。
 * 拖拽过程中只下发 activeId：dnd-kit 自己负责其余条目的位移动画 / over 状态，
 * 不再因为每次经过一个落点而让所有链接项重渲染。
 */
export function LinkSortProvider({ sortable, children }: { sortable: boolean; children: ReactNode }) {
  const { moveLinkTo } = useConfig()
  const suppressClickTargetRef = useRef<HTMLElement | null>(null)
  const suppressClickTimerRef = useRef<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      disabled: !sortable,
      // 整条链接都是拖拽把手：只有指针明确移动后才进入排序。
      // 不要用 delay：普通点击稍慢也会命中 delay，导致 click 被当成拖拽吞掉。
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      disabled: !sortable,
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    const suppressClick = (event: MouseEvent) => {
      const target = suppressClickTargetRef.current
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return
      // 只吞掉刚被拖拽的那条链接随后补发的一次 click；点击其他链接/按钮不受影响。
      suppressClickTargetRef.current = null
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current)
        suppressClickTimerRef.current = null
      }
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('click', suppressClick, true)
    return () => {
      document.removeEventListener('click', suppressClick, true)
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
    }
  }, [])

  const onDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    suppressClickTargetRef.current = getInteractiveTarget(activatorEvent)
    setActiveId(String(active.id))
  }, [])

  const onDragCancel = useCallback(() => {
    suppressClickTargetRef.current = null
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = null
    }
    setActiveId(null)
  }, [])

  const onDragEnd = useCallback(
    ({ active, activatorEvent, over }: DragEndEvent) => {
      setActiveId(null)
      // dnd-kit 拖拽结束后浏览器可能仍补一个 click，挡掉这一下，避免顺手跳转。
      // 只针对源链接，且 450ms 后自动失效：触摸端合成的 click 可能延迟约 300ms。
      suppressClickTargetRef.current = getInteractiveTarget(activatorEvent)
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickTargetRef.current = null
        suppressClickTimerRef.current = null
      }, 450)

      if (!sortable || !over) return
      const from = readLinkData(active.data.current) ?? readLinkId(active.id)
      const to = readLinkData(over.data.current) ?? readLinkId(over.id)
      if (!from || !to) return

      let toIndex = to.index
      // 跨组时落在目标条目下半部分，插到目标条目后面；同组交给 moveLinkTo 的 arrayMove 语义。
      if (from.groupId !== to.groupId) {
        const activeRect = active.rect.current.translated ?? active.rect.current.initial
        const overRect = over.rect
        if (activeRect && activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2) {
          toIndex += 1
        }
      }

      if (from.groupId === to.groupId && from.index === toIndex) return
      moveLinkTo(from.groupId, from.index, to.groupId, toIndex)
    },
    [moveLinkTo, sortable],
  )

  const value = useMemo<LinkSortSnapshot>(() => ({ activeId }), [activeId])

  return (
    <LinkSortContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        {children}
        <DragOverlay />
      </DndContext>
    </LinkSortContext.Provider>
  )
}
