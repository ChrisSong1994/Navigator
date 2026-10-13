import { CheckOutlined, LinkOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, App, Button, Empty, Input, Segmented, Slider, Spin, Tag } from 'antd'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import {
  isAllowedWallpaperUrl,
  resolveWallpaperUrl,
  WALLPAPER_BLUR_RANGE,
  WALLPAPER_DIM_RANGE,
  WALLPAPER_INTERVAL_RANGE,
  WALLPAPER_URL_MAX_LENGTH,
} from '../config/schema.ts'
import type { WallpaperMode } from '../config/schema.ts'
import { useWallpaper } from '../wallpaper/wallpaperContext.ts'

const INTERVAL_OPTIONS = [
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '3 小时', value: 180 },
  { label: '6 小时', value: 360 },
  { label: '1 天', value: 1440 },
]

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium text-[var(--spirit-text)]">{label}</span>
        {hint && <span className="text-xs text-[var(--spirit-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function WallpaperPanel() {
  const { settings, updateSettings } = useConfig()
  const { wallpapers, loading, error, activeUrl, activeWallpaper, refresh, next } = useWallpaper()
  const { message } = App.useApp()
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null)
  const urlDraft = draft?.base === settings.wallpaperUrl ? draft.value : settings.wallpaperUrl

  const resolvedUrl = useMemo(() => resolveWallpaperUrl(activeUrl), [activeUrl])

  const applyUrl = () => {
    const url = urlDraft.trim()
    if (url && !isAllowedWallpaperUrl(url)) {
      message.error('请输入 http(s) 图片地址，或 Bing 返回的相对地址')
      return
    }
    updateSettings({ wallpaperMode: 'url', wallpaperUrl: url })
    setDraft(null)
  }

  const pickBing = (url: string) => {
    updateSettings({ wallpaperMode: 'bing', wallpaperUrl: url })
  }

  return (
    <div className="space-y-5 pb-4">
      <SettingRow label="壁纸模式" hint="选择一种壁纸来源">
        <Segmented
          block
          value={settings.wallpaperMode}
          onChange={(value) => updateSettings({ wallpaperMode: value as WallpaperMode })}
          options={[
            { label: '关闭', value: 'none' },
            { label: 'Bing 选择', value: 'bing' },
            { label: '自动轮播', value: 'rotation' },
            { label: '图片地址', value: 'url' },
          ]}
        />
      </SettingRow>

      {settings.wallpaperMode === 'none' && (
        <Alert type="info" showIcon title="壁纸已关闭" description="开启后页面会显示 Bing 每日壁纸或你指定的图片。" />
      )}

      {(settings.wallpaperMode === 'bing' || settings.wallpaperMode === 'rotation') && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--spirit-muted)]">Bing 官方通常只提供最近约 8 天壁纸</span>
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
              刷新列表
            </Button>
          </div>

          {error && <Alert type="warning" showIcon title="Bing 壁纸暂时不可用" description={error} />}

          {loading && wallpapers.length === 0 ? (
            <div className="grid place-items-center rounded-lg bg-[var(--spirit-inset)] py-10">
              <Spin />
            </div>
          ) : wallpapers.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有读取到 Bing 壁纸" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {wallpapers.map((item, index) => {
                const selected = settings.wallpaperMode === 'bing'
                  ? settings.wallpaperUrl === item.url
                  : activeWallpaper?.url === item.url
                return (
                  <button
                    key={`${item.rawDate}-${index}`}
                    type="button"
                    className={`group relative overflow-hidden rounded-lg border text-left transition ${
                      selected ? 'border-[var(--spirit-accent)]' : 'border-transparent hover:border-[var(--spirit-border-strong)]'
                    }`}
                    onClick={() => pickBing(item.url)}
                  >
                    <img src={item.thumbnailUrl} alt="" loading="lazy" className="aspect-[5/3] w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] text-white">
                      {item.date || 'Bing'}
                    </span>
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--spirit-accent)] text-white">
                        <CheckOutlined className="text-[11px]" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {settings.wallpaperMode === 'rotation' && (
            <>
              <SettingRow label="轮播间隔" hint={`${settings.wallpaperInterval} 分钟`}>
                <Segmented
                  block
                  value={INTERVAL_OPTIONS.some((item) => item.value === settings.wallpaperInterval) ? settings.wallpaperInterval : 60}
                  onChange={(value) => updateSettings({ wallpaperInterval: Number(value) })}
                  options={INTERVAL_OPTIONS}
                />
                <Slider
                  className="mt-2"
                  min={WALLPAPER_INTERVAL_RANGE[0]}
                  max={WALLPAPER_INTERVAL_RANGE[1]}
                  value={settings.wallpaperInterval}
                  onChange={(value) => updateSettings({ wallpaperInterval: value })}
                />
              </SettingRow>
              <div className="flex items-center gap-2">
                <Button icon={<ThunderboltOutlined />} onClick={next}>
                  下一张
                </Button>
                {activeWallpaper && (
                  <span className="min-w-0 truncate text-xs text-[var(--spirit-muted)]">
                    {activeWallpaper.title || activeWallpaper.copyright || activeWallpaper.date}
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {settings.wallpaperMode === 'url' && (
        <>
          <SettingRow label="图片地址" hint="支持 http(s) 图片直链">
            <Input
              value={urlDraft}
              maxLength={WALLPAPER_URL_MAX_LENGTH}
              prefix={<LinkOutlined />}
              placeholder="https://example.com/wallpaper.jpg"
              onChange={(event) => setDraft({ base: settings.wallpaperUrl, value: event.target.value })}
              onPressEnter={applyUrl}
            />
          </SettingRow>
          <Button type="primary" onClick={applyUrl}>
            应用这个地址
          </Button>
        </>
      )}

      {settings.wallpaperMode !== 'none' && (
        <>
          <SettingRow label="压暗程度" hint={`${settings.wallpaperDim}%`}>
            <Slider
              min={WALLPAPER_DIM_RANGE[0]}
              max={WALLPAPER_DIM_RANGE[1]}
              value={settings.wallpaperDim}
              onChange={(value) => updateSettings({ wallpaperDim: value })}
            />
          </SettingRow>
          <SettingRow label="模糊程度" hint={`${settings.wallpaperBlur}px`}>
            <Slider
              min={WALLPAPER_BLUR_RANGE[0]}
              max={WALLPAPER_BLUR_RANGE[1]}
              value={settings.wallpaperBlur}
              onChange={(value) => updateSettings({ wallpaperBlur: value })}
            />
          </SettingRow>
        </>
      )}

      {resolvedUrl && (
        <div className="rounded-lg border border-[var(--spirit-border)] bg-[var(--spirit-inset)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--spirit-muted)]">
            <Tag color="blue">当前</Tag>
            <span className="min-w-0 flex-1 truncate">{activeWallpaper?.title || resolvedUrl}</span>
          </div>
          <img src={resolvedUrl} alt="壁纸预览" className="max-h-32 w-full rounded-md object-cover" />
        </div>
      )}

      {settings.wallpaperMode !== 'none' && (
        <Button danger block onClick={() => updateSettings({ wallpaperMode: 'none', wallpaperUrl: '' })}>
          关闭并清除壁纸
        </Button>
      )}
    </div>
  )
}
