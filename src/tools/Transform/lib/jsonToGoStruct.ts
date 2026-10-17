/**
 * JSON → Go struct 的推导与生成。上游 developer-assistant/pages/Transform/utils/jsonToGoStruct.ts 原样搬来。
 *
 * 上游那份开头挂着 `// @ts-nocheck`，因为 `mergeTypes` 里在没把 `string` 排除掉的时候就访问 `type1.type`。
 * 这里补一句 narrowing（`typeof type1 === 'string' || typeof type2 === 'string'` → `interface{}`）把类型接上，
 * 行为不变：上游走到那个分支时 `undefined === 'struct'` 也是假，最后同样返回 `interface{}`。
 *
 * 另外上游在 catch 里 `console.error` 完又把错误抛回去 —— 只打日志不处理，那就别 catch，让它直接冒到调用方
 * （调用方统一把失败变成「输出清空 + 一行提示」）。
 *
 * code from 豆包
 */
import { parseJson } from './parse.ts'

type GoType =
  | 'string'
  | 'int'
  | 'int64'
  | 'float64'
  | 'bool'
  | 'interface{}'
  | StructType
  | ArrayType
  | MapType

interface StructType {
  type: 'struct'
  fields: Field[]
}

interface ArrayType {
  type: 'array'
  elementType: GoType
}

interface MapType {
  type: 'map'
  keyType: 'string'
  valueType: GoType
}

interface Field {
  name: string
  originalName: string
  type: GoType
  tags?: string[]
}

export interface JsonToGoStructOptions {
  rootStructName?: string
  snakeCaseFields?: boolean
  addJSONTags?: boolean
  addXMLTags?: boolean
  addYAMLTags?: boolean
  /**
   * 接了但不起作用 —— 上游这个参数从 `jsonToGoStruct` 一路传到 `renderGoType`，可 `renderGoType` 里
   * 除了继续往下传之外一次都没用过（没有任何指针逻辑），等于一个死参数。这里保留在签名里（上游的调用方
   * 都传得到），但不再往下穿，免得留一堆「只在递归里用一次」的参数。
   */
  usePointersForOptionalFields?: boolean
  useCustomTypeMap?: Record<string, string>
}

type RenderOptions = {
  snakeCaseFields: boolean
  addJSONTags: boolean
  addXMLTags: boolean
  addYAMLTags: boolean
}

export function jsonToGoStruct(jsonString: string, options: JsonToGoStructOptions = {}): string {
  const {
    rootStructName = 'Root',
    snakeCaseFields = true,
    addJSONTags = true,
    addXMLTags = false,
    addYAMLTags = false,
    useCustomTypeMap = {},
  } = options

  const jsonData = parseJson(jsonString)
  const rootType = inferType(jsonData, useCustomTypeMap)

  // 上游在这里把推导结果硬当成 StructType 用（`as StructType`），根节点是数组或标量时
  // `generateGoCode` 读 `.fields` 会直接 TypeError 崩掉 —— 而 `[1,2,3]` 是完全合法的 JSON。
  // 这里给一句说得清的错误。要给数组根也生成类型是另一件事（`type Root []RootItem` 这类），
  // 属于扩功能，不在这轮迁移里顺手发明。
  if (!isStructType(rootType)) {
    throw new Error('根节点不是对象：这份内容推导不出 Go struct（顶层需要是 {...}）')
  }

  return generateGoCode(rootType, rootStructName, {
    snakeCaseFields,
    addJSONTags,
    addXMLTags,
    addYAMLTags,
  })
}

function inferType(data: unknown, customTypeMap: Record<string, string>): GoType {
  if (data === null || data === undefined) {
    return 'interface{}'
  }

  switch (typeof data) {
    case 'string':
      return 'string'
    case 'number':
      return Number.isInteger(data) ? 'int' : 'float64'
    case 'boolean':
      return 'bool'
    case 'object':
      return Array.isArray(data)
        ? inferArrayType(data, customTypeMap)
        : inferStructType(data as Record<string, unknown>, customTypeMap)
    default:
      return 'interface{}'
  }
}

function inferArrayType(arr: unknown[], customTypeMap: Record<string, string>): ArrayType {
  if (arr.length === 0) {
    return { type: 'array', elementType: 'interface{}' }
  }

  const elementTypes = arr.map((item) => inferType(item, customTypeMap))
  return { type: 'array', elementType: findCommonType(elementTypes) }
}

function findCommonType(types: GoType[]): GoType {
  if (types.length === 0) {
    return 'interface{}'
  }

  let commonType = types[0]

  for (let i = 1; i < types.length; i++) {
    commonType = mergeTypes(commonType, types[i])
  }

  return commonType
}

function mergeTypes(type1: GoType, type2: GoType): GoType {
  if (type1 === type2) {
    return type1
  }

  // 基础类型按「谁更宽就取谁」合并；两边都是字符串才走这张表
  if (typeof type1 === 'string' && typeof type2 === 'string') {
    const basicTypes: Record<string, number> = {
      'interface{}': 0,
      string: 1,
      bool: 2,
      float64: 3,
      int: 4,
    }
    return basicTypes[type1] < basicTypes[type2] ? type1 : type2
  }

  // 一边是基础类型一边是复合类型：合不出共同类型（上游走到下面几个分支也都是假，结果一样）
  if (typeof type1 === 'string' || typeof type2 === 'string') {
    return 'interface{}'
  }

  if (type1.type === 'struct' && type2.type === 'struct') {
    const mergedFields: Field[] = []
    const allFieldNames = new Set([
      ...type1.fields.map((f) => f.originalName),
      ...type2.fields.map((f) => f.originalName),
    ])

    allFieldNames.forEach((fieldName) => {
      const field1 = type1.fields.find((f) => f.originalName === fieldName)
      const field2 = type2.fields.find((f) => f.originalName === fieldName)

      if (field1 && field2) {
        mergedFields.push({ ...field1, type: mergeTypes(field1.type, field2.type) })
      } else if (field1) {
        mergedFields.push(field1)
      } else if (field2) {
        mergedFields.push(field2)
      }
    })

    return { type: 'struct', fields: mergedFields }
  }

  if (type1.type === 'array' && type2.type === 'array') {
    return { type: 'array', elementType: mergeTypes(type1.elementType, type2.elementType) }
  }

  if (type1.type === 'map' && type2.type === 'map') {
    return { type: 'map', keyType: 'string', valueType: mergeTypes(type1.valueType, type2.valueType) }
  }

  return 'interface{}'
}

function inferStructType(obj: Record<string, unknown>, customTypeMap: Record<string, string>): StructType {
  const fields: Field[] = []

  for (const [key, value] of Object.entries(obj)) {
    fields.push({
      name: toCamelCase(key),
      originalName: key,
      type: inferType(value, customTypeMap),
    })
  }

  return { type: 'struct', fields }
}

/** `GoType` 里那三个复合类型要先过这一关才能访问 `.type`（`GoType` 还包含几个字符串字面量） */
function isStructType(goType: GoType): goType is StructType {
  return typeof goType !== 'string' && goType.type === 'struct'
}

function generateGoCode(structType: StructType, structName: string, options: RenderOptions): string {
  let code = `type ${structName} struct {\n`

  structType.fields.forEach((field) => {
    const fieldName = options.snakeCaseFields ? toSnakeCase(field.name) : field.name
    const fieldType = renderGoType(field.type)
    const tags = generateTags(field.originalName, options)

    code += `  ${capitalizeFirstLetter(fieldName)} ${fieldType} ${tags}\n`
  })

  code += '}\n\n'

  structType.fields.forEach((field) => {
    if (isStructType(field.type)) {
      const nestedStructName = capitalizeFirstLetter(field.name) + 'Struct'
      code += generateGoCode(field.type, nestedStructName, options)
    }
  })

  return code.trim()
}

function renderGoType(goType: GoType): string {
  if (typeof goType === 'string') {
    return goType
  }

  switch (goType.type) {
    case 'struct': {
      const inner = goType.fields
        .map((field) => `  ${capitalizeFirstLetter(field.name)} ${renderGoType(field.type)}`)
        .join('\n')
      return 'struct {\n' + inner + '\n}'
    }
    case 'array': {
      return `[]${renderGoType(goType.elementType)}`
    }
    case 'map': {
      return `map[string]${renderGoType(goType.valueType)}`
    }
    default:
      return 'interface{}'
  }
}

function generateTags(
  fieldName: string,
  options: { addJSONTags: boolean; addXMLTags: boolean; addYAMLTags: boolean },
): string {
  const tags: string[] = []

  if (options.addJSONTags) tags.push(`json:"${fieldName}"`)
  if (options.addXMLTags) tags.push(`xml:"${fieldName}"`)
  if (options.addYAMLTags) tags.push(`yaml:"${fieldName}"`)

  return tags.length > 0 ? '`' + tags.join(' ') + '`' : ''
}

function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (m) => m.toLowerCase())
}

function toSnakeCase(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, '')
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
