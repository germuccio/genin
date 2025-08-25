const crypto = require('crypto');
const session = require('express-session');
const cookie = require('./_cookie');

const APP_PASSWORD = process.env.APP_PASSWORD || '123456';
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'change-me-secret';

// In-memory session store for local development
const memoryStore = new session.MemoryStore();

// This function is a simplified session middleware for serverless
function getSession(req) {
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


