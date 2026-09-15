export const DEMO_DISCOVERIES = [
  {
    id: 'demo-discovery-1',
    eyebrow: '可能的观察',
    title: '有几次，你似乎先把复杂任务整理成可控的下一步',
    summary:
      '这些演示记录在相近的任务启动场景里，呈现出相似的动作顺序。它值得回看，但还不是关于你的结论。',
    state: 'available',
    stateLabel: '可回看',
    accent: 'gold',
    boundary: '描述的是记录之间可能存在的结构，不是性格判断。',
  },
  {
    id: 'demo-discovery-2',
    eyebrow: '待检验的解释',
    title: '先降低不确定性，可能比立刻行动更重要',
    summary:
      '这是一种对演示记录的理解方式。你可以回应、暂存，或回到原话重新判断。',
    state: 'unscored',
    stateLabel: '未评分',
    accent: 'lavender',
    boundary: '同一组记录也可能支持其他解释；这里保留不确定性。',
  },
] as const;

export const DEMO_EXTERNAL_REFERENCES = [
  {
    id: 'zhihu-demo-1',
    source: '知乎 · 外部参考',
    title: '内心如何适应自己的发展变化呢?',
    excerpt:
      '面对外部世界的不确定性，转向内心寻找确定性是一种有效的应对方式。先建立清晰的自我认知，再找到能够持续的生活节奏。',
    meta: 'perspectives · 2026-09-12',
    perspective: '提供另一个提问角度，不替你解释自己的经历。',
  },
  {
    id: 'zhihu-demo-2',
    source: '知乎 · 外部参考',
    title: '长期独自做独立游戏开发,很容易陷入自我内耗,该怎么破局?',
    excerpt:
      '把问题拆小，给自己一个可以完成的动作。进展不一定来自更用力，也可能来自更小的反馈回路。',
    meta: 'perspectives · 2026-09-12',
    perspective: '作为背景材料保留，不会成为关于你的个人证据。',
  },
] as const;
