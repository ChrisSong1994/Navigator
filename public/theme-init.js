/* 首屏前先应用明暗主题，避免闪白；独立文件以兼容扩展页面的 MV3 CSP。 */
(function () {
  function apply(mode) {
    var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }

  function applyRaw(raw) {
    try {
      var config = raw ? JSON.parse(raw) : null
      apply((config && config.settings && config.settings.themeMode) || 'system')
    } catch {
      apply('system')
    }
  }

  try {
    applyRaw(localStorage.getItem('navigator:config'))
  } catch {
    apply('system')
  }

  try {
    if (globalThis.chrome && chrome.storage && chrome.storage.local) {
      try {
        var result = chrome.storage.local.get('navigator:config')
        if (result && typeof result.then === 'function') {
          result.then(function (value) {
            var raw = value && value['navigator:config']
            if (raw) applyRaw(raw)
          })
        } else if (result && result['navigator:config']) {
          applyRaw(result['navigator:config'])
        }
      } catch {
        chrome.storage.local.get('navigator:config', function (value) {
          var raw = value && value['navigator:config']
          if (raw) applyRaw(raw)
        })
      }
    }
  } catch {
    // 普通网页环境没有 chrome.storage，或浏览器不支持同步返回时忽略
  }
})()
