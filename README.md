# 见渊（Personal Awareness）

见渊是一条从用户自己的话出发，经过可能线索与外部视角，最后把解释权交还给用户的个人觉察体验。

## 产品概念

“见”代表看见、注意到与重新回望；“渊”代表经验中可能存在、却尚未被注意到的更深层次。

见渊不替用户判断“你是什么样的人”，也不把可能性包装成结论。它把用户愿意留下的表达、记录之间可能值得回看的线索、外部参考和个人回应放在清晰分开的环节中，让用户保留最终解释权。

## 核心流程

```text
Capture → Awareness → References → Reflection
```

- **Capture**：从用户自己的话开始，记录一段愿意之后重看的表达。
- **Awareness**：展示演示记录之间可能值得回看的观察或待检验解释，不做人格判断。
- **References**：引入知乎等外部内容作为背景与视角；外部参考不会成为用户身份或个人结论。
- **Reflection**：由用户回应这条线索。当前演示中的回应只保留在页面/浏览器会话内，不上传、不写入数据库。

## 架构概览

项目按领域、应用、基础设施和展示层分层组织：

- 领域层负责 Evidence、Relation、Hypothesis、Discovery、Reflection 等核心语义边界。
- 应用层编排捕获、发现、外部参考和反思流程。
- 基础设施层提供持久化边界与外部参考适配；知乎内容作为 External Reference 与个人材料隔离。
- Presentation Layer 使用 Next.js/React 展示竞赛 Demo，并提供 Capture、Awareness、References、Reflection 路由。

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Vitest
- Prisma 7
- Cloudflare Pages（部署目标）

## 当前 Demo 状态

当前网页是用于竞赛展示的完整引导式 Demo，使用确定性的竞赛 fixtures 来展示产品结构。它包含 Awareness、Discovery、知乎 External Reference、刘看山展示角色，以及 Reflection 回应交互。

当前版本的边界：

- 当前 Demo 使用竞赛演示数据，不代表真实用户分析。
- 尚未接入 AI 推理，也不需要 AI API key。
- 不提供账户、登录或个人数据采集；当前 Capture 与 Reflection 内容只保留在页面/浏览器会话中。
- 外部参考只提供背景、知识与观点，不会自动转化为个人结论。

## 在线演示

[Cloudflare Pages Demo](https://personal-awareness-demo.pages.dev)

## 本地开发

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:3000`。

## 验证命令

```bash
npm run typecheck
npm test
npm run build
```

## 项目定位

见渊当前是一个保持不确定性、强调用户控制和个人反思的竞赛 Demo。系统可以提出值得回看的可能线索，但意义与最终判断始终由用户自己决定。
