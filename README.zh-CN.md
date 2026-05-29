[English](README.md) · 简体中文

# gtsx

**让你的 React UI 一目了然 —— 你看得见，你的 agent 也看得见。**

每个组件都把自己的视觉状态写在身边，交给 Studio 渲染、CLI 校验和截图、agent 当成一等数据来读。

> **TODO —— 这里放一张 Hero 图。**
>
> 想要一张 Studio 截图：8 到 12 个真实组件铺成网格，每张卡片把多个
> 状态（loading / ready / error / empty）并排亮出来，让人 2 秒内就
> 读出"原来全都在这儿"的感觉。浅色背景、~1200px 宽。能用一段循环
> 切换 case 的 GIF 就更好。

## 安装

把下面这段提示词交给项目里的 AI 编程 agent：

```
Install gtsx in this project. Fetch and install these Agent Skills from
https://github.com/tuoxiansp/gtsx:

- skills/setup-gtsx
- skills/authoring-gtsx
- skills/refactor-to-gtsx

After installing them, run the newly installed `setup-gtsx` skill in this project.
```

agent 会自己认准你的 TypeScript 项目和 Host（Next.js 或 Vite），装好该装的包，把 `/gtsx/studio` 接进去，再端到端跑一遍验证。

整个过程，你不会动到一个 config 文件。

## 为什么需要 gtsx

**你其实看不见自己的 UI。**

一个 React 项目里随便就有几百种视觉状态 —— loading、error、empty、overflow、permission-denied、RTL、dark mode —— 可这些状态没有一处地方能集中看见。Code review 看到的是 diff，设计师看到的是 Figma。每问一次"这到底长什么样"，就得起一个 dev server、点开一串路径，再花十分钟把脑子切回来。

这事儿以前就够难受了。如今 agent 以机器速度产出 UI，已经彻底压不住：新状态没人见过就上了线，老状态悄悄退化也没人察觉。那个正在改你 `Button` 的 agent，根本没见过 `Button` 的八种状态长什么样。

gtsx 把这张地图还给你。每个组件都在自己 TSX 旁边把视觉状态写得清清楚楚 —— Studio 把它们渲染出来，CLI 校验并出截图，agent 把它们当成一等数据来读。

你会得到：

- **一张完整的 UI 地图。** Studio 把你 TypeScript 项目里每一个组件、每一种视觉状态都摊开给你看，不必再猜还藏着什么。
- **视觉状态是一份带类型的契约。** props 一动、cases 没跟上，编译第一时间就拦下来。
- **预览不再需要 mock。** loading、error、empty 这些边缘状态都能直接渲染出来，不用为预览写一行 fetch mock。
- **对 AI 友好。** agent 不必启动你的 app，就能枚举、渲染、对比每一个视觉状态。
- **不引入第二套构建。** 直接挂进你现有的 Next.js / Vite 工具链 —— 不另开 stories 目录，也没有第二份 config 要同步。

## 文档

- [Authoring Guide](docs/gtsx-authoring-guide.md) —— 怎么写 pure / stateful / contextual 三种 `.g.tsx` 组件
- [Refactor Guide](docs/gtsx-refactor-guide.md) —— 怎么把现有 TSX 改造成 `.g.tsx`
- [Design](docs/gtsx-design.md) —— gtsx 的设计模型、不变量，以及协议为什么这么设计

## 贡献

pnpm workspace。常用命令：`pnpm install && pnpm build && pnpm test && pnpm typecheck`。

子包：`@gtsx/core`（协议与 CLI）、`@gtsx/studio`（shell 与 manifest）、`@gtsx/adapter-vite-react`（Vite 适配器）。跨框架的验证 fixtures 都放在 [`playground/`](playground/) 下。
