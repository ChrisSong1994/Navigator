/**
 * 整窗拖入文件时的遮罩：铺满整个窗口（拖到哪都算数，见 hooks/useWindowFileDrop.ts），
 * 只做提示不吃事件。首页和 Markdown 工具页各挂一份，文案自己给。
 */
export default function DropOverlay({ text }: { text: string }) {
  return <div className="spirit-drop-overlay">{text}</div>
}
