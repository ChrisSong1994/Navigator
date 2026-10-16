import { ToolOutlined } from '@ant-design/icons'
import { Button, Drawer, Tooltip } from 'antd'
import { useState } from 'react'
import { TOOLS } from '../tools/registry.tsx'

/**
 * 工具箱入口：点开是右侧抽屉，列出所有工具。
 *
 * 首页顶栏和工具页右上角共用这一个组件，所以在工具页里选中另一项就是原地换工具，
 * 不必先返回首页。抽屉开关收在组件内部，外面只管「选中了哪个工具」。
 */
export function Toolbox({ onOpenTool }: { onOpenTool: (key: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title="工具箱">
        <Button icon={<ToolOutlined />} aria-label="工具箱" onClick={() => setOpen(true)} />
      </Tooltip>
      <Drawer
        title="工具箱"
        size={360}
        open={open}
        onClose={() => setOpen(false)}
        // 收起后连 DOM 一起撤掉：工具页那一侧的抽屉是常驻组件，留着会在页面里挂一层空的浮层
        destroyOnHidden
        styles={{ body: { paddingTop: 8 } }}
      >
        <div className="flex flex-col gap-1.5">
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="flex cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-3 py-2.5 text-left text-[var(--spirit-text)] transition-colors hover:bg-[var(--spirit-inset)] hover:text-[var(--spirit-accent)]"
              onClick={() => {
                // 先收抽屉再切工具页，不然抽屉会和工具页的切换动画叠在一起
                setOpen(false)
                onOpenTool(tool.key)
              }}
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
      </Drawer>
    </>
  )
}
