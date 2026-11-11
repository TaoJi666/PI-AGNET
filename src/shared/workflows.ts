export type WorkflowSince = 'today' | 'week'

export type WorkflowValues = {
  file?: string
  since?: WorkflowSince
}

export type WorkflowNode = {
  id: string
  title: string
  detail: string
}

export type WorkflowWidget = 'file' | 'since'

export type Workflow = {
  id: string
  title: string
  summary: string
  nodes: WorkflowNode[]
  widgets: WorkflowWidget[]
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'read-file',
    title: '阅读文件',
    summary: '先看文件大小，再读全文或抽样，最后给出结论和引用',
    widgets: ['file'],
    nodes: [
      { id: 'pick', title: '选择文件', detail: '只接受当前工作区里的文件' },
      { id: 'read', title: '读取', detail: '大文件只保留开头和结尾' },
      { id: 'sum', title: '总结', detail: 'Pi 只根据已经读到的材料回答' }
    ]
  },
  {
    id: 'morning',
    title: '工作区早报',
    summary: '说明这个目录是做什么的、最近变了什么、今天该处理哪一件',
    widgets: ['since'],
    nodes: [
      { id: 'pick', title: '选择目录', detail: '使用当前工作区' },
      { id: 'about', title: '读取说明', detail: '读说明文件和项目配置' },
      { id: 'changes', title: '最近改动', detail: '按时间收集改过的文件' },
      { id: 'sum', title: '总结', detail: '合成一份三段早报' }
    ]
  },
  {
    id: 'boot',
    title: '启动检查',
    summary: '根据说明和脚本判断现在能不能启动，并列出缺什么',
    widgets: [],
    nodes: [
      { id: 'pick', title: '选择目录', detail: '使用当前工作区' },
      { id: 'read', title: '读取说明和脚本', detail: '不执行安装，也不假设依赖已经装好' },
      { id: 'sum', title: '总结', detail: '直接列出能不能启动、缺什么' }
    ]
  },
  {
    id: 'changes',
    title: '变更回顾',
    summary: '汇总最近改动，指出一个风险和一件要验证的事',
    widgets: ['since'],
    nodes: [
      { id: 'pick', title: '选择目录', detail: '使用当前工作区' },
      { id: 'changes', title: '最近改动', detail: '按时间列出文件，只摘录小文件' },
      { id: 'sum', title: '总结', detail: '做了什么、一个风险、一件验证' }
    ]
  },
  {
    id: 'todos',
    title: '待办整理',
    summary: '从文档和未完成标记里抽出待办，分成今天做和以后做',
    widgets: [],
    nodes: [
      { id: 'pick', title: '选择目录', detail: '使用当前工作区' },
      { id: 'scan', title: '扫描待办', detail: '查找未完成标记和未勾选事项' },
      { id: 'sum', title: '总结', detail: '分组，并写上出处文件' }
    ]
  }
]

export function findWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS.find((workflow) => workflow.id === id)
}
