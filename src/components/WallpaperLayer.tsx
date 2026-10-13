import { useWallpaper } from '../wallpaper/wallpaperContext.ts'

/** 固定背景层：不接收指针事件，不参与页面布局与拖拽。 */
export function WallpaperLayer({ dim, blur }: { dim: number; blur: number }) {
  const { activeUrl } = useWallpaper()

  if (!activeUrl) return null

  return (
    <div aria-hidden="true" className="spirit-wallpaper">
      <img
        key={activeUrl}
        src={activeUrl}
        alt=""
        className="h-full w-full object-cover"
        style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, transform: blur > 0 ? 'scale(1.04)' : undefined }}
      />
      <div className="spirit-wallpaper-dim" style={{ opacity: dim / 100 }} />
    </div>
  )
}
