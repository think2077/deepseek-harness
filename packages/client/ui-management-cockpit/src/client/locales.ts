/** Management cockpit copy and project-stage labels. */
export const en = {
  nav: 'Management cockpit', title: 'Management cockpit', intro: 'Review project stages and digital-employee activity from existing workspace data.', configure: 'Configure workflow',
  projectTab: 'Project cockpit', employeeTab: 'Digital employees', total: 'Projects', active: 'Active projects', review: 'Results to review', rerun: 'Tasks to rerun', distribution: 'LTC-G project stage distribution', risks: 'Project risks and next steps', recent: 'Recent digital-employee work',
  task: 'Task', project: 'Project', employee: 'Digital employee', status: 'Status', time: 'Time', empty: 'No recent work.', running: 'Running', completed: 'Completed', fallback: 'Project facts need continued verification.', next: 'Next: continue work for the current stage', standalone: 'No project', generalWork: 'General assistant',
  workflowTitle: 'Configure LTC-G stage workflow', workflowHint: 'Changes on this screen are not persisted.', activity: 'Activity', activityName: 'Activity name', owner: 'Owner role', ownerPlaceholder: 'For example: regional owner', execution: 'Execution', ai: 'AI digital employee', employeeChoice: 'Digital employees (multiple, handed off in order)', add: 'Add activity', save: 'Save workflow', cancel: 'Cancel', close: 'Close', draft: ' work draft', quality: ' quality review',
  engagement: 'Engagement', discovery: 'Needs research', proposal: 'Proposal review', approval: 'Approval and procurement', contracting: 'Contract negotiation and signing', preparation: 'Preparation', pilot: 'Pilot operation', acceptance: 'Acceptance and handover', operation: 'Operation',
  employeeProject: 'Project initiation assistant', employeeResearch: 'Regional research specialist', employeeProposal: 'Regional solution specialist', employeeContract: 'Tender and contracting assistant', employeeDelivery: 'Delivery preparation assistant', employeeOperation: 'Project operations assistant', employeeQuality: 'Quality inspection specialist', employeeKnowledge: 'Knowledge management employee',
}
export type CockpitLocaleKey = keyof typeof en
/** Chinese management cockpit copy. */
export const zh: Record<CockpitLocaleKey, string> = {
  nav: '管理驾驶舱', title: '管理驾驶舱', intro: '用现有项目阶段与数字员工运行数据查看组织工作情况。', configure: '配置业务流程',
  projectTab: '项目管理驾驶舱', employeeTab: '数字员工运行', total: '项目总数', active: '进行中项目', review: '待审核工作成果', rerun: '需要重跑的任务', distribution: 'LTC-G 项目阶段分布', risks: '项目风险与下一步', recent: '近期数字员工工作',
  task: '任务', project: '项目', employee: '数字员工', status: '状态', time: '时间', empty: '暂无任务记录', running: '运行中', completed: '已完成', fallback: '项目事实与资源信息待继续核实。', next: '下一步：继续推进当前阶段工作', standalone: '未归属项目', generalWork: '通用助手',
  workflowTitle: '配置 LTC-G 阶段流程', workflowHint: '本页面配置仅作展示，关闭后不会保存。', activity: '活动', activityName: '活动名称', owner: '负责角色', ownerPlaceholder: '例如：区域负责人', execution: '执行方式', ai: 'AI 数字员工', employeeChoice: '执行数字员工（可多选，按顺序交接）', add: '添加活动', save: '保存流程', cancel: '取消', close: '关闭', draft: '工作底稿', quality: '质量复核',
  engagement: '项目接洽', discovery: '需求调研', proposal: '方案论证', approval: '立项与采购推进', contracting: '合同洽谈与签署', preparation: '建设筹备', pilot: '试点运行', acceptance: '验收交付', operation: '正式运营',
  employeeProject: '项目建档助手', employeeResearch: '区域调研专员', employeeProposal: '区域方案专家', employeeContract: '招投标签约助手', employeeDelivery: '筹备交付助手', employeeOperation: '项目运营助手', employeeQuality: '质量检查专员', employeeKnowledge: '知识管理数字员工',
}
