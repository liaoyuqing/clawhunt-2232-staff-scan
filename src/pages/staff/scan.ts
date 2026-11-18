// 员工扫码签到页 · 页面逻辑（与 wxml/ts 同名导出，便于单元测试直接驱动）
import { getWx } from '../../types/wx.ts';
import { fetchStaffEvents, submitCheckin, NetworkError } from '../../api/client.ts';
import type { StaffEvent, StaffEventsResponse } from '../../api/client.ts';
import { specOf, subtitleOf, RESULT_CARDS } from '../../components/result-card.ts';
import type { CheckinResponseLike } from '../../components/result-card.ts';

export const RESULT_CARD_DURATION = 1500;
export const RECENT_LIMIT = 20;

export interface ScanRecord {
  id: number;
  code: string;
  result: string;
  at: number;
  title: string;
  /** 结果卡主色，最近记录按结果着色，与结果卡同一来源 */
  color: string;
}

export interface PageState {
  event: StaffEvent | null;
  events: StaffEvent[];
  continuous: boolean;
  scanning: boolean;
  card: { result: string; title: string; subtitle: string; color: string; icon: string } | null;
  recent: ScanRecord[];
  toast: string;
  permissionDenied: boolean;
  forbidden: boolean;
  loading: boolean;
}

export function initialState(): PageState {
  return {
    event: null,
    events: [],
    continuous: true,
    scanning: false,
    card: null,
    recent: [],
    toast: '',
    permissionDenied: false,
    forbidden: false,
    loading: true
  };
}

/** 角色判定：只有 event_staff / site_admin 能进本页 */
export function canAccess(role: string | null | undefined): boolean {
  return role === 'event_staff' || role === 'site_admin';
}

export interface Timer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realTimer: Timer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
};

export class ScanPage {
  state: PageState = initialState();
  /** 页面注册层订阅回调：状态一变就通知，页面层据此 setData。
   * 定时器回调（结果卡消失、自动再扫）里的状态变化同样会触发，这是本版修复的关键。 */
  onChange: ((state: PageState) => void) | null = null;
  private timer: Timer;
  private cardHandle: unknown = null;
  private seq = 0;

  constructor(timer: Timer = realTimer) {
    this.timer = timer;
  }

  /** 状态变化后通知订阅者；没有订阅者时为空操作（单元测试可直接读 state） */
  private emit(): void {
    if (this.onChange) this.onChange(this.state);
  }

  /** 进入页面：鉴权 -> 拉当天活动 -> 定当前活动 */
  async onLoad(query: { event_id?: string; role?: string | null }): Promise<void> {
    if (!canAccess(query && query.role)) {
      // 工单要求：显示「无权限」并返回上一页，因此进入即提示并自动返回，不停在按钮页
      this.denyAndBack();
      return;
    }
    const wx = getWx();
    try {
      const data: StaffEventsResponse = await fetchStaffEvents(today());
      this.state.events = data.events;
      const wanted = query && query.event_id;
      const hit = data.events.find((e) => e.id === wanted) || data.events.find((e) => e.id === data.current_event_id) || data.events[0] || null;
      this.state.event = hit;
    } catch (e) {
      this.state.toast = e instanceof NetworkError ? '网络异常，请重试' : '加载失败，请重试';
    } finally {
      this.state.loading = false;
      this.emit();
    }
    void wx;
  }

  /** 顶部切换当天其他活动 */
  switchEvent(eventId: string): void {
    const hit = this.state.events.find((e) => e.id === eventId);
    if (hit) this.state.event = hit;
    this.emit();
  }

  /** 主按钮：扫码 -> 提交 -> 展示结果卡 -> （连续扫码时）自动再拉起 */
  async onScan(): Promise<void> {
    if (!this.state.event || this.state.scanning) return;
    const wx = getWx();
    this.state.scanning = true;
    this.state.permissionDenied = false;
    this.state.toast = '';
    this.emit();
    const code = await this.scanOnce(wx);
    // 取消、权限失败、或解出空票码：都不提交，也不计入最近记录
    if (code === null || code === '') {
      this.state.scanning = false;
      this.emit();
      return;
    }
    await this.checkin(code);
  }

  private scanOnce(wx: ReturnType<typeof getWx>): Promise<string | null> {
    return new Promise((resolve) => {
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode'],
        success: (res) => resolve(res.result || ''),
        fail: (err) => {
          const msg = String((err && err.errMsg) || '');
          if (/auth|permission|deny|denied/i.test(msg)) {
            this.state.permissionDenied = true;
          }
          resolve(null);
        }
      });
    });
  }

  /** 提交一次签到并按 result 渲染结果卡 */
  async checkin(code: string): Promise<void> {
    const wx = getWx();
    const eventId = this.state.event ? this.state.event.id : '';
    let res: CheckinResponseLike & { result?: string };
    try {
      res = await submitCheckin(code, eventId);
    } catch (e) {
      this.state.scanning = false;
      this.state.toast = e instanceof NetworkError ? '网络异常，请重试' : '提交失败，请重试';
      this.emit();
      return;
    }
    this.state.toast = '';
    const result = String(res.result || 'server_error');
    this.pushRecent(code, result, res);
    this.showCard(result, res);
    const spec = specOf(result);
    if (spec.vibrate === 'short') wx.vibrateShort({ type: 'medium' });
    if (spec.vibrate === 'long') wx.vibrateLong({});
    if (this.state.event) {
      if (result === 'ok') this.state.event = { ...this.state.event, arrived: this.state.event.arrived + 1 };
    }
    this.state.scanning = false;
    this.emit();
    this.scheduleNextScan();
  }

  /** 结果卡消失后，连续扫码开启时自动再次拉起扫码 */
  private scheduleNextScan(): void {
    this.clearCardTimer();
    this.cardHandle = this.timer.setTimeout(() => {
      this.state.card = null;
      this.cardHandle = null;
      // 结果卡消失发生在定时器里，必须自己通知页面层，否则界面不会刷新
      this.emit();
      if (this.state.continuous && this.state.event && !this.state.permissionDenied) {
        void this.onScan();
      }
    }, RESULT_CARD_DURATION);
  }

  private clearCardTimer(): void {
    if (this.cardHandle !== null) {
      this.timer.clearTimeout(this.cardHandle);
      this.cardHandle = null;
    }
  }

  private showCard(result: string, res: CheckinResponseLike): void {
    const spec = specOf(result);
    this.state.card = {
      result: spec.result,
      title: spec.title,
      subtitle: subtitleOf(result, res),
      color: spec.color,
      icon: spec.icon
    };
    this.clearCardTimer();
  }

  /** 最近扫码记录只进内存，不写任何本地缓存 */
  private pushRecent(code: string, result: string, res: CheckinResponseLike): void {
    const record: ScanRecord = {
      id: ++this.seq,
      code,
      result,
      at: Date.now(),
      title: subtitleOf(result, res) || specOf(result).title,
      color: specOf(result).color
    };
    this.state.recent = [record, ...this.state.recent].slice(0, RECENT_LIMIT);
  }

  /** 开关连续扫码：关掉后即便结果卡消失也不再自动拉起 */
  setContinuous(on: boolean): void {
    this.state.continuous = on;
    if (!on) this.clearCardTimer();
    this.emit();
  }

  /** 相机权限被拒后引导去设置 */
  openSetting(): Promise<Record<string, boolean> | null> {
    const wx = getWx();
    return new Promise((resolve) => {
      wx.openSetting({
        success: (res) => {
          const granted = !!(res && res.authSetting && res.authSetting['scope.camera']);
          if (granted) this.state.permissionDenied = false;
          this.emit();
          resolve((res && res.authSetting) || null);
        },
        fail: () => {
          this.emit();
          resolve(null);
        }
      });
    });
  }

  /** 非员工直接打开：显示无权限并返回上一页 */
  denyAndBack(): void {
    const wx = getWx();
    this.state.forbidden = true;
    wx.showToast({ title: '无权限', icon: 'none' });
    wx.navigateBack({ delta: 1 });
    this.emit();
  }

  onUnload(): void {
    this.clearCardTimer();
  }
}

export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export const resultCardOrder = Object.keys(RESULT_CARDS);
