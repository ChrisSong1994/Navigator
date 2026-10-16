import { yamlNodeName, yamlNodeRange } from '../../../parsers/yaml/node.ts'
import type { Range } from '../../../parsers/types.ts'

/**
 * AST 树与「怎么读这棵 AST」之间的适配层。
 *
 * 树本身不认识 babel / jsonc / yaml 的节点长什么样，全靠这里的配置说：
 * 哪些键该藏、哪个节点默认展开、节点对应源码哪一段、节点叫什么名字、子节点怎么遍历。
 *
 * 跟原版比，只有一处结构变化：原版只有 estree / json 两套配置，yaml 走 json 那套，
 * 而 json 那套的名字是 `node.type || node.kind || 'Object'` —— yaml v2 的节点两个字段都没有，
 * 于是每个节点都叫 "Object"。这里给 yaml 单开一套。
 */

export interface Filter {
  key: string
  label: string
  test: (value: any, key: string, fromArray: boolean) => boolean
}

export interface AdapterOptions {
  filters?: Filter[]
  nodeToRange?: (node: any) => Range | undefined
  nodeToName?: (node: any) => string | undefined
  walkNode?: (node: any) => IterableIterator<{ key: string; value: any; computed?: boolean }>
  openByDefault?: (node: any, key: string) => boolean
  locationProps?: Set<string>
}

export class TreeAdapter {
  private _ranges = new WeakMap<object, Range | undefined>()
  private _filterValues: Record<string, boolean>
  private _adapterOptions: AdapterOptions

  constructor(adapterOptions: AdapterOptions, filterValues: Record<string, boolean>) {
    this._filterValues = filterValues
    this._adapterOptions = adapterOptions
  }

  getConfigurableFilters(): Filter[] {
    return (this._adapterOptions.filters || []).filter((filter) => Boolean(filter.key))
  }

  getNodeName(node: any): string | undefined {
    return this._adapterOptions.nodeToName?.(node)
  }

  /** 节点对应的源码区间；算过一次就记在 WeakMap 里（树上每次 render 都会问） */
  getRange(node: any): Range | undefined {
    if (node == null) {
      return undefined
    }
    if (typeof node === 'object' && this._ranges.has(node)) {
      return this._ranges.get(node)
    }

    const range = this._adapterOptions.nodeToRange?.(node)
    if (node && typeof node === 'object') {
      this._ranges.set(node, range)
    }
    return range
  }

  isInRange(node: any, key: string, position: number): boolean {
    if (this.isLocationProp(key) || !Number.isInteger(position)) {
      return false
    }
    const range = this.getRange(node)
    if (!range) {
      return false
    }
    return range[0] <= position && position <= range[1]
  }

  /** 光标落在节点的某个后代里吗 —— 决定这个节点的祖先链要不要自动展开 */
  hasChildrenInRange(node: any, key: string, position: number, seen = new Set<any>()): boolean {
    if (this.isLocationProp(key) || !Number.isInteger(position)) {
      return false
    }
    seen.add(node)
    const range = this.getRange(node)
    if (range && !this.isInRange(node, key, position)) {
      return false
    }

    for (const { value: child, key: childKey } of this.walkNode(node)) {
      if (this.isInRange(child, childKey, position)) {
        return true
      }
    }
    for (const { value: child, key: childKey } of this.walkNode(node)) {
      if (seen.has(child)) {
        continue
      }
      if (this.hasChildrenInRange(child, childKey, position, seen)) {
        return true
      }
    }
    return false
  }

  isLocationProp(key: string): boolean {
    return Boolean(this._adapterOptions.locationProps?.has(key))
  }

  opensByDefault(node: any, key: string): boolean {
    return Boolean(this._adapterOptions.openByDefault?.(node, key))
  }

  isArray(node: any): boolean {
    return Array.isArray(node)
  }

  isObject(node: any): boolean {
    return Boolean(node) && typeof node === 'object' && !this.isArray(node)
  }

  /** 遍历子节点，按开关过滤掉不显示的（隐藏函数 / 空键 / 位置信息 / type 键） */
  *walkNode(node: any): IterableIterator<{ key: string; value: any; computed?: boolean }> {
    if (node == null || !this._adapterOptions.walkNode) {
      return
    }
    for (const result of this._adapterOptions.walkNode(node)) {
      const filtered = (this._adapterOptions.filters || []).some((filter) => {
        if (filter.key && !this._filterValues[filter.key]) {
          return false
        }
        return filter.test(result.value, result.key, Array.isArray(node))
      })
      if (!filtered) {
        yield result
      }
    }
  }
}

/* 过滤器 ------------------------------------------------------------------ */

export function ignoreKeysFilter(keys = new Set<string>(), key: string, label: string): Filter {
  return {
    key,
    label,
    test: (_, k) => keys.has(k),
  }
}

export function locationInformationFilter(keys: Set<string>): Filter {
  return ignoreKeysFilter(keys, 'hideLocationData', '位置信息')
}

export function functionFilter(): Filter {
  return {
    key: 'hideFunctions',
    label: '方法',
    test: (value) => typeof value === 'function',
  }
}

export function emptyKeysFilter(): Filter {
  return {
    key: 'hideEmptyKeys',
    label: '空键',
    test: (value, _, fromArray) => value == null && !fromArray,
  }
}

/** 数组本身没有 type，所以 type 键只在对象里藏（数组的 children 是对象，照样藏里面的） */
export function typeKeysFilter(keys?: Set<string>): Filter {
  return ignoreKeysFilter(keys, 'hideTypeKeys', '类型键')
}

/** 对象上的自有的、可枚举的键，按顺序遍历（原版就是这么走的） */
function* walkOwnProperties(node: any) {
  if (node && typeof node === 'object') {
    for (const prop in node) {
      yield { value: node[prop], key: prop, computed: false }
    }
  }
}

/** 几个 AST 节点的子节点列表天生就该展开着看 */
const OPEN_BY_DEFAULT_KEYS = new Set([
  'body',
  'elements', // 数组字面量
  'declarations', // 变量声明
  'expression', // 表达式语句
])

/**
 * estree 里记录的源码位置的键。
 *
 * 这些键同时也是「位置信息」过滤开关藏掉的那几个键，所以两处共用一个集合。
 * 原版把 locationProps 定义成可选、却从没给任何一套配置填过值，于是
 * `isLocationProp()` 恒为 false、`isInRange()` / `hasChildrenInRange()` 里的那道
 * 判断形同虚设 —— 这里补上（见报告里的「补上失效的 locationProps」）。
 */
const ESTREE_LOCATION_KEYS = new Set(['range', 'loc', 'start', 'end'])

const TreeAdapterConfigs: Record<string, AdapterOptions> = {
  default: {
    filters: [],
    openByDefault: () => false,
    nodeToRange: () => undefined,
    nodeToName: () => undefined,
    walkNode: walkOwnProperties,
  },

  estree: {
    filters: [
      functionFilter(),
      emptyKeysFilter(),
      locationInformationFilter(ESTREE_LOCATION_KEYS),
      typeKeysFilter(new Set(['type'])),
    ],
    locationProps: ESTREE_LOCATION_KEYS,
    openByDefault(node: any, key: string) {
      return node?.type === 'Program' || OPEN_BY_DEFAULT_KEYS.has(key)
    },
    nodeToRange(node: any) {
      if (!node || typeof node !== 'object') {
        return undefined
      }
      if (Array.isArray(node.range)) {
        return [node.range[0], node.range[1]]
      }
      if (typeof node.start === 'number' && typeof node.end === 'number') {
        return [node.start, node.end]
      }
      return undefined
    },
    nodeToName(node: any) {
      return typeof node?.type === 'string' ? node.type : undefined
    },
    walkNode: walkOwnProperties,
  },

  /** jsonc 摊平之后的节点：{type, value, key, children, start, end} */
  json: {
    filters: [
      functionFilter(),
      emptyKeysFilter(),
      locationInformationFilter(new Set(['start', 'end'])),
      typeKeysFilter(new Set(['type'])),
    ],
    locationProps: new Set(['start', 'end']),
    openByDefault: () => false,
    nodeToRange(node: any) {
      if (node && typeof node.start === 'number' && typeof node.end === 'number') {
        return [node.start, node.end]
      }
      return undefined
    },
    nodeToName(node: any) {
      return typeof node?.type === 'string' ? node.type : undefined
    },
    walkNode: walkOwnProperties,
  },

  /** yaml v2 的节点是类实例，名字和区间都从 parsers/yaml/node.ts 拿 */
  yaml: {
    filters: [
      functionFilter(),
      emptyKeysFilter(),
      locationInformationFilter(new Set(['range'])),
      typeKeysFilter(new Set(['type'])),
    ],
    locationProps: new Set(['range']),
    openByDefault(_node: any, key: string) {
      return key === 'contents' || key === 'items'
    },
    nodeToRange: yamlNodeRange,
    nodeToName: yamlNodeName,
    walkNode: walkOwnProperties,
  },
}

/** 读某棵 AST 用哪套配置。多出来的 options 会盖在上面 */
export interface AdapterConfig {
  type: string
  options?: AdapterOptions
}

export function treeAdapterFromConfig(
  config: AdapterConfig,
  filterValues: Record<string, boolean>,
): TreeAdapter {
  const preset = TreeAdapterConfigs[config.type]
  if (!preset) {
    throw new Error(`Unknown tree adapter type "${config.type}"`)
  }
  return new TreeAdapter({ ...preset, ...config.options }, filterValues)
}
