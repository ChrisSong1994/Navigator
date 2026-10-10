#!/usr/bin/env node
/**
 * pnpm check:merge
 *
 * 用纯 node 跑合并规则的冒烟测试（不需要浏览器）：node scripts/check-merge.mjs
 */
import assert from 'node:assert/strict'
import { hashConfig, linkKey, mergeWithRuntime } from '../src/config/merge.ts'
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
  settings: { siteTitle: '内置标题', primaryColor: '', linkFontSize: 14, linkCardGap: 16, themeMode: 'system', viewMode: 'card' },
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
})

console.log(`\n${passed} 项通过`)
