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
    <div className="spirit-canvas min-h-screen">
      <WallpaperLayer dim={settings.wallpaperDim} blur={settings.wallpaperBlur} />

      <header className="sticky top-0 z-30 border-b border-[var(--spirit-border)] bg-[var(--spirit-surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1704px] flex-wrap items-center gap-x-3 gap-y-3 px-6 py-3">
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

      <main className="mx-auto max-w-[1704px] px-6 pb-20 pt-5">
        <div className="rounded-2xl bg-[var(--spirit-surface)] p-4 sm:p-5">
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
