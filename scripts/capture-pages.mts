// 页面级截图：用真实 ScanPage 逻辑跑出状态，再按 wxml 结构 + wxss 样式渲染成截图。
// 状态来自 src/pages/staff/scan.ts 的真实执行结果，不是手写的静态图。
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'docs', 'screens');
const WXSS = await fs.readFile(path.join(import.meta.dirname, '..', 'src', 'pages', 'staff', 'scan.wxss'), 'utf8');

// rpx -> px：设计稿 750rpx = 375px
function wxssToCss(wxss) {
  return wxss.replace(/([\d.]+)rpx/g, (_, n) => (Number(n) / 2) + 'px');
}

function pageHtml(state, extraClass) {
  const W = Number(extraClass && extraClass.width) || 375;
  const H = Number(extraClass && extraClass.height) || 667;
  const ev = state.event;
  const recentRows = (state.recent || []).map((r) =>
    '<div class="recent__row"><div class="recent__code">' + r.code + '</div><div class="recent__title-text" style="color: ' + (r.color || '') + '">' + r.title + '</div></div>'
  ).join('');
  const card = state.card ? `
    <div class="card" style="background: ${state.card.color}">
      <div class="card__icon">${state.card.icon === 'success' ? '✓' : state.card.icon === 'info' ? 'i' : state.card.icon === 'warning' ? '!' : '×'}</div>
      <div class="card__title">${state.card.title}</div>
      ${state.card.subtitle ? '<div class="card__subtitle">' + state.card.subtitle + '</div>' : ''}
      ${state.card.result === 'expired_code' ? '<div class="card__hint">请会员刷新电子票</div>' : ''}
    </div>` : '';
  const forbidden = state.forbidden ? `
    <div class="forbidden">
      <div class="forbidden__title">无权限</div>
      <div class="forbidden__desc">该页面只对活动工作人员开放</div>
      <div class="btn">返回上一页</div>
    </div>` : '';
  const main = state.forbidden ? '' : `
    <div class="header">
      <div class="header__name">${ev ? ev.name : ''}</div>
      <div class="header__counts">
        <span class="header__counts-label">已到</span>
        <span class="header__counts-arrived">${ev ? ev.arrived : 0}</span>
        <span class="header__counts-sep">/</span>
        <span class="header__counts-expected">${ev ? ev.expected : 0}</span>
      </div>
      <div class="header__switch">切换活动</div>
    </div>
    <div class="scan"><div class="btn btn--block">扫码签到</div></div>
    <div class="setting"><span>连续扫码</span><span class="sw ${state.continuous ? 'sw--on' : ''}"></span><span class="setting__hint">开启后结果卡消失自动再次拉起扫码</span></div>
    ${state.toast ? '<div class="toast">' + state.toast + '</div>' : ''}
    ${state.permissionDenied ? '<div class="permission"><span class="permission__text">相机权限未开启，无法扫码</span><span class="btn btn--small">去设置</span></div>' : ''}
    <div class="recent">
      <div class="recent__title">最近扫码（${(state.recent || []).length}/20）</div>
      ${(state.recent || []).length === 0 ? '<div class="recent__empty">还没有扫码记录</div>' : recentRows}
    </div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: ${W}px; height: ${H}px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .btn { display: inline-flex; align-items: center; justify-content: center; background: #0052d9; color: #fff; border-radius: 8px; padding: 10px 20px; font-size: 15px; }
    .btn--block { display: flex; width: 100%; padding: 14px; font-size: 17px; }
    .btn--small { padding: 5px 12px; font-size: 12px; background: #fff; color: #0052d9; border: 1px solid #0052d9; }
    .sw { width: 40px; height: 24px; border-radius: 999px; background: #d9d9d9; position: relative; margin-left: auto; }
    .sw--on { background: #07c160; }
    .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; }
    .sw--on::after { left: 19px; }
    ${wxssToCss(WXSS)}
  </style></head><body><div class="page">${forbidden}${main}</div>${card}
  <div style="position:fixed;right:10px;top:10px;font-size:9px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.35);color:#fff">${extraClass.label}</div>
  </body></html>`;
}

const { ScanPage } = await import('../src/pages/staff/scan.ts');

function makeWx(codes) {
  const calls = [];
  let i = 0;
  return {
    calls,
    wx: {
      scanCode(opt) {
        calls.push({ api: 'scanCode' });
        const c = codes[i++];
        if (c === '__FAIL_PERMISSION__') return opt.fail && opt.fail({ errMsg: 'scanCode:fail auth deny' });
        if (c === undefined) return opt.fail && opt.fail({ errMsg: 'scanCode:fail cancel' });
        opt.success && opt.success({ result: c });
      },
      vibrateShort() { calls.push({ api: 'vibrateShort' }); },
      vibrateLong() { calls.push({ api: 'vibrateLong' }); },
      openSetting(opt) { calls.push({ api: 'openSetting' }); opt.success && opt.success({ authSetting: { 'scope.camera': true } }); },
      setStorage() { calls.push({ api: 'setStorage' }); },
      setStorageSync() { calls.push({ api: 'setStorageSync' }); },
      getStorageSync() { return null; },
      showToast(o) { calls.push({ api: 'showToast' }); void o; },
      navigateBack() { calls.push({ api: 'navigateBack' }); },
      getSetting() {}, redirectTo() {},
      request() {}
    }
  };
}

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const browser = await chromium.launch();
async function shoot(name, state, label) {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
  await page.setContent(pageHtml(state, { label }), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
}

// 1) 正常主页：已有几条扫码记录
{
  const { wx } = makeWx(['ok-1', 'dup-2', 'bad-3']);
  globalThis.wx = wx;
  const p = new ScanPage();
  await p.onLoad({ role: 'event_staff' });
  await p.onScan(); await p.onScan(); await p.onScan();
  p.state.card = null;
  if (p.state.toast) throw new Error('main page failed: ' + p.state.toast);
  await shoot('page-main.png', p.state, 'page-main');
}

// 2) 相机权限被拒（AC5）
{
  const { wx } = makeWx(['__FAIL_PERMISSION__']);
  globalThis.wx = wx;
  const p = new ScanPage();
  await p.onLoad({ role: 'event_staff' });
  await p.onScan();
  await shoot('page-permission-denied.png', p.state, 'page-permission-denied');
}

// 3) 非员工打开：无权限页（AC3 的界面证据）
{
  const { wx } = makeWx([]);
  globalThis.wx = wx;
  const p = new ScanPage();
  await p.onLoad({ role: 'member' });
  await shoot('page-forbidden.png', p.state, 'page-forbidden');
}

// 4) 结果卡覆盖在页面上（ok 态）
{
  const { wx } = makeWx(['ok-1']);
  globalThis.wx = wx;
  const p = new ScanPage();
  await p.onLoad({ role: 'event_staff' });
  await p.onScan();
  if (!p.state.card) throw new Error('overlay failed: no card');
  await shoot('page-card-overlay.png', p.state, 'page-card-overlay');
}

await browser.close();
await fs.writeFile(path.join(OUT, 'page-manifest.json'), JSON.stringify({
  count: 4,
  items: ['page-main.png', 'page-permission-denied.png', 'page-forbidden.png', 'page-card-overlay.png']
}, null, 2) + '\n', 'utf8');
console.log('captured page screens');
void wait;
