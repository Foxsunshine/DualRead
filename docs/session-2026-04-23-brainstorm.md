# 2026-04-23 · v2.0.1 patch notes

v2.0.0 上架后三个磨损点的小修补。补记录，方便以后回头看为什么这么改。

详情都折叠在 🔍 里，点开看实现。

---

## 1. 气泡的「打开详情」→ 图标

已保存词气泡里原本的「打开详情 / View details」文本链接换成了 icon-only 按钮
（open book 线条图），和旁边的 Save 按钮视觉对齐，不再抢戏。

<details>
<summary>🔍</summary>

- 触点：`src/content/bubble.ts`（`showDetailLink` 分支）、`src/content/bubbleStyles.ts`
- CSS 类名迁移：`dr-bubble__link` → `dr-bubble__detail`
- Icon：16×16 inline SVG，line-art 开本造型，`currentColor` 跟随主题
- A11y：`title` + `aria-label` 双写 —— 桌面 hover 能看到 tooltip，屏幕阅读器也拿得到可读名
- 尺寸：6px padding + 16px glyph ≈ 28×28；靠 `align-items: center` 吸收与 Save 的高度差
- Hover 态：soft chip（`borderSoft` 背景 → `accent` 文字），不用边框，保持气泡的轻量感

</details>

---

## 2. 高亮的文本长度限制

新增 `isHighlightable(key)` 谓词 —— 长句、多词短语、非拉丁脚本的条目
**仍然保存在 Vocab 和 CSV 导出里**，但 **高亮引擎跳过不处理**。

筛选规则：

- **脚本**：仅 Latin（`\p{Script=Latin}` + 组合符 + `'` + `-` + 空格）；
  CJK 等脚本 V8 的 `\b` 本来就没语义，留着只是空转
- **长度**：按空白分词后 token 数 ≤ 3；覆盖 `give up` / `in spite of` 这类短语，
  放过整句引用
- **数字**：不匹配 `2024` / 版本号等纯数字串

<details>
<summary>🔍</summary>

- 新文件：`src/shared/highlightable.ts`（含完整注释，说明为什么是 ≤ 3 token）
- 测试：`src/shared/highlightable.test.ts` —— 拉丁/CJK/数字/长度边界全覆盖
- 单一事实来源：content script 构建匹配正则时消费它；Vocab 列表将来也可以用同一个
  函数给行打「此项不参与高亮」的注释，避免用户困惑
- 为什么不直接丢：用户可能是故意存了整句当参考，删了会损失数据；只是让它不上网页高亮而已
- 为什么是 3 而不是 2 或 5：phrasal verb 的常见长度 —— `give up on`、`in spite of`
  正好 3 token；超过基本就是引用或整句，高亮了也碰不到第二次

</details>

---

## 3. Settings 里的反馈入口

Settings 页面在 Danger Zone 上方新增「反馈 / Bug 报告」板块，两行联系方式：

- ✉ `mailto:jiang.ch2022@gmail.com`（subject 预填 `DualRead`）
- ↗ `https://github.com/Foxsunshine/DualRead/issues`（新标签页打开）

<details>
<summary>🔍</summary>

- 触点：`src/sidepanel/screens/Settings.tsx`、`src/sidepanel/styles.css`
  （新增 `.dr-contact`、`.dr-contact__row`、`.dr-contact__link`）
- i18n：新增 `feedbackTitle` key（zh-CN / en 双语）；地址和 URL 字面渲染，不参与翻译
- Icon：inline SVG（信封、外链方框），14×14，`currentColor`，不额外引用图标库
- GitHub 链接带 `target="_blank" rel="noopener noreferrer"`，防止反向 tab-nab
- 位置：放在 Danger Zone 之上 —— 用户要清数据之前多半先想吐槽一下，入口就在那里

</details>

---

## 未动项（继续留给后续）

- R3 SPA 高亮性能 benchmark
- v2.0.0 full smoke sweep
- v1.2 延后队列：F4 跳回源 URL、FAB per-domain hide、Playwright extension e2e
