import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanPage, canAccess, initialState, today } from '../src/pages/staff/scan';
import { RESULT_CARDS, RESULT_ORDER, specOf, subtitleOf, formatTime, EXPIRED_CODE_HINT } from '../src/components/result-card';
import type { Timer } from '../src/pages/staff/scan';

/** 可控计时器：单元测试里手动推进时间，不依赖真实 1.5 秒 */
class FakeTimer implements Timer {
  private q: Array<{ fn: () => void; at: number; ms: number }> = [];
  private now = 0;
  setTimeout(fn: () => void, ms: number): unknown {
    const h = { fn, at: this.now + ms, ms };
    this.q.push(h);
    return h;
  }
  clearTimeout(handle: unknown): void {
    this.q = this.q.filter((x) => x !== handle);
  }
  tick(ms: number): void {
    this.now += ms;
    const due = this.q.filter((x) => x.at <= this.now);
    this.q = this.q.filter((x) => x.at > this.now);
    due.forEach((x) => x.fn());
  }
}

/** 让页面里 pending 的 async 链（扫码->提交->结果卡）跑完 */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
}

interface Call { api: string; args?: unknown }

/** 伪 wx：记录每次调用，scanCode 用队列里的票码依次返回 */
function makeWx(codes: string[]) {
  const calls: Call[] = [];
  let i = 0;
  const wx = {
    scanCode(opt: { success?: (r: { result: string }) => void; fail?: (e: { errMsg: string }) => void }) {
      calls.push({ api: 'scanCode' });
      const code = codes[i++];
      if (code === '__FAIL_PERMISSION__') {
        opt.fail && opt.fail({ errMsg: 'scanCode:fail auth deny' });
        return;
      }
      if (code === '__FAIL_CANCEL__') {
        opt.fail && opt.fail({ errMsg: 'scanCode:fail cancel' });
        return;
      }
      opt.success && opt.success({ result: code });
    },
    vibrateShort(opt?: unknown) { calls.push({ api: 'vibrateShort', args: opt }); },
    vibrateLong(opt?: unknown) { calls.push({ api: 'vibrateLong', args: opt }); },
    openSetting(opt?: { success?: (r: { authSetting: Record<string, boolean> }) => void }) {
      calls.push({ api: 'openSetting' });
      opt && opt.success && opt.success({ authSetting: { 'scope.camera': true } });
    },
    setStorage(opt: { key: string }) { calls.push({ api: 'setStorage', args: opt.key }); },
    setStorageSync(key: string) { calls.push({ api: 'setStorageSync', args: key }); },
    getStorageSync(key: string) { calls.push({ api: 'getStorageSync', args: key }); return null; },
    showToast(opt: unknown) { calls.push({ api: 'showToast', args: opt }); },
    navigateBack(opt?: unknown) { calls.push({ api: 'navigateBack', args: opt }); },
    getSetting(opt?: unknown) { calls.push({ api: 'getSetting', args: opt }); },
    redirectTo(opt: unknown) { calls.push({ api: 'redirectTo', args: opt }); },
    request(opt: { url: string; method?: string; data?: unknown; success?: (r: unknown) => void; fail?: (e: unknown) => void }) {
      calls.push({ api: 'request', args: opt.url });
      opt.success && opt.success({ statusCode: 200, data: {} });
    }
  };
  return { wx, calls };
}

function install(target: 'event_staff' | 'site_admin' | 'member' | null) {
  const g = globalThis as unknown as { wx: unknown; __role: string | null };
  void target;
  void g;
}

describe('结果卡定义：8 种 result 全覆盖', () => {
  it('RESULT_ORDER 恰有 8 种，且每种都有颜色、文案、图标与震动策略', () => {
    expect(RESULT_ORDER.length).toBe(8);
    expect(new Set(RESULT_ORDER).size).toBe(8);
    for (const r of RESULT_ORDER) {
      const s = RESULT_CARDS[r];
      expect(s.title.length).toBeGreaterThan(0);
      expect(/^#[0-9a-f]{6}$/i.test(s.color)).toBe(true);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(['short', 'long', 'none']).toContain(s.vibrate);
    }
    // 与 scope 一致的固定语义
    expect(RESULT_CARDS.ok.color.toLowerCase()).toBe('#07c160');
    expect(RESULT_CARDS.ok.vibrate).toBe('short');
    expect(RESULT_CARDS.already_checked_in.color.toLowerCase()).toBe('#faad14');
    expect(RESULT_CARDS.already_checked_in.detailFrom).toBe('firstCheckinAt');
    expect(RESULT_CARDS.expired_code.detailFrom).toBe('none');
    expect(RESULT_CARDS.wrong_event.detailFrom).toBe('suggestedEvent');
    expect(RESULT_CARDS.invalid_code.vibrate).toBe('long');
  });

  it('expired_code 的固定文案是「请会员刷新电子票」', () => {
    expect(EXPIRED_CODE_HINT).toBe('请会员刷新电子票');
  });

  it('未知 result 降级为 server_error，不抛异常', () => {
    expect(specOf('something_new').result).toBe('server_error');
  });
});

describe('副标题与时间格式', () => {
  it('ok 显示姓名与企业', () => {
    expect(subtitleOf('ok', { member_name: '林知远', member_company: '星澈智能科技（虚构）' }))
      .toBe('林知远 · 星澈智能科技（虚构）');
  });
  it('缺字段时降级为空串或提示，不出现 undefined', () => {
    expect(subtitleOf('ok', {})).toBe('');
    expect(subtitleOf('wrong_event', {})).toBe('请确认活动二维码');
    expect(subtitleOf('expired_code', null)).toBe('');
  });
  it('时间格式化为 HH:mm，非法输入原样返回', () => {
    const t = '2026-11-20T09:12:33+08:00';
    expect(formatTime(t)).toMatch(/^\d{2}:\d{2}$/);
    expect(formatTime('not-a-date')).toBe('not-a-date');
  });
});

describe('角色准入', () => {
  it('只有 event_staff 与 site_admin 可以进本页', () => {
    expect(canAccess('event_staff')).toBe(true);
    expect(canAccess('site_admin')).toBe(true);
    expect(canAccess('member')).toBe(false);
    expect(canAccess(null)).toBe(false);
    expect(canAccess(undefined)).toBe(false);
  });

  it('非员工打开页面：标记无权限、提示并返回上一页', async () => {
    const { wx, calls } = makeWx([]);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'member' });
    expect(page.state.forbidden).toBe(true);
    page.denyAndBack();
    expect(calls.some((c) => c.api === 'showToast')).toBe(true);
    expect(calls.some((c) => c.api === 'navigateBack')).toBe(true);
  });
});

describe('页面主流程', () => {
  let wxRef: ReturnType<typeof makeWx>;

  beforeEach(() => {
    wxRef = makeWx(['ok-1001']);
    (globalThis as unknown as { wx: unknown }).wx = wxRef.wx;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('进入页面后拉当天活动，并定位到 query 指定的活动', async () => {
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff', event_id: 'evt_1002' });
    expect(page.state.forbidden).toBe(false);
    expect(page.state.event?.id).toBe('evt_1002');
    expect(page.state.events.length).toBeGreaterThan(1);
    expect(page.state.loading).toBe(false);
  });

  it('成功签到：绿色结果卡 + 姓名企业 + vibrateShort', async () => {
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.card?.result).toBe('ok');
    expect(page.state.card?.color.toLowerCase()).toBe('#07c160');
    expect(page.state.card?.subtitle).toContain('林知远');
    expect(wxRef.calls.some((c) => c.api === 'vibrateShort')).toBe(true);
    expect(wxRef.calls.some((c) => c.api === 'vibrateLong')).toBe(false);
  });

  it('「已签到」显示首次签到时间，不震动', async () => {
    wxRef = makeWx(['dup-1001']);
    (globalThis as unknown as { wx: unknown }).wx = wxRef.wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.card?.result).toBe('already_checked_in');
    expect(page.state.card?.subtitle).toContain('首次签到');
    expect(wxRef.calls.some((c) => c.api === 'vibrateShort')).toBe(false);
    expect(wxRef.calls.some((c) => c.api === 'vibrateLong')).toBe(false);
  });

  it('其余失败红色并 vibrateLong', async () => {
    wxRef = makeWx(['bad-1001']);
    (globalThis as unknown as { wx: unknown }).wx = wxRef.wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.card?.result).toBe('invalid_code');
    expect(page.state.card?.color.toLowerCase()).toBe('#fa5151');
    expect(wxRef.calls.some((c) => c.api === 'vibrateLong')).toBe(true);
  });

  it('扫码使用 onlyFromCamera=true 且 scanType 为 qrCode', async () => {
    const seen: unknown[] = [];
    const wx = wxRef.wx;
    const orig = wx.scanCode;
    (wx as { scanCode: unknown }).scanCode = (opt: unknown) => {
      seen.push(opt);
      orig(opt as never);
    };
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(seen.length).toBe(1);
    const opt = seen[0] as { onlyFromCamera: boolean; scanType: string[] };
    expect(opt.onlyFromCamera).toBe(true);
    expect(opt.scanType).toEqual(['qrCode']);
  });
});

describe('连续扫码（AC2）', () => {
  it('开启时结果卡消失后自动再次调用 wx.scanCode', async () => {
    const codes = ['ok-1', 'ok-2'];
    const { wx, calls } = makeWx(codes);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const timer = new FakeTimer();
    const page = new ScanPage(timer);
    await page.onLoad({ role: 'event_staff' });
    page.setContinuous(true);
    await page.onScan();
    expect(calls.filter((c) => c.api === 'scanCode').length).toBe(1);

    timer.tick(1500);
    await flush();
    expect(calls.filter((c) => c.api === 'scanCode').length).toBe(2);
    expect(page.state.recent.length).toBe(2);
  });

  it('关闭后结果卡消失不再自动拉起', async () => {
    const { wx, calls } = makeWx(['ok-1', 'ok-2']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const timer = new FakeTimer();
    const page = new ScanPage(timer);
    await page.onLoad({ role: 'event_staff' });
    page.setContinuous(false);
    await page.onScan();
    timer.tick(5000);
    await Promise.resolve();
    expect(calls.filter((c) => c.api === 'scanCode').length).toBe(1);
  });

  it('默认开启连续扫码', async () => {
    const page = new ScanPage(new FakeTimer());
    expect(initialState().continuous).toBe(true);
    await page.onLoad({ role: 'event_staff' });
    expect(page.state.continuous).toBe(true);
  });
});

describe('最近扫码记录只存内存（AC4）', () => {
  it('不调用 wx.setStorage / setStorageSync，也不读本地缓存', async () => {
    const { wx, calls } = makeWx(['ok-1', 'bad-2', 'dup-3']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    await page.onScan();
    await page.onScan();
    expect(calls.some((c) => c.api === 'setStorage')).toBe(false);
    expect(calls.some((c) => c.api === 'setStorageSync')).toBe(false);
    // 也不读本地缓存：最近记录只来自本次页面实例的内存
    expect(calls.some((c) => c.api === 'getStorageSync')).toBe(false);
    expect(page.state.recent.length).toBe(3);
  });

  it('最多保留 20 条，最新在最前', async () => {
    const codes = Array.from({ length: 25 }, (_, i) => 'ok-' + i);
    const { wx } = makeWx(codes);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const timer = new FakeTimer();
    const page = new ScanPage(timer);
    await page.onLoad({ role: 'event_staff' });
    page.setContinuous(false);
    for (let i = 0; i < 25; i++) {
      await page.onScan();
      await flush();
    }
    expect(page.state.recent.length).toBe(20);
    expect(page.state.recent[0].code).toBe('ok-24');
  });

  it('扫码取消（用户返回）不产生记录也不推进连续扫码', async () => {
    const { wx, calls } = makeWx(['__FAIL_CANCEL__']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const timer = new FakeTimer();
    const page = new ScanPage(timer);
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.recent.length).toBe(0);
    timer.tick(2000);
    expect(calls.filter((c) => c.api === 'scanCode').length).toBe(1);
  });
});

describe('相机权限被拒（AC5）', () => {
  it('失败原因含 auth/permission 时进入权限引导态', async () => {
    const { wx } = makeWx(['__FAIL_PERMISSION__']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.permissionDenied).toBe(true);
  });

  it('引导调用 wx.openSetting，授权后清掉引导态', async () => {
    const { wx, calls } = makeWx(['__FAIL_PERMISSION__']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    const setting = await page.openSetting();
    expect(calls.some((c) => c.api === 'openSetting')).toBe(true);
    expect(setting?.['scope.camera']).toBe(true);
    expect(page.state.permissionDenied).toBe(false);
  });

  it('权限被拒后连续扫码不自动重试，避免反复弹窗', async () => {
    const { wx, calls } = makeWx(['__FAIL_PERMISSION__', 'ok-1']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const timer = new FakeTimer();
    const page = new ScanPage(timer);
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    timer.tick(2000);
    await Promise.resolve();
    expect(calls.filter((c) => c.api === 'scanCode').length).toBe(1);
  });
});

describe('网络失败与活动切换', () => {
  it('网络失败提示重试，不写本地排队', async () => {
    const { wx, calls } = makeWx(['err-network']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.toast).toContain('请重试');
    expect(calls.some((c) => c.api === 'setStorage')).toBe(false);
    expect(page.state.recent.length).toBe(0);
  });

  it('失败提示会在下一次扫码开始时清掉，成功后不再残留', async () => {
    const { wx } = makeWx(['err-network', 'ok-2']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    expect(page.state.toast).toContain('请重试');
    await page.onScan();
    expect(page.state.toast).toBe('');
    expect(page.state.card?.result).toBe('ok');
  });

  it('最近记录带上结果卡主色，便于列表里区分成功与失败', async () => {
    const { wx } = makeWx(['ok-1', 'bad-2']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    await page.onScan();
    await page.onScan();
    expect(page.state.recent[0].color.toLowerCase()).toBe('#fa5151');
    expect(page.state.recent[1].color.toLowerCase()).toBe('#07c160');
    for (const r of page.state.recent) {
      expect(r.color).toBe(RESULT_CARDS[r.result as keyof typeof RESULT_CARDS].color);
    }
  });

  it('顶部可切换到当天其他活动，并随签到累加已到人数', async () => {
    const { wx } = makeWx(['ok-1']);
    (globalThis as unknown as { wx: unknown }).wx = wx;
    const page = new ScanPage(new FakeTimer());
    await page.onLoad({ role: 'event_staff' });
    page.switchEvent('evt_1003');
    expect(page.state.event?.id).toBe('evt_1003');
    const before = page.state.event?.arrived || 0;
    await page.onScan();
    expect(page.state.event?.arrived).toBe(before + 1);
  });

  it('today() 返回 YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('角色只能来自登录态会话（AC3 防绕过）', () => {
  it('页面注册层不读 URL query 的 role，只从会话取', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/pages/staff/scan.page.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('query.role');
    expect(src).toContain('getSessionRole()');
  });

  it('会话模块默认无角色，写入后可读、复位后清空', async () => {
    const s = await import('../src/auth/session.ts');
    s.resetSession();
    expect(s.getSessionRole()).toBe(null);
    s.setSessionRole('event_staff');
    expect(s.getSessionRole()).toBe('event_staff');
    s.resetSession();
    expect(s.getSessionRole()).toBe(null);
  });
});

describe('页面注册层状态同步（返工修复：定时器回调必须 setData）', () => {
  // 模块级缓存：ESM 只会执行一次页面注册文件，因此 Page() 的捕获结果必须跨用例复用
  const captured: any[] = [];
  /** 装载真实页面注册文件：全局注入 Page() 捕获定义，wx 用伪实现 */
  async function loadPageDef() {
    (globalThis as any).Page = (opts: any) => { captured.push(opts); };
    await import('../src/pages/staff/scan.page.ts');
    expect(captured.length).toBeGreaterThan(0);
    return captured[0];
  }

  function makeCtx(def: any) {
    const ctx: any = {
      data: { ...def.data },
      scanPage: null,
      patches: [] as any[],
      setData(patch: any) {
        this.patches.push(patch);
        Object.assign(this.data, patch);
      },
      sync() { (def.sync as any).call(this); }
    };
    for (const k of Object.keys(def)) {
      if (typeof def[k] === 'function' && k !== 'sync' && k !== 'setData') ctx[k] = (def[k] as any).bind(ctx);
    }
    ctx.sync = () => (def.sync as any).call(ctx);
    return ctx;
  }

  it('结果卡 1.5 秒后消失、自动再扫到的新结果都通过 setData 反映到界面', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { wx, calls } = makeWx(['ok-1', 'bad-2']);
      (globalThis as any).wx = wx;
      const { setSessionRole } = await import('../src/auth/session.ts');
      setSessionRole('event_staff');
      const def = await loadPageDef();
      const ctx = makeCtx(def);
      ctx.onLoad({});
      await flush();
      expect(ctx.data.loading).toBe(false);
      expect(ctx.data.event?.id).toBeTruthy();

      await ctx.onScan();
      await flush();
      expect(ctx.data.card?.result).toBe('ok');
      expect(ctx.data.recent.length).toBe(1);
      expect(calls.filter((c) => c.api === 'scanCode').length).toBe(1);

      // 推进 1.5 秒：定时器回调里清卡片 -> 通知界面 -> 自动再次拉起扫码 -> 扫到 second code
      vi.advanceTimersByTime(1500);
      await flush(10);
      await flush(10);

      // 关键断言：卡片消失这一变化必须已经通过 setData 交给界面
      expect(ctx.patches.some((pp: any) => Object.prototype.hasOwnProperty.call(pp, 'card') && pp.card === null)).toBe(true);
      expect(ctx.patches.filter((pp: any) => pp.scanning === true).length).toBeGreaterThanOrEqual(2);
      // 第二条结果卡与两条最近记录同样必须已经同步
      expect(calls.filter((c) => c.api === 'scanCode').length).toBe(2);
      expect(ctx.data.card?.result).toBe('invalid_code');
      expect(ctx.data.card?.color.toLowerCase()).toBe('#fa5151');
      expect(ctx.data.recent.length).toBe(2);
      expect(ctx.data.recent[0].code).toBe('bad-2');
      expect(ctx.data.scanning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('定时器只清结果卡（不触发再扫）时，界面同样必须收到卡片消失的 setData', async () => {
    // 这条用例把「定时器回调必须自己通知界面」隔离出来：清完卡片后当前活动被置空，
    // 于是不会再自动拉起扫码，界面上唯一的变化来源就是定时器回调本身。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { wx } = makeWx(['ok-1']);
      (globalThis as any).wx = wx;
      const { setSessionRole } = await import('../src/auth/session.ts');
      setSessionRole('event_staff');
      const def = await loadPageDef();
      const ctx = makeCtx(def);
      ctx.onLoad({});
      await flush();
      await ctx.onScan();
      await flush();
      expect(ctx.data.card?.result).toBe('ok');
      const before = ctx.patches.length;
      ctx.scanPage.state.event = null; // 隔离：不触发自动再扫
      vi.advanceTimersByTime(1500);
      await flush(10);
      expect(ctx.patches.length).toBeGreaterThan(before);
      expect(ctx.data.card).toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });

  it('已到人数累加与结果卡同步：卡片收起后界面上的 arrived 也已更新', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { wx } = makeWx(['ok-1']);
      (globalThis as any).wx = wx;
      const { setSessionRole } = await import('../src/auth/session.ts');
      setSessionRole('site_admin');
      const def = await loadPageDef();
      const ctx = makeCtx(def);
      ctx.onLoad({});
      await flush();
      const before = ctx.data.event.arrived;
      await ctx.onScan();
      await flush();
      expect(ctx.data.event.arrived).toBe(before + 1);
      vi.advanceTimersByTime(1500);
      await flush(10);
      expect(ctx.data.card).toBe(null);
      expect(ctx.data.event.arrived).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('非员工进入页面即提示无权限并自动返回上一页（不需要点按钮）', async () => {
    const { wx, calls } = makeWx([]);
    (globalThis as any).wx = wx;
    const { setSessionRole, resetSession } = await import('../src/auth/session.ts');
    resetSession();
    setSessionRole('member');
    const def = await loadPageDef();
    const ctx = makeCtx(def);
    ctx.onLoad({});
    await flush();
    expect(ctx.data.forbidden).toBe(true);
    expect(calls.some((c) => c.api === 'showToast')).toBe(true);
    expect(calls.some((c) => c.api === 'navigateBack')).toBe(true);
    resetSession();
  });
});
