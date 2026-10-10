import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'

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

/**
 * 页面链接的拖拽容器。
 *
 * 同一个 DndContext 包住全部可见分组，因此卡片和列表都能在同一分组内排序，也能跨分组移动。
 * 搜索时列表只是配置的子集，会通过 sortable=false 关闭拖拽，避免用过滤后的下标改坏真实顺序。
 */
export function LinkSortProvider({ sortable, children }: { sortable: boolean; children: ReactNode }) {
  const { moveLinkTo } = useConfig()
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | null>(null)

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

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // dnd-kit 拖拽结束后浏览器可能仍补一个 click，挡掉这一下，避免顺手跳转。
      suppressClickRef.current = true
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = false
      }, 400)

      if (!sortable || !over) return
      const from = readLinkData(active.data.current)
      const to = readLinkData(over.data.current)
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  )
}
