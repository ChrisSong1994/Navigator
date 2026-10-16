/**
 * reaflow 在浏览器分支里会给 ELK 传一个 base64 `data:` URL 的 Worker
 * （见 node_modules/reaflow/dist/index.js 的 getElk）。扩展页面的 CSP 是
 * `script-src 'self'`，data: / blob: 都不在其中，worker 会被直接拦掉、
 * 布局永远不返回（画布 0 个节点）。这里通过 vite alias 顶掉
 * `elkjs/lib/elk-api`：丢掉 workerFactory / workerUrl，让 elk.bundled 的
 * ELKNode 退回进程内的假 worker（主线程算布局）。
 */
import ELKNode from 'elkjs/lib/elk.bundled.js'

type ElkOptions = ConstructorParameters<typeof ELKNode>[0]

export default class ELK extends ELKNode {
  constructor(options: ElkOptions = {}) {
    const { workerFactory: _workerFactory, workerUrl: _workerUrl, ...rest } = options
    super(rest)
  }
}
