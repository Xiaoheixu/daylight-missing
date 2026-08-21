// Cloudflare Pages Functions 共享 session 工具
// 使用 KV 持久化会话状态，cookie 存储 sessionId

export const SESSION_COOKIE = 'daylight_sid';
export const SESSION_TTL = 86400; // 24h（秒）

// 默认游戏状态（与原 server.js 保持一致）
export const DEFAULT_GAME_STATE = {
  intranetLoggedIn: false,
  currentUser: null,
  cluesFound: [],
  documentsAccessed: [],
  qx18Unlocked: false,
  enterpriseUnlocked: false,
  timelineReconstructed: false,
  endingReached: false,
};

// 解析 Cookie 头
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  });
  return out;
}

// 生成新 sessionId
export function genSid() {
  return 'sid_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

// 从 KV 读取会话状态；不存在则新建
export async function getGameState(context) {
  const { env, request } = context;
  const cookies = parseCookies(request.headers.get('Cookie'));
  let sid = cookies[SESSION_COOKIE];
  let state = null;
  let isNew = false;

  if (sid) {
    const raw = await env.GAME_STATE.get(`session:${sid}`);
    if (raw) {
      try { state = JSON.parse(raw); } catch (e) { state = null; }
    }
  }
  if (!state) {
    state = { ...DEFAULT_GAME_STATE };
    isNew = true;
    sid = genSid();
  }
  return { sid, state, isNew };
}

// 保存会话状态到 KV
export async function saveGameState(env, sid, state) {
  await env.GAME_STATE.put(`session:${sid}`, JSON.stringify(state), {
    expirationTtl: SESSION_TTL,
  });
}

// 生成 Set-Cookie 头
export function setSidCookie(sid) {
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

// 统一 JSON 响应工具
export function jsonResponse(data, init = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) headers.set(k, v);
  }
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers,
  });
}
