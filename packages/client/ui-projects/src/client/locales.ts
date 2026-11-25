/** Project management copy and progress-stage labels. */
export const en = {
  nav: 'Projects', intro: 'Accumulate project facts along the LTC-G business stages; stage changes trigger the configured digital-employee workflows.',
  create: 'New project', edit: 'Edit', enter: 'Enter workspace', archive: 'Archive', restore: 'Restore',
  name: 'Project name', description: 'Description', stage: 'Project stage', search: 'Search projects',
  allStages: 'All stages', active: 'Active', archived: 'Archived', empty: 'No projects found.', loading: 'Loading projects…',
  save: 'Save', cancel: 'Cancel', close: 'Close', saving: 'Saving…', retry: 'Refresh', error: 'Could not load projects.',
  archiveTitle: 'Archive project', archiveHint: 'Project files and conversations will be retained. Restore the project before starting new work.',
  engagement: 'Engagement', discovery: 'Needs research', proposal: 'Proposal review', approval: 'Approval and procurement',
  contracting: 'Contract negotiation and signing', preparation: 'Preparation', pilot: 'Pilot operation', acceptance: 'Acceptance and handover', operation: 'Operation',
  creator: 'Created by', updated: 'Updated', shared: 'Project files are shared. Conversations remain private to their creators.',
  noDescription: 'No description', unknownCreator: 'Unknown creator',
}
export type ProjectLocaleKey = keyof typeof en
/** Chinese project management copy. */
export const zh: Record<ProjectLocaleKey, string> = {
  nav: '项目管理', intro: '按 LTC-G 业务阶段沉淀项目事实；阶段变化会触发已配置的数字员工流程。',
  create: '新建项目', edit: '编辑', enter: '进入工作区', archive: '归档', restore: '恢复',
  name: '项目名称', description: '项目描述', stage: '项目阶段', search: '搜索项目',
  allStages: '全部阶段', active: '进行中', archived: '已归档', empty: '暂无项目。', loading: '正在加载项目…',
  save: '保存', cancel: '取消', close: '关闭', saving: '正在保存…', retry: '刷新', error: '无法加载项目。',
  archiveTitle: '归档项目', archiveHint: '项目文件和历史会话会保留。恢复项目后才能开始新的工作。',
  engagement: '项目接洽', discovery: '需求调研', proposal: '方案论证', approval: '立项与采购推进',
  contracting: '合同洽谈与签署', preparation: '建设筹备', pilot: '试点运行', acceptance: '验收交付', operation: '正式运营',
  creator: '创建人', updated: '更新于', shared: '项目文件共享，会话仍由各自创建人私有。',
  noDescription: '暂无描述', unknownCreator: '未知创建人',
}
