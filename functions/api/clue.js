// POST /api/clue - 提交线索（去重追加）
import { jsonResponse } from './_lib/session.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { clueId } = body;
  if (clueId && !state.cluesFound.includes(clueId)) {
    state.cluesFound.push(clueId);
  }
  return jsonResponse({ success: true, clues: state.cluesFound });
}
