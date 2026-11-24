'use strict';
const crypto = require('node:crypto');

let bcryptjs;
try { bcryptjs = require('bcryptjs'); } catch { bcryptjs = null; }

async function hashPassword(password) {
  if (bcryptjs) return bcryptjs.hash(password, 12);
  // Hash alternativo é permitido apenas na suíte offline; em produção, o backend
  // precisa manter compatibilidade BCrypt com as credenciais já armazenadas.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Dependência bcryptjs ausente. Execute npm install antes de criar credenciais.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, result) => err ? reject(err) : resolve(result)));
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  if (!encoded) return false;
  if (String(encoded).startsWith('$2')) {
    if (!bcryptjs) throw new Error('Para autenticar senhas BCrypt já existentes, instale a dependência bcryptjs (npm install).');
    return bcryptjs.compare(password, encoded);
  }
  const parts = String(encoded).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await new Promise((resolve, reject) => crypto.scrypt(password, parts[1], expected.length, (err, result) => err ? reject(err) : resolve(result)));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function signToken(data, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(data));
  const content = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('Token de acesso ausente.');
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new Error('Token de acesso inválido.');
  const content = `${pieces[0]}.${pieces[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(content).digest();
  const actual = Buffer.from(pieces[2], 'base64url');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('Token de acesso inválido.');
  let header; let payload;
  try { header = JSON.parse(Buffer.from(pieces[0], 'base64url').toString()); payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString()); }
  catch { throw new Error('Token de acesso inválido.'); }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Tipo de token não suportado.');
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token de acesso expirado.');
  if (!payload.sub || !payload.jti) throw new Error('Token sem identificador de sessão.');
  return payload;
}

function createMobileToken(user, secret, expirationHours = 8) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: String(user.id_usuario), email: user.email, name: user.nome, profile: user.perfil,
    jti: crypto.randomUUID(), iat: now, exp: now + expirationHours * 3600
  }, secret);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, createMobileToken };
