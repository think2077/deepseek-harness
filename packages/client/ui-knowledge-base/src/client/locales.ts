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
  | 'reviewNav' | 'reviewDescription' | 'pendingTab' | 'acceptedTab' | 'rejectedTab'
  | 'reviewEmpty' | 'modifyCandidate' | 'rejectCandidate' | 'acceptCandidate'
  | 'statusPending' | 'statusAccepted' | 'statusRejected' | 'scope' | 'confidence'
  | 'suggestedDestination' | 'evidence' | 'candidateRule' | 'exceptions' | 'candidateEditor' | 'candidateEditHint'
  | 'saveCandidate' | 'confirmReject' | 'acceptTitle' | 'destinationRoot' | 'destinationPath'
  | 'mergeContent' | 'mergeHint' | 'confirmAccept' | 'close' | 'updated' | 'accepted'
  | 'rejected' | 'invalidCandidate' | 'submittedAt' | 'loadingDestination' | 'prepareMerge'
  | 'fallbackDirectory' | 'codeCopy' | 'codeCopied' | 'footnotes'
  | 'openSessionForMerge' | 'mergeSuggestion' | 'mergeAction' | 'targetSection' | 'wholeFile'
  | 'mergeAction_insert' | 'mergeAction_append' | 'mergeAction_replace' | 'mergeAction_skip'

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
  reviewNav: 'My reviews', reviewDescription: 'Review extracted knowledge before it enters an approved knowledge base.',
  pendingTab: 'Pending', acceptedTab: 'Accepted', rejectedTab: 'Rejected',
  reviewEmpty: 'No candidate cards in this state.',
  modifyCandidate: 'Modify', rejectCandidate: 'Reject', acceptCandidate: 'Accept',
  statusPending: 'Pending', statusAccepted: 'Accepted', statusRejected: 'Rejected',
  scope: 'Scope', confidence: 'Confidence', suggestedDestination: 'Suggested destination', evidence: 'Evidence',
  candidateRule: 'Rule', exceptions: 'Exceptions', candidateEditor: 'Knowledge suggestion editor',
  candidateEditHint: 'Edit only the readable knowledge suggestion. Technical evidence stays hidden.',
  saveCandidate: 'Save changes', confirmReject: 'Confirm rejection', acceptTitle: 'Confirm knowledge merge',
  destinationRoot: 'Knowledge base', destinationPath: 'Target file', mergeContent: 'Merged file content',
  mergeHint: 'Review the target and complete resulting file. Acceptance writes exactly this content.',
  confirmAccept: 'Confirm acceptance', close: 'Close', updated: 'Candidate updated',
  accepted: 'Candidate accepted and merged', rejected: 'Candidate rejected',
  invalidCandidate: 'This card has invalid YAML and must be modified before acceptance.',
  submittedAt: 'Proposed', loadingDestination: 'Loading target…',
  prepareMerge: 'Generate smart merge suggestion',
  fallbackDirectory: 'Unclassified',
  openSessionForMerge: 'Open a Solution Expert session before generating a merge suggestion.',
  mergeSuggestion: 'Smart merge suggestion', mergeAction: 'Action', targetSection: 'Target section',
  wholeFile: 'Whole file', mergeAction_insert: 'Insert into section', mergeAction_append: 'Append section',
  mergeAction_replace: 'Replace duplicate rule', mergeAction_skip: 'Already covered; keep unchanged',
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
  reviewNav: '我的审核', reviewDescription: '审核会话萃取出的候选知识，确认后再进入正式知识库。',
  pendingTab: '待审核', acceptedTab: '已采纳', rejectedTab: '已拒绝',
  reviewEmpty: '当前状态下没有候选知识卡。',
  modifyCandidate: '修改', rejectCandidate: '拒绝', acceptCandidate: '采纳',
  statusPending: '待审核', statusAccepted: '已采纳', statusRejected: '已拒绝',
  scope: '适用范围', confidence: '置信度', suggestedDestination: '建议归档位置', evidence: '来源依据',
  candidateRule: '规则或经验', exceptions: '例外', candidateEditor: '知识建议编辑器',
  candidateEditHint: '只修改审核人需要判断的知识建议，技术依据保持隐藏。',
  saveCandidate: '保存修改', confirmReject: '确认拒绝', acceptTitle: '确认合并知识',
  destinationRoot: '目标知识库', destinationPath: '目标文件', mergeContent: '合并后的文件全文',
  mergeHint: '请确认目标与合并后的完整内容；采纳后将严格按此内容写入。',
  confirmAccept: '确认采纳', close: '关闭', updated: '候选知识已更新',
  accepted: '候选知识已采纳并合入知识库', rejected: '候选知识已拒绝',
  invalidCandidate: '候选卡 YAML 无效，修改后才能采纳。', submittedAt: '提出时间',
  loadingDestination: '正在智能判断合并方式…', prepareMerge: '生成智能合并建议',
  fallbackDirectory: '待归类',
  openSessionForMerge: '请先打开一个使用“解决方案专家”预设的会话，再生成合并建议。',
  mergeSuggestion: '智能合并建议', mergeAction: '处理方式', targetSection: '目标章节', wholeFile: '整个文件',
  mergeAction_insert: '插入现有章节', mergeAction_append: '追加新章节',
  mergeAction_replace: '替换重复规则', mergeAction_skip: '已有覆盖，不改文件',
  codeCopy: '复制', codeCopied: '已复制', footnotes: '脚注',
}
