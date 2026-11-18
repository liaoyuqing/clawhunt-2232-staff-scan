// 用 Playwright 把 8 种结果卡渲染成截图：复用 result-card.ts 的真实定义，不另写一套。
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RESULT_CARDS, RESULT_ORDER, subtitleOf, EXPIRED_CODE_HINT } from '../src/components/result-card.ts';

const OUT = path.join(import.meta.dirname, '..', 'docs', 'screens');
const SAMPLE = { member_name: '林知远', member_company: '星澈智能科技（虚构）', first_checkin_at: '2026-11-20T09:12:33+08:00', suggested_event_name: '2026 秋季会员对接会', reason: '原因说明（虚构）' };
void SAMPLE;
const REASON = {
  invalid_code: '票码格式无法识别',
  not_member: '该电子票不属于本平台会员',
  event_closed: '该活动已截止签到',
  server_error: '服务端暂时不可用'
};

function payloadFor(result) {
  const base = { member_name: '林知远', member_company: '星澈智能科技（虚构）' };
  if (result === 'ok') return base;
  if (result === 'already_checked_in') return { ...base, first_checkin_at: '2026-11-20T09:12:33+08:00' };
  if (result === 'wrong_event') return { suggested_event_name: '2026 秋季会员对接会' };
  return { reason: REASON[result] || '' };
}

function htmlFor(result) {
  const spec = RESULT_CARDS[result];
  const sub = subtitleOf(result, payloadFor(result));
  const hint = result === 'expired_code' ? '<div class="hint">' + EXPIRED_CODE_HINT + '</div>' : '';
  const subHtml = sub ? '<div class="sub">' + sub + '</div>' : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .card { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; background: ${spec.color}; }
  .icon { width: 96px; height: 96px; border-radius: 50%; background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 700; }
  .title { margin-top: 22px; font-size: 30px; font-weight: 700; letter-spacing: 1px; }
  .sub { margin-top: 12px; font-size: 16px; opacity: .92; }
  .hint { margin-top: 18px; font-size: 15px; padding: 6px 14px; border-radius: 999px; background: rgba(0,0,0,.15); }
  .meta { position: fixed; right: 12px; top: 12px; font-size: 10px; padding: 3px 8px; border-radius: 999px; background: rgba(0,0,0,.18); color: #fff; opacity: .9; }
</style></head><body>
  <div class="card">
    <div class="icon">${spec.icon === 'success' ? '✓' : spec.icon === 'info' ? 'i' : spec.icon === 'warning' ? '!' : '×'}</div>
    <div class="title">${spec.title}</div>
    ${subHtml}
    ${hint}
  </div>
  <div class="meta">result=${result} · ${spec.color}</div>
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });
const manifest = [];
for (const result of RESULT_ORDER) {
  const html = htmlFor(result);
  await page.setContent(html, { waitUntil: 'load' });
  const file = path.join(OUT, 'result-' + result + '.png');
  await page.screenshot({ path: file });
  const spec = RESULT_CARDS[result];
  manifest.push({ result, file: 'docs/screens/result-' + result + '.png', color: spec.color, title: spec.title, vibrate: spec.vibrate });
}
await browser.close();
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ count: manifest.length, items: manifest }, null, 2) + '\n', 'utf8');
console.log('captured ' + manifest.length + ' screens');
