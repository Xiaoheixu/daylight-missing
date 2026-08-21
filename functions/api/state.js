// GET /api/state - 返回当前会话游戏状态
import { jsonResponse } from './_lib/session.js';

export async function onRequestGet(context) {
  const { state } = context.data.session;
  return jsonResponse(state);
}
