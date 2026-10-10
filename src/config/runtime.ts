/** 运行时内置配置：唯一与打包 JSON 相关的地方 */
import rawRuntimeConfig from '../global_runtime.json'
import { DEFAULT_CONFIG, parseConfig } from './schema.ts'
import type { NavConfig } from './schema.ts'

/** 由 pnpm refresh 生成，若为 {} 之类的空内容则退回默认配置 */
export const RUNTIME_CONFIG: NavConfig = parseConfig(rawRuntimeConfig).config ?? DEFAULT_CONFIG
