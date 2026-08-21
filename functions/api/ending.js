// POST /api/ending - 最终结局
import { jsonResponse } from './_lib/session.js';
import { ENDINGS } from './_lib/data.js';

export async function onRequestPost(context) {
  const { state } = context.data.session;
  let body = {};
  try { body = await context.request.json(); } catch (e) {}

  const { finalChoice } = body;

  // 必须三个条件都满足
  if (!state.timelineReconstructed || !state.qx18Unlocked || !state.enterpriseUnlocked) {
    return jsonResponse({
      success: false,
      message: '你还没有拼齐所有的碎片。',
    });
  }

  state.endingReached = true;

  const ending = ENDINGS[finalChoice === 'anchor' ? 'anchor' : 'normal'];
  return jsonResponse({ success: true, ending });
}
