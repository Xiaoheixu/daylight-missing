// POST /api/enterprise/doc - 企业网站内部文档
import { jsonResponse } from '../_lib/session.js';
import { ENTERPRISE_DOCS, ENTERPRISE_PASSWORD } from '../_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { docId, password } = body;
  if (!state.enterpriseUnlocked && password !== ENTERPRISE_PASSWORD) {
    return jsonResponse({ success: false, message: '密码错误' });
  }
  state.enterpriseUnlocked = true;
  const doc = ENTERPRISE_DOCS[docId];
  if (doc) return jsonResponse({ success: true, data: doc });
  return jsonResponse({ success: false, message: '文档不存在' });
}
