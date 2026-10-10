chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
