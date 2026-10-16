/**
 * 树的一行的展开状态机。
 *
 * 一行的展开状态不止「开/关」两种：光标走进来时它会被自动展开（还带着光标的那条链），
 * 鼠标点一下是「打开」，Shift 点是「整棵子树都打开」，再点一下是「关掉」。
 * 这套转移规则是树的骨架，单独放一份 —— 改一个分支就会出现「关不掉」或者「点开又自己合上」，
 * 所以它也是冒烟测试直接盯的地方（见 scripts/check-tools.mjs）。
 *
 * 原版用的是 enum，`erasableSyntaxOnly` 不让写，换成 const 对象。
 */

export const OPEN_STATES = {
  DEFAULT: 0,
  OPEN: 1,
  DEEP_OPEN: 2,
  FOCUS_OPEN: 3,
  CLOSED: 4,
} as const

export type OpenState = (typeof OPEN_STATES)[keyof typeof OPEN_STATES]

export const EVENTS = {
  /** 光标走进了这一行 */
  GAIN_FOCUS: 2,
  /** 光标离开了这一行 */
  LOOSE_FOCUS: 3,
  /** 父节点被 Shift 点开，整棵子树跟着展开 */
  DEEP_OPEN: 4,
} as const

export type OpenEvent = (typeof EVENTS)[keyof typeof EVENTS]

export function transition(currentState: OpenState, event: OpenEvent): OpenState {
  switch (currentState) {
    case OPEN_STATES.DEFAULT:
    case OPEN_STATES.CLOSED:
      switch (event) {
        case EVENTS.DEEP_OPEN:
          return OPEN_STATES.DEEP_OPEN
        case EVENTS.GAIN_FOCUS:
          return OPEN_STATES.FOCUS_OPEN
        case EVENTS.LOOSE_FOCUS:
          return OPEN_STATES.DEFAULT
      }
      break

    case OPEN_STATES.OPEN:
      switch (event) {
        case EVENTS.DEEP_OPEN:
          return OPEN_STATES.DEEP_OPEN
        // 自己手动打开过的，光标进来/离开都不动它
        case EVENTS.GAIN_FOCUS:
        case EVENTS.LOOSE_FOCUS:
          return currentState
      }
      break

    // 整棵子树展开是「只进不出」的，得再点一下才收起来
    case OPEN_STATES.DEEP_OPEN:
      return OPEN_STATES.DEEP_OPEN

    case OPEN_STATES.FOCUS_OPEN:
      switch (event) {
        case EVENTS.GAIN_FOCUS:
          return OPEN_STATES.FOCUS_OPEN
        case EVENTS.LOOSE_FOCUS:
          return OPEN_STATES.DEFAULT
        case EVENTS.DEEP_OPEN:
          return OPEN_STATES.DEEP_OPEN
      }
      break
  }
  return currentState
}

/** 这一行的展开状态决没决定「显示出来时是开着的」 */
export function isOpenState(openState: OpenState, opensByDefault: boolean): boolean {
  return openState === OPEN_STATES.DEFAULT ? opensByDefault : openState !== OPEN_STATES.CLOSED
}
