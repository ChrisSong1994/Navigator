/**
 * Markdown 工具。原项目 pages/Markdown/index.tsx 照搬：bytemd 编辑器（8 个插件 + 中文语言包 + 示例文档），
 * 左边写右边预览。篮子外的东西换成浏览器能力：
 *
 * 1、编辑 / 预览（bytemd，插件见 plugins.ts）
 * 2、导入 / 导出 .md（公共层的 pickTextFile / saveTextFile，原项目这段是注释掉的）
 * 3、把 .md 直接拖进来（原项目没有）
 * 4、历史记录（存内容，点一下回填；原项目没有）
 * 5、弹出到独立窗口 + 双向同步（原项目没有）
 * 6、亮 / 暗两套主题（原项目固定亮色）
 */
import { Editor } from '@bytemd/react'
import { message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import EDITOR_ZH from 'bytemd/locales/zh_Hans.json'

import { createHistoryStore, type HistoryItem } from '../../lib/history.ts'
import { pickTextFile, readDroppedFile, saveTextFile } from '../../lib/file.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { useColorScheme } from '../../hooks/useColorScheme.ts'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { Toolbar } from './components/Toolbar.tsx'
import { useThemeStylesheets } from './hooks/useThemeStylesheets.ts'
import { MARKDOWN_FILE_KIND } from './lib/kind.ts'
import { PLUGINS } from './plugins.ts'
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
  const [value, setValue] = useState(SAMPLE)
  const [currentFileName, setCurrentFileName] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => HISTORY.read())
  const [dragging, setDragging] = useState(false)
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  const scheme = useColorScheme()
  useThemeStylesheets(scheme)

  const hostRef = useRef<HTMLDivElement>(null)
  // 不留余量：编辑器一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)

  // 改一次存一次。历史最多 20 条、内容也有上限，不值得为它做合并写入
  const rememberHistory = (items: HistoryItem[]) => {
    setHistory(items)
    HISTORY.write(items)
  }

  const handleImport = async () => {
    const picked = await pickTextFile(MARKDOWN_FILE_KIND.accept)
    if (!picked) return
    setValue(picked.content)
    setCurrentFileName(picked.name)
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
    setValue(item.content)
    setCurrentFileName(item.name)
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

  // 拖进来的 .md 直接读成内容（原项目没有这条路径，JSON 那边有，保持一致）
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    const dropped = await readDroppedFile(file)
    setValue(dropped.content)
    setCurrentFileName(dropped.name)
  }

  return (
    <div className="markdown-tool-root">
      <Toolbar
        value={value}
        history={history}
        popup={popup}
        onImport={() => void handleImport()}
        onSave={() => void handleSave()}
        onClear={handleClear}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={() => rememberHistory([])}
        onOpenPopup={handleOpenPopup}
        onSyncToMain={handleSyncToMain}
      />

      <div
        className="markdown-tool-editor"
        ref={hostRef}
        style={{ height }}
        onDragOver={(event) => {
          // 不拦默认行为的话 drop 事件根本不会来
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <Editor
          value={value}
          plugins={PLUGINS}
          locale={EDITOR_ZH}
          onChange={(next: string) => setValue(next)}
        />
        {dragging ? <div className="markdown-tool-drop">松开就把文件读进来</div> : null}
      </div>
    </div>
  )
}

export default MarkdownTool
