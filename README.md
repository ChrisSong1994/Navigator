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
- 工具箱：顶栏入口弹出工具抽屉，选中后整页打开该工具，左上角返回箭头回首页；目前有颜色工具（取色面板、HEX / RGB / CMYK / HSV / HSL 互转、颜色记录）和 JSON 工具（格式化 / 压缩 / 校验并给出行列与出错片段 / 修复 / JSON5 兼容解析 / 转义与去转义 / 上传下载），工具界面按需懒加载

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

- 扩展环境使用 `chrome.storage.sync`，整份配置与合并记账（墓碑等）都会同步；由于单 key 有 8 KB 限制，会自动拆成多个分片。
- `chrome.storage.local` 保存同设备的完整快照，sync 暂时不可用或分片写入中断时作为兜底。
- 普通 `pnpm dev` / 非扩展网页环境自动回退到 `localStorage`，方便本地开发。
- `chrome.storage.sync` 总配额约 100 KB，且浏览器可能按设备 / 登录状态产生延迟；不建议在配置里放大量 base64 图片。配置面板上传时可取消“保留 base64 图标”。
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

工具内容按需懒加载：不打开工具箱里的工具，就不下载那份 chunk。

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
- 历史记录：最多 20 条存在 localStorage（保存 / 上传 / 弹窗同步时各记一条，内容超过 256 KB 只留名字和时间），点一条回填
- 弹出到独立窗口：`window.open` 开 `/?tool=json&popup=1`，两个窗口用 BroadcastChannel 双向同步内容

体积：JSON 工具那份 chunk 约 5.2 MB（gzip 约 1.5 MB），ELK 布局单独打成 `elk.bundled-*.js`（约 1.4 MB），monaco 的两个 worker 各占一份（`editor.worker` 约 260 KB、`json.worker` 约 390 KB）。这些都只在打开工具时请求，新标签页首屏不为它们付出字节。

扩展里的一个坑：ELK 必须跑在主线程上。reaflow 默认给 ELK 传一个 base64 `data:` URL 的 Worker，而扩展页面的 CSP 是 `script-src 'self'`（`worker-src` 未设置时回落到它），data: / blob: 都不在其中 —— worker 直接被拦掉，布局永远不返回、画布空着，而且 manifest 里补 `worker-src` 也没用（Chrome 的扩展默认 CSP 只放行 `'self' 'wasm-unsafe-eval' 'inline-speculation-rules'` 和本机地址）。`vite.config.ts` 因此把 `elkjs/lib/elk-api` 别名到 `src/tools/Json/GraphView/lib/elkMainThread.ts`，丢掉 `workerFactory` 走 `elk.bundled` 的进程内实现。

## 构建为 Chrome 扩展

```bash
pnpm install
pnpm build:extension
```

打开 `chrome://extensions` → 开启右上角“开发者模式” → “加载已解压的扩展程序” → 选择项目下的 `dist-extension/` 目录。之后新建标签页就会使用导航精灵。

`pnpm build:extension` 会运行类型检查和生产构建，并复制 `public/manifest.json`、`public/service_worker.js` 与图标到 `dist-extension/`。扩展构建固定使用根路径 `/`，不会继承 GitHub Pages 的子路径。

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
pnpm check            # lint + 合并规则测试 + 配置校验
pnpm build            # 网页构建
pnpm build:extension  # Chrome 新标签页扩展构建（产物在 dist-extension/）
```

## 体积说明

`global_original.json5` 里如果包含大量 base64 图标，构建产物和同步配额都会明显增大。需要更轻量时可以执行：

```bash
pnpm import:bookmarks --no-icons && pnpm refresh
```

配置面板上传书签 HTML 时也可以不勾选「保留 base64 图标」，让页面改用首字母色块兜底。
