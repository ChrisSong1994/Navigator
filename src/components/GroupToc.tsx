import type { NavGroup } from '../config/schema.ts'

interface GroupTocProps {
  groupIds: string[]
  groups: Record<string, NavGroup>
  activeGroupId: string | null
  onNavigate: (id: string) => void
  className?: string
}

/** 文档式分组目录：桌面端固定在内容左侧，移动端在抽屉中复用同一份列表 */
export function GroupToc({ groupIds, groups, activeGroupId, onNavigate, className = '' }: GroupTocProps) {
  return (
    <aside className={`min-h-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between px-2">
        <span className="text-[13px] font-semibold tracking-wide text-[var(--spirit-text)]">分组目录</span>
        <span className="text-[11px] tabular-nums text-[var(--spirit-muted)]">{groupIds.length}</span>
      </div>

      <nav aria-label="导航分组目录" className="spirit-scroll min-h-0 flex-1 overflow-y-auto pb-2">
        <ol className="space-y-0.5 pl-1">
          {groupIds.map((id) => {
            const group = groups[id]
            if (!group) return null
            const active = id === activeGroupId

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={active ? 'location' : undefined}
                  className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-5 transition-colors ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--spirit-accent)_10%,transparent)] font-medium text-[var(--spirit-accent)]'
                      : 'text-[var(--spirit-muted)] hover:bg-[var(--spirit-inset)] hover:text-[var(--spirit-text)]'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{group.title}</span>
                  <span className="shrink-0 tabular-nums opacity-60">{group.links.length}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    </aside>
  )
}
