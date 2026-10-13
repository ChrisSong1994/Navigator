import { createContext, useContext } from 'react'
import type { BingWallpaper } from './bing.ts'

export interface WallpaperContextValue {
  /** 最近可用的 Bing 壁纸，通常为 8 张 */
  wallpapers: BingWallpaper[]
  loading: boolean
  error: string | null
  /** 当前实际用于渲染的绝对地址 */
  activeUrl: string
  /** 当前命中的 Bing 壁纸；自定义 URL 模式为 null */
  activeWallpaper: BingWallpaper | null
  /** 重新请求 Bing 壁纸 */
  refresh: () => void
  /** 自动轮播模式下手动切到下一张（只影响运行时） */
  next: () => void
}

export const WallpaperContext = createContext<WallpaperContextValue | null>(null)

export function useWallpaper(): WallpaperContextValue {
  const value = useContext(WallpaperContext)
  if (!value) throw new Error('useWallpaper 必须在 WallpaperProvider 内部使用')
  return value
}
