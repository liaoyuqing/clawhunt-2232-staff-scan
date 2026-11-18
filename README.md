# 员工扫码签到页（S3-MINI-060）

会员空间平台 · 会员小程序 v1 · 员工专用签到页。微信原生小程序 + TypeScript + TDesign 小程序组件。
页面路径：`pages/staff/scan?event_id=`。

> 全部数据为虚构示例，不含任何真实企业或个人信息；交付物中不出现客户名称。

## 一句话说明

员工在活动现场打开本页，连续扫码核销会员电子票：每种结果都有对应的全屏结果卡（颜色/文案/震动），
结果卡 1.5 秒后自动消失，连续扫码开启时立刻拉起下一次扫码；最近的扫码记录只存在内存里，不落本地缓存。

## 目录结构

```
src/
  app.ts / app.json / app.wxss  小程序入口与全局配置（仅一个页面）
  sitemap.json                页面索引配置
  auth/session.ts             登录后的角色会话（仅驻内存，页面不得从 URL query 取角色）
  types/wx.ts                 wx 能力的最小类型声明（不引入任何第三方 SDK）
  types/miniprogram.d.ts      小程序运行时全局函数声明（Page/App）
  api/client.ts               接口层：GET /api/mini/staff/events、POST /api/mini/staff/checkins
  mocks/events.ts             当天活动列表 mock（3 个虚构活动）
  mocks/checkins.ts           签到结果 mock（按票码前缀返回 8 种 result）
  components/result-card.ts   8 种结果卡的颜色 / 文案 / 图标 / 震动策略
  pages/staff/scan.ts         页面业务逻辑（纯 TS 类，可直接单元测试）
  pages/staff/scan.page.ts    小程序页面注册层（只做 setData 同步）
  pages/staff/scan.wxml       视图
  pages/staff/scan.wxss       样式
  pages/staff/scan.json       页面配置与 TDesign 组件声明
project.config.json           开发者工具工程配置（miniprogramRoot = src/）
tests/scan.test.ts            33 条单元测试
scripts/capture-screens.mjs   生成 8 张结果卡截图
scripts/capture-pages.mts     生成 4 张页面级截图（用真实页面逻辑跑出状态）
docs/screens/                 截图产物
docs/checks/                  验收证据（测试输出、类型检查输出、静态核对）
```

## 运行

环境：Node 20+（本次在 Node 24.22.2 上验证）。

```bash
npm install
```

依赖版本（见 `package.json`）：

| 包 | 版本 | 用途 |
| --- | --- | --- |
| typescript | ^5.6.3 | 类型检查 |
| vitest | ^2.1.8 | 单元测试 |
| @types/node | ^22 | 测试里的 setImmediate 等 Node API |
| playwright | 1.65.1 | 截图（仅开发用） |
| tdesign-miniprogram | ^1.18.0 | 页面组件（t-button / t-switch / t-popup），构建时由开发者工具「构建 npm」打包 |

## 测试

```bash
npm test          # vitest run，33 条用例
npm run lint      # tsc --noEmit，类型检查
```

本次执行结果（原始输出见 `docs/checks/npm-test.txt`、`docs/checks/tsc.txt`）：

```
Test Files  1 passed (1)
     Tests  33 passed (33)
```
```
tsc --noEmit  EXIT=0
```

## 截图

```bash
node scripts/capture-screens.mjs   # 8 张结果卡 -> docs/screens/result-*.png
node scripts/capture-pages.mts     # 4 张页面级截图 -> docs/screens/page-*.png
```

截图不是手画的静态图：结果卡截图直接复用 `src/components/result-card.ts` 的 `RESULT_CARDS` 定义渲染；
页面级截图先真实执行 `ScanPage` 得到状态，再按 `scan.wxml` 结构与 `scan.wxss`（rpx ÷ 2）渲染。
每张图右上角有一个小标签写着 `result · #hex`，作为取色核对的锚点。

## mock 对接点（真实接口上线后要改的地方）

两处接口均为「另单实现」，本单按工单要求先用 mock：

| 接口 | mock 位置 | 切换方式 |
| --- | --- | --- |
| `GET /api/mini/staff/events?date=` | `src/mocks/events.ts` | `src/api/client.ts` 里 `USE_MOCK = false` |
| `POST /api/mini/staff/checkins` | `src/mocks/checkins.ts` | 同上 |

`USE_MOCK = false` 后请求发往 `BASE_URL`（`src/api/client.ts` 顶部常量），只改这一处。
mock 的票码前缀约定（方便手工验各种结果）：

| 前缀 | 返回 result | 结果卡 |
| --- | --- | --- |
| `ok-` | ok | 绿 #07c160 · 签到成功 · 姓名企业 · vibrateShort |
| `dup-` | already_checked_in | 橙 #faad14 · 已签到 · 首次签到时间 |
| `exp-` | expired_code | 红 · 电子票已过期 · 提示「请会员刷新电子票」 |
| `wrong-` | wrong_event | 红 · 不是本场活动 · 提示应去的活动 |
| `bad-` | invalid_code | 红 · 无法识别的票码 · vibrateLong |
| `non-` | not_member | 红 · 该票不属于会员 · vibrateLong |
| `closed-` | event_closed | 红 · 活动已结束签到 · vibrateLong |
| 其它 | server_error | 红 · 签到失败 · vibrateLong |
| `err-network` | 抛错 | 提示「网络异常，请重试」，不在本地排队补交 |

## 逐条验收复现

### AC1 · 8 种 result 各有结果卡截图，颜色与文案符合 scope

产物：`docs/screens/result-*.png`（8 张）+ `docs/screens/manifest.json`。

| result | 文件 | 颜色 | 文案 | 震动 |
| --- | --- | --- | --- | --- |
| `ok` | `result-ok.png` | #07c160 | 签到成功 | vibrateShort |
| `already_checked_in` | `result-already_checked_in.png` | #faad14 | 已签到 + 首次签到 09:12 | 无 |
| `expired_code` | `result-expired_code.png` | #fa5151 | 电子票已过期 + 请会员刷新电子票 | 无 |
| `wrong_event` | `result-wrong_event.png` | #fa5151 | 不是本场活动 + 应去：2026 秋季会员对接会 | 无 |
| `invalid_code` | `result-invalid_code.png` | #fa5151 | 无法识别的票码 + 原因 | vibrateLong |
| `not_member` | `result-not_member.png` | #fa5151 | 该票不属于会员 + 原因 | vibrateLong |
| `event_closed` | `result-event_closed.png` | #fa5151 | 活动已结束签到 + 原因 | vibrateLong |
| `server_error` | `result-server_error.png` | #fa5151 | 签到失败 + 原因 | vibrateLong |

复现：

```bash
node scripts/capture-screens.mjs
cat docs/screens/manifest.json
```

颜色与文案的唯一来源是 `src/components/result-card.ts` 的 `RESULT_CARDS`，页面与截图都读它，
所以图和代码不会走样。对应单元测试：

- `RESULT_ORDER 恰有 8 种，且每种都有颜色、文案、图标与震动策略`
- `expired_code 的固定文案是「请会员刷新电子票」`

### AC2 · 连续扫码开启时结果卡消失后自动再次调用 wx.scanCode

对应单元测试（`tests/scan.test.ts`）：

- `开启时结果卡消失后自动再次调用 wx.scanCode` —— 伪 wx 记录 `scanCode` 调用次数：
  第一次扫码后为 1；把注入的 FakeTimer 推进 1500ms 后变为 2，且最近记录变为 2 条。
- `关闭后结果卡消失不再自动拉起` —— `setContinuous(false)` 后推进 5000ms，调用次数仍为 1。
- `默认开启连续扫码` —— `initialState().continuous === true`。

复现：

```bash
npm test -- -t "连续扫码"
```

实现位置：`src/pages/staff/scan.ts` 的 `scheduleNextScan()`，用可注入的 `Timer` 接口设定
`RESULT_CARD_DURATION = 1500` 毫秒的定时器，回调里在 `continuous && event && !permissionDenied` 时再次 `onScan()`。

页面层同步（返工 v3 补）：定时器回调里改完状态不会自动刷新界面，所以业务类新增 `onChange` 字段并在 10 处状态变更后调用 `emit()`，
页面注册层在 `onLoad` 里注册 `p.onChange = () => this.sync()`。直接验证这一点的 4 条用例在
`tests/scan.test.ts` 的 describe「页面注册层状态同步（返工修复：定时器回调必须 setData）」：
装载真实 `scan.page.ts`、记录每次 `setData` 的 patch，断言「1.5 秒后 patches 里出现 `card === null`」。
其中「定时器只清结果卡（不触发再扫）」那条是隔离用例——删掉定时器里的 `emit()` 它会失败，
另外几条不会，用它证明这条断言确实盯住了缺陷本身。

### AC3 · 非员工账号打开页面显示无权限并返回

对应单元测试：

- `只有 event_staff 与 site_admin 可以进本页` —— `canAccess('member')` / `canAccess(null)` 均为 false。
- `非员工打开页面：标记无权限、提示并返回上一页` —— 业务类上 `onLoad` 后 `state.forbidden === true`；
  `denyAndBack()` 触发 `showToast` 与 `navigateBack` 各一次。
- `非员工进入页面即提示无权限并自动返回上一页（不需要点按钮）` —— 页面注册层 `onLoad` 后
  直接断言 `forbidden === true` 且 `showToast`、`navigateBack` 均被调用（返工 v3 改为 `onLoad` 里直接 `denyAndBack()`，不再停在无权限页等用户点按钮）。

角色来源：`src/pages/staff/scan.page.ts` 的 `onLoad` **只从 `src/auth/session.ts` 的会话里取角色**，
不再读 URL query。因此 `pages/staff/scan?role=event_staff` 这类参数不会改变鉴权结果 ——
页面注册层对 query 只取 `event_id`，`role` 一律由登录态写入，见 `src/auth/session.ts` 的三个函数
`setSessionRole / getSessionRole / resetSession`。

界面证据：`docs/screens/page-forbidden.png`（显示「无权限 / 该页面只对活动工作人员开放 / 返回上一页」）。

复现：

```bash
npm test -- -t "无权限"
node scripts/capture-pages.mts && open docs/screens/page-forbidden.png
```

### AC4 · 最近扫码记录不调用 wx.setStorage 写入本地

静态核对（命令与完整输出见 `docs/checks/ac4-storage-grep.txt`）：

```bash
grep -rn "setStorage\|getStorage\|localStorage\|sessionStorage" src/
```

命中只有 3 条，全部在 `src/types/wx.ts` 的接口类型签名里（为了在测试中断言「没被调用」而声明），
页面、组件、接口层、mock 均无任何调用。

对应单元测试：

- `不调用 wx.setStorage / setStorageSync，也不读本地缓存` —— 连续扫码 3 次后断言
  `wx.setStorage`、`wx.setStorageSync`、`wx.getStorageSync` 三项调用次数均为 0（读取侧也纳入断言，
  防「写不进去但开机从缓存里读出来」的实现），内存记录数为 3。伪 wx 的 `getStorageSync` 会把 key 记进调用表，
  用例直接断言调用表里没有该类调用，而不是只看返回值。
- `最多保留 20 条，最新在最前` —— 25 次扫码后记录数恰为 20，首条是最新票码 `ok-24`。
- `扫码取消（用户返回）不产生记录也不推进连续扫码`。

复现：

```bash
npm test -- -t "本地缓存"
```

### AC5 · 相机权限被拒时出现去设置的引导

界面证据：`docs/screens/page-permission-denied.png`（页面顶部出现「相机权限未开启，无法扫码」+「去设置」按钮）。

对应单元测试：

- `失败原因含 auth/permission 时进入权限引导态` —— `wx.scanCode` 以 `auth deny` 失败后 `state.permissionDenied === true`。
- `引导调用 wx.openSetting，授权后清掉引导态` —— 调用 `openSetting()` 后伪 wx 记录到 `openSetting` 调用，
  且 `scope.camera` 授权后 `permissionDenied` 复位为 false。
- `权限被拒后连续扫码不自动重试，避免反复弹窗` —— 推进 2000ms 后 `scanCode` 次数仍为 1。

复现：

```bash
npm test -- -t "相机权限"
node scripts/capture-pages.mts && open docs/screens/page-permission-denied.png
```

## 返工 v3 改动（按买家 blocker）

| 问题 | 改动 | 位置 |
| --- | --- | --- |
| 【blocker】定时器回调里的状态变化没有交给界面 | 新增 `onChange` 字段与 `emit()`，状态变更后调用；页面层注册 `p.onChange = () => this.sync()` | `src/pages/staff/scan.ts`、`src/pages/staff/scan.page.ts` |
| 非员工需手点「返回上一页」 | `onLoad` 的 `!canAccess` 分支直接 `denyAndBack()` | `src/pages/staff/scan.page.ts` |
| 证据 | 重新执行 `npm test` 与 `npx tsc --noEmit` | `docs/checks/npm-test.txt`、`docs/checks/tsc.txt` |

`emit()` 的 10 个调用点：`onLoad` 的 finally、`switchEvent`、`onScan` 开头、扫码取消分支、checkin 失败分支、
checkin 成功尾部、`scheduleNextScan` 的定时器回调、`setContinuous`、`openSetting` 的 success 与 fail、`denyAndBack`。
用例数 29 → 33。
## 边界处理

| 情况 | 处理 |
| --- | --- |
| 扫码取消（用户点返回） | 不提交、不落记录、不推进连续扫码 |
| 解出空票码 | 视同取消，不提交 |
| 网络失败 | 页面提示「网络异常，请重试」，不在本地排队补交 |
| 相机权限被拒 | 顶部引导「去设置」，且连续扫码暂停自动重试，避免反复弹窗 |
| 未知 result | 降级为 `server_error` 红色结果卡，不抛异常、不白屏 |
| 已签到人数 | 只在内存里 +1，页面返回后以接口数据为准 |
| 最近记录超过 20 条 | 只保留最新 20 条，最早两条被淘汰 |
| 活动切换 | 顶部点击切换当天其他活动，切换后扫码提交带上新活动 id |

## 技术约定遵循

- **TypeScript strict**：`tsconfig.json` 开 `strict` 与 `noImplicitAny`，无 `any` 断言（`tsc --noEmit` EXIT=0）。
- **TDesign 小程序组件**：`scan.json` 声明 `t-button` / `t-switch` / `t-popup`。
- **不引入向境外发数据的第三方 SDK**：`wx` 能力用本仓库自写的 `src/types/wx.ts` 声明，零第三方运行时依赖。
- **颜色集中在变量**：8 种结果的颜色只在 `RESULT_CARDS` 里出现一次，视图与截图都引用同一份。
- **只用虚构数据**：mock 的活动、会员姓名、企业名均为虚构，并显式标注「（虚构）」。