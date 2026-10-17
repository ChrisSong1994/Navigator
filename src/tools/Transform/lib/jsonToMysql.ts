/**
 * JSON → MySQL DDL。上游用的是 `generate-schema@2.6.0` 的 `gs.mysql()`，但整包只为这一个函数，
 * 就把它 `src/schemas/mysql.js` 与 `src/utils.js` 的逻辑抄进来（决定：不加这个依赖）。
 *
 * 抄的时候动了两处：
 *
 * 1. 上游依赖 `type-of-is` 的 `Type.string(v).toLowerCase()`：拿 `Object.prototype.toString` 的
 *    `[object Xxx]` 取 `Xxx`，自定义类的实例则回落到 `constructor.name`。这里内联成 `typeNameOf`。
 * 2. 上游的 `obj[nkey] = obj[keys[i]]; keys[i] = nkey` 是句空操作（`nkey` 就是 `keys[i]`，赋值前后一模一样），
 *    已实测入参不会被改写，抄进来时直接去掉。
 *
 * 另外补了一个上游会漏的口子：`types` 表里没有的类型（比如 `Map`，`typeNameOf` 会给出 `'map'`）取不到映射，
 * 上游会把这个 `undefined` 直接拼进 SQL（`  key undefined,`）。这里退化成 `TEXT`。
 *
 * 行为以「对同一份输入与上游逐字一致」为准，见 scripts/check-tools.mjs。
 */

/** 上游 utils.js 的 isTimestamp：字符串够长且能被 Date 解出来就当时间戳 */
function isTimestamp(value: unknown): boolean {
  return (
    typeof value === 'string' && value.length > 18 && !Number.isNaN(new Date(value).getTime())
  )
}

/**
 * 上游 `Type.string(value).toLowerCase()`。Date 不走这里（上游在调用前单判），
 * 自定义类的实例取构造函数名（上游就是这行为，虽然它会给出一堆表里没有的类型）。
 */
function typeNameOf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  const builtIn = Object.prototype.toString.call(value).slice(8, -1)
  const constructor = (value as { constructor?: { name?: string } }).constructor
  const isBuiltIn =
    constructor === Object ||
    constructor === Function ||
    constructor === Array ||
    constructor === String ||
    constructor === Boolean ||
    constructor === Number ||
    constructor === Date ||
    constructor === RegExp ||
    constructor === Error

  if (constructor && !isBuiltIn && constructor.name) return constructor.name.toLowerCase()
  return builtIn.toLowerCase()
}

/** 上游那张类型映射表，照抄 */
const TYPES: Record<string, string> = {
  boolean: 'BOOLEAN',
  string: 'TEXT',
  number: 'INT',
  date: 'DATE',
  timestamp: 'TIMESTAMP',
  regexp: 'TEXT',
  undefined: 'TEXT',
  null: 'TEXT',
}

/** 映射表里没有的类型（上游会拼出 `undefined`），退化成 TEXT */
function columnTypeOf(type: string): string {
  return TYPES[type] ?? 'TEXT'
}

const lang = {
  create: (name: string) => ['CREATE TABLE ', name, ' ('].join(''),
  close: () => ');',
  id: (name: string, value: string) => ['  ', name, '_id ', value, ','].join(''),
  property: (name: string, value: string) => ['  ', name, ' ', value, ','].join(''),
  primary: (id: string) => ['  PRIMARY KEY (', id, '),'].join(''),
  foreign: (key1: string, table: string, key2: string) =>
    ['  FOREIGN KEY (', key1, ') REFERENCES ', table, '(', key2, '),'].join(''),
}

interface ProcessOptions {
  tableName: string
  parentTableName?: string
  parentTableId?: string
  parentTableIdType?: string
}

function processObject(obj: Record<string, unknown>, options: ProcessOptions): string[] {
  const {
    tableName: name,
    parentTableName: parent,
    parentTableId: parentId,
    parentTableIdType: parentIdType,
  } = options

  const keys = Object.keys(obj)
  const output: string[] = []
  const tables: string[] = []

  // 认主键：键名是 id 或含 _id 的都算，多个命中时后一个赢（上游就是这行为）
  let id = ''
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (lower === 'id' || lower.indexOf('_id') > -1) id = key
  }

  // JS 的 typeof 结果（'string' / 'number' …），后面交给 columnTypeOf 查表
  let idType: string = id ? typeof obj[id] : 'string'

  output.push(lang.create(name))

  if (parent && parentId) {
    output.push(lang.property(`${parent}_${parentId}`, columnTypeOf(parentIdType ?? '')))
  }

  if (!id) {
    id = 'id'
    idType = parentIdType ?? idType
    output.push(lang.property(id, columnTypeOf(idType)))
  }

  for (const key of keys) {
    const value = obj[key]
    let type = value instanceof Date ? 'date' : typeNameOf(value)

    if (type !== 'undefined') {
      type = isTimestamp(value) ? 'timestamp' : type
    }

    if (type === 'function') continue

    // 普通对象：另起一张子表
    if (type === 'object' && !(value as unknown[]).length) {
      tables.push('')
      tables.push(
        processObject(value as Record<string, unknown>, {
          parentTableName: name,
          parentTableId: id,
          parentTableIdType: idType,
          tableName: `${name}_${key}`,
        }).join('\n'),
      )
      continue
    }

    // 数组：元素是对象就按第一个元素建表，否则建一张只有 value 的表
    if (type === 'object' || type === 'array') {
      const first = (value as unknown[])[0]
      const subObject: Record<string, unknown> =
        typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : { value: typeof first }

      tables.push('')
      tables.push(
        processObject(subObject, {
          parentTableName: name,
          parentTableId: id,
          parentTableIdType: idType,
          tableName: `${name}_${key}`,
        }).join('\n'),
      )
      continue
    }

    output.push(lang.property(key, columnTypeOf(type)))
  }

  output.push(lang.primary(id))

  if (parent && parentId) {
    output.push(lang.foreign(`${parent}_id`, parent, parentId))
  }

  // 最后一行（主键或外键）是带逗号的，去掉
  const last = output[output.length - 1]
  output[output.length - 1] = last.slice(0, last.length - 1)

  output.push(lang.close())

  return output.concat(tables)
}

/**
 * 上游导出的签名是 `Process(tableName, object)`，第一个参数不是字符串时整体前移、表名回落 `generic`。
 * 这里只留后者（工具里表名一直是 `generic`），调用点少一次判断。
 */
export function jsonToMysql(value: unknown, tableName = 'generic'): string {
  return processObject(value as Record<string, unknown>, { tableName }).join('\n')
}
