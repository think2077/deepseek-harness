/** Knowledge-base panel copy keys. */
export type KnowledgeBaseLocaleKey =
  | 'nav' | 'description' | 'search' | 'searchPlaceholder' | 'loading' | 'empty'
  | 'retry' | 'error' | 'tree' | 'knowledgeTab' | 'projectTab'
  | 'public' | 'solution' | 'candidate' | 'project' | 'projectNamed'
  | 'add' | 'createRoot' | 'createPath' | 'createPathPlaceholder'
  | 'createTitle' | 'createTitlePlaceholder' | 'create' | 'creating' | 'cancel'
  | 'columnTitle' | 'columnBase' | 'columnType' | 'columnUpdated' | 'columnAccess' | 'columnActions'
  | 'editable' | 'readOnly' | 'remove' | 'confirmRemove' | 'removing'
  | 'select' | 'selectHint' | 'preview' | 'edit' | 'editor'
  | 'save' | 'saving' | 'saved' | 'created' | 'removed' | 'changed'
  | 'codeCopy' | 'codeCopied' | 'footnotes'

/** English knowledge-base panel copy. */
export const en: Record<KnowledgeBaseLocaleKey, string> = {
  nav: 'Knowledge base',
  description: 'Maintain reusable knowledge files and browse project material.',
  search: 'Search knowledge', searchPlaceholder: 'Search titles and paths',
  loading: 'Loading knowledge…', empty: 'No knowledge entries found.', retry: 'Retry',
  error: 'Could not load the knowledge base.', tree: 'Files', knowledgeTab: 'Knowledge base',
  projectTab: 'Project information', public: 'Public knowledge',
  solution: 'Solution-specific knowledge', candidate: 'Candidate knowledge',
  project: 'Project knowledge', projectNamed: 'Project knowledge · {name}',
  add: 'Add entry', createRoot: 'Knowledge base', createPath: 'File path',
  createPathPlaceholder: 'category/entry.md', createTitle: 'Entry title', createTitlePlaceholder: 'Knowledge title',
  create: 'Create', creating: 'Creating…', cancel: 'Cancel', columnTitle: 'Title / path',
  columnBase: 'Knowledge base', columnType: 'Type', columnUpdated: 'Updated', columnAccess: 'Access',
  columnActions: 'Actions', editable: 'Editable', readOnly: 'Read only', remove: 'Remove entry',
  confirmRemove: 'Remove', removing: 'Removing…', select: 'Select an entry',
  selectHint: 'Choose a file in the tree to view or edit its content.', preview: 'Preview', edit: 'Edit',
  editor: 'Knowledge content editor', save: 'Save', saving: 'Saving…', saved: 'Saved',
  created: 'Entry created', removed: 'Entry moved to recoverable trash',
  changed: 'This entry changed on disk. Reload it before saving or removing.',
  codeCopy: 'Copy', codeCopied: 'Copied', footnotes: 'Footnotes',
}

/** Chinese knowledge-base panel copy. */
export const zh: Record<KnowledgeBaseLocaleKey, string> = {
  nav: '知识库', description: '维护可复用的知识文件，并浏览项目资料。',
  search: '搜索知识', searchPlaceholder: '搜索标题和路径', loading: '正在加载知识库…',
  empty: '没有找到知识文件。', retry: '重试', error: '无法加载知识库。', tree: '目录与文件',
  knowledgeTab: '知识库', projectTab: '项目信息', public: '公共知识库',
  solution: '方案专属知识库', candidate: '候选知识库',
  project: '项目知识库', projectNamed: '项目知识库 · {name}',
  add: '新增条目', createRoot: '知识库', createPath: '文件路径',
  createPathPlaceholder: '分类/知识条目.md', createTitle: '条目标题', createTitlePlaceholder: '知识标题',
  create: '创建', creating: '正在创建…', cancel: '取消', columnTitle: '标题 / 路径',
  columnBase: '所属知识库', columnType: '类型', columnUpdated: '更新时间', columnAccess: '权限',
  columnActions: '操作', editable: '可编辑', readOnly: '只读', remove: '移除条目',
  confirmRemove: '确认移除', removing: '正在移除…', select: '选择一条知识',
  selectHint: '在左侧目录树中选择文件，可直接预览或编辑内容。', preview: '预览', edit: '编辑',
  editor: '知识内容编辑器', save: '保存', saving: '正在保存…', saved: '已保存',
  created: '知识条目已创建', removed: '知识条目已移至可恢复回收目录',
  changed: '该条目已在磁盘上发生变化，请重新加载后再保存或移除。',
  codeCopy: '复制', codeCopied: '已复制', footnotes: '脚注',
}
