import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useConfig } from '../config/configContext.ts'
import type { NavGroup } from '../config/schema.ts'

interface GroupTocProps {
  groupIds: string[]
  groups: Record<string, NavGroup>
  activeGroupId: string | null
  onNavigate: (id: string) => void
  className?: string
}

function tocSortableId(groupId: string) {
  return `toc:${encodeURIComponent(groupId)}`
}

function TocItem({
  id,
  title,
  count,
  active,
  disabled,
  onNavigate,
}: {
  id: string
  title: string
  count: number
  active: boolean
  disabled: boolean
  onNavigate: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: tocSortableId(id),
    data: { groupId: id },
    disabled,
    transition: { duration: 60, easing: 'ease' },
  })

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'relative z-20 opacity-40' : undefined}>
      <button
        {...attributes}
        {...listeners}
        type="button"
        onClick={() => onNavigate(id)}
        aria-current={active ? 'location' : undefined}
        className={`group flex w-full touch-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-5 transition-colors ${
          disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        } ${
          isOver && !isDragging ? 'ring-2 ring-inset ring-[var(--spirit-accent)]' : ''
        } ${
          active
            ? 'bg-[color-mix(in_srgb,var(--spirit-accent)_10%,transparent)] font-medium text-[var(--spirit-accent)]'
            : 'text-[var(--spirit-muted)] hover:bg-[var(--spirit-inset)] hover:text-[var(--spirit-text)]'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="shrink-0 tabular-nums opacity-60">{count}</span>
      </button>
    </li>
  )
}

/** 文档式分组目录：桌面端固定在内容左侧；窄屏不展示（顶栏的菜单按钮与左侧抽屉已移除） */
export function GroupToc({ groupIds, groups, activeGroupId, onNavigate, className = '' }: GroupTocProps) {
  const { setGroupOrder } = useConfig()
  const sortable = groupIds.length === Object.keys(groups).length
  const sensors = useSensors(
    useSensor(PointerSensor, { disabled: !sortable, activationConstraint: { delay: 240, tolerance: 6 } }),
    useSensor(KeyboardSensor, { disabled: !sortable, coordinateGetter: sortableKeyboardCoordinates }),
  )
  const sortableIds = groupIds.map(tocSortableId)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!sortable || !over || active.id === over.id) return
    const fromId = String(active.id).startsWith('toc:') ? decodeURIComponent(String(active.id).slice(4)) : null
    const toId = String(over.id).startsWith('toc:') ? decodeURIComponent(String(over.id).slice(4)) : null
    if (!fromId || !toId) return
    const fromIndex = groupIds.indexOf(fromId)
    const toIndex = groupIds.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) return
    setGroupOrder(arrayMove(groupIds, fromIndex, toIndex))
  }

  return (
    <aside className={`min-h-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between px-2">
        <span className="text-[13px] font-semibold tracking-wide text-[var(--spirit-text)]">分组目录</span>
        <span className="text-[11px] tabular-nums text-[var(--spirit-muted)]">{groupIds.length}</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <nav aria-label="导航分组目录" className="spirit-scroll min-h-0 flex-1 overflow-y-auto pb-2">
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ol className="space-y-0.5 pl-1">
              {groupIds.map((id) => {
                const group = groups[id]
                if (!group) return null
                return (
                  <TocItem
                    key={id}
                    id={id}
                    title={group.title}
                    count={group.links.length}
                    active={id === activeGroupId}
                    disabled={!sortable}
                    onNavigate={onNavigate}
                  />
                )
              })}
            </ol>
          </SortableContext>
        </nav>
      </DndContext>
    </aside>
  )
}
