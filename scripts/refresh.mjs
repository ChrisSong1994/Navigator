#!/usr/bin/env node
/**
 * pnpm refresh
 *
 * 解析 global_original.json5 → 校验配置格式 → 规范化 → 写入 src/global_runtime.json
 *
 *   pnpm refresh           写入（有变化时提示）
 *   pnpm refresh --check   只校验并与 src/global_runtime.json 比对，不一致时以非 0 退出（CI 用）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'
// Node 原生类型擦除，脚本与前端共用同一份校验逻辑
import { describeIssue, parseConfig, serializeConfig } from '../src/config/schema.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'global_original.json5')
const targetPath = resolve(root, 'src/global_runtime.json')
const checkOnly = process.argv.includes('--check')
const rel = (path) => relative(root, path)

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(sourcePath)) fail(`✗ 找不到源配置 ${rel(sourcePath)}`)

let raw
try {
  raw = JSON5.parse(readFileSync(sourcePath, 'utf8'))
} catch (error) {
  fail(`✗ ${rel(sourcePath)} 不是合法的 JSON5：${error.message}`)
}

const { config, issues, errors } = parseConfig(raw)
const warns = issues.filter((issue) => issue.level === 'warn')

for (const issue of issues) console.warn(describeIssue(issue))

if (errors.length > 0) {
  fail(`\n✗ 配置校验失败，共 ${errors.length} 处错误，未生成 ${rel(targetPath)}`)
}

const output = `${serializeConfig(config)}\n`
const groupCount = Object.keys(config.groups).length
const linkCount = Object.values(config.groups).reduce((total, group) => total + group.links.length, 0)
const sizeKb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1)
const summary = `配置校验通过：${groupCount} 个分组 / ${linkCount} 条链接 / ${sizeKb} KB${warns.length ? `（${warns.length} 条警告）` : ''}`

const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null

if (checkOnly) {
  if (current !== output) {
    fail(`\n✗ ${summary}\n  但 ${rel(targetPath)} 未同步，请在本地执行 pnpm refresh 并提交。`)
  }
  console.log(`✓ ${summary}，${rel(targetPath)} 已是最新。`)
  process.exit(0)
}

if (current === output) {
  console.log(`✓ ${summary}，${rel(targetPath)} 无变化。`)
  process.exit(0)
}

writeFileSync(targetPath, output, 'utf8')
console.log(`✓ ${summary}\n  ${rel(sourcePath)} → ${rel(targetPath)} 已更新。`)
