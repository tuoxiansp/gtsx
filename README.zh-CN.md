[English](README.md) · 简体中文

# gtsx

**让你的 React UI 变得可知 —— 对你，也对你的 agent。**

每个组件声明自己的视觉状态 —— Studio 渲染，CLI 校验并截图，agent 当作类型化数据读取。

> **TODO —— 这里放 Hero 图。**
>
> 一张 Studio 截图：8–12 个真实组件排成网格，每张卡片并排展示多个
> 状态缩略图（loading / ready / error / empty），让眼睛在 2 秒内
> 读出"全部一览无余"的感觉。浅色背景，~1200px 宽。一段循环 cycle
> 各 case 的 GIF 比静态图更好。

## 安装

把下面这段提示词交给项目里的 AI 编程 agent：

```
Install gtsx in this project: install the `setup-gtsx`, `authoring-gtsx`,
and `refactor-to-gtsx` skills from the `gtsx` package, then run `setup-gtsx`.
```

agent 会自动检测你的 TypeScript 项目和 Host（Next.js 或 Vite），安装合适的包，接入 `/gtsx/studio`，并端到端验证集成是否正常。

你不用碰任何 config 文件。

## 为什么需要 gtsx

**你看不见自己的 UI。**

你的 React 项目里有几百种视觉状态 —— loading、error、empty、overflow、permission-denied、RTL、dark mode —— 但没有任何一个地方能让你真正看到它们。Code review 只看得到 diff。设计师只看得到 Figma。每次"这个长什么样？"的问题，都要花你一个 dev server、一串点击路径，加 10 分钟的 context 切换。

这件事以前就已经很痛。在 agent 用机器速度写 UI 的时代，它已经无法承受。新状态没人见过就发了出去；旧状态在静默中悄悄回归。那个正在编辑你 `Button` 的 agent，根本不知道 `Button` 在八种不同状态下应该长什么样。

gtsx 把这张地图还给你。每个组件都在自己的 TSX 旁边声明它的视觉状态。Studio 渲染它们，CLI 校验并截图它们，agent 把它们当作一等数据来读取。

你会得到：

- **一张完整的 UI 地图。** Studio 列举你 TypeScript 项目里每一个组件、每一种视觉状态。不用再猜还有什么藏着没见过。
- **视觉状态是一份带类型的契约。** props 一变、cases 没跟着改，编译直接失败。
- **预览不需要 mock。** loading、error、empty 和各种边缘状态都能渲染出来 —— 你不用写一行 fetch mock。
- **AI 可读。** agent 不用跑你的 app，就能列举、渲染、对比每一个视觉状态。
- **不引入第二套构建。** 直接接进你现有的 Next.js / Vite 工具链 —— 没有单独的 stories 目录，没有需要同步的 config。

## 文档

- [Authoring Guide](docs/gtsx-authoring-guide.md) —— pure / stateful / contextual 三种组件的写法
- [Refactor Guide](docs/gtsx-refactor-guide.md) —— 把现有 TSX 转成 `.g.tsx`
- [Design](docs/gtsx-design.md) —— 模型、不变量，以及协议为什么长成这样

## 贡献

pnpm workspace。`pnpm install && pnpm build && pnpm test && pnpm typecheck`。

包：`gtsx`（协议和 CLI）、`@gtsx/studio`（shell 和 manifest）、`@gtsx/adapter-vite-react`（Vite 适配器）。跨框架验证 fixtures 在 [`playground/`](playground/) 下。
