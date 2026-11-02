export type BuiltInIdea = {
  id: string
  title: string
  summary: string
  prompt: string
}

export const BUILT_IN_IDEAS: BuiltInIdea[] = [
  {
    id: 'brief',
    title: '工作区简报',
    summary: '用三句话说明这个目录在做什么',
    prompt:
      '阅读当前工作区的目录、说明文件和关键配置。用三句话说明它是做什么的，再列出 3 个最值得先看的文件，并说明原因。'
  },
  {
    id: 'changes',
    title: '变更回顾',
    summary: '找出最近值得注意的改动和风险',
    prompt:
      '查看当前工作区里最近修改过的文件。总结做了什么，指出可能的风险，并给出下一步最值得验证的一件事。'
  },
  {
    id: 'boot',
    title: '启动检查',
    summary: '判断现在能不能把项目跑起来',
    prompt:
      '根据项目说明、依赖和脚本，判断当前工作区现在能不能启动。缺少什么就直接列出，不要假设已经安装成功。'
  },
  {
    id: 'reading',
    title: '阅读建议',
    summary: '从文档里挑出今天值得读的内容',
    prompt:
      '在当前工作区的文档和笔记中挑选最多 4 份今天值得读的内容。每份用一句话说明为什么值得读，并给出文件路径。'
  },
  {
    id: 'todos',
    title: '待办整理',
    summary: '从文档和注释里抽出未完成事项',
    prompt:
      '从当前工作区的文档、注释和未完成标记中提取待办。按“今天要做”和“可以以后做”分组，每项注明出处。'
  }
]

export const MORNING_TASK = {
  title: '工作区早报',
  time: '09:00',
  prompt: '给今天的工作区写一份简短早报：目录是做什么的、最近有什么变化、今天最值得处理的一件事。'
}
