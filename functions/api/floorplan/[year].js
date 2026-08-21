// GET /api/floorplan/:year - 建筑平面图（需内网登录）
import { jsonResponse } from '../_lib/session.js';
import { FLOORPLANS } from '../_lib/data.js';

export async function onRequestGet(context) {
  const { state } = context.data.session;
  if (!state.intranetLoggedIn) {
    return jsonResponse({ error: '未授权访问' }, { status: 403 });
  }
  const year = context.params.year;
  const plan = FLOORPLANS[year];
  if (plan) return jsonResponse(plan);
  return jsonResponse({ error: '未找到该年度存档' });
}
