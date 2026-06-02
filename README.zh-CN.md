[English](README.md) · 简体中文

# gtsx

**让 React UI 对你和你的 agent 都「看得见、读得懂」。**

每个组件在源码旁声明自己的视觉状态：Studio 负责渲染，CLI 负责校验与截图，agent 则把它们当作带类型的数据来读取。

> **TODO — 此处放置 Hero 图**
>
> 建议一张 Studio 截图：8～12 个真实组件排成网格，每张卡片并排展示多种状态
>（loading / ready / error / empty），让人一眼（约 2 秒内）感受到「全部都在这里」。
> 浅色主题，宽度约 1200px。若能做成循环切换 case 的 GIF，效果更好。

## 安装

把下面这段提示词交给项目里的 AI 编程 agent：

```
Install gtsx in this project. Fetch and install these Agent Skills from
https://github.com/tuoxiansp/gtsx:

- skills/setup-gtsx
- skills/authoring-gtsx
- skills/refactor-to-gtsx
- skills/design-gtsx

After installing them, run the newly installed `setup-gtsx` skill in this project.
```

agent 会自动识别你的 TypeScript 项目与 Host（Next.js 或 Vite），安装依赖、接入 `/gtsx/studio`，并完成端到端验证。

全程无需你手动改配置文件。

## 为什么需要 gtsx

**你看不见自己的 UI。**

一个 React 项目里往往有上百种视觉状态——loading、error、empty、overflow、permission-denied、RTL、dark mode 等——却没有一个地方能集中查看。Code review 只能看到 diff，设计师只能看到 Figma。每次想问「这到底长什么样」，都得先起 dev server、点一串路径，再花十分钟把上下文找回来。

这在以前就很烦人；在 agent 以机器速度写 UI 的今天，更是扛不住：新状态没人看过就上线了，旧状态悄悄退化也没人发现。正在改你 `Button` 的 agent，根本不知道 `Button` 在八种状态下分别应该长什么样。

gtsx 把这张地图还给你：每个组件在 TSX 旁声明视觉状态，Studio 渲染它们，CLI 校验并截图，agent 把它们当作一等公民的数据来读。

你会得到：

- **完整的 UI 地图。** Studio 枚举 TypeScript 项目中的每个组件、每种视觉状态，不必再猜「还有没有漏掉的」。
- **视觉状态即类型契约。** props 一改、cases 没跟上，编译阶段就会拦住。
- **预览不必再 mock。** loading、error、empty 等边界状态可直接渲染，无需为预览写 fetch mock。
- **对 AI 友好。** agent 无需启动你的应用，就能枚举、渲染、对比每一种视觉状态。
- **不另起一套构建。** 直接接入现有 Next.js / Vite 工具链——没有单独的 stories 目录，也没有第二份 config 要同步。

## 文档

- [Authoring Guide](docs/gtsx-authoring-guide.md) — 如何编写 pure / stateful / contextual 三类 `.g.tsx` 组件
- [Refactor Guide](docs/gtsx-refactor-guide.md) — 如何将现有 TSX 改造成 `.g.tsx`
- [Design](docs/gtsx-design.md) — gtsx 的设计模型、不变量，以及协议为何如此设计

## 贡献

本项目为 pnpm workspace。常用命令：`pnpm install && pnpm build && pnpm test && pnpm typecheck`。

子包：`@gtsx/core`（协议与 CLI）、`@gtsx/studio`（shell 与 manifest）、`@gtsx/adapter-vite-react`（Vite 适配器）、`@gtsx/adapter-next-react`（Next.js 适配器）。跨框架验证用例见 [`playground/`](playground/)。
