// GET /api/access-logs - 门禁记录（需内网登录）
import { jsonResponse } from './_lib/session.js';
import { ACCESS_LOGS } from './_lib/data.js';

export async function onRequestGet(context) {
  const { state } = context.data.session;
  if (!state.intranetLoggedIn) {
    return jsonResponse({ error: '未授权访问' }, { status: 403 });
  }
  return jsonResponse(ACCESS_LOGS);
}
