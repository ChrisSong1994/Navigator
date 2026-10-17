#!/usr/bin/env node
/**
 * pnpm check:tools
 *
 * 工具箱里各工具纯逻辑的冒烟测试（不需要浏览器）：node scripts/check-tools.mjs
 * JSON 那边覆盖的是「写错一步用户就会看到错东西」的地方：JSON5 兜底、错误行列、转义往返。
 * 颜色那边覆盖的是换算本身（hex / rgb / hsv / hsl / cmyk 往返）与输入框的解析判定。
 * Transform 那边覆盖的是三个能脱离 WASM 单独测的纯函数（JSON→Go、JSON→MySQL、Kotlin→Java）与转换器表本身。
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
import { addHistoryEntry, removeHistoryEntry } from '../src/lib/history.ts'
import { formatTime, isEmpty } from '../src/lib/util.ts'
import { JSON_FILE_KIND } from '../src/tools/Json/lib/kind.ts'
import { MARKDOWN_FILE_KIND } from '../src/tools/Markdown/lib/kind.ts'
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
import { EVENTS, OPEN_STATES, isOpenState, transition } from '../src/tools/AstExplorer/components/visualization/tree/openState.ts'
import { treeAdapterFromConfig } from '../src/tools/AstExplorer/components/visualization/core/TreeAdapter.ts'
import { safeStringify } from '../src/tools/AstExplorer/lib/safeStringify.ts'
import stringify from '../src/tools/AstExplorer/lib/stringify.ts'
import {
  DEFAULT_TREE_SETTINGS,
  TREE_SETTINGS_KEY,
  parseTreeSettings,
} from '../src/tools/AstExplorer/lib/treeSettings.ts'
import { categories, javascript } from '../src/tools/AstExplorer/parsers/index.ts'
import { acorn } from '../src/tools/AstExplorer/parsers/js/acorn.ts'
import { babel } from '../src/tools/AstExplorer/parsers/js/babel.ts'
import { describeJsonError, jsoncParser, normalizeJsonNode } from '../src/tools/AstExplorer/parsers/json/jsonc.ts'
import { yamlNodeName, yamlNodeRange } from '../src/tools/AstExplorer/parsers/yaml/node.ts'
import { yamlParser } from '../src/tools/AstExplorer/parsers/yaml/yaml.ts'
import JSON5 from 'json5'
import YAML from 'yaml'
import { EEditorLanguage } from '../src/components/Editor/index.ts'
import { jsonToGoStruct } from '../src/tools/Transform/lib/jsonToGoStruct.ts'
import { jsonToMysql } from '../src/tools/Transform/lib/jsonToMysql.ts'
import { kotlinToJava } from '../src/tools/Transform/lib/kotlinToJava.ts'
import {
  CONVERTERS,
  DEFAULT_CONVERTER_KEY,
  findConverter,
  readTypegenResult,
} from '../src/tools/Transform/lib/converters.ts'
import { SAMPLE_JSON, SAMPLE_YAML, SAMPLE_JS_OBJECT } from '../src/tools/Transform/lib/sample.ts'
import { parseJsObject, parseJson, parseYaml } from '../src/tools/Transform/lib/parse.ts'

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

/**
 * AST 那边的解析库要走动态 import（浏览器里是 loadParser 的那一下），所以得能 await。
 * 跑完统一等一遍（文件末尾的 await Promise.all(pending)）。
 */
const pending = []
const testAsync = (name, fn) => {
  pending.push(
    (async () => {
      try {
        await fn()
        passed += 1
        console.log(`✓ ${name}`)
      } catch (error) {
        console.error(`✗ ${name}\n  ${error.message}`)
        process.exitCode = 1
      }
    })(),
  )
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

/* AST 工具 ---------------------------------------------------------------- */

test('AST 树的展开状态机：光标、点击、Shift 展开三种事件的去向', () => {
  const { DEFAULT, OPEN, DEEP_OPEN, FOCUS_OPEN, CLOSED } = OPEN_STATES
  const { GAIN_FOCUS, LOOSE_FOCUS, DEEP_OPEN: DEEP } = EVENTS

  // 光标进来 → 自动展开；离开 → 合回去
  assert.equal(transition(CLOSED, GAIN_FOCUS), FOCUS_OPEN)
  assert.equal(transition(FOCUS_OPEN, LOOSE_FOCUS), DEFAULT)

  // 自己点开的（OPEN）不会被光标带走 —— 这一条错了就会「点开一个节点去看源码，回来它自己合上了」
  assert.equal(transition(OPEN, GAIN_FOCUS), OPEN)
  assert.equal(transition(OPEN, LOOSE_FOCUS), OPEN)

  // Shift 展开过的子树是「只进不出」，得再点一下才收
  assert.equal(transition(DEFAULT, DEEP), DEEP_OPEN)
  assert.equal(transition(DEEP_OPEN, LOOSE_FOCUS), DEEP_OPEN)

  assert.equal(isOpenState(DEFAULT, true), true)
  assert.equal(isOpenState(DEFAULT, false), false)
  assert.equal(isOpenState(CLOSED, true), false)
  assert.equal(isOpenState(FOCUS_OPEN, false), true)
  assert.equal(isOpenState(DEEP_OPEN, false), true)
})

test('AST 的 JSON 视图：共享引用照常展开，只有真的环才写 [Circular]', () => {
  // babel 的注释对象、yaml 的锚点都是「同一个对象被多处引用」；
  // 原版把见过的对象全记下来，于是这些在 JSON 面板里全变成 [Circular]
  const shared = { a: 1 }
  assert.equal(
    safeStringify({ first: shared, second: shared }, 0),
    '{"first":{"a":1},"second":{"a":1}}',
  )

  const circular = { name: 'root' }
  circular.self = circular
  assert.equal(safeStringify(circular, 0), '{"name":"root","self":"[Circular]"}')

  const list = [1]
  list.push(list)
  assert.equal(safeStringify(list, 0), '[1,"[Circular]"]')
})

test('AST 树里的标量显示：字符串带引号、数字就是数字、对象不再爆栈', () => {
  assert.equal(stringify('a'), '"a"')
  assert.equal(stringify('说"引号'), JSON.stringify('说"引号'))
  assert.equal(stringify(12), '12')
  assert.equal(stringify(NaN), 'NaN')
  assert.equal(stringify(null), 'null')
  assert.equal(stringify(undefined), 'undefined')
  assert.equal(stringify(true), 'true')
  // 原版这一支写的是 JSON.stringify(value, (k, v) => stringify(v))，一进对象就递归回自己，直接栈溢出
  assert.equal(stringify({ a: 1 }), '{"a":1}')
})

test('AST 树的显示选项：存档坏了 / 缺字段 / 多字段都不能把树带崩', () => {
  assert.equal(TREE_SETTINGS_KEY, 'navigator.ast.treeSettings')

  // 原版读档是直接 JSON.parse，手改坏一次就在 render 里抛异常白屏
  for (const broken of ['{ 这不是 json', '[1,2]', '"123"', 'null', '']) {
    assert.deepEqual(parseTreeSettings(broken), DEFAULT_TREE_SETTINGS, `坏存档 ${broken} 没退回默认值`)
  }

  // 缺字段补默认值，值不是布尔就忽略
  assert.deepEqual(parseTreeSettings('{"autofocus":false}'), {
    ...DEFAULT_TREE_SETTINGS,
    autofocus: false,
  })
  assert.deepEqual(parseTreeSettings('{"autofocus":"no"}'), DEFAULT_TREE_SETTINGS)

  // 正常存档原样还原，不属于显示选项的键丢掉（它们会在下次存档时被写回去）
  const restored = parseTreeSettings(JSON.stringify({ ...DEFAULT_TREE_SETTINGS, hideTypeKeys: true }))
  assert.equal(restored.hideTypeKeys, true)
  assert.deepEqual(Object.keys(restored).sort(), Object.keys(DEFAULT_TREE_SETTINGS).sort())
})

test('树上的「隐藏」开关：每个都真的在过滤它该过滤的东西', () => {
  const adapter = (overrides = {}) =>
    treeAdapterFromConfig({ type: 'estree' }, { ...DEFAULT_TREE_SETTINGS, ...overrides })
  const node = { type: 'Identifier', name: 'a', start: 0, end: 1, extra: null, fn: () => {} }
  const keysOf = (a, value = node) => Array.from(a.walkNode(value), ({ key }) => key)

  // 默认：方法藏起来，别的都显示
  assert.deepEqual(keysOf(adapter()), ['type', 'name', 'start', 'end', 'extra'])
  assert.deepEqual(keysOf(adapter({ hideFunctions: false })), [
    'type',
    'name',
    'start',
    'end',
    'extra',
    'fn',
  ])
  assert.deepEqual(keysOf(adapter({ hideEmptyKeys: true })), ['type', 'name', 'start', 'end'])
  assert.deepEqual(keysOf(adapter({ hideLocationData: true })), ['type', 'name', 'extra'])
  assert.deepEqual(keysOf(adapter({ hideTypeKeys: true })), ['name', 'start', 'end', 'extra'])

  // 数组里的 null 不算「空键」——[1, null] 里的 null 是有意义的元素
  assert.deepEqual(keysOf(adapter({ hideEmptyKeys: true }), [1, null]), ['0', '1'])

  // 每个复选框的键都得在显示选项里，否则存档再读回来会被校验丢掉，开关看着能点其实不生效
  for (const type of ['estree', 'json', 'yaml']) {
    const filters = treeAdapterFromConfig({ type }, DEFAULT_TREE_SETTINGS).getConfigurableFilters()
    assert.equal(filters.length, 4, `${type} 的开关数量变了`)
    for (const filter of filters) {
      assert.ok(filter.key in DEFAULT_TREE_SETTINGS, `${type} 的开关 ${filter.key} 不在显示选项里`)
      assert.ok(filter.label, `${type} 的开关 ${filter.key} 没有文案`)
    }
  }
})

test('estree 适配器：节点区间与「光标落在哪一节点」', () => {
  const code = 'const a = 1\nfoo(a)\n'
  const program = {
    type: 'Program',
    start: 0,
    end: code.length,
    body: [
      { type: 'VariableDeclaration', start: 0, end: 11, range: [0, 11], declarations: [] },
      {
        type: 'ExpressionStatement',
        start: 12,
        end: 18,
        expression: {
          type: 'CallExpression',
          start: 12,
          end: 18,
          callee: { type: 'Identifier', start: 12, end: 15, name: 'foo' },
          arguments: [{ type: 'Identifier', start: 16, end: 17, name: 'a' }],
        },
      },
    ],
  }
  const adapter = treeAdapterFromConfig({ type: 'estree' }, DEFAULT_TREE_SETTINGS)
  const call = program.body[1].expression
  const callee = call.callee

  assert.deepEqual(adapter.getRange(program), [0, code.length])
  assert.deepEqual(adapter.getRange(program.body[0]), [0, 11]) // 有 range 用 range
  assert.deepEqual(adapter.getRange(callee), [12, 15]) // 只有 start/end 就用 start/end
  assert.equal(adapter.getRange({ type: 'Identifier' }), undefined)
  assert.equal(adapter.getRange(null), undefined)

  // 光标在 `foo` 里
  assert.equal(adapter.isInRange(callee, 'callee', 13), true)
  assert.equal(adapter.isInRange(callee, 'callee', 17), false)
  // 位置信息那些键不算命中，否则光标停在 start 那个数字上会把一大片都点亮
  assert.equal(adapter.isLocationProp('start'), true)
  assert.equal(adapter.isLocationProp('callee'), false)
  assert.equal(adapter.isInRange(callee, 'start', 13), false)
  // 没有光标位置（-1）时谁都不命中
  assert.equal(adapter.isInRange(callee, 'callee', -1), false)
  // 光标在 `a` 里：整条祖先链都得认账，树才会顺着展开到那个节点
  assert.equal(adapter.isInRange(program, '', 16), true)
  assert.equal(adapter.hasChildrenInRange(program, '', 16), true)
  assert.equal(adapter.hasChildrenInRange(program, '', 100), false)

  assert.equal(adapter.opensByDefault(program, ''), true) // Program 默认展开
  assert.equal(adapter.opensByDefault(program.body[0], 'body'), true)
  assert.equal(adapter.opensByDefault(callee, 'callee'), false)
})

testAsync('JSON 适配器：jsonc 的节点摊平后带区间，对象不会被当成数组', async () => {
  const jsonc = await jsoncParser.loadParser()
  const code = '{\n  "a": [1, 2]\n}'
  const root = jsoncParser.parse(jsonc, code)

  assert.equal(root.type, 'object')
  assert.deepEqual([root.start, root.end], [0, code.length])
  // 关键：jsonc 自己的 length / offset / parent 都摊掉了。
  // 树是拿「有没有数字 length」判断数组的，留着 length 的话每个对象都会被渲染成 [ ... ]
  for (const dropped of ['length', 'offset', 'parent', 'colonOffset']) {
    assert.equal(dropped in root, false, `摊平后还留着 ${dropped}`)
  }

  const property = root.children[0]
  assert.equal(property.type, 'property')
  assert.equal(property.key.type, 'string')
  assert.equal(property.key.value, 'a')
  assert.equal(property.value.type, 'array')
  // 区间跟源码对得上（源码高亮就靠这个）
  assert.equal(code.slice(property.key.start, property.key.end), '"a"')
  assert.equal(code.slice(property.value.start, property.value.end), '[1, 2]')

  const adapter = treeAdapterFromConfig({ type: 'json' }, DEFAULT_TREE_SETTINGS)
  assert.equal(adapter.getNodeName(property), 'property')
  assert.equal(adapter.isInRange(property, '0', code.indexOf('"a"') + 1), true)
  assert.equal(adapter.isInRange(property, '0', code.indexOf('}')), false)

  // 语法错误要抛出来（jsonc 的 parseTree 自己不抛，红条靠这里）
  assert.throws(() => jsoncParser.parse(jsonc, '{"a": }'), /ValueExpected/)
  // 空内容不是语法错误，返回 null 交给界面显示空状态
  assert.equal(jsoncParser.parse(jsonc, '   '), null)

  // 值写坏了只有 key 一个子节点，别凭空造一个假的 value 出来
  const brokenProperty = normalizeJsonNode(jsonc.parseTree('{"a": }')).children[0]
  assert.deepEqual(Object.keys(brokenProperty).sort(), ['end', 'key', 'start', 'type'])
})

testAsync('JSON 报错：说清是哪一行哪一列', async () => {
  const jsonc = await jsoncParser.loadParser()
  const code = '{\n  "a": ,\n}'
  const errors = []
  jsonc.parseTree(code, errors)

  assert.equal(errors.length > 0, true)
  assert.equal(describeJsonError(errors[0], code), 'ValueExpected（第 2 行 第 8 列）')
})

testAsync('yaml 适配器：v2 的节点没有 type 字段，名字只能靠类型判断', async () => {
  const yaml = await yamlParser.loadParser()
  const code = 'name: &n foo\nlist:\n  - *n\n  - 2\n'
  const document = yamlParser.parse(yaml, code)

  assert.equal(yamlNodeName(document), 'Document')
  assert.equal(yamlNodeName(document.contents), 'YAMLMap')
  const firstPair = document.contents.items[0]
  const list = document.contents.items[1].value
  assert.equal(yamlNodeName(firstPair), 'Pair')
  assert.equal(yamlNodeName(list), 'YAMLSeq')
  assert.equal(yamlNodeName(list.items[0]), 'Alias')
  assert.equal(yamlNodeName(list.items[1]), 'Scalar')
  // Document 上的 options / schema 这些普通对象不给名字
  assert.equal(yamlNodeName({ plain: 1 }), undefined)

  // range 是三段的 [start, valueEnd, nodeEnd]，第三段还带着后面的换行，取前两段才不会多选一截
  const anchored = firstPair.value
  assert.deepEqual(anchored.range.length, 3)
  assert.deepEqual(yamlNodeRange(anchored), [9, 12])
  assert.equal(code.slice(9, 12), 'foo')
  assert.deepEqual(yamlNodeRange(list.items[0]), [23, 25])
  assert.equal(code.slice(23, 25), '*n')
  assert.deepEqual(yamlNodeRange(list.items[1]), [30, 31])
  assert.equal(code.slice(30, 31), '2')
  // Pair 在 yaml v2 上没有 range，它的 key / value 有
  assert.equal(yamlNodeRange(firstPair), undefined)
  assert.deepEqual(yamlNodeRange(firstPair.key), [0, 4])

  const adapter = treeAdapterFromConfig({ type: 'yaml' }, DEFAULT_TREE_SETTINGS)
  assert.equal(adapter.isInRange(anchored, 'value', 10), true)
  assert.equal(adapter.isInRange(anchored, 'value', 20), false)
  assert.equal(adapter.hasChildrenInRange(document, '', 10), true)

  // 语法错误不抛异常，得靠 getErrors 把红条补上；树照常显示已经解析出来的那部分
  const broken = yamlParser.parse(yaml, 'a: [1, 2\n')
  assert.equal(broken.errors.length > 0, true)
  assert.equal(yamlParser.getErrors(broken).length, broken.errors.length)
  assert.equal(yamlParser.getErrors(yamlParser.parse(yaml, 'a: 1\n')).length, 0)

  // 空内容返回 null（不是错误）
  assert.equal(yamlParser.parse(yaml, '\n'), null)
})

testAsync('三个解析器都能真解析：插件表在 Babel 8 上还认', async () => {
  const babelModule = await babel.loadParser()
  const file = babel.parse(babelModule, 'const a = 1\nfoo(a)\n')
  assert.equal(file.type, 'File')
  assert.equal(file.program.type, 'Program')
  assert.equal(babel.getNodeName(file), 'File')
  assert.deepEqual(babel.nodeToRange(file.program.body[0]), [0, 11])
  assert.equal('const a = 1\nfoo(a)\n'.slice(...babel.nodeToRange(file.program.body[0])), 'const a = 1')

  // 插件表里的 typescript / jsx：没生效的话这两段直接抛
  assert.equal(babel.parse(babelModule, 'const a: number = 1\n').program.body[0].type, 'VariableDeclaration')
  assert.equal(
    babel.parse(babelModule, 'const x = <div a="1" />\n').program.body[0].declarations[0].init.type,
    'JSXElement',
  )

  const acornModule = await acorn.loadParser()
  const tree = acorn.parse(acornModule, '// 注释\nconst a = 1\n')
  assert.equal(tree.type, 'Program')
  assert.deepEqual(acorn.nodeToRange(tree.body[0]), [6, 17])
  assert.equal('// 注释\nconst a = 1\n'.slice(6, 17), 'const a = 1')
  // 注释和 token 挂在根上（原版的行为）
  assert.equal(tree.comments.length, 1)
  assert.equal(tree.comments[0].value.trim(), '注释')
  assert.equal(tree.tokens.length > 0, true)

  // 解析不了的代码要抛（界面上就是那条红条）
  assert.throws(() => acorn.parse(acornModule, 'const = 1'), SyntaxError)
  assert.throws(() => babel.parse(babelModule, 'const = 1'))
})

test('三类语言都与适配器对得上', () => {
  assert.deepEqual(
    categories.map((category) => category.id),
    ['javascript', 'json', 'yaml'],
  )
  assert.equal(javascript.parsers.map((parser) => parser.id).join(), 'babel,acorn')

  for (const category of categories) {
    assert.equal(category.parsers.length > 0, true, `${category.id} 没有解析器`)
    assert.ok(category.codeExample, `${category.id} 缺示例代码`)
    // 示例代码一进来就摆进编辑器，得能真的解析出来
    assert.ok(category.codeExample.trim().length > 0)
    // 语言换了编辑器词法也得跟着换（原版这里写死 javascript，JSON/YAML 是按 JS 高亮的）
    for (const parser of category.parsers) {
      assert.ok(parser.editorLanguage, `${parser.id} 没配编辑器语言`)
    }
    // 页面是按这个规则挑适配器的（index.tsx 的 adapterTypeFor）
    const type = category.id === 'javascript' ? 'estree' : category.id
    assert.doesNotThrow(() => treeAdapterFromConfig({ type }, DEFAULT_TREE_SETTINGS))
    // 不认识的适配器名要当场喊出来，而不是默默渲染出一棵空树
    assert.throws(() => treeAdapterFromConfig({ type: '没有这个' }, DEFAULT_TREE_SETTINGS), /Unknown tree adapter/)
  }
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

// --- Transform：JSON / YAML / JS Object 互转 ---------------------------------

/** 上游 JsonToJava 是「先让 json_typegen 出 Kotlin，再按行重写成 Java」，这段是它真实的 Kotlin 输出 */
const KOTLIN_SAMPLE = `data class Root(
    val name: String,
    val age: Long,
    val isStudent: Boolean,
    val hobbies: List<String>,
    val address: Address,
)

data class Address(
    val city: String,
    val country: String,
)
`

/**
 * 能直接在 node 里跑的转换器。另外四个走 WASM，而那两个库是给打包器用的（没有 exports / main 字段），
 * 在 node 里 import 本身就失败 —— 拿它们做断言只会「因为别的原因抛错」而恒过，等于没测。
 * WASM 那四个交给浏览器那两套 CDP 用例。
 */
const NODE_SAFE_CONVERTERS = ['jsonToYaml', 'jsonToGo', 'jsonToMysql', 'jsObjectToJson', 'yamlToJson']

test('JSON 转 Go Struct：示例的逐字输出（含嵌套结构与字段名）', () => {
  assert.equal(
    jsonToGoStruct(SAMPLE_JSON),
    [
      'type Root struct {',
      '  Name string `json:"name"`',
      '  Age int `json:"age"`',
      '  Is_student bool `json:"isStudent"`',
      '  Hobbies []string `json:"hobbies"`',
      '  Address struct {',
      '  City string',
      '  Country string',
      '} `json:"address"`',
      '}',
      '',
      'type AddressStruct struct {',
      '  City string `json:"city"`',
      '  Country string `json:"country"`',
      '}',
    ].join('\n'),
  )

  // 类型推导：null → interface{}、整数 → int、小数 → float64、混合数组 → 合并后的元素类型
  assert.equal(
    jsonToGoStruct('{"a":null,"b":1.5,"c":[1,"x"]}'),
    [
      'type Root struct {',
      '  A interface{} `json:"a"`',
      '  B float64 `json:"b"`',
      '  C []string `json:"c"`',
      '}',
    ].join('\n'),
  )

  assert.equal(jsonToGoStruct('{}'), 'type Root struct {\n}')
})

test('JSON 转 Go Struct：根节点不是对象时给错误，而不是上游那样 TypeError 崩掉', () => {
  // 上游把推导结果硬当 StructType 用，这两种合法 JSON 会去读 undefined.fields
  assert.throws(() => jsonToGoStruct('[{ "a": 1 }]'), /根节点不是对象/)
  assert.throws(() => jsonToGoStruct('5'), /根节点不是对象/)
})

test('JSON 转 MySQL：与 generate-schema 的输出逐字一致（含子表与主外键）', () => {
  assert.equal(
    jsonToMysql(JSON.parse(SAMPLE_JSON)),
    [
      'CREATE TABLE generic (',
      '  id TEXT,',
      '  name TEXT,',
      '  age INT,',
      '  isStudent BOOLEAN,',
      '  PRIMARY KEY (id)',
      ');',
      '',
      'CREATE TABLE generic_hobbies (',
      '  generic_id TEXT,',
      '  id TEXT,',
      '  value TEXT,',
      '  PRIMARY KEY (id),',
      '  FOREIGN KEY (generic_id) REFERENCES generic(id)',
      ');',
      '',
      'CREATE TABLE generic_address (',
      '  generic_id TEXT,',
      '  id TEXT,',
      '  city TEXT,',
      '  country TEXT,',
      '  PRIMARY KEY (id),',
      '  FOREIGN KEY (generic_id) REFERENCES generic(id)',
      ');',
    ].join('\n'),
  )
})

test('JSON 转 MySQL：null 字段不能再把整个转换炸掉，查不到映射的类型退化成 TEXT', () => {
  // generate-schema 的 isTimestamp(null) 会读 null.length 直接抛：整份 JSON 里只要有一个 null 就转不出来
  assert.equal(
    jsonToMysql(JSON.parse('{"a":null,"b":2}')),
    ['CREATE TABLE generic (', '  id TEXT,', '  a TEXT,', '  b INT,', '  PRIMARY KEY (id)', ');'].join(
      '\n',
    ),
  )

  // type-of-is 对 Map 给出 'map'，映射表里没有，上游会把 undefined 拼进 SQL（`  m undefined,`）
  assert.match(jsonToMysql({ m: new Map([['k', 1]]) }), /^ {2}m TEXT,$/m)
})

test('Kotlin 转 Java：字段 / 构造函数 / 读写器与泛型都对上', () => {
  const java = kotlinToJava(KOTLIN_SAMPLE)

  assert.equal((java.match(/^public class /gm) ?? []).length, 2)
  assert.ok(java.includes('public class Root {'))
  assert.ok(java.includes('\tprivate String name;'))
  assert.ok(java.includes('\tprivate List<String> hobbies;'))
  // 构造函数把字段按顺序收全
  assert.ok(
    java.includes(
      '\tpublic Root(String name, Long age, Boolean isStudent, List<String> hobbies, Address address) {',
    ),
  )
  assert.ok(java.includes('\t\tthis.address = address;'))
  assert.ok(java.includes('\tpublic String getName() {'))
  assert.ok(java.includes('\tpublic void setAddress(Address address) {'))
  assert.ok(java.includes('public class Address {'))
  // 重写完不该再有 Kotlin 的痕迹
  assert.ok(!java.includes('data class'))
  assert.ok(!java.includes('val '))
})

test('Kotlin 转 Java：单个类 / typealias / import 的逐字输出（硬编码下标那块别再漂）', () => {
  assert.equal(
    kotlinToJava('data class A(\n    val x: String,\n)\n'),
    [
      'public class A {',
      '\tprivate String x;',
      '',
      '\tpublic A(String x) {',
      '\t\tthis.x = x;',
      '\t}',
      '',
      '\tpublic String getX() {',
      '\t\treturn this.x;',
      '\t}',
      '',
      '\tpublic void setX(String x) {',
      '\t\tthis.x = x;',
      '\t}',
      '}',
      '',
      '',
    ].join('\n'),
  )

  assert.equal(
    kotlinToJava('typealias Root = List<Long>;\n'),
    [
      'public class Root {',
      '\tprivate List<Long> root;',
      '',
      '\tpublic Root(List<Long> root) {',
      '\t\tthis.root = root;',
      '\t}',
      '',
      '\tpublic List<Long> getRoot() {',
      '\t\treturn this.root;',
      '\t}',
      '',
      '\tpublic void setRoot(List<Long> root) {',
      '\t\tthis.root = root;',
      '\t}',
      '',
      '}',
      '',
      '',
    ].join('\n'),
  )

  // Kotlin 的 <Any>? 与 import 结尾的分号
  const withImport = kotlinToJava(
    'import kotlin.collections.List\ndata class A(\n    val xs: List<Any>?,\n)\n',
  )
  assert.ok(withImport.startsWith('import kotlin.collections.List;\n'))
  assert.ok(withImport.includes('\tprivate List<?> xs;'))
})

test('json_typegen 的失败是两句英文原文而不是异常，得翻成错误', () => {
  assert.equal(readTypegenResult('export type Root = {};\n'), 'export type Root = {};\n')
  assert.throws(() => readTypegenResult('Unable to parse JSON sample'), /JSON 解析失败/)
  assert.throws(() => readTypegenResult('Local samples disabled'), /推导不出结构/)
})

test('转换器表：10 个都在、key 不重、实现与示例齐全、默认那个选得出来', () => {
  assert.equal(CONVERTERS.length, 10)
  assert.equal(new Set(CONVERTERS.map((item) => item.key)).size, 10)
  assert.equal(DEFAULT_CONVERTER_KEY, 'jsonToYaml')
  assert.ok(findConverter(DEFAULT_CONVERTER_KEY))

  for (const converter of CONVERTERS) {
    assert.ok(converter.label, `${converter.key} 缺 label`)
    assert.equal(typeof converter.run, 'function', `${converter.key} 缺 run`)
    assert.ok(converter.sample, `${converter.key} 缺 sample`)
    assert.ok(converter.sourceLang, `${converter.key} 缺 sourceLang`)
    assert.ok(converter.targetLang, `${converter.key} 缺 targetLang`)
  }

  // 上游把「JavaScript Object 转 JSON」的输出语言写成了 GO，右边那块编辑器的着色因此一直是错的
  assert.equal(findConverter('jsObjectToJson').targetLang, EEditorLanguage.JSON)
  assert.equal(findConverter('jsObjectToJson').sourceLang, EEditorLanguage.JAVASCRIPT)
  // 输出是 JSON 的就得选 JSON，别再有第二处写歪
  assert.equal(findConverter('yamlToJson').targetLang, EEditorLanguage.JSON)
  assert.equal(findConverter('jsonToJsonSchema').targetLang, EEditorLanguage.JSON)
})

test('JS Object 两个转换器：上游的 eval 例子用 json5 也能解（单引号 / 无引号键 / 尾逗号）', () => {
  assert.deepEqual(JSON5.parse(SAMPLE_JS_OBJECT), {
    title: { type: 'String', trim: true, index: true, required: true },
    year: { type: 'Number', max: 2012, validate: 'validateBookYear' },
    author: { type: 'ObjectId', ref: 'Author', index: true, required: true },
  })

  // eval 能解、JSON.parse 不能解的写法
  assert.deepEqual(JSON5.parse("{ a: 1, b: 'x', c: [1, 2,], }"), { a: 1, b: 'x', c: [1, 2] })
})

test('YAML 往返：字符串 / 数字 / 布尔 / 数组 / 嵌套对象都不变形', () => {
  const value = JSON.parse(SAMPLE_JSON)
  assert.deepEqual(YAML.parse(YAML.stringify(value)), value)
  assert.deepEqual(JSON.parse(JSON.stringify(YAML.parse(SAMPLE_YAML), null, 2)), value)
})

test('解析器报错：三个都包成中文开头，YAML 那句只留第一行', () => {
  assert.throws(() => parseJson('{"a":}'), /^Error: JSON 解析失败：/)
  assert.throws(() => parseJson('{"a":'), /^Error: JSON 解析失败：/)
  // 英文原文里的细节要留着，不然用户不知道错在哪
  assert.throws(() => parseJson('{"a":}'), /Unexpected token/)

  // YAML 的报错是多行，后面几行是出错位置的源码快照，铺到那行提示上会撑成好几行
  const yamlError = (() => {
    try {
      parseYaml('a: [1,')
    } catch (error) {
      return error
    }
    return null
  })()
  assert.ok(yamlError, 'YAML 解析失败没有抛错')
  assert.match(yamlError.message, /^YAML 解析失败：/)
  assert.ok(!yamlError.message.includes('\n'), `YAML 的报错里还有换行：${yamlError.message}`)
  assert.ok(yamlError.cause, '原始错误应该挂在 cause 上')

  assert.throws(() => parseJsObject("title: { type: 'String'"), /^Error: JavaScript 对象解析失败：/)

  // JSON→Go 那条路也要是中文，别漏出 V8 的英文原文
  assert.throws(() => jsonToGoStruct('{"a":'), /^Error: JSON 解析失败：/)
})

for (const key of NODE_SAFE_CONVERTERS) {
  testAsync(`非法输入要抛错：${key}`, async () => {
    await assert.rejects(
      () => findConverter(key).run('{ 这不是 JSON 也不是 YAML'),
      (error) => {
        assert.ok(error instanceof Error, '抛的得是 Error')
        assert.ok(error.message, '错误信息不能为空')
        // 那行提示是要给人看的，不能漏出 V8 / js-yaml / JSON5 的英文原文
        assert.match(error.message, /[一-龥]/, `${key} 的错误信息里没有中文：${error.message}`)
        return true
      },
    )
  })
}

// AST 那边几个用例要等 loadParser 的动态 import
await Promise.all(pending)

console.log(`\n工具逻辑冒烟：${passed} 项通过${process.exitCode ? '，有失败项' : ''}`)
