// 仅声明本页面用到的 wx 能力，避免引入第三方类型包
export interface WxScanCodeResult {
  result: string;
  scanType: string;
  charSet: string;
  path: string;
  rawData: string;
}

export interface WxScanCodeOption {
  onlyFromCamera?: boolean;
  scanType?: Array<'barCode' | 'qrCode' | 'datamatrix' | 'pdf417'>;
  success?: (res: WxScanCodeResult) => void;
  fail?: (err: { errMsg: string }) => void;
}

export interface WxApi {
  scanCode(option: WxScanCodeOption): void;
  vibrateShort(option?: { type?: 'heavy' | 'medium' | 'light'; success?: () => void; fail?: () => void }): void;
  vibrateLong(option?: { success?: () => void; fail?: () => void }): void;
  openSetting(option?: { success?: (res: { authSetting: Record<string, boolean> }) => void; fail?: () => void }): void;
  getSetting(option?: { success?: (res: { authSetting: Record<string, boolean> }) => void }): void;
  setStorage(option: { key: string; data: unknown; success?: () => void; fail?: () => void }): void;
  setStorageSync(key: string, data: unknown): void;
  getStorageSync(key: string): unknown;
  showToast(option: { title: string; icon?: 'none' | 'success' | 'error'; duration?: number }): void;
  navigateBack(option?: { delta?: number }): void;
  redirectTo(option: { url: string }): void;
  request(option: {
    url: string;
    method?: 'GET' | 'POST';
    data?: unknown;
    header?: Record<string, string>;
    success?: (res: { statusCode: number; data: unknown }) => void;
    fail?: (err: { errMsg: string }) => void;
  }): void;
}

declare global {
  // 小程序运行时注入的全局对象
  // eslint-disable-next-line no-var
  var wx: WxApi;
}

export function getWx(): WxApi {
  return (globalThis as unknown as { wx: WxApi }).wx;
}
