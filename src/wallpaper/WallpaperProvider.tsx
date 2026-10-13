import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useConfig } from '../config/configContext.ts'
import { resolveWallpaperUrl } from '../config/schema.ts'
import { fetchBingWallpapers } from './bing.ts'
import type { BingWallpaper } from './bing.ts'
import { WallpaperContext } from './wallpaperContext.ts'
import type { WallpaperContextValue } from './wallpaperContext.ts'

const ROTATION_MIN_MS = 5 * 60_000

function rotationIndex(now: number, intervalMinutes: number, count: number, manualOffset: number): number {
  if (count <= 0) return -1
  const intervalMs = Math.max(ROTATION_MIN_MS, intervalMinutes * 60_000)
  const step = Math.floor(now / intervalMs)
  return ((step + manualOffset) % count + count) % count
}

function timeUntilNextRotation(now: number, intervalMinutes: number): number {
  const intervalMs = Math.max(ROTATION_MIN_MS, intervalMinutes * 60_000)
  return intervalMs - (now % intervalMs) + 80
}

/**
 * 壁纸运行时：Bing 列表只存在内存，配置里只落 wallpaperUrl。
 * 自动轮播用「时间片 + 手动偏移」计算，刷新页面后同一时间片保持稳定。
 */
export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useConfig()
  const needsBing = settings.wallpaperMode === 'bing' || settings.wallpaperMode === 'rotation'
  const [wallpapers, setWallpapers] = useState<BingWallpaper[]>([])
  const [requestVersion, setRequestVersion] = useState(0)
  // -1 表示首次请求尚未完成；否则从“关闭”首次切到 Bing 时会先闪一帧“没有壁纸”。
  const [settledVersion, setSettledVersion] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [manualOffset, setManualOffset] = useState(0)

  const refresh = useCallback(() => setRequestVersion((value) => value + 1), [])

  useEffect(() => {
    if (!needsBing) return
    const controller = new AbortController()
    void fetchBingWallpapers(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setWallpapers(items)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason as Error).name === 'AbortError') return
        setError((reason as Error).message || 'Bing 壁纸请求失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledVersion(requestVersion)
      })
    return () => controller.abort()
  }, [needsBing, requestVersion])

  useEffect(() => {
    if (settings.wallpaperMode !== 'rotation') return
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        setClock(Date.now())
        schedule()
      }, timeUntilNextRotation(Date.now(), settings.wallpaperInterval))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [settings.wallpaperInterval, settings.wallpaperMode])

  const index = rotationIndex(clock, settings.wallpaperInterval, wallpapers.length, manualOffset)
  const activeWallpaper = useMemo(() => {
    if (settings.wallpaperMode === 'rotation') return index >= 0 ? wallpapers[index] : null
    if (settings.wallpaperMode !== 'bing') return null
    const configured = resolveWallpaperUrl(settings.wallpaperUrl)
    return wallpapers.find((item) => item.url === configured) ?? null
  }, [index, settings.wallpaperMode, settings.wallpaperUrl, wallpapers])

  const activeUrl = useMemo(() => {
    if (settings.wallpaperMode === 'none') return ''
    if (settings.wallpaperMode === 'rotation' && activeWallpaper) return activeWallpaper.url
    return resolveWallpaperUrl(settings.wallpaperUrl) || activeWallpaper?.url || ''
  }, [activeWallpaper, settings.wallpaperMode, settings.wallpaperUrl])

  // 首次切到 Bing 且配置里还没有地址时，落一个初始连接。
  useEffect(() => {
    if (settings.wallpaperMode !== 'bing' || wallpapers.length === 0 || settings.wallpaperUrl) return
    updateSettings({ wallpaperUrl: wallpapers[0].url })
  }, [settings.wallpaperMode, settings.wallpaperUrl, updateSettings, wallpapers])

  // 轮播切换后把当前图片连接同步回配置，保证导出的始终是可追溯的单张壁纸地址。
  useEffect(() => {
    if (settings.wallpaperMode !== 'rotation' || !activeUrl || settings.wallpaperUrl === activeUrl) return
    updateSettings({ wallpaperUrl: activeUrl })
  }, [activeUrl, settings.wallpaperMode, settings.wallpaperUrl, updateSettings])

  // 提前加载下一张，避免轮播切图时出现明显空白。
  useEffect(() => {
    if (settings.wallpaperMode !== 'rotation' || wallpapers.length < 2 || index < 0) return
    const next = wallpapers[(index + 1) % wallpapers.length]
    const image = new Image()
    image.src = next.url
  }, [index, settings.wallpaperMode, wallpapers])

  const next = useCallback(() => {
    setManualOffset((value) => value + 1)
  }, [])

  const loading = needsBing && settledVersion !== requestVersion
  const value = useMemo<WallpaperContextValue>(
    () => ({ wallpapers, loading, error, activeUrl, activeWallpaper, refresh, next }),
    [activeUrl, activeWallpaper, error, loading, next, refresh, wallpapers],
  )

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>
}
