import { memo } from 'react'

interface IProps {
  array: unknown[] | { length: number }
  onClick?: (event: React.MouseEvent) => void
}

/** 收起来的数组长这样：`[3 elements]` */
const CompactArrayView = ({ array, onClick }: IProps) => {
  const count = (array as unknown[]).length

  if (count === 0) {
    return <span className="p">{'[ ]'}</span>
  }

  return (
    <span>
      <span className="p">{'['}</span>
      <span className="compact placeholder ge" onClick={onClick}>
        {`${count} element${count > 1 ? 's' : ''}`}
      </span>
      <span className="p">{']'}</span>
    </span>
  )
}

// 只看长度：节点内容是懒展开的，长度没变就不用跟着重画
export default memo(
  CompactArrayView,
  (prev, next) => (prev.array as unknown[]).length === (next.array as unknown[]).length,
)
