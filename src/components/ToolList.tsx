import { Tooltip } from 'antd'
import { TOOLS } from '../tools/registry.tsx'

/**
 * 工具列表项：工具箱抽屉和扩展弹窗（src/extension/popup）共用一份。
 *
 * 传进来的只是「选中了哪个工具」，列表长什么样、有多少个工具都跟着 tools/registry.tsx 走 ——
 * 加新工具时不用在这两个入口各改一遍。
 */
export function ToolList({
  onSelect,
  layout = 'list',
}: {
  onSelect: (key: string) => void
  layout?: 'list' | 'grid'
}) {
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {TOOLS.map((tool) => (
          <Tooltip key={tool.key} title={tool.title} placement="top">
            <button
              type="button"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--spirit-border)] bg-[var(--spirit-inset)] px-1.5 py-2 text-center text-[var(--spirit-text)] transition-colors hover:border-[var(--spirit-accent)] hover:bg-[var(--spirit-inset-hover)] hover:text-[var(--spirit-accent)]"
              onClick={() => onSelect(tool.key)}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--spirit-accent)_12%,transparent)] text-base leading-none text-[var(--spirit-accent)]">
                {tool.icon}
              </span>
              <span className="w-full truncate text-xs leading-tight">{tool.title}</span>
            </button>
          </Tooltip>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {TOOLS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          className="flex cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-3 py-2.5 text-left text-[var(--spirit-text)] transition-colors hover:bg-[var(--spirit-inset)] hover:text-[var(--spirit-accent)]"
          onClick={() => onSelect(tool.key)}
        >
          <span className="shrink-0 text-lg leading-none">{tool.icon}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight">{tool.title}</span>
            <span className="block truncate text-xs leading-tight text-[var(--spirit-muted)]">
              {tool.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
