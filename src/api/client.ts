// 接口层：两处先用 mock，切换真实接口只改本文件的 BASE 与 USE_MOCK
import { getWx } from '../types/wx.ts';
import type { CheckinResult } from '../components/result-card.ts';

export const USE_MOCK = true;
export const BASE_URL = 'https://api.example.invalid';

export interface StaffEvent {
  id: string;
  name: string;
  arrived: number;
  expected: number;
  starts_at: string;
  ends_at: string;
}

export interface StaffEventsResponse {
  events: StaffEvent[];
  current_event_id: string;
}

export interface CheckinResponse {
  result: CheckinResult | string;
  member_name?: string;
  member_company?: string;
  first_checkin_at?: string;
  suggested_event_name?: string;
  reason?: string;
}

/** 触网失败（非业务失败）时抛出，页面据此提示重试，不在本地排队补交 */
export class NetworkError extends Error {}

function request<T>(path: string, method: 'GET' | 'POST', data?: unknown): Promise<T> {
  const wx = getWx();
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: { 'content-type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          reject(new NetworkError('HTTP ' + res.statusCode));
        }
      },
      fail(err) {
        reject(new NetworkError(err.errMsg || 'request failed'));
      }
    });
  });
}

/** GET /api/mini/staff/events?date= —— 当天活动列表与当前活动，另单实现，本单先 mock */
export async function fetchStaffEvents(date: string): Promise<StaffEventsResponse> {
  if (USE_MOCK) {
    const m = await import('../mocks/events.ts');
    return m.mockStaffEvents(date);
  }
  return request<StaffEventsResponse>('/api/mini/staff/events?date=' + encodeURIComponent(date), 'GET');
}

/** POST /api/mini/staff/checkins —— 提交扫码结果，另单实现，本单先 mock */
export async function submitCheckin(code: string, eventId: string): Promise<CheckinResponse> {
  if (USE_MOCK) {
    const m = await import('../mocks/checkins.ts');
    return m.mockSubmitCheckin(code, eventId);
  }
  return request<CheckinResponse>('/api/mini/staff/checkins', 'POST', { code, event_id: eventId });
}
