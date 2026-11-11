export type BuiltInIdea = {
  id: string
  title: string
  summary: string
  prompt: string
}

export const BUILT_IN_IDEAS: BuiltInIdea[] = [
  {
    id: 'read-file',
    title: '阅读文件',
    summary: '打开「阅读文件」工作流',
    prompt: ''
  },
  {
    id: 'morning',
    title: '工作区早报',
    summary: '打开「工作区早报」工作流',
    prompt: ''
  },
  {
    id: 'boot',
    title: '启动检查',
    summary: '打开「启动检查」工作流',
    prompt: ''
  },
  {
    id: 'changes',
    title: '变更回顾',
    summary: '打开「变更回顾」工作流',
    prompt: ''
  },
  {
    id: 'todos',
    title: '待办整理',
    summary: '打开「待办整理」工作流',
    prompt: ''
  }
]

export const MORNING_TASK = {
  title: '工作区早报',
  time: '09:00',
  prompt: '运行工作流「工作区早报」',
  workflowId: 'morning'
}
