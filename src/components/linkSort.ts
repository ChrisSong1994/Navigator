/** 链接拖拽的稳定 id（提取到独立文件，避免组件模块同时导出函数触发 Fast Refresh 警告） */
export function linkSortableId(groupId: string, index: number) {
  return `link:${encodeURIComponent(groupId)}:${index}`
}
