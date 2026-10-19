import { TOOLS } from '../tools/registry.tsx'

/**
 * 工具列表项：工具箱抽屉和扩展弹窗（src/extension/popup）共用一份。
 *
 * 传进来的只是「选中了哪个工具」，列表长什么样、有多少个工具都跟着 tools/registry.tsx 走 ——
 * 加新工具时不用在这两个入口各改一遍。
 */
export function ToolList({ onSelect }: { onSelect: (key: string) => void }) {
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
