// GET /api/student/:name - 学生档案（需内网登录）
import { jsonResponse } from '../_lib/session.js';
import { STUDENT_RECORDS } from '../_lib/data.js';

export async function onRequestGet(context) {
  const { state } = context.data.session;
  if (!state.intranetLoggedIn) {
    return jsonResponse({ error: '未授权访问' }, { status: 403 });
  }
  const name = decodeURIComponent(context.params.name);
  const record = STUDENT_RECORDS[name];
  if (record) return jsonResponse(record);
  return jsonResponse({ error: '未找到匹配记录' });
}
