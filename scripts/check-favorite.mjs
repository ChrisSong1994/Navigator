#!/usr/bin/env node
/**
 * pnpm check:favorite
 *
 * 扩展弹窗那条「收藏当前页」的纯逻辑冒烟测试（不需要浏览器）：node scripts/check-favorite.mjs
 * 覆盖的是「写错一步用户就会看到错东西」的地方：地址归一化、组内去重、取消收藏后的墓碑
 * （不记墓碑的话，下次内置配置一变，刚取消掉的那条会被合并规则复活）。
 */
import assert from 'node:assert/strict'
import { addFavorite, findFavorites, findFavoriteInGroup, normalizeHref, removeFavorite } from '../src/config/favorite.ts'
import { createMeta, mergeWithRuntime } from '../src/config/merge.ts'
import { createGroup, nextGroupIndex } from '../src/config/group.ts'
import { DEFAULT_SETTINGS } from '../src/config/schema.ts'

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
  settings: { ...DEFAULT_SETTINGS },
  groups: {
    default: { title: '常用', links: [link('https://github.com/', 'GitHub')] },
    学习: { title: '学习', links: [] },
  },
}

const local = {
  settings: { ...DEFAULT_SETTINGS },
  groups: {
    default: { title: '常用', links: [link('https://github.com/', 'GitHub')] },
    学习: { title: '学习', links: [] },
  },
}

const baseMeta = createMeta(runtime)

test('地址归一化：末尾斜杠与大小写不算两条', () => {
  assert.equal(normalizeHref('https://GitHub.com/'), normalizeHref('https://github.com'))
  assert.equal(normalizeHref('https://a.com/x/'), normalizeHref('https://a.com/x'))
  assert.notEqual(normalizeHref('https://a.com/x'), normalizeHref('https://a.com/x?q=1'))
  assert.equal(normalizeHref(' not a url '), 'not a url')
})

test('收藏：追加到分组末尾，图标与标题落进配置', () => {
  const result = addFavorite(local, baseMeta, '学习', link('https://vite.dev/', 'Vite', 'https://vite.dev/favicon.ico'), runtime)
  assert.equal(result.changed, true)
  assert.deepEqual(result.config.groups['学习'].links, [
    { icon: 'https://vite.dev/favicon.ico', href: 'https://vite.dev/', text: 'Vite' },
  ])
  // 原对象不被改动
  assert.deepEqual(local.groups['学习'].links, [])
})

test('收藏：组内已有同一个地址（只差末尾斜杠）不重复写', () => {
  const result = addFavorite(local, baseMeta, 'default', link('https://github.com', 'GitHub'), runtime)
  assert.equal(result.changed, false)
  assert.equal(result.config.groups.default.links.length, 1)
})

test('收藏：分组不存在时什么也不做', () => {
  const result = addFavorite(local, baseMeta, '不存在的分组', link('https://x.com', 'X'), runtime)
  assert.equal(result.changed, false)
  assert.deepEqual(result.config, local)
})

test('收藏：清掉同一地址的墓碑，避免被内置配置拦掉', () => {
  const meta = { ...baseMeta, deletedLinks: [`default::https://github.com/`] }
  const result = addFavorite(local, meta, 'default', link('https://github.com/', 'GitHub'), runtime)
  assert.equal(result.changed, false, '已经存在，不必再写')
  // 换成内置配置里被删过、但当前配置里没有的地址：墓碑应该被清掉
  const removed = removeFavorite(local, meta, 'default', 'https://github.com/', runtime)
  assert.deepEqual(removed.meta.deletedLinks, [`default::https://github.com/`])
  const added = addFavorite(removed.config, removed.meta, 'default', link('https://github.com/', 'GitHub'), runtime)
  assert.equal(added.changed, true)
  assert.deepEqual(added.meta.deletedLinks, [], '重新收藏后墓碑要清掉')
})

test('取消收藏：内置配置里也有的那条要补墓碑', () => {
  const result = removeFavorite(local, baseMeta, 'default', 'https://github.com', runtime)
  assert.equal(result.changed, true)
  assert.deepEqual(result.config.groups.default.links, [])
  assert.deepEqual(result.meta.deletedLinks, ['default::https://github.com/'], '墓碑用内置配置里的原样地址')
})

test('取消收藏：内置配置里没有的那条不记墓碑', () => {
  const meta = createMeta(runtime)
  const added = addFavorite(local, meta, '学习', link('https://vite.dev', 'Vite'), runtime)
  const removed = removeFavorite(added.config, added.meta, '学习', 'https://vite.dev/', runtime)
  assert.equal(removed.changed, true)
  assert.deepEqual(removed.meta.deletedLinks, [])
})

test('取消收藏：分组或链接不存在时什么也不做', () => {
  assert.equal(removeFavorite(local, baseMeta, '学习', 'https://github.com', runtime).changed, false)
  assert.equal(removeFavorite(local, baseMeta, '没有这个组', 'https://github.com', runtime).changed, false)
})

test('反查：同一个地址收藏在多个分组时都能找出来', () => {
  const noted = addFavorite(local, baseMeta, '学习', link('https://github.com/', 'GitHub'), runtime).config
  assert.deepEqual(
    findFavorites(noted.groups, 'https://github.com').map((hit) => hit.groupId),
    ['default', '学习'],
  )
  assert.equal(findFavoriteInGroup(noted.groups.default, 'https://github.com/')?.text, 'GitHub')
  assert.equal(findFavoriteInGroup(noted.groups['学习'], 'https://github.com/')?.text, 'GitHub')
  assert.equal(findFavoriteInGroup(noted.groups['学习'], 'https://other.com'), undefined)
})

test('新建分组：id 约定与墓碑清理跟配置面板一致', () => {
  assert.equal(nextGroupIndex({}), 1)
  assert.equal(nextGroupIndex({ 'group-1': local.groups.default }), 2)
  assert.equal(nextGroupIndex({ 'group-1': local.groups.default, 'group-2': local.groups['学习'] }), 3)

  const meta = { ...baseMeta, deletedGroups: ['group-3'] }
  const created = createGroup(local, meta)
  assert.equal(created.id, 'group-3', '两个已有分组 → 依次往后找没被占用的序号')
  assert.equal(created.config.groups['group-3'].title, '新分组 3')
  assert.deepEqual(created.meta.deletedGroups, [], '新建的分组不能被墓碑拦住')

  const named = createGroup(local, baseMeta, '  临时  ')
  assert.equal(named.config.groups[named.id].title, '临时')
})

test('收藏进新建的分组：一次动作里建组 + 放链接', () => {
  const created = createGroup(local, baseMeta, '收藏夹')
  const filled = addFavorite(created.config, created.meta, created.id, link('https://vite.dev', 'Vite'), runtime)
  assert.deepEqual(filled.config.groups['group-3'], {
    title: '收藏夹',
    links: [{ icon: '', href: 'https://vite.dev', text: 'Vite' }],
  })
})

test('收藏后合并内置配置：新链接留着，取消收藏的不会被复活', () => {
  const withNew = addFavorite(local, baseMeta, '学习', link('https://vite.dev', 'Vite'), runtime)
  const removed = removeFavorite(withNew.config, withNew.meta, 'default', 'https://github.com/', runtime)
  const merged = mergeWithRuntime(runtime, removed.config, removed.meta)
  assert.deepEqual(
    merged.config.groups['学习'].links.map((item) => item.href),
    ['https://vite.dev'],
  )
  assert.deepEqual(merged.config.groups.default.links, [], '内置里删掉的那条不该复活')
})

console.log(`\n${passed} 项通过`)
