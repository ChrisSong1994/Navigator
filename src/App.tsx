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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader.tsx";
import { ConfigDrawer } from "./components/ConfigDrawer.tsx";
import { GlobalSearch } from "./components/GlobalSearch.tsx";
import { GroupToc } from "./components/GroupToc.tsx";
import { LinkFormModal } from "./components/LinkFormModal.tsx";
import { LinkSortProvider } from "./components/LinkSortProvider.tsx";
import { LinkGroupView } from "./components/LinkViews.tsx";
import { ConfigProvider } from "./config/ConfigProvider.tsx";
import { useConfig } from "./config/configContext.ts";
import { DEFAULT_PRIMARY_COLOR } from "./config/schema.ts";
import { useResolvedTheme } from "./hooks/useResolvedTheme.ts";

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
        <Page />
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

function Page() {
  const { settings, groups, groupIds } = useConfig();
  const [keyword, setKeyword] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const filterTimerRef = useRef<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    groupIds[0] ?? null,
  );
  /** 正在往哪个分组里加链接 */
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    document.title = settings.siteTitle;
  }, [settings.siteTitle]);

  // 搜索框保持即时输入；过滤放到下一帧空闲时段，避免输入时同步遍历全部链接。
  useEffect(() => {
    if (filterTimerRef.current !== null) window.clearTimeout(filterTimerRef.current);
    filterTimerRef.current = window.setTimeout(() => {
      filterTimerRef.current = null;
      setFilterKeyword(keyword);
    }, 120);
    return () => {
      if (filterTimerRef.current !== null) {
        window.clearTimeout(filterTimerRef.current);
        filterTimerRef.current = null;
      }
    };
  }, [keyword]);

  const visibleGroups = useMemo(() => {
    const query = filterKeyword.trim().toLowerCase();
    const entries = groupIds.map((id) => [id, groups[id]] as const);
    if (!query) return entries;
    return entries
      .map(([id, group]) => {
        const matched = group.links.filter((link) =>
          `${link.text} ${link.href}`.toLowerCase().includes(query),
        );
        return [id, { ...group, links: matched }] as const;
      })
      .filter(([, group]) => group.links.length > 0);
  }, [groupIds, groups, filterKeyword]);

  const hasKeyword = filterKeyword.trim().length > 0;
  const total = visibleGroups.reduce(
    (sum, [, group]) => sum + group.links.length,
    0,
  );
  const visibleGroupIds = useMemo(
    () => visibleGroups.map(([id]) => id),
    [visibleGroups],
  );

  useEffect(() => {
    let frame = 0;
    const updateActiveGroup = () => {
      frame = 0;
      const marker = 96;
      let next = visibleGroupIds[0] ?? null;

      for (const id of visibleGroupIds) {
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
  }, [visibleGroupIds]);

  const navigateToGroup = useCallback((id: string) => {
    document
      .getElementById(`nav-group-${encodeURIComponent(id)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveGroupId(id);
  }, []);

  return (
    <div className="spirit-canvas min-h-screen">
      <AppHeader
        keyword={keyword}
        onKeywordChange={setKeyword}
        onOpenSettings={() => setDrawerOpen(true)}
      />

      <main className="mx-auto max-w-[1704px] px-6 pb-20 pt-5 lg:pl-[264px]">
        <GroupToc
          groupIds={visibleGroupIds}
          groups={groups}
          activeGroupId={activeGroupId}
          onNavigate={navigateToGroup}
          className="spirit-toc fixed bottom-[12px] left-[12px] top-[69px] z-20 hidden w-[240px] flex-col  border-[var(--spirit-border)] bg-[var(--spirit-surface)]/92 px-3 pb-5 pt-4 backdrop-blur-xl lg:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="mb-5 px-0 pt-1">
            <GlobalSearch />
          </div>
          {hasKeyword && (
            <p className="mb-4 text-xs text-[var(--spirit-muted)]">
              匹配到 {total} 条链接
              {visibleGroups.length > 0 &&
                `，分布在 ${visibleGroups.length} 个分组`}
              ，搜索时暂不支持拖拽排序
            </p>
          )}

          {visibleGroups.length === 0 ? (
            <div className="grid place-items-center py-24">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  hasKeyword
                    ? `没有匹配「${filterKeyword.trim()}」的链接`
                    : "还没有配置任何链接"
                }
              />
            </div>
          ) : (
            // 拖拽排序在这层里生效；搜索过滤时下标和真实配置对不上，直接关掉
            <LinkSortProvider sortable={!hasKeyword}>
              {visibleGroups.map(([id, group]) => (
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
                      fontSize={settings.linkFontSize}
                      gap={settings.linkCardGap}
                      sortable={!hasKeyword}
                    />
                  )}
                </section>
              ))}
            </LinkSortProvider>
          )}

          {!hasKeyword && (
            <div className="mt-1">
              <button
                type="button"
                className={`${DASHED_TILE} h-14 bg-[var(--spirit-surface)] text-sm`}
                onClick={() => setCreatingGroup(true)}
              >
                <PlusOutlined /> 新增分组
              </button>
            </div>
          )}
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
