/**
 * Transform 工具。原项目 pages/Transform 是「一个下拉 + 当前转换器组件」，10 个转换器各自一份
 * `useState(defaultValue)`；这里折成一个页面，转换器逻辑见 lib/converters.ts。
 *
 * 上游除了那 10 个转换器本身什么都没有，本工具接上另外两个工具都有的那两件事：
 * 历史记录（存输入，点一下连转换器一起切回去）与弹出到独立窗口 + 双向同步。
 * 没有导入 / 导出 —— 上游也没有，且这个工具的输入大多是现粘的。
 *
 * 转换链路的三个关键点：
 *
 * 1. **输入防抖 300ms**：monaco 每个键都 onChange，而 json_typegen 与 gofmt 都是 WASM 调用，
 *    不压一下会拿每一次击键去跑一次。
 * 2. **结果带序号**：WASM 那几次是异步的，敲得快时后发的可能先回来。用递增的 runId 丢弃过期结果。
 * 3. **失败只留错误**：`.then(ok, fail)` 显式接住，不产生未处理的 rejection（上游就漏在这里）。
 */
import { message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createHistoryStore } from '../../lib/history.ts'
import type { HistoryItem } from '../../lib/history.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { debounce, isEmpty } from '../../lib/util.ts'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
import ConverterSelect from './components/ConverterSelect.tsx'
import TransformEditor from './components/Editor/TransformEditor.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { CONVERTERS, DEFAULT_CONVERTER_KEY, findConverter } from './lib/converters.ts'
import './Transform.css'

/** 本工具在公共层里的身份：历史存哪儿、弹窗叫什么 */
const HISTORY = createHistoryStore('navigator.transform.history')

const POPUP = {
  windowName: 'navigator-transform-popup',
  channelName: 'navigator-transform-tool',
  // 左右分栏两块编辑器，比 JSON 那个宽
  width: 1440,
  height: 900,
} as const

/** 输入停手多久算「这一次转换结束了」，可以记一条历史 */
const HISTORY_SETTLE_MS = 2000

/** 输入防抖：只压住「拿它去跑转换」这件事，编辑器里显示的内容是立刻更新的 */
const INPUT_DEBOUNCE_MS = 300

const FALLBACK_CONVERTER = CONVERTERS[0]

const TransformTool = () => {
  const [converterKey, setConverterKey] = useState(DEFAULT_CONVERTER_KEY)
  /** 每个转换器各自记住输入，切走再切回来还在（上游会退回示例） */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  /** 防抖后的输入，连同它属于哪个转换器 —— 转换只跟这一份走 */
  const [settled, setSettled] = useState(() => ({
    key: DEFAULT_CONVERTER_KEY,
    text: FALLBACK_CONVERTER.sample,
  }))
  const [result, setResult] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => HISTORY.read())
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  const converter = findConverter(converterKey) ?? FALLBACK_CONVERTER
  const input = drafts[converterKey] ?? converter.sample

  const hostRef = useRef<HTMLDivElement>(null)
  // 不留余量：两块编辑器一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)

  const settle = useMemo(
    () => debounce((key: string, text: string) => setSettled({ key, text }), INPUT_DEBOUNCE_MS),
    [],
  )
  useEffect(() => () => settle.cancel(), [settle])

  const handleInputChange = (text: string) => {
    setDrafts((prev) => ({ ...prev, [converterKey]: text }))
    settle(converterKey, text)
  }

  const handleConverterChange = (key: string) => {
    // 上一份输入还挂着一次待触发的防抖，先撤掉，否则它会把 settled 拉回旧转换器
    settle.cancel()
    setConverterKey(key)
    // 换转换器立刻转一次，不用等防抖
    setSettled({ key, text: drafts[key] ?? findConverter(key)?.sample ?? '' })
  }

  const handleClear = () => {
    settle.cancel()
    setDrafts((prev) => ({ ...prev, [converterKey]: '' }))
    setSettled({ key: converterKey, text: '' })
  }

  // 转换。runId 用来丢弃「敲得快时后发先至」的旧结果
  const runIdRef = useRef(0)
  useEffect(() => {
    const runId = (runIdRef.current += 1)
    const active = findConverter(settled.key)

    if (!active || isEmpty(settled.text)) {
      setResult('')
      setError(null)
      return
    }

    active.run(settled.text).then(
      (output) => {
        if (runIdRef.current !== runId) return
        setResult(output)
        setError(null)
      },
      (reason: unknown) => {
        if (runIdRef.current !== runId) return
        setResult('')
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [settled])

  // 历史：实时在改的东西一敲一个错不值得记，等输入停手两秒、且这次转换成功了再记
  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  /** 上一次记进去的那条，避免同一份内容被重复记（防抖落地与计时器会各走一遍） */
  const lastRecordRef = useRef<{ key: string; text: string } | null>(null)

  useEffect(() => {
    const active = findConverter(settled.key)
    if (error || !active || isEmpty(settled.text)) return

    const timer = setTimeout(() => {
      const last = lastRecordRef.current
      if (last && last.key === active.key && last.text === settled.text) return
      lastRecordRef.current = { key: active.key, text: settled.text }
      // 记的是输入而不是输出：输出是输入的纯函数，回填输入才等于「回到当时那一屏」
      const next = HISTORY.prepend(historyRef.current, active.label, settled.text, {
        now: Date.now(),
        meta: active.key,
      })
      setHistory(next)
      HISTORY.write(next)
    }, HISTORY_SETTLE_MS)

    return () => clearTimeout(timer)
  }, [settled, error])

  const handlePickHistory = (item: HistoryItem) => {
    if (item.contentOmitted) return
    const key = item.meta && findConverter(item.meta) ? item.meta : converterKey
    settle.cancel()
    setConverterKey(key)
    setDrafts((prev) => ({ ...prev, [key]: item.content }))
    setSettled({ key, text: item.content })
  }

  const handleDeleteHistory = (item: HistoryItem) => {
    const next = HISTORY.remove(history, item.id)
    setHistory(next)
    HISTORY.write(next)
  }

  const handleClearHistory = () => {
    setHistory([])
    HISTORY.write([])
  }

  const handleOpenPopup = () => {
    const opened = openToolPopup('transform', POPUP)
    if (opened.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (opened.status === 'focused') message.info('Transform 弹窗已存在，已聚焦')
  }

  // 弹窗与主窗口之间的桥。回调里要用到最新的输入与转换器，又不想每次改动都重建通道
  //（重建的瞬间会漏消息），所以走 ref 读最新值
  const latestRef = useRef({ input, converterKey })
  useEffect(() => {
    latestRef.current = { input, converterKey }
  }, [input, converterKey])

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  const applyIncoming = (key: string, text: string) => {
    const active = findConverter(key)
    if (!active) return
    settle.cancel()
    setConverterKey(active.key)
    setDrafts((prev) => ({ ...prev, [active.key]: text }))
    setSettled({ key: active.key, text })
  }

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前这一屏递过去（name 借来装转换器 key —— 本工具没有文件名）
        bridge.send({
          type: 'state',
          value: latestRef.current.input,
          name: latestRef.current.converterKey,
        })
        return
      }
      if (incoming.type === 'state' || incoming.type === 'update') {
        applyIncoming(incoming.name ?? DEFAULT_CONVERTER_KEY, incoming.value ?? '')
      }
    })
    bridgeRef.current = bridge

    // 弹窗这边喊一声，主窗口会把当前状态回过来
    if (popup) bridge.send({ type: 'hello' })

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
    // applyIncoming 每次渲染都是新的，但它只碰 setState 与 settle（都是稳定的），不必进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup])

  const handleSyncToMain = () => {
    bridgeRef.current?.send({ type: 'update', value: input, name: converterKey })
    message.success('已同步到主窗口')
  }

  const outputConverter = findConverter(settled.key) ?? converter

  return (
    <div className="transform-tool-root">
      <div className="transform-tool-header">
        <span className="transform-tool-header-label">转换：</span>
        <ConverterSelect value={converterKey} onChange={handleConverterChange} />
      </div>

      <Toolbar
        value={result}
        history={history}
        popup={popup}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={handleClearHistory}
        onOpenPopup={handleOpenPopup}
        onSyncToMain={handleSyncToMain}
        onClear={handleClear}
      />

      <div className="transform-tool-panes" ref={hostRef} style={{ height }}>
        <TransformEditor language={converter.sourceLang} value={input} onChange={handleInputChange} />
        <div className="transform-tool-pane">
          <TransformEditor language={outputConverter.targetLang} value={result} editable={false} />
          {/*
            错误压在输出那块上而不是单独占一行：它一出现就改布局，会让上面量高度的 useFillHeight
            量到的高度过期（它观察的是 documentElement，多一行不一定让它变），两块编辑器就会被顶出视口。
          */}
          {error ? (
            <div className="transform-tool-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default TransformTool
