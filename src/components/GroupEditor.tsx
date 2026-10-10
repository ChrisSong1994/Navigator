import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Collapse, Empty, Input, Popconfirm, Tooltip } from 'antd'
import { useMemo, useState } from 'react'
import { useConfig } from '../config/configContext.ts'
import type { NavLink } from '../config/schema.ts'
import { LinkFormModal } from './LinkFormModal.tsx'
import { LinkIcon } from './LinkIcon.tsx'

/**
 * 输入框内部留草稿，失焦 / 回车才提交：
 * 既避免每敲一个字就重渲染整页 1000+ 链接，也能在外部值变化时自动跟随（draft 为空即用外部值）。
 */
function EditableInput({
  value,
  onCommit,
  placeholder,
  autoFocus,
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      size="small"
      value={draft ?? value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft)
        setDraft(null)
      }}
      onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
    />
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
        <LinkIcon link={link} size={16} />
        <EditableInput value={link.text} placeholder="显示名称" onCommit={(text) => updateLink(groupId, link.href, { text })} />
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
      <EditableInput value={link.href} placeholder="https://" onCommit={(href) => href.trim() && updateLink(groupId, link.href, { href: href.trim() })} />
      <EditableInput
        value={link.icon}
        placeholder="图标：base64 data URL 或图片地址，留空用首字母"
        onCommit={(icon) => updateLink(groupId, link.href, { icon: icon.trim() })}
      />
    </div>
  )
}

export function GroupEditor() {
  const { groups, renameGroup, moveGroup, removeGroup } = useConfig()
  const [keyword, setKeyword] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const entries = useMemo(() => {
    const all = Object.entries(groups)
    const query = keyword.trim().toLowerCase()
    if (!query) return all
    return all.filter(([id, group]) => {
      if (id.toLowerCase().includes(query) || group.title.toLowerCase().includes(query)) return true
      return group.links.some((link) => `${link.text} ${link.href}`.toLowerCase().includes(query))
    })
  }, [groups, keyword])

  const items = entries.map(([id, group], index) => ({
    key: id,
    label: (
      <div className="flex items-center gap-2">
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
      </div>
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
        <Collapse size="small" items={items} />
      )}
      {addingTo && groups[addingTo] && (
        <LinkFormModal groupId={addingTo} groupTitle={groups[addingTo].title} onClose={() => setAddingTo(null)} />
      )}
    </div>
  )
}
