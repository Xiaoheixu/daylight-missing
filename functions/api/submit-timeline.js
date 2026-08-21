// POST /api/submit-timeline - 时间线校准
import { jsonResponse } from './_lib/session.js';
import { CORRECT_TIMELINE } from './_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { timeline } = body;
  const isCorrect =
    Array.isArray(timeline) &&
    JSON.stringify(timeline) === JSON.stringify(CORRECT_TIMELINE);

  if (isCorrect) {
    state.timelineReconstructed = true;
    return jsonResponse({
      success: true,
      message: '时间线校准完成。七分钟的偏差，终于对上了。',
    });
  }
  return jsonResponse({
    success: false,
    message: '时间线不匹配，系统时钟之间存在偏差。',
  });
}
