interface IProps {
  keys: string[]
  onClick?: (event: React.MouseEvent) => void
}

const MAX_KEYS = 5

/** 收起来的对象长这样：`{type, start, end, ... +2}` */
const CompactObjectView = ({ keys, onClick }: IProps) => {
  if (keys.length === 0) {
    return <span className="p">{'{ }'}</span>
  }

  const displayKeys =
    keys.length > MAX_KEYS
      ? keys.slice(0, MAX_KEYS).concat([`... +${keys.length - MAX_KEYS}`])
      : keys

  return (
    <span>
      <span className="p">{'{'}</span>
      <span className="compact placeholder ge" onClick={onClick}>
        {displayKeys.join(', ')}
      </span>
      <span className="p">{'}'}</span>
    </span>
  )
}

export default CompactObjectView
