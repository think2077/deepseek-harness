/** Localized labels for the digital employee directory. */
export type DigitalEmployeesLocaleKey = keyof typeof en

/** English directory labels. */
export const en = {
  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Full coding agent without the workflow tool; other tools are exposed through the PTC mode SDK so the model can combine multi-step operations in one TypeScript program.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'Single-tool coding agent with a persistent shell.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',

  nav: 'Digital employees', description: 'Reusable work capabilities for the organization.',
  create: 'Create / edit digital employee',
  // Starting draft for the Creator session: the fields a new or revised
  // employee has to answer before any preset file is written.
  createPrompt: [
    'Please help me create a digital employee.',
    'Name:',
    'Responsibilities:',
    'Applicable LTC-G stage:',
    'Input:',
    'Output:',
    'Work boundaries and items requiring human confirmation:',
  ].join('\n') + '\n',
  loading: 'Loading digital employees…', error: 'Could not load digital employees.', retry: 'Refresh',
  empty: 'No digital employees have been created yet.', noMatches: 'No digital employees match this search.',
  search: 'Search digital employees', default: 'Default', broken: 'Unavailable', published: 'Published', publicVisible: 'Public',
  details: 'View details', start: 'Start task', close: 'Close', noDescription: 'No description provided.',
  persona: 'Persona', skills: 'Bundled skills', noSkills: 'No bundled skills.',
  inventoryError: 'Could not load the assistant details.',
  chooseWorkspace: 'Choose a workspace', workspaceHint: 'The new conversation will belong to this workspace.',
  noWorkspaces: 'Create a workspace in the sidebar first.', workspaceLoading: 'Loading workspaces…', workspaceError: 'Could not load workspaces.',
  starting: 'Starting conversation…', startError: 'Could not start the conversation.',
}

/** Chinese directory labels. */
export const zh: Record<DigitalEmployeesLocaleKey, string> = {
  presetStandardName: '标准模式',
  presetStandardDescription: '功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '功能完整的编码 Agent，但默认不提供 workflow 工具；其他工具通过 PTC 模式 SDK 呈现，让模型用一个 TypeScript 程序组合多步操作。',
  presetMinimalName: '极简模式',
  presetMinimalDescription: '仅提供持久 shell 的单工具编码 Agent。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。',

  nav: '数字员工', description: '组织可复用的工作能力。',
  create: '创建/编辑数字员工',
  createPrompt: [
    '请帮我创建一个数字员工。',
    '名称：',
    '职责：',
    '适用 LTC-G 阶段：',
    '输入：',
    '输出：',
    '工作边界与需人工确认的事项：',
  ].join('\n') + '\n',
  loading: '正在加载数字员工…', error: '无法加载数字员工。', retry: '刷新',
  empty: '还没有创建数字员工。', noMatches: '没有匹配的数字员工。',
  search: '搜索数字员工', default: '默认', broken: '不可用', published: '已发布', publicVisible: '公共',
  details: '查看详情', start: '发起任务', close: '关闭', noDescription: '暂无描述。',
  persona: '人设', skills: '随包技能', noSkills: '未随包携带技能。',
  inventoryError: '无法加载助手详情。',
  chooseWorkspace: '选择工作空间', workspaceHint: '新对话将归属于所选工作空间。',
  noWorkspaces: '请先在侧栏创建工作空间。', workspaceLoading: '正在加载工作空间…', workspaceError: '无法加载工作空间。',
  starting: '正在开始对话…', startError: '无法开始对话。',
}
