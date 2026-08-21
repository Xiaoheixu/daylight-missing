// GET /api/chatlogs - 同学证词（需内网登录）
import { jsonResponse } from './_lib/session.js';
import { CHAT_LOGS } from './_lib/data.js';

export async function onRequestGet(context) {
  const { state } = context.data.session;
  if (!state.intranetLoggedIn) {
    return jsonResponse({ error: '未授权访问' }, { status: 403 });
  }
  return jsonResponse(CHAT_LOGS);
}
