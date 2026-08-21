// POST /api/qx18/unlock - 启明星计划网站解锁
import { jsonResponse } from '../_lib/session.js';
import { QX18_UNLOCK_CODES } from '../_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { accessCode } = body;
  if (QX18_UNLOCK_CODES.includes(accessCode)) {
    state.qx18Unlocked = true;
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: false, message: '授权码错误' });
}
