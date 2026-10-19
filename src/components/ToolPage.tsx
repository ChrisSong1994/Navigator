import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Empty, Spin, Tooltip } from 'antd'
import { Suspense } from 'react'
import { useConfig } from '../config/configContext.ts'
import { findTool } from '../tools/registry.tsx'
import { Toolbox } from './Toolbox.tsx'
import { WallpaperLayer } from './WallpaperLayer.tsx'

/**
 * 工具页：整页展示一个工具，左上角返回箭头回首页，右上角保留工具箱入口（原地换工具）。
 *
 * 结构照首页来（spirit-canvas > header + main）：index.css 里 `.spirit-canvas > header/main`
 * 带 position/z-index 规则，壁纸、底色和卡片层级得靠同一套结构才和首页一致。
 *
 * 布局上跟首页不同的一点：内容区要撑满。外层是列方向的 flex —— 顶栏按内容高、main 吃掉剩下的
 * 高度，卡片随即被拉满，四边留白统一由 main 的 p-4 给（顶栏的 px-4 与它左右对齐）。
 * 用 flex 而不是给卡片写死 `calc(100vh - 顶栏)`：顶栏窄屏会折行、高度是变的，而且内容比一屏还高的
 * 时候（颜色工具的记录列表）main 的 min-height 会顶开外层、页面照旧能滚，不会把内容裁在视口外。
 */
export function ToolPage({
  toolKey,
  onBack,
  onOpenTool,
}: {
  toolKey: string
  onBack: () => void
  onOpenTool: (key: string) => void
}) {
  const { settings } = useConfig()
  const tool = findTool(toolKey)
  const Content = tool?.content

  return (
    <div className="spirit-canvas flex min-h-screen flex-col">
      <WallpaperLayer dim={settings.wallpaperDim} blur={settings.wallpaperBlur} />

      {/* shrink-0：弹窗那种很矮的窗口里，别让 flex 把顶栏压扁了 */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-[var(--spirit-border)] bg-[var(--spirit-surface)]/90 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3">
          <Tooltip title="返回首页">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              aria-label="返回首页"
            />
          </Tooltip>
          {tool && (
            <span className="shrink-0 text-lg leading-none text-[var(--spirit-text)]">
              {tool.icon}
            </span>
          )}
          <span className="text-[17px] font-semibold tracking-tight text-[var(--spirit-text)]">
            {tool?.title ?? '工具'}
          </span>
          {tool && (
            <span className="hidden truncate text-xs text-[var(--spirit-muted)] sm:block">
              {tool.description}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Toolbox onOpenTool={onOpenTool} />
          </div>
        </div>
      </header>

      {/* flex-1 吃掉顶栏之外的高度；卡片是它的 flex 项，默认 stretch，宽高都跟着撑满 */}
      <main className="flex flex-1 p-2">
        <div className="w-full rounded-2xl bg-[var(--spirit-surface)] p-4 sm:p-5">
          {Content ? (
            <Suspense
              fallback={
                <div className="grid place-items-center py-20">
                  <Spin />
                </div>
              }
            >
              <Content />
            </Suspense>
          ) : (
            <div className="grid place-items-center py-20">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`没有名为 ${toolKey} 的工具`}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
