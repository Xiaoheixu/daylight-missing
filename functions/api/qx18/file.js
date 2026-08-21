// POST /api/qx18/file - 启明星计划文件访问
import { jsonResponse } from '../_lib/session.js';
import { QX18_FILES } from '../_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  // 需要内网登录，或者通过启明星网站输入正确的文件编号
  if (!state.intranetLoggedIn && !state.qx18Unlocked) {
    return jsonResponse({ error: '访问受限' }, { status: 403 });
  }
  const { fileCode } = body;
  const file = QX18_FILES[fileCode];
  if (file) return jsonResponse({ success: true, data: file });
  return jsonResponse({ success: false, message: '文件编号无效' });
}
