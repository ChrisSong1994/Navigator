/**
 * JSON 工具。原项目 pages/Json/index.tsx 的界面与交互照搬，Electron 那部分换成浏览器能力：
 *
 * 1、json 格式化
 * 2、json 解析 / 校验（解析核心见 lib/json.ts，比原来的 jsonlint 多一层 JSON5 兜底和错误行列）
 * 3、json 复制
 * 4、显示行号（monaco 自带）
 * 5、导出成 json 文件（showSaveFilePicker，不支持就退到下载）
 * 6、支持 json5
 * 7、JSONPath 查询 / 结构图 / 历史记录 / 弹出到独立窗口
 */
import { Splitter, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GraphView } from './GraphView/index.tsx'
import JsonPath from './JsonPath/index.tsx'
import JsonEditor from './components/Editor/JsonEditor.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { saveTextFile, pickTextFile } from '../lib/file.ts'
import { JSON_FILE_KIND } from './lib/kind.ts'
import { createHistoryStore } from '../lib/history.ts'
import type { HistoryItem } from '../lib/history.ts'
import { formatJson, minifyJson, parseJsonText, repairJsonText } from './lib/json.ts'
import type { JsonParseError } from './lib/json.ts'
import { isEmpty } from '../lib/util.ts'
import { createBridge, isPopupPage, openToolPopup } from '../lib/popup.ts'
import { useFillHeight } from '../hooks/useFillHeight.ts'
import './Json.css'

/** 面板里的编辑器填满所在栏 */
const FILL_STYLE = { height: '100%' }

/** 本工具在公共层里的身份：历史存哪儿、弹窗叫什么（文件类型见 lib/kind.ts） */
const HISTORY = createHistoryStore('navigator.json.history')

const POPUP = {
  windowName: 'navigator-json-popup',
  channelName: 'navigator-json-tool',
  width: 1100,
  height: 800,
} as const

/** 解析报错的展示文案：一句毛病 + 位置 + 带插入符的那一行 */
function formatParseError(error: JsonParseError): string {
  const where = error.line === null ? '' : `（第 ${error.line} 行 第 ${error.column} 列）`
  const head = `${error.message}${where}`
  return error.excerpt ? `${head}\n${error.excerpt}` : head
}

const JsonTool = () => {
  const [value, setValue] = useState('')
  const [currentFileName, setCurrentFileName] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => HISTORY.read())
  const [jsonPathOpen, setJsonPathOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  /** 报错面板被手动关掉时记下当时的内容；内容一变就重新显示 */
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  const splitterRef = useRef<HTMLDivElement>(null)
  // 不留余量：分栏一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(splitterRef, 0)

  const parsed = useMemo(() => parseJsonText(value), [value])
  // 空内容不算报错：lib/json.ts 把「没有可解析的东西」也归成 ok: false，界面上不该一进来就红着脸
  // （原项目同样先用 isEmpty(value) 挡一道）
  const parseError =
    parsed.ok || isEmpty(value) || dismissedAt === value ? null : formatParseError(parsed)

  // 改一次存一次。历史最多 20 条、内容也有上限，不值得为它做合并写入
  const rememberHistory = (items: HistoryItem[]) => {
    setHistory(items)
    HISTORY.write(items)
  }

  const handleImport = async () => {
    const picked = await pickTextFile(JSON_FILE_KIND.accept)
    if (!picked) return
    setValue(picked.content)
    setCurrentFileName(picked.name)
  }

  const handleSave = async () => {
    const saved = await saveTextFile(value, currentFileName ?? 'Untitled.json', JSON_FILE_KIND)
    if (!saved) return
    setCurrentFileName(saved.name)
    rememberHistory(HISTORY.add(history, saved.name, value))
  }

  // 美化 / 压缩：内容解析不通就什么都不做（原项目同样）
  const handleJsonFormat = () => {
    if (parseError) return
    const outcome = formatJson(value)
    if (outcome.ok) setValue(outcome.text)
  }

  const handleCompress = () => {
    if (parseError) return
    const outcome = minifyJson(value)
    if (outcome.ok) setValue(outcome.text)
  }

  const handleRepair = () => {
    const outcome = repairJsonText(value)
    if (!outcome.ok) {
      message.error('修复失败！')
      return
    }
    setValue(outcome.text)
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

  // JSONPath 与 Graph 互斥，开一个关另一个（原项目同样）
  const handleToggleJsonPath = () => {
    setJsonPathOpen(!jsonPathOpen)
    setGraphOpen(false)
  }

  const handleToggleGraph = () => {
    setGraphOpen(!graphOpen)
    setJsonPathOpen(false)
  }

  const handleOpenPopup = () => {
    const result = openToolPopup('json', POPUP)
    if (result.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (result.status === 'focused') message.info('JSON 弹窗已存在，已聚焦')
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

  return (
    <div className="json-tool-root">
      <Toolbar
        value={value}
        history={history}
        popup={popup}
        jsonPathOpen={jsonPathOpen}
        graphOpen={graphOpen}
        onImport={() => void handleImport()}
        onSave={() => void handleSave()}
        onFormat={handleJsonFormat}
        onCompress={handleCompress}
        onRepair={handleRepair}
        onClear={handleClear}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={() => rememberHistory([])}
        onToggleJsonPath={handleToggleJsonPath}
        onToggleGraph={handleToggleGraph}
        onOpenPopup={handleOpenPopup}
        onSyncToMain={handleSyncToMain}
      />

      <div className="json-tool-splitter" ref={splitterRef} style={{ height }}>
        <Splitter style={FILL_STYLE}>
          <Splitter.Panel defaultSize="50%" min="30%" max="80%">
            <JsonEditor
              style={FILL_STYLE}
              value={value}
              onChange={setValue}
              error={parseError}
              onRepair={handleRepair}
              onErrorClose={() => setDismissedAt(value)}
            />
          </Splitter.Panel>

          {graphOpen ? (
            <Splitter.Panel>
              <GraphView value={value} />
            </Splitter.Panel>
          ) : null}

          {jsonPathOpen ? (
            <Splitter.Panel>
              <JsonPath value={parsed.ok ? parsed.data : null} />
            </Splitter.Panel>
          ) : null}
        </Splitter>
      </div>
    </div>
  )
}

export default JsonTool
