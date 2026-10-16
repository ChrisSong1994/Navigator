import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { cx } from '../../../lib/cx.ts'
import stringify from '../../../lib/stringify.ts'
import type { TreeAdapter } from '../core/TreeAdapter.ts'
import { useSelectedNode } from '../SelectedNodeContext.tsx'
import focusNodes from '../focusNodes.ts'
import { publish } from '../utils/pubsub.ts'
import CompactArrayView from './CompactArrayView.tsx'
import CompactObjectView from './CompactObjectView.tsx'
import { EVENTS, OPEN_STATES, isOpenState, transition } from './openState.ts'
import type { OpenState } from './openState.ts'

/**
 * 树的一行。
 *
 * 展开状态机见 openState.ts；这里管的是「这一行长什么样」：名字、值、括号、折叠提示，
 * 以及光标在不在这一行（在的话高亮，并且把自己登记给 focusNodes 等着被滚进视野）。
 */

/** 上一次 render 的值（带 initialValue，且在 effect 里更新，跟 React 文档里那个 usePrevious 一个写法） */
function usePrevious<T>(value: T, initialValue: T): T {
  const ref = useRef(initialValue)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

function useOpenState(openFromParent: boolean, isInRange: boolean) {
  const previousOpenFromParent = usePrevious(openFromParent, false)
  const wasInRange = usePrevious(isInRange, false)
  const [ownOpenState, setOwnOpenState] = useState<OpenState>(OPEN_STATES.DEFAULT)
  const previousOwnOpenState = usePrevious(ownOpenState, OPEN_STATES.DEFAULT)
  const previousComputedOpenState = useRef<OpenState>(OPEN_STATES.DEFAULT)
  let computedOpenState = previousComputedOpenState.current

  if (ownOpenState !== previousOwnOpenState) {
    computedOpenState = ownOpenState
  } else if (wasInRange !== isInRange) {
    computedOpenState = transition(
      previousComputedOpenState.current,
      isInRange && !wasInRange ? EVENTS.GAIN_FOCUS : EVENTS.LOOSE_FOCUS,
    )
    // 光标离开时，如果是被自动关掉的，状态要还给 DEFAULT，好让下次光标再进来还能自动开
    if (!isInRange && wasInRange && ownOpenState === OPEN_STATES.CLOSED) {
      setOwnOpenState(OPEN_STATES.DEFAULT)
    }
  } else if (openFromParent && !previousOpenFromParent) {
    computedOpenState = transition(previousComputedOpenState.current, EVENTS.DEEP_OPEN)
  }

  useEffect(() => {
    previousComputedOpenState.current = computedOpenState
  })

  return [computedOpenState, setOwnOpenState] as const
}

interface ElementProps {
  name?: string
  value: any
  computed?: boolean
  /** 父节点是不是「整棵子树展开」（Shift 点出来的） */
  open?: boolean
  level: number
  treeAdapter: TreeAdapter
  autofocus?: boolean
  isInRange?: boolean
  hasChildrenInRange?: boolean
  selected?: boolean
  onClick?: (state: OpenState, own?: boolean) => void
  /** 光标在源码里的偏移量，用来判断这个节点在不在光标处 */
  position?: number
  parent?: any
}

const Element = memo(
  ({
    name,
    value,
    computed,
    open = false,
    level,
    treeAdapter,
    autofocus,
    isInRange = false,
    hasChildrenInRange = false,
    selected,
    onClick,
    position,
  }: ElementProps) => {
    const opensByDefault =
      (name ? treeAdapter.opensByDefault(value, name) : false) || level === 0

    const [openState, setOpenState] = useOpenState(open, Boolean(autofocus) && (isInRange || hasChildrenInRange))

    const elementRef = useRef<HTMLLIElement>(null)

    if (autofocus && isInRange && !hasChildrenInRange) {
      focusNodes('add', elementRef)
    }

    const isOpen = isOpenState(openState, opensByDefault)

    const onToggleClick = useCallback(
      (event: React.MouseEvent) => {
        const newOpenState = event.shiftKey
          ? OPEN_STATES.DEEP_OPEN
          : isOpen
            ? OPEN_STATES.CLOSED
            : OPEN_STATES.OPEN
        onClick?.(newOpenState, true)
        setOpenState(newOpenState)
      },
      [onClick, isOpen, setOpenState],
    )

    // 有源码区间的节点才谈得上高亮；根节点自己那一段就是整份源码，不凑热闹
    const range = treeAdapter.getRange(value)
    let onMouseOver: React.MouseEventHandler | undefined
    let onMouseLeave: React.MouseEventHandler | undefined

    if (range && level !== 0) {
      onMouseOver = (event) => {
        event.stopPropagation()
        publish('HIGHLIGHT', { node: value, range })
      }
      onMouseLeave = (event) => {
        event.stopPropagation()
        publish('CLEAR_HIGHLIGHT', { node: value, range })
      }
    }

    const clickHandler = useCallback(() => {
      setOpenState(OPEN_STATES.OPEN)
      onClick?.(OPEN_STATES.OPEN)
    }, [onClick, setOpenState])

    function renderChild(
      key: string,
      childValue: any,
      parentNode: any,
      childName: string | undefined,
      childComputed?: boolean,
    ) {
      if (
        treeAdapter.isArray(childValue) ||
        treeAdapter.isObject(childValue) ||
        typeof childValue === 'function'
      ) {
        const ElementType = typeof childValue === 'function' ? FunctionElement : ElementContainer
        return (
          <ElementType
            key={key}
            name={childName}
            open={openState === OPEN_STATES.DEEP_OPEN}
            value={childValue}
            computed={childComputed}
            level={level + 1}
            treeAdapter={treeAdapter}
            autofocus={autofocus}
            parent={parentNode}
            onClick={clickHandler}
            position={position}
          />
        )
      }
      return (
        <PrimitiveElement key={key} name={childName} value={childValue} computed={childComputed} />
      )
    }

    let valueOutput: React.ReactNode = null
    let content: React.ReactNode = null
    let prefix: string | null = null
    let suffix: string | null = null
    let showToggler = false

    if (value && typeof value === 'object') {
      // 对象先亮出自己的名字（Identifier / YAMLMap 之类），数组没有名字
      if (!treeAdapter.isArray(value)) {
        const nodeName = treeAdapter.getNodeName(value)
        if (nodeName) {
          valueOutput = (
            <span className="tokenName nc" onClick={onToggleClick}>
              {nodeName}{' '}
              {selected ? (
                <span className="ge" title="已在控制台挂成 $node" style={{ fontSize: '0.8em' }}>
                  {' = $node'}
                </span>
              ) : null}
            </span>
          )
        }
      }

      // 「有数字 length」当数组认（原版如此）。jsonc 的节点也带 length，
      // 所以 parsers/json/jsonc.ts 特意把它改成了 end，免得对象被当成数组。
      if (typeof value.length === 'number') {
        if (value.length > 0 && isOpen) {
          prefix = '['
          suffix = ']'
          const node = value
          const elements = Array.from(treeAdapter.walkNode(value))
            .filter(({ key }) => key !== 'length')
            .map(({ key, value: childValue, computed: childComputed }) =>
              // 下标不当名字显示
              renderChild(
                key,
                childValue,
                node,
                Number.isInteger(+key) ? undefined : key,
                childComputed,
              ),
            )
          content = <ul className="value-body">{elements}</ul>
        } else {
          valueOutput = (
            <span>
              {valueOutput}
              <CompactArrayView array={value} onClick={onToggleClick} />
            </span>
          )
        }
        showToggler = value.length > 0
      } else if (isOpen) {
        prefix = '{'
        suffix = '}'
        const node = value
        const elements = Array.from(treeAdapter.walkNode(value)).map(
          ({ key, value: childValue, computed: childComputed }) =>
            renderChild(key, childValue, node, key, childComputed),
        )
        content = <ul className="value-body">{elements}</ul>
        showToggler = elements.length > 0
      } else {
        const keys = Array.from(treeAdapter.walkNode(value), ({ key }) => key)
        valueOutput = (
          <span>
            {valueOutput}
            <CompactObjectView onClick={onToggleClick} keys={keys} />
          </span>
        )
        showToggler = keys.length > 0
      }
    }

    const classNames = cx({
      entry: true,
      // 光标落在这一行（并且它的子节点里没有光标），或者光标在它展开的子节点里 —— 都算「当前这一行」
      highlighted:
        (isInRange && (!hasChildrenInRange || !isOpen)) ||
        (!isInRange && hasChildrenInRange && !isOpen),
      toggable: showToggler,
      open: isOpen,
    })

    return (
      <li
        ref={elementRef}
        className={classNames}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {name ? <PropertyName name={name} computed={computed} onClick={onToggleClick} /> : null}
        <span className="value">{valueOutput}</span>
        {prefix ? <span className="prefix p">&nbsp;{prefix}</span> : null}
        {content}
        {suffix ? <div className="suffix p">{suffix}</div> : null}
      </li>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.name === nextProps.name &&
      prevProps.value === nextProps.value &&
      prevProps.computed === nextProps.computed &&
      prevProps.open === nextProps.open &&
      prevProps.level === nextProps.level &&
      prevProps.treeAdapter === nextProps.treeAdapter &&
      prevProps.autofocus === nextProps.autofocus &&
      prevProps.selected === nextProps.selected &&
      prevProps.onClick === nextProps.onClick &&
      prevProps.isInRange === nextProps.isInRange &&
      prevProps.hasChildrenInRange === nextProps.hasChildrenInRange &&
      // 光标位置只对「命中的那一行」有意义，别处不比 —— 否则移动一次光标整棵树都要重画
      (nextProps.isInRange || nextProps.hasChildrenInRange
        ? prevProps.position === nextProps.position
        : true)
    )
  },
)

const NOT_COMPUTED = {}

/**
 * AST 上的方法（yaml 的 Document / Directives 上挂了不少）。
 * 默认是藏起来的（「方法」那个开关），打开后点一下才会真的调用 —— 原版的行为。
 */
const FunctionElement = memo((props: ElementProps) => {
  const [computedValue, setComputedValue] = useState<any>(NOT_COMPUTED)
  const [error, setError] = useState<Error | null>(null)
  const { name, value, parent, computed, treeAdapter } = props

  if (computedValue !== NOT_COMPUTED) {
    if (treeAdapter.isArray(computedValue) || treeAdapter.isObject(computedValue)) {
      return <ElementContainer {...props} value={computedValue} level={props.level + 1} />
    }
    return <PrimitiveElement name={name} value={computedValue} computed={computed} />
  }

  return (
    <li className="entry">
      {name ? <PropertyName name={name} computed={computed} /> : null}
      <span className="value">
        <span
          className="ge invokeable"
          title="点一下调用它"
          onClick={() => {
            try {
              setComputedValue(value.call(parent))
            } catch (err: any) {
              setError(err)
            }
          }}
        >
          (...)
        </span>
      </span>
      {error ? (
        <span>
          {' '}
          <i className="ge error" title={error.message}>
            !
          </i>
        </span>
      ) : null}
    </li>
  )
})

const PrimitiveElement = memo(
  ({ name, value, computed }: { name?: string; value: any; computed?: boolean }) => (
    <li className="entry">
      {name ? <PropertyName name={name} computed={computed} /> : null}
      <span className="value">
        <span className="s">{stringify(value)}</span>
      </span>
    </li>
  ),
)

function PropertyName({
  name,
  computed,
  onClick,
}: {
  name: string
  computed?: boolean
  onClick?: React.MouseEventHandler
}) {
  return (
    <span className="key">
      <span className="name nb" onClick={onClick}>
        {computed ? <span title="computed">*{name}</span> : name}
      </span>
      <span className="p">:&nbsp;</span>
    </span>
  )
}

/** 包一层是为了算出「这个节点在不在光标处 / 它的子节点里有没有光标」，Element 本身不碰这些 */
export default function ElementContainer(props: ElementProps) {
  const [selected, setSelected] = useState(false)
  const setSelectedNode = useSelectedNode()

  const isInRange = props.treeAdapter.isInRange(props.value, props.name || '', props.position ?? -1)

  const onClick = useCallback(
    (state: OpenState, own?: boolean) => {
      if (own) {
        if (state === OPEN_STATES.CLOSED) {
          setSelectedNode(null)
          setSelected(false)
        } else {
          setSelectedNode(props.value, () => setSelected(false))
          setSelected(true)
        }
      }
      props.onClick?.(state)
    },
    [props.value, props.onClick, setSelectedNode],
  )

  return (
    <Element
      {...props}
      selected={selected}
      hasChildrenInRange={props.treeAdapter.hasChildrenInRange(
        props.value,
        props.name || '',
        props.position ?? -1,
      )}
      isInRange={isInRange}
      onClick={onClick}
    />
  )
}
