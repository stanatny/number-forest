# 扩展章节

章节由两部分组成：`NumberForestCore.registerChapter()` 注册题目规则；界面可以复用内置 `kind`，也可以通过 `NumberForestViews.register()` 注册新的场景。入口、五题一轮、提示、纠错、关联算式和本机记录由应用共用。

## 先复用现有场景

新建 `src/chapters/picnic-add.js`，注册一个独立章节：

```js
NumberForestCore.registerChapter({
  id: 'picnic-add',
  title: '野餐准备',
  subtitle: '把两篮放在一起',
  description: '用 5 以内的两部分练习合起来。',
  accent: '#47866d',
  level: '5 以内',
  generator({ integer }) {
    const a = integer(0, 5);
    const b = integer(0, 5 - a);
    const total = a + b;
    return {
      kind: 'add',
      prompt: `原来有 ${a} 颗，又送来 ${b} 颗，一共有几颗？`,
      instruction: '可以先把两篮合起来，再数一数。',
      answer: total,
      maxAnswer: 5,
      model: { a, b },
      relations: [`${a} + ${b} = ${total}`, `${total} − ${b} = ${a}`],
      hint: `从 ${a} 开始，再往后数 ${b} 个。`,
      success: `两部分合起来有 ${total} 颗。`
    };
  }
});
```

在 `index.html` 中按以下顺序加载。保持普通脚本和相对路径，才能继续直接用 `file://` 打开：

```html
<script defer src="src/core.js"></script>
<script defer src="src/views.js"></script>
<script defer src="src/audio.js"></script>
<script defer src="src/chapters/picnic-add.js"></script>
<script defer src="src/app.js"></script>
```

`id` 必须唯一且非空。使用简短的英文字母、数字和连字符作为 ID；它也用作本机记录的键。`title`、`subtitle`、`description`、`accent`、`level` 是章节元数据。注册器还保存 `icon`，但当前主页使用应用内的图标映射，新章节会获得默认图标。独立的提示文案、小收藏和屏幕外活动目前位于 `app.js`，未配置时会使用通用文案。

内置场景需要以下模型：

| `kind` | `model` | 约束 |
| --- | --- | --- |
| `bonds` | `{ total, visible }` | `0 ≤ visible ≤ total`，答案为 `total − visible`。 |
| `add` | `{ a, b }` | 非负整数，答案为 `a + b`。 |
| `subtract` | `{ a, b }` | `0 ≤ b ≤ a`，答案为 `a − b`。 |
| `groups` | `{ perGroup, groups, previousGroups }` | `previousGroups = groups − 1`，答案为 `perGroup × groups`。 |
| `sharing` | `{ total, groups, perGroup }` | 份数为正整数，`total = groups × perGroup`，答案为每份数量。 |
| `clock` | `{ hour, minute }` | 当前内置答案界面支持 `hour` 为 1–12、`minute` 为 0 或 30，答案编码为 `hour × 60 + minute`。 |

题目需提供 `kind`、`prompt`、`instruction`、`answer`、`maxAnswer`、`model`、`relations`、`hint`、`success`。`answer` 与 `maxAnswer` 必须是非负整数，且答案不能超过上限。普通数字面板会显示从 0 到 `maxAnswer` 的全部按钮，因此应使用合适的上限。

生成器可读取 `round`（从 0 开始）、`integer(min, max)`（含两端）、`random()` 和 `challenge`。目前应用每轮传入题序，`challenge` 默认为 `false`；测试可注入随机函数以复现题目。继续探索依赖已保存的种子重新生成同一题，因此题目中的随机选择必须使用传入的 `integer()` 或 `random()`，不要直接调用 `Math.random()` 或按当前时间出题。生成器保持纯逻辑，不访问 DOM、本机存储或网络。

## 添加新的操作场景

如果现有画面不能表达新的数量关系，为题目设置新的 `kind`，然后在 `app.js` 加载之前注册渲染器。例如，将上例的 `kind` 改为 `picnic-add-scene`，再添加：

```js
NumberForestViews.register('picnic-add-scene', {
  render(ctx) {
    const { a, b } = ctx.task.model;
    const joined = ctx.solved || ctx.local.joined;
    return `<div class="scene">
      <div class="scene-note">${joined ? '两部分合起来' : '两部分分开看'}</div>
      <div class="basket-fruit" role="img" aria-label="${a} 颗和 ${b} 颗松果">
        ${ctx.acorns(a)}
        ${joined ? '' : '<span class="operator-symbol">＋</span>'}
        ${ctx.acorns(b)}
      </div>
      ${ctx.solved ? '' : '<button class="secondary-button" data-picnic-toggle>合起来／分开看</button>'}
    </div>`;
  },
  bind(root, ctx) {
    const button = root.querySelector('[data-picnic-toggle]');
    if (button) button.onclick = () => ctx.update({ joined: !ctx.local.joined });
  }
});
```

`register(kind, view)` 要求唯一的 `kind` 和 `render(ctx)` 函数。应用会优先寻找注册的渲染器，再使用内置场景。避免占用已有 `kind`，以免影响其他章节。

| 渲染器方法 | 行为 |
| --- | --- |
| `render(ctx)` | 必需，返回场景 HTML；答对后仍会调用，可用 `ctx.solved` 展示完成状态。 |
| `answer(ctx)` | 可选，返回答案区域 HTML；省略时使用默认数字面板。 |
| `bind(root, ctx)` | 可选，在每次页面渲染后绑定该场景的操作。`root` 是页面的 `main` 元素。 |

`ctx` 提供以下字段与方法：

- `task`：当前题目；视图读取它，不应修改题目规则或正确答案。
- `solved`、`hinted`：当前是否答对、是否点过提示。
- `local`：本题专用的交互状态，新题开始时为 `{}`。当前自定义状态只在内存中保存，刷新后继续探索会重置为 `{}`；内置场景的摆放状态另有持久化。使用简单数据，避免保存 DOM 节点、函数或循环引用。
- `update(patch)`：将字段合并到 `local` 并重新渲染。不要直接修改 `local` 后期待页面自动刷新。
- `escape(value)`：转义插入 HTML 的文字。
- `acorns(count, className)`：生成松果图形；需自行提供让读屏可理解的数量说明。
- `announce(text)`：把操作结果交给页面的无障碍播报区域。

每次渲染都会替换游戏 DOM，事件需在 `bind` 中重新绑定。视图返回的 HTML 应来自受信任的代码；动态文字使用 `escape()`。按钮使用原生 `<button>`，为图形操作补上清晰的标签，并验证触摸和键盘操作。

若自定义章节必须恢复排列、拖动位置或多步进度，需要先扩展并验证会话存储接口，不能把内置章节的恢复行为直接当作自定义 `local` 的保证。

自定义 `answer(ctx)` 时，用 `<button data-answer="整数">选项文字</button>` 提供答案。应用会处理选择、确认按钮、提示和正确性检查；不要再创建 `check-button` 或 `hint-button`。当前通用检查只比较整数答案，不支持章节自带的检查函数。若新任务需要验证排列、拖动位置或多步操作，须扩展检查接口及测试，不能只在视图中显示“完成”。

## 扩展前后的验证

先明确这个章节希望孩子观察的数量关系，再添加题目和图形。乘法保持“每组数量 × 组数”，平均分保持全部分完、各份相等；时钟的时针角度为 `(hour % 12) × 30 + minute / 2`。

为生成器添加 Node.js 测试，覆盖范围两端、0、重复随机样本、答案边界和关联算式。新增独立章节脚本时，可先加载 `src/core.js` 再加载章节文件；核心会同时提供 CommonJS 导出和 `globalThis.NumberForestCore`。

```bash
node --test tests/*.test.cjs
```

浏览器中完成一整轮，并检查答错后修正、使用提示、操作后答题、返回主页和本机记录。新交互还需检查操作状态与数字答案是否一致。分别用电脑、iPad 尺寸和窄屏验证布局及触摸目标，并检查从本地文件和仓库子路径打开时的资源加载。

新增文件放在 `src/`、`styles/` 或 `assets/` 时，会随现有发布白名单打包；新增运行时顶层目录则需同步更新 `scripts/build-site.mjs`。运行 `npm run build` 生成 `.local/site`，检查入口资源及 `version.json`，然后把该目录内容提交到 `gh-pages` 分支根目录发布。源码和文档保留在 `main`；网站只包含运行文件、`LICENSE`、`.nojekyll` 与版本信息。
