/**
 * Markdown 工具的两个模式。
 *
 * 单独放一个模块是为了避开成环：`index.tsx` 与 `components/Toolbar.tsx` 都要用它，
 * 而 Toolbar 不能反过来引用 index（反过来 index 又要引用 Toolbar）。
 */
export type MarkdownMode = 'edit' | 'view'
