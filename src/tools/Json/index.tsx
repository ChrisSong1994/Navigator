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
 * 8、浏览器里打开本机的 .json：扩展把那个 file:// 导航换成 ?file= 落到这里（读文件见公共层 lib/file.ts）
 */
import { Alert, Splitter, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GraphView } from './GraphView/index.tsx'
import JsonPath from './JsonPath/index.tsx'
import JsonEditor from './components/Editor/JsonEditor.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { pickTextFile, READ_FILE_HINT, readUrlDocument, saveTextFile } from '../../lib/file.ts'
import { JSON_FILE_KIND } from './lib/kind.ts'
import { createHistoryStore } from '../../lib/history.ts'
import type { HistoryItem } from '../../lib/history.ts'
import { clearPendingDocument, peekPendingDocument } from '../../lib/pendingDocument.ts'
import { clearFileQuery, fileFromQuery } from '../query.ts'
import { formatJson, minifyJson, parseJsonText, repairJsonText } from './lib/json.ts'
import type { JsonParseError } from './lib/json.ts'
import { isEmpty } from '../../lib/util.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
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
  /*
   * 首页拖入交接过来的那份文件（见 lib/pendingDocument.ts）。首页自己不做渲染，把工具页打开
   * 就算完事，装进编辑器和写历史都在这里做 —— 于是「首页拖入」和「工具里导入」走的是同一份状态。
   * 首屏就要渲染它，所以渲染期先读一眼（读不是副作用）；清掉和落盘放在下面的 effect 里。
   */
  const [handoff] = useState(peekPendingDocument)
  /*
   * 地址栏 ?file= 送来的那份本机文件（扩展换过来的导航，见公共层 lib/file.ts）。它和上面那份
   * 交接不会同时出现：首页拖入走的是页面内 replaceState，不会带上这个参数。
   * 先按空文档摆着，读完再装进去；读不到就在编辑器上面说清怎么办。
   */
  const [fileAddress] = useState(() => (handoff ? null : fileFromQuery()))
  /** 读不到地址栏那份文件时的说明（见 lib/file.ts 的 READ_FILE_HINT） */
  const [readFailure, setReadFailure] = useState<string | null>(null)

  const [value, setValue] = useState(handoff?.content ?? '')
  const [currentFileName, setCurrentFileName] = useState<string | null>(handoff?.name ?? null)
  // 交接过来这份也算一条历史；HISTORY.add 只做纯计算，落盘同样在 effect 里
  const [history, setHistory] = useState<HistoryItem[]>(() =>
    handoff ? HISTORY.add(HISTORY.read(), handoff.name, handoff.content) : HISTORY.read(),
  )
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

  // 交接点用完就清（别让下次进工具又读到同一份），顺手把它落进历史。
  // 写盘是副作用，渲染期不能做，所以放这儿；StrictMode 下跑两遍也没关系：清是幂等的，
  // addHistoryEntry 按文件名去重，写两遍结果一样
  useEffect(() => {
    clearPendingDocument()
    if (handoff) HISTORY.write(HISTORY.add(HISTORY.read(), handoff.name, handoff.content))
  }, [handoff])

  // 地址栏那份本地文件：读完装进编辑器并记一条历史（和导入走同一份状态）。
  // 读不到就停在空文档上、把原因说清 —— 页面已经跳过来了，让用户对着空编辑器发愣没有意义
  useEffect(() => {
    if (!fileAddress) return
    let alive = true
    // 坐落之前再看看地址栏：用户中途自己导入 / 清空 / 回填历史的话（那些入口会摘掉参数），
    // 这份慢腾腾读回来的就不该把用户刚换成的内容盖回去
    const wanted = () => alive && fileFromQuery() === fileAddress
    readUrlDocument(fileAddress).then(
      (file) => {
        if (!wanted()) return
        setValue(file.content)
        setCurrentFileName(file.name)
        setReadFailure(null)
        const items = HISTORY.add(HISTORY.read(), file.name, file.content, { source: fileAddress })
        setHistory(items)
        HISTORY.write(items)
      },
      () => {
        if (wanted()) setReadFailure(READ_FILE_HINT)
      },
    )
    return () => {
      alive = false
    }
  }, [fileAddress])

  /**
   * 换一份内容进来（导入 / 清空 / 历史回填）：地址栏那个 ?file= 作废 —— 留着的话刷新页面
   * 会把旧文件读回来，盖掉用户刚选的这份。只有地址栏自己读出来的那份留着参数（那个 effect 不经过这里）。
   */
  const replaceContent = (content: string, name: string | null) => {
    setValue(content)
    setCurrentFileName(name)
    setReadFailure(null)
    clearFileQuery()
  }

  const handleImport = async () => {
    const picked = await pickTextFile(JSON_FILE_KIND.accept)
    if (!picked) return
    replaceContent(picked.content, picked.name)
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
    replaceContent('', null)
  }

  /**
   * 历史回填。内容还在就直接灌回去。
   *
   * 内容因为太大没留下来（contentOmitted）时，只要条目里记着当初打开它的 `file://` 地址
   * （见 lib/history.ts 的 source），就照着地址把文件重读一遍；读不到就按 READ_FILE_HINT
   * 说清怎么办。没有来源的（拖入 / 导入来的）仍然点不动。
   */
  const handlePickHistory = async (item: HistoryItem) => {
    if (!item.contentOmitted) {
      replaceContent(item.content, item.name)
      return
    }
    const url = item.source
    if (!url) return
    try {
      const file = await readUrlDocument(url)
      replaceContent(file.content, file.name)
      // 内容重新到手了，把这条历史补全（如果它还是超过 256 KB，就仍然只留名字和时间）。
      // 从存储里重新读再算，别用点击时闭包里的那份：读文件是异步的，中途历史可能已经变了
      rememberHistory(HISTORY.add(HISTORY.read(), file.name, file.content, { source: url }))
    } catch {
      message.warning(READ_FILE_HINT, 8)
    }
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

      {readFailure ? (
        <Alert
          type="warning"
          showIcon
          message="读不到这份文件"
          description={readFailure}
          onClose={() => setReadFailure(null)}
        />
      ) : null}

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
