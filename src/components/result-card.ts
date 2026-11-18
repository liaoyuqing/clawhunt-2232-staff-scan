// 结果卡：8 种 result 的颜色、文案、图标与震动策略集中定义，页面只做渲染
export type CheckinResult =
  | 'ok'
  | 'already_checked_in'
  | 'expired_code'
  | 'wrong_event'
  | 'invalid_code'
  | 'not_member'
  | 'event_closed'
  | 'server_error';

export interface ResultCardSpec {
  result: CheckinResult;
  title: string;
  color: string;
  icon: string;
  vibrate: 'short' | 'long' | 'none';
  /** 需要从接口响应里补充的附加信息，用于副标题 */
  detailFrom: 'member' | 'firstCheckinAt' | 'suggestedEvent' | 'reason' | 'none';
}

export const RESULT_CARDS: Record<CheckinResult, ResultCardSpec> = {
  ok: {
    result: 'ok',
    title: '签到成功',
    color: '#07c160',
    icon: 'success',
    vibrate: 'short',
    detailFrom: 'member'
  },
  already_checked_in: {
    result: 'already_checked_in',
    title: '已签到',
    color: '#faad14',
    icon: 'info',
    vibrate: 'none',
    detailFrom: 'firstCheckinAt'
  },
  expired_code: {
    result: 'expired_code',
    title: '电子票已过期',
    color: '#fa5151',
    icon: 'warning',
    vibrate: 'none',
    detailFrom: 'none'
  },
  wrong_event: {
    result: 'wrong_event',
    title: '不是本场活动',
    color: '#fa5151',
    icon: 'warning',
    vibrate: 'none',
    detailFrom: 'suggestedEvent'
  },
  invalid_code: {
    result: 'invalid_code',
    title: '无法识别的票码',
    color: '#fa5151',
    icon: 'error',
    vibrate: 'long',
    detailFrom: 'reason'
  },
  not_member: {
    result: 'not_member',
    title: '该票不属于会员',
    color: '#fa5151',
    icon: 'error',
    vibrate: 'long',
    detailFrom: 'reason'
  },
  event_closed: {
    result: 'event_closed',
    title: '活动已结束签到',
    color: '#fa5151',
    icon: 'warning',
    vibrate: 'long',
    detailFrom: 'reason'
  },
  server_error: {
    result: 'server_error',
    title: '签到失败',
    color: '#fa5151',
    icon: 'error',
    vibrate: 'long',
    detailFrom: 'reason'
  }
};

export const RESULT_ORDER: CheckinResult[] = [
  'ok',
  'already_checked_in',
  'expired_code',
  'wrong_event',
  'invalid_code',
  'not_member',
  'event_closed',
  'server_error'
];

/** expired_code 的固定文案：提示会员刷新电子票，而不是让员工重试 */
export const EXPIRED_CODE_HINT = '请会员刷新电子票';

export function specOf(result: string): ResultCardSpec {
  const spec = RESULT_CARDS[result as CheckinResult];
  return spec || RESULT_CARDS.server_error;
}

/** 结果卡副标题：按 detailFrom 取响应字段，缺数据时降级为不显示 */
export function subtitleOf(result: string, payload: CheckinResponseLike | null): string {
  const spec = specOf(result);
  const p = payload || ({} as CheckinResponseLike);
  switch (spec.detailFrom) {
    case 'member': {
      const name = p.member_name || '';
      const company = p.member_company || '';
      if (!name && !company) return '';
      return company ? name + ' · ' + company : name;
    }
    case 'firstCheckinAt':
      return p.first_checkin_at ? '首次签到 ' + formatTime(p.first_checkin_at) : '';
    case 'suggestedEvent':
      return p.suggested_event_name ? '应去：' + p.suggested_event_name : '请确认活动二维码';
    case 'reason':
      return p.reason || '';
    default:
      return '';
  }
}

export interface CheckinResponseLike {
  member_name?: string;
  member_company?: string;
  first_checkin_at?: string;
  suggested_event_name?: string;
  reason?: string;
}

/** 把 ISO 时间转成 HH:mm，异常输入原样返回，避免页面显示 NaN */
export function formatTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}
