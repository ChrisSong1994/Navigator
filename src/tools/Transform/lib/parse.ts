/**
 * 三个解析器的报错都是英文原文，直接铺到右边那行错误提示上就是中英混排：
 *
 *   Unexpected token '}', "{"a":}" is not valid JSON
 *   Flow sequence in block collection must be sufficiently indented and end with a ] at line 1, column 7:
 *   JSON5: invalid character 'i' at 1:2
 *
 * 统一在开头加一句中文，细节原样留着方便定位。
 */
import JSON5 from 'json5'
import YAML from 'yaml'

/** YAML 的报错是多行（后面几行是出错位置的源码快照），只留第一行 */
function firstLine(message: string): string {
  return message.split('\n')[0].trim()
}

/** 接 `unknown` 而不是 `Error`：`JSON.parse` 抛的是 `SyntaxError`，但代码里没有跨 realm 的顾虑 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (error) {
    throw new Error(`JSON 解析失败：${firstLine(reasonOf(error))}`, { cause: error })
  }
}

export function parseYaml(input: string): unknown {
  try {
    return YAML.parse(input)
  } catch (error) {
    throw new Error(`YAML 解析失败：${firstLine(reasonOf(error))}`, { cause: error })
  }
}

export function parseJsObject(input: string): unknown {
  try {
    return JSON5.parse(input)
  } catch (error) {
    throw new Error(`JavaScript 对象解析失败：${firstLine(reasonOf(error))}`, { cause: error })
  }
}
