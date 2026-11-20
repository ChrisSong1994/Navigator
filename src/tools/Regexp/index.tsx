import {
  CaretDownOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FlagOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Popover,
  Segmented,
  Space,
  Splitter,
  Tooltip,
  message,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import CheatSheet from './CheatSheet.tsx'
import Highlight from './components/Highlight.tsx'
import MatchTable from './components/MatchTable.tsx'
import RegexpEditor from './components/RegexpEditor.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import Copy from '../../components/Copy.tsx'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { useNarrowViewport } from '../../hooks/useNarrowViewport.ts'
import { createHistoryStore } from '../../lib/history.ts'
import type { HistoryItem } from '../../lib/history.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { debounce, isEmpty } from '../../lib/util.ts'
import {
  buildRegexp,
  findMatches,
  isUserFlag,
  joinFlags,
  MAX_HIGHLIGHT,
  pickUserFlags,
  replaceText,
} from './lib/regex.ts'
import './Regexp.css'

/** 面板里的东西都填满所在栏 */
const FILL_STYLE = { height: '100%' }

/** 本工具在公共层里的身份：历史存哪儿、弹窗叫什么 */
const HISTORY = createHistoryStore('navigator.regexp.history')

const POPUP = {
  windowName: 'navigator-regexp-popup',
  channelName: 'navigator-regexp-tool',
  // 左右分栏，左边编辑器右边结果，跟 Transform / AST 一样宽
  width: 1440,
  height: 900,
} as const

/** 输入停手多久算「这一次试完了」，可以记一条历史（照 Transform 的口径） */
const HISTORY_SETTLE_MS = 2000

/** 待匹配文本 / 替换结果都走 monaco，每次击键都 onChange，正则与匹配得防抖一下 */
const MATCH_DEBOUNCE_MS = 200

type ResultView = 'match' | 'replaced'

const FLAG_OPTIONS = [
  { value: 'g', label: '全局搜索 g' },
  { value: 'i', label: '忽略大小写 i' },
  { value: 'm', label: '多行模式 m' },
] as const

/** 历史的 meta：去重键同时含 pattern 与 flags，回填时才还原得出「同一条正则」 */
interface HistoryMeta {
  pattern: string
  flags: string[]
}

function parseHistoryMeta(item: HistoryItem): HistoryMeta | null {
  if (!item.meta) return null
  try {
    const parsed: unknown = JSON.parse(item.meta)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { pattern, flags } = parsed as HistoryMeta
    if (typeof pattern !== 'string' || !Array.isArray(flags)) return null
    return { pattern, flags: pickUserFlags(flags.filter(isUserFlag)) }
  } catch {
    return null
  }
}

function historyName(pattern: string, flags: readonly string[]): string {
  return `/${pattern}/${joinFlags(flags)}`
}

const RegexpTool = () => {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState<string[]>(['g'])
  const [content, setContent] = useState('')
  const [replacer, setReplacer] = useState('')
  const [replaced, setReplaced] = useState('')
  const [resultView, setResultView] = useState<ResultView>('match')
  /** 窄屏下「语法参考」用抽屉而不是弹层 */
  const [cheatOpen, setCheatOpen] = useState(false)
  /** 高亮区与明细表联动选中的那一处 */
  const [activeKey, setActiveKey] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => HISTORY.read())
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  const flagText = useMemo(() => joinFlags(flags), [flags])

  /* 匹配 ------------------------------------------------------------------ */

  /**
   * 待匹配文本先落进 `content`（编辑器里立刻显示），再防抖成 `settledText` 交给匹配。
   * monaco 每击一键都 onChange，拿长文本每次击键跑一遍 matchAll 会明显卡；上游是 antd TextArea
   * + TextArea 的 onChange 也直接算，但它的文本短，这里不能照搬。
   */
  const [settledText, setSettledText] = useState('')
  const settle = useMemo(
    () => debounce((text: string) => setSettledText(text), MATCH_DEBOUNCE_MS),
    [],
  )
  useEffect(() => () => settle.cancel(), [settle])

  const handleContentChange = (next: string) => {
    setContent(next)
    settle(next)
    // 改原文就是在看匹配，别把用户留在过期的「替换结果」那一栏
    setResultView('match')
  }

  /** 用 pattern 输入框改正则时同理：回到匹配结果 */
  const handlePatternChange = (next: string) => {
    setPattern(next)
    setResultView('match')
  }

  /** 清空、回填历史这类「一下子就换掉」的动作不走防抖，否则会和防抖里的旧值打架 */
  const replaceContent = (next: string) => {
    settle.cancel()
    setContent(next)
    setSettledText(next)
  }

  const compiled = useMemo(() => {
    if (isEmpty(pattern)) return { regexp: null, error: null }
    try {
      return { regexp: buildRegexp(pattern, flags), error: null }
    } catch (error) {
      return { regexp: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [pattern, flags])

  const found = useMemo(() => {
    if (!compiled.regexp || isEmpty(settledText)) return { matches: [], truncated: false }
    return findMatches(compiled.regexp, settledText)
  }, [compiled.regexp, settledText])

  // 正则或文本一换，之前选中的那处就对不上了
  useEffect(() => {
    setActiveKey(null)
  }, [compiled.regexp, settledText])

  /* 替换 ------------------------------------------------------------------ */

  /**
   * 替换保持上游的「按钮触发」：不实时重算，点一下算一次。
   *
   * 但「点过之后又改了正则或原文」时，右栏那份结果就悄悄过期了。所以记下算出它时的输入，
   * 跟当前的比一比，不一致就在面板头上说一句，免得用户以为看到的是最新结果。
   */
  const [replaceSource, setReplaceSource] = useState<{ pattern: string; flags: string; text: string; replacer: string } | null>(null)

  const handleReplace = () => {
    if (!compiled.regexp || isEmpty(settledText)) return
    setReplaced(replaceText(compiled.regexp, settledText, replacer))
    setReplaceSource({ pattern, flags: joinFlags(flags), text: settledText, replacer })
    setResultView('replaced')
  }

  const replaceStale =
    replaced !== '' &&
    (replaceSource === null ||
      replaceSource.pattern !== pattern ||
      replaceSource.flags !== joinFlags(flags) ||
      replaceSource.text !== settledText ||
      replaceSource.replacer !== replacer)

  /* 历史 ------------------------------------------------------------------ */

  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  /** 上一次记进去的那条，避免同一份内容被重复记（防抖落地与计时器会各走一遍） */
  const lastRecordRef = useRef<{ pattern: string; flags: string; content: string } | null>(null)

  useEffect(() => {
    // 只记「试成了」的：正则非法、或还没写文本时不记
    if (compiled.error || !compiled.regexp || isEmpty(settledText)) return

    const flagKey = joinFlags(flags)
    const timer = setTimeout(() => {
      const last = lastRecordRef.current
      if (
        last &&
        last.pattern === pattern &&
        last.flags === flagKey &&
        last.content === settledText
      ) {
        return
      }
      lastRecordRef.current = { pattern, flags: flagKey, content: settledText }
      const meta: HistoryMeta = { pattern, flags: [...flags] }
      const next = HISTORY.add(historyRef.current, historyName(pattern, flags), settledText, {
        now: Date.now(),
        // 去重键取 meta：pattern 与 flags 一起，同一条正则换修饰符算两条
        meta: JSON.stringify(meta),
      })
      setHistory(next)
      HISTORY.write(next)
    }, HISTORY_SETTLE_MS)

    return () => clearTimeout(timer)
  }, [pattern, flags, settledText, compiled.error, compiled.regexp])

  const handlePickHistory = (item: HistoryItem) => {
    if (item.contentOmitted) return
    const meta = parseHistoryMeta(item)
    // 早先没带 meta 的记录（或 meta 坏掉的）就把 pattern 留空，至少把文本填回去
    if (meta) {
      setPattern(meta.pattern)
      setFlags(meta.flags.length ? meta.flags : ['g'])
    }
    replaceContent(item.content)
    setReplaced('')
    setResultView('match')
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

  /* 弹窗与同步 ------------------------------------------------------------ */

  const handleOpenPopup = () => {
    const opened = openToolPopup('regexp', POPUP)
    if (opened.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (opened.status === 'focused') message.info('正则弹窗已存在，已聚焦')
  }

  // 回调里要用最新一屏，又不想每次改动都重建通道（重建瞬间会漏消息），所以走 ref
  const latestRef = useRef({ pattern, flags: flagText, content, replacer, replaced })
  useEffect(() => {
    latestRef.current = { pattern, flags: flagText, content, replacer, replaced }
  }, [pattern, flagText, content, replacer, replaced])

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前一屏递过去
        bridge.send({ type: 'state', payload: { ...latestRef.current } })
        return
      }
      if (incoming.type !== 'state' && incoming.type !== 'update') return

      const payload = incoming.payload
      if (!payload) return
      if (typeof payload.pattern === 'string') setPattern(payload.pattern)
      if (typeof payload.flags === 'string') setFlags(pickUserFlags(payload.flags.split('')))
      // setContent 与 settle 都得走一遍：编辑器里要立刻换，匹配也不能被还在防抖队列里的旧值盖回去
      if (typeof payload.content === 'string') replaceContent(payload.content)
      if (typeof payload.replacer === 'string') setReplacer(payload.replacer)
      if (typeof payload.replaced === 'string') setReplaced(payload.replaced)
    })
    bridgeRef.current = bridge

    // 弹窗这边喊一声，主窗口会把当前状态回过来
    if (popup) bridge.send({ type: 'hello' })

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
    // replaceContent 每次渲染都是新函数，但它只碰 setState 与 settle（都是稳定的），不必进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup])

  const handleSyncToMain = () => {
    bridgeRef.current?.send({ type: 'update', payload: { ...latestRef.current } })
    message.success('已同步到主窗口')
  }

  /* 布局 ------------------------------------------------------------------ */

  const hostRef = useRef<HTMLDivElement>(null)
  // 不留余量：分栏一路铺到视口底部，卡片自身的下内边距天然就是间距
  const height = useFillHeight(hostRef, 0)
  // 窄屏左右分栏会把两栏都挤成一条，改成上下排
  const narrow = useNarrowViewport()

  const matchSummary = (() => {
    if (!compiled.regexp) return ''
    if (isEmpty(settledText)) return '等待输入待匹配文本'
    if (found.matches.length === 0) return '没有匹配'
    const count = found.matches.length
    const head = `共 ${count} 处匹配`
    return found.truncated ? `${head}（已达上限，只列前 ${count} 处）` : head
  })()

  return (
    <div className="regexp-tool-root">
      {/* 顶栏：pattern + 修饰符 + 语法参考 + 右侧工具按钮 */}
      <div className="regexp-tool-header">
        <div className="regexp-tool-pattern">
          <Input
            size="large"
            value={pattern}
            placeholder="在这里输入正则..."
            spellCheck={false}
            status={compiled.error ? 'error' : undefined}
            onChange={(event) => handlePatternChange(event.target.value)}
            prefix={
              <span className="regexp-tool-delimiter">
                {compiled.error ? (
                  <Tooltip placement="bottomLeft" title={compiled.error}>
                    <ExclamationCircleOutlined className="regexp-tool-error-icon" />
                  </Tooltip>
                ) : null}
                /
              </span>
            }
            suffix={<span className="regexp-tool-delimiter">/{flagText}</span>}
          />

          <Popover
            placement={narrow ? 'bottomRight' : 'bottomLeft'}
            trigger="click"
            content={
              <div className="regexp-tool-flags">
                <Checkbox.Group
                  value={flags}
                  onChange={(next) => {
                    setFlags(next as string[])
                    // 换修饰符等于换了一条正则，同样回到匹配结果
                    setResultView('match')
                  }}
                >
                  <Space direction="vertical" size={6}>
                    {FLAG_OPTIONS.map((option) => (
                      <Checkbox key={option.value} value={option.value}>
                        {option.label}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
                <div className="regexp-tool-flags-divider" />
                <a
                  target="_blank"
                  rel="noreferrer"
                  href="https://tc39.es/ecma262/multipage/text-processing.html#sec-get-regexp.prototype.flags"
                >
                  <LinkOutlined /> 修饰符介绍
                </a>
              </div>
            }
          >
            <Button size="large">
              <Space>
                <FlagOutlined /> 修饰符
                <CaretDownOutlined />
              </Space>
            </Button>
          </Popover>

          {/*
            语法参考是两张表，宽屏 680px，窄屏窗口根本放不下 —— 窄屏改成右侧抽屉，
            不再跟锚点抢空间（antd 的 Popover 遇到放不下会强行往屏幕外推）。
          */}
          {narrow ? (
            <Button size="large" onClick={() => setCheatOpen(true)}>
              <Space>
                <FileSearchOutlined /> 语法参考
                <CaretDownOutlined />
              </Space>
            </Button>
          ) : (
            <Popover placement="bottomLeft" trigger="click" content={<CheatSheet />}>
              <Button size="large">
                <Space>
                  <FileSearchOutlined /> 语法参考
                  <CaretDownOutlined />
                </Space>
              </Button>
            </Popover>
          )}
        </div>

        <Drawer
          title="正则语法速查"
          placement="right"
          width="min(560px, 92vw)"
          open={cheatOpen}
          onClose={() => setCheatOpen(false)}
          destroyOnHidden
          rootClassName="regexp-tool-cheat-drawer"
        >
          <CheatSheet />
        </Drawer>
        <Toolbar
          history={history}
          popup={popup}
          canClear={!isEmpty(content)}
          onPickHistory={handlePickHistory}
          onDeleteHistory={handleDeleteHistory}
          onClearHistory={handleClearHistory}
          onOpenPopup={handleOpenPopup}
          onSyncToMain={handleSyncToMain}
          onClear={() => {
            replaceContent('')
            setReplaced('')
          }}
        />
      </div>

      {/* 分栏：左原文 + 替换行，右结果；窄屏改成上下排 */}
      <div className="regexp-tool-splitter" ref={hostRef} style={{ height }}>
        <Splitter style={FILL_STYLE} vertical={narrow}>
          <Splitter.Panel defaultSize="50%" min={narrow ? '25%' : '30%'}>
            <div className="regexp-tool-pane">
              <div className="regexp-tool-pane-head">
                <span>待匹配文本</span>
                <span className="regexp-tool-muted">{content.length} 字符</span>
              </div>
              <div className="regexp-tool-editor">
                <RegexpEditor value={content} onChange={handleContentChange} />
              </div>
              <div className="regexp-tool-replace-row">
                <Input
                  value={replacer}
                  placeholder="替换文本，可用 $1 / $& / $<name>"
                  spellCheck={false}
                  disabled={!compiled.regexp || isEmpty(settledText)}
                  onChange={(event) => setReplacer(event.target.value)}
                  onPressEnter={handleReplace}
                />
                <Button
                  type="primary"
                  disabled={!compiled.regexp || isEmpty(settledText)}
                  onClick={handleReplace}
                >
                  替换
                </Button>
              </div>
            </div>
          </Splitter.Panel>

          <Splitter.Panel defaultSize="50%" min={narrow ? '25%' : '30%'}>
            <div className="regexp-tool-pane">
              <div className="regexp-tool-pane-head">
                <Segmented
                  size="small"
                  value={resultView}
                  onChange={(next) => setResultView(next as ResultView)}
                  options={[
                    { label: '匹配结果', value: 'match' },
                    { label: '替换结果', value: 'replaced' },
                  ]}
                />
                <span className="regexp-tool-muted">
                  {resultView === 'match'
                    ? matchSummary
                    : replaced
                      ? replaceStale
                        ? '正则或原文已经改过，这份结果过期了 —— 再点一次「替换」'
                        : '点复制拿走结果'
                      : '点左下的「替换」生成结果'}
                </span>
                {resultView === 'replaced' ? <Copy value={replaced} /> : null}
              </div>

              {compiled.error ? (
                <div className="regexp-tool-result">
                  <Alert
                    type="error"
                    showIcon
                    message="正则表达式有误"
                    description={compiled.error}
                  />
                </div>
              ) : resultView === 'match' ? (
                <div className="regexp-tool-result regexp-tool-result-match">
                  {found.matches.length ? (
                    <>
                      <div className="regexp-tool-highlight-box">
                        <Highlight
                          text={settledText}
                          matches={found.matches}
                          activeKey={activeKey}
                          onSelect={(key) => setActiveKey(key === activeKey ? null : key)}
                        />
                        {found.matches.length > MAX_HIGHLIGHT ? (
                          <div className="regexp-tool-highlight-note">
                            原文只高亮前 {MAX_HIGHLIGHT} 处，完整列表见下方明细
                          </div>
                        ) : null}
                      </div>
                      <div className="regexp-tool-table-box">
                        <MatchTable
                          matches={found.matches}
                          activeKey={activeKey}
                          onSelect={(key) => setActiveKey(key === activeKey ? null : key)}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="regexp-tool-placeholder">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          !compiled.regexp
                            ? '输入正则后在这里看匹配结果'
                            : isEmpty(settledText)
                              ? '在左边填入待匹配文本'
                              : '没有匹配到内容'
                        }
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="regexp-tool-editor">
                  {replaced ? (
                    <RegexpEditor value={replaced} editable={false} />
                  ) : (
                    <div className="regexp-tool-placeholder">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="点左下的「替换」按当前正则生成结果"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      </div>
    </div>
  )
}

export default RegexpTool