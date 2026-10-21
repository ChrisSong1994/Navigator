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
 * 8、浏览器里打开本机的 .md：扩展把那个 file:// 导航换成 ?file= 落到这里（读文件见公共层 lib/file.ts）
 * 9、编辑这份文件之后保存，问一句要不要写回它（见 lib/writeBack.ts 与 lib/sourceHandle.ts）
 * 10、打印 / 导出 PDF：工具栏那个按钮与 Ctrl+P 共用一套版式，纸上只留正文一整篇
 *    （@media print 全在 Markdown.css；深色模式下改由亮色那套主题表说了算，见 useThemeStylesheets）
 *
 * 状态都留在这里：两个模式拿到的是同一份 value / fileName / history / source，切模式只是换个视图。
 */
import { message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import DropOverlay from '../../components/DropOverlay.tsx'
import { createHistoryStore, type HistoryItem } from '../../lib/history.ts'
import {
  fileNameFromUrl,
  pickTextFile,
  READ_FILE_HINT,
  readDroppedFile,
  readUrlDocument,
  saveTextFile,
} from '../../lib/file.ts'
import { isMarkdownLike, MARKDOWN_REJECT_MESSAGE } from '../../lib/markdown.ts'
import { clearPendingDocument, peekPendingDocument } from '../../lib/pendingDocument.ts'
import { createBridge, isPopupPage, openToolPopup } from '../../lib/popup.ts'
import { useColorScheme } from '../../hooks/useColorScheme.ts'
import { useWindowFileDrop } from '../../hooks/useWindowFileDrop.ts'
import { clearFileQuery, fileFromQuery } from '../query.ts'
import { useLastDocument } from './hooks/useLastDocument.ts'
import { MarkdownEditor } from './MarkdownEditor.tsx'
import { MarkdownRender } from './MarkdownRender.tsx'
import { SaveSourceModal } from './components/SaveSourceModal.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { useThemeStylesheets } from './hooks/useThemeStylesheets.ts'
import { MARKDOWN_FILE_KIND } from './lib/kind.ts'
import { readLastDocument } from './lib/lastDocument.ts'
import { imageBaseFromSource } from './lib/localImages.ts'
import type { MarkdownMode } from './lib/mode.ts'
import { createSourceHandleStore } from './lib/sourceHandle.ts'
import { pickAndWrite, writeIntoHandle } from './lib/writeBack.ts'
import SAMPLE from './sample.md?raw'
import './Markdown.css'

/** 本工具在公共层里的身份：历史存哪儿、弹窗叫什么（文件类型见 lib/kind.ts） */
const HISTORY = createHistoryStore('navigator.markdown.history')

/** 记住哪个 file:// 地址是磁盘上的哪个文件，写回源文件时用（见 lib/sourceHandle.ts） */
const SOURCES = createSourceHandleStore()

const POPUP = {
  windowName: 'navigator-markdown-popup',
  channelName: 'navigator-markdown-tool',
  // 左边写右边分栏，比 JSON 那个宽一点
  width: 1280,
  height: 860,
} as const

/** openDocument 的可选项，默认值是「把这份文档当新文档读进来」 */
interface OpenOptions {
  /** 记进历史。历史回填时不用：它本来就在历史里 */
  remember?: boolean
  /** 读完切到演示模式（拖入 / 地址栏打开都算「我要看这份文档」） */
  render?: boolean
  /** 留着地址栏那个 `?file=`（只有它自己读出来的那份才留） */
  keepQuery?: boolean
  /** 这份文档的来源文件地址；没有来源就传空 */
  source?: string | null
}

const MarkdownTool = () => {
  /*
   * 首页拖入交接过来的那份文档（见 lib/pendingDocument.ts）。首页自己不做渲染，把工具页打开就算完事，
   * 呈现和写历史都在这里做 —— 于是「首页拖入」和「工具里拖入」走的是同一份状态。
   * 首屏就要渲染它，所以渲染期先读一眼（读不是副作用）；清掉和落盘放在下面的 effect 里。
   */
  const [handoff] = useState(peekPendingDocument)

  /*
   * 地址栏 ?file= 送来的那份本地文档（扩展换过来的导航，见公共层 lib/file.ts）。它和上面那份交接不会
   * 同时出现：首页拖入走的是页面内 replaceState，不会带上这个参数。
   * 正文要等读完才有，所以先按演示模式摆空态，读完再当一份普通文档装进去。
   */
  const [fileAddress] = useState(() => (handoff ? null : fileFromQuery()))
  /** 读不到地址栏那份文件时的说明，落在演示模式的空态里（见 MarkdownRender 的 emptyReason） */
  const [readFailure, setReadFailure] = useState<string | null>(null)

  /*
   * 上次开着的那份文档（见 lib/lastDocument.ts）。拖入 / 导入 / 历史回填来的文档没有地址栏凭据，
   * 刷新后本该只剩示例文档 —— 那份存档就是给这种情况垫底的。首页交接和 `?file=` 优先：
   * 前者是刚拖进来的新文档，后者每次刷新都按磁盘上的新版重读，都不该被旧存档盖住。
   *
   * 渲染期读一次就行（读不是副作用），和 handoff 同一个路子。
   */
  const [restored] = useState(() => (handoff || fileAddress ? null : readLastDocument()))
  /**
   * 当前这份文档是不是已经就位。两种情况下先不是：地址栏那份还在读（正文空着）、
   * 恢复出来的那份正文太大没存下来（要照来源地址重读一遍）。
   * 只有就位之后才让存档跟着写，否则空正文会把上一份存档顶掉（见 hooks/useLastDocument.ts）。
   */
  const [documentReady, setDocumentReady] = useState(
    () => !fileAddress && !(restored?.contentOmitted ?? false),
  )

  const [value, setValue] = useState(
    handoff?.content ?? restored?.content ?? (fileAddress ? '' : SAMPLE),
  )
  const [currentFileName, setCurrentFileName] = useState<string | null>(
    handoff?.name ?? restored?.name ?? null,
  )
  /**
   * 当前这份文档来自哪个本地文件（`file://` 地址）。有它「保存」才谈得上写回源文件；换成别的
   * 来源（拖入 / 导入 / 另存为）就没了。它跟着历史走，从历史里回填时也会一起回来。
   */
  const [source, setSource] = useState<string | null>(restored?.source ?? null)
  /**
   * 相对图片路径的解析基准（文档所在目录，`file:///…/`）。
   * 只有知道这份文档来自哪个本地文件时才有；拖入 / 导入的 `File` 连路径都拿不到，留空。
   */
  const imageBase = useMemo(() => imageBaseFromSource(source), [source])
  /** 「要写回源文件吗」那个确认框开着没有 */
  const [confirmSave, setConfirmSave] = useState(false)
  // 交接过来这份也算一条历史；HISTORY.add 只做纯计算，落盘同样在 effect 里
  const [history, setHistory] = useState<HistoryItem[]>(() =>
    handoff ? HISTORY.add(HISTORY.read(), handoff.name, handoff.content) : HISTORY.read(),
  )
  /**
   * 打开工具默认编辑模式；整窗拖入（含首页交接）与地址栏那份会自动切到演示模式。
   * 恢复出来的那份按存档时停的模式来（上次是在看文档，刷新后不该跳回编辑器）。
   */
  const [mode, setMode] = useState<MarkdownMode>(
    handoff || fileAddress ? 'view' : (restored?.mode ?? 'edit'),
  )
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

  /*
   * 当前这份文档持续存档：刷新后还能看到它（见 lib/lastDocument.ts 与 hooks/useLastDocument.ts）。
   *
   * 弹窗那份不写：它只是主窗口的一面镜子（内容靠 BroadcastChannel 同步过来），刚打开时手里还是示例文档，
   * 让它写就会把主窗口正在看的那份顶掉 —— 尤其是主窗口已经关掉、hello 没人应答的时候。
   * 读还是照读：直接打开弹窗页（`?tool=markdown&popup=1`）时，有存档总比一进来就是示例文档好。
   *
   * 示例文档原封不动时也不写：那是「还没打开过任何文档」，不是一份文档。存下来以后，第一回进来看到的
   * 就是那天那份旧 sample.md 了，站点更新示例也看不到。改过（或另存 / 有来源）才当归档。
   */
  const pristineSample = !currentFileName && !source && value === SAMPLE
  useLastDocument(
    { name: currentFileName, content: value, source, mode },
    documentReady && !popup && !pristineSample,
  )

  // 改一次存一次。历史最多 20 条、内容也有上限，不值得为它做合并写入
  const rememberHistory = (items: HistoryItem[]) => {
    setHistory(items)
    HISTORY.write(items)
  }

  /**
   * 换一份文档进来。四个入口共用这一个：
   *
   * - 整窗拖入：记历史 + 切演示模式（拖进来就是要看这份文档）
   * - 导入 / 演示模式的上传：记历史，模式不动（「读进当前模式」）
   * - 历史回填：不写历史（它本来就在历史里），模式也不动，但源文件地址要跟着回填
   * - 地址栏送来的本地文件：同拖入，只是得留着地址栏那个参数（keepQuery），并且记下源文件
   *
   * `source` 是这份文档的来源地址：只有本地文件有（拖进来的 File 对象拿不到路径，
   * 见 lib/file.ts），所以别的入口一律传空。
   */
  const openDocument = (
    file: { name: string; content: string },
    { remember = true, render = false, keepQuery = false, source = null }: OpenOptions = {},
  ) => {
    setValue(file.content)
    setCurrentFileName(file.name)
    setSource(source)
    // 有源文件就先把它记着的句柄捞进内存，一会儿「保存」要同步判断在不在手上
    if (source) void SOURCES.preload(source)
    if (remember) {
      rememberHistory(HISTORY.add(history, file.name, file.content, { source: source ?? undefined }))
    }
    if (render) setMode('view')
    setReadFailure(null)
    // 手里这份已经是新文档了，存档可以跟着写（地址栏那份还在读的时候是被压住的，见上面 documentReady）
    setDocumentReady(true)
    // 现在开着的是另一份文档了，地址栏那个 ?file= 作废 —— 留着的话「返回首页」再点进本工具
    // 又会把那份文件读一遍。只有它自己读出来的那份留着，刷新页面才能看到磁盘上的新版
    if (!keepQuery) clearFileQuery()
  }

  // 读 ?file= 那个 effect 要用 openDocument，可它每次渲染都是新的（进依赖会把这份文件读个没完），
  // 所以和下面弹窗那座桥一样，走 ref 读最新那个
  const openRef = useRef(openDocument)
  useEffect(() => {
    openRef.current = openDocument
  })

  // 地址栏那份本地文档：读进来就是一份普通文档（写历史 + 切演示模式），所以和拖入共用 openDocument。
  // 读不到就在空态里说清怎么办 —— 页面已经跳过来了，让用户对着「还没有文档」发愣没有意义
  useEffect(() => {
    if (!fileAddress) return
    let alive = true
    // 坐落之前再看看地址栏：用户中途自己换了文档的话（openDocument 会把那个参数摘掉），
    // 这份慢腾腾读回来的就不该把用户刚挑的那份盖回去
    const wanted = () => alive && fileFromQuery() === fileAddress
    readUrlDocument(fileAddress).then(
      (file) => {
        if (!wanted()) return
        openRef.current(file, { render: true, keepQuery: true, source: fileAddress })
      },
      () => {
        if (wanted()) setReadFailure(READ_FILE_HINT)
      },
    )
    // 这里不 finally 放行存档：读成功时 openDocument 已经放行，被别的入口顶掉时那边也放行了；
    // 只有「读不到」还压着 —— 这一屏是空态，正文是空串，照写会把上一份存档顶掉（见上面 documentReady）。
    return () => {
      alive = false
    }
  }, [fileAddress])

  // 恢复出来的那份要是来自本地文件，把记着的句柄捞进内存：一会儿点「保存」要同步判断在不在手上，
  // 而且确认框里那句提示也跟着变（与从历史回填走 openDocument 时同一件事）
  useEffect(() => {
    if (restored?.source) void SOURCES.preload(restored.source)
  }, [restored])

  // 恢复出来的那份正文太大没存下来（见 lib/lastDocument.ts）：有来源地址就照着地址重读一遍，
  // 读不到就按 READ_FILE_HINT 说清怎么办（和历史里 contentOmitted 那条同样处理）。
  // 只在没有交接、也没有 `?file=` 时才会走到这里，两处的「读文件」不会叠在一起。
  useEffect(() => {
    if (!restored?.contentOmitted || !restored.source) return
    let alive = true
    readUrlDocument(restored.source).then(
      (file) => {
        if (!alive) return
        setValue(file.content)
        setCurrentFileName(file.name)
      },
      () => {
        // 读不回来也要放行存档写入：否则这一屏什么都记不下来
        if (alive) setReadFailure(READ_FILE_HINT)
      },
    ).finally(() => {
      if (alive) setDocumentReady(true)
    })
    return () => {
      alive = false
    }
  }, [restored])

  const handleImport = async () => {
    const picked = await pickTextFile(MARKDOWN_FILE_KIND.accept)
    if (!picked) return
    openDocument(picked)
  }

  /**
   * 另存为 / 没有来源时的普通保存：都是「过一个系统保存框挑个文件写进去」。
   * 存完这份文档就归新文件了 —— 原来那个源文件不再是「这份文档的来源」，别再问要不要写回它。
   */
  const saveAsNewFile = async () => {
    const saved = await saveTextFile(value, currentFileName ?? 'Untitled.md', MARKDOWN_FILE_KIND)
    if (!saved) return
    setCurrentFileName(saved.name)
    setSource(null)
    rememberHistory(HISTORY.add(history, saved.name, value))
  }

  const handleSave = () => {
    // 从本地文件打开的那份：先问一句。浏览器里写回要用户选定文件，问清楚了才不显得莫名其妙
    if (source) {
      setConfirmSave(true)
      return
    }
    void saveAsNewFile()
  }

  const closeConfirmSave = () => setConfirmSave(false)

  /** 写回源文件：手上有句柄就直接写，没有就先弹一次系统保存框把它拿到手（见 lib/writeBack.ts） */
  const writeBackToSource = async () => {
    const url = source
    if (!url) return
    const known = SOURCES.peek(url)
    const result = known
      ? await writeIntoHandle(known, value)
      : await pickAndWrite(value, fileNameFromUrl(url))

    if (result.status === 'cancelled') return

    if (result.status === 'unsupported') {
      message.warning('这个浏览器不能写回本地文件，改用「另存为…」')
      await saveAsNewFile()
      return
    }

    if (result.status === 'blocked') {
      // 文件被删 / 挪走 / 权限没给：句柄废了，忘掉它下次好重新选
      SOURCES.forget(url)
      message.warning('这个文件写不进去了（可能被删掉、挪走了），改用「另存为…」存一份吧')
      return
    }

    if (result.status === 'failed') {
      message.error(`写回失败：${result.reason}`)
      return
    }

    // 写回成功。句柄可能刚拿到（第一次），也可能换了另一个文件，都记到这份来源地址上
    SOURCES.remember(url, result.handle)
    setCurrentFileName(result.name)
    rememberHistory(HISTORY.add(history, result.name, value, { source: url }))
    message.success(`已写回 ${result.name}`)
  }

  const handleClear = () => {
    setValue('')
    setCurrentFileName(null)
    // 清空是用户自己定的状态，存档要跟着记（见 hooks/useLastDocument.ts）
    setDocumentReady(true)
    // 地址栏那份也不要了，不然一刷新它又回来
    setReadFailure(null)
    setSource(null)
    clearFileQuery()
  }

  /**
   * 历史回填。内容还在就直接灌回去。
   *
   * 内容因为太大没留下来（contentOmitted）时，只要条目里记着当初打开它的 `file://` 地址
   * （见 lib/history.ts 的 source），就照着地址把文件重读一遍 —— 文件通常还在原处，
   * 没理由让这条记录永远点不动。读不到就按 READ_FILE_HINT 说清怎么办；
   * 没有来源的（拖入 / 导入来的）仍然点不动。
   */
  const handlePickHistory = async (item: HistoryItem) => {
    if (!item.contentOmitted) {
      // 历史里带着源文件地址（当初打开它的那个 file://），回填时一起回来
      openDocument({ name: item.name, content: item.content }, { remember: false, source: item.source })
      return
    }
    const url = item.source
    if (!url) return
    try {
      const file = await readUrlDocument(url)
      openDocument(file, { remember: false, source: url })
      // 内容重新到手了，把这条历史补全（如果它还是超过 256 KB，就仍然只留名字和时间）。
      // 从存储里重新读一份再算，别用点击时闭包里的那份：读文件是异步的，中途历史可能已经变了
      rememberHistory(HISTORY.add(HISTORY.read(), file.name, file.content, { source: url }))
    } catch {
      message.warning(READ_FILE_HINT, 8)
    }
  }

  const handleDeleteHistory = (item: HistoryItem) => {
    rememberHistory(HISTORY.remove(history, item.id))
  }

  const handleOpenPopup = () => {
    const result = openToolPopup('markdown', POPUP)
    if (result.status === 'blocked') message.warning('浏览器拦下了这个弹窗，请允许本站弹出窗口')
    else if (result.status === 'focused') message.info('Markdown 弹窗已存在，已聚焦')
  }

  // 弹窗与主窗口之间的桥。回调里要用到最新的 value / currentFileName / source，又不想每次改动都重建通道
  // （重建的瞬间会漏消息），所以走 ref 读最新值。source 也要同步：弹窗里同样要按文档目录解析本地图片
  const latestRef = useRef({ value, currentFileName, source })
  useEffect(() => {
    latestRef.current = { value, currentFileName, source }
  }, [value, currentFileName, source])

  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null)

  useEffect(() => {
    const bridge = createBridge(POPUP.channelName, (incoming) => {
      if (incoming.type === 'hello') {
        // 弹窗刚打开，把主窗口当前这份内容递过去
        bridge.send({
          type: 'state',
          value: latestRef.current.value,
          name: latestRef.current.currentFileName,
          source: latestRef.current.source,
        })
        return
      }
      if (incoming.type === 'state' || incoming.type === 'update') {
        setValue(incoming.value ?? '')
        setCurrentFileName(incoming.name ?? null)
        setSource(incoming.source ?? null)
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
    bridgeRef.current?.send({ type: 'update', value, name: currentFileName, source })
    message.success('已同步到主窗口')
  }, [value, currentFileName, source])

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
        sourceName={source ? fileNameFromUrl(source) : null}
        onModeChange={setMode}
        onPrint={() => window.print()}
        onImport={() => void handleImport()}
        onSave={handleSave}
        onClear={handleClear}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={() => rememberHistory([])}
        onOpenPopup={handleOpenPopup}
        onSyncToMain={handleSyncToMain}
      />

      {mode === 'edit' ? (
        <MarkdownEditor
          value={value}
          imageBase={imageBase}
          // 一动笔这份文档就是用户自己的了：存档从这一刻起跟着写
          // （地址栏 / 存档那份还没读回来时依旧不写，见上面 documentReady）
          onChange={(next) => {
            setDocumentReady(true)
            setValue(next)
          }}
        />
      ) : (
        <MarkdownRender
          value={value}
          fileName={currentFileName}
          imageBase={imageBase}
          emptyReason={readFailure}
          onUpload={() => void handleImport()}
        />
      )}

      {dragging ? <DropOverlay text="松开就渲染这份文档" /> : null}

      {confirmSave && source ? (
        <SaveSourceModal
          url={source}
          cached={SOURCES.peek(source) !== null}
          onWriteBack={() => {
            closeConfirmSave()
            void writeBackToSource()
          }}
          onSaveAs={() => {
            closeConfirmSave()
            void saveAsNewFile()
          }}
          onCancel={closeConfirmSave}
        />
      ) : null}
    </div>
  )
}

export default MarkdownTool
