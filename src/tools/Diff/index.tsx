/**
 * Diff 工具。原项目 pages/Diff 只有「语言下拉 + BaseDiffEditor」，这里搬过来并接上浏览器能力：
 *
 * 1、左右两栏文本对比（monaco DiffEditor，两边都可编辑）
 * 2、语言切换，覆盖上游那 26 个语言值
 * 3、空态点图标导入文本文件、文件拖到某一栏就落进那一栏
 * 4、跟随站点主题（浅色 / 深色 / 跟随系统）
 *
 * 上游的导入 / 拖入走 Electron（Events.getFileFromLocalPath / file.path），浏览器里换成
 * 公共层的 pickTextFile / readDroppedFile。编辑器内容用 ref 持有、只在空态边界强制渲染，
 * 避免把每个按键都回灌给 DiffEditor 造成光标错位（上游那套 ref + update 的原因）。
 */
import { ExportOutlined, MedicineBoxOutlined, SyncOutlined } from '@ant-design/icons'
import { DiffEditor } from '@monaco-editor/react'
import type { DiffOnMount, MonacoDiffEditor } from '@monaco-editor/react'
import { Button, Select, Spin, Tooltip, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { DEFAULT_OPTIONS } from '../../components/Editor/index.ts'
import { useConfig } from '../../config/configContext.ts'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { useResolvedTheme } from '../../hooks/useResolvedTheme.ts'
import { pickTextFile, readDroppedFile } from '../../lib/file.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { isEmpty } from '../../lib/util.ts'
import { DIFF_LANGUAGE_OPTIONS } from './languages.ts'
import type { DiffLanguage } from './languages.ts'
import './Diff.css'
// 副作用导入：装上 monaco 实例、worker 与语言着色，必须在 DiffEditor 挂载前跑完
import '../../components/Editor/monaco.ts'

type Side = 'original' | 'modified'

const POPUP = {
  windowName: 'navigator-diff-popup',
  channelName: 'navigator-diff-tool',
  // 左右两栏编辑器，和 Transform 一样宽
  width: 1440,
  height: 900,
} as const

const DiffTool = () => {
  const [language, setLanguage] = useState<DiffLanguage>('plaintext')
  const originalRef = useRef('')
  const modifiedRef = useRef('')
  const editorRef = useRef<MonacoDiffEditor | null>(null)
  // 内容本身放 ref（不让每个按键都触发 React 渲染），只有空态提示需要跟着重绘
  const [empty, setEmpty] = useState<Record<Side, boolean>>({ original: true, modified: true })
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)
  /** 弹窗那边问 hello 时要递过去的最新一屏；内容不进 state，所以顺手在这里维护一份 */
  const latestRef = useRef({ original: '', modified: '', language: 'plaintext' as DiffLanguage })

  const { settings } = useConfig()
  const theme = useResolvedTheme(settings.themeMode)
  const hostRef = useRef<HTMLDivElement>(null)
  // 不留余量：编辑器一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)

  const setSideValue = (side: Side, value: string) => {
    if (side === 'original') originalRef.current = value
    else modifiedRef.current = value
    latestRef.current[side] = value
    const nextEmpty = isEmpty(value)
    setEmpty((prev) => (prev[side] === nextEmpty ? prev : { ...prev, [side]: nextEmpty }))

    // 编辑器挂载前导入 / 拖入的内容先留在 ref 里，onMount 时再灌进去
    const editor = editorRef.current
    if (!editor) return
    const instance = side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor()
    instance.setValue(value)
  }

  const handleMount: DiffOnMount = (editor) => {
    editorRef.current = editor
    if (originalRef.current) editor.getOriginalEditor().setValue(originalRef.current)
    if (modifiedRef.current) editor.getModifiedEditor().setValue(modifiedRef.current)

    const bind = (instance: ReturnType<typeof editor.getOriginalEditor>, side: Side) => {
      instance.onDidChangeModelContent(() => {
        const value = instance.getValue()
        if (side === 'original') originalRef.current = value
        else modifiedRef.current = value
        latestRef.current[side] = value
        // 只在「空 ↔ 非空」这一下重绘：提示层要跟着出现 / 消失，其余时候不必回灌
        const nextEmpty = isEmpty(value)
        setEmpty((prev) => (prev[side] === nextEmpty ? prev : { ...prev, [side]: nextEmpty }))
      })
    }

    bind(editor.getOriginalEditor(), 'original')
    bind(editor.getModifiedEditor(), 'modified')
  }

  const handleImport = async (side: Side) => {
    const picked = await pickTextFile('')
    if (picked) setSideValue(side, picked.content)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    const file = event.dataTransfer.files[0]
    if (!file) return

    // 文件拖进 monaco 默认会被当成文本插入；这里整块接管成「导入到对应栏」
    event.preventDefault()
    event.stopPropagation()

    const target = event.target
    if (!(target instanceof Element)) return
    const side: Side | null = target.closest('.editor.original')
      ? 'original'
      : target.closest('.editor.modified')
        ? 'modified'
        : null
    if (!side) return

    setSideValue(side, (await readDroppedFile(file)).content)
  }

  const handleLanguageChange = (value: DiffLanguage) => {
    latestRef.current.language = value
    setLanguage(value)
  }

  const handleOpenPopup = () => {
    const opened = openToolPopup('diff', POPUP)
    if (opened.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (opened.status === 'focused') message.info('Diff 弹窗已存在，已聚焦')
  }

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前这一屏（两栏内容 + 语言）递过去
        bridge.send({ type: 'state', payload: { ...latestRef.current } })
        return
      }
      if (incoming.type !== 'state' && incoming.type !== 'update') return

      const payload = incoming.payload
      if (!payload) return

      const option = DIFF_LANGUAGE_OPTIONS.find((item) => item.value === payload.language)
      if (option) {
        latestRef.current.language = option.value
        setLanguage(option.value)
      }

      const original = payload.original ?? ''
      const modified = payload.modified ?? ''
      originalRef.current = original
      modifiedRef.current = modified
      latestRef.current.original = original
      latestRef.current.modified = modified
      setEmpty({ original: isEmpty(original), modified: isEmpty(modified) })

      const editor = editorRef.current
      if (editor) {
        editor.getOriginalEditor().setValue(original)
        editor.getModifiedEditor().setValue(modified)
      }
    })
    bridgeRef.current = bridge

    // 弹窗这边喊一声，主窗口会把当前状态回过来
    if (popup) bridge.send({ type: 'hello' })

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
  }, [popup])

  const handleSyncToMain = () => {
    bridgeRef.current?.send({ type: 'update', payload: { ...latestRef.current } })
    message.success('已同步到主窗口')
  }

  return (
    <div className="diff-tool-root">
      <div className="diff-tool-header">
        <span className="diff-tool-header-label">语言：</span>
        <Select
          showSearch
          style={{ width: 140 }}
          value={language}
          onChange={handleLanguageChange}
          options={DIFF_LANGUAGE_OPTIONS}
        />
        <span className="diff-tool-header-spacer" />
        {popup ? (
          <Tooltip title="同步到主窗口">
            <Button
              type="text"
              icon={<SyncOutlined />}
              aria-label="同步到主窗口"
              onClick={handleSyncToMain}
            />
          </Tooltip>
        ) : (
          <Tooltip title="弹出到独立窗口">
            <Button
              type="text"
              icon={<ExportOutlined />}
              aria-label="弹出到独立窗口"
              onClick={handleOpenPopup}
            />
          </Tooltip>
        )}
      </div>

      <div
        ref={hostRef}
        className="diff-tool-editor"
        style={{ height }}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
        }}
        onDropCapture={handleDrop}
      >
        {empty.original ? (
          <button
            type="button"
            className="diff-tool-tip diff-tool-tip-left"
            onClick={() => void handleImport('original')}
          >
            <MedicineBoxOutlined className="diff-tool-tip-icon" />
            <span>请输入文本信息或点击图标导入文本文件</span>
          </button>
        ) : null}
        {empty.modified ? (
          <button
            type="button"
            className="diff-tool-tip diff-tool-tip-right"
            onClick={() => void handleImport('modified')}
          >
            <MedicineBoxOutlined className="diff-tool-tip-icon" />
            <span>请输入文本信息或点击图标导入文本文件</span>
          </button>
        ) : null}

        <DiffEditor
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          language={language}
          height="100%"
          loading={<Spin />}
          options={{
            ...DEFAULT_OPTIONS,
            originalEditable: true,
            enableSplitViewResizing: false,
          }}
          original=""
          modified=""
          onMount={handleMount}
        />
      </div>
    </div>
  )
}

export default DiffTool
