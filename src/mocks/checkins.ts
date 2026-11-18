import type { CheckinResponse } from '../api/client';

/**
 * 票码约定（虚构）：ok-* / dup-* / exp-* / wrong-* / bad-* / non-* / closed-* / err-*
 * 真实接口上线后删除本文件即可，页面逻辑不变。
 */
const SAMPLE = {
  member_name: '林知远',
  member_company: '星澈智能科技（虚构）'
};

export function mockSubmitCheckin(code: string, eventId: string): CheckinResponse {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'err-network') throw new Error('mock network failure');
  if (c.startsWith('ok-')) return { result: 'ok', ...SAMPLE };
  if (c.startsWith('dup-')) return { result: 'already_checked_in', ...SAMPLE, first_checkin_at: '2026-11-20T09:12:33+08:00' };
  if (c.startsWith('exp-')) return { result: 'expired_code', reason: '电子票有效期已过' };
  if (c.startsWith('wrong-')) return { result: 'wrong_event', suggested_event_name: '2026 秋季会员对接会' };
  if (c.startsWith('bad-')) return { result: 'invalid_code', reason: '票码格式无法识别' };
  if (c.startsWith('non-')) return { result: 'not_member', reason: '该电子票不属于本平台会员' };
  if (c.startsWith('closed-')) return { result: 'event_closed', reason: '该活动已截止签到' };
  void eventId;
  return { result: 'server_error', reason: '服务端暂时不可用' };
}
