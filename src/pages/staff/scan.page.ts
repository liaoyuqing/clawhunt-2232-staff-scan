// pages/staff/scan.page.ts · 小程序页面注册层：只负责把 wx 生命周期转发给 ScanPage
// 业务逻辑全部在 ./scan.ts 里，可直接单元测试；这一层只做 setData 同步。
import { ScanPage } from './scan.ts';
import { getSessionRole } from '../../auth/session.ts';
import type { PageState } from './scan.ts';

interface PageData {
  event: PageState['event'];
  events: PageState['events'];
  continuous: boolean;
  scanning: boolean;
  card: PageState['card'];
  recent: PageState['recent'];
  permissionDenied: boolean;
  toast: string;
  forbidden: boolean;
  loading: boolean;
  pickerVisible: boolean;
}

interface PageContext {
  data: PageData;
  scanPage: ScanPage | null;
  setData(patch: Partial<PageData>): void;
  sync(): void;
  onLoad(query: Record<string, string>): void;
  onScan(): void;
  onContinuousChange(e: { detail: { value: boolean } }): void;
  onOpenSetting(): void;
  onDenyBack(): void;
  onToggleEventPicker(): void;
  onPickerVisibleChange(e: { detail: { visible: boolean } }): void;
  onSelectEvent(e: { currentTarget: { dataset: { id: string } } }): void;
  onUnload(): void;
}

Page({
  data: {
    event: null,
    events: [],
    continuous: true,
    scanning: false,
    card: null,
    recent: [],
    permissionDenied: false,
    toast: '',
    forbidden: false,
    loading: true,
    pickerVisible: false
  },
  scanPage: null,

  onLoad(this: PageContext, query: Record<string, string>) {
    const p = new ScanPage();
    this.scanPage = p;
    // 订阅逻辑层状态变化：定时器回调（结果卡消失、自动再扫、写入新记录）也会走这里 setData
    p.onChange = () => this.sync();
    p.onLoad({ event_id: query.event_id, role: getSessionRole() }).then(() => this.sync());
  },

  sync(this: PageContext) {
    const s = this.scanPage!.state;
    this.setData({
      event: s.event,
      events: s.events,
      continuous: s.continuous,
      scanning: s.scanning,
      card: s.card,
      recent: s.recent,
      permissionDenied: s.permissionDenied,
      toast: s.toast,
      forbidden: s.forbidden,
      loading: s.loading
    });
  },

  onScan(this: PageContext) {
    this.scanPage!.onScan().then(() => this.sync());
  },

  onContinuousChange(this: PageContext, e: { detail: { value: boolean } }) {
    this.scanPage!.setContinuous(e.detail.value);
    this.sync();
  },

  onOpenSetting(this: PageContext) {
    this.scanPage!.openSetting().then(() => this.sync());
  },

  onDenyBack(this: PageContext) {
    this.scanPage!.denyAndBack();
  },

  onToggleEventPicker(this: PageContext) {
    this.setData({ pickerVisible: !this.data.pickerVisible });
  },

  onPickerVisibleChange(this: PageContext, e: { detail: { visible: boolean } }) {
    this.setData({ pickerVisible: e.detail.visible });
  },

  onSelectEvent(this: PageContext, e: { currentTarget: { dataset: { id: string } } }) {
    this.scanPage!.switchEvent(e.currentTarget.dataset.id);
    this.setData({ pickerVisible: false });
    this.sync();
  },

  onUnload(this: PageContext) {
    this.scanPage!.onUnload();
  }
} as unknown as Record<string, unknown>);
