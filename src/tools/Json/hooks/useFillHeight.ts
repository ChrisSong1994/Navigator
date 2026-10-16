import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 量出「这个容器还能占多高」，替代原项目的 calc(100vh - 150px)。
 *
 * 原来那一串减法是拿标题栏高度硬凑的，搬进工具页的卡片里以后头部高度、内边距全变了，硬凑必错。
 *
 * 关键是从**文档坐标**算（rect.top + scrollY），不是从视口坐标算：用视口坐标的话页面一滚，
 * 容器离顶部就近了，高度跟着变大，编辑器会在滚动时抽动。
 */
export function useFillHeight(
  ref: RefObject<HTMLElement | null>,
  reserve = 24,
  min = 320,
): number {
  const [height, setHeight] = useState(min)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(min, window.innerHeight - top - reserve))
    }

    measure()
    // 头部在窄屏会折行、卡片内边距随断点变，都会改可用高度；高度本身变了再量一次是恒等的，React 会跳过
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref, reserve, min])

  return height
}
