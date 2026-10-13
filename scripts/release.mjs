#!/usr/bin/env node
/**
 * pnpm release [major|minor|patch|x.y.z]
 *
 * 更新 public/manifest.json 的版本号，提交版本变更，创建同版本的
 * vX.Y.Z Git tag，并推送当前分支和 tag。
 *
 * 示例：
 *   pnpm release                  # patch：0.0.3 → 0.0.4
 *   pnpm release minor            # 0.0.3 → 0.1.0
 *   pnpm release 1.2.0            # 指定版本
 *   pnpm release patch --dry-run  # 只打印计划，不修改或推送
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'public/manifest.json')
const remote = 'origin'
const maxChromeVersionPart = 65535

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function runGit(args, { capture = false, timeout } = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    timeout,
  })
}

function tryGit(args, options) {
  try {
    return { ok: true, output: runGit(args, { capture: true, ...options }).trim() }
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
      error,
    }
  }
}

function parseVersion(value, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value)
  if (!match) fail(`${label} 必须是 X.Y.Z 格式，当前值为 "${value}"`)

  const parts = match.slice(1).map(Number)
  if (parts.some((part) => part > maxChromeVersionPart)) {
    fail(`${label} 的每一段不能大于 ${maxChromeVersionPart}，当前值为 "${value}"`)
  }
  return parts
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = parseVersion(current, 'public/manifest.json 的 version')

  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  return bump.replace(/^v/, '')
}

function readManifest() {
  if (!existsSync(manifestPath)) fail(`找不到 ${relative(root, manifestPath)}`)

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`${relative(root, manifestPath)} 不是合法 JSON：${error.message}`)
  }
}

function updateManifestVersion(version) {
  const source = readFileSync(manifestPath, 'utf8')
  const versionLine = /^(\s*"version"\s*:\s*)"[^"]*"(,?)$/m
  if (!versionLine.test(source)) fail(`${relative(root, manifestPath)} 中没有可更新的 version 字段`)

  const next = source.replace(versionLine, `$1"${version}"$2`)
  writeFileSync(manifestPath, next, 'utf8')
}

function parseArgs(args) {
  let bump = 'patch'
  let bumpSet = false
  let dryRun = false

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`用法：pnpm release [major|minor|patch|x.y.z] [--dry-run]\n\n默认按 patch 递增，并推送当前分支和对应的 vX.Y.Z tag。`)
      process.exit(0)
    }
    if (arg.startsWith('-')) fail(`未知参数：${arg}`)
    if (bumpSet) fail(`只能指定一个版本或递增类型，收到多余参数：${arg}`)

    bump = arg
    bumpSet = true
  }

  return { bump, dryRun }
}

const { bump, dryRun } = parseArgs(process.argv.slice(2))

if (!existsSync(resolve(root, '.git'))) fail(`当前目录不是 Git 仓库：${root}`)

const manifest = readManifest()
const currentVersion = manifest.version
if (typeof currentVersion !== 'string') fail('public/manifest.json 缺少字符串类型的 version 字段')

const nextVersion = bumpVersion(currentVersion, bump)
parseVersion(nextVersion, '目标版本')
if (nextVersion === currentVersion) fail(`目标版本与当前版本相同：${currentVersion}`)

const tag = `v${nextVersion}`
const branch = tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])
if (!branch.ok || !branch.output) fail('当前处于 detached HEAD，请先切换到要发布的分支')

const dirty = tryGit(['status', '--porcelain', '--untracked-files=no'])
if (!dirty.ok) fail(`无法读取 Git 工作区状态：${dirty.output}`)
if (dirty.output) {
  fail(`工作区存在未提交的已跟踪文件变更，请先提交或暂存后再发布：\n${dirty.output}`)
}

const localTag = tryGit(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])
if (localTag.ok) fail(`本地 tag ${tag} 已存在`)

if (tryGit(['remote', 'get-url', remote]).ok === false) fail(`Git remote "${remote}" 不存在`)

if (dryRun) {
  console.log(`发布计划：
  分支：${branch.output}
  远程：${remote}
  版本：${currentVersion} → ${nextVersion}
  Tag：${tag}

  将执行：
    1. 更新 public/manifest.json
    2. git add public/manifest.json
    3. git commit -m "chore(release): ${tag}"
    4. git tag -a ${tag} -m "Release ${tag}"
    5. git push ${remote} HEAD:refs/heads/${branch.output}
    6. git push ${remote} refs/tags/${tag}

  当前为 dry-run，未修改文件，也未推送。`)
  process.exit(0)
}

const remoteRefs = tryGit(
  ['ls-remote', remote, `refs/tags/${tag}`, `refs/heads/${branch.output}`],
  { timeout: 60_000 },
)
if (!remoteRefs.ok) fail(`无法读取远程 ${remote} 的 refs：${remoteRefs.output}`)

const remoteRefLines = remoteRefs.output ? remoteRefs.output.split('\n') : []
if (remoteRefLines.some((line) => line.endsWith(`refs/tags/${tag}`))) {
  fail(`远程 tag ${tag} 已存在`)
}

const remoteBranchLine = remoteRefLines.find((line) => line.endsWith(`refs/heads/${branch.output}`))
if (remoteBranchLine) {
  const fetch = tryGit(['fetch', '--quiet', remote, branch.output], { timeout: 60_000 })
  if (!fetch.ok) fail(`无法拉取远程分支 ${remote}/${branch.output}：${fetch.output}`)

  const remoteBranchRef = `refs/remotes/${remote}/${branch.output}`
  const ancestor = tryGit(['merge-base', '--is-ancestor', remoteBranchRef, 'HEAD'])
  if (!ancestor.ok) {
    fail(`本地 ${branch.output} 与 ${remote}/${branch.output} 已分叉，请先拉取或变基后再发布`)
  }
}

console.log(`→ 更新 public/manifest.json：${currentVersion} → ${nextVersion}`)
updateManifestVersion(nextVersion)

try {
  runGit(['add', '--', relative(root, manifestPath)])
  runGit(['commit', '-m', `chore(release): ${tag}`])
  runGit(['tag', '-a', tag, '-m', `Release ${tag}`])
} catch (error) {
  fail(`创建版本提交或 tag 失败，请检查当前 Git 状态：${error.message}`)
}

console.log(`→ 推送分支 ${branch.output}`)
try {
  runGit(['push', remote, `HEAD:refs/heads/${branch.output}`], { timeout: 120_000 })
} catch {
  fail(`分支推送失败。本地提交和 tag ${tag} 已创建，请检查后重试推送：\n  git push ${remote} HEAD:refs/heads/${branch.output}\n  git push ${remote} refs/tags/${tag}`)
}

console.log(`→ 推送 tag ${tag}`)
try {
  runGit(['push', remote, `refs/tags/${tag}`], { timeout: 120_000 })
} catch {
  fail(`tag 推送失败。版本提交已推送，本地 tag ${tag} 已创建，请重试：git push ${remote} refs/tags/${tag}`)
}

console.log(`\n✓ 已发布 ${tag}：public/manifest.json 已更新，分支和 tag 均已推送。`)
