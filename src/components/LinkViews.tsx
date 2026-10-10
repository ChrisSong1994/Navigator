import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import { App, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { memo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useConfig } from '../config/configContext.ts'
import type { NavLink } from '../config/schema.ts'
import { useLinkSort } from '../hooks/linkSort.ts'
import { LinkFormModal } from './LinkFormModal.tsx'
import { LinkIcon } from './LinkIcon.tsx'

interface LinkItemProps {
  link: NavLink
  groupId: string
  index: number
  fontSize: number
  card: boolean
  /** 以下都由分组视图传进来：单条链接不订阅拖拽 context，否则 1000+ 条会跟着高亮一起重渲染 */
  sortable: boolean
  isOver: boolean
  isDragged: boolean
  onPress: (event: ReactPointerEvent<HTMLElement>, groupId: string, index: number) => void
  swallowClick: () => boolean
}

function LinkItemBase({ link, groupId, index, fontSize, card, sortable, isOver, isDragged, onPress, swallowClick }: LinkItemProps) {
  const { groups, removeLink } = useConfig()
  const { modal } = App.useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const group = groups[groupId]

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
        onOk: () => removeLink(groupId, link.href),
      })
    }
  }

  // 按住拖拽结束后浏览器还会补一个 click，这里挡掉，避免一松手就跳转
  const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (swallowClick()) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  // hover 上要再把文字色写一遍：antd 重置里的 a:hover（权重 0,1,1）会盖掉 text-[...]（0,1,0），
  // 不写的话鼠标一放上去链接就变成 antd 的链接色
  const anchorClass = [
    card
      ? 'flex items-center gap-2.5 rounded-[10px] bg-[var(--spirit-inset)] py-2.5 pl-3 pr-9 text-[var(--spirit-text)] no-underline transition-all duration-150 hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--spirit-accent)_12%,var(--spirit-inset))] hover:text-[var(--spirit-text)] hover:shadow-[var(--spirit-shadow)]'
      : 'flex items-center gap-3 py-2.5 pl-3.5 pr-11 text-[var(--spirit-text)] no-underline transition-colors hover:bg-[var(--spirit-inset-hover)] hover:text-[var(--spirit-text)]',
    'select-none',
    // 落点高亮画在框内，分组间距调小时也不会压到相邻的卡片
    isOver ? 'ring-2 ring-inset ring-[var(--spirit-accent)]' : '',
    isDragged ? 'cursor-grabbing opacity-40' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Dropdown trigger={['contextMenu']} menu={{ items: menuItems, onClick: onMenuClick }} open={contextOpen} onOpenChange={setContextOpen}>
      <div
        data-nav-item
        data-group-id={groupId}
        data-index={index}
        className="group/nav relative"
        onPointerDown={sortable ? (event) => onPress(event, groupId, index) : undefined}
      >
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
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

        {editing && group && <LinkFormModal groupId={groupId} groupTitle={group.title} link={link} onClose={() => setEditing(false)} />}
      </div>
    </Dropdown>
  )
}

export const LinkItem = memo(LinkItemBase)

interface LinkGroupViewProps {
  groupId: string
  links: NavLink[]
  card: boolean
  fontSize: number
  gap: number
}

/** 卡片模式：自适应网格；列表模式：一整个面板内分行 */
export function LinkGroupView({ groupId, links, card, fontSize, gap }: LinkGroupViewProps) {
  const { sortable, dragging, over, startPress, swallowClick } = useLinkSort()
  const overIndex = over?.groupId === groupId ? over.index : -1
  const draggedIndex = dragging?.groupId === groupId ? dragging.index : -1

  const itemProps = (link: NavLink, index: number) => ({
    link,
    groupId,
    index,
    fontSize,
    sortable,
    isOver: index === overIndex,
    isDragged: index === draggedIndex,
    onPress: startPress,
    swallowClick,
  })

  if (card) {
    return (
      <div
        className="grid"
        style={{ gap, gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(168, fontSize * 13)}px, 1fr))` }}
      >
        {links.map((link, index) => (
          <LinkItem key={link.href} card {...itemProps(link, index)} />
        ))}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--spirit-inset)]">
      {links.map((link, index) => (
        <div key={link.href} className={index > 0 ? 'border-t border-[var(--spirit-border)]' : undefined}>
          <LinkItem card={false} {...itemProps(link, index)} />
        </div>
      ))}
    </div>
  )
}
