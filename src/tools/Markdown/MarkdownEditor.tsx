import { Editor } from '@bytemd/react'
import EDITOR_ZH from 'bytemd/locales/zh_Hans.json'
import { useMemo, useRef } from 'react'

import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { allowLocalImageProtocols } from './lib/localImages.ts'
import { createPlugins } from './plugins.ts'

/**
 * 编辑模式：bytemd 编辑器，左边写右边预览。
 *
 * 从 index.tsx 搬出来是为了和 MarkdownRender 对称 —— 两个模式各自 mount、各自持一份 useFillHeight。
 * 共用一份的话，切模式时 ref 会先在元素和 null 之间来回，而 useFillHeight 的 effect 依赖的是 ref
 * 对象本身（稳定的）不会重跑，量到的高度会停在切走前的旧值，切回来就错一屏。
 *
 * 拖拽落点不在这里：现在整窗拖入都由 index.tsx 的 useWindowFileDrop 接管，一律切演示模式。
 */
export function MarkdownEditor({
  value,
  imageBase,
  onChange,
}: {
  value: string
  /** 文档所在目录（`file:///…/`）；拖入 / 导入的文档没有，图片地址保持原样 */
  imageBase: string | null
  onChange: (next: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // 不留余量：编辑器一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)
  const plugins = useMemo(() => createPlugins(imageBase), [imageBase])

  return (
    <div className="markdown-tool-editor" ref={hostRef} style={{ height }}>
      <Editor
        value={value}
        plugins={plugins}
        sanitize={imageBase ? allowLocalImageProtocols : undefined}
        locale={EDITOR_ZH}
        onChange={onChange}
      />
    </div>
  )
}
