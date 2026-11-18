# 验收证据索引（S3-MINI-060 员工扫码签到页）

本文件把 5 条验收标准逐条映射到「实现位置 → 自动化用例 → 可直接打开的截图 / 原始输出」，
不依赖 clone 也能核验。仓库：https://github.com/liaoyuqing/clawhunt-2232-staff-scan

## 自动化结果（2026-11-18 返工 v3 复跑）

- npm test：Test Files 1 passed，Tests **33** passed（原始输出 https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/checks/npm-test.txt）
- npm run lint（tsc --noEmit）：EXIT=0（https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/checks/tsc.txt）

## AC1 · 8 种 result 各有结果卡截图，颜色与文案符合 scope

| result | 颜色 | 文案 | 截图（直接打开） |
| --- | --- | --- | --- |
| ok | #07c160 | 签到成功 + 姓名企业 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-ok.png |
| already_checked_in | #faad14 | 已签到 + 首次签到时间 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-already_checked_in.png |
| expired_code | #fa5151 | 电子票已过期 + 请会员刷新电子票 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-expired_code.png |
| wrong_event | #fa5151 | 不是本场活动 + 应去活动 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-wrong_event.png |
| invalid_code | #fa5151 | 无法识别的票码 + 原因 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-invalid_code.png |
| not_member | #fa5151 | 该票不属于会员 + 原因 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-not_member.png |
| event_closed | #fa5151 | 活动已结束签到 + 原因 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-event_closed.png |
| server_error | #fa5151 | 签到失败 + 原因 | https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/result-server_error.png |

- 颜色/文案唯一来源：src/components/result-card.ts 的 RESULT_CARDS（页面、截图脚本、最近记录着色都读它）。
- 机器可读清单：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/manifest.json
- 每张图右上角带 result · #hex 标签，作为取色核对锚点。

## AC2 · 连续扫码：结果卡消失后自动再次调用 wx.scanCode

- 实现：src/pages/staff/scan.ts 的 scheduleNextScan()，可注入 Timer，RESULT_CARD_DURATION = 1500ms；回调条件 continuous && event && !permissionDenied。
- 实现（v3 补）：定时器回调改了卡片/扫码状态后，业务类调 emit() 通知页面层，页面层 p.onChange = () => this.sync() 走 setData；emit 共 10 个调用点（onLoad finally、switchEvent、onScan 开头、取消分支、失败分支、成功尾部、定时器回调、setContinuous、openSetting 成功/失败、denyAndBack）。
- 用例：tests/scan.test.ts · 「开启时结果卡消失后自动再次调用 wx.scanCode」（scanCode 次数 1 → 推进 1500ms → 2）、「关闭后结果卡消失不再自动拉起」（推进 5000ms 仍为 1）、「默认开启连续扫码」。
- 页面层同步用例（v3 新增 4 条，describe「页面注册层状态同步（返工修复：定时器回调必须 setData）」）：装载真实 scan.page.ts、记录每次 setData 的 patch。其中「定时器只清结果卡（不触发再扫）」是隔离用例 —— 删掉定时器里的 emit() 它会失败（实测报 expected 5 to be greater than 5），另外几条不会，证明这条断言真的盯住缺陷。

## AC3 · 非员工账号打开显示无权限并返回

- 实现：canAccess(role) 只认 event_staff / site_admin；onLoad 对非员工**直接** denyAndBack()（v3 改：不再停在无权限页等用户点按钮），denyAndBack 内 showToast 无权限 + navigateBack（delta 1）+ emit。
- 用例：「只有 event_staff 与 site_admin 可以进本页」、「非员工打开页面：标记无权限、提示并返回上一页」、页面层「非员工进入页面即提示无权限并自动返回上一页（不需要点按钮）」。
- 界面证据：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-forbidden.png

## AC4 · 最近扫码记录不调用 wx.setStorage

- 实现：最近 20 条只在 ScanPage.state.recent 内存数组（RECENT_LIMIT = 20）。
- 静态核对：docs/checks/ac4-storage-grep.txt（命中仅 src/types/wx.ts:23/24/25 的类型签名，业务代码零调用）。
- 用例（伪 wx 的 getStorageSync 会把 key 记入调用表，用例直接断言调用表无该类调用）：「不调用 wx.setStorage / setStorageSync，也不读本地缓存」、「最多保留 20 条，最新在最前」、「扫码取消不产生记录」。

## AC5 · 相机权限被拒时出现去设置引导

- 实现：scanCode 失败原因含 auth/permission → state.permissionDenied=true → 顶部引导调用 wx.openSetting；连续扫码暂停自动重试。
- 用例：「失败原因含 auth/permission 时进入权限引导态」、「引导调用 wx.openSetting，授权后清掉引导态」、「权限被拒后连续扫码不自动重试」。
- 界面证据：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-permission-denied.png

## 补充用例（v3 追加 · 页面层同步）

- 「结果卡 1.5 秒后消失、自动再扫到的新结果都通过 setData 反映到界面」：断言 patches 里出现 card === null、scanning === true 至少 2 次、scanCode 共 2 次、最终卡片为 invalid_code 且颜色 #fa5151、recent 两条且首条为新票码。
- 「定时器只清结果卡（不触发再扫）时，界面同样必须收到卡片消失的 setData」：把当前活动置空阻止自动再扫，推进 1500ms 后断言 patches 增加且 data.card 为 null。
- 「已到人数累加与结果卡同步」：卡片收起后 data.event.arrived 仍是加一后的值。

## 补充用例（v2 追加）

- 「失败提示会在下一次扫码开始时清掉，成功后不再残留」：网络失败后的 toast 不会一直挂着。
- 「最近记录带上结果卡主色，便于列表里区分成功与失败」：recent[i].color 与 RESULT_CARDS[result].color 一致。

## 复现（3 分钟）

    git clone https://github.com/liaoyuqing/clawhunt-2232-staff-scan
    cd clawhunt-2232-staff-scan
    npm install
    npm test          # 33 passed
    npm run lint      # tsc --noEmit
    node scripts/capture-screens.mjs   # 重新生成 8 张结果卡截图
    node scripts/capture-pages.mts     # 重新生成 4 张页面级截图

## 页面级截图

- 主页面（最近记录按结果着色）：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-main.png
- 结果卡覆盖态：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-card-overlay.png
- 无权限：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-forbidden.png
- 相机权限被拒引导：https://raw.githubusercontent.com/liaoyuqing/clawhunt-2232-staff-scan/main/docs/screens/page-permission-denied.png
