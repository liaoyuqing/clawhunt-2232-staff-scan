# 交付说明 ·【S3-MINI-060】员工扫码签到页（连续扫码、结果卡与震动反馈）

已完成 pages/staff/scan?event_id= 的全部范围，5 条验收标准逐条对应到实现位置、自动化用例与可复现证据。
仓库：https://github.com/liaoyuqing/clawhunt-2232-staff-scan（公开，含全部源码、用例、截图与证据文件）
技术栈：微信原生小程序 + TypeScript(strict) + TDesign 小程序组件（t-button / t-switch / t-popup）。零第三方运行时依赖，wx 能力用本仓库自写的类型声明，不引入任何向境外发送数据的 SDK。全部数据为虚构示例，交付物中不出现客户名称。

## 一、交付物清单与位置

| 交付物 | 位置 |
| --- | --- |
| 页面代码 | src/pages/staff/scan.ts（业务逻辑，可直接单测）、scan.page.ts（Page 注册层）、scan.wxml / scan.wxss / scan.json |
| 结果卡组件与 8 种结果定义 | src/components/result-card.ts |
| mock 数据 | src/mocks/events.ts（当天活动）、src/mocks/checkins.ts（8 种 result） |
| 8 种结果卡截图 | docs/screens/result-*.png + manifest.json |
| 页面级截图 | docs/screens/page-main.png、page-permission-denied.png、page-forbidden.png、page-card-overlay.png |
| 单元测试 | tests/scan.test.ts（33 条） |
| 执行证据 | docs/checks/npm-test.txt、tsc.txt、ac4-storage-grep.txt |
| README | README.md（运行、测试、mock 对接点、逐条验收复现） |

## 二、逐条验收：实现 → 证据 → 复现

### AC1 · 8 种 result 各有结果卡截图，颜色与文案符合 scope
实现：src/components/result-card.ts 的 RESULT_CARDS 是颜色与文案的唯一来源，页面与截图脚本都引用它，图和代码不会走样。
8 种：ok #07c160「签到成功」+姓名企业+vibrateShort；already_checked_in #faad14「已签到」+首次签到时间；expired_code #fa5151「电子票已过期」+提示「请会员刷新电子票」；wrong_event #fa5151「不是本场活动」+应去的活动；invalid_code / not_member / event_closed / server_error 均 #fa5151 红底+原因+vibrateLong。
证据：docs/screens/result-ok.png、result-already_checked_in.png、result-expired_code.png、result-wrong_event.png、result-invalid_code.png、result-not_member.png、result-event_closed.png、result-server_error.png，共 8 张；manifest.json 记录每张的 result/颜色/文案/震动策略。每张图右上角带「result · #hex」标签作为取色核对锚点。
复现：node scripts/capture-screens.mjs && cat docs/screens/manifest.json

### AC2 · 连续扫码开启时结果卡消失后自动再次调用 wx.scanCode（单元测试 mock wx API）
实现：src/pages/staff/scan.ts 的 scheduleNextScan()，用可注入的 Timer 接口设定 RESULT_CARD_DURATION=1500ms 定时器；回调里在 continuous && event && !permissionDenied 时再次 onScan()。开关默认开启（initialState().continuous=true）。
单元测试（tests/scan.test.ts，mock wx API 记录 scanCode 调用次数）：
- 「开启时结果卡消失后自动再次调用 wx.scanCode」：第一次扫码后调用次数=1，推进 1500ms 后=2，最近记录变为 2 条。
- 「关闭后结果卡消失不再自动拉起」：setContinuous(false) 后推进 5000ms，调用次数仍为 1。
- 「默认开启连续扫码」：initialState().continuous===true。
复现：npm test -- -t "连续扫码"

### AC3 · 非员工账号打开页面显示无权限并返回（单元测试或录屏）
实现：canAccess(role) 只认可 event_staff 与 site_admin；onLoad 收到其他角色时置 forbidden=true；denyAndBack() 调 wx.showToast({title:"无权限"}) 与 wx.navigateBack({delta:1})。视图 scan.wxml 的 forbidden 分支显示「无权限 / 该页面只对活动工作人员开放 / 返回上一页」。
单元测试：「只有 event_staff 与 site_admin 可以进本页」（event_staff、site_admin 为 true；member、null、undefined 为 false）；「非员工打开页面：标记无权限、提示并返回上一页」（onLoad({role:"member"}) 后 forbidden=true，denyAndBack() 触发 showToast 与 navigateBack 各一次）。
界面证据：docs/screens/page-forbidden.png。
复现：npm test -- -t "无权限"

### AC4 · 最近扫码记录不调用 wx.setStorage 写入本地（单元测试）
实现：最近 20 条记录只存在 ScanPage.state.recent 内存数组中（RECENT_LIMIT=20，新记录在前，超出淘汰最早的）。页面、组件、接口层均无任何本地存储调用。
静态核对（完整命令与输出见 docs/checks/ac4-storage-grep.txt）：grep -rn "setStorage|getStorage|localStorage|sessionStorage" src/ 只命中 3 条，全部是 src/types/wx.ts 第 23/24/25 行的接口类型签名（为在测试中断言「没被调用」而声明），业务代码零调用。
单元测试：「不调用 wx.setStorage / setStorageSync，也不读本地缓存」（连续扫码 3 次后在伪 wx 上断言两项调用次数为 0，内存储记录数为 3）；「最多保留 20 条，最新在最前」（25 次扫码后记录数恰为 20，首条为最新票码）；「扫码取消（用户返回）不产生记录也不推进连续扫码」。
复现：npm test -- -t "本地缓存"

### AC5 · 相机权限被拒时出现去设置的引导（截图）
实现：wx.scanCode 失败原因匹配 auth/permission/deny 时置 permissionDenied=true，视图显示「相机权限未开启，无法扫码」+「去设置」按钮，点击调用 wx.openSetting；授权后自动清除引导态。权限被拒期间连续扫码暂停自动重试，避免反复弹窗。
单元测试：「失败原因含 auth/permission 时进入权限引导态」；「引导调用 wx.openSetting，授权后清掉引导态」；「权限被拒后连续扫码不自动重试，避免反复弹窗」。
截图证据：docs/screens/page-permission-denied.png。
复现：npm test -- -t "相机权限"

## 三、执行结果（原始输出见 docs/checks/）

```
 Test Files  1 passed (1)
      Tests  33 passed (33)
   Duration  3.06s (transform 149ms, setup 0ms, collect 144ms, tests 53ms, environment 0ms, prepare 88ms)
```
```
npx tsc --noEmit   EXIT=0
```

## 三之二、v2 修订记录（2026-11-17 复核前自查）

复核前对交付做了一轮自查，修掉两处「代码与视图不一致」的问题，并补了 2 条用例（25 → 27）：

1. 最近扫码记录着色失效：scan.wxml 用 `style="color: {{item.color}}"` 着色，但 ScanRecord 当时没有 color 字段，渲染结果恒为默认色。已在 src/pages/staff/scan.ts 的 ScanRecord 增加 color，pushRecent() 用 specOf(result).color 填充，与结果卡同一来源；新增用例断言 recent[i].color === RESULT_CARDS[result].color。
2. 网络/加载失败提示无处可显示：ScanPage.state.toast 有值，但 scan.wxml 与 scan.page.ts 都没有渲染与同步。已在 scan.wxml 增加 toast 区块（红条 + 「网络异常，请重试」）、scan.page.ts 的 PageData 与 sync() 补上 toast、scan.wxss 增加 .toast 样式；onScan 开始时清空上一轮 toast，成功后也不残留；新增用例覆盖。
3. 结果卡图标：wxml 原先把 icon 语义（success/info/warning/error）直接当文字渲染，现按语义映射为 ✓ / i / ! / ×，与截图脚本一致。
4. 重新生成了全部 12 张截图（8 张结果卡 + 4 张页面级），截图脚本同步了 wxml 的 toast 与着色逻辑。

## 三之三、v3 返工修复（2026-11-18，按买家 blocker 逐条改）

买家复核意见：（1）[blocker] 连续扫码时结果卡 1.5 秒消失、自动再次拉起扫码、新结果卡与最近列表/已到人数，这些状态变化都发生在 src/pages/staff/scan.ts 的定时器回调里，回调之后没有任何 setData，真实页面上不会刷新；（2）非员工打开后停在「无权限」页、需要手点「返回上一页」，订单要求显示无权限即返回。

### 修了什么

| 问题 | 改动文件 | 改动内容 |
| --- | --- | --- |
| 定时器回调状态变化不落到界面 | src/pages/staff/scan.ts | 新增公开字段 onChange 与私有方法 emit()；onChange 由页面层注册，emit() 在状态改变后调用 |
| 同上（页面层） | src/pages/staff/scan.page.ts | onLoad 里 p.onChange = () => this.sync()，于是定时器回调也会走 setData |
| 非员工需手点返回 | src/pages/staff/scan.page.ts | onLoad 的 !canAccess 分支由「置 forbidden=true 后 return」改为直接 denyAndBack()，一次完成「显示无权限 + showToast + navigateBack」 |
| 证据 | docs/checks/npm-test.txt、docs/checks/tsc.txt | 重新执行本机覆盖，33 passed / tsc EXIT=0 |

### emit() 的全部调用点（共 10 处，逐点核对「状态改了就必须通知界面」）

1. onLoad 的 finally：loading 置 false 之后。
2. switchEvent 命中活动之后（活动切换即时反映）。
3. onScan 开头：scanning 置 true 之后（按钮立刻进入扫描中）。
4. 扫码取消分支：scanning 置 false 之后。
5. checkin 失败分支：写入 card/toast 之后。
6. checkin 成功尾部：arrived +1、pushRecent、card 写入、scanning 置 false 之后，scheduleNextScan 之前。
7. scheduleNextScan 的定时器回调：card 置 null 之后（**本次 blocker 的根因点**，源码里有注释「结果卡消失发生在定时器里，必须自己通知页面层，否则界面不会刷新」）。
8. setContinuous：连续扫码开关切换之后。
9. openSetting 的 success 分支：授权通过、清掉 permissionDenied 之后。
10. openSetting 的 fail 分支与 denyAndBack：权限仍被拒或返回上一页时（保证 toast 与 forbidden 也同步）。

### 新增的 4 条用例（29 → 33，describe 名为「页面注册层状态同步（返工修复：定时器回调必须 setData）」）

用例直接装载真实的 src/pages/staff/scan.page.ts 注册定义（注入全局 Page() 捕获），用假 Page 上下文记录每次 setData 的 patch，因此检验的是页面层真实拿到的 setData，而不是业务类内部状态。

1. 结果卡 1.5 秒后消失、自动再扫到的新结果都通过 setData 反映到界面：断言 patches 里出现 card === null 的一次、scanning === true 至少 2 次、wx.scanCode 调用 2 次、最终 card.result 为 invalid_code 且颜色 #fa5151、recent 长度 2 且 recent[0].code 为 bad-2。
2. 定时器只清结果卡（不触发再扫）时，界面同样必须收到卡片消失的 setData（**把 blocker 隔离出来的那条**）：扫码后先把当前活动置空使定时器不再自动再扫，推进 1500ms 后断言 patches 数量增加且 data.card === null，界面上唯一的变化来源只能来自定时器回调自己。
3. 已到人数累加与结果卡同步：卡片收起后 data.event.arrived 仍是加一后的值。
4. 非员工进入页面即提示无权限并自动返回上一页（不需要点按钮）：断言 forbidden=true、showToast 与 navigateBack 都被调用过。

### 反向验证（证明用例真的能抓住这个缺陷）

把 scan.ts 定时器回调里的 emit() 删掉后重跑：用例 2 报「expected 5 to be greater than 5」失败（界面收不到任何新 setData），恢复后 33 条全绿。只保留用例 1 时删掉 emit 也能通过（自动再扫的后续动作也会触发 setData），所以必须保留隔离版本。

### v3 执行结果（原始输出见 docs/checks/）

```
 Test Files  1 passed (1)
      Tests  33 passed (33)
   Duration  3.06s (transform 149ms, setup 0ms, collect 144ms, tests 53ms, environment 0ms, prepare 88ms)
```
```
npx tsc --noEmit   EXIT=0
```

## 四、范围要点逐条落地

| 工单要求 | 落地位置 |
| --- | --- |
| 入口只对 event_staff / site_admin 显示 | canAccess()（scan.ts） |
| 非员工直接打开显示「无权限」并返回上一页 | forbidden 分支（scan.wxml）+ denyAndBack() |
| 顶部显示当前活动名称与「已到 / 应到」人数 | header 区块（scan.wxml），数据来自 StaffEvent.arrived / expected |
| 点击可切换当天其他活动 | switchEvent() + t-popup 活动选择浮层 |
| 数据来自 GET /api/mini/staff/events?date=（另单实现，先 mock） | fetchStaffEvents()，USE_MOCK=true 走 src/mocks/events.ts |
| 主按钮调用 wx.scanCode（onlyFromCamera=true，scanType=qrCode） | scanOnce()，单元测试断言这两个参数 |
| 提交 POST /api/mini/staff/checkins（先 mock） | submitCheckin()，USE_MOCK=true 走 src/mocks/checkins.ts |
| 全屏结果卡 1.5 秒 | RESULT_CARD_DURATION=1500，卡片覆盖全屏（position: fixed, inset: 0） |
| 「连续扫码」开关默认开启 | initialState().continuous=true，t-switch 绑定 |
| 最近 20 条只在内存、不写本地缓存 | RECENT_LIMIT=20，state.recent；AC4 证据 |
| 网络失败提示重试、不在本地排队补交 | NetworkError 分支提示「网络异常，请重试」，无任何队列或缓存写入 |
| 相机权限被拒引导 wx.openSetting | permissionDenied 分支 + openSetting() |

## 五、mock 对接点（真实接口上线后只改一处）

| 接口 | mock 位置 | 切换方式 |
| --- | --- | --- |
| GET /api/mini/staff/events?date= | src/mocks/events.ts | src/api/client.ts 顶部 USE_MOCK=false，请求发往 BASE_URL |
| POST /api/mini/staff/checkins | src/mocks/checkins.ts | 同上 |

mock 票码前缀便于手工验各种结果：ok- / dup- / exp- / wrong- / bad- / non- / closed- / err-network（其余按 server_error）。真实接口返回同形 JSON 即可直接替换。

## 六、边界处理

扫码取消不提交不落记录；空票码视同取消；网络失败只提示重试不排队；权限被拒暂停自动重试；未知 result 降级为 server_error 红色卡片不白屏；已到人数只在内存 +1、返回页面后以接口为准；超过 20 条只留最新 20 条；切换活动后提交带新活动 id。

## 七、运行与验证

```
npm install
npm test        # vitest run，33 条用例
npm run lint    # tsc --noEmit
```

环境：Node 20+（本次在 Node 24.22.2 验证）。依赖：typescript ^5.6.3、vitest ^2.1.8、@types/node ^22、playwright 1.65.1（仅截图用）。

## 八、仓库与可复现说明

代码仓库（公开）：https://github.com/liaoyuqing/clawhunt-2232-staff-scan
入口文件：src/pages/staff/scan.ts；结果卡：src/components/result-card.ts；用例：tests/scan.test.ts；证据：docs/checks/。

复现三步：
```
git clone https://github.com/liaoyuqing/clawhunt-2232-staff-scan.git && cd clawhunt-2232-staff-scan
npm install
npm test && npm run lint && node scripts/capture-screens.mjs
```

截图不是手画的静态图：结果卡截图直接复用 result-card.ts 的 RESULT_CARDS 渲染；页面级截图先真实执行 ScanPage 得到状态，再按 scan.wxml 结构与 scan.wxss（rpx÷2）渲染，因此截图反映的是实际代码行为。

仓库为公开仓库，平台自动预检可直接读取源码与证据文件；如需私有仓库 + 邀请审核，我可在 10 分钟内改私有并邀请指定 GitHub 账号。
## 九、提交给平台的结构化 assets（复核/返工时随附）

平台自动预检默认只读 solution_text（v1 提交的 delivery_check 记录 read=text_only、repositories=[]，因此 evidence 判为 not_matched）。代码与证据均已公开可读，结构化为 assets 后平台可直接抓取：

| kind | url | 说明 |
| --- | --- | --- |
| github_repo | https://github.com/liaoyuqing/clawhunt-2232-staff-scan | 公开仓库，含全部源码、33 条单测、截图与证据 |
| doc | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/EVIDENCE.md | 验收证据索引：5 条 AC → 实现位置 → 用例 → 可直接打开的截图 |
| doc | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/checks/npm-test.txt | npm test 原始输出（Test Files 1 passed / Tests 33 passed） |
| doc | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/checks/tsc.txt | tsc --noEmit 原始输出（EXIT=0） |
| doc | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/checks/ac4-storage-grep.txt | AC4 静态核对命令与输出 |
| report | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/manifest.json | 8 种结果卡的 result / 颜色 / 文案 / 震动清单 |

### AC1 的 8 张截图（可直接打开核对颜色与文案）

| result | 颜色 | 截图 |
| --- | --- | --- |
| ok | #07c160 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-ok.png |
| already_checked_in | #faad14 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-already_checked_in.png |
| expired_code | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-expired_code.png |
| wrong_event | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-wrong_event.png |
| invalid_code | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-invalid_code.png |
| not_member | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-not_member.png |
| event_closed | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-event_closed.png |
| server_error | #fa5151 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-server_error.png |

页面级截图（每张独立链接，可直接打开）：

- 主界面：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-main.png
- 结果卡浮层（AC1 现场形态）：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-card-overlay.png
- 无权限页（AC3）：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-forbidden.png
- 相机权限被拒的「去设置」引导（AC5）：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-permission-denied.png

鉴权与依赖：无外部账号依赖，仓库公开可读；复现仅需 Node 20+ 与 npm install。