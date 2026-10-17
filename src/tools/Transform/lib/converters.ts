/**
 * 10 个 JSON / YAML / JS Object 互转的转换器，都是上游 pages/Transform 下那 10 个组件的逻辑。
 *
 * 与原版的三处不同：
 *
 * 1. **不再用 `eval`**（`JsObjectToJson` / `JsObjectToTypescript`）：仓库明令不许，MV3 的 CSP 本来也拦。
 *    换成 `json5`（已在依赖里），那两个例子里它给的结果与 `eval` 一致。
 * 2. **出错就抛，由调用方统一处理**。上游除了两个 JS Object 转换器以外一个 `try/catch` 都没有，
 *    而外面 `useEffect(() => handleTransform(value))` 也不接 `.catch` —— 粘一段半截 JSON 就是一条
 *    未处理的 Promise rejection。更别扭的是 `json_typegen_wasm` 的 `run()` **根本不抛**：输入解析不了它
 *    返回一句英文 `"Unable to parse JSON sample"`，上游那个 `try/catch` 是死代码，用户就直接在右边看到
 *    这句英文。这里把那两个哨兵字符串认出来翻成中文（见 TYPEGEN_SENTINELS），`JSON.parse` / `YAML.parse`
 *    / `JSON5.parse` 那三处会漏出来的英文原文也一并包成中文（见 parse.ts）。
 * 3. **WASM 用动态 import**：两个 wasm 加起来 1.7MB，只有选中对应转换器时才需要，没必要在打开工具时就拉。
 */
import YAML from 'yaml'

import { EEditorLanguage } from '../../../components/Editor/index.ts'
import { jsonToGoStruct } from './jsonToGoStruct.ts'
import { jsonToMysql } from './jsonToMysql.ts'
import { kotlinToJava } from './kotlinToJava.ts'
import { parseJsObject, parseJson, parseYaml } from './parse.ts'
import { SAMPLE_JS_OBJECT, SAMPLE_JSON, SAMPLE_YAML } from './sample.ts'

export interface Converter {
  key: string
  label: string
  sourceLang: EEditorLanguage
  targetLang: EEditorLanguage
  /** 输入为空时调用方直接返回空串，不会走到这里；这里一律假定输入非空，失败就抛 */
  run: (input: string) => Promise<string>
  /** 点开这个转换器时输入框里先放什么 */
  sample: string
}

/**
 * `json_typegen_wasm` 的 `run()` 不抛异常，出错时返回这两句英文原文（实测）。
 * 认出来翻成中文，别让用户对着「Local samples disabled」发愣。
 */
export const TYPEGEN_SENTINELS: Record<string, string> = {
  'Unable to parse JSON sample': 'JSON 解析失败',
  'Local samples disabled': '这段内容推导不出结构：空内容，或整份内容只有一个标量值',
}

/** 正常结果原样返回；命中哨兵字符串就抛成错误。单独拆出来是为了能在 check-tools 里直接测它 */
export function readTypegenResult(result: string): string {
  const message = TYPEGEN_SENTINELS[result.trim()]
  if (message) throw new Error(message)
  return result
}

async function runTypegen(input: string, outputMode: string): Promise<string> {
  const { run } = await import('json_typegen_wasm')
  return readTypegenResult(run('Root', input, JSON.stringify({ output_mode: outputMode })))
}

/**
 * gofmt 排版。上游从主入口 import 后用 `init()`，那在 rspack 下能凑合；这里走包自己的 `./vite` 子路径导出，
 * 它把 `gofmt.wasm?init` 接好了，并且**自己也做了记忆化**（`if (wasm !== void 0) return wasm`），
 * 所以这里直接 await 就行，不必再包一层缓存的 promise。
 */
async function gofmt(source: string): Promise<string> {
  const { default: init, format } = await import('@wasm-fmt/gofmt/vite')
  await init()
  return format(source)
}

/**
 * JSON → YAML。上游先用 `jsonlint-mod` 判一次能不能解析、再 `JSON.parse` 解一次，合并成一次。
 * 解析失败时抛的是 `JSON 解析失败：…`，不是 V8 那句英文（见 parse.ts）。
 */
function jsonToYaml(input: string): string {
  return YAML.stringify(parseJson(input))
}

function yamlToJson(input: string): string {
  return JSON.stringify(parseYaml(input), null, 2)
}

/** JS Object → JSON。上游是 `eval('(' + value + ')')` */
function jsObjectToJson(input: string): string {
  return JSON.stringify(parseJsObject(input), null, 2)
}

export const CONVERTERS: Converter[] = [
  {
    key: 'jsonToYaml',
    label: 'JSON 转 YAML',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.YAML,
    sample: SAMPLE_JSON,
    run: async (input) => jsonToYaml(input),
  },
  {
    key: 'jsonToTypescript',
    label: 'JSON 转 TypeScript',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.TYPESCRIPT,
    sample: SAMPLE_JSON,
    run: (input) => runTypegen(input, 'typescript/typealias'),
  },
  {
    key: 'jsonToGo',
    label: 'JSON 转 Go Struct',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.GO,
    sample: SAMPLE_JSON,
    run: async (input) => gofmt(jsonToGoStruct(input)),
  },
  {
    key: 'jsonToJava',
    label: 'JSON 转 Java',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.JAVA,
    sample: SAMPLE_JSON,
    // 上游就是拿 Kotlin 模式出源码、再按行重写成 Java（库本身没有 Java 模式）
    run: async (input) => kotlinToJava(await runTypegen(input, 'kotlin')),
  },
  {
    key: 'jsonToKotlin',
    label: 'JSON 转 Kotlin',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.KOTLIN,
    sample: SAMPLE_JSON,
    run: (input) => runTypegen(input, 'kotlin'),
  },
  {
    key: 'jsonToMysql',
    label: 'JSON 转 MySQL',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.SQL,
    sample: SAMPLE_JSON,
    run: async (input) => jsonToMysql(parseJson(input)),
  },
  {
    key: 'jsonToJsonSchema',
    label: 'JSON 转 JSON Schema',
    sourceLang: EEditorLanguage.JSON,
    targetLang: EEditorLanguage.JSON,
    sample: SAMPLE_JSON,
    run: (input) => runTypegen(input, 'json_schema'),
  },
  {
    key: 'jsObjectToJson',
    label: 'JavaScript Object 转 JSON',
    sourceLang: EEditorLanguage.JAVASCRIPT,
    // 上游这里写的是 GO —— 而它输出的是 JSON.stringify 的结果，右边那块语法着色一直是错的
    targetLang: EEditorLanguage.JSON,
    sample: SAMPLE_JS_OBJECT,
    run: async (input) => jsObjectToJson(input),
  },
  {
    key: 'jsObjectToTypescript',
    label: 'JavaScript Object 转 TypeScript',
    sourceLang: EEditorLanguage.JAVASCRIPT,
    targetLang: EEditorLanguage.TYPESCRIPT,
    sample: SAMPLE_JS_OBJECT,
    run: (input) => runTypegen(jsObjectToJson(input), 'typescript/typealias'),
  },
  {
    key: 'yamlToJson',
    label: 'YAML 转 JSON',
    sourceLang: EEditorLanguage.YAML,
    targetLang: EEditorLanguage.JSON,
    sample: SAMPLE_YAML,
    run: async (input) => yamlToJson(input),
  },
]

export const DEFAULT_CONVERTER_KEY = 'jsonToYaml'

export function findConverter(key: string): Converter | undefined {
  return CONVERTERS.find((converter) => converter.key === key)
}
