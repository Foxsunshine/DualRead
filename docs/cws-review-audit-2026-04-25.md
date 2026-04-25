# Chrome Web Store 审查风险审计 — DualRead

> **状态**：DualRead v2.0.0 仍在 CWS "in review"（上传于 2026-04-22）。
> 本文档记录在审查期间对项目做的合规审计，**暂不落实修复**。
> 等审查结果出来后：
>   - **通过** → 归档本文档，v2.1.x 提交前按 P0 / P1 改；
>   - **不通过** → 按本文档的修复清单逐项动手。

**审计日期**：2026-04-25
**审计范围**：manifest.json / privacy-policy.html / store-listing.md /
`src/**/*.ts` / CSP / host_permissions / 已知 CWS "stuck in review" 高频原因
**审计者**：Claude（bug-hunter + security-review 组合思路）

> **后续修订（2026-04-25 / W5#3）**：源仓库的 `manifest.json` 已被
> `manifest.config.ts` + `.env.production` 取代（构建时注入 OAuth
> client_id + 后端 URL，避免明文进公开仓库）。本文档下文里的
> `manifest.json:行号` 引用是 v2.x 提审时的源码状态；W5+ 提审需要看
> `manifest.config.ts` 中的对应字段，但**最终给 CWS 的 dist/manifest.json
> 输出形状不变**，所以本文档的合规判断和 P0/P1 清单仍然有效。

---

## 背景

用户反馈：v2.0.0 上传 CWS 已 3 天，始终 "In review" 未放行。希望搞清楚
项目里哪些点可能是卡审的原因。本文档按**命中概率从高到低**给出发现 +
后续修复方案。

Chrome Web Store 不会对"代码实现细节"卡审——它几乎只会因为**权限、
元数据、隐私披露**三类问题进慢车道 / 拒审。代码 bug 顶多被用户差评，
不会阻塞审核。

---

## 🔴 高概率触发（确认存在问题）

### R1 — 声明了 `contextMenus` 但代码里没用

**证据**：

- `manifest.json:8`
  ```json
  "permissions": ["storage", "sidePanel", "contextMenus", "downloads"]
  ```
- `grep -rn "chrome.contextMenus\|contextMenus" src/` → 零命中
- `privacy-policy.html:44` 自己写了
  > **contextMenus** — reserved for right-click integrations in future
  > versions; unused in v1.

**为什么这是红旗**：CWS 的 "Use of Permissions" 策略明文要求
*权限只能在当前已发布版本实际使用时声明*，**不接受"为未来版本保留"**。
违反会收到审查员发的 `Blue Argon` 拒审邮件：
> *Your product was found to violate our 'Use of Permissions' policy…
> unused permission.*

在 privacy-policy 里"诚实坦白"反而是自曝其短——审查员会把这条作为
定罪证据，直接贴到拒审邮件里。

**修复方案（P0）**：

1. `manifest.json` `permissions` 数组里删除 `"contextMenus"`
2. `privacy-policy.html:44` 那一条 `<li>` 整条删掉（不要改成别的措辞，
   直接删）
3. 如果将来 v3+ 真的要加右键菜单，届时再在那一版 PR 里同时加回权限 +
   加回 privacy-policy 条目 + 同时实装代码

---

### R2 — Chrome Web Store Developer Dashboard 的 Privacy Practices 问卷

**观察到的外部证据**：无法从代码侧看到 dashboard 表单状态。
下面这些是 DualRead 这类扩展"上传后卡在审查"的**第二高频原因**，
需要用户自查：

**必须填 / 必须勾的项目（dashboard → Privacy practices 标签）**：

- [ ] **Single Purpose** 字段填写了一句话。推荐复制
      `store-listing.md:12-13` 那句："Help Chinese-speaking English
      learners look up, save, and review unknown words from any
      webpage."
- [ ] **What user data does your product collect?** 只勾 **Website
      content**（选中的英文单词 = website content）；其余 7 个选项都
      留空
- [ ] **Data Usage Certifications** 三个框必须全勾：
  - [ ] I do not sell or transfer user data to third parties, outside
        of the approved use cases
  - [ ] I do not use or transfer user data for purposes that are
        unrelated to my item's single purpose
  - [ ] I do not use or transfer user data to determine creditworthiness
        or for lending purposes
- [ ] **Privacy Policy URL** 必须是**可公开访问的 https URL**（不能只
      是仓库里的 `privacy-policy.html` 路径）。如果还没部署，最快的
      办法是开 GitHub Pages 在 `Foxsunshine/DualRead` 仓库根发布，
      URL 是 `https://foxsunshine.github.io/DualRead/privacy-policy.html`

只要这四项中有任一为空 / 未勾，CWS 会把条目扔进人工复审队列——扩展
代码再干净也出不来。

**修复方案（P0，仅用户可操作）**：登录
https://chrome.google.com/webstore/devconsole → DualRead → Privacy
practices 标签逐项核对。

---

### R3 — `<all_urls>` content script + 权限 justification

**证据**：

- `manifest.json:25` content script `matches: ["<all_urls>"]`
- `manifest.json:9` host_permissions 精确限定到
  `https://translate.googleapis.com/*`（这条是干净的）

**为什么是红旗**：`<all_urls>` 的扩展会自动被 CWS 分到**慢车道审查
队列**。7–21 天 in-review 是这个档位的"正常"等待时间。

DualRead 的用法（点词翻译 + 全网高亮）**合理且业内认可**，privacy-
policy.html:47 的说明也写得足够清楚。**但审查员不会去翻 privacy
policy——他们只看 dashboard "Permission justification" 文本框里你自己
写的那段话**。

**需要自查**（dashboard → Permissions justification）：

- [ ] **Content scripts (`<all_urls>`)** justification 框里贴了下面这段
      或等价说明：
      > The content script runs on all URLs so DualRead can (a) detect
      > the word the user clicks or selects, (b) render the in-page
      > translation bubble next to that word, (c) underline the user's
      > saved words on pages they visit, and (d) render the floating
      > learning-mode on/off button. The content script reads only the
      > text the user explicitly interacts with plus its immediate
      > surrounding sentence; nothing from the user's browsing is
      > transmitted anywhere except the selected word, which is sent to
      > Google Translate.
- [ ] **storage** justification：保存用户的生词本、设置、写缓冲
- [ ] **sidePanel** justification：显示 DualRead 主界面
- [ ] **downloads** justification：导出 CSV 生词本（用户主动触发）
- [ ] **host_permissions `translate.googleapis.com`** justification：
      翻译用户选中的词

每一项都要**单独**写，不能只写一次"see privacy policy"——审查员不会
点进去。

**修复方案（P1，仅用户可操作）**：dashboard 逐项填。

---

## 🟡 中概率触发

### R4 — `minimum_chrome_version: "139"` 可能让审查机器报错

**证据**：
- `manifest.json:7` `"minimum_chrome_version": "139"`（v2.1.1 本地新加）
- Chrome 139 是 2026 年 Q1 才发的较新版本

**风险场景**：CWS 审查员加载扩展用的 Chrome 如果还在 138 及以下，
会看到 "This extension requires Chrome 139 or newer" 的错误 → 直接拒
审。**这条只对 2.1.x 重新提交时有影响**，v2.0.0 当前审查不受此影响
（2.0.0 的 manifest 里没这个字段）。

**为什么我们加了 139**：`content-side chrome.sidePanel.open()` 需要
Chrome 139（v2.1.1 DL-5 用到）。

**修复方案（P1）**：

1. `manifest.json` `minimum_chrome_version` 下调到 `"120"`（或干脆
   删掉这个字段）
2. `src/content/index.ts` 已经有软降级：
   ```ts
   if (typeof chrome !== "undefined" && chrome.sidePanel &&
       typeof chrome.sidePanel.open === "function") { … }
   ```
   旧 Chrome 下走 background 广播 + `SESSION_KEY_PENDING_FOCUS`
   fallback，detail icon 体验降级但不崩

---

### R5 — 重新提交前 `manifest.json` version 必须 bump

**证据**：
- `manifest.json:4` `"version": "2.0.0"`（与已上传版本相同）

**风险**：如果 v2.0.0 审查不通过后直接把修改过的代码重新打包上传，
CWS 会拒：
> *Version must be higher than the previously uploaded version.*

**修复方案（P0，重新提交前）**：把 `"version"` 改成 `"2.1.1"`（或下
一个实际发版号）。同时确认 `package.json` 也同步。

---

### R6 — 上传 zip 里应该是 `dist/`，不是源码

**证据**：仓库根有 `dualread-v2.0.0.zip`（93 KB）。没展开内部结构，
但如果当初是直接 zip 根目录，里面会带 `src/*.ts` / `node_modules/` /
`.git/` —— 非常常见的错误。

**风险**：
- `.ts` 源码在扩展运行时根本跑不起来，审查员加载扩展会报错
- `node_modules` 动辄几百 MB，CWS 上传有大小限制
- `.git` 会暴露代码历史（潜在敏感信息泄漏）

**正确流程**：

```sh
npm run build                 # 产物进入 dist/
cd dist
zip -r ../dualread-v2.1.1.zip .   # 只 zip dist 的内容
```

**manifest.json 路径要指向 dist 产物**：`@crxjs/vite-plugin` 在 build
时会把 `src/content/index.ts` 重写为 `assets/index.ts-XXXXX.js` 并
更新 `dist/manifest.json`。上传 dist 里那个 manifest，不是仓库根的
那个。

**自查**：解压 `dualread-v2.0.0.zip` 看看根目录是不是
`manifest.json` + `assets/` + `icons/` + `src/sidepanel/index.html`；
如果是 `src/` + `node_modules/` + `package.json`，下次一定走上面的
正确流程。

---

## 🟢 低概率 / 已做对的事

记下来避免将来改动时破坏这些：

- ✅ **隐私政策内容扎实**：明确点名 Google Translate 是唯一外发终点，
  明确说了"no backend / no telemetry / no analytics"
- ✅ **无远程代码**：CSP `script-src 'self'; object-src 'self'` 正确
  限制；没有 `<script src="https://…">`、`eval`、`new Function`
- ✅ **host_permissions 精确**：只列 `translate.googleapis.com/*`，
  没用 `<all_urls>` 或 `https://*/*`
- ✅ **非敏感类目**：不是 crypto wallet、不是 VPN、不是 CAPTCHA
  solver、不是 cookie enumerator，没有触发 CWS 高敏分类
- ✅ **manifest_version: 3**：MV2 的扩展正在被全面下架，MV3 是正解
- ✅ **Single Purpose statement 在 store-listing.md 写清楚了**：
  "Help Chinese-speaking English learners look up, save, and review
  unknown words from any webpage."（需确认 dashboard 也贴了）
- ✅ **图标齐全**：16 / 48 / 128 三个尺寸都在，没有 manifest 引用了
  不存在的图标路径

---

## 决策：当前行动

**2026-04-25 当前**：v2.0.0 仍在审查。本文档**只记账不动手**。

**触发修复的条件**：

- 审查**通过** → 归档本文档到 `docs/archive/`；R1 / R2 / R3 / R4 /
  R5 / R6 留作下一轮 v2.1.1 提交前的 checklist，按 P0 → P1 顺序做
- 审查**不通过**（收到拒审邮件） → 立刻按本文档的修复清单**逐条**
  动手；R1 是代码层的，我可以代写；R2 / R3 是 dashboard 的，只有用户
  能操作

---

## 修复清单（等审查结果后启用）

### P0 — 代码 + 文档层（我可以代做）

- [ ] **R1**: `manifest.json` 删除 `"contextMenus"` 权限
- [ ] **R1**: `privacy-policy.html:44` 删除 contextMenus 那一条
- [ ] **R5**: `manifest.json` version bump 到 `"2.1.1"`（同时
      `package.json`）

### P0 — Dashboard 层（只有用户可做）

- [ ] **R2**: Single Purpose 字段填
- [ ] **R2**: Data Collection 勾 Website content
- [ ] **R2**: 勾三个 Data Usage Certifications
- [ ] **R2**: Privacy Policy URL 填公开 https 链接（建议 GitHub
      Pages）

### P1

- [ ] **R3**: dashboard 里每个权限单独写 justification（代码侧无改动）
- [ ] **R4**: `manifest.json` `minimum_chrome_version` 下调到 `"120"`
      或删除
- [ ] **R6**: 重新提交前走 `npm run build && cd dist && zip -r …`
      确保上传 dist 而非源码

### P2 — 提高通过率的加分项

- [ ] 在 store listing 的详细描述里加一段 `<all_urls>` 的使用说明
      （让普通用户也能看到，不只依赖 privacy policy）
- [ ] 准备 CWS 审查员能看的 demo 链接 / 截屏 GIF（yt 视频 / GitHub
      README 里嵌入），加速人工复审

---

## 参考

- CWS 政策主页：https://developer.chrome.com/docs/webstore/program-policies
- 最小权限原则：https://developer.chrome.com/docs/webstore/program-policies/permissions
- Blue Argon 拒审邮件模板（真实例子）：https://www.google.com/search?q=%22Blue+Argon%22+chrome+web+store
- 2024 CWS 数据使用披露更新：https://developer.chrome.com/docs/webstore/user-data-faq
