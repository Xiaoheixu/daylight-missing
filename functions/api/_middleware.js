// 全局中间件：统一加载/保存 session + 在线/访问统计
import {
  getGameState,
  saveGameState,
  setSidCookie,
  jsonResponse,
} from './_lib/session.js';

export async function onRequest(context) {
  const { env, request } = context;

  // 1. 加载（或新建）会话状态
  const { sid, state, isNew } = await getGameState(context);

  // 2. 暴露给下游 endpoint
  context.data = context.data || {};
  context.data.session = { sid, state, isNew };

  // 3. 统计：新会话累加总访问人数
  if (isNew) {
    const cur = parseInt(await env.GAME_STATE.get('counter:total_visits') || '0', 10);
    await env.GAME_STATE.put('counter:total_visits', String(cur + 1));
  }

  // 4. 标记活跃（5 分钟 TTL，用于估算在线人数）
  await env.GAME_STATE.put(`active:${sid}`, Date.now().toString(), {
    expirationTtl: 300,
  });

  // 5. 转发到具体 endpoint
  let response;
  try {
    response = await context.next();
  } catch (err) {
    return jsonResponse({ error: '服务器内部错误', detail: String(err) }, { status: 500 });
  }

  // 6. 持久化会话状态（统一保存，简化 endpoint 逻辑）
  await saveGameState(env, sid, state);

  // 7. 新会话：通过 Set-Cookie 返回 sessionId
  if (isNew) {
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', setSidCookie(sid));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}
