import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 量出「这个容器还能占多高」，替代原项目的 calc(100vh - 150px)。
 *
 * 原来那一串减法是拿标题栏高度硬凑的，搬进工具页的卡片里以后头部高度、内边距全变了，硬凑必错。
 *
 * 关键是从**文档坐标**算（rect.top + scrollY），不是从视口坐标算：用视口坐标的话页面一滚，
 * 容器离顶部就近了，高度跟着变大，编辑器会在滚动时抽动。
 *
 * 另减掉 `spaceBelow()`：容器自己够不到、但会算进文档高度的那些下外边距/下内边距/下边框。
 * 不减的话容器一路铺到视口底边，底下的东西（工具页 main 的 pb-20 加上卡片自己的下内边距，
 * 正好 100px）就顶到视口外面去了 —— 页面比视口高一截，滚下去却是空的。
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
      setHeight(Math.max(min, window.innerHeight - top - spaceBelow(element) - reserve))
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

/**
 * 容器底下还压着多少「不属于它」的高度：各级祖先的下外边距、下内边距、下边框，加上容器自己的下外边距。
 *
 * 这些都在容器的盒子之外（所以量它自己的高度不会反过来影响这些数字，来回量不会震荡），
 * 但全都会算进文档高度。每次现量而不是写死常量：工具页的 pb-20、卡片的 p-4/p-5 都是会随断点变的。
 */
function spaceBelow(element: HTMLElement): number {
  let total = parseFloat(getComputedStyle(element).marginBottom) || 0
  for (
    let node = element.parentElement;
    node && node !== document.documentElement;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node)
    total +=
      (parseFloat(style.marginBottom) || 0) +
      (parseFloat(style.paddingBottom) || 0) +
      (parseFloat(style.borderBottomWidth) || 0)
  }
  return total
}
