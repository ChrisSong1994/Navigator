/**
 * AST 浏览器。原项目 pages/AstExplorer 搬过来的，只留三类语言，界面与交互尽量照搬：
 *
 * 1、左边写源码，右边看 AST（树 / JSON 两种视图）
 * 2、树上悬停 → 源码里对应那段亮起来；源码里挪光标 → 树自动展开并滚到那个节点
 * 3、点节点会把它挂到 window.$node；Shift 点展开整棵子树
 * 4、解析报错在 AST 面板上亮一条红条
 *
 * 没搬的部分（都写在 README 那一节里）：
 * - Transform（用 @babel/standalone 跑用户写的转换代码）：扩展的 CSP 禁 new Function / eval，
 *   用户代码在这里根本执行不了，开关和那个面板一并去掉。
 * - 另外 9 类语言、15 个 parser：见 parsers/index.ts 的说明。
 * - zustand 那个 store：整套状态只有这一个页面用，跟 Json / 颜色两个工具一样留在组件里。
 */
import { ExportOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Empty, Select, Spin, Splitter, Tooltip, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api'

import AstEditor from './components/Editor/AstEditor.tsx'
import Tree from './components/visualization/Tree.tsx'
import { subscribe } from './components/visualization/utils/pubsub.ts'
import { categories, findCategory } from './parsers/index.ts'
import type { Category, Parser } from './parsers/types.ts'
import { safeStringify } from './lib/safeStringify.ts'
import { useFillHeight } from '../../hooks/useFillHeight.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import './AstExplorer.css'

/** 面板里的东西都填满所在栏 */
const FILL_STYLE = { height: '100%' }

const VIEW_TYPES = [
  { label: 'Tree', value: 'tree' },
  { label: 'JSON', value: 'json' },
] as const

type ViewType = (typeof VIEW_TYPES)[number]['value']

const POPUP = {
  windowName: 'navigator-ast-popup',
  channelName: 'navigator-ast-tool',
  // 左源码右 AST，两栏都要放得下
  width: 1440,
  height: 900,
} as const

/** 哪一套 tree adapter 读这棵 AST：estree 系和别的差别挺大，见 TreeAdapter.ts */
function adapterTypeFor(category: Category): string {
  return category.id === 'javascript' ? 'estree' : category.id
}

const AstExplorer = () => {
  const [category, setCategory] = useState<Category>(categories[0])
  const [parser, setParser] = useState<Parser>(categories[0].parsers[0])
  const [code, setCode] = useState(() => categories[0].codeExample ?? '')
  const [viewType, setViewType] = useState<ViewType>('tree')
  // 地址栏带 popup=1 就是那个被弹出来的窗口：工具栏最后一位换成「同步到主窗口」
  const [popup] = useState(isPopupPage)

  /**
   * 解析库实例，**跟它属于哪个 parser 绑在一起**。
   *
   * 原来分成 `parser` / `parserInstance` 两个 state，切解析器时 parser 先变、实例后到，
   * 中间那一拍就会拿新 parser 的方法去调旧 parser 的实例：切回 babel 的那一刻
   * 会变成 babel.parse(acorn) —— acorn 收下 babel 的那份 options（里面没有 ecmaVersion），
   * 于是控制台冒一句 acorn 的警告，树还会先用错误的那份结果闪一下。
   * 绑成一个对象之后，实例和它的 parser 不可能对不上。
   */
  const [loaded, setLoaded] = useState<{ parser: Parser; instance: any } | null>(null)
  const [loading, setLoading] = useState(true)
  /** 上一次解析的结果。解析失败时保留着它，只把错误亮出来（原版如此，树不会跟着一起消失） */
  const [parseResult, setParseResult] = useState<{ ast: any; error: string | null }>({
    ast: null,
    error: null,
  })
  /** 源码光标位置（字符偏移量），喂给树的自动聚焦 */
  const [position, setPosition] = useState(-1)

  const splitterRef = useRef<HTMLDivElement>(null)
  const height = useFillHeight(splitterRef, 0)

  /** 弹窗那边问 hello 时要递过去的最新一屏：语言 / 解析器 / 源码 / 视图 */
  const latestRef = useRef({
    categoryId: category.id,
    parserId: parser.id,
    code,
    viewType,
  })
  useEffect(() => {
    latestRef.current = { categoryId: category.id, parserId: parser.id, code, viewType }
  }, [category, parser, code, viewType])

  // parser 换了就把解析库换掉。loadParser 是动态 import，只有真用到的语言才会下载
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(null)
    parser
      .loadParser()
      .then((instance) => {
        if (cancelled) return
        setLoaded({ parser, instance })
        setLoading(false)
      })
      .catch((error: Error) => {
        if (cancelled) return
        setParseResult((prev) => ({ ast: prev.ast, error: error.message }))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [parser])

  useEffect(() => {
    if (!loaded) return
    try {
      setParseResult({ ast: loaded.parser.parse(loaded.instance, code), error: null })
    } catch (error: any) {
      setParseResult((prev) => ({ ast: prev.ast, error: error.message }))
    }
  }, [loaded, code])

  // yaml 的 parseDocument 不抛异常，语法错误收在结果里，得单独问一句
  const error = useMemo(() => {
    if (parseResult.error) return parseResult.error
    const reported: string[] = parser.getErrors?.(parseResult.ast) ?? []
    return reported.length > 0 ? reported.join('\n') : null
  }, [parser, parseResult])

  /* 树上悬停 → 源码高亮 ---------------------------------------------------- */

  const sourceEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const highlightRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const applyHighlight = (range: [number, number] | null) => {
      const instance = sourceEditorRef.current
      const model = instance?.getModel()
      if (!instance || !model) return

      const collection =
        highlightRef.current ?? (highlightRef.current = instance.createDecorationsCollection([]))

      if (!range) {
        collection.clear()
        return
      }
      const start = model.getPositionAt(range[0])
      const end = model.getPositionAt(range[1])
      collection.set([
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          options: { className: 'ast-tool-source-highlight' },
        },
      ])
    }

    const unsubscribers = [
      subscribe('HIGHLIGHT', (payload) => applyHighlight(payload?.range ?? null)),
      subscribe('CLEAR_HIGHLIGHT', () => applyHighlight(null)),
    ]
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      highlightRef.current = null
    }
  }, [])

  // 换了语言 / 重新解析过，之前那条高亮就对不上位置了
  useEffect(() => {
    highlightRef.current?.clear()
  }, [parseResult.ast])

  /* 顶部那两个下拉 --------------------------------------------------------- */

  const handleCategoryChange = (value: string) => {
    const next = findCategory(value)
    setCategory(next)
    setParser(next.parsers[0])
    setCode(next.codeExample ?? '')
  }

  const handleParserChange = (value: string) => {
    const next = category.parsers.find((item) => item.id === value)
    if (next) setParser(next)
  }

  // treeAdapter 的配置得 memo 稳：Tree 里是照它认适配器的，每次 render 换一个新对象会把整棵树都重画
  const treeAdapterConfig = useMemo(
    () => ({ type: adapterTypeFor(category) }),
    [category],
  )

  const handleOpenPopup = () => {
    const opened = openToolPopup('ast', POPUP)
    if (opened.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (opened.status === 'focused') message.info('AST 弹窗已存在，已聚焦')
  }

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前这一屏递过去
        bridge.send({ type: 'state', payload: { ...latestRef.current } })
        return
      }
      if (incoming.type !== 'state' && incoming.type !== 'update') return

      const payload = incoming.payload
      if (!payload) return

      const nextCategory = findCategory(payload.categoryId ?? '')
      if (!nextCategory) return
      const nextParser =
        nextCategory.parsers.find((item) => item.id === payload.parserId) ?? nextCategory.parsers[0]

      setCategory(nextCategory)
      setParser(nextParser)
      if (typeof payload.code === 'string') setCode(payload.code)
      if (payload.viewType === 'tree' || payload.viewType === 'json') setViewType(payload.viewType)
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
    <div className="ast-tool-root">
      <div className="ast-tool-toolbar">
        <span className="ast-tool-label">语言</span>
        <Select
          size="small"
          value={category.id}
          onChange={handleCategoryChange}
          options={categories.map((item) => ({ label: item.displayName, value: item.id }))}
          style={{ width: 120 }}
        />
        <span className="ast-tool-label">解析器</span>
        <Select
          size="small"
          value={parser.id}
          onChange={handleParserChange}
          options={category.parsers.map((item) => ({ label: item.displayName, value: item.id }))}
          style={{ width: 160 }}
        />
        {loading ? <Spin size="small" /> : null}
        <span className="ast-tool-toolbar-spacer" />
        {popup ? (
          <Tooltip title="同步到主窗口">
            <Button
              size="small"
              type="text"
              icon={<SyncOutlined />}
              aria-label="同步到主窗口"
              onClick={handleSyncToMain}
            />
          </Tooltip>
        ) : (
          <Tooltip title="弹出到独立窗口">
            <Button
              size="small"
              type="text"
              icon={<ExportOutlined />}
              aria-label="弹出到独立窗口"
              onClick={handleOpenPopup}
            />
          </Tooltip>
        )}
      </div>

      <div className="ast-tool-splitter" ref={splitterRef} style={{ height }}>
        <Splitter style={FILL_STYLE}>
          <Splitter.Panel defaultSize="50%" min="25%">
            <div className="ast-tool-panel">
              <div className="ast-tool-panel-head">源代码</div>
              <div className="ast-tool-panel-body">
                <AstEditor
                  value={code}
                  onChange={setCode}
                  language={parser.editorLanguage ?? 'plaintext'}
                  onCursorChange={setPosition}
                  onEditorChange={(instance) => {
                    sourceEditorRef.current = instance
                    highlightRef.current = null
                  }}
                />
              </div>
            </div>
          </Splitter.Panel>

          <Splitter.Panel defaultSize="50%" min="25%">
            <div className="ast-tool-panel">
              <div className="ast-tool-panel-head">
                <span>{error ? 'AST（有语法错误）' : 'AST'}</span>
                <Select
                  size="small"
                  value={viewType}
                  onChange={setViewType}
                  options={[...VIEW_TYPES]}
                  style={{ width: 88 }}
                />
              </div>

              {error ? (
                <div className="ast-tool-error" role="alert">
                  {error}
                </div>
              ) : null}

              <div className="ast-tool-panel-body">
                {parseResult.ast == null ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={error ? '解析失败' : '没有可解析的内容'}
                  />
                ) : viewType === 'json' ? (
                  <AstEditor
                    value={safeStringify(parseResult.ast, 2)}
                    language="json"
                    readOnly
                  />
                ) : (
                  <Tree ast={parseResult.ast} treeAdapter={treeAdapterConfig} position={position} />
                )}
              </div>
            </div>
          </Splitter.Panel>
        </Splitter>
      </div>
    </div>
  )
}

export default AstExplorer
