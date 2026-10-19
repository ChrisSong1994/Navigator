/**
 * 浏览器里打开本地 Markdown（`file:///…/x.md`）换成工具页的演示模式。
 * 拖一份 .md 进浏览器、点本机的 md 链接，走到的都是这种导航 —— 拦下来整页换成工具页，
 * 于是「打开本地文档」的落点和「拖一份 md 进去」一样，都在演示模式里。
 *
 * 正文不在这里读：页面按 `?file=` 自己读（见 src/tools/Markdown/lib/source.ts）。
 * 读不到（用户没开「允许访问文件网址」、或文件已经被移走）时工具页能自己说清怎么办，
 * 不用再往页面里塞一份正文、也不用因此多一层 chrome.storage 中转。
 *
 * 后缀表要和 src/lib/markdown.ts 的 MARKDOWN_EXTENSIONS 一致（service worker 是纯 JS、
 * 进不了构建，只能在 scripts/check-tools.mjs 里比对），只是这里多了一层「地址结尾」的判断。
 */
const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn|txt)$/i

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const url = changeInfo.url
  if (!url || !url.startsWith('file://')) return

  let path
  try {
    // 只看路径：地址里的查询串、锚点不算后缀
    path = new URL(url).pathname
  } catch {
    // 坏地址（`file://` 这种）不当文档看
    return
  }
  if (!MARKDOWN_RE.test(path)) return

  chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL(`index.html?tool=markdown&file=${encodeURIComponent(url)}`),
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'BING_WALLPAPER_FETCH') {
    fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN', {
      method: 'GET',
      credentials: 'omit',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Bing 壁纸请求失败：HTTP ${response.status}`)
        return response.text()
      })
      .then((body) => sendResponse({ ok: true, body }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type !== 'SEARCH_SUGGEST_FETCH') return false

  const url = message?.payload?.url
  try {
    const parsed = new URL(url)
    const allowedHosts = new Set(['www.google.com', 'www.google.com.hk', 'www.baidu.com', 'cn.bing.com'])
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      sendResponse({ ok: false, error: '不允许的联想地址' })
      return false
    }

    fetch(parsed, {
      method: 'GET',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`联想请求失败：HTTP ${response.status}`)
        return response.text()
      })
      .then((body) => sendResponse({ ok: true, body }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
  } catch {
    sendResponse({ ok: false, error: '无效的联想地址' })
  }

  return true
})
