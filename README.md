# 导航精灵

一个静态的链接导航页：数据来自一份可手工编辑的源配置，构建时解析成运行时配置，运行时落到浏览器本地存储，随时可以在页面右侧的配置面板里改，并导出 / 导入 JSON。

技术栈：Vite + React 19 + TypeScript + Ant Design 6 + Tailwind CSS 4。

## 数据流

```
chrome_bookmarks_demo.html ──pnpm import:bookmarks──▶ global_original.json5   （手工编辑的源配置，JSON5）
                                                            │
                                                       pnpm refresh
                                                            │  校验格式 + 补默认值
                                                            ▼
                                                   src/global_runtime.json    （内置运行时配置，随前端一起构建）
                                                            │
                                                      页面首次打开
                                                            │  按 id 合并，本地优先
                                                            ▼
                                       localStorage「navigator:config」        （可在配置面板里修改、导出、导入）
```

三处结构完全一致（`settings` + `groups`），导出的 JSON 可以直接拿去替换 `global_original.json5`。

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm build` | 类型检查 + 构建（`dist/`） |
| `pnpm preview` | 预览构建产物 |
| `pnpm refresh` | 解析 `global_original.json5` → `src/global_runtime.json`，并校验配置格式 |
| `pnpm refresh --check` | 只校验（含"运行时配置是否已同步"），CI 用 |
| `pnpm import:bookmarks` | Chrome 书签导出 → `global_original.json5`（见下方参数） |
| `pnpm check:merge` | 跑合并规则的冒烟测试（纯 node，无需浏览器） |
| `pnpm lint` | oxlint |

`pnpm import:bookmarks` 的可选参数：

- `--no-icons`：丢弃 base64 图标（配置体积从约 1 MB 降到约 150 KB，页面用首字母色块兜底）
- `--input <file>` / `--output <file>`：指定输入输出路径
- `--dry-run`：只打印统计

转换规则：书签栏里的直接链接 + 顶层游离链接归入 `default`（标题「常用」），每个子文件夹递归成为一个分组，
id 是相对书签栏的路径（如 `学习/刷题`），标题是 `学习 / 刷题`；空文件夹不会生成空分组。

## 配置格式

```json5
{
  settings: {
    siteTitle: "导航精灵",
    primaryColor: "",      // 留空 = antd 默认主色
    linkFontSize: 14,      // 链接字号 12~20
    linkCardGap: 16,       // 卡片之间 / 列表行之间的间距 4~48
    themeMode: "system",   // system | light | dark
    viewMode: "card",      // card | list
  },
  groups: {
    default: {
      title: "常用",
      links: [
        // icon 为 base64 data URL 或图片地址，留空则用首字母色块
        { icon: "", href: "https://github.com/", text: "GitHub" },
      ],
    },
  },
}
```

- 分组 id 就是 `groups` 的 key，也是合并时的对齐依据，改名不会丢数据（改 key 会被当成新分组）。
- `title` 必填；`links[].href`、`links[].text` 必填且非空，`icon` 可空。
- 校验失败时 `pnpm refresh` 会打印带路径的错误（如 `groups.学习.links[3].href: href 必须是非空字符串`）并以非 0 退出，不会写出坏配置。

## 合并规则（内置配置 ↔ 本地存储）

页面打开时比对内置配置的 hash：

1. 本地还没有配置 → 直接用内置配置初始化；
2. 内置配置没变 → 本地就是唯一真相；
3. 内置配置变了 → 合并，**本地权重最高**：
   - `settings`：本地改过的保留，没动过的跟随内置配置；
   - `groups`：以本地为骨架，内置配置里**新增的分组 / 新增的链接**并入（链接追加到分组末尾）；
   - 本地删掉的分组 / 链接记在墓碑里，不会被内置配置"复活"。

配置面板「数据」页提供「重新合并内置配置」（恢复内置配置里删掉的内容，保留本地改动）与「恢复内置配置」（清空本地）。

本地存储用两个 key：

- `navigator:config`：配置本体，结构与 JSON 文件完全一致
- `navigator:meta`：合并记账（内置配置 hash、墓碑），不参与导出

## 部署

`.github/workflows/deploy.yml`：main 分支推送后自动

1. `pnpm refresh` 校验并刷新 `src/global_runtime.json`（校验失败直接中断，不会发布坏配置）；
2. 若运行时配置有变化，以 `[skip ci]` 提交回 main（可用 `contents` 权限，不会形成循环）；
3. 跑合并规则测试 + lint，`VITE_BASE_PATH=/<仓库名>/` 构建；
4. 上传并部署到 GitHub Pages。

首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 页面功能

- 顶部：站点标题与统计、链接 / 分组搜索、卡片 / 列表切换、明暗切换（跟随系统 / 浅色 / 深色）、配置面板入口、分组快捷锚点
- 链接一律新窗口打开；无 `icon` 时用首字母色块兜底；列表模式额外显示完整地址
- 配置面板（右侧抽屉）：外观（标题 / 主题 / 主色 / 字号 / 间距 / 默认展示模式）、分组（增删改名、排序、链接增删改）、数据（导入导出 / 重新合并 / 恢复内置）
- 明暗模式首屏不会闪白：`index.html` 里先按本地配置定好 `html[data-theme]`，再由 React 接管

## 体积说明

`global_original.json5` 里 964 个 base64 图标约占 850 KB（构建产物 gzip 后约 790 KB）。图标存在配置里可以离线可用、
导出即完整；如果更在意首屏体积，执行：

```bash
pnpm import:bookmarks --no-icons && pnpm refresh
```

配置会降到约 150 KB，页面改用首字母色块（也可以给单条链接填图片地址）。
