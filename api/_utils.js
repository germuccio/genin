const crypto = require('crypto');
const session = require('express-session');
const cookie = require('./_cookie');

const APP_PASSWORD = process.env.APP_PASSWORD || '123456';
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'change-me-secret';

// In-memory session store for local development
const memoryStore = new session.MemoryStore();

// HMAC helpers for the signed session cookie
function signSession(data) {
  const hmac = crypto.createHmac('sha256', APP_SESSION_SECRET);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

function parseCookies(req) {
  const header = req.headers['cookie'] || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (!k) return;
    cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

// Returns the validated session payload or { authenticated: false }
function getSession(req) {
  try {
    const cookies = parseCookies(req);
    const raw = cookies['genin_session'];
    if (!raw) {
      console.log('🔍 No genin_session cookie found');
      return { authenticated: false };
    }
    const [payloadB64, signature] = raw.split('.');
    if (!payloadB64 || !signature) {
      console.log('🔍 Invalid session format');
      return { authenticated: false };
    }
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const data = JSON.parse(json);
    const expected = signSession(data);
    const ok = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    if (!ok) {
      console.log('🔍 Session signature mismatch');
      return { authenticated: false };
    }
    console.log('✅ Session validated successfully');
    return { authenticated: true, data };
  } catch (e) {
    console.log('❌ Session validation error:', e.message);
    return { authenticated: false };
  }
}

function getVismaTokensFromCookie(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  if (cookies['visma-tokens']) {
    try {
      return JSON.parse(cookies['visma-tokens']);
    } catch (e) {
      console.error('Error parsing visma-tokens cookie:', e);
      return null;
    }
  }
  return null;
}

// Function to set consistent CORS headers
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
}

function setSessionCookie(res, data) {
  const sig = signSession(data);
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const cookie = `genin_session=${payload}.${sig}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`;
  res.setHeader('Set-Cookie', cookie);
}

module.exports = {
  APP_PASSWORD,
  setCors,
  signSession,
  parseCookies,
  getSession,
  setSessionCookie,
  getVismaTokensFromCookie
};


