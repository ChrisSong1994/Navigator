#!/usr/bin/env node
/**
 * pnpm check:tools
 *
 * JSON 工具纯逻辑的冒烟测试（不需要浏览器）：node scripts/check-tools.mjs
 * 覆盖的是「写错一步用户就会看到错东西」的地方：JSON5 兜底、错误行列、转义往返。
 */
import assert from 'node:assert/strict'
import {
  escapeJsonText,
  formatJson,
  minifyJson,
  parseJsonText,
  repairJsonText,
  unescapeJsonText,
} from '../src/tools/Json/lib/json.ts'
import { addHistoryEntry, removeHistoryEntry } from '../src/tools/Json/lib/history.ts'
import { formatTime, isEmpty } from '../src/tools/Json/lib/util.ts'

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

/** 断言解析失败，并把错误对象给回调用方继续查 */
const expectFailure = (text) => {
  const result = parseJsonText(text)
  assert.equal(result.ok, false, '本应解析失败，却成功了')
  return result
}

test('严格 JSON：解析成功且语法标为 json', () => {
  const result = parseJsonText('{"a": [1, 2], "b": "中"}')
  assert.equal(result.ok, true)
  assert.equal(result.syntax, 'json')
  assert.deepEqual(result.data, { a: [1, 2], b: '中' })
})

test('JSON5 兜底：无引号键 / 单引号 / 尾逗号 / 注释都能过', () => {
  for (const text of ["{a: 1}", "{'a': 1}", '{"a": 1,}', '{\n  // 注释\n  "a": 1,\n  /* 块注释 */\n}']) {
    const result = parseJsonText(text)
    assert.equal(result.ok, true, `JSON5 应该能解析：${JSON.stringify(text)}`)
    assert.equal(result.syntax, 'json5', `${JSON.stringify(text)} 应标为 json5`)
    assert.deepEqual(result.data, { a: 1 })
  }
})

test('两个引擎都失败：给出出错行列，位置指向第 3 行', () => {
  // 少个逗号：JSON 和 JSON5 都收不下（尾逗号 / 单引号这类 JSON5 能容忍的写法不在此列）
  const source = '{\n  "a": 1\n  "b": 2\n}'
  const result = expectFailure(source)
  assert.equal(result.line, 3, `行号应为 3，实际 ${result.line}`)
  assert.equal(result.column, 3, `列号应为 3，实际 ${result.column}`)
  // 报错原文里的位置尾巴要摘掉，只留「哪儿错了」
  assert.ok(!result.message.includes('at position'), `message 不该带位置尾巴：${result.message}`)
  assert.ok(!result.message.includes('line 3'), `message 不该带行列：${result.message}`)
  // excerpt 是出错那一行 + 一行 caret，caret 正好落在那一位上
  const [line, caret] = result.excerpt.split('\n')
  assert.equal(line, '  "b": 2')
  assert.equal(caret, '  ^')
})

test('严格 JSON 报错没带位置时，退到 JSON5 的位置', () => {
  // V8 对这段只给「is not valid JSON」，位置得从 JSON5 的报错里取
  const result = expectFailure('{\n  "a": 1,\n  "b":\n}')
  assert.equal(result.line, 4)
  assert.equal(result.column, 1)
})

test('错误位置带上下文：caret 落在出错列上', () => {
  const source = '{"a": 1, "b": }'
  const result = expectFailure(source)
  assert.equal(result.line, 1)
  assert.equal(result.column, 15)
  const [line, caret] = result.excerpt.split('\n')
  assert.equal(line, source)
  // caret 前面 14 个空格 + 一个 ^，正对着第 15 列那个 }
  assert.equal(caret, `${' '.repeat(14)}^`)
})

test('格式化：2 空格缩进，且与压缩互逆', () => {
  const pretty = formatJson('{"a":[1,2],"b":{"c":true}}')
  assert.equal(pretty.ok, true)
  assert.equal(pretty.text, '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true\n  }\n}')

  const one = minifyJson(pretty.text)
  assert.equal(one.ok, true)
  assert.equal(one.text, '{"a":[1,2],"b":{"c":true}}')
  assert.equal(minifyJson('{"a":[1,2]}').text, minifyJson(formatJson('{"a":[1,2]}').text).text)
})

test('格式化 / 压缩遇到坏输入：原样返回失败，不抛异常', () => {
  assert.equal(formatJson('{oops}').ok, false)
  assert.equal(minifyJson('{oops}').ok, false)
})

test('修复：补上尾逗号 / 单引号 / 缺引号的键，产物能被 JSON.parse 通过', () => {
  for (const text of ['{"a":1,}', "{'a':1}", '{a:1}']) {
    const result = repairJsonText(text)
    assert.equal(result.ok, true, `修复应成功：${JSON.stringify(text)}`)
    assert.deepEqual(JSON.parse(result.text), { a: 1 })
  }
})

test('修复：多行输入修完还是多行，单行输入修完还是单行', () => {
  assert.ok(repairJsonText('{\n  "a": 1,\n}').text.includes('\n'))
  assert.ok(!repairJsonText('{"a": 1,}').text.includes('\n'))
})

test('修复：空内容与修不动的输入给失败结果，不抛异常', () => {
  assert.equal(repairJsonText('   ').ok, false)
  assert.equal(repairJsonText('}}}').ok, false)
})

test('转义 / 去转义往返一致（换行、引号、反斜杠、中文、制表符）', () => {
  for (const text of ['{"a": "换\n行"}', 'a"b', 'a\\b', '中文\t制表']) {
    const escaped = escapeJsonText(text)
    assert.ok(!escaped.includes('\n'), `转义后不该有真实换行：${escaped}`)
    assert.equal(unescapeJsonText(escaped), text, `往返不一致：${JSON.stringify(text)}`)
  }
})

test('转义：产物能作为字符串字面量塞回 JSON', () => {
  const text = 'line1\nline2 "quoted"'
  assert.equal(JSON.parse(`"${escapeJsonText(text)}"`), text)
})

test('去转义：粘的是本来就带裸引号的片段时原样返回，不把原文改坏', () => {
  assert.equal(unescapeJsonText('{"a":"b"}'), '{"a":"b"}')
  assert.equal(unescapeJsonText(''), '')
})

test('空输入与纯空白：不抛异常，也不会被当成合法 JSON', () => {
  assert.equal(parseJsonText('').ok, false)
  assert.equal(parseJsonText('   ').ok, false)
  assert.equal(formatJson('').ok, false)
  assert.equal(escapeJsonText(''), '')
})

test('空值判定：null / 空串 / 纯空白算空，0 和 "0" 不算', () => {
  for (const value of [null, undefined, '', '   ', '\n\t']) {
    assert.equal(isEmpty(value), true, `${JSON.stringify(value)} 应算空`)
  }
  for (const value of [0, '0', false, {}, []]) {
    assert.equal(isEmpty(value), false, `${JSON.stringify(value)} 不该算空`)
  }
})

test('历史：新记录插最前，同名替换而不是堆两条', () => {
  const first = addHistoryEntry([], 'a.json', '{"a":1}', 1)
  assert.equal(first.length, 1)
  assert.equal(first[0].name, 'a.json')
  assert.equal(first[0].content, '{"a":1}')

  const replaced = addHistoryEntry(first, 'a.json', '{"a":2}', 2)
  assert.equal(replaced.length, 1)
  assert.equal(replaced[0].content, '{"a":2}')

  const appended = addHistoryEntry(replaced, 'b.json', '{}', 3)
  assert.deepEqual(
    appended.map((item) => item.name),
    ['b.json', 'a.json'],
  )
})

test('历史：超过 20 条从最旧的开始丢', () => {
  let items = []
  for (let i = 0; i < 25; i += 1) items = addHistoryEntry(items, `${i}.json`, `{"i":${i}}`, i)
  assert.equal(items.length, 20)
  assert.equal(items[0].name, '24.json')
  assert.equal(items.at(-1).name, '5.json')
})

test('历史：内容超 256KB 只留名字和时间（localStorage 那点配额经不起大文件）', () => {
  const huge = `{"pad":"${'x'.repeat(256 * 1024)}"}`
  const [item] = addHistoryEntry([], 'big.json', huge, 1)
  assert.equal(item.content, '')
  assert.equal(item.contentOmitted, true)
  assert.equal(item.name, 'big.json')
})

test('历史：删除按 id 走，删不存在的 id 不动列表', () => {
  const items = addHistoryEntry(addHistoryEntry([], 'a.json', '{}', 1), 'b.json', '{}', 2)
  const kept = removeHistoryEntry(items, items[0].id)
  assert.deepEqual(
    kept.map((item) => item.name),
    ['a.json'],
  )
  assert.equal(removeHistoryEntry(items, '没有这个 id').length, 2)
})

test('时间格式：补零到 2024-03-05 09:07 这种口径', () => {
  assert.equal(formatTime(new Date(2024, 2, 5, 9, 7).getTime()), '2024-03-05 09:07')
  assert.equal(formatTime(new Date(2024, 11, 31, 23, 59).getTime()), '2024-12-31 23:59')
})

console.log(`\nJSON 工具逻辑冒烟：${passed} 项通过${process.exitCode ? '，有失败项' : ''}`)
