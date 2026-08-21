// POST /api/intranet/login - 校园内网登录
import { jsonResponse } from '../_lib/session.js';
import { VALID_CREDENTIALS } from '../_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { username, password } = body;
  const isValid = VALID_CREDENTIALS.some(
    cred => cred.username === username && cred.password === password
  );

  if (isValid) {
    state.intranetLoggedIn = true;
    state.currentUser = username;
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: false, message: '用户名或密码错误' });
}
