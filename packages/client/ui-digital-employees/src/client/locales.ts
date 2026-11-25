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

  nav: 'Digital employees', description: 'Choose an assistant, explore its capabilities, and start a conversation in your workspace.',
  loading: 'Loading digital employees…', error: 'Could not load digital employees.', retry: 'Refresh', empty: 'No digital employees are available.',
  search: 'Search digital employees', builtIn: 'Built-in', custom: 'Custom', default: 'Default', broken: 'Unavailable',
  details: 'View details', start: 'Start conversation', close: 'Close', noDescription: 'No description provided.',
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

  nav: '数字员工', description: '选择助手，了解它的能力，在工作空间中开始对话。',
  loading: '正在加载数字员工…', error: '无法加载数字员工。', retry: '刷新', empty: '暂无可用的数字员工。',
  search: '搜索数字员工', builtIn: '内置', custom: '自建', default: '默认', broken: '不可用',
  details: '查看详情', start: '开始对话', close: '关闭', noDescription: '暂无描述。',
  persona: '人设', skills: '随包技能', noSkills: '未随包携带技能。',
  inventoryError: '无法加载助手详情。',
  chooseWorkspace: '选择工作空间', workspaceHint: '新对话将归属于所选工作空间。',
  noWorkspaces: '请先在侧栏创建工作空间。', workspaceLoading: '正在加载工作空间…', workspaceError: '无法加载工作空间。',
  starting: '正在开始对话…', startError: '无法开始对话。',
}
