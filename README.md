# 导航精灵

一个可安装为 **Chrome / Edge 新标签页插件**的链接导航主页：配置来自一份可手工编辑的源文件，构建时解析成运行时配置；运行时整份配置同步到 Chrome 用户同步存储，也可以在页面右侧配置面板里修改、导入导出。

技术栈：Vite + React 19 + TypeScript + Ant Design 6 + Tailwind CSS 4。

## 功能

- Chrome 新标签页：`chrome_url_overrides.newtab` 指向构建产物 `index.html`
- 跨设备配置同步：整个 `{ settings, groups }` 通过 `chrome.storage.sync` 分片持久化，同一 Chrome 账号自动同步
- 全局搜索：Google / 百度 / 必应，支持搜索联想、`Cmd/Ctrl+K` 和 `/` 快捷键
- 链接导航：卡片 / 列表两种展示、明暗模式跟随系统、分组目录、拖拽排序
- 配置面板：标题 / Logo / 主题 / 主色 / 字号 / 间距 / 展示模式 / 搜索引擎 / 搜索与链接跳转方式 / 壁纸 / 分组与链接增删改
- Bing 壁纸：关闭、从最近 8 天中选取、按间隔自动轮播、自定义图片地址；配置里只持久化一个图片直链
- Chrome 书签双向同步：手动从书签栏 /「导航精灵」拉取，或把当前配置推送 / 覆盖到书签栏下的「导航精灵」文件夹
- 数据导入导出：标准配置 JSON，以及 Chrome 书签 HTML
- 工具箱：顶栏入口弹出工具抽屉，选中后整页打开该工具，左上角返回箭头回首页；目前有颜色工具（取色面板、HEX / RGB / CMYK / HSV / HSL 互转、颜色记录）、JSON 工具（格式化 / 压缩 / 校验并给出行列与出错片段 / 修复 / JSON5 兼容解析 / 转义与去转义 / 上传下载 / 浏览器里打开或首页拖入本机 .json 直接落进来）、Markdown 工具（编辑 + 预览、演示模式（左侧目录、拖入 .md 即渲染、浏览器里打开本机 .md 也落在这里）、GFM、公式、图表、代码高亮、导入导出 .md、保存时可写回源文件）、AST 工具（JS / TS、JSON、YAML 三种语言转 AST，树与 JSON 两种视图，悬停联动源码高亮）和 Transform 工具（JSON / YAML / JavaScript 对象互转 TypeScript、Go、Java、Kotlin、MySQL、JSON Schema），工具界面按需懒加载
- 扩展弹窗：点扩展图标弹出「收藏当前页 + 工具列表 + 外观开关」，收藏时挑分组（或就地新建）直接写进配置，主题模式 / 展示模式一键切换

## 数据流

```
chrome_bookmarks_demo.html ──pnpm import:bookmarks──▶ global_original.json5   （手工编辑的源配置，JSON5）
                                                            │
                                                       pnpm refresh
                                                            │  校验格式 + 补默认值
                                                            ▼
                                                   src/global_runtime.json    （内置运行时配置，随前端一起构建）
                                                            │
                                                        页面运行时
                                                            │
                        内置配置 + chrome.storage.sync / localStorage 合并 ◀──▶ 配置面板
```

`global_original.json5`、`src/global_runtime.json`、同步快照和导出的 JSON 结构一致：

```json5
{
  settings: {
    siteTitle: '导航精灵',
    siteLogo: '',
    primaryColor: '',
    linkFontSize: 14,
    linkCardGap: 16,
    themeMode: 'system', // system | light | dark
    viewMode: 'card',    // card | list
    searchEngine: 'google', // google | baidu | bing
    searchOpenInNewTab: true, // 搜索结果 / 直接输入的网址是否新开窗口
    linkOpenInNewTab: true,   // 点击导航链接是否新开窗口
    wallpaperMode: 'none',    // none | bing | rotation | url
    wallpaperUrl: '',         // 当前生效的图片直链
    wallpaperInterval: 60,    // 自动轮播间隔（分钟）
    wallpaperDim: 30,         // 壁纸压暗程度 0~80
    wallpaperBlur: 0          // 壁纸模糊半径 0~20
  },
  groups: {
    常用: {
      title: '常用',
      links: [{ icon: '', href: 'https://github.com', text: 'GitHub' }]
    }
  }
}
```

执行 `pnpm refresh` 会校验 `global_original.json5` 并生成 `src/global_runtime.json`；页面运行时以内置配置为底、本地 / 同步配置优先做合并。

## 壁纸

配置面板的「壁纸」页提供四种模式：

- **关闭**：保持原有纯色 / 主色光晕背景；
- **Bing 选择**：从 Bing 官方最近约 8 天壁纸里点选一张；
- **自动轮播**：按 15 分钟 ~ 24 小时的间隔，在最近壁纸之间轮换，刷新后按时间片保持稳定；
- **图片地址**：输入 `http(s)` 图片直链。

无论哪种模式，配置里最终只保存 `settings.wallpaperUrl` 一个连接，不保存 Bing 返回的列表。Bing 列表仅在浏览器扩展环境中通过 service worker 请求；普通网页开发环境不支持 Bing 列表，但「图片地址」模式仍可直接使用。

## 配置同步

- 扩展环境使用 `chrome.storage.sync`，整份配置与合并记账（墓碑等）都会同步；由于单 key 有 8 KB 限制，会自动拆成多个分片。Chrome 实际按「key + `JSON.stringify(value)` 的 UTF-8 字节」计这一项，**JSON 转义也算**（引号 / 反斜杠翻倍，控制字符最多 6 字节），所以分片是按转义后的字节切的；按原始文本切会出现「看着没到 8 KB、写入却报 `kQuotaBytesPerItem`」。
- `chrome.storage.local` 保存同设备的完整快照，sync 暂时不可用、分片写入中断或 localStorage 被清掉时作为兜底（读取时先 `JSON.parse` 再校验）。
- 普通 `pnpm dev` / 非扩展网页环境自动回退到 `localStorage`，方便本地开发。
- `chrome.storage.sync` 总配额约 100 KB（分片 + manifest 合计），且浏览器可能按设备 / 登录状态产生延迟；不建议在配置里放大量 base64 图片。配置面板上传时可取消“保留 base64 图标”。超过总量时本机快照照常保存，弹窗 / 配置面板会提示「已保存在本机，但没同步到云端」，而不是把这次收藏整个失败。
- Chrome 书签只是手动双向同步入口，完整配置、外观设置和合并元数据仍以 `chrome.storage.sync` 为准。

## 搜索

顶部主搜索框使用配置里的 `settings.searchEngine`（默认 Google）：

- 输入内容后 Enter / 点击搜索按钮 → 按 `searchOpenInNewTab` 在新窗口或当前窗口打开搜索结果
- 输入 `https://...` 或裸域名 → 直接打开对应网址
- 输入时显示搜索引擎联想词，支持上下方向键与 Enter
- 联想词下面会按关键词列出命中的本地快捷链接（链接名或地址包含关键词即命中，最多 6 条，超出只提示总数），按 `linkOpenInNewTab` 打开；方向键可以在联想词和快捷链接之间连续移动
- 中文输入法组词时按 Enter 只上屏，不会触发搜索
- `Cmd/Ctrl+K` 或 `/` 聚焦搜索框

联想请求在扩展环境经 `service_worker.js` 代理，避免页面跨域限制；普通网页环境尝试直接请求，失败时静默降级为普通搜索。

## 工具箱

顶栏的工具箱按钮弹出工具抽屉，选中一个工具就整页打开它（首页 `/` ↔ 工具页 `/?tool=json`），左上角返回箭头回首页，右上角仍可直接换工具。工具名会写进地址栏，刷新、复制链接、以及「弹出到独立窗口」开出去的那个窗口都能直接落到同一个工具上；认不出的参数当首页处理。

工具内容按需懒加载：不打开工具箱里的工具，就不下载那份 chunk。扩展弹窗里也有一份同样的工具列表（同一份 `ToolList`，见「扩展弹窗」）。

### 颜色工具

同样从 `developer-assistant` 的 `src/renderer/pages/Color` 搬过来，界面与交互保持原样：

- 取色面板：饱和度 / 明度方板 + 色相条，可拖拽，也能用方向键微调（一次 1% / 1°）
- HEX / RGB / CMYK / HSV / HSL 五格输入，互相联动，各带一个复制按钮；吸色按钮调浏览器的 EyeDropper（Chrome / Edge 有）
- 「记录一下」把当前色存进记录栏（localStorage，`navigator.color.records`），点一下切回那个色，名字就地改，指上去出删除按钮

原版的取色面板是 `react-color` 的 `ColorWrap` / `Hue` / `Saturation` / `GooglePointer`，这里没有引这个包，面板和换算都是自己写的（`lib/color.ts`，`pnpm check:tools` 里有 10 项断言盯着）。

### JSON 工具

从 `developer-assistant` 的 `src/renderer/pages/Json` 整套搬过来，界面与交互保持原样，Electron 那部分换成浏览器能力：

- monaco 编辑器（JSON 语法高亮、行号）、格式化 / 压缩 / 校验 / 修复（jsonrepair）/ JSON5 兼容解析 / 转义与去转义 / 复制 / 导入导出文件
- 校验失败给出行列和出错那一行（带 caret 指到列上）
- JSONPath 查询与速查表
- JSON 结构图：reaflow + ELK 分层布局，节点可搜索定位、缩放、全屏
- 历史记录：最多 20 条存在 localStorage（保存 / 上传 / 地址栏打开 / 弹窗同步时各记一条，内容超过 256 KB 只留名字和时间），点一条回填；内容没留下来的条目若是从本机文件打开的（记着 `file://` 地址），点一下会照着地址重读，没有来源的则点不动
- 弹出到独立窗口：`window.open` 开 `/?tool=json&popup=1`，两个窗口用 BroadcastChannel 双向同步内容
- 浏览器里打开 / 首页拖入本机 `.json`：整页落到这里并把文件装进编辑器（与 Markdown 同一条路，见下面「浏览器里打开本机的文件」）

体积：JSON 工具那份 chunk 约 5.2 MB（gzip 约 1.5 MB），ELK 布局单独打成 `elk.bundled-*.js`（约 1.4 MB），monaco 的两个 worker 各占一份（`editor.worker` 约 260 KB、`json.worker` 约 390 KB）。这些都只在打开工具时请求，新标签页首屏不为它们付出字节。

扩展里的一个坑：ELK 必须跑在主线程上。reaflow 默认给 ELK 传一个 base64 `data:` URL 的 Worker，而扩展页面的 CSP 是 `script-src 'self'`（`worker-src` 未设置时回落到它），data: / blob: 都不在其中 —— worker 直接被拦掉，布局永远不返回、画布空着，而且 manifest 里补 `worker-src` 也没用（`worker-src` 的回落链只到 `script-src`，想放行得改 `script-src` 本身，而那是拿一条 CSP 换一个可以 `data:` 起线程的口子，不划算）。`vite.config.ts` 因此把 `elkjs/lib/elk-api` 别名到 `src/tools/Json/GraphView/lib/elkMainThread.ts`，丢掉 `workerFactory` 走 `elk.bundled` 的进程内实现。

### Markdown 工具

从 `developer-assistant` 的 `src/renderer/pages/Markdown` 搬过来，界面与交互保持原样：

- 左编辑右预览（bytemd，底层 CodeMirror 5），预览支持 GFM：表格、任务列表、脚注、`~~删除线~~`、gemoji（`:thumbsup:` → 👍）、自动链接
- 公式（KaTeX）、图表（mermaid）、代码块高亮（highlight.js），都随预览即时渲染
- 工具栏（左边一排）：编辑 / 演示切换、复制、导入 `.md`、保存 / 导出 `.md`（优先 `showSaveFilePicker`，取消就当没发生）、历史记录、弹出到独立窗口、清除
- 历史记录：最多 20 条存在 localStorage（`navigator.markdown.history`，拖入 / 上传 / 保存时各记一条，内容超过 256 KB 只留名字和时间；这种条目若是从本机文件打开的，点一下会照着记下的 `file://` 地址重读，没有来源的则点不动），点一条回填；编辑与演示两个模式共用这一份。从本地文件打开的那份还会在条目里记下它的 `file://` 地址（`source` 字段），回填之后「保存」照样能问一句要不要写回那个文件
- 弹出到独立窗口：`window.open` 开 `/?tool=markdown&popup=1`，两个窗口用 BroadcastChannel 双向同步内容；弹窗里那个按钮变成「同步到主窗口」
- 拖拽 `.md` 文件到窗口（不只编辑器那一块）直接载入，并自动切到演示模式（见下）
- bytemd 自带的那排右侧图标（目录、帮助、仅编辑区 / 仅预览区）留在原地，分栏 ↔ 单栏由它切换

**演示模式**（`MarkdownRender.tsx`）是整份文档的只读阅读视图，左侧一栏是文档目录，右侧 980px 居中阅读栏：

- 渲染用 `@bytemd/react` 的 `Viewer`：和编辑器的 `Editor` 同一个包、同一份 `plugins.ts`、同一条 hast 管线，输出就是编辑器预览区那段 `div.markdown-body` —— 两个模式下同一份文档长得一模一样，不必再引一个 markdown 渲染器
- 目录里的标题**从渲染后的 DOM 里取**（`querySelectorAll('h1,…,h6')`），不自己扫源码：bytemd 自己的侧栏目录就是这么做的。扫源码的话 setext 标题（`===` 下划线那种）、代码块里的 `#`、frontmatter 都得自己照顾一遍；也要注意 `Viewer` 是 `dangerouslySetInnerHTML`，value 一变整块 DOM 重建，标题元素表必须在同一次 layout effect 里重取，不能跨渲染缓存节点。取的还得滤掉 `.sr-only`：脚注插件会给自己补的「Footnotes」小标题挂这个类（见下），那不是文档里的标题
- 点目录跳转用 `scrollIntoView`，滚动高亮用 rAF 合并的 scroll 监听（取「最后一个越过栏顶」的标题）；滚动发生在正文栏内部，不是整页滚。窄屏（< 1024px）目录整列隐藏，与首页的分组目录一致
- 高亮有两个位置判断兜不住的坑，各补一条规则：**末尾几节**后面没有足够内容把它们顶到栏顶（正文栏已到底，滚动条到头了），按位置判它们永远点不亮，所以到底时直接认最后一节；用户**点了目录**则那一项说了算，直到用户自己动手滚（解锁认滚轮 / 触屏拖 / 拖滚动条或点正文 / 键盘翻页这四种输入事件）—— 否则点末尾那节，高亮会立刻跳到它后面那一节
- 条目的缩进按标题层级，**以文档里最浅的那一级为基准**（`paddingLeft` 是 8px + 每深一级 12px）：一份通篇 h2 的文档，h2 就是第一层、不缩进，而不是死按 h1 起算、让整份文档平白缩进一格
- 空文档（清空 / 拖进一个空文件）给空态：一个「上传 Markdown」按钮加一句提示，不画一版空白正文
- 两个模式各自 mount、各自持一份 `useFillHeight`：共用一份的话，切模式时 ref 会在元素和 null 之间来回，而 `useFillHeight` 的 effect 依赖 ref 对象（稳定的）不会重跑，量到的高度会停在切走前的旧值
- `.markdown-body`（github-markdown-css）自带的是一块整画布底色（暗色 `#0d1117`），落在 `--spirit-surface` 的卡片上是一块异色，演示模式里覆盖成透明，并把 45px 的四周留白收成 `28px 40px 72px`。这两条只挂在 `.markdown-render-pane` 作用域下，编辑器里的预览区不受影响

**整窗拖入**（公共层 `src/hooks/useWindowFileDrop.ts`，工具页和首页各挂一份）拖到窗口里任何地方都算数，在工具页里落下来一律**切演示模式**渲染（编辑器自己那个落点因此删掉了，规则只剩一条）：

- 监听挂在 `window` 且用**捕获阶段**：编辑器里的 CodeMirror 自己会处理拖拽，冒泡阶段未必轮得到我们；捕获阶段还能顺手 `preventDefault` 掉浏览器「拿这个文件打开新页面」的默认行为
- 只认文件拖拽（`dataTransfer.types` 含 `Files`），否则在编辑器里选中一段文字拖动、拖链接都会让遮罩莫名其妙地亮起来
- 遮罩显示用进出计数维护（dragover / dragleave 会对着子元素反复触发），拖出窗口靠 `relatedTarget === null` 收尾；遮罩是公共组件 `components/DropOverlay.tsx`（`.spirit-drop-overlay`），只做提示、`pointer-events: none`
- 文件判定看后缀（`isMarkdownLike`，公共层 `src/lib/markdown.ts`：`.md` / `.markdown` / `.mdown` / `.mkd` / `.mkdn` / `.txt`）：macOS 上 `.md` 的 `File.type` 常常是空串，只认 MIME 的话拖进来全被拒。工具页里不是 Markdown 只提示一句，内容与模式都不动

**首页**也认这份拖入（`App.tsx` 的 `Page`）：拖 `.md` 到首页直接进 Markdown 演示模式，拖 `.json`（含 `.json5`）直接进 JSON 编辑器。首页自己不渲染，走 `lib/pendingDocument.ts` 把文件交给工具页，工具页挂载时取一次（模块级变量就够 —— `?tool=` 是 `replaceState`，切页不刷新页面实例）。

- 首页那份实例靠 `enabled` 在工具页打开时关掉：不然窗口上两套监听同时在，工具里拖入会顺带触发首页的「换工具」
- 首页只认 md / json，别的文件 **不拦不提示、只当没发生**。这里有个躲不掉的事实：拖动过程中浏览器只肯说「有文件」，是哪个文件要等 `drop` 才知道，所以想做投放目标就必然是个「全量投放目标」，别的文件的默认行为一并被吃掉（拖着经过首页时遮罩也会亮）。实测别的文件落上去本来也是原地不动，没有实际损失。分流看后缀（`isMarkdownLike` / `isJsonLike`，公共层 `src/lib/markdown.ts` 与 `src/lib/json.ts`），两张后缀表不能有交集
- 收文件后写历史、装进对应工具这两件事在工具页那侧做，所以「首页拖入」和「工具里打开」在历史与呈现上完全一致

**浏览器里打开本机的 `.md` / `.json`**（扩展）：在地址栏敲 `file:///…/x.md`，或者双击一个 `.md` / `.json` 让浏览器打开，Markdown 会落到工具的**演示模式**、JSON 会落进 **JSON 编辑器**，而不是让 Chrome 显示那一段纯文本。

- 换页在 `public/service_worker.js` 里做：`chrome.tabs.onUpdated` 看到 `file://` 且路径后缀属于哪张表，就 `chrome.tabs.update` 换成本扩展的 `index.html?tool=markdown|json&file=<原文地址>`。后缀表要和 `src/lib/markdown.ts` 的 `MARKDOWN_EXTENSIONS`、`src/lib/json.ts` 的 `JSON_EXTENSIONS` 一致（service worker 是纯 JS 进不了构建，只能靠 `scripts/check-tools.mjs` 比对两份表）。只看 `URL.pathname`，地址里的查询串、锚点不算后缀
- 只截 `file://`，http(s) 的文档不管：公网那份可能根本不是文本（也可能很大），得先下载、认得、再决定，不值当
- 正文不由 service worker 读，而是工具页拿着 `?file=` 自己 `fetch(file://…)`（`src/lib/file.ts` 的 `readUrlDocument`，两个工具共用），读完装进去（写历史；Markdown 还切演示模式，与拖入同一条路）。代价是 manifest 得要 `host_permissions: ["file:///*"]` —— 光有它就能看见导航、也能读正文，`tabs` 权限做不到后者。**已经装过的扩展要重新加载一次**（`host_permissions` 变了），并且扩展详情里「允许访问文件网址」得是开的；Chrome 在 manifest 声明了 `file:///*` 时会自己把它打开。读不到就照常落在那个标签页上：Markdown 在空态里、JSON 在编辑器上方，都说清是哪个开关（`READ_FILE_HINT`）
- 扩展不给页面文件路径，所以「这份文档来自哪个文件」只能靠这个地址记着（Markdown 的写回就靠它，JSON 的历史条目也靠它重读）；拖进来的 `File` 对象连地址都没有（`dataTransfer.files` 里没有路径），那份也就无从写回。JSON 工具目前只在打开时读一次、保存仍是普通的另存为，不提供写回
- **本地图片**：能拿到文档地址的（`?file=` 打开、从历史里按 `file://` 地址重读）会把 markdown 里的相对图片路径按文档目录解析成绝对 `file://` 地址再渲染，markdown 里直接写 `file:///…` 的也放行（默认 sanitizer 的 `src` 只认 http/https）；编辑模式的预览与演示模式都生效，原文不动（`src/tools/Markdown/lib/localImages.ts`：bytemd 插件的 `rehype` 在 sanitize **之后**执行，改出来的地址不会被删）。拖入 / 导入的 `File` 没有目录可依，相对图片无法解析，演示模式里会显示一句说明而不是默默破图

**写回源文件**：从本地文件打开的那份，编辑完按「保存」不再默默另存为，而是先问一句（`components/SaveSourceModal.tsx`：写回源文件 / 另存为… / 取消），工具栏那个保存按钮的提示也会写上「会问是否写回 x.md」。

- 浏览器里没有「按路径写文件」这回事：`fetch(file://…, { method: 'PUT' })` **返回 200 但磁盘上一个字节都没动**（试过），`chrome.downloads` 只认相对路径、也拿不到句柄。能写的只有 `FileSystemFileHandle`，而句柄只能从系统保存框里拿到 —— 也就是用户在那一刻亲眼选定了哪个文件。所以第一次写回必然要多一个系统框，弹窗里那句话就是为了不让人莫名其妙
- 句柄可以存进 IndexedDB（结构化克隆认它），于是同一份文件只有第一次要过系统框，之后点「写回源文件」直接写，最多 Chrome 再问一次「允许写入」（`queryPermission` 不给就 `requestPermission`）。跨会话的记性在 `src/tools/Markdown/lib/sourceHandle.ts`，键是那个 `file://` 地址；另外在内存里留一份，因为点保存那一瞬间要**同步**判断有没有句柄（这句话决定弹窗里那句提示写什么），而系统框本身也要求用户手势，中间不该夹一次 IndexedDB 读 —— 打开文档时先 `preload` 好
- 写回失败要分得清（`lib/writeBack.ts`）：用户取消 → 什么都不做也不吭声；`NotFoundError` / `NotAllowedError` / `SecurityError` → 句柄废了（文件被删、挪走、权限被收回），忘掉它并让用户改用另存为；其它错误 → 这次没写成，但句柄还能用，别乱丢，把原因说出来。浏览器没有这套 API（Firefox）→ 说一声然后走另存为
- 「另存为…」走的是同一个系统框，只是存完这份文档就归新文件了：源文件地址清掉，别再问要不要写回旧的那个。存到哪儿浏览器同样不告诉页面，所以那个新文件不会变成新的源（同会话里也得再选一次）

原版右上角那排图标里，「全屏」和「GitHub 源码外链」两个被藏掉了（全屏在工具体内没意义，外链会被扩展 CSP 拦）。原版靠 `[bytemd-tippy-path='4'/'5']` 选中它们，这是写死的序号；这里改成 `.bytemd-toolbar-right > .bytemd-toolbar-icon:nth-last-child(-n + 2)` —— 分栏布局有 6 个图标、窄屏 tab 布局只有 4 个，最后两个始终是「全屏」和「源代码」，按序号选会在 tab 布局下藏错。

三个必须手写的样式（漏了都不报错，只是界面坏）：

- `@bytemd/react` 自己不 import 任何 CSS，`bytemd/dist/index.css` 和 `katex/dist/katex.min.css` 都得手动引（原项目是在 `index.less` 里 `@import url(...)`）。漏掉的话编辑器仍然能跑，只是工具栏零内边距、`.bytemd` 撑到 7000+ px 高、颜色全继承站点主题 —— 静态检查看不出来
- `@bytemd/react` 会多套一层普通 `<div>`，所以 `.bytemd { height: 100% }` 得先让那层也有高度（`.markdown-tool-editor > div { height: 100% }`），否则百分比高度算成 `auto`
- `.sr-only`：脚注插件（`@bytemd/plugin-gfm` 的 footnotes）给它自己生成的「Footnotes」小标题挂了这个类，指望宿主提供那条规则。而 Tailwind v4 只给**源码里出现过**的类名生成工具类，这个类是运行时由第三方加上去的，源码里从没出现过 —— 规则压根没生成，预览区和演示模式里都会实打实多出一行「Footnotes」（两条入口都中招，静态检查同样看不出来）。这里按 Tailwind 的定义补了一份

暗色适配走站点自己的 `[data-theme='dark']` 覆盖：`.bytemd` / `.bytemd-toolbar` / `.CodeMirror` / `.CodeMirror-gutters` 的底色边框换成 `--spirit-*`，再补一套 `.cm-s-default .cm-*` 的 token 颜色。预览区的 markdown 样式和代码高亮主题（`github-markdown-light` / `vs-*.css` ↔ `github-markdown-dark` / `vs2015`）由 `useColorScheme()` 跟着切换。

体积：Markdown 工具那份 chunk 约 720 KB（gzip 约 225 KB，里面 mermaid 约 256 KB、katex 约 259 KB），样式单独一份 `Markdown-*.css` 约 49 KB（gzip 12 KB），另有 59 个 KaTeX 字体文件（woff2 / woff / ttf，合计约 1.1 MB）随需要加载。同样只在打开工具时才请求。

### AST 工具

从 `developer-assistant` 的 `src/renderer/pages/AstExplorer` 搬过来，但只搬了三分之一 —— 上游那套是「12 个类目、19 个解析器、还能顺手转译代码」，其中大部分在扩展里跑不了或者没人用：

- **语言只留三类**：JavaScript / TypeScript（`@babel/parser`、`acorn`）、JSON（`jsonc-parser`）、YAML（`yaml` v2）。上游还有 CSS / HTML / GraphQL / Handlebars / Markdown / Vue / Svelte / Swagger 等，这些要么得再拉一个解析器包，要么根本没解析器只是列在那儿
- **实时代码转换整块砍掉**：上游右侧有个「Transform」面板，用 `@babel/standalone` 把 AST 转回代码。`@babel/standalone` 自己就是 `new Function` 拼出来的，扩展的 CSP（`script-src 'self'`）下必然被拦，所以这一路连同它的开关、第二个编辑器、输出面板一起去掉
- **zustand store 没搬**：上游整个页面状态放在一个 store 里，其实只有这一个页面用，跟颜色 / JSON 两个工具一样留在组件里（`useState`）

留下的部分：

- 左边 monaco 编辑器，右边两种视图切换：**树**（可展开、点节点跳源码、悬停节点高亮源码）和 **JSON**（整棵 AST 序列化出来看）
- 语言 / 解析器两个下拉框，解析器是按需 `import()` 的，不选中就不下载（Babel 那份 285 KB 只在打开 AST 工具时才请求）
- 树上四个「隐藏」开关（方法 / 空键 / 位置信息 / type 键）加一个「自动聚焦」，都存在 localStorage `navigator.ast.treeSettings`
- 语法错误不清空整棵树：解析失败时保留上一次的 AST，红条把错误贴在上面（YAML 的 `parseDocument` 不抛异常，所以给解析器加了 `getErrors` 这个钩子来补红条）
- 编辑器语言跟着解析器走（`editorLanguage`）：上游写死 `javascript`，JSON / YAML 也是按 JS 高亮的

上游那份是搬了一半的状态，几个地方必须修，不修的话功能是死的：

- **树的样式上游根本没有**。树组件引的是一堆 `.entry` / `.toggable` / `.tokenName` 类名，但整份仓库里没有对应的 CSS，所以树是一坨没有缩进、没有边框的纯文本。这里按站点自己的 `--spirit-*` 变量补了一套（`.ast-tool-tree-root` 下），缩进、展开箭头、token 配色、悬停高亮都在里面
- **自动聚焦从来没生效过**。`position`（光标位置）这个 prop 上游定义了但没往 `<Tree>` 上传，于是「展开到光标所在节点」这条链路永远是 `undefined`。现在编辑器光标一动就往下传，配合 `focusNodes` 滚到那个节点
- **YAML 树上每个节点都叫 "Object"**。上游只有 estree / json 两套适配配置，YAML 走 json 那套，而 json 那套取名字是 `node.type || node.kind || 'Object'` —— yaml v2 的节点这两个字段都没有。现在给 YAML 单开一套配置，名字从 `isMap` / `isSeq` / `isScalar` / `isAlias` / `isPair` / `isDocument` 判断。顺带一提 yaml v2 的 `range` 是三段的 `[start, valueEnd, nodeEnd]`，第三段还带着后面的换行，直接拿来高亮会多选一截，只取前两段
- **JSON 的节点本来没有源码区间**。上游用 `json-to-ast`，而它的 `nodeToRange` 直接写死 `() => null`，也就是 JSON 视图里悬停高亮是无效的。这里换成仓库里已有的 `jsonc-parser`，节点摊平成 `{type, value, key, children, start, end}` 并给上真实区间。摊平这一步不能省：jsonc 的节点自带 `length` 字段，而树是拿「有没有数字 `length`」判断数组的，留着它每个对象都会被渲染成 `[ ... ]`；`parent` 是个回指针，留着则是死循环
- **`stringify` 的对象分支会栈溢出**。上游写的是 `JSON.stringify(value, (k, v) => stringify(v))`，一进对象就递归回自己，只是恰好没被树的渲染路径走到
- **序列化把共享引用当成环**。上游用一个「见过的对象」Set 判断环，结果同一份对象被两处引用（babel 的注释对象、YAML 的锚点）全被写成 `[Circular]`。改成只在当前祖先链上找环，真环照写 `[Circular]`
- **显示选项的存档没有校验**。上游读 localStorage 就直接 `JSON.parse`，手改坏一次就在 render 里抛异常白屏。现在解析失败 / 类型不对 / 多出来的键都退回默认值
- **locationProps 是死的**。适配器的 `isLocationProp()` 在 `isInRange()` / `hasChildrenInRange()` 里都有判断，但上游从没给任何一套配置填过 `locationProps`，于是这两道判断恒不成立。这里给 estree / json / yaml 各填上（分别对应它们「位置信息」开关藏掉的那些键）
- **切解析器的中间那一拍会拿错实例**。上游把「当前 parser」和「解析库实例」分开存，切解析器时 parser 先变、实例后到，而 `[code, parser]` 那个 effect 立刻就调 `parseCode()`，于是变成拿新 parser 的方法去调旧 parser 的实例 —— 从 acorn 切回 babel 时会跑 `babel.parse(acorn)`，acorn 收下 babel 那份没有 `ecmaVersion` 的 options，控制台冒一句警告，树还会先用错的那份结果闪一下。这里把两者绑成一个 `{ parser, instance }`，对不上就不可能发生

体积：AST 工具那份 chunk 约 127 KB（gzip 约 40 KB），Babel 解析器单独一份 `lib-*.js` 约 285 KB（gzip 约 72 KB），`acorn-*.js` 约 118 KB（gzip 约 35 KB），yaml 约 4 KB，样式一份 `AstExplorer-*.css` 约 3 KB。monaco 的 `editor.worker` / `json.worker` 跟 JSON 工具是同一份产物（导入写法相同，打包后同名），没有多出一份。全部都只在打开 AST 工具时才请求。

### Transform 工具

从 `developer-assistant` 的 `src/renderer/pages/Transform` 搬过来：左边填一段 JSON / YAML / JavaScript 对象，右边出转换结果，十个转换器：

| 输入 | 输出 |
| --- | --- |
| JSON | YAML、TypeScript（typealias）、Go struct（go 官方排版）、Java、Kotlin、MySQL 建表、JSON Schema |
| JavaScript 对象 | JSON、TypeScript |
| YAML | JSON |

- 左编辑右结果，两边都是 monaco，输入用源语言高亮、输出用目标语言高亮。JSON 那份语法定义在公共的 `components/Editor/monaco.ts` 里（JSON 工具已经在用），其余七种（YAML / Go / Java / Kotlin / TypeScript / JavaScript / MySQL）在工具自己的 `components/Editor/languages.ts` 里引 —— 分开是为了不让 JSON 工具白付这七份的字节
- 输入改动防抖 300 ms 后再转；每个转换器各自记住自己那份输入（来回切换不清空）。两个走 WASM 的转换器第一次选中时才下载（`json_typegen_wasm_bg` 约 1.04 MB、`gofmt` 约 272 KB）
- 转换失败就清空输出、在输出那块上压一行中文错误（绝对定位，不挤布局 —— 一挤就会让 `useFillHeight` 量到的高度过期）
- 工具栏：复制、历史记录、弹出到独立窗口 / 同步到主窗口、清除。历史最多 20 条存在 localStorage（内容超过 256 KB 只留名字和时间），**记的是输入而不是输出**（输出是输入的纯函数），点一条连转换器带输入一起回到当时那一屏；换过的转换器不同、内容相同的两份输入都留着
- 弹出到独立窗口：`window.open` 开 `/?tool=transform&popup=1`，两个窗口用 BroadcastChannel 双向同步（这条通道顺带捎上当前是哪个转换器 —— 这个工具没有「文件名」可带）

WASM 与扩展 CSP：WASM 编译在扩展页面里**不在**默认放行范围内。MV3 的默认 `extension_pages` CSP 是 `script-src 'self'; object-src 'self'`，上面没有 `'wasm-unsafe-eval'`，所以 `instantiateStreaming` 会被拦下并抛：

```
CompileError: WebAssembly.instantiateStreaming(): ... violates the following Content Security policy directive:
"script-src 'self'" ... neither 'wasm-eval' nor 'unsafe-eval' is an allowed source of script
```

`public/manifest.json` 因此显式写了一条 `"content_security_policy": {"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"}`。只放行 WASM 编译，JS 的 `eval` / `new Function` 仍然被拦（所以仓库「不用 eval」那条规矩没被绕开），开发态（localhost，没有 CSP）本来就不受影响。

排版那半句：`json_typegen_wasm` 从 JSON 推导结构时 **不抛异常**，解析不了就返回一句英文原文（`Unable to parse JSON sample` / `Local samples disabled`）。上游那个 `try/catch` 因此是死代码，用户直接在右边看到这句英文；这里把两句认出来翻成中文再抛（`lib/converters.ts` 的 `TYPEGEN_SENTINELS`，`pnpm check:tools` 里有断言盯着）。

搬的时候顺手修掉的上游问题：

- **`eval` 换成 `json5`**。两个 JS Object 转换器用 `eval('(' + 内容 + ')')` 解析，仓库明令不许，MV3 的 CSP 本来也拦。`json5` 已经在依赖里，那两段示例它给的结果与 `eval` 一致（单引号、无引号键、尾逗号都认）
- **十个转换器里有七个完全没有 `try/catch`**，而外面 `useEffect(() => handleTransform(value))` 也不接 `.catch` —— 粘一段半截 JSON 就是一条未处理的 Promise rejection。现在统一成「输出清空 + 一行中文错误」，并且 `JSON.parse` / `YAML.parse` / `JSON5.parse` 那三处会漏出来的英文原文也包成了中文（`lib/parse.ts`），不会中英混排
- **「JavaScript Object 转 JSON」的输出语言写成了 Go**，可它输出的是 `JSON.stringify` 的结果，右边那块编辑器的语法着色一直是错的
- **`jsonToGoStruct` 遇到数组或标量根直接崩**。上游把推导结果硬当 struct 用，`[1,2,3]` 这种完全合法的 JSON 会在 `generateGoCode` 里读 `.fields` 时 TypeError。现在给一句说得清的错误
- **抄过来的 `generate-schema` 遇到 `null` 字段就崩**（`isTimestamp` 对 `type: 'null'` 也会被调），而且查不到映射的类型列出来是 `undefined`（像 `id undefined`）。现在分别是「不崩」和退化成 `TEXT`
- **JSON→YAML 那条路重复解析**：上游先用 `jsonlint-mod` 判一次能不能解析、再 `JSON.parse` 解一次，合并成一次
- 文案与 API：`语言` → `转换`、`Typescript` → `TypeScript`、`Javascript` → `JavaScript`；`component` 不应传给 antd 的 `Select`

上游这几处留着没动（不是 bug，是设计取舍，改了就是另一个工具）：

- 数组和标量的合并规则里那张优先级表是反的，`[1, "x"]` 推出来是 `[]string` 而不是 `[]interface{}`
- `snakeCaseFields: true` 出来是 `Is_student` 这种半截蛇形（单词首字母还是大写）
- 嵌套结构会生成两遍：字段上内联一份，另起一个单独的 `AddressStruct`
- `usePointersForOptionalFields` 是个空开关，上游从来没往生成器里传过它
- `JsonToJava` 是按行字符串重写（`substring(11, indexOf('('))` 这种硬编码下标），库本身没有 Java 模式。这里原样留着，但用 `pnpm check:tools` 把它们逐字钉住了，换行一漂就会红

体积：Transform 工具那份 chunk 约 16 KB（gzip 约 5 KB），样式一份 `Transform-*.css` 约 2.5 KB。两个 WASM 与它们的胶水代码只在选中对应转换器时才请求。

## 扩展弹窗

点扩展工具栏图标弹出的小面板（`public/manifest.json` 里 `action.default_popup` → `popup.html`），三块内容：

- **收藏当前页**：读出当前标签页的标题 / 地址 / favicon，选一个分组（下拉里最后一项是「＋ 新建分组…」，配置里一个分组都没有时直接就是这个形态）再点「收藏」，就往那个分组的 `links` 里加一条；地址已经在该分组里时按钮变成「取消收藏」。同一地址在别的分组也收藏过的话，下面给一行「已收藏在「…」，点击切到那个分组」。上次用的分组记在 `chrome.storage.local` 的 `navigator:popup:lastGroup`，关掉再开还是那一组。
- **工具箱**：和首页工具抽屉共用 `components/ToolList.tsx`，点一项用 `chrome.tabs.create` 打开 `index.html?tool=<key>`，然后自己关掉弹窗。
- **外观**：主题模式（跟随系统 / 浅色 / 深色）与展示模式（卡片 / 列表），改完写回配置；弹窗自己的配色也跟着立刻换（和首页同一套 `useResolvedTheme` + `--spirit-accent`）。
- 标题栏右侧两个图标：齿轮开配置面板（`index.html?settings=1`，页面加载后直接展开右侧面板，关掉面板会把地址栏参数抹掉），房子开新标签页；两者都会顺手关掉弹窗。

配置读写直接走首页那一套（`chrome.storage.sync` 分片 + `local` 完整快照 + 内置配置合并）：收藏只是往 `groups[id].links` 里加一条链接，所以跨设备同步、内置配置合并、墓碑、新标签页渲染都不用在这一侧另做一套。判重、地址归一化（去尾斜杠 + 小写后再比）和墓碑收尾都在 `src/config/favorite.ts` 里，是纯函数（`runtime` 从参数传进来），`pnpm check:favorite` 有 12 项断言盯着；「新建分组」的 id 规则与墓碑清理和配置面板那份共用 `src/config/group.ts`。

写入时机的差异：首页那边改动是 300 ms 防抖后落盘，弹窗里每次动作是「先读最新配置 → 改 → 立刻写」，并在弹窗内部串行排队，把互相覆盖的窗口压到最小；但**跨页面没有加锁**，如果弹窗改配置的同时一个刚打开、还带着未落盘改动的导航页也在写，仍可能有一边被覆盖。

读当前页靠 `activeTab`：`permissions` 只加了 `activeTab`，没有加 `tabs`（后者安装时会提示「读取您的浏览历史记录」）。`activeTab` 只在用户真的触发了这个 action 时把当前标签页的 `url` / `title` / `favIconUrl` 临时借给扩展：本机 Chrome 155 无头环境验证过，用扩展自己的 `_execute_action` 键盘命令（和点图标同一类触发）打开弹窗时读得到，而 `chrome.action.openPopup()` 这种非用户触发读不到。读不到时不报错，退化成「页面标题 + 地址」两个手填输入框 —— `pnpm dev` 里直接打开 `popup.html` 也是这个形态（另外，当前页就是导航精灵自己时不给收藏，提示一句即可）。

构建入口只在扩展构建里：`VITE_EXTENSION=1` 时 `rollupOptions.input` 才加上 `popup.html`，GitHub Pages 的网页构建不受影响。`popup.html` 里没有任何内联脚本（MV3 的 `script-src 'self'` 会拦掉），只引 `theme-init.js` 与 `src/extension/popup/main.tsx`；所有 Chrome API 收在 `src/extension/tabs.ts` 一处。

## 构建为 Chrome 扩展

```bash
pnpm install
pnpm build:extension
```

打开 `chrome://extensions` → 开启右上角“开发者模式” → “加载已解压的扩展程序” → 选择项目下的 `dist-extension/` 目录。之后新建标签页就会使用导航精灵，工具栏上的扩展图标点开就是上面那个弹窗。

已经装过旧版本的话，重新构建后要在 `chrome://extensions` 里点一下该扩展的刷新按钮（⟳）才会出现弹窗 —— manifest 变了不会自动重载。弹窗页面只在点开时加载，平时不占着；调试时可以直接把它当普通标签页打开（`chrome-extension://<id>/popup.html`），只是那样没有 `activeTab`，会看到手填形态。

权限只有 `storage`、`bookmarks` 和 `activeTab`：读当前页只借 `activeTab`，没有要 `tabs`（见「扩展弹窗」）。

`pnpm build:extension` 会运行类型检查和生产构建，并复制 `public/manifest.json`、`public/service_worker.js` 与图标到 `dist-extension/`。扩展构建固定使用根路径 `/`，不会继承 GitHub Pages 的子路径；构建脚本还会断言 `manifest.action.default_popup` 指向 `popup.html`、`index.html` 与 `popup.html` 都引到实际产物、且两页都没有内联脚本。

## 本地开发

```bash
pnpm dev
```

普通网页开发环境使用 `localStorage` 持久化，配置面板行为与扩展一致；搜索联想受浏览器 CORS 限制时仍可使用普通搜索。

## 数据流与合并规则

1. 首次访问：同步存储为空 → 用 `src/global_runtime.json` 初始化；
2. 内置配置没变：同步 / 本地配置就是唯一真相；
3. 内置配置变了 → 合并，**同步 / 本地权重最高**：
   - `settings`：用户改过的保留，没动过的跟随内置配置；
   - `groups`：以本地为骨架，内置新增的分组 / 链接追加并入；
   - 本地删掉的分组 / 链接记在墓碑里，不会被内置配置“复活”。

配置面板「数据」页提供「重新合并内置配置」（恢复内置里删掉的内容，保留本地改动）与「恢复内置配置」（清除同步配置并回到内置态）。

### 与 Chrome 书签手动双向同步

扩展环境的数据页提供两个手动操作：

- **从 Chrome 书签拉取**：若书签栏下存在「导航精灵」文件夹，只读取它；否则读取整个书签栏。拉取结果进入和文件导入相同的预览弹窗，可合并或全部替换。
- **推送到 Chrome 书签**：只重建书签栏下的「导航精灵」文件夹，其他书签不会改动。`default` / 常用分组的链接放在根目录，其他分组按标题中的 ` / ` 展开为多级文件夹。
- 只能写入 `http(s)` 链接，相对链接 / 浏览器内部链接会在推送时跳过并提示。
- 第一次先点“推送”会创建「导航精灵」；此后拉取只读取这个受管文件夹，不会把用户自己的其他书签混入配置。

## 上传配置文件 / 书签

「数据」页的拖拽区可以上传两类文件，解析都走同一套逻辑（书签 HTML 与 `pnpm import:bookmarks` 共用 `src/config/bookmarks.ts`）：

- **标准配置 JSON**：与导出文件、`src/global_runtime.json` 同结构；
- **Chrome 书签导出 HTML**：转换规则同 `pnpm import:bookmarks`。

| 落地方式 | 行为 |
| --- | --- |
| **合并** | 先按分组 id 对齐（改过名也认），id 对不上再按标题对齐同名分组，都对不上才作为新分组追加到末尾。链接按 `href` 去重后追加，现有链接的位置、顺序、标题一律不动；`settings` 不受影响。 |
| **全部替换** | 整份替换分组，JSON 文件里的 `settings` 一并采用（书签 HTML 没有 `settings`，保留当前设置）。内置里被替换掉的分组 / 链接会记入墓碑。 |

## 导出

| 按钮 | 产物 |
| --- | --- |
| **导出 JSON** | 标准配置 JSON，可直接替换 `global_original.json5`，也可以再上传回来 |
| **导出 Chrome 书签** | Chrome 书签格式（`NETSCAPE-Bookmark-file-1`）的 `.html`，可在 Chrome 的书签管理器里导入 |

## 部署 GitHub Pages

`.github/workflows/deploy.yml`：main 分支推送后自动执行 `pnpm refresh`、合并规则测试、lint，并用 `VITE_BASE_PATH=/<仓库名>/` 构建部署到 GitHub Pages。

首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 版本发布

使用 `pnpm release` 更新 `public/manifest.json` 的版本，并自动提交、创建同名 `vX.Y.Z` tag、推送当前分支和 tag：

```bash
pnpm release             # patch 递增，例如 0.0.3 → 0.0.4
pnpm release minor       # minor 递增，例如 0.0.3 → 0.1.0
pnpm release major       # major 递增，例如 0.0.3 → 1.0.0
pnpm release 1.2.0       # 指定明确版本
pnpm release patch --dry-run # 只预览计划，不修改文件和推送
```

发布前请确保工作区中没有未提交的已跟踪文件变更。推送 tag 后，`.github/workflows/release-extension.yml` 会校验 manifest 版本并构建、发布 Chrome / Edge 扩展包。

## 常用命令

```bash
pnpm dev              # 本地开发
pnpm refresh          # 校验并刷新 src/global_runtime.json
pnpm check            # lint + 各个 check:* 回归脚本（合并规则 / 存储 / 壁纸 / 工具逻辑）+ 配置校验
pnpm check:tools      # 只跑工具逻辑那份（颜色换算、JSON、AST、Transform 的纯函数与转换器表）
pnpm check:favorite   # 只跑扩展弹窗的收藏逻辑那份（地址归一化、判重、墓碑、新建分组、合并）
pnpm build            # 网页构建
pnpm build:extension  # Chrome 新标签页扩展构建（产物在 dist-extension/）
```

## 体积说明

`global_original.json5` 里如果包含大量 base64 图标，构建产物和同步配额都会明显增大。需要更轻量时可以执行：

```bash
pnpm import:bookmarks --no-icons && pnpm refresh
```

配置面板上传书签 HTML 时也可以不勾选「保留 base64 图标」，让页面改用首字母色块兜底。
