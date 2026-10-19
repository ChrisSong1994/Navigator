/**
 * 首页拖入的那份文档，交给 Markdown 工具页打开。
 *
 * 首页和工具页在**同一个页面实例**里（`?tool=` 走的是 replaceState，切页不刷新），
 * 所以模块级变量就够，不用 sessionStorage —— 那种「存了没人取就一直留着」的东西，
 * 在首页 / 工具页之间来回切的时候反而更难清干净。
 *
 * 分成「读」和「清」两步而不是一个 take：工具页要拿它当首屏状态（见 Markdown/index.tsx），
 * 而首屏状态是渲染期算的、可能被 StrictMode 算两遍 —— 读两遍结果一样，清两遍也没副作用，
 * 这样就不用指望「取走即清」在一次渲染里只跑一次。
 */
import type { PickedFile } from './file.ts'

let pending: PickedFile | null = null

/** 首页拖入后调用，要赶在 openTool 之前 */
export function setPendingDocument(file: PickedFile): void {
  pending = file
}

/** 工具页首屏读一眼，不拿走（清在下面那句） */
export function peekPendingDocument(): PickedFile | null {
  return pending
}

/** 工具页挂载后清掉，免得下次进工具又读到同一份 */
export function clearPendingDocument(): void {
  pending = null
}
