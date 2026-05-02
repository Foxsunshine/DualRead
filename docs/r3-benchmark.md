# R3 Benchmark — Highlight engine perf on real SPAs

DESIGN.md §9 / R3 要求：在 Twitter/X feed 和 YouTube comments 上实测 highlight engine 的性能，确认 `scanAll` <120 ms（普通文章）/ <300 ms 持续（SPA）。

不是硬发版门槛，是**风险保险**。真实用户装机前自己先过一遍，避免商店早期差评里出现"慢"。

---

## 0. 准备（2 分钟）

先用最新代码：

```sh
nvm use 20 && npm run build
```

Chrome → `chrome://extensions` → 开发者模式 ON → **Load unpacked** → 选 `dist/`（不是项目根目录）。

---

## 1. 塞一批测试词（3 分钟）

引擎只在命中词够多、词表够大时才会暴露问题。空词表测不出东西。

打开一个普通网页（比如 Wikipedia 英文首页），side panel 打开，用鼠标选几十个常见英文词然后点 Save。目标 **30–60 个高频词**，保证在 Twitter / YouTube 上几乎每条推文/评论都能命中 1–3 个。

推荐塞这批（覆盖高频 + 长度混合）：

```
the, and, that, have, with, this, from, they, would, there,
about, which, their, what, when, more, some, time, very, like,
just, over, think, people, really, something, because, before,
after, right, through, little, every, world
```

---

## 2. 录 Twitter / X（3 分钟）

1. 打开 `https://x.com/home`（登录状态，有 feed 内容）。
2. F12 打开 DevTools → **Performance** 面板。
3. 左上角 ⚙️ → 把 **CPU** 从 "No throttling" 改成 **"4x slowdown"**（模拟中低端机器，这是真用户体验）。
4. 点 Record（Cmd+E 或左上圆点）。
5. **快速滚动 feed 10 秒**——Page Down 或鼠标滚轮都行，节奏要像正常刷推特。
6. 停止录制。

**看什么：**

- 主时间线上找 **红色三角的 Long Tasks**（>50 ms 的脚本块）。
- 点一个红块，底下 Bottom-Up 视图按 Total Time 排序。
- **找 `dr-hl` / `highlight.ts` / `scanSubtree` / `wrapTextNode` / `MutationObserver` 相关条目。**

**判定标准：**

| 场景 | 判定 |
|---|---|
| 没看到任何 `highlight.ts` 相关红块 | ✅ 通过 |
| 看到 `scanSubtree` / `wrapTextNode`，但单次 <50 ms | ✅ 通过 |
| 单次 `scanSubtree` 50–100 ms 零星出现 | ⚠️ 边缘，能发但记小本 |
| 持续出现 >100 ms 的 `scanSubtree`，或总 Scripting 占比 >40% | ❌ 必须 fallback |

---

## 3. 录 YouTube 评论（2 分钟）

1. 随便打开一个热门视频（评论数 5000+，比如任何千万播放的 MV）。
2. 滚到评论区，等第一批加载完。
3. DevTools → Performance → Record。
4. **连续点 3–4 个评论的 "Show replies"（展开回复）**。
5. 停止录制。

**看什么：**

- 每次点击后那一帧的 Long Task。
- 找 `MutationObserver` callback / `scanSubtree` 触发点。

**判定标准同上。** 特别要注意：评论展开是个**纯 DOM 插入**，MO 100 ms debounce 后会一次性扫整批回复——这是引擎里最容易爆的场景。

---

## 4. 录长文章（1 分钟，可选但推荐）

测初次加载：

1. 打开一篇长 Medium 或 New York Times 文章（长到要滚屏 5 次以上）。
2. DevTools → Performance → Record。
3. **F5 刷新页面**。
4. 等页面完全加载 + 手动滚到底。
5. 停止。

**看什么：** 找 `document_idle` 之后的第一次 `scanAll`。单次应该 <120 ms。

---

## 5. 快速判定流程图

```
录完三段 → Performance 面板顶部时间线看整体
  ├─ 没有红色 Long Task 块 ────────────────────── ✅ 通过，发版去
  ├─ 有红块，但 Bottom-Up 里 dualread 相关 <50 ms ─ ✅ 通过
  └─ 有红块，dualread 占大头 ──────────────────── ⚠️ 截图 flame chart，走 fallback
```

---

## 6. 更懒的替代（30 秒版）

打开 Twitter，**开着 extension 滚 30 秒**，再**关掉 extension**（`chrome://extensions` 切开关）滚 30 秒。体感对比。如果你自己都感觉不出区别，用户更感觉不出。

这不严谨但很有效——眼睛是最便宜的 profiler。

---

## 7. 失败后的 fallback 路径

如果 §2 / §3 任意一个场景判定 ❌，走 viewport-only 扫描：

- `IntersectionObserver` 门控 `scanSubtree`——只扫进入视口的子树，滚出视口的标记为"待扫"。
- MO 收到的 added nodes 先按"是否在视口内"分桶，在外的延迟到进入视口才处理。
- 大约 30 分钟工作量，改动集中在 `src/content/highlight.ts` 的 `scheduleMoFlush` 和 `scanAll` 两处。

---

## 8. 结果记录模板（自用）

录完贴一行到这里，将来复测有对比：

```
日期: 2026-04-__
词表大小: __
CPU throttle: 4x
Twitter feed 滚动: pass / marginal / fail   峰值 scanSubtree: __ ms
YouTube 评论展开: pass / marginal / fail    峰值 MO flush: __ ms
长文章初次扫描: pass / marginal / fail       scanAll: __ ms
结论: 可发 / 需 viewport-only fallback
```
