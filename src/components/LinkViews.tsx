import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { App, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { memo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useConfig } from '../config/configContext.ts'
import type { NavLink } from '../config/schema.ts'
import { LinkFormModal } from './LinkFormModal.tsx'
import { LinkIcon } from './LinkIcon.tsx'
import { linkSortableId } from './linkSort.ts'
import { useLinkSortSnapshot } from './linkSortContext.ts'

interface LinkItemProps {
  link: NavLink
  groupId: string
  groupTitle: string
  index: number
  fontSize: number
  card: boolean
  openInNewTab: boolean
  /** 搜索过滤时列表只是子集，关闭拖拽，避免用过滤后的下标改坏真实顺序 */
  sortable: boolean
  onRemove: (groupId: string, href: string) => void
}

function LinkItemBase({ link, groupId, groupTitle, index, fontSize, card, openInNewTab, sortable, onRemove }: LinkItemProps) {
  const { modal } = App.useApp()
  const { activeId } = useLinkSortSnapshot()
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: linkSortableId(groupId, index),
    data: { groupId, index },
    disabled: !sortable,
    transition: { duration: 180, easing: 'ease' },
  })

  const sortableId = linkSortableId(groupId, index)
  const isDragged = activeId === sortableId

  const menuItems: MenuProps['items'] = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'edit') setEditing(true)
    if (key === 'delete') {
      modal.confirm({
        title: '删除这条链接？',
        content: `${link.text} · ${link.href}`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => onRemove(groupId, link.href),
      })
    }
  }

  const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!isDragged) return
    event.preventDefault()
    event.stopPropagation()
  }

  // hover 上要再把文字色写一遍：antd 重置里的 a:hover（权重 0,1,1）会盖掉 text-[...]（0,1,0），
  // 不写的话鼠标一放上去链接就变成 antd 的链接色
  const anchorClass = [
    card
      ? 'flex items-center gap-2.5 rounded-[10px] bg-[var(--spirit-inset)] py-2.5 pl-3 pr-9 text-[var(--spirit-text)] no-underline transition-all duration-150 hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--spirit-accent)_12%,var(--spirit-inset))] hover:text-[var(--spirit-text)] hover:shadow-[var(--spirit-shadow)]'
      : 'flex items-center gap-3 py-2.5 pl-3.5 pr-11 text-[var(--spirit-text)] no-underline transition-colors hover:bg-[var(--spirit-inset-hover)] hover:text-[var(--spirit-text)]',
    'select-none',
    sortable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
    // 拖拽落点由 dnd-kit 的位移反馈，避免每次 over 变化都触发整组重渲染
    isDragging ? 'opacity-60 ring-2 ring-inset ring-[var(--spirit-accent)]' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Dropdown trigger={['contextMenu']} menu={{ items: menuItems, onClick: onMenuClick }} open={contextOpen} onOpenChange={setContextOpen}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragged ? 20 : undefined }}
        className={`group/nav relative ${isDragged ? 'opacity-40' : ''}`}
      >
        <a
          {...attributes}
          {...listeners}
          href={link.href}
          target={openInNewTab ? '_blank' : '_self'}
          rel={openInNewTab ? 'noreferrer noopener' : undefined}
          title={link.href}
          draggable={false}
          style={{ fontSize }}
          onClick={onClick}
          className={anchorClass}
        >
          <LinkIcon link={link} size={card ? 18 : 16} />
          <span className="truncate">{link.text}</span>
          {!card && <span className="ml-auto hidden truncate pl-4 text-xs text-[var(--spirit-muted)] sm:block">{link.href}</span>}
        </a>

        <div
          className={`absolute inset-y-0 right-1.5 flex items-center transition-opacity ${
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 focus-within:opacity-100'
          }`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{ items: menuItems, onClick: onMenuClick }}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          >
            <button
              type="button"
              aria-label="更多操作"
              title="更多操作"
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border-none bg-[var(--spirit-surface)] leading-none text-[var(--spirit-muted)] shadow-[0_1px_3px_rgba(15,23,42,0.12)] transition-colors hover:bg-[var(--spirit-accent)] hover:text-white"
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        </div>

        {editing && <LinkFormModal groupId={groupId} groupTitle={groupTitle} link={link} onClose={() => setEditing(false)} />}
      </div>
    </Dropdown>
  )
}

export const LinkItem = memo(LinkItemBase)

interface LinkGroupViewProps {
  groupId: string
  groupTitle: string
  links: NavLink[]
  card: boolean
  openInNewTab: boolean
  fontSize: number
  gap: number
  sortable: boolean
}

/** 卡片模式：自适应网格；列表模式：一整个面板内分行 */
export const LinkGroupView = memo(function LinkGroupView({ groupId, groupTitle, links, card, openInNewTab, fontSize, gap, sortable }: LinkGroupViewProps) {
  const { removeLink } = useConfig()
  const sortableIds = links.map((_, index) => linkSortableId(groupId, index))

  const content = card ? (
    <div
      className="grid"
      style={{ gap, gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(168, fontSize * 13)}px, 1fr))` }}
    >
      {links.map((link, index) => (
        <LinkItem key={`${link.href}-${index}`} link={link} groupId={groupId} groupTitle={groupTitle} index={index} fontSize={fontSize} card openInNewTab={openInNewTab} sortable={sortable} onRemove={removeLink} />
      ))}
    </div>
  ) : (
    <div className="overflow-hidden rounded-xl bg-[var(--spirit-inset)]">
      {links.map((link, index) => (
        <div key={`${link.href}-${index}`} className={index > 0 ? 'border-t border-[var(--spirit-border)]' : undefined}>
          <LinkItem link={link} groupId={groupId} groupTitle={groupTitle} index={index} fontSize={fontSize} card={false} openInNewTab={openInNewTab} sortable={sortable} onRemove={removeLink} />
        </div>
      ))}
    </div>
  )

  return (
    <SortableContext items={sortableIds} strategy={card ? rectSortingStrategy : verticalListSortingStrategy}>
      {content}
    </SortableContext>
  )
})
