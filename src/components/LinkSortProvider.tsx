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

/**
 * 页面链接的拖拽容器。
 *
 * 同一个 DndContext 包住全部可见分组，因此卡片和列表都能在同一分组内排序，也能跨分组移动。
 * 拖拽过程中只下发 activeId：dnd-kit 自己负责其余条目的位移动画 / over 状态，
 * 不再因为每次经过一个落点而让所有链接项重渲染。
 */
export function LinkSortProvider({ sortable, children }: { sortable: boolean; children: ReactNode }) {
  const { moveLinkTo } = useConfig()
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      disabled: !sortable,
      // 整条链接都是拖拽把手：短按仍然打开链接，按住后再移动才进入排序。
      activationConstraint: { delay: 60, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      disabled: !sortable,
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    const suppressClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('click', suppressClick, true)
    return () => {
      document.removeEventListener('click', suppressClick, true)
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
    }
  }, [])

  const onDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null)
      // dnd-kit 拖拽结束后浏览器可能仍补一个 click，挡掉这一下，避免顺手跳转。
      suppressClickRef.current = true
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = false
      }, 400)

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
