/**
 * 弹窗自己的本机偏好：上次收藏用的哪个分组。
 *
 * 单独放 chrome.storage.local（而不是写进 navigator:config）：它是「这台机器上顺手」的记忆，
 * 没必要跨设备同步，也不该塞进配置结构里 —— 那样 schema / 导出 / 书签往返都要跟着改。
 * 普通网页里打开 popup.html 时退回 localStorage，和 config/storage.ts 的思路一致。
 */
const LAST_GROUP_KEY = 'navigator:popup:lastGroup'

function hasExtensionStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local)
}

export async function readLastGroup(): Promise<string | null> {
  if (!hasExtensionStorage()) {
    try {
      return window.localStorage.getItem(LAST_GROUP_KEY)
    } catch {
      return null
    }
  }
  try {
    const stored = await chrome.storage.local.get(LAST_GROUP_KEY)
    const value = stored[LAST_GROUP_KEY]
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

export async function writeLastGroup(groupId: string): Promise<void> {
  if (!hasExtensionStorage()) {
    try {
      window.localStorage.setItem(LAST_GROUP_KEY, groupId)
    } catch {
      // 隐私策略禁用 localStorage 时忽略：只是少记一个偏好
    }
    return
  }
  try {
    await chrome.storage.local.set({ [LAST_GROUP_KEY]: groupId })
  } catch {
    // 写偏好失败不影响收藏本身
  }
}
