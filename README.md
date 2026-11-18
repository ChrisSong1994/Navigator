<p align="center">
  <img src="public/favicon.svg" width="96" height="96" alt="导航精灵 logo" />
</p>

<h1 align="center">导航精灵</h1>

<p align="center">可安装为 Chrome / Edge 新标签页的链接导航主页：配置来自一份可手工编辑的源文件，构建时解析成运行时配置；运行时整份配置同步到浏览器账号，也可以在页面右侧配置面板里修改、导入导出。</p>

技术栈：Vite + React 19 + TypeScript + Ant Design 6 + Tailwind CSS 4。

## 功能

- **新标签页**：扩展以 `chrome_url_overrides.newtab` 接管新标签页
- **链接导航**：卡片 / 列表两种展示、暗黑模式（跟随系统 / 浅色 / 深色）、分组目录、拖拽排序，链接默认新窗口打开
- **全局搜索**：Google / 百度 / 必应，搜索联想、本地链接命中、`Cmd/Ctrl+K` 与 `/` 聚焦
- **配置面板**：标题 / Logo / 主题 / 主色 / 字号 / 间距 / 展示模式 / 搜索引擎 / 跳转方式 / 壁纸 / 分组与链接增删改
- **壁纸**：关闭、Bing 最近 8 天选图、按间隔自动轮播、自定义图片直链，可调压暗与模糊
- **配置同步**：跨设备同步，内置配置与本地配置按权重合并，导入导出 JSON 或 Chrome 书签 HTML
- **Chrome 书签**：手动从书签栏拉取，或把当前配置推送到「导航精灵」文件夹
- **工具箱**：颜色、JSON、Markdown、AST、Transform、Diff、URL 解析，按需懒加载
- **扩展弹窗**：收藏当前页、工具列表、主题与展示模式一键切换

## 工具箱

从工具栏打开，工具以 `/?tool=<key>` 整页打开，可弹出到独立窗口双向同步。

| 工具 | 能力 |
| --- | --- |
| 颜色 | 取色面板、HEX / RGB / CMYK / HSV / HSL 互转、颜色记录 |
| JSON | 格式化 / 压缩 / 校验 / 修复 / JSON5、JSONPath、结构图、转义、历史、写回源文件 |
| Markdown | 编辑 + 预览 + 演示模式、GFM、公式、图表、导入导出、写回源文件 |
| AST | JS / TS、JSON、YAML 转 AST，树与 JSON 两种视图，悬停联动高亮 |
| Transform | JSON / YAML / JavaScript 对象互转 TypeScript、Go、Java、Kotlin、MySQL、JSON Schema |
| Diff | 左右文本对比，两边可编辑，26 种语言高亮 |
| URL 解析 | 协议 / 主机 / 端口 / 路径 / 哈希 / 查询参数实时拆解 |

Markdown / JSON 还支持浏览器里直接打开本机 `.md` / `.json`，以及把文件拖到窗口里。

## 数据流

```
chrome_bookmarks_demo.html ──pnpm import:bookmarks──▶ global_original.json5   （手工编辑的源配置，JSON5）
                                                             │
                                                        pnpm refresh
                                                             │  校验格式 + 补默认值
                                                             ▼
                                                    src/global_runtime.json    （内置运行时配置，随前端构建）
                                                             │
                                                         页面运行时
                                                             │
                         内置配置 + chrome.storage.sync / localStorage 合并 ◀──▶ 配置面板
```

`global_original.json5`、`src/global_runtime.json`、同步快照与导出的 JSON 结构完全一致：

```json5
{
  settings: {
    siteTitle: '导航精灵',
    siteLogo: '',             // logo 图片地址
    primaryColor: '',         // 主色，空为默认
    linkFontSize: 14,
    linkCardGap: 16,
    themeMode: 'system',      // system | light | dark
    viewMode: 'card',         // card | list
    searchEngine: 'google',   // google | baidu | bing
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

## 合并规则

1. 首次访问：同步存储为空 → 用 `src/global_runtime.json` 初始化；
2. 内置配置没变：同步 / 本地配置就是唯一真相；
3. 内置配置变了 → 合并，**同步 / 本地权重最高**：
   - `settings`：用户改过的保留，没动过的跟随内置配置；
   - `groups`：以本地为骨架，内置新增的分组 / 链接追加并入；
   - 本地删掉的分组 / 链接记入墓碑，不会被内置配置“复活”。

配置面板「数据」页提供「重新合并内置配置」与「恢复内置配置」。

## 配置同步

- 扩展环境用 `chrome.storage.sync`，整份配置与合并记账（墓碑等）一并同步；受单 key 8 KB 限制会自动拆片，按转义后的字节切分。
- `chrome.storage.local` 保存本机完整快照，sync 不可用、写入中断或 localStorage 被清掉时兜底。
- 非扩展环境自动回退到 `localStorage`，方便本地开发。
- `chrome.storage.sync` 总配额约 100 KB，不建议放大量 base64 图片；超限时本机照常保存并提示「已保存在本机，但没同步到云端」。

## 导入导出

- **导入**：标准配置 JSON 或 Chrome 书签导出 HTML，可选「合并」或「全部替换」。合并先按分组 id 对齐，再按标题对齐，最后才当新分组追加；链接按 `href` 去重，现有顺序不动。
- **导出**：标准配置 JSON（可直接替换 `global_original.json5`），或 Chrome 书签格式的 `.html`。
- **书签同步**：只读写书签栏下的「导航精灵」文件夹，不碰用户其他书签；仅支持 `http(s)` 链接。

## 扩展弹窗

点工具栏图标弹出的小面板：

- **收藏当前页**：读当前标签页标题 / 地址 / favicon，选分组（可新建）写入配置，已收藏时变成取消收藏；
- **工具箱**：与首页共用同一份工具列表；
- **外观**：主题模式与展示模式切换；
- **标题栏**：齿轮打开配置面板，房子打开新标签页。

读当前页只借 `activeTab`，没有申请 `tabs`（避免「读取浏览历史」的授权提示）；读不到时退化为手填标题与地址。

## 构建为 Chrome 扩展

```bash
pnpm install
pnpm build:extension
```

打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist-extension/`。之后新标签页即使用导航精灵。

`pnpm build:extension` 会做类型检查、生产构建，并复制 manifest、service worker 与图标；产物固定使用根路径 `/`，不受 GitHub Pages 子路径影响。重新构建后需在扩展页点一次刷新才会生效。

权限只有 `storage`、`bookmarks`、`activeTab`，外加读取本机文件所需的 `file:///*` 与搜索联想用的几个域名。

## 部署 GitHub Pages

`.github/workflows/deploy.yml`：main 分支推送后自动执行 `pnpm refresh`、合并规则测试与 lint，再用 `VITE_BASE_PATH=/<仓库名>/` 构建并部署到 GitHub Pages。

首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 版本发布

`pnpm release` 更新 `public/manifest.json` 版本，并自动提交、创建同名 `vX.Y.Z` tag、推送分支与 tag：

```bash
pnpm release                  # patch 递增
pnpm release minor            # minor 递增
pnpm release major            # major 递增
pnpm release 1.2.0            # 指定版本
pnpm release patch --dry-run  # 只预览计划
```

推送 tag 后 `release-extension.yml` 会校验版本、构建并发布 Chrome / Edge 扩展包。

## 本地开发

```bash
pnpm dev              # 本地开发（localStorage 持久化）
pnpm refresh          # 校验并刷新 src/global_runtime.json
pnpm build            # 网页构建
pnpm check            # lint + 全部回归脚本 + 配置校验
pnpm check:tools      # 工具逻辑的纯函数断言
pnpm check:favorite   # 收藏逻辑断言
pnpm import:bookmarks # 从 Chrome 书签 HTML 生成配置
```

`global_original.json5` 里如果包含大量 base64 图标，构建产物和同步配额都会明显增大，可以执行 `pnpm import:bookmarks --no-icons && pnpm refresh`，或在配置面板上传时不勾选「保留 base64 图标」，让页面改用首字母色块兜底。

## 许可

[MIT](LICENSE)
