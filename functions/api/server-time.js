// GET /api/server-time - 多系统时间查询
import { jsonResponse } from './_lib/session.js';
import { TIME_OFFSETS } from './_lib/data.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const source = url.searchParams.get('source') || '';
  const base = new Date('2018-06-14T19:03:00');
  const offset = TIME_OFFSETS[source] || 0;
  const displayTime = new Date(base.getTime() + offset)
    .toISOString()
    .replace('T', ' ')
    .substr(0, 19);
  return jsonResponse({ source, displayTime, note: '-' });
}
