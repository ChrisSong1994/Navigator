import { useEffect, useRef } from 'react'

import { writeLastDocument, type LastDocument } from '../lib/lastDocument.ts'

/**
 * 防抖窗口。编辑器每敲一个字都会改 content，长文档上每次同步写 localStorage 会卡输入；
 * 300ms 之内的改动合并成一次写入，真要走了（卸载 / pagehide）再补一次。
 */
const DEBOUNCE = 300

/**
 * 把当前这份文档持续写进存档（见 lib/lastDocument.ts），刷新后能找回来。
 *
 * 几个要点：
 *
 * 1. 依赖按字段列，不是整个对象：调用方每次渲染都会传一个新对象，那份对象进依赖会让 effect 每帧重跑，
 *    防抖也就永远等不到点。
 * 2. 最新值走 ref：卸载 / pagehide 那一刻要写的是当前这一屏，不是某个旧闭包里的。
 * 3. 卸载时补写一次：在工具之间切换、返回首页都是页面内切（不派发 pagehide），
 *    最后不到 300ms 的改动不能就这么丢了。
 * 4. `enabled` 给「地址栏那份还没读进来」这类中间态留的：那时候 content 是空串，
 *    照着写会把上一份存档顶掉。
 */
export function useLastDocument(
  doc: LastDocument,
  enabled = true,
): void {
  const { name, content, source, mode } = doc

  const latest = useRef(doc)
  useEffect(() => {
    latest.current = { name, content, source, mode }
  }, [name, content, source, mode])

  // 改动 → 防抖落盘；下一次改动把上一次没到点的那次作废
  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(() => writeLastDocument(latest.current), DEBOUNCE)
    return () => window.clearTimeout(timer)
  }, [name, content, source, mode, enabled])

  // 页面要走 / 组件要卸：防抖那一次可能还没到点，补上
  useEffect(() => {
    if (!enabled) return
    const flush = () => writeLastDocument(latest.current)
    // 关标签页、刷新、跳走都会派发 pagehide
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [enabled])
}
