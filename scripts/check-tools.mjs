#!/usr/bin/env node
/**
 * pnpm check:tools
 *
 * 工具箱里各工具纯逻辑的冒烟测试（不需要浏览器）：node scripts/check-tools.mjs
 * JSON 那边覆盖的是「写错一步用户就会看到错东西」的地方：JSON5 兜底、错误行列、转义往返。
 * 颜色那边覆盖的是换算本身（hex / rgb / hsv / hsl / cmyk 往返）与输入框的解析判定。
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
import { addHistoryEntry, removeHistoryEntry } from '../src/tools/lib/history.ts'
import { formatTime, isEmpty } from '../src/tools/lib/util.ts'
import {
  cmykToRgb,
  derive,
  hexToRgb,
  hslToRgb,
  hsvFromInput,
  hsvFromRgb,
  hsvToRgb,
  isValidHex,
  parseColorString,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from '../src/tools/Color/lib/color.ts'
import { addRecord, removeRecord, renameRecord } from '../src/tools/Color/lib/records.ts'
import { JSON_FILE_KIND } from '../src/tools/Json/lib/kind.ts'
import { MARKDOWN_FILE_KIND } from '../src/tools/Markdown/lib/kind.ts'

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

/* 颜色工具 ---------------------------------------------------------------- */

/** 一组够刁的样本：黑 / 白 / 灰 / 三原色 / 边界值 */
const COLOR_SAMPLES = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#1d2e54', '#f80']

/** 三位缩写先摊成六位：换算是按六位做的，往返断言都拿它当基准 */
const expandHex = (hex) => (hex.length === 4 ? rgbToHex(hexToRgb(hex)) : hex)

test('颜色：hex 与 rgb 互通，三位缩写也认', () => {
  assert.deepEqual(hexToRgb('#1d2e54'), { r: 29, g: 46, b: 84 })
  assert.deepEqual(hexToRgb('#f80'), { r: 255, g: 136, b: 0 })
  assert.deepEqual(hexToRgb('1d2e54'), { r: 29, g: 46, b: 84 })
  assert.equal(rgbToHex({ r: 255, g: 136, b: 0 }), '#ff8800')

  for (const hex of COLOR_SAMPLES) {
    assert.equal(rgbToHex(hexToRgb(hex)), expandHex(hex), `hex 往返不一致：${hex}`)
  }
})

test('颜色：hex 合法性判定', () => {
  for (const text of ['#fff', '#ffff', '#ffffff', '#ffffffff', '1d2e54', '  #F80  ']) {
    assert.equal(isValidHex(text), true, `${text} 应算合法`)
  }
  for (const text of ['', '#', '#ff', '#fffff', '#fffffff', 'red', 'rgb(1,2,3)', null, undefined]) {
    assert.equal(isValidHex(text), false, `${JSON.stringify(text)} 不该算合法`)
  }
})

test('颜色：rgb ↔ hsv 往返，灰阶的饱和度是 0', () => {
  for (const hex of COLOR_SAMPLES) {
    const rgb = hexToRgb(hex)
    assert.equal(rgbToHex(hsvToRgb(rgbToHsv(rgb))), expandHex(hex), `rgb↔hsv 往返不一致：${hex}`)
  }
  assert.equal(rgbToHsv({ r: 0, g: 0, b: 0 }).v, 0)
  assert.equal(rgbToHsv({ r: 128, g: 128, b: 128 }).s, 0)
})

test('颜色：hsv 换算的基本点（纯红、灰、黑）', () => {
  assert.deepEqual(hsvToRgb({ h: 0, s: 1, v: 1 }), { r: 255, g: 0, b: 0 })
  assert.deepEqual(hsvToRgb({ h: 210, s: 0, v: 1 }), { r: 255, g: 255, b: 255 })
  assert.deepEqual(hsvToRgb({ h: 210, s: 1, v: 0 }), { r: 0, g: 0, b: 0 })
  // 色相绕回来：-30° 和 330° 是同一个色
  assert.deepEqual(hsvToRgb({ h: -30, s: 1, v: 1 }), hsvToRgb({ h: 330, s: 1, v: 1 }))
})

test('颜色：rgb ↔ hsl 往返，纯红是 hsl(0, 100%, 50%)', () => {
  assert.deepEqual(hslToRgb({ h: 0, s: 1, l: 0.5 }), { r: 255, g: 0, b: 0 })
  const red = rgbToHsl({ r: 255, g: 0, b: 0 })
  assert.equal(red.h, 0)
  assert.equal(red.s, 1)
  assert.equal(red.l, 0.5)
  assert.equal(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0)

  for (const hex of COLOR_SAMPLES) {
    const rgb = hexToRgb(hex)
    assert.equal(rgbToHex(hslToRgb(rgbToHsl(rgb))), expandHex(hex), `rgb↔hsl 往返不一致：${hex}`)
  }
})

test('颜色：cmyk 两个方向（原来的 convert.ts 照搬过来）', () => {
  assert.deepEqual(rgbToCmyk({ r: 255, g: 255, b: 255 }), { c: 0, m: 0, y: 0, k: 0 })
  assert.deepEqual(rgbToCmyk({ r: 0, g: 0, b: 0 }), { c: 0, m: 0, y: 0, k: 1 })
  assert.deepEqual(cmykToRgb({ c: 0, m: 0, y: 0, k: 0 }), { r: 255, g: 255, b: 255 })

  for (const hex of COLOR_SAMPLES) {
    const rgb = hexToRgb(hex)
    assert.equal(rgbToHex(cmykToRgb(rgbToCmyk(rgb))), expandHex(hex), `rgb↔cmyk 往返不一致：${hex}`)
  }
})

test('颜色：灰阶保留色相，不然色相条会自己跳回 0', () => {
  // 拖到纯黑：hsv 的 h 还是原来那根，派生出来的 hsl 也跟着留着
  assert.equal(hsvFromRgb({ r: 0, g: 0, b: 0 }, 210).h, 210)
  assert.equal(hsvFromRgb({ r: 255, g: 255, b: 255 }, 210).h, 210)
  // 有色相的颜色当然用它自己的
  assert.equal(hsvFromRgb({ r: 255, g: 0, b: 0 }, 210).h, 0)

  const gray = derive({ h: 210, s: 0, v: 0.5 })
  assert.equal(gray.hsl.h, 210)
  assert.equal(gray.hex, '#808080')
})

test('颜色：输入格的文本解析 —— 剥 ° / %、个数要对、数字要全', () => {
  assert.deepEqual(parseColorString('rgb', '255, 0, 128'), [255, 0, 128])
  assert.deepEqual(parseColorString('hsv', '210°, 50%, 30%'), [210, 50, 30])
  assert.deepEqual(parseColorString('cmyk', '20%, 40%, 60%, 10%'), [20, 40, 60, 10])

  // 个数不对、有非数字、hex 走另一条路 —— 一律 null，界面上就是「什么都不发生」
  assert.equal(parseColorString('rgb', '255, 0'), null)
  assert.equal(parseColorString('rgb', '255, 0, 128, 1'), null)
  assert.equal(parseColorString('hsv', '210°, 50%'), null)
  assert.equal(parseColorString('cmyk', '1, 2, 3'), null)
  assert.equal(parseColorString('hsl', 'a, b, c'), null)
  assert.equal(parseColorString('hex', '#1d2e54'), null)
})

test('颜色：五格输入算出来的色', () => {
  assert.equal(derive(hsvFromInput('hex', '#1D2E54')).hex, '#1d2e54')
  assert.equal(hsvFromInput('hex', '#zz'), null)

  assert.deepEqual(hsvFromInput('rgb', '255, 0, 0'), { h: 0, s: 1, v: 1 })
  // hsv 一格直连，不做 rgb 往返量化
  const hsv = hsvFromInput('hsv', '210°, 50%, 55%')
  assert.equal(hsv.h, 210)
  assert.equal(hsv.s, 0.5)
  assert.equal(hsv.v, 0.55)

  assert.equal(derive(hsvFromInput('hsl', '210°, 50%, 30%')).hex, '#264d73')
  assert.equal(derive(hsvFromInput('cmyk', '20%, 40%, 60%, 10%')).hex, '#b88a5c')
  // 小数写法也认（0.5 就是 50%）
  assert.equal(derive(hsvFromInput('hsl', '210, 0.5, 0.3')).hex, '#264d73')
  // 超范围的值夹到边界，不是崩掉
  assert.deepEqual(hsvFromInput('rgb', '300, -20, 0'), { h: 0, s: 1, v: 1 })

  assert.equal(hsvFromInput('hsv', '210°, 50%'), null)
  assert.equal(hsvFromInput('rgb', ''), null)
})

test('颜色记录：记录、改名、删除', () => {
  const first = addRecord([], '#1d2e54', 1)
  assert.equal(first.length, 1)
  assert.equal(first[0].value, '#1d2e54')
  // 名字默认就是色值，原版如此
  assert.equal(first[0].title, '#1d2e54')

  const twice = addRecord(first, '#ff8800', 1)
  assert.equal(twice.length, 2)
  assert.notEqual(twice[0].key, twice[1].key, '同一毫秒里连点两次也不能撞 key')

  const renamed = renameRecord(twice, twice[0].key, '主题色')
  assert.equal(renamed[0].title, '主题色')
  assert.equal(renamed[1].title, '#ff8800')

  const kept = removeRecord(renamed, renamed[0].key)
  assert.deepEqual(
    kept.map((item) => item.key),
    [twice[1].key],
  )
  assert.equal(removeRecord(renamed, '没有这个 key').length, 2)
})

/* 导入 / 保存的文件类型 ---------------------------------------------------- */

test('文件类型：accept 里得含扩展名，mime / 描述不缺（选文件对话框靠它）', () => {
  for (const [label, kind] of [
    ['JSON', JSON_FILE_KIND],
    ['Markdown', MARKDOWN_FILE_KIND],
  ]) {
    assert.ok(kind.accept.includes(kind.extension), `${label} 的 accept 里没有 ${kind.extension}`)
    assert.ok(kind.mime, `${label} 缺 mime`)
    assert.ok(kind.description, `${label} 缺描述`)
  }

  // 存文件对话框的默认后缀就是它，写错的话存出来是个没有后缀的文件
  assert.equal(MARKDOWN_FILE_KIND.extension, '.md')
  assert.equal(JSON_FILE_KIND.extension, '.json')
})

// AST 那边几个用例要等 loadParser 的动态 import

console.log(`\n工具逻辑冒烟：${passed} 项通过${process.exitCode ? '，有失败项' : ''}`)
