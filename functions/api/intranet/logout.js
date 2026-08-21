// POST /api/intranet/logout - 退出内网
import { jsonResponse } from '../_lib/session.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  state.intranetLoggedIn = false;
  state.currentUser = null;
  return jsonResponse({ success: true });
}
