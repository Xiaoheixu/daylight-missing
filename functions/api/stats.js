// GET /api/stats - 在线人数 + 总访问人数
import { jsonResponse } from './_lib/session.js';

export async function onRequestGet(context) {
  const { env } = context;

  // 总访问人数
  const total = parseInt(await env.GAME_STATE.get('counter:total_visits') || '0', 10);

  // 在线人数估算：扫描 active:* 前缀 KV
  // 注意：KV list 有最终一致性，结果是近似值
  let online = 0;
  let cursor;
  do {
    const list = await env.GAME_STATE.list({ prefix: 'active:', cursor, limit: 1000 });
    online += list.keys.length;
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // 避免把自身会话算进去导致永远 >=1（实际 0 也合理）
  if (online > 0) online = Math.max(0, online - 1);

  return jsonResponse({ online, totalVisits: total });
}
