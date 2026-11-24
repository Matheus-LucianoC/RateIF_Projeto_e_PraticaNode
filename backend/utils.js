'use strict';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeProfile = (value) => String(value || '').trim().toUpperCase();
const blank = (value) => value == null || String(value).trim() === '';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const date = () => new Date();
const byName = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
function json(res, status, payload) {
  const body = payload === undefined || payload === null ? '' : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
function text(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
function redirect(res, location) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}
async function readBody(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Corpo da requisição muito grande.'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}
function setCookie(res, name, value, options = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge != null) pieces.push(`Max-Age=${options.maxAge}`);
  if (options.secure) pieces.push('Secure');
  res.setHeader('Set-Cookie', pieces.join('; '));
}
function clearCookie(res, name, secure = false) { setCookie(res, name, '', { maxAge: 0, secure }); }
function errorPayload(message) { return { mensagem: message || 'Não foi possível concluir a operação.' }; }
module.exports = { emailPattern, normalizeEmail, normalizeProfile, blank, escapeHtml, date, byName, json, text, redirect, parseCookies, readBody, setCookie, clearCookie, errorPayload };
