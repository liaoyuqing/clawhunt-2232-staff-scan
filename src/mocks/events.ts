import type { StaffEventsResponse, StaffEvent } from '../api/client';

const EVENTS: StaffEvent[] = [
  { id: 'evt_1001', name: '2026 秋季会员对接会', arrived: 128, expected: 160, starts_at: '2026-11-20T09:00:00+08:00', ends_at: '2026-11-20T17:00:00+08:00' },
  { id: 'evt_1002', name: '产业资源闭门沙龙', arrived: 42, expected: 60, starts_at: '2026-11-20T19:00:00+08:00', ends_at: '2026-11-20T21:30:00+08:00' },
  { id: 'evt_1003', name: '会员企业走访（上午场）', arrived: 18, expected: 24, starts_at: '2026-11-20T09:30:00+08:00', ends_at: '2026-11-20T11:30:00+08:00' }
];

/** 全部为虚构数据，不含任何真实企业或个人信息 */
export function mockStaffEvents(date: string): StaffEventsResponse {
  void date;
  return { events: EVENTS.map((e) => ({ ...e })), current_event_id: EVENTS[0].id };
}
