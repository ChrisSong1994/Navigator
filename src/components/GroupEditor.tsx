import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, HolderOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Collapse, Empty, Input, Popconfirm, Tooltip } from 'antd'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import type { NavLink } from '../config/schema.ts'
import { LinkFormModal } from './LinkFormModal.tsx'
import { LinkIcon } from './LinkIcon.tsx'

/**
 * 输入框内部留草稿，失焦 / 回车才提交：
 * 既避免每敲一个字就重渲染整页 1000+ 链接，也能在外部值变化时自动跟随（draft 为空即用外部值）。
 *
 * 传 label 时左边带一个定宽小标签：链接行填上内容后 placeholder 就看不见了，靠它区分
 * 「名称 / 地址 / 图标」三个字段；用 <label> 包住输入框，点标签也能聚焦。
 */
function EditableInput({
  value,
  onCommit,
  placeholder,
  label,
  prefix,
  autoFocus,
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  /** 左侧标签，建议两个字（标签列宽固定 32px，对齐靠它） */
  label?: string
  /** 输入框内的前置内容（链接行用它显示 favicon） */
  prefix?: ReactNode
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const input = (
    <Input
      size="small"
      value={draft ?? value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      prefix={prefix}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft)
        setDraft(null)
      }}
      onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
    />
  )

  if (!label) return input

  // flex-1 / min-w-0 只在横向布局里起作用，放在纵向堆叠里也无害
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-[var(--spirit-muted)]">{label}</span>
      {input}
    </label>
  )
}

function groupSortableId(groupId: string) {
  return `group:${encodeURIComponent(groupId)}`
}

function SortableGroupHeader({ groupId, disabled, children }: { groupId: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: groupSortableId(groupId),
    data: { groupId },
    disabled,
    transition: { duration: 180, easing: 'ease' },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-0 items-center gap-2 rounded-md transition-colors ${isDragging ? 'z-20 opacity-40' : ''}`}
    >
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="拖拽调整分组顺序"
          title="拖拽调整分组顺序"
          className="grid h-6 w-5 shrink-0 cursor-grab touch-none place-items-center border-none bg-transparent p-0 text-[var(--spirit-muted)] active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <HolderOutlined />
        </button>
      )}
      {children}
    </div>
  )
}

interface LinkRowProps {
  groupId: string
  link: NavLink
  index: number
  total: number
}

function LinkRow({ groupId, link, index, total }: LinkRowProps) {
  const { updateLink, moveLink, removeLink } = useConfig()
  return (
    <div className="space-y-1.5 rounded-lg border border-[var(--spirit-border)] p-2">
      <div className="flex items-center gap-1.5">
        <EditableInput
          label="名称"
          prefix={<LinkIcon link={link} size={14} />}
          value={link.text}
          placeholder="显示名称"
          onCommit={(text) => updateLink(groupId, link.href, { text })}
        />
        <Tooltip title="上移">
          <Button size="small" type="text" disabled={index === 0} icon={<ArrowUpOutlined />} onClick={() => moveLink(groupId, link.href, -1)} />
        </Tooltip>
        <Tooltip title="下移">
          <Button size="small" type="text" disabled={index === total - 1} icon={<ArrowDownOutlined />} onClick={() => moveLink(groupId, link.href, 1)} />
        </Tooltip>
        <Popconfirm title="删除这条链接？" okText="删除" cancelText="取消" onConfirm={() => removeLink(groupId, link.href)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
      <EditableInput
        label="地址"
        value={link.href}
        placeholder="https://"
        onCommit={(href) => href.trim() && updateLink(groupId, link.href, { href: href.trim() })}
      />
      <EditableInput
        label="图标"
        value={link.icon}
        placeholder="base64 data URL 或图片地址，留空用首字母"
        onCommit={(icon) => updateLink(groupId, link.href, { icon: icon.trim() })}
      />
    </div>
  )
}

export function GroupEditor() {
  const { groups, groupIds, renameGroup, moveGroup, setGroupOrder, removeGroup } = useConfig()
  const [keyword, setKeyword] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const hasKeyword = keyword.trim().length > 0
  const sensors = useSensors(
    useSensor(PointerSensor, { disabled: hasKeyword, activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { disabled: hasKeyword, coordinateGetter: sortableKeyboardCoordinates }),
  )

  const entries = useMemo(() => {
    const all = Object.entries(groups)
    const query = keyword.trim().toLowerCase()
    if (!query) return all
    return all.filter(([id, group]) => {
      if (id.toLowerCase().includes(query) || group.title.toLowerCase().includes(query)) return true
      return group.links.some((link) => `${link.text} ${link.href}`.toLowerCase().includes(query))
    })
  }, [groups, keyword])

  const sortableIds = useMemo(() => entries.map(([id]) => groupSortableId(id)), [entries])

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (hasKeyword || !over || active.id === over.id) return
    const fromId = String(active.id).startsWith('group:') ? decodeURIComponent(String(active.id).slice('group:'.length)) : null
    const toId = String(over.id).startsWith('group:') ? decodeURIComponent(String(over.id).slice('group:'.length)) : null
    if (!fromId || !toId) return
    const fromIndex = groupIds.indexOf(fromId)
    const toIndex = groupIds.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) return
    setGroupOrder(arrayMove(groupIds, fromIndex, toIndex))
  }

  const items = entries.map(([id, group], index) => ({
    key: id,
    label: (
      <SortableGroupHeader groupId={id} disabled={hasKeyword}>
        {renamingId === id ? (
          <div onClick={(event) => event.stopPropagation()} className="w-[190px]">
            <EditableInput
              autoFocus
              value={group.title}
              onCommit={(title) => {
                if (title.trim()) renameGroup(id, title.trim())
                setRenamingId(null)
              }}
            />
          </div>
        ) : (
          <span className="font-medium">{group.title}</span>
        )}
        <span className="text-xs text-[var(--spirit-muted)]">{group.links.length}</span>
        <div className="ml-auto flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          <Tooltip title="改名">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setRenamingId(id)} />
          </Tooltip>
          <Tooltip title="上移">
            <Button size="small" type="text" disabled={index === 0} icon={<ArrowUpOutlined />} onClick={() => moveGroup(id, -1)} />
          </Tooltip>
          <Tooltip title="下移">
            <Button size="small" type="text" disabled={index === entries.length - 1} icon={<ArrowDownOutlined />} onClick={() => moveGroup(id, 1)} />
          </Tooltip>
          <Popconfirm
            title="删除整个分组？"
            description={`「${group.title}」下的 ${group.links.length} 条链接会一起删除`}
            okText="删除"
            cancelText="取消"
            onConfirm={() => removeGroup(id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </SortableGroupHeader>
    ),
    children: (
      <div className="space-y-2">
        {group.links.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无链接" />}
        {group.links.map((link, linkIndex) => (
          <LinkRow key={`${link.href}-${linkIndex}`} groupId={id} link={link} index={linkIndex} total={group.links.length} />
        ))}
        <Button size="small" type="dashed" block icon={<PlusOutlined />} onClick={() => setAddingTo(id)}>
          新增链接
        </Button>
      </div>
    ),
  }))

  return (
    <div className="space-y-2">
      <Input
        allowClear
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        prefix={<LinkOutlined className="text-[var(--spirit-muted)]" />}
        placeholder="筛选分组或链接"
      />
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的分组" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <Collapse size="small" items={items} />
          </SortableContext>
        </DndContext>
      )}
      {addingTo && groups[addingTo] && (
        <LinkFormModal groupId={addingTo} groupTitle={groups[addingTo].title} onClose={() => setAddingTo(null)} />
      )}
    </div>
  )
}
