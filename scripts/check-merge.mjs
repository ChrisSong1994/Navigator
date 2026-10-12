#!/usr/bin/env node
/**
 * pnpm check:merge
 *
 * 用纯 node 跑合并规则的冒烟测试（不需要浏览器）：node scripts/check-merge.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseBookmarksHtml, renderBookmarksHtml } from '../src/config/bookmarks.ts'
import { createMeta, hashConfig, linkKey, mergeImported, mergeWithRuntime, replacementTombstones } from '../src/config/merge.ts'
import { parseConfig, serializeConfig } from '../src/config/schema.ts'

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`)
    process.exitCode = 1
  }
}

const link = (href, text, icon = '') => ({ icon, href, text })
const runtime = {
  settings: { siteTitle: '内置标题', siteLogo: '', primaryColor: '', linkFontSize: 14, linkCardGap: 16, themeMode: 'system', viewMode: 'card', searchEngine: 'google', searchOpenInNewTab: true, linkOpenInNewTab: true },
  groups: {
    default: { title: '常用', links: [link('https://a.com', 'A'), link('https://b.com', 'B')] },
    学习: { title: '学习', links: [link('https://c.com', 'C')] },
    废弃: { title: '废弃', links: [link('https://d.com', 'D')] },
  },
}

test('首次访问：用内置配置初始化，并记下 hash 与基准 settings', () => {
  const { config, meta, merged } = mergeWithRuntime(runtime, null, null)
  assert.equal(merged, true)
  assert.deepEqual(Object.keys(config.groups), ['default', '学习', '废弃'])
  assert.equal(meta.runtimeHash, hashConfig(runtime))
  assert.deepEqual(meta.deletedGroups, [])
  assert.equal(meta.baseSettings.linkFontSize, 14)
})

test('内置配置没变：本地就是唯一真相', () => {
  const { meta } = mergeWithRuntime(runtime, null, null)
  const local = { ...runtime, groups: { ...runtime.groups, 学习: { title: '我的学习', links: [link('https://c.com', 'C++')] } } }
  const { config, merged } = mergeWithRuntime(runtime, local, meta)
  assert.equal(merged, false)
  assert.equal(config.groups.学习.title, '我的学习')
  assert.equal(config.groups.学习.links[0].text, 'C++')
})

test('内置配置新增分组 + 新增链接：并入本地，本地顺序在前', () => {
  const { meta } = mergeWithRuntime(runtime, null, null)
  const local = { ...runtime, groups: { ...runtime.groups, 学习: { title: '我的学习', links: [link('https://c.com', 'C')] } } }
  const next = {
    ...runtime,
    groups: {
      ...runtime.groups,
      学习: { title: '学习', links: [link('https://c.com', 'C'), link('https://new.com', '新链接')] },
      新分组: { title: '新分组', links: [link('https://e.com', 'E')] },
    },
  }
  const { config, merged } = mergeWithRuntime(next, local, meta)
  assert.equal(merged, true)
  assert.equal(config.groups.学习.title, '我的学习', '本地改过的标题保留')
  assert.deepEqual(config.groups.学习.links.map((item) => item.href), ['https://c.com', 'https://new.com'])
  assert.ok(config.groups.新分组, '内置新增的分组被并入')
})

test('本地删除的项不会被内置配置复活（墓碑）', () => {
  const { config: first, meta } = mergeWithRuntime(runtime, null, null)
  const local = {
    ...first,
    groups: { default: first.groups.default, 学习: first.groups.学习 },
  }
  const metaAfterDelete = {
    ...meta,
    deletedGroups: ['废弃'],
    deletedLinks: [linkKey('default', 'https://b.com')],
  }
  const next = {
    ...runtime,
    groups: { ...runtime.groups, default: { title: '常用', links: [...runtime.groups.default.links, link('https://f.com', 'F')] } },
  }
  const { config } = mergeWithRuntime(next, local, metaAfterDelete)
  assert.equal(config.groups.废弃, undefined, '删掉的分组不回来')
  assert.deepEqual(config.groups.default.links.map((item) => item.href), ['https://a.com', 'https://f.com'])
})

test('settings：本地改过的保留，没动过的跟随内置配置', () => {
  const { config: first, meta } = mergeWithRuntime(runtime, null, null)
  const local = { ...first, settings: { ...first.settings, linkFontSize: 18 } }
  const next = { ...runtime, settings: { ...runtime.settings, linkFontSize: 20, linkCardGap: 24, siteTitle: '新标题' } }
  const { config } = mergeWithRuntime(next, local, meta)
  assert.equal(config.settings.linkFontSize, 18, '本地改过的字号保留')
  assert.equal(config.settings.linkCardGap, 24, '没动过的间距跟随内置')
  assert.equal(config.settings.siteTitle, '新标题', '本地未覆盖的标题跟随内置')
})

test('settings：搜索引擎跟随同一套“本地优先、内置增量”规则', () => {
  const { config: first, meta } = mergeWithRuntime(runtime, null, null)
  const local = { ...first, settings: { ...first.settings, searchEngine: 'baidu' } }
  const next = { ...runtime, settings: { ...runtime.settings, searchEngine: 'bing' } }
  const { config } = mergeWithRuntime(next, local, meta)
  assert.equal(config.settings.searchEngine, 'baidu', '本地改过的搜索引擎保留')

  const untouchedLocal = { ...first }
  const untouched = mergeWithRuntime(next, untouchedLocal, meta)
  assert.equal(untouched.config.settings.searchEngine, 'bing', '没动过的搜索引擎跟随内置')
})

test('序列化稳定：导出再导入内容与 hash 不变', () => {
  const config = parseConfig(runtime).config
  const exported = serializeConfig(config)
  const reparsed = parseConfig(JSON.parse(exported)).config
  assert.deepEqual(reparsed, config)
  assert.equal(hashConfig(reparsed), hashConfig(config))
})

test('校验：坏配置能定位到具体字段', () => {
  const bad = { settings: { linkFontSize: 99 }, groups: { 学习: { title: '', links: [{ href: '', text: 'x' }] } } }
  const result = parseConfig(bad)
  assert.equal(result.config, null)
  const joined = result.errors.join('\n')
  assert.match(joined, /settings\.linkFontSize/)
  assert.match(joined, /groups\.学习\.title/)
  assert.match(joined, /groups\.学习\.links\[0\]\.href/)
})

test('校验：缺省字段用默认值补齐，未知字段被剔除', () => {
  const result = parseConfig({ settings: { siteTitle: 'X' }, groups: { g: { title: 'G', links: [link('https://a.com', 'A')] } } })
  assert.equal(result.config.settings.themeMode, 'system')
  assert.equal(result.config.settings.linkFontSize, 14)
  assert.equal(result.config.settings.searchOpenInNewTab, true)
  assert.equal(result.config.settings.linkOpenInNewTab, true)
})

// ---------------------------------------------------------------- 上传：Chrome 书签 HTML 解析

const BOOKMARK_HTML = `<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://a.com" ICON="data:image/png;base64,AAA">A&amp;B</A>
        <DT><A HREF="https://root.com">顶层游离</A>
        <DT><H3>学习</H3>
        <DL><p>
            <DT><A HREF="https://b.com">B</A>
            <DT><H3>刷题</H3>
            <DL><p>
                <DT><A HREF="https://c.com">C</A>
            </DL><p>
            <DT><H3>空文件夹</H3>
            <DL><p></DL><p>
        </DL><p>
    </DL><p>
</DL><p>`

test('书签解析：书签栏直属 + 顶层游离链接 → default/常用，子文件夹 id 用路径、标题用 " / "', () => {
  const { groups, stats } = parseBookmarksHtml(BOOKMARK_HTML)
  assert.deepEqual(Object.keys(groups), ['default', '学习', '学习/刷题'])
  assert.equal(groups.default.title, '常用')
  assert.deepEqual(groups.default.links.map((item) => item.href), ['https://a.com', 'https://root.com'])
  assert.equal(groups['学习/刷题'].title, '学习 / 刷题')
  assert.equal(stats.links, 4)
  assert.equal(stats.icons, 1)
})

test('书签解析：HTML 实体解码、空文件夹不生成空分组', () => {
  const { groups } = parseBookmarksHtml(BOOKMARK_HTML)
  assert.equal(groups.default.links[0].text, 'A&B')
  assert.equal(groups['学习/空文件夹'], undefined, '只有子文件夹、没有直属链接的文件夹不生成分组')
})

test('书签解析：keepIcons=false 时链接不带图标', () => {
  const { groups, stats } = parseBookmarksHtml(BOOKMARK_HTML, { keepIcons: false })
  assert.deepEqual(groups.default.links.map((item) => item.icon), ['', ''])
  assert.equal(stats.icons, 0)
  assert.ok(stats.bytes > 0)
})

test('书签解析：同一份 HTML 解析两次结果一致（正则 lastIndex 不留状态）', () => {
  assert.deepEqual(parseBookmarksHtml(BOOKMARK_HTML).groups, parseBookmarksHtml(BOOKMARK_HTML).groups)
})

test('书签解析：不是 Chrome 导出时抛出可读错误', () => {
  assert.throws(() => parseBookmarksHtml('<html><body>不是书签</body></html>'), /没有解析出任何书签/)
})

// ---------------------------------------------------------------- 上传：合并进现有配置

const groupsOf = (entries) => Object.fromEntries(entries.map(([id, title, hrefs]) => [id, { title, links: hrefs.map((href) => link(href, href)) }]))

test('导入·合并：同名分组并进去，已有链接与顺序不动，新链接追加到末尾', () => {
  const result = mergeImported(
    groupsOf([['default', '常用', ['https://a.com', 'https://b.com']]]),
    groupsOf([['default', '常用', ['https://b.com', 'https://c.com']]]),
  )
  assert.deepEqual(result.groups.default.links.map((item) => item.href), ['https://a.com', 'https://b.com', 'https://c.com'])
  assert.deepEqual(result.addedGroupIds, [])
  assert.equal(result.addedLinks.length, 1)
  assert.equal(result.skippedLinks, 1)
})

test('导入·合并：改名后的分组按 id 命中，标题保持用户改过的那个', () => {
  const result = mergeImported(
    groupsOf([['学习/刷题', '刷题专区', ['https://a.com']]]),
    groupsOf([['学习/刷题', '学习 / 刷题', ['https://b.com']]]),
  )
  assert.deepEqual(Object.keys(result.groups), ['学习/刷题'])
  assert.equal(result.groups['学习/刷题'].title, '刷题专区')
  assert.deepEqual(result.groups['学习/刷题'].links.map((item) => item.href), ['https://a.com', 'https://b.com'])
})

test('导入·合并：id 不同但标题相同 → 并进那个同名分组（用户手动建的同名分组）', () => {
  const result = mergeImported(
    groupsOf([['group-3', '学习 / 刷题', ['https://a.com']]]),
    groupsOf([['学习/刷题', '学习 / 刷题', ['https://b.com']]]),
  )
  assert.deepEqual(Object.keys(result.groups), ['group-3'])
  assert.deepEqual(result.groups['group-3'].links.map((item) => item.href), ['https://a.com', 'https://b.com'])
})

test('导入·合并：全新分组追加到末尾，已有分组顺序不变', () => {
  const result = mergeImported(
    groupsOf([['default', '常用', ['https://a.com']], ['学习', '学习', ['https://b.com']]]),
    groupsOf([['AI', 'AI', ['https://c.com']]]),
  )
  assert.deepEqual(Object.keys(result.groups), ['default', '学习', 'AI'])
  assert.deepEqual(result.addedGroupIds, ['AI'])
})

test('导入·合并：组内重复 href 只保留一条（新分组也一样）', () => {
  const result = mergeImported(groupsOf([['default', '常用', ['https://a.com']]]), groupsOf([['新组', '新组', ['https://b.com', 'https://b.com']]]))
  assert.deepEqual(result.groups.新组.links.map((item) => item.href), ['https://b.com'])
  assert.equal(result.skippedLinks, 1)
})

test('导入·合并：不改动调用方传进来的对象', () => {
  const current = groupsOf([['default', '常用', ['https://a.com']]])
  const incoming = groupsOf([['default', '常用', ['https://b.com']]])
  mergeImported(current, incoming)
  assert.deepEqual(current.default.links.map((item) => item.href), ['https://a.com'])
  assert.deepEqual(incoming.default.links.map((item) => item.href), ['https://b.com'])
})

test('导入·合并：重新导入回来会解除对应的墓碑（否则下次内置合并会把它们丢掉）', () => {
  const { config: first, meta } = mergeWithRuntime(runtime, null, null)
  const local = { ...first, groups: { default: first.groups.default } }
  const metaAfterDelete = { ...meta, deletedGroups: ['废弃'], deletedLinks: [linkKey('default', 'https://b.com'), linkKey('其他', 'https://z.com')] }

  const merged = mergeImported(local.groups, groupsOf([['废弃', '废弃', ['https://d.com']], ['default', '常用', ['https://b.com']]]))
  const touchedGroups = new Set(merged.touchedGroupIds)
  const touchedLinks = new Set(merged.touchedLinkKeys)
  const metaAfterImport = {
    ...metaAfterDelete,
    deletedGroups: metaAfterDelete.deletedGroups.filter((id) => !touchedGroups.has(id)),
    deletedLinks: metaAfterDelete.deletedLinks.filter((key) => !touchedLinks.has(key)),
  }
  assert.deepEqual(metaAfterImport.deletedGroups, [], '导入回来的分组不再被墓碑拦着')
  assert.deepEqual(metaAfterImport.deletedLinks, [linkKey('其他', 'https://z.com')], '没被导入触碰的墓碑保持不动')

  // 关键回归：内置配置变了之后，导入回来的分组 / 链接必须还在
  const nextRuntime = {
    ...runtime,
    groups: { ...runtime.groups, 废弃: { title: '废弃', links: [link('https://d.com', 'D'), link('https://x.com', 'X')] } },
  }
  const { config } = mergeWithRuntime(nextRuntime, { ...local, groups: merged.groups }, metaAfterImport)
  assert.deepEqual(config.groups.废弃.links.map((item) => item.href), ['https://d.com', 'https://x.com'], '导入的分组保留 + 内置新增的并入')
  assert.deepEqual(config.groups.default.links.map((item) => item.href), ['https://a.com', 'https://b.com'], '导入回来的链接没被墓碑丢掉')
})

// ---------------------------------------------------------------- 上传：全部替换

test('导入·替换：内置里缺失的内容记成墓碑，下次内置合并不会复活它们', () => {
  const { deletedGroups, deletedLinks } = replacementTombstones(runtime, groupsOf([['default', '常用', ['https://a.com']]]))
  assert.deepEqual(deletedGroups, ['学习', '废弃'], '内置有、替换内容没有的分组（按内置配置的分组顺序）')
  assert.deepEqual(deletedLinks, [linkKey('default', 'https://b.com'), linkKey('学习', 'https://c.com'), linkKey('废弃', 'https://d.com')])

  // 替换后内置配置变了：被替换掉的不能回来，替换内容里有的仍能并入新增链接
  const meta = { ...createMeta(runtime), deletedGroups, deletedLinks }
  const next = { ...runtime, groups: { ...runtime.groups, default: { title: '常用', links: [...runtime.groups.default.links, link('https://new.com', '新')] } } }
  const { config } = mergeWithRuntime(next, { settings: runtime.settings, groups: groupsOf([['default', '常用', ['https://a.com']]]) }, meta)
  assert.deepEqual(Object.keys(config.groups), ['default'], '替换掉的分组不会回来')
  assert.deepEqual(config.groups.default.links.map((item) => item.href), ['https://a.com', 'https://new.com'], '替换内容里有的分组仍能接收内置新增')
})

test('导入·替换：替换内容已包含全部内置内容时，墓碑为空（与旧行为一致）', () => {
  const { deletedGroups, deletedLinks } = replacementTombstones(runtime, runtime.groups)
  assert.deepEqual(deletedGroups, [])
  assert.deepEqual(deletedLinks, [])
})

test('导入·替换：墓碑只影响内置合并，重新合并内置配置（meta 传 null）能把内容找回来', () => {
  const { deletedGroups, deletedLinks } = replacementTombstones(runtime, groupsOf([['default', '常用', ['https://a.com']]]))
  const { config } = mergeWithRuntime(runtime, { settings: runtime.settings, groups: groupsOf([['default', '常用', ['https://a.com']]]) }, null)
  assert.deepEqual(Object.keys(config.groups), ['default', '学习', '废弃'])
  assert.ok(deletedGroups.length > 0 && deletedLinks.length > 0)
})

// ---------------------------------------------------------------- 导出：Chrome 书签 HTML

test('书签导出：版式与 Chrome 导出一致（缩进 / </DT> 省略 / 工具栏标记）', () => {
  const html = renderBookmarksHtml({
    default: { title: '常用', links: [link('https://a.com', 'A', 'data:image/png;base64,AAA')] },
    学习: { title: '学习', links: [link('https://b.com', 'B')] },
  })
  const lines = html.split('\n')
  assert.equal(lines[0], '<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  assert.ok(lines.includes('<DL><p>'), '根 DL 顶格')
  assert.ok(lines.includes('    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>'))
  assert.ok(lines.includes('    <DL><p>'), '书签栏的 DL 缩进 4')
  assert.ok(lines.includes('        <DT><A HREF="https://a.com" ICON="data:image/png;base64,AAA">A</A>'), '直属链接缩进 8')
  assert.ok(lines.includes('        <DT><H3>学习</H3>'))
  assert.ok(lines.includes('    </DL><p>'), '闭合与自己的 <DL> 同缩进')
  assert.ok(html.endsWith('</DL><p>\n'))
  assert.ok(!html.includes('</DT>'), 'Chrome 不写 </DT>')
  assert.ok(!html.includes('ADD_DATE'), '配置里没有添加时间，不编造')
  assert.ok(lines.includes('            <DT><A HREF="https://b.com">B</A>'), '没有图标就不写 ICON 属性')
})

test('书签导出：分组标题按 " / " 拆成文件夹层级，缺的中间层自动补上', () => {
  const html = renderBookmarksHtml({ '学习/刷题': { title: '学习 / 刷题', links: [link('https://c.com', 'C')] } })
  assert.ok(html.includes('    <DT><H3>学习</H3>'), '没有「学习」这个分组也要建出中间文件夹')
  assert.ok(html.includes('        <DT><H3>刷题</H3>'))
  assert.ok(html.includes('            <DT><A HREF="https://c.com">C</A>'))
  // 中间层没有直属链接 → 解析回来不该多出一个「学习」分组
  assert.deepEqual(Object.keys(parseBookmarksHtml(html).groups), ['学习/刷题'])
})

test('书签导出：空分组不写出空文件夹', () => {
  const html = renderBookmarksHtml({ 空组: { title: '空组', links: [] }, 有内容: { title: '有内容', links: [link('https://a.com', 'A')] } })
  assert.ok(!html.includes('空组'))
  assert.deepEqual(Object.keys(parseBookmarksHtml(html).groups), ['有内容'])
})

test('书签导出：文本里的 & < > " 转义后能原样解析回来', () => {
  const groups = { default: { title: '常用', links: [link('https://a.com/?x=1&y=2', 'A & B <标签> "引号"')] } }
  const html = renderBookmarksHtml(groups)
  assert.ok(html.includes('&amp;') && html.includes('&lt;') && html.includes('&quot;'))
  assert.deepEqual(parseBookmarksHtml(html).groups, groups)
})

test('书签导出 → 解析：小配置往返一致', () => {
  const groups = {
    default: { title: '常用', links: [link('https://a.com', 'A', 'data:image/png;base64,AAA'), link('https://b.com', 'B')] },
    学习: { title: '学习', links: [link('https://c.com', 'C')] },
    '学习/刷题': { title: '学习 / 刷题', links: [link('https://d.com', 'D')] },
    工具: { title: '工具', links: [link('https://e.com', 'E')] },
  }
  assert.deepEqual(parseBookmarksHtml(renderBookmarksHtml(groups)).groups, groups)
})

test('书签导出 → 解析：公开 demo 导出（chrome_bookmarks_demo.html）往返一致', () => {
  const demo = readFileSync(new URL('../chrome_bookmarks_demo.html', import.meta.url), 'utf8')
  const original = parseBookmarksHtml(demo).groups
  const roundTripped = parseBookmarksHtml(renderBookmarksHtml(original)).groups
  assert.deepEqual(roundTripped, original, '30 条链接 / 3 个分组原样回来')
  assert.equal(Object.keys(roundTripped).length, 3)
  assert.equal(Object.values(roundTripped).reduce((total, group) => total + group.links.length, 0), 30)
})

console.log(`\n${passed} 项通过`)
