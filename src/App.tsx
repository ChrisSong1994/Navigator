import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  FloatButton,
  Input,
  Modal,
  Tooltip,
  theme as antdTheme,
} from "antd";
import { App as AntApp, ConfigProvider as AntConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppHeader } from "./components/AppHeader.tsx";
import { ConfigDrawer } from "./components/ConfigDrawer.tsx";
import { GlobalSearch } from "./components/GlobalSearch.tsx";
import { GroupToc } from "./components/GroupToc.tsx";
import { LinkFormModal } from "./components/LinkFormModal.tsx";
import { LinkSortProvider } from "./components/LinkSortProvider.tsx";
import { LinkGroupView } from "./components/LinkViews.tsx";
import { ToolPage } from "./components/ToolPage.tsx";
import { WallpaperLayer } from "./components/WallpaperLayer.tsx";
import { ConfigProvider } from "./config/ConfigProvider.tsx";
import { useConfig } from "./config/configContext.ts";
import { DEFAULT_PRIMARY_COLOR } from "./config/schema.ts";
import { useResolvedTheme } from "./hooks/useResolvedTheme.ts";
import { findTool } from "./tools/registry.tsx";
import { clearToolQuery, setToolQuery, toolFromQuery } from "./tools/query.ts";
import { WallpaperProvider } from "./wallpaper/WallpaperProvider.tsx";

/** 预览区里的虚线按钮（新增分组 / 空分组加链接）：底色由调用方按所在层级给 */
const DASHED_TILE =
  "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--spirit-border-strong)] text-[var(--spirit-muted)] transition-colors hover:border-[var(--spirit-accent)] hover:text-[var(--spirit-accent)]";

export default function App() {
  return (
    <ConfigProvider>
      <ThemedShell />
    </ConfigProvider>
  );
}

/** antd 主题（明暗 / 主色）跟随配置，并把主色写进 CSS 变量供自定义样式使用 */
function ThemedShell() {
  const { settings } = useConfig();
  const resolvedTheme = useResolvedTheme(settings.themeMode);
  const accent = settings.primaryColor || DEFAULT_PRIMARY_COLOR;
  const antdThemeConfig = useMemo(
    () => ({
      algorithm:
        resolvedTheme === "dark"
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
      token: { colorPrimary: accent, borderRadius: 8 },
    }),
    [accent, resolvedTheme],
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--spirit-accent", accent);
  }, [accent]);

  return (
    <AntConfigProvider
      locale={zhCN}
      theme={antdThemeConfig}
    >
      <AntApp>
        <WallpaperProvider>
          <Page />
        </WallpaperProvider>
      </AntApp>
    </AntConfigProvider>
  );
}

function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { addGroup } = useConfig();
  const [title, setTitle] = useState("");
  const trimmed = title.trim();

  const submit = () => {
    if (!trimmed) return;
    addGroup(trimmed);
    onClose();
  };

  return (
    <Modal
      open
      width={380}
      title="新增分组"
      okText="创建"
      cancelText="取消"
      okButtonProps={{ disabled: !trimmed }}
      onCancel={onClose}
      onOk={submit}
    >
      <Input
        autoFocus
        maxLength={24}
        value={title}
        placeholder="分组名称，例如 常用工具"
        onChange={(event) => setTitle(event.target.value)}
        onPressEnter={submit}
      />
    </Modal>
  );
}

/** 骨架占位块：形状（高 / 宽 / 圆角）由调用方给 */
function SkeletonBar({ className }: { className: string }) {
  return <div className={`spirit-skeleton rounded-md ${className}`} />;
}

/**
 * 首屏骨架：只在「扩展环境 + 本机没有同步种子」（首次安装、清了站点数据、换设备）时出现。
 * 高度按真实布局给，读到配置后换成真内容不会跳版。
 */
function PageSkeleton() {
  return (
    <div className="spirit-canvas min-h-screen" aria-busy="true" aria-label="正在读取配置">
      <header className="border-b border-[var(--spirit-border)] bg-[var(--spirit-surface)]/90">
        <div className="mx-auto flex max-w-[1920px] items-center gap-4 px-6 py-3">
          <SkeletonBar className="h-5 w-32" />
          <SkeletonBar className="h-4 w-20" />
          <div className="ml-auto flex items-center gap-2">
            <SkeletonBar className="h-8 w-8 rounded-lg" />
            <SkeletonBar className="h-8 w-8 rounded-lg" />
            <SkeletonBar className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1704px] px-6 pb-20 pt-5 lg:pl-[264px]">
        <div className="mb-5 px-0 pt-1">
          <SkeletonBar className="h-[46px] rounded-xl" />
        </div>
        {[0, 1].map((index) => (
          <div
            key={index}
            className="mb-4 rounded-2xl bg-[var(--spirit-surface)] p-4 sm:p-5"
          >
            <SkeletonBar className="mb-3 h-5 w-28" />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((item) => (
                <SkeletonBar key={item} className="h-9 rounded-[10px]" />
              ))}
            </div>
          </div>
        ))}
        <SkeletonBar className="mt-1 h-14 rounded-xl" />
      </main>
    </div>
  );
}

function Page() {
  const { settings, groups, groupIds, configReady } = useConfig();
  const [drawerOpen, setDrawerOpen] = useState(false);
  /**
   * 工具箱里正在打开的工具；null 表示首页。
   * 初值从地址栏来：刷新、别人发来的 `?tool=json` 链接、以及「弹出到独立窗口」开的那个窗口，
   * 都要直接落在工具上而不是先闪一下首页。工具名认不出来就当家页处理。
   */
  const [activeTool, setActiveTool] = useState<string | null>(() => {
    const key = toolFromQuery();
    return key && findTool(key) ? key : null;
  });
  /** 进工具页之前首页的滚动位置，返回时回到原处 */
  const homeScrollRef = useRef(0);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    groupIds[0] ?? null,
  );
  /** 正在往哪个分组里加链接 */
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    document.title = settings.siteTitle;
  }, [settings.siteTitle]);

  useEffect(() => {
    let frame = 0;
    const updateActiveGroup = () => {
      frame = 0;
      const marker = 96;
      let next = groupIds[0] ?? null;

      for (const id of groupIds) {
        const element = document.getElementById(
          `nav-group-${encodeURIComponent(id)}`,
        );
        if (!element) continue;
        if (element.getBoundingClientRect().top <= marker) next = id;
        else break;
      }

      setActiveGroupId((current) => (current === next ? current : next));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateActiveGroup);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [groupIds]);

  const navigateToGroup = useCallback((id: string) => {
    document
      .getElementById(`nav-group-${encodeURIComponent(id)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveGroupId(id);
  }, []);

  const openTool = useCallback(
    (key: string) => {
      // 只有从首页点进来才记位置：在工具页里换工具时，别把工具页的滚动位置记成首页的
      if (activeTool === null) homeScrollRef.current = window.scrollY;
      setActiveTool(key);
      setToolQuery(key);
    },
    [activeTool],
  );

  const closeTool = useCallback(() => {
    setActiveTool(null);
    clearToolQuery();
  }, []);

  // 工具页是整页替换首页（首页整个卸载），重新挂载时滚动位置会归零；
  // 返回时恢复，别把用户从列表深处弹回顶部。
  // 用 layout effect 是为了在绘制前落位，否则会闪一帧顶部
  useLayoutEffect(() => {
    if (!activeTool) window.scrollTo({ top: homeScrollRef.current });
  }, [activeTool]);

  // 扩展环境且本机还没有同步种子时，配置只能异步读：先渲染骨架，
  // 不用内置配置画一版（卡片视图、内置分组）再跳成用户配置
  if (!configReady) return <PageSkeleton />;

  // 工具页整页替换首页，返回箭头把它换回来
  if (activeTool) {
    return (
      <ToolPage
        toolKey={activeTool}
        onBack={closeTool}
        onOpenTool={openTool}
      />
    );
  }

  return (
    <div className="spirit-canvas min-h-screen">
      <WallpaperLayer dim={settings.wallpaperDim} blur={settings.wallpaperBlur} />
      <AppHeader
        onOpenSettings={() => setDrawerOpen(true)}
        onOpenTool={openTool}
      />

      <main className="mx-auto max-w-[1704px] px-6 pb-20 pt-5 lg:pl-[264px]">
        <GroupToc
          groupIds={groupIds}
          groups={groups}
          activeGroupId={activeGroupId}
          onNavigate={navigateToGroup}
          className="spirit-toc fixed bottom-[12px] left-[12px] top-[69px] z-20 hidden w-[240px] flex-col  border-[var(--spirit-border)] bg-[var(--spirit-surface)]/92 px-3 pb-5 pt-4 backdrop-blur-xl lg:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="mb-5 px-0 pt-1">
            <GlobalSearch />
          </div>

          {groupIds.length === 0 ? (
            <div className="grid place-items-center py-24">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有配置任何链接"
              />
            </div>
          ) : (
            <LinkSortProvider sortable>
              {groupIds.map((id) => {
                const group = groups[id];
                if (!group) return null;
                return (
                  <section
                    key={id}
                    id={`nav-group-${encodeURIComponent(id)}`}
                    className="spirit-section mb-4 scroll-mt-[88px] rounded-2xl bg-[var(--spirit-surface)] p-4 sm:p-5"
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <h2 className="text-[15px] font-semibold tracking-tight text-[var(--spirit-text)]">
                        {group.title}
                      </h2>
                      <span className="rounded-full bg-[var(--spirit-inset)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--spirit-muted)]">
                        {group.links.length}
                      </span>
                      <Tooltip title="在这个分组里添加链接">
                        <Button
                          className="ml-auto"
                          size="small"
                          type="text"
                          icon={<PlusOutlined />}
                          onClick={() => setAddingTo(id)}
                        />
                      </Tooltip>
                    </div>
                    {group.links.length === 0 ? (
                      <button
                        type="button"
                        className={`${DASHED_TILE} h-20 bg-[var(--spirit-inset)] text-sm`}
                        onClick={() => setAddingTo(id)}
                      >
                        <PlusOutlined /> 这个分组还是空的，点击添加链接
                      </button>
                    ) : (
                      <LinkGroupView
                        groupId={id}
                        groupTitle={group.title}
                        links={group.links}
                        card={settings.viewMode === "card"}
                        openInNewTab={settings.linkOpenInNewTab}
                        fontSize={settings.linkFontSize}
                        gap={settings.linkCardGap}
                        sortable
                      />
                    )}
                  </section>
                );
              })}
            </LinkSortProvider>
          )}

          <div className="mt-1">
            <button
              type="button"
              className={`${DASHED_TILE} h-14 bg-[var(--spirit-surface)] text-sm`}
              onClick={() => setCreatingGroup(true)}
            >
              <PlusOutlined /> 新增分组
            </button>
          </div>
        </div>
      </main>

      <FloatButton.BackTop style={{ insetInlineEnd: 28, insetBlockEnd: 28 }} />
      {drawerOpen && (
        <ConfigDrawer open onClose={() => setDrawerOpen(false)} />
      )}
      {addingTo && groups[addingTo] && (
        <LinkFormModal
          groupId={addingTo}
          groupTitle={groups[addingTo].title}
          onClose={() => setAddingTo(null)}
        />
      )}
      {creatingGroup && (
        <NewGroupModal onClose={() => setCreatingGroup(false)} />
      )}
    </div>
  );
}
