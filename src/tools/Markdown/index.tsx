/**
 * Markdown 工具。原项目 pages/Markdown/index.tsx 照搬：bytemd 编辑器（8 个插件 + 中文语言包 + 示例文档）。
 * 篮子外的东西换成浏览器能力：
 *
 * 1、编辑模式（bytemd，左写右预览，插件见 plugins.ts，组件见 MarkdownEditor.tsx）
 * 2、演示模式（只读渲染 + 左侧文档目录，见 MarkdownRender.tsx）
 * 3、导入 / 导出 .md（公共层的 pickTextFile / saveTextFile）
 * 4、整窗拖入 .md：拖到窗口里任何地方都算数，一律切演示模式渲染（公共层 hooks/useWindowFileDrop.ts）
 * 5、历史记录（存内容，两个模式共用同一份，点一下回填；原项目没有）
 * 6、弹出到独立窗口 + 双向同步（原项目没有）
 * 7、亮 / 暗两套主题（原项目固定亮色）
 *
 * 状态都留在这里：两个模式拿到的是同一份 value / fileName / history，切模式只是换个视图。
 */
import { message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import DropOverlay from '../../components/DropOverlay.tsx'
import { createHistoryStore, type HistoryItem } from '../../lib/history.ts'
import { pickTextFile, readDroppedFile, saveTextFile } from '../../lib/file.ts'
import { isMarkdownLike, MARKDOWN_REJECT_MESSAGE } from '../../lib/markdown.ts'
import { clearPendingDocument, peekPendingDocument } from '../../lib/pendingDocument.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { useColorScheme } from '../../hooks/useColorScheme.ts'
import { useWindowFileDrop } from '../../hooks/useWindowFileDrop.ts'
import { MarkdownEditor } from './MarkdownEditor.tsx'
import { MarkdownRender } from './MarkdownRender.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { useThemeStylesheets } from './hooks/useThemeStylesheets.ts'
import { MARKDOWN_FILE_KIND } from './lib/kind.ts'
import type { MarkdownMode } from './lib/mode.ts'
import SAMPLE from './sample.md?raw'
import './Markdown.css'

/** 本工具在公共层里的身份：历史存哪儿、弹窗叫什么（文件类型见 lib/kind.ts） */
const HISTORY = createHistoryStore('navigator.markdown.history')

const POPUP = {
  windowName: 'navigator-markdown-popup',
  channelName: 'navigator-markdown-tool',
  // 左边写右边分栏，比 JSON 那个宽一点
  width: 1280,
  height: 860,
} as const

const MarkdownTool = () => {
  /*
   * 首页拖入交接过来的那份文档（见 lib/pendingDocument.ts）。首页自己不做渲染，把工具页打开就算完事，
   * 呈现和写历史都在这里做 —— 于是「首页拖入」和「工具里拖入」走的是同一份状态。
   * 首屏就要渲染它，所以渲染期先读一眼（读不是副作用）；清掉和落盘放在下面的 effect 里。
   */
  const [handoff] = useState(peekPendingDocument)

  const [value, setValue] = useState(handoff?.content ?? SAMPLE)
  const [currentFileName, setCurrentFileName] = useState<string | null>(handoff?.name ?? null)
  // 交接过来这份也算一条历史；HISTORY.add 只做纯计算，落盘同样在 effect 里
  const [history, setHistory] = useState<HistoryItem[]>(() =>
    handoff ? HISTORY.add(HISTORY.read(), handoff.name, handoff.content) : HISTORY.read(),
  )
  /** 打开工具默认编辑模式；整窗拖入（含首页交接）会自动切到演示模式 */
  const [mode, setMode] = useState<MarkdownMode>(handoff ? 'view' : 'edit')
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  // 交接点用完就清（别让下次进工具又读到同一份），顺手把它落进历史。
  // 写盘是副作用，渲染期不能做，所以放这儿；StrictMode 下跑两遍也没关系：清是幂等的，
  // addHistoryEntry 按文件名去重，写两遍结果一样
  useEffect(() => {
    clearPendingDocument()
    if (handoff) HISTORY.write(HISTORY.add(HISTORY.read(), handoff.name, handoff.content))
  }, [handoff])

  const scheme = useColorScheme()
  useThemeStylesheets(scheme)

  // 改一次存一次。历史最多 20 条、内容也有上限，不值得为它做合并写入
  const rememberHistory = (items: HistoryItem[]) => {
    setHistory(items)
    HISTORY.write(items)
  }

  /**
   * 换一份文档进来。三条入口共用这一个：
   *
   * - 整窗拖入：记历史 + 切演示模式（拖进来就是要看这份文档）
   * - 导入 / 演示模式的上传：记历史，模式不动（「读进当前模式」）
   * - 历史回填：不写历史（它本来就在历史里），模式也不动
   */
  const openDocument = (
    file: { name: string; content: string },
    { remember = true, render = false } = {},
  ) => {
    setValue(file.content)
    setCurrentFileName(file.name)
    if (remember) rememberHistory(HISTORY.add(history, file.name, file.content))
    if (render) setMode('view')
  }

  const handleImport = async () => {
    const picked = await pickTextFile(MARKDOWN_FILE_KIND.accept)
    if (!picked) return
    openDocument(picked)
  }

  const handleSave = async () => {
    const saved = await saveTextFile(value, currentFileName ?? 'Untitled.md', MARKDOWN_FILE_KIND)
    if (!saved) return
    setCurrentFileName(saved.name)
    rememberHistory(HISTORY.add(history, saved.name, value))
  }

  const handleClear = () => {
    setValue('')
    setCurrentFileName(null)
  }

  const handlePickHistory = (item: HistoryItem) => {
    if (item.contentOmitted) return
    openDocument({ name: item.name, content: item.content }, { remember: false })
  }

  const handleDeleteHistory = (item: HistoryItem) => {
    rememberHistory(HISTORY.remove(history, item.id))
  }

  const handleOpenPopup = () => {
    const result = openToolPopup('markdown', POPUP)
    if (result.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (result.status === 'focused') message.info('Markdown 弹窗已存在，已聚焦')
  }

  // 弹窗与主窗口之间的桥。回调里要用到最新的 value / currentFileName，又不想每次改动都重建通道
  // （重建的瞬间会漏消息），所以走 ref 读最新值
  const latestRef = useRef({ value, currentFileName })
  useEffect(() => {
    latestRef.current = { value, currentFileName }
  }, [value, currentFileName])

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前这份内容递过去
        bridge.send({
          type: 'state',
          value: latestRef.current.value,
          name: latestRef.current.currentFileName,
        })
        return
      }
      if (incoming.type === 'state' || incoming.type === 'update') {
        setValue(incoming.value ?? '')
        setCurrentFileName(incoming.name ?? null)
      }
    })
    bridgeRef.current = bridge

    // 弹窗这边喊一声，主窗口会把当前内容回过来
    if (popup) bridge.send({ type: 'hello' })

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
  }, [popup])

  const handleSyncToMain = useCallback(() => {
    bridgeRef.current?.send({ type: 'update', value, name: currentFileName })
    message.success('已同步到主窗口')
  }, [value, currentFileName])

  // 整窗拖入：拖到窗口里任何地方都算数，落下来就是「我要看这份文档」→ 切演示模式渲染
  const dragging = useWindowFileDrop({
    accept: isMarkdownLike,
    onFile: async (file) => openDocument(await readDroppedFile(file), { render: true }),
    // 不认的文件不改内容、也不切模式
    onReject: () => message.warning(MARKDOWN_REJECT_MESSAGE),
  })

  return (
    <div className="markdown-tool-root">
      <Toolbar
        value={value}
        history={history}
        popup={popup}
        mode={mode}
        onModeChange={setMode}
        onImport={() => void handleImport()}
        onSave={() => void handleSave()}
        onClear={handleClear}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={() => rememberHistory([])}
        onOpenPopup={handleOpenPopup}
        onSyncToMain={handleSyncToMain}
      />

      {mode === 'edit' ? (
        <MarkdownEditor value={value} onChange={setValue} />
      ) : (
        <MarkdownRender
          value={value}
          fileName={currentFileName}
          onUpload={() => void handleImport()}
        />
      )}

      {dragging ? <DropOverlay text="松开就渲染这份文档" /> : null}
    </div>
  )
}

export default MarkdownTool
