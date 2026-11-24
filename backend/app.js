'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword, createMobileToken, verifyToken } = require('./security');
const {
  emailPattern, normalizeEmail, normalizeProfile, blank, escapeHtml, date, byName,
  json, text, redirect, parseCookies, readBody, setCookie, clearCookie, errorPayload
} = require('./utils');

const TEMPLATE_DIR = path.join(__dirname, '..', 'web', 'templates');
const STATIC_DIR = path.join(__dirname, '..', 'web', 'static');
const ROLES = new Set(['ADMIN', 'COORDENACAO', 'ALUNO', 'PROFESSOR', 'TECNICO', 'RESPONSAVEL', 'USUARIO']);
const PRE_REGISTER_ROLES = new Set(['COORDENACAO', 'ALUNO', 'PROFESSOR', 'TECNICO', 'RESPONSAVEL', 'USUARIO']);
const MESSAGE_ROLES = new Set(['ADMIN', 'COORDENACAO', 'PROFESSOR']);
const MANAGEMENT_ROLES = new Set(['ADMIN', 'COORDENACAO']);
const SAA_TYPES = new Set(['GERAL', 'DIAGNOSTICA', 'FORMATIVA', 'SOMATIVA']);
const SAA_STATUSES = new Set(['EM_ACOMPANHAMENTO', 'NECESSITA_INTERVENCAO', 'CONCLUIDO']);
const REQ_STATUSES = new Set(['ABERTO', 'EM_ANALISE', 'ENCAMINHADO_VDC', 'CONCLUIDO']);
const VOTE_OPTIONS = new Set(['APROVAR', 'RECUPERACAO', 'RETER', 'ABSTENCAO']);
const SESSION_COOKIE = 'rateif.sid';
const PK = {
  usuario: 'id_usuario', email_perfil_permitido: 'id', recuperacao_senha: 'id_recuperacao',
  mobile_token_revogado: 'jti', presenca_usuario: 'usuario_id', mensagem_interna: 'id_mensagem',
  turma: 'id_turma', aluno: 'id_aluno', professor: 'id_professor', responsavel: 'id_responsavel',
  tecnico: 'id_tecnico', avaliacao: 'id_avaliacao', relatorio: 'id_relatorio', log_download_relatorio: 'id_log',
  votacao_conselho: 'id_votacao', voto_conselho: 'id_voto', requerimento: 'id_requerimento'
};

function statusError(status, message) { return Object.assign(new Error(message), { status }); }
function assert(condition, message, status = 400) { if (!condition) throw statusError(status, message); }
function nowDate() { return new Date(); }
function timestamp(value) { const n = value instanceof Date ? value.getTime() : new Date(value || 0).getTime(); return Number.isFinite(n) ? n : 0; }
function sortNewest(a, b, field) { return timestamp(b[field]) - timestamp(a[field]); }
function publicUser(user) {
  return { id: user.id_usuario, nome: user.nome, email: user.email, perfil: user.perfil, status: Boolean(user.status) };
}
function adminUser(user) {
  return { id: user.id_usuario, nome: user.nome, email: user.email, perfil: user.perfil, status: Boolean(user.status), criadoEm: user.criado_em };
}
function sendError(res, error) { json(res, Number(error.status) || 500, errorPayload(error.message)); }
function serializeDate(value) { return value == null ? null : value; }

function resolveTemplate(fileName, model = {}) {
  let html = fs.readFileSync(path.join(TEMPLATE_DIR, fileName), 'utf8');
  const profile = normalizeProfile(model.perfil || 'USUARIO');
  html = html.replace(/\s+th:attr="data-perfil=\$\{perfil\}"/g, ` data-perfil="${escapeHtml(profile)}"`);
  html = html.replace(/\s+th:attr="data-perfil=\$\{perfil\},data-admin=\$\{perfil == 'ADMIN'\}"/g, ` data-perfil="${escapeHtml(profile)}" data-admin="${profile === 'ADMIN'}"`);
  if (model.usuarioId != null) html = html.replace(/<body\b([^>]*)>/i, `<body$1 data-user-id="${escapeHtml(model.usuarioId)}">`);
  html = html.replace(/(<([A-Za-z][\w:-]*)\b[^>]*?)\s+th:text="\$\{([^}]+)\}"([^>]*)>([\s\S]*?)<\/\2>/g, (whole, before, tag, expression, after) => {
    const key = expression.trim();
    const value = model[key] == null ? '' : model[key];
    return `${before}${after}>${escapeHtml(value)}</${tag}>`;
  });
  // Avalia as poucas condições declarativas usadas pelo front original, sem
  // depender da posição do atributo th:if em relação aos demais atributos.
  const keepForProfile = (condition) => {
    const expression = String(condition || '').trim();
    if (/perfil\s*!=\s*'ADMIN'/.test(expression)) return profile !== 'ADMIN';
    const allowedProfiles = [...expression.matchAll(/perfil\s*==\s*'([^']+)'/g)].map((match) => match[1]);
    return allowedProfiles.length > 0 && allowedProfiles.includes(profile);
  };
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attributes, content) => {
    const conditional = attributes.match(/\s+th:if="\$\{([^}]+)\}"/);
    if (!conditional) return whole;
    if (!keepForProfile(conditional[1])) return '';
    const cleanAttributes = attributes.replace(/\s+th:if="[^"]*"/, '');
    return `<a${cleanAttributes}>${content}</a>`;
  });
  html = html.replace(/<article\b([^>]*)>([\s\S]*?)<\/article>/g, (whole, attributes, content) => {
    const conditional = attributes.match(/\s+th:if="\$\{([^}]+)\}"/);
    if (!conditional) return whole;
    if (!keepForProfile(conditional[1])) return '';
    const cleanAttributes = attributes.replace(/\s+th:if="[^"]*"/, '');
    return `<article${cleanAttributes}>${content}</article>`;
  });
  html = html.replace(/\s+th:inline="javascript"/g, '');
  html = html.replace(/\/\*\[\[\$\{googleClientId\}\]\]\*\/\s*""/g, JSON.stringify(model.googleClientId || ''));
  // A aplicação original usava o mecanismo de template somente para os atributos acima.
  html = html.replace(/\s+th:[\w:-]+="[^"]*"/g, '');
  return html;
}

function createApp({ store, env = process.env, logger = console } = {}) {
  if (!store) throw new Error('Um adaptador de dados é obrigatório.');
  const sessionTtlMs = Number(env.WEB_SESSION_IDLE_MINUTES || 30) * 60 * 1000;
  const sessionAbsoluteTtlMs = Number(env.WEB_SESSION_MAX_HOURS || 12) * 60 * 60 * 1000;
  const mobileRefreshTtlMs = Number(env.MOBILE_REFRESH_DAYS || 30) * 24 * 60 * 60 * 1000;
  const mobileRefreshAbsoluteTtlMs = Number(env.MOBILE_REFRESH_MAX_DAYS || 90) * 24 * 60 * 60 * 1000;
  assert(Number.isFinite(sessionTtlMs) && sessionTtlMs >= 60_000, 'WEB_SESSION_IDLE_MINUTES precisa ser pelo menos 1.');
  assert(Number.isFinite(sessionAbsoluteTtlMs) && sessionAbsoluteTtlMs >= sessionTtlMs, 'WEB_SESSION_MAX_HOURS inválido.');
  assert(Number.isFinite(mobileRefreshTtlMs) && mobileRefreshTtlMs >= 60_000, 'MOBILE_REFRESH_DAYS inválido.');
  assert(Number.isFinite(mobileRefreshAbsoluteTtlMs) && mobileRefreshAbsoluteTtlMs >= mobileRefreshTtlMs, 'MOBILE_REFRESH_MAX_DAYS inválido.');
  const jwtSecret = env.MOBILE_JWT_SECRET || 'rateif-mobile-development-secret-please-change-this-2026';
  const productionSecretIsPlaceholder = /troque-este-segredo|please-change-this/i.test(String(env.MOBILE_JWT_SECRET || ''));
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' && (!env.MOBILE_JWT_SECRET || productionSecretIsPlaceholder)) {
    throw new Error('Defina um MOBILE_JWT_SECRET próprio em produção.');
  }
  const tokenHours = Number(env.MOBILE_JWT_EXPIRATION_HOURS || 8);
  if (jwtSecret.length < 32) throw new Error('MOBILE_JWT_SECRET precisa ter pelo menos 32 caracteres.');
  if (!Number.isFinite(tokenHours) || tokenHours <= 0) throw new Error('MOBILE_JWT_EXPIRATION_HOURS precisa ser maior que zero.');
  const cookieSecure = env.SESSION_COOKIE_SECURE == null
    ? String(env.NODE_ENV || '').toLowerCase() === 'production'
    : String(env.SESSION_COOKIE_SECURE).toLowerCase() === 'true';

  const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
  const requestIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 45) || null;
  const userAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 500) || null;
  const deviceName = (req, type) => {
    const agent = userAgent(req) || '';
    if (type === 'MOBILE') {
      if (/android/i.test(agent)) return 'Aplicativo mobile · Android';
      if (/iphone|ipad|ios/i.test(agent)) return 'Aplicativo mobile · iOS';
      return 'Aplicativo mobile';
    }
    if (/edg\//i.test(agent)) return 'Navegador Edge';
    if (/chrome\//i.test(agent)) return 'Navegador Chrome';
    if (/firefox\//i.test(agent)) return 'Navegador Firefox';
    if (/safari\//i.test(agent)) return 'Navegador Safari';
    return 'Navegador web';
  };
  function sessionPublic(row, currentId = null, owner = null) {
    return {
      id: row.id_sessao, tipo: row.tipo, dispositivo: row.dispositivo || (row.tipo === 'MOBILE' ? 'Aplicativo mobile' : 'Navegador web'),
      ip: row.ip || null, userAgent: row.user_agent || null, criadaEm: row.criada_em, ultimoAcesso: row.ultimo_acesso,
      expiraEm: row.expira_em, revogadaEm: row.revogada_em || null,
      atual: Boolean(currentId && row.id_sessao === currentId),
      usuarioId: owner?.id_usuario ?? row.id_usuario, usuarioNome: owner?.nome ?? undefined, usuarioEmail: owner?.email ?? undefined,
      perfil: owner?.perfil ?? undefined
    };
  }
  async function revokeSessionRecord(row) {
    if (!row || row.revogada_em) return false;
    if (row.tipo === 'MOBILE' && row.access_jti) {
      const exists = await store.byId('mobile_token_revogado', row.access_jti);
      if (!exists) await store.insert('mobile_token_revogado', { jti: row.access_jti, expira_em_epoch: Math.floor(Date.now() / 1000) + tokenHours * 3600 });
    }
    await store.update('sessao_usuario', row.id_sessao, { revogada_em: date(), refresh_hash: null });
    return true;
  }
  async function revokeUserSessions(userId) {
    const records = await store.select('sessao_usuario', (row) => String(row.id_usuario) === String(userId) && row.revogada_em == null);
    for (const row of records) await revokeSessionRecord(row);
    return records.length;
  }
  async function getWebSession(req) {
    const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!sid) return null;
    const id = sha256(sid);
    const session = await store.byId('sessao_usuario', id);
    if (!session || session.tipo !== 'WEB' || session.revogada_em || timestamp(session.expira_em) <= Date.now() || timestamp(session.expira_absoluta_em) <= Date.now()) return null;
    const user = await store.byId('usuario', session.id_usuario);
    if (!user || !Boolean(user.status)) return null;
    const now = Date.now();
    const last = timestamp(session.ultimo_acesso);
    if (now - last >= 60_000) {
      const absolute = timestamp(session.expira_absoluta_em);
      await store.update('sessao_usuario', id, { ultimo_acesso: date(), expira_em: new Date(Math.min(now + sessionTtlMs, absolute)) });
    }
    return { user, session };
  }
  async function getWebUser(req) {
    return (await getWebSession(req))?.user || null;
  }
  async function startWebSession(req, res, user) {
    const rawId = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const id = sha256(rawId);
    await store.insert('sessao_usuario', {
      id_sessao: id, id_usuario: user.id_usuario, tipo: 'WEB', access_jti: null, refresh_hash: null,
      criada_em: date(), ultimo_acesso: date(), expira_em: new Date(now + sessionTtlMs),
      expira_absoluta_em: new Date(now + sessionAbsoluteTtlMs), revogada_em: null,
      ip: requestIp(req), user_agent: userAgent(req), dispositivo: deviceName(req, 'WEB')
    });
    setCookie(res, SESSION_COOKIE, rawId, { secure: cookieSecure });
    return id;
  }
  async function issueMobileSession(req, user) {
    const token = createMobileToken(user, jwtSecret, tokenHours);
    const claims = verifyToken(token, jwtSecret);
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const now = Date.now();
    const expiresAt = Math.min(now + mobileRefreshTtlMs, now + mobileRefreshAbsoluteTtlMs);
    const id = crypto.randomUUID();
    const row = await store.insert('sessao_usuario', {
      id_sessao: id, id_usuario: user.id_usuario, tipo: 'MOBILE', access_jti: claims.jti,
      refresh_hash: sha256(refreshToken), criada_em: date(), ultimo_acesso: date(),
      expira_em: new Date(expiresAt), expira_absoluta_em: new Date(now + mobileRefreshAbsoluteTtlMs),
      revogada_em: null, ip: requestIp(req), user_agent: userAgent(req), dispositivo: deviceName(req, 'MOBILE')
    });
    return { token, refreshToken, expiresIn: tokenHours * 3600, refreshExpiresIn: Math.max(0, Math.floor((expiresAt - now) / 1000)), sessionId: row.id_sessao };
  }
  async function rotateMobileSession(req, session, user) {
    assert(session && session.tipo === 'MOBILE' && !session.revogada_em, 'Sessão mobile inválida ou expirada.', 401);
    if (session.access_jti) {
      const exists = await store.byId('mobile_token_revogado', session.access_jti);
      if (!exists) await store.insert('mobile_token_revogado', { jti: session.access_jti, expira_em_epoch: Math.floor(Date.now() / 1000) + tokenHours * 3600 });
    }
    const token = createMobileToken(user, jwtSecret, tokenHours);
    const claims = verifyToken(token, jwtSecret);
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const now = Date.now();
    const expiresAt = Math.min(now + mobileRefreshTtlMs, timestamp(session.expira_absoluta_em));
    assert(expiresAt > now, 'Sessão mobile expirou. Entre novamente.', 401);
    await store.update('sessao_usuario', session.id_sessao, {
      access_jti: claims.jti, refresh_hash: sha256(refreshToken), ultimo_acesso: date(), expira_em: new Date(expiresAt),
      ip: requestIp(req) || session.ip, user_agent: userAgent(req) || session.user_agent, dispositivo: deviceName(req, 'MOBILE')
    });
    return { token, refreshToken, expiresIn: tokenHours * 3600, refreshExpiresIn: Math.max(0, Math.floor((expiresAt - now) / 1000)), sessionId: session.id_sessao };
  }
  async function refreshMobileSession(req, refreshToken) {
    assert(!blank(refreshToken), 'Token de renovação ausente.', 401);
    const session = await store.first('sessao_usuario', (row) => row.tipo === 'MOBILE' && row.refresh_hash === sha256(refreshToken));
    assert(session && !session.revogada_em && timestamp(session.expira_em) > Date.now() && timestamp(session.expira_absoluta_em) > Date.now(), 'Sessão mobile inválida ou expirada. Entre novamente.', 401);
    const user = await store.byId('usuario', session.id_usuario);
    assert(user && Boolean(user.status), 'Usuário inexistente ou inativo.', 401);
    const tokens = await rotateMobileSession(req, session, user);
    return { ...tokens, usuario: publicUser(user) };
  }
  async function getMobileSession(req) {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    try {
      const claims = verifyToken(token, jwtSecret);
      if (await store.byId('mobile_token_revogado', claims.jti)) return null;
      const session = await store.first('sessao_usuario', (row) => row.tipo === 'MOBILE' && row.access_jti === claims.jti);
      if (session && (session.revogada_em || timestamp(session.expira_em) <= Date.now() || timestamp(session.expira_absoluta_em) <= Date.now())) return null;
      const user = await store.byId('usuario', Number(claims.sub));
      if (!user || !Boolean(user.status)) return null;
      if (session && Date.now() - timestamp(session.ultimo_acesso) >= 60_000) {
        await store.update('sessao_usuario', session.id_sessao, { ultimo_acesso: date() });
      }
      return { user, session, claims };
    } catch { return null; }
  }
  async function getMobileUser(req) {
    return (await getMobileSession(req))?.user || null;
  }
  async function sessionIdFromRequest(req, type) {
    if (type === 'WEB') {
      const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      return sid ? sha256(sid) : null;
    }
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return null;
    try {
      const claims = verifyToken(auth.slice(7).trim(), jwtSecret);
      const session = await store.first('sessao_usuario', (row) => row.tipo === 'MOBILE' && row.access_jti === claims.jti);
      return session?.id_sessao || null;
    } catch { return null; }
  }
  async function listUserSessions(user, currentId) {
    const rows = await store.select('sessao_usuario', (row) => String(row.id_usuario) === String(user.id_usuario) && row.revogada_em == null && timestamp(row.expira_em) > Date.now(), (a, b) => timestamp(b.ultimo_acesso) - timestamp(a.ultimo_acesso));
    return rows.map((row) => sessionPublic(row, currentId));
  }
  async function revokeOwnedSession(user, id, currentId = null) {
    const session = await store.byId('sessao_usuario', id);
    assert(session && String(session.id_usuario) === String(user.id_usuario), 'Sessão não encontrada.', 404);
    assert(await revokeSessionRecord(session), 'Essa sessão já foi encerrada.', 409);
    return { id: session.id_sessao, atual: currentId === session.id_sessao, mensagem: 'Sessão encerrada.' };
  }
  async function listAdminSessions(currentId = null) {
    const rows = await store.select('sessao_usuario', (row) => row.revogada_em == null && timestamp(row.expira_em) > Date.now(), (a, b) => timestamp(b.ultimo_acesso) - timestamp(a.ultimo_acesso));
    return Promise.all(rows.map(async (row) => sessionPublic(row, currentId, await store.byId('usuario', row.id_usuario))));
  }
  async function revokeAdminSession(id) {
    const session = await store.byId('sessao_usuario', id);
    assert(session, 'Sessão não encontrada.', 404);
    assert(await revokeSessionRecord(session), 'Essa sessão já foi encerrada.', 409);
    return { id: session.id_sessao, usuarioId: session.id_usuario, mensagem: 'Sessão revogada pelo administrador.' };
  }
  async function requireWeb(req) {
    const user = await getWebUser(req);
    assert(user, 'Sessão inválida ou expirada.', 401);
    return user;
  }
  async function requireAdmin(req) {
    const user = await requireWeb(req);
    assert(normalizeProfile(user.perfil) === 'ADMIN', 'Acesso restrito ao perfil administrador.', 403);
    return user;
  }
  async function requireMobile(req) {
    const user = await getMobileUser(req);
    assert(user, 'Sessão mobile inválida ou expirada.', 401);
    return user;
  }
  async function requireMobileAdmin(req) {
    const user = await requireMobile(req);
    assert(normalizeProfile(user.perfil) === 'ADMIN', 'Acesso restrito ao perfil administrador ou sessão inválida.', 403);
    return user;
  }
  async function countAll(table) { return store.count(table); }
  async function dashboardCounts() {
    const [alunos, turmas, avaliacoes, relatorios, votacoesAbertas, requerimentos] = await Promise.all([
      countAll('aluno'), countAll('turma'), countAll('avaliacao'), countAll('relatorio'),
      store.count('votacao_conselho', (row) => row.status === 'ABERTA'), countAll('requerimento')
    ]);
    return { alunos, turmas, avaliacoes, relatorios, votacoesAbertas, requerimentos };
  }
  async function resolveRegistrationProfile(email) {
    const item = await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === normalizeEmail(email));
    const profile = normalizeProfile(item?.perfil);
    return PRE_REGISTER_ROLES.has(profile) ? profile : 'USUARIO';
  }
  async function consumePreRegistration(email) {
    const item = await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === normalizeEmail(email));
    if (item) await store.remove('email_perfil_permitido', item.id);
  }
  async function uniqueEmail(email, ownId = null) {
    return store.first('usuario', (row) => normalizeEmail(row.email) === normalizeEmail(email) && String(row.id_usuario) !== String(ownId));
  }
  async function ensureRoleProfile(user, body = {}) {
    const profile = normalizeProfile(user.perfil);
    if (profile === 'PROFESSOR' && !(await store.byId('professor', user.id_usuario))) {
      await store.insert('professor', { id_professor: user.id_usuario, formacao: body.formacao ?? null, nivel_formacao: body.nivelFormacao ?? null });
    }
    if (profile === 'RESPONSAVEL' && !(await store.byId('responsavel', user.id_usuario))) {
      await store.insert('responsavel', { id_responsavel: user.id_usuario, documentacao: body.documentacao ?? null });
    }
    if (profile === 'TECNICO' && !(await store.byId('tecnico', user.id_usuario))) {
      await store.insert('tecnico', { id_tecnico: user.id_usuario, crad: body.crad ?? null, formacao: body.formacao ?? null, nivel_formacao: body.nivelFormacao ?? null });
    }
    if (profile === 'ALUNO' && !(await store.first('aluno', (row) => String(row.id_usuario) === String(user.id_usuario)))) {
      await store.insert('aluno', { id_usuario: user.id_usuario, matricula: body.matricula ?? null, idade: body.idade ?? null, email_institucional: body.emailInstitucional ?? user.email, id_turma: null, id_responsavel: null, status: 1 });
    }
  }
  async function adminUpdate(ator, alvoId, payload) {
    const alvo = await store.byId('usuario', alvoId);
    assert(alvo, 'Usuário não encontrado.', 404);
    assert(payload && ['nome', 'email', 'senha', 'perfil', 'status'].some((key) => payload[key] != null), 'Informe ao menos um dado para atualizar.');
    const novoPerfil = payload.perfil == null ? normalizeProfile(alvo.perfil) : normalizeProfile(payload.perfil);
    assert(ROLES.has(novoPerfil), 'Perfil inválido.');
    const novoStatus = payload.status == null ? Boolean(alvo.status) : Boolean(payload.status);
    if (normalizeProfile(alvo.perfil) === 'ADMIN' && (novoPerfil !== 'ADMIN' || !novoStatus)) {
      const admins = await store.count('usuario', (row) => normalizeProfile(row.perfil) === 'ADMIN' && Boolean(row.status));
      assert(admins > 1, 'Mantenha pelo menos um administrador ativo.');
    }
    assert(!(String(ator.id_usuario) === String(alvoId) && (novoPerfil !== 'ADMIN' || !novoStatus)), 'Você não pode rebaixar ou desativar sua própria conta.');
    const patch = { perfil: novoPerfil, status: novoStatus ? 1 : 0 };
    if (payload.nome != null) {
      assert(String(payload.nome).trim().length >= 3 && String(payload.nome).trim().length <= 255, 'O nome deve ter entre 3 e 255 caracteres.');
      patch.nome = String(payload.nome).trim();
    }
    if (payload.email != null) {
      const email = normalizeEmail(payload.email);
      assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(!(await uniqueEmail(email, alvoId)), 'Esse e-mail já está sendo usado por outro usuário.', 409);
      if (email !== normalizeEmail(alvo.email)) assert(!(await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === email)), 'Esse e-mail está reservado por um pré-cadastro administrativo.', 409);
      patch.email = email;
    }
    if (payload.senha != null && String(payload.senha) !== '') {
      assert(String(payload.senha).length >= 12, 'A senha administrativa deve ter pelo menos 12 caracteres.');
      patch.senha_hash = await hashPassword(String(payload.senha));
    }
    const updated = await store.update('usuario', alvoId, patch);
    await ensureRoleProfile(updated, payload);
    if (!novoStatus || patch.senha_hash) await revokeUserSessions(alvoId);
    return adminUser(updated);
  }
  async function adminCreateUser(body) {
    assert(body && !blank(body.nome) && !blank(body.email) && !blank(body.senha), 'Informe nome, e-mail e senha inicial.');
    const nome = String(body.nome).trim();
    const email = normalizeEmail(body.email);
    assert(nome.length >= 3 && nome.length <= 255, 'O nome deve ter entre 3 e 255 caracteres.');
    assert(emailPattern.test(email), 'Informe um e-mail válido.');
    assert(String(body.senha).length >= 12, 'A senha inicial deve ter pelo menos 12 caracteres.');
    assert(!(await uniqueEmail(email)), 'Já existe um usuário com esse e-mail.', 409);
    const perfil = body.perfil == null || blank(body.perfil) ? 'USUARIO' : normalizeProfile(body.perfil);
    assert(ROLES.has(perfil), 'Perfil inválido.');
    const user = await store.insert('usuario', { nome, email, senha_hash: await hashPassword(String(body.senha)), perfil, status: body.status == null || body.status ? 1 : 0, criado_em: date() });
    await ensureRoleProfile(user, body);
    return adminUser(user);
  }
  async function adminOverview() {
    const [counts, users, sessions, invites] = await Promise.all([
      dashboardCounts(), store.select('usuario'), listAdminSessions(), store.count('email_perfil_permitido')
    ]);
    return {
      ...counts, usuarios: users.length, usuariosAtivos: users.filter((u) => Boolean(u.status)).length,
      administradores: users.filter((u) => normalizeProfile(u.perfil) === 'ADMIN' && Boolean(u.status)).length,
      sessoesAtivas: sessions.length, convitesPendentes: invites
    };
  }

  async function listTurmas() {
    const turmas = await store.select('turma', () => true, (a, b) => String(a.nome_turma || '').localeCompare(String(b.nome_turma || ''), 'pt-BR'));
    return Promise.all(turmas.map(async (turma) => {
      const professor = turma.id_professor == null ? null : await store.byId('professor', turma.id_professor);
      const professorUser = professor ? await store.byId('usuario', professor.id_professor) : null;
      const alunos = await store.count('aluno', (aluno) => String(aluno.id_turma) === String(turma.id_turma));
      return {
        id: turma.id_turma, nomeTurma: turma.nome_turma, anoLetivo: turma.ano_letivo, turno: turma.turno,
        professorId: professor?.id_professor ?? null, professorNome: professorUser?.nome || 'Sem professor definido', alunos
      };
    }));
  }
  async function saveTurma(id, body) {
    assert(body && !blank(body.nomeTurma), 'Informe o nome da turma.');
    assert(body.anoLetivo != null && Number(body.anoLetivo) >= 2000 && Number(body.anoLetivo) <= 2200, 'Informe um ano letivo válido.');
    assert(!blank(body.turno), 'Informe o turno.');
    if (body.professorId != null) assert(await store.byId('professor', Number(body.professorId)), 'Professor não encontrado.');
    const data = { nome_turma: String(body.nomeTurma).trim(), ano_letivo: Number(body.anoLetivo), turno: String(body.turno).trim(), id_professor: body.professorId == null ? null : Number(body.professorId) };
    let row;
    if (id == null) row = await store.insert('turma', data);
    else {
      assert(await store.byId('turma', id), 'Turma não encontrada.');
      row = await store.update('turma', id, data);
    }
    const professor = row.id_professor == null ? null : await store.byId('usuario', row.id_professor);
    const alunos = await store.count('aluno', (a) => String(a.id_turma) === String(row.id_turma));
    return { id: row.id_turma, nomeTurma: row.nome_turma, anoLetivo: row.ano_letivo, turno: row.turno, professorId: row.id_professor, professorNome: professor?.nome || 'Sem professor definido', alunos };
  }
  async function deleteTurma(id) {
    const turma = await store.byId('turma', id);
    assert(turma, 'Turma não encontrada.', 404);
    assert(!(await store.count('aluno', (a) => String(a.id_turma) === String(id))), 'Não é possível excluir uma turma que possui alunos vinculados.', 409);
    assert(!(await store.count('votacao_conselho', (v) => String(v.id_turma) === String(id))), 'Não é possível excluir uma turma que possui sessões de Conselho de Classe vinculadas.', 409);
    await store.remove('turma', id);
  }
  async function getVdcResponse(vdc, userId) {
    const turma = await store.byId('turma', vdc.id_turma);
    const students = await store.select('aluno', (a) => String(a.id_turma) === String(vdc.id_turma), (a, b) => String(a.matricula || '').localeCompare(String(b.matricula || ''), 'pt-BR', { numeric: true }));
    const votes = await store.select('voto_conselho', (vote) => String(vote.id_votacao) === String(vdc.id_votacao));
    const alunos = await Promise.all(students.map(async (student) => {
      const studentVotes = votes.filter((vote) => String(vote.id_aluno) === String(student.id_aluno));
      const count = (decision) => studentVotes.filter((vote) => vote.decisao === decision).length;
      const aprovar = count('APROVAR'); const recuperacao = count('RECUPERACAO'); const reter = count('RETER'); const abstencao = count('ABSTENCAO');
      const myVote = studentVotes.find((vote) => String(vote.id_usuario) === String(userId))?.decisao || null;
      const max = Math.max(aprovar, recuperacao, reter, abstencao);
      let resultado = 'Sem votos';
      if (max > 0) {
        const leaders = [aprovar, recuperacao, reter, abstencao].filter((n) => n === max).length;
        if (leaders > 1) resultado = 'Empate';
        else resultado = aprovar === max ? 'Aprovar' : recuperacao === max ? 'Recuperação' : reter === max ? 'Reter' : 'Abstenção';
      }
      const studentUser = student.id_usuario == null ? null : await store.byId('usuario', student.id_usuario);
      return { id: student.id_aluno, nome: studentUser?.nome || `Aluno #${student.id_aluno}`, matricula: student.matricula, aprovar, recuperacao, reter, abstencao, meuVoto: myVote, resultado };
    }));
    return { id: vdc.id_votacao, titulo: vdc.titulo, turmaId: vdc.id_turma, turmaNome: turma?.nome_turma || 'Turma removida', anoLetivo: vdc.ano_letivo, status: vdc.status, criadoEm: vdc.criado_em, encerradoEm: vdc.encerrado_em, alunos };
  }
  async function listVdcs(userId) {
    const vdcs = await store.select('votacao_conselho', () => true, (a, b) => sortNewest(a, b, 'criado_em'));
    return Promise.all(vdcs.map((vdc) => getVdcResponse(vdc, userId)));
  }
  async function createVdc(body, userId) {
    assert(body && body.turmaId != null, 'Selecione uma turma.');
    let title = body.titulo == null ? 'Conselho de Classe' : String(body.titulo).trim();
    if (!title) title = 'Conselho de Classe';
    assert(title.length <= 140, 'O título deve ter no máximo 140 caracteres.');
    const user = await store.byId('usuario', userId);
    assert(user && Boolean(user.status), 'Usuário inativo.', 401);
    const turma = await store.byId('turma', body.turmaId);
    assert(turma, 'Turma não encontrada.');
    assert(!(await store.count('votacao_conselho', (v) => String(v.id_turma) === String(turma.id_turma) && v.status === 'ABERTA')), 'Já existe uma votação aberta para essa turma.', 409);
    const vdc = await store.insert('votacao_conselho', { titulo: title, id_turma: turma.id_turma, ano_letivo: body.anoLetivo == null ? turma.ano_letivo : Number(body.anoLetivo), status: 'ABERTA', criado_em: date(), encerrado_em: null });
    return getVdcResponse(vdc, userId);
  }
  function normalizeDecision(value) {
    const text = normalizeProfile(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (text === 'APROVAR' || text === 'APROVADO') return 'APROVAR';
    if (text === 'RECUPERACAO') return 'RECUPERACAO';
    if (text === 'RETER' || text === 'RETIDO') return 'RETER';
    if (text === 'ABSTENCAO') return 'ABSTENCAO';
    throw statusError(400, 'Decisão de voto inválida.');
  }
  async function castVote(vdcId, body, userId) {
    const vdc = await store.byId('votacao_conselho', vdcId);
    assert(vdc, 'Votação não encontrada.');
    assert(vdc.status === 'ABERTA', 'Essa votação já foi encerrada.', 409);
    assert(body && body.alunoId != null, 'Selecione um aluno.');
    const decision = normalizeDecision(body.decisao);
    const student = await store.byId('aluno', body.alunoId);
    assert(student, 'Aluno não encontrado.');
    assert(String(student.id_turma) === String(vdc.id_turma), 'O aluno não pertence à turma desta votação.');
    const user = await store.byId('usuario', userId);
    assert(user && Boolean(user.status), 'Usuário não autenticado.');
    const existing = await store.first('voto_conselho', (vote) => String(vote.id_votacao) === String(vdcId) && String(vote.id_aluno) === String(student.id_aluno) && String(vote.id_usuario) === String(userId));
    const data = { id_votacao: Number(vdcId), id_aluno: student.id_aluno, id_usuario: userId, decisao: decision, comentario: blank(body.comentario) ? null : String(body.comentario).trim().slice(0, 500), votado_em: date() };
    if (existing) await store.update('voto_conselho', existing.id_voto, data); else await store.insert('voto_conselho', data);
    return getVdcResponse(vdc, userId);
  }
  async function closeVdc(vdcId, userId) {
    const vdc = await store.byId('votacao_conselho', vdcId);
    assert(vdc, 'Votação não encontrada.');
    const updated = await store.update('votacao_conselho', vdcId, { status: 'ENCERRADA', encerrado_em: date() });
    return getVdcResponse(updated, userId);
  }
  async function toSaaResponse(row) {
    const aluno = row.id_aluno == null ? null : await store.byId('aluno', row.id_aluno);
    const professor = row.id_professor == null ? null : await store.byId('professor', row.id_professor);
    const alunoUser = aluno?.id_usuario == null ? null : await store.byId('usuario', aluno.id_usuario);
    const professorUser = professor ? await store.byId('usuario', professor.id_professor) : null;
    return {
      id: row.id_avaliacao, alunoId: row.id_aluno, alunoNome: alunoUser?.nome || `Aluno #${aluno?.id_aluno ?? '-'}`,
      professorId: row.id_professor, professorNome: professorUser?.nome || 'Professor', nota: row.nota,
      comentario: row.comentario, dataAvaliacao: row.data_avaliacao, atualizadoEm: row.atualizado_em || row.data_avaliacao,
      titulo: row.titulo || 'Avaliação pedagógica', tipoAvaliacao: row.tipo_avaliacao || 'GERAL', unidade: row.unidade,
      competencias: row.competencias, pontosFortes: row.pontos_fortes || null, dificuldades: row.dificuldades || null,
      intervencaoRecomendada: row.intervencao_recomendada, planoAcao: row.plano_acao || null,
      dataReavaliacao: row.data_reavaliacao || null, statusAcompanhamento: row.status_acompanhamento || 'EM_ACOMPANHAMENTO'
    };
  }
  async function allowedSaaStudentIds(actor) {
    const profile = normalizeProfile(actor.perfil);
    if (profile === 'ALUNO') {
      const student = await store.first('aluno', (row) => String(row.id_usuario) === String(actor.id_usuario));
      return student ? [String(student.id_aluno)] : [];
    }
    if (profile === 'RESPONSAVEL') {
      const students = await store.select('aluno', (row) => String(row.id_responsavel) === String(actor.id_usuario));
      return students.map((row) => String(row.id_aluno));
    }
    return null;
  }
  function assertSaaManager(actor) {
    assert(['ADMIN', 'COORDENACAO', 'PROFESSOR'].includes(normalizeProfile(actor.perfil)), 'Somente administração, coordenação e professores podem registrar ou alterar avaliações.', 403);
  }
  async function listSaa(alunoId = null, actor = null, filters = {}) {
    assert(actor, 'Sessão inválida.', 401);
    const profile = normalizeProfile(actor.perfil);
    assert(['ADMIN', 'COORDENACAO', 'PROFESSOR', 'TECNICO', 'ALUNO', 'RESPONSAVEL'].includes(profile), 'Seu perfil não possui acesso ao SAA.', 403);
    const allowedIds = await allowedSaaStudentIds(actor);
    if (alunoId != null && allowedIds && !allowedIds.includes(String(alunoId))) throw statusError(403, 'Você não pode consultar avaliações de outro aluno.');
    const professorOnly = profile === 'PROFESSOR' ? String(actor.id_usuario) : null;
    const rows = await store.select('avaliacao', (row) => {
      if (alunoId != null && String(row.id_aluno) !== String(alunoId)) return false;
      if (allowedIds && !allowedIds.includes(String(row.id_aluno))) return false;
      if (professorOnly && String(row.id_professor) !== professorOnly) return false;
      if (filters.tipoAvaliacao && String(row.tipo_avaliacao || 'GERAL') !== filters.tipoAvaliacao) return false;
      if (filters.unidade && String(row.unidade) !== String(filters.unidade)) return false;
      if (filters.statusAcompanhamento && String(row.status_acompanhamento || 'EM_ACOMPANHAMENTO') !== filters.statusAcompanhamento) return false;
      if (filters.ano && new Date(row.data_avaliacao || 0).getFullYear() !== Number(filters.ano)) return false;
      return true;
    }, (a, b) => sortNewest(a, b, 'data_avaliacao'));
    return Promise.all(rows.map(toSaaResponse));
  }
  async function saaSummary(actor, filters = {}) {
    const items = await listSaa(filters.alunoId == null ? null : Number(filters.alunoId), actor, filters);
    const average = items.length ? items.reduce((sum, item) => sum + Number(item.nota || 0), 0) / items.length : 0;
    const byUnit = [1, 2, 3, 4].map((unidade) => {
      const group = items.filter((item) => Number(item.unidade) === unidade);
      return { unidade, quantidade: group.length, media: group.length ? Number((group.reduce((sum, item) => sum + Number(item.nota || 0), 0) / group.length).toFixed(2)) : null };
    });
    return {
      total: items.length, mediaGeral: Number(average.toFixed(2)),
      emAcompanhamento: items.filter((item) => item.statusAcompanhamento === 'EM_ACOMPANHAMENTO').length,
      necessitaIntervencao: items.filter((item) => item.statusAcompanhamento === 'NECESSITA_INTERVENCAO').length,
      concluidas: items.filter((item) => item.statusAcompanhamento === 'CONCLUIDO').length,
      reavaliacoesPendentes: items.filter((item) => item.dataReavaliacao && new Date(item.dataReavaliacao) <= new Date() && item.statusAcompanhamento !== 'CONCLUIDO').length,
      porUnidade: byUnit
    };
  }
  async function validateSaa(body, actor) {
    assertSaaManager(actor);
    assert(body && body.alunoId != null, 'Selecione um aluno.');
    assert(body.professorId != null, 'Selecione um professor.');
    assert(body.nota != null && Number.isFinite(Number(body.nota)) && Number(body.nota) >= 0 && Number(body.nota) <= 10, 'A nota deve estar entre 0 e 10.');
    assert(body.unidade == null || (Number.isInteger(Number(body.unidade)) && Number(body.unidade) >= 1 && Number(body.unidade) <= 4), 'A unidade deve ser 1, 2, 3 ou 4.');
    const title = (blank(body.titulo) ? 'Avaliação pedagógica' : String(body.titulo)).trim();
    assert(title.length <= 120, 'O título deve ter até 120 caracteres.');
    const type = (blank(body.tipoAvaliacao) ? 'GERAL' : normalizeProfile(body.tipoAvaliacao));
    assert(SAA_TYPES.has(type), 'Tipo inválido. Use GERAL, DIAGNOSTICA, FORMATIVA ou SOMATIVA.');
    const status = blank(body.statusAcompanhamento) ? 'EM_ACOMPANHAMENTO' : normalizeProfile(body.statusAcompanhamento);
    assert(SAA_STATUSES.has(status), 'Status de acompanhamento inválido.');
    for (const [key, label] of [['comentario', 'O comentário'], ['competencias', 'As competências'], ['pontosFortes', 'Os pontos fortes'], ['dificuldades', 'As dificuldades'], ['intervencaoRecomendada', 'A intervenção recomendada'], ['planoAcao', 'O plano de ação']]) {
      assert(body[key] == null || String(body[key]).length <= 2000, `${label} devem ter até 2.000 caracteres.`);
    }
    if (body.dataReavaliacao != null && body.dataReavaliacao !== '') {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(String(body.dataReavaliacao)) && !Number.isNaN(Date.parse(`${body.dataReavaliacao}T00:00:00Z`)), 'Informe uma data de reavaliação válida (AAAA-MM-DD).');
    }
    assert(await store.byId('aluno', body.alunoId), 'Aluno não encontrado.');
    assert(await store.byId('professor', body.professorId), 'Professor não encontrado.');
    if (normalizeProfile(actor.perfil) === 'PROFESSOR') assert(String(body.professorId) === String(actor.id_usuario), 'O professor só pode lançar avaliações em seu próprio nome.', 403);
    return {
      id_aluno: Number(body.alunoId), id_professor: Number(body.professorId), nota: Number(body.nota),
      comentario: blank(body.comentario) ? null : String(body.comentario).trim(), data_avaliacao: date(), atualizado_em: date(), titulo: title,
      tipo_avaliacao: type, unidade: body.unidade == null || body.unidade === '' ? null : Number(body.unidade),
      competencias: blank(body.competencias) ? null : String(body.competencias).trim(),
      pontos_fortes: blank(body.pontosFortes) ? null : String(body.pontosFortes).trim(),
      dificuldades: blank(body.dificuldades) ? null : String(body.dificuldades).trim(),
      intervencao_recomendada: blank(body.intervencaoRecomendada) ? null : String(body.intervencaoRecomendada).trim(),
      plano_acao: blank(body.planoAcao) ? null : String(body.planoAcao).trim(),
      data_reavaliacao: blank(body.dataReavaliacao) ? null : String(body.dataReavaliacao), status_acompanhamento: status
    };
  }
  async function createSaa(body, actor) { const data = await validateSaa(body, actor); const row = await store.insert('avaliacao', data); return toSaaResponse(row); }
  async function updateSaa(id, body, actor) {
    const existing = await store.byId('avaliacao', id);
    assert(existing, 'Avaliação não encontrada.', 404);
    assertSaaManager(actor);
    if (normalizeProfile(actor.perfil) === 'PROFESSOR') assert(String(existing.id_professor) === String(actor.id_usuario), 'O professor só pode alterar suas próprias avaliações.', 403);
    const data = await validateSaa(body, actor);
    data.data_avaliacao = existing.data_avaliacao || date();
    return toSaaResponse(await store.update('avaliacao', id, data));
  }
  async function toRequirement(row) {
    const aluno = await store.byId('aluno', row.id_aluno);
    const user = aluno?.id_usuario == null ? null : await store.byId('usuario', aluno.id_usuario);
    const turma = aluno?.id_turma == null ? null : await store.byId('turma', aluno.id_turma);
    const vdc = row.id_votacao_conselho == null ? null : await store.byId('votacao_conselho', row.id_votacao_conselho);
    return {
      id: row.id_requerimento, alunoId: row.id_aluno, alunoNome: user?.nome || `Aluno #${row.id_aluno}`,
      matricula: aluno?.matricula || null, turmaNome: turma?.nome_turma || 'Sem turma', tipo: row.tipo,
      descricao: row.descricao, status: row.status, criadoEm: row.criado_em,
      vdcId: vdc?.id_votacao ?? null, vdcTitulo: vdc?.titulo ?? null
    };
  }
  async function listRequirements() {
    const rows = await store.select('requerimento', () => true, (a, b) => sortNewest(a, b, 'criado_em'));
    return Promise.all(rows.map(toRequirement));
  }
  async function createRequirement(body) {
    assert(body && body.alunoId != null, 'Selecione um aluno.');
    const type = body.tipo == null ? 'Outro' : String(body.tipo).trim();
    const description = body.descricao == null ? '' : String(body.descricao).trim();
    assert(type, 'Informe o tipo do requerimento.'); assert(description, 'Descreva a solicitação.');
    assert(type.length <= 80, 'O tipo deve ter no máximo 80 caracteres.');
    const student = await store.byId('aluno', body.alunoId); assert(student, 'Aluno não encontrado.');
    let vdcId = null; let status = 'ABERTO';
    if (body.vdcId != null) {
      const vdc = await store.byId('votacao_conselho', body.vdcId); assert(vdc, 'Conselho de Classe não encontrado.');
      assert(vdc.status === 'ABERTA', 'Apenas uma sessão aberta do Conselho de Classe pode receber requerimentos.');
      assert(student.id_turma != null && String(student.id_turma) === String(vdc.id_turma), 'O aluno e o Conselho de Classe precisam pertencer à mesma turma.');
      vdcId = vdc.id_votacao; status = 'ENCAMINHADO_VDC';
    }
    const row = await store.insert('requerimento', { id_aluno: student.id_aluno, tipo: type, descricao: description, status, criado_em: date(), id_votacao_conselho: vdcId });
    return toRequirement(row);
  }
  async function forwardRequirement(id, vdcId) {
    const item = await store.byId('requerimento', id); assert(item, 'Requerimento não encontrado.');
    const vdc = await store.byId('votacao_conselho', vdcId); assert(vdc, 'Conselho de Classe não encontrado.');
    const student = await store.byId('aluno', item.id_aluno);
    assert(vdc.status === 'ABERTA', 'Apenas uma sessão aberta do Conselho de Classe pode receber requerimentos.');
    assert(student?.id_turma != null && String(student.id_turma) === String(vdc.id_turma), 'O aluno e o Conselho de Classe precisam pertencer à mesma turma.');
    return toRequirement(await store.update('requerimento', id, { id_votacao_conselho: Number(vdcId), status: 'ENCAMINHADO_VDC' }));
  }
  async function changeRequirementStatus(id, value) {
    const item = await store.byId('requerimento', id); assert(item, 'Requerimento não encontrado.');
    const status = normalizeProfile(value);
    assert(REQ_STATUSES.has(status), 'Status de requerimento inválido.');
    assert(status !== 'ENCAMINHADO_VDC' || item.id_votacao_conselho != null, 'Associe um Conselho de Classe antes de usar este status.');
    return toRequirement(await store.update('requerimento', id, { status }));
  }
  function canMessage(a, b) {
    const roleA = normalizeProfile(a.perfil); const roleB = normalizeProfile(b.perfil);
    return (MANAGEMENT_ROLES.has(roleA) && roleB === 'PROFESSOR') || (roleA === 'PROFESSOR' && MANAGEMENT_ROLES.has(roleB));
  }
  function requireMessagesRole(user) {
    assert(user && Boolean(user.status) && MESSAGE_ROLES.has(normalizeProfile(user.perfil)), 'O módulo de mensagens é exclusivo para ADM, coordenação e professores.', 403);
  }
  async function validateContact(actor, contactId) {
    requireMessagesRole(actor);
    const contact = await store.byId('usuario', contactId);
    assert(contact && Boolean(contact.status), 'Destinatário inexistente ou inativo.');
    assert(String(actor.id_usuario) !== String(contact.id_usuario) && canMessage(actor, contact), 'Mensagens permitidas somente entre ADM/coordenação e professores.', 403);
    return contact;
  }
  async function heartbeat(user) {
    requireMessagesRole(user);
    const existing = await store.byId('presenca_usuario', user.id_usuario);
    const data = { usuario_id: user.id_usuario, ultimo_acesso: date() };
    if (existing) await store.update('presenca_usuario', user.id_usuario, data); else await store.insert('presenca_usuario', data);
  }
  async function messageContacts(user) {
    requireMessagesRole(user);
    const users = await store.select('usuario', (other) => Boolean(other.status) && String(other.id_usuario) !== String(user.id_usuario) && canMessage(user, other), (a, b) => byName(a, b));
    const cutoff = Date.now() - 90 * 1000;
    const contacts = await Promise.all(users.map(async (other) => {
      const presence = await store.byId('presenca_usuario', other.id_usuario);
      const unread = await store.count('mensagem_interna', (m) => String(m.remetente_id) === String(other.id_usuario) && String(m.destinatario_id) === String(user.id_usuario) && m.lida_em == null);
      return { id: other.id_usuario, nome: other.nome, email: other.email, perfil: normalizeProfile(other.perfil), online: Boolean(presence && timestamp(presence.ultimo_acesso) >= cutoff), ultimoAcesso: presence?.ultimo_acesso ?? null, naoLidas: unread };
    }));
    return contacts.sort((a, b) => Number(b.online) - Number(a.online) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' }));
  }
  async function getConversation(user, contactId) {
    const contact = await validateContact(user, contactId);
    const messages = await store.select('mensagem_interna', (m) => ((String(m.remetente_id) === String(user.id_usuario) && String(m.destinatario_id) === String(contact.id_usuario)) || (String(m.remetente_id) === String(contact.id_usuario) && String(m.destinatario_id) === String(user.id_usuario))), (a, b) => timestamp(a.enviada_em) - timestamp(b.enviada_em));
    const readAt = date();
    for (const message of messages) {
      if (String(message.remetente_id) === String(contact.id_usuario) && String(message.destinatario_id) === String(user.id_usuario) && message.lida_em == null) {
        await store.update('mensagem_interna', message.id_mensagem, { lida_em: readAt });
        message.lida_em = readAt;
      }
    }
    return Promise.all(messages.map(async (message) => {
      const sender = await store.byId('usuario', message.remetente_id);
      const recipient = await store.byId('usuario', message.destinatario_id);
      return { id: message.id_mensagem, remetenteId: message.remetente_id, remetenteNome: sender?.nome || '', destinatarioId: message.destinatario_id, destinatarioNome: recipient?.nome || '', conteudo: message.conteudo, enviadaEm: message.enviada_em, lidaEm: message.lida_em, minha: String(message.remetente_id) === String(user.id_usuario) };
    }));
  }
  async function sendMessage(user, body) {
    requireMessagesRole(user);
    assert(body && body.destinatarioId != null, 'Selecione um destinatário.');
    assert(!blank(body.conteudo), 'Escreva uma mensagem antes de enviar.');
    const content = String(body.conteudo).trim(); assert(content.length <= 5000, 'A mensagem deve ter no máximo 5.000 caracteres.');
    const recipient = await validateContact(user, body.destinatarioId);
    const row = await store.insert('mensagem_interna', { remetente_id: user.id_usuario, destinatario_id: recipient.id_usuario, conteudo: content, enviada_em: date(), lida_em: null });
    return { id: row.id_mensagem, remetenteId: user.id_usuario, remetenteNome: user.nome, destinatarioId: recipient.id_usuario, destinatarioNome: recipient.nome, conteudo: row.conteudo, enviadaEm: row.enviada_em, lidaEm: null, minha: true };
  }

  async function handler(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const method = req.method.toUpperCase();
    if (method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400' });
      return res.end();
    }
    if (pathname.startsWith('/api/mobile/')) res.setHeader('Access-Control-Allow-Origin', '*');
    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !pathname.startsWith('/css/') && !pathname.startsWith('/js/')) body = await readBody(req);

    // Arquivos estáticos da interface original. Nenhum CSS/JS visual é reescrito.
    if (method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/'))) {
      const relative = pathname.replace(/^\/(css|js)\//, '$1/');
      const file = path.resolve(STATIC_DIR, relative);
      assert(file.startsWith(STATIC_DIR + path.sep), 'Arquivo não encontrado.', 404);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return text(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const type = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
      return text(res, 200, fs.readFileSync(file, 'utf8'), type);
    }

    // Autenticação web (cookie de sessão, 30 minutos, renovação do identificador no login).
    if (method === 'POST' && pathname === '/auth/login') {
      assert(!blank(body.email) && !blank(body.senha), 'Preencha e-mail e senha.');
      const user = await store.first('usuario', (row) => normalizeEmail(row.email) === normalizeEmail(body.email));
      if (!user || !Boolean(user.status) || !(await verifyPassword(body.senha, user.senha_hash))) throw statusError(401, 'E-mail ou senha inválidos.');
      await startWebSession(req, res, user); return json(res, 200, { mensagem: 'Login realizado com sucesso.', redirect: '/dashboard' });
    }
    if (method === 'POST' && pathname === '/auth/cadastro') {
      assert(!blank(body.nome) && !blank(body.email) && !blank(body.senha) && !blank(body.confirmarSenha), 'Preencha todos os campos.');
      assert(String(body.nome).trim().length >= 3, 'Informe um nome válido.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(String(body.senha).length >= 6, 'A senha deve ter pelo menos 6 caracteres.');
      assert(body.senha === body.confirmarSenha, 'As senhas não coincidem.');
      assert(!(await uniqueEmail(email)), 'Já existe um usuário com esse e-mail.', 409);
      const user = await store.insert('usuario', { nome: String(body.nome).trim(), email, senha_hash: await hashPassword(body.senha), perfil: await resolveRegistrationProfile(email), status: 1, criado_em: date() });
      await consumePreRegistration(email); await startWebSession(req, res, user);
      return json(res, 200, { mensagem: 'Cadastro realizado com sucesso.', redirect: '/dashboard' });
    }
    if (method === 'POST' && pathname === '/auth/recuperacao') {
      assert(!blank(body.email), 'Informe o e-mail.');
      const email = normalizeEmail(body.email);
      const user = await store.first('usuario', (row) => normalizeEmail(row.email) === email);
      if (!user) return json(res, 200, { mensagem: 'Se o e-mail estiver cadastrado, um link de recuperação será disponibilizado.' });
      const token = crypto.randomUUID();
      await store.insert('recuperacao_senha', { id_usuario: user.id_usuario, token, expira_em: new Date(Date.now() + 30 * 60 * 1000), usado_em: null });
      return json(res, 200, { mensagem: 'Link de recuperação gerado para teste.', link: `/recuperacao/nova?token=${token}` });
    }
    if (method === 'POST' && pathname === '/auth/recuperacao/nova') {
      const token = requestUrl.searchParams.get('token');
      assert(!blank(token), 'Token de recuperação ausente.');
      assert(!blank(body.senha) && !blank(body.confirmarSenha) && String(body.senha).length >= 6, 'A senha deve ter pelo menos 6 caracteres.');
      assert(body.senha === body.confirmarSenha, 'As senhas não coincidem.');
      const recovery = await store.first('recuperacao_senha', (row) => row.token === token);
      assert(recovery && recovery.usado_em == null && recovery.expira_em && timestamp(recovery.expira_em) >= Date.now(), 'Link de recuperação inválido ou expirado.');
      const user = await store.byId('usuario', recovery.id_usuario); assert(user, 'Usuário não encontrado.');
      await store.update('usuario', user.id_usuario, { senha_hash: await hashPassword(body.senha) });
      await store.update('recuperacao_senha', recovery.id_recuperacao, { usado_em: date() });
      return json(res, 200, { mensagem: 'Senha alterada com sucesso.', redirect: '/login' });
    }
    if (method === 'POST' && pathname === '/auth/google') {
      assert(!blank(body.credential), 'Credencial do Google não informada.');
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`);
        if (!response.ok) throw new Error('Google token inválido');
        const tokenInfo = await response.json();
        const email = normalizeEmail(tokenInfo.email); const name = tokenInfo.name || 'Usuário Google';
        if (!email || String(tokenInfo.email_verified).toLowerCase() !== 'true') throw new Error('Conta não verificada');
        let user = await store.first('usuario', (row) => normalizeEmail(row.email) === email);
        if (!user) {
          user = await store.insert('usuario', { nome: name, email, senha_hash: await hashPassword(crypto.randomUUID()), perfil: await resolveRegistrationProfile(email), status: 1, criado_em: date() });
          await consumePreRegistration(email);
        } else {
          if (!Boolean(user.status)) throw new Error('Usuário desativado.');
          if (name && name !== user.nome) user = await store.update('usuario', user.id_usuario, { nome: name });
        }
        await startWebSession(req, res, user); return json(res, 200, { mensagem: 'Login com Google realizado com sucesso.', redirect: '/dashboard' });
      } catch (error) { throw statusError(401, 'Não foi possível validar a conta Google. Configure o Client ID e tente novamente.'); }
    }
    if (method === 'POST' && pathname === '/auth/logout') {
      const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (sid) { const session = await store.byId('sessao_usuario', sha256(sid)); if (session) await revokeSessionRecord(session); }
      clearCookie(res, SESSION_COOKIE, cookieSecure); return json(res, 200, { redirect: '/login' });
    }

    // Sessões mobile. JWT HS256 e revogação persistida em mobile_token_revogado.
    if (method === 'POST' && pathname === '/api/mobile/auth/login') {
      assert(!blank(body.email) && !blank(body.senha), 'Preencha e-mail e senha.');
      const user = await store.first('usuario', (row) => normalizeEmail(row.email) === normalizeEmail(body.email));
      if (!user || !Boolean(user.status) || !(await verifyPassword(body.senha, user.senha_hash))) throw statusError(401, 'E-mail ou senha inválidos.');
      const tokens = await issueMobileSession(req, user);
      return json(res, 200, { mensagem: 'Login realizado com sucesso.', ...tokens, usuario: publicUser(user) });
    }
    if (method === 'POST' && pathname === '/api/mobile/auth/cadastro') {
      assert(!blank(body.nome) && !blank(body.email) && !blank(body.senha) && !blank(body.confirmarSenha), 'Preencha todos os campos.');
      assert(String(body.nome).trim().length >= 3, 'Informe um nome válido.');
      assert(String(body.senha).length >= 6, 'A senha deve ter pelo menos 6 caracteres.');
      assert(body.senha === body.confirmarSenha, 'As senhas não coincidem.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(!(await uniqueEmail(email)), 'Já existe um usuário com esse e-mail.', 409);
      const user = await store.insert('usuario', { nome: String(body.nome).trim(), email, senha_hash: await hashPassword(body.senha), perfil: await resolveRegistrationProfile(email), status: 1, criado_em: date() });
      await consumePreRegistration(email);
      const tokens = await issueMobileSession(req, user);
      return json(res, 201, { mensagem: 'Cadastro realizado com sucesso.', ...tokens, usuario: publicUser(user) });
    }
    if (method === 'POST' && pathname === '/api/mobile/auth/refresh') {
      const data = await refreshMobileSession(req, body.refreshToken);
      return json(res, 200, { mensagem: 'Sessão renovada com sucesso.', ...data });
    }
    if (method === 'POST' && pathname === '/api/mobile/auth/logout') {
      const authorization = String(req.headers.authorization || '');
      let session = null;
      if (authorization.startsWith('Bearer ')) {
        try {
          const claims = verifyToken(authorization.slice(7).trim(), jwtSecret);
          session = await store.first('sessao_usuario', (row) => row.tipo === 'MOBILE' && row.access_jti === claims.jti);
          if (!session) {
            const exists = await store.byId('mobile_token_revogado', claims.jti);
            if (!exists) await store.insert('mobile_token_revogado', { jti: claims.jti, expira_em_epoch: claims.exp });
          }
        } catch { /* O refresh token ainda pode encerrar a sessão depois da expiração do JWT. */ }
      }
      if (!session && !blank(body.refreshToken)) session = await store.first('sessao_usuario', (row) => row.tipo === 'MOBILE' && row.refresh_hash === sha256(body.refreshToken));
      if (session) await revokeSessionRecord(session);
      const expired = await store.select('mobile_token_revogado', (row) => Number(row.expira_em_epoch) <= Math.floor(Date.now() / 1000));
      for (const row of expired) await store.remove('mobile_token_revogado', row.jti);
      return json(res, 200, { mensagem: 'Sessão mobile encerrada.' });
    }

    // Páginas web. O conteúdo original é servido sem alterações visuais; somente variáveis de template são injetadas.
    if (method === 'GET' && ['/', '/login', '/cadastro', '/recuperacao', '/recuperacao/nova', '/dashboard', '/mensagens', '/perfil', '/admin', '/vdc', '/saa', '/requerimentos'].includes(pathname) || (method === 'GET' && pathname === '/turmas' && String(req.headers.accept || '').includes('text/html'))) {
      const user = await getWebUser(req);
      if (['/', '/login', '/cadastro', '/recuperacao'].includes(pathname) && user) return redirect(res, '/dashboard');
      if (['/', '/login', '/cadastro', '/recuperacao'].includes(pathname)) {
        const page = pathname === '/cadastro' ? 'cadastro.html' : pathname === '/recuperacao' ? 'recuperacao.html' : 'login.html';
        return text(res, 200, resolveTemplate(page, { googleClientId: env.GOOGLE_CLIENT_ID || '' }));
      }
      if (pathname === '/recuperacao/nova') return text(res, 200, resolveTemplate('nova-senha.html'));
      if (!user) return redirect(res, '/login');
      const profile = normalizeProfile(user.perfil);
      if (pathname === '/admin' && profile !== 'ADMIN') return redirect(res, '/dashboard');
      if (pathname === '/mensagens' && !MESSAGE_ROLES.has(profile)) return redirect(res, '/dashboard');
      const pageMap = { '/dashboard': 'dashboard.html', '/mensagens': 'mensagens.html', '/perfil': 'perfil.html', '/admin': 'admin.html', '/turmas': 'turmas.html', '/vdc': 'vdc.html', '/saa': 'saa.html', '/requerimentos': 'requerimentos.html' };
      const model = { nome: user.nome || 'Usuário', email: user.email || '', perfil: profile, usuarioId: user.id_usuario, initial: String(user.nome || 'U').trim().charAt(0).toUpperCase() || 'U' };
      if (pathname === '/dashboard') Object.assign(model, await dashboardCounts());
      return text(res, 200, resolveTemplate(pageMap[pathname], model));
    }

    // Perfil web e mobile (a estrutura JSON é compatível com MobileUserResponse).
    if (method === 'GET' && pathname === '/api/perfil') return json(res, 200, publicUser(await requireWeb(req)));
    if (method === 'PUT' && pathname === '/api/perfil') {
      const user = await requireWeb(req);
      assert(!blank(body.nome) && !blank(body.email), 'Nome e e-mail são obrigatórios.');
      assert(String(body.nome).trim().length >= 3, 'Informe um nome válido.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(!(await uniqueEmail(email, user.id_usuario)), 'Esse e-mail já está sendo usado por outro usuário.', 409);
      if (email !== normalizeEmail(user.email)) assert(!(await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === email)), 'Esse e-mail está reservado por um pré-cadastro administrativo.', 409);
      const updated = await store.update('usuario', user.id_usuario, { nome: String(body.nome).trim(), email });
      return json(res, 200, { mensagem: 'Perfil atualizado com sucesso.', usuario: publicUser(updated) });
    }
    if (method === 'GET' && pathname === '/api/mobile/profile') return json(res, 200, publicUser(await requireMobile(req)));
    if (method === 'PUT' && pathname === '/api/mobile/profile') {
      const user = await requireMobile(req);
      assert(!blank(body.nome) && !blank(body.email), 'Nome e e-mail são obrigatórios.');
      assert(String(body.nome).trim().length >= 3, 'Informe um nome válido.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(!(await uniqueEmail(email, user.id_usuario)), 'Esse e-mail já está sendo usado por outro usuário.', 409);
      if (email !== normalizeEmail(user.email)) assert(!(await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === email)), 'Esse e-mail está reservado por um pré-cadastro administrativo.', 409);
      const updated = await store.update('usuario', user.id_usuario, { nome: String(body.nome).trim(), email });
      const sessionInfo = await getMobileSession(req);
      const tokens = sessionInfo?.session ? await rotateMobileSession(req, sessionInfo.session, updated) : await issueMobileSession(req, updated);
      return json(res, 200, { mensagem: 'Perfil atualizado com sucesso.', ...tokens, usuario: publicUser(updated) });
    }

    // Gerenciamento de sessão web/mobile: listagem, revogação individual e renovação de tokens.
    if (method === 'GET' && pathname === '/api/sessoes') {
      const actor = await requireWeb(req);
      return json(res, 200, await listUserSessions(actor, await sessionIdFromRequest(req, 'WEB')));
    }
    if (method === 'DELETE' && /^\/api\/sessoes\/[a-f0-9-]{36,64}$/i.test(pathname)) {
      const actor = await requireWeb(req); const id = pathname.split('/').pop();
      return json(res, 200, await revokeOwnedSession(actor, id, await sessionIdFromRequest(req, 'WEB')));
    }
    if (method === 'GET' && pathname === '/api/mobile/sessoes') {
      const actor = await requireMobile(req);
      return json(res, 200, await listUserSessions(actor, await sessionIdFromRequest(req, 'MOBILE')));
    }
    if (method === 'DELETE' && /^\/api\/mobile\/sessoes\/[a-f0-9-]{36}$/i.test(pathname)) {
      const actor = await requireMobile(req); const id = pathname.split('/').pop();
      return json(res, 200, await revokeOwnedSession(actor, id, await sessionIdFromRequest(req, 'MOBILE')));
    }

    // Administração web/mobile.
    // Administração central: visão geral, criação de contas e controle global de sessões.
    if (method === 'GET' && ['/api/admin/overview', '/api/mobile/admin/overview'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobileAdmin(req); else await requireAdmin(req);
      return json(res, 200, await adminOverview());
    }
    if (method === 'GET' && ['/api/admin/sessoes', '/api/mobile/admin/sessoes'].includes(pathname)) {
      const mobile = pathname.startsWith('/api/mobile/');
      if (mobile) await requireMobileAdmin(req); else await requireAdmin(req);
      return json(res, 200, await listAdminSessions(await sessionIdFromRequest(req, mobile ? 'MOBILE' : 'WEB')));
    }
    const adminSessionMatch = pathname.match(/^\/api\/(mobile\/)?admin\/sessoes\/([a-f0-9-]{36,64})$/i);
    if (method === 'DELETE' && adminSessionMatch) {
      if (adminSessionMatch[1]) await requireMobileAdmin(req); else await requireAdmin(req);
      return json(res, 200, await revokeAdminSession(adminSessionMatch[2]));
    }
    if (method === 'POST' && ['/api/admin/usuarios', '/api/mobile/admin/usuarios'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobileAdmin(req); else await requireAdmin(req);
      return json(res, 201, await adminCreateUser(body));
    }

    if (method === 'GET' && ['/api/admin/usuarios', '/api/mobile/admin/usuarios'].includes(pathname)) {
      const ator = pathname.startsWith('/api/mobile/') ? await requireMobileAdmin(req) : await requireWeb(req);
      if (normalizeProfile(ator.perfil) !== 'ADMIN') throw statusError(403, 'Acesso restrito ao perfil administrador.');
      const users = await store.select('usuario', () => true, (a, b) => byName(a, b));
      return json(res, 200, users.map(adminUser));
    }
    const adminUserMatch = pathname.match(/^\/api\/(?:mobile\/)?admin\/usuarios\/(\d+)$/);
    if (['PATCH', 'PUT'].includes(method) && adminUserMatch) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobileAdmin(req) : await requireWeb(req);
      if (normalizeProfile(actor.perfil) !== 'ADMIN') throw statusError(403, 'Acesso restrito ao perfil administrador.');
      return json(res, 200, await adminUpdate(actor, Number(adminUserMatch[1]), body));
    }
    if (method === 'GET' && ['/api/admin/emails-perfil', '/api/mobile/admin/emails-perfil'].includes(pathname)) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobileAdmin(req) : await requireWeb(req);
      if (normalizeProfile(actor.perfil) !== 'ADMIN') throw statusError(403, 'Acesso restrito ao perfil administrador.');
      const items = await store.select('email_perfil_permitido', () => true, (a, b) => String(a.email).localeCompare(String(b.email), 'pt-BR'));
      return json(res, 200, items.map((x) => ({ id: x.id, email: x.email, perfil: x.perfil, criadoEm: x.criado_em })));
    }
    if (method === 'POST' && ['/api/admin/emails-perfil', '/api/mobile/admin/emails-perfil'].includes(pathname)) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobileAdmin(req) : await requireWeb(req);
      if (normalizeProfile(actor.perfil) !== 'ADMIN') throw statusError(403, 'Acesso restrito ao perfil administrador.');
      assert(!blank(body.email) && !blank(body.perfil), 'Informe o e-mail e o perfil.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      const profile = normalizeProfile(body.perfil); assert(PRE_REGISTER_ROLES.has(profile), 'O pré-cadastro aceita COORDENACAO, ALUNO, PROFESSOR, TECNICO, RESPONSAVEL ou USUARIO. Contas ADMIN são configuradas separadamente.');
      assert(!(await uniqueEmail(email)), 'Esse e-mail já tem uma conta. Altere o perfil na seção Usuários.');
      const existing = await store.first('email_perfil_permitido', (row) => normalizeEmail(row.email) === email);
      const row = existing ? await store.update('email_perfil_permitido', existing.id, { email, perfil: profile }) : await store.insert('email_perfil_permitido', { email, perfil: profile, criado_em: date() });
      return json(res, 201, { id: row.id, email: row.email, perfil: row.perfil, criadoEm: row.criado_em });
    }
    const inviteMatch = pathname.match(/^\/api\/(?:mobile\/)?admin\/emails-perfil\/(\d+)$/);
    if (method === 'DELETE' && inviteMatch) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobileAdmin(req) : await requireWeb(req);
      if (normalizeProfile(actor.perfil) !== 'ADMIN') throw statusError(403, 'Acesso restrito ao perfil administrador.');
      const deleted = await store.remove('email_perfil_permitido', Number(inviteMatch[1]));
      assert(deleted, 'Pré-cadastro não encontrado.', 404); return json(res, 204);
    }

    // Dashboard mobile.
    if (method === 'GET' && pathname === '/api/mobile/dashboard') { await requireMobile(req); return json(res, 200, await dashboardCounts()); }

    // Alunos, professores, responsáveis e técnicos: APIs legadas preservadas.
    if (method === 'GET' && ['/alunos', '/api/mobile/alunos'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobile(req); else await requireWeb(req);
      const rows = await store.select('aluno');
      if (pathname.startsWith('/api/mobile/')) {
        const data = await Promise.all(rows.map(async (a) => {
          const u = a.id_usuario == null ? null : await store.byId('usuario', a.id_usuario);
          const t = a.id_turma == null ? null : await store.byId('turma', a.id_turma);
          return { id: a.id_aluno, nome: u?.nome || `Aluno #${a.id_aluno}`, matricula: a.matricula || '', turma: t?.nome_turma || 'Sem turma' };
        }));
        return json(res, 200, data);
      }
      const data = await Promise.all(rows.map(async (a) => {
        const u = a.id_usuario == null ? null : await store.byId('usuario', a.id_usuario);
        const t = a.id_turma == null ? null : await store.byId('turma', a.id_turma);
        return { id: a.id_aluno, matricula: a.matricula, idade: a.idade, emailInstitucional: a.email_institucional, status: a.status, usuario: u ? publicUser(u) : null, turma: t ? { id: t.id_turma, nomeTurma: t.nome_turma } : null };
      }));
      return json(res, 200, data);
    }
    if (method === 'POST' && pathname === '/alunos') {
      const actor = await requireAdmin(req);
      assert(body.usuario && body.usuario.id != null, 'Vincule o aluno a um usuário já cadastrado.');
      const user = await store.byId('usuario', body.usuario.id); assert(user, 'Usuário vinculado não encontrado.');
      const turmaId = body.turma?.id ?? body.turmaId ?? null;
      const responsavelId = body.responsavel?.id ?? body.responsavelId ?? null;
      const turma = turmaId == null ? null : await store.byId('turma', turmaId);
      const responsavel = responsavelId == null ? null : await store.byId('responsavel', responsavelId);
      assert(turmaId == null || turma, 'Turma vinculada não encontrada.');
      assert(responsavelId == null || responsavel, 'Responsável vinculado não encontrado.');
      const row = await store.insert('aluno', { id_usuario: user.id_usuario, matricula: body.matricula ?? null, idade: body.idade ?? null, email_institucional: body.emailInstitucional ?? null, id_turma: turma?.id_turma ?? null, id_responsavel: responsavel?.id_responsavel ?? null, status: body.status ?? 1 });
      return json(res, 201, { id: row.id_aluno, matricula: row.matricula, idade: row.idade, emailInstitucional: row.email_institucional, status: row.status, usuario: publicUser(user), turma: turma ? { id: turma.id_turma, nomeTurma: turma.nome_turma } : null });
    }
    if (method === 'GET' && ['/professores', '/api/mobile/professores'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobile(req); else await requireWeb(req);
      const rows = await store.select('professor');
      const data = await Promise.all(rows.map(async (p) => { const u = await store.byId('usuario', p.id_professor); return { id: p.id_professor, nome: u?.nome || `Professor #${p.id_professor}` }; }));
      return json(res, 200, data);
    }
    if (method === 'GET' && pathname === '/responsaveis') {
      await requireWeb(req); const rows = await store.select('responsavel');
      return json(res, 200, await Promise.all(rows.map(async (r) => { const u = await store.byId('usuario', r.id_responsavel); return { id: r.id_responsavel, documentacao: r.documentacao, nome: u?.nome ?? null, email: u?.email ?? null }; })));
    }
    if (method === 'POST' && pathname === '/responsaveis') {
      await requireAdmin(req); assert(body.usuario?.id != null, 'Vincule o responsável a um usuário existente.');
      const user = await store.byId('usuario', body.usuario.id); assert(user, 'Usuário vinculado não encontrado.');
      const current = await store.byId('responsavel', user.id_usuario);
      const data = { id_responsavel: user.id_usuario, documentacao: body.documentacao ?? null };
      const row = current ? await store.update('responsavel', user.id_usuario, data) : await store.insert('responsavel', data);
      return json(res, 201, { id: row.id_responsavel, documentacao: row.documentacao, nome: user.nome, email: user.email });
    }
    if (method === 'GET' && pathname === '/tecnicos') {
      await requireWeb(req); const rows = await store.select('tecnico');
      return json(res, 200, await Promise.all(rows.map(async (r) => { const u = await store.byId('usuario', r.id_tecnico); return { id: r.id_tecnico, nome: u?.nome ?? null, email: u?.email ?? null, crad: r.crad, formacao: r.formacao, nivelFormacao: r.nivel_formacao }; })));
    }
    if (method === 'POST' && pathname === '/tecnicos') {
      await requireAdmin(req); assert(body.usuario?.id != null, 'Vincule o técnico a um usuário existente.');
      const user = await store.byId('usuario', body.usuario.id); assert(user, 'Usuário vinculado não encontrado.');
      const current = await store.byId('tecnico', user.id_usuario);
      const data = { id_tecnico: user.id_usuario, crad: body.crad ?? null, formacao: body.formacao ?? null, nivel_formacao: body.nivelFormacao ?? null };
      const row = current ? await store.update('tecnico', user.id_usuario, data) : await store.insert('tecnico', data);
      return json(res, 201, { id: row.id_tecnico, nome: user.nome, email: user.email, crad: row.crad, formacao: row.formacao, nivelFormacao: row.nivel_formacao });
    }

    // Turmas: /api/turmas é a rota canônica; /turmas também mantém compatibilidade com o JS web legado.
    if (method === 'GET' && (pathname === '/api/turmas' || pathname === '/turmas') && !(pathname === '/turmas' && String(req.headers.accept || '').includes('text/html'))) {
      await requireWeb(req); return json(res, 200, await listTurmas());
    }
    if (method === 'GET' && pathname === '/api/mobile/turmas') { await requireMobile(req); return json(res, 200, await listTurmas()); }
    if (method === 'POST' && ['/api/turmas', '/turmas', '/api/mobile/turmas'].includes(pathname)) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobile(req) : await requireWeb(req);
      assert(normalizeProfile(actor.perfil) === 'ADMIN', 'Somente um administrador pode criar, editar ou excluir turmas.', 403);
      return json(res, 201, await saveTurma(null, body));
    }
    const turmaMatch = pathname.match(/^\/(?:api\/)?turmas\/(\d+)$/);
    const mobileTurmaMatch = pathname.match(/^\/api\/mobile\/turmas\/(\d+)$/);
    if ((method === 'PUT' || method === 'DELETE') && (turmaMatch || mobileTurmaMatch)) {
      const match = mobileTurmaMatch || turmaMatch; const mobile = Boolean(mobileTurmaMatch); const actor = mobile ? await requireMobile(req) : await requireWeb(req);
      assert(normalizeProfile(actor.perfil) === 'ADMIN', 'Somente um administrador pode criar, editar ou excluir turmas.', 403);
      if (method === 'PUT') return json(res, 200, await saveTurma(Number(match[1]), body));
      await deleteTurma(Number(match[1])); return json(res, 204);
    }

    // Conselho de Classe (VdC), web e mobile compartilhando as mesmas regras.
    if (method === 'GET' && pathname === '/api/vdc') { const actor = await requireWeb(req); return json(res, 200, await listVdcs(actor.id_usuario)); }
    if (method === 'GET' && pathname === '/api/mobile/vdc') { const actor = await requireMobile(req); return json(res, 200, await listVdcs(actor.id_usuario)); }
    const vdcDetail = pathname.match(/^\/api\/vdc\/(\d+)$/);
    if (method === 'GET' && vdcDetail) {
      const actor = await requireWeb(req); const vdc = await store.byId('votacao_conselho', vdcDetail[1]); assert(vdc, 'Votação não encontrada.'); return json(res, 200, await getVdcResponse(vdc, actor.id_usuario));
    }
    if (method === 'POST' && ['/api/vdc', '/api/mobile/vdc'].includes(pathname)) {
      const mobile = pathname.startsWith('/api/mobile/'); const actor = mobile ? await requireMobile(req) : await requireWeb(req);
      return json(res, 201, await createVdc(body, actor.id_usuario));
    }
    const voteMatch = pathname.match(/^\/api\/(mobile\/)?vdc\/(\d+)\/votos$/);
    if (method === 'POST' && voteMatch) {
      const actor = voteMatch[1] ? await requireMobile(req) : await requireWeb(req);
      return json(res, 200, await castVote(Number(voteMatch[2]), body, actor.id_usuario));
    }
    const closeMatch = pathname.match(/^\/api\/(mobile\/)?vdc\/(\d+)\/encerrar$/);
    if (method === 'POST' && closeMatch) {
      const actor = closeMatch[1] ? await requireMobile(req) : await requireWeb(req);
      return json(res, 200, await closeVdc(Number(closeMatch[2]), actor.id_usuario));
    }

    // Sistema de Avaliação do Aluno: histórico, filtros, indicadores e acompanhamento individual.
    const saaCollectionPaths = ['/saa/avaliacoes', '/avaliacoes', '/api/saa/avaliacoes', '/api/mobile/saa/avaliacoes'];
    const saaSummaryPaths = ['/saa/resumo', '/api/saa/resumo', '/api/mobile/saa/resumo'];
    if (method === 'GET' && saaSummaryPaths.includes(pathname)) {
      const actor = pathname.startsWith('/api/mobile/') ? await requireMobile(req) : await requireWeb(req);
      const alunoId = requestUrl.searchParams.get('alunoId');
      const filters = {
        alunoId: alunoId ? Number(alunoId) : null,
        tipoAvaliacao: requestUrl.searchParams.get('tipoAvaliacao') ? normalizeProfile(requestUrl.searchParams.get('tipoAvaliacao')) : null,
        unidade: requestUrl.searchParams.get('unidade') || null,
        statusAcompanhamento: requestUrl.searchParams.get('statusAcompanhamento') ? normalizeProfile(requestUrl.searchParams.get('statusAcompanhamento')) : null,
        ano: requestUrl.searchParams.get('ano') || null
      };
      return json(res, 200, await saaSummary(actor, filters));
    }
    if (method === 'GET' && saaCollectionPaths.includes(pathname)) {
      const actor = pathname.startsWith('/api/mobile/') ? await requireMobile(req) : await requireWeb(req);
      const alunoId = requestUrl.searchParams.get('alunoId');
      const filters = {
        tipoAvaliacao: requestUrl.searchParams.get('tipoAvaliacao') ? normalizeProfile(requestUrl.searchParams.get('tipoAvaliacao')) : null,
        unidade: requestUrl.searchParams.get('unidade') || null,
        statusAcompanhamento: requestUrl.searchParams.get('statusAcompanhamento') ? normalizeProfile(requestUrl.searchParams.get('statusAcompanhamento')) : null,
        ano: requestUrl.searchParams.get('ano') || null
      };
      return json(res, 200, await listSaa(alunoId ? Number(alunoId) : null, actor, filters));
    }
    if (method === 'POST' && saaCollectionPaths.includes(pathname)) {
      const actor = pathname.startsWith('/api/mobile/') ? await requireMobile(req) : await requireWeb(req);
      return json(res, 201, await createSaa(body, actor));
    }
    const saaMatch = pathname.match(/^\/(?:api\/)?(?:saa\/)?avaliacoes\/(\d+)$/);
    const mobileSaaMatch = pathname.match(/^\/api\/mobile\/saa\/avaliacoes\/(\d+)$/);
    if (['PUT', 'PATCH'].includes(method) && (saaMatch || mobileSaaMatch)) {
      const mobile = pathname.startsWith('/api/mobile/');
      const actor = mobile ? await requireMobile(req) : await requireWeb(req);
      const id = Number((mobileSaaMatch || saaMatch)[1]);
      return json(res, 200, await updateSaa(id, body, actor));
    }
    const saaHistoryMatch = pathname.match(/^\/api\/(mobile\/)?saa\/alunos\/(\d+)\/historico$/);
    if (method === 'GET' && saaHistoryMatch) {
      const actor = saaHistoryMatch[1] ? await requireMobile(req) : await requireWeb(req);
      const items = await listSaa(Number(saaHistoryMatch[2]), actor, {});
      return json(res, 200, { alunoId: Number(saaHistoryMatch[2]), avaliacoes: items, resumo: await saaSummary(actor, { alunoId: Number(saaHistoryMatch[2]) }) });
    }

    // Requerimentos, incluindo encaminhamento ao VdC e atualização de status.
    if (method === 'GET' && ['/api/requerimentos', '/api/mobile/requerimentos'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobile(req); else await requireWeb(req);
      return json(res, 200, await listRequirements());
    }
    if (method === 'POST' && ['/api/requerimentos', '/api/mobile/requerimentos'].includes(pathname)) {
      if (pathname.startsWith('/api/mobile/')) await requireMobile(req); else await requireWeb(req);
      return json(res, 201, await createRequirement(body));
    }
    const forwardMatch = pathname.match(/^\/api\/(mobile\/)?requerimentos\/(\d+)\/vdc\/(\d+)$/);
    if (method === 'POST' && forwardMatch) {
      if (forwardMatch[1]) await requireMobile(req); else await requireWeb(req);
      return json(res, 200, await forwardRequirement(Number(forwardMatch[2]), Number(forwardMatch[3])));
    }
    const reqStatusMatch = pathname.match(/^\/api\/(mobile\/)?requerimentos\/(\d+)\/status$/);
    if (method === 'PATCH' && reqStatusMatch) {
      if (reqStatusMatch[1]) await requireMobile(req); else await requireWeb(req);
      return json(res, 200, await changeRequirementStatus(Number(reqStatusMatch[2]), body.status));
    }

    // Mensagens internas: ADM/coordenação conversam com professores, com presença online (90 s), lidas e alertas.
    const mobileMessage = pathname.startsWith('/api/mobile/mensagens');
    const messageBase = mobileMessage ? '/api/mobile/mensagens' : '/api/mensagens';
    if ((pathname === `${messageBase}/presenca` || pathname === `${messageBase}/presenca/offline`) && method === 'POST') {
      const actor = mobileMessage ? await requireMobile(req) : await requireWeb(req);
      if (pathname.endsWith('/offline')) { await store.remove('presenca_usuario', actor.id_usuario); return json(res, 204); }
      await heartbeat(actor); return json(res, 204);
    }
    if (pathname === `${messageBase}/contatos` && method === 'GET') {
      const actor = mobileMessage ? await requireMobile(req) : await requireWeb(req); return json(res, 200, await messageContacts(actor));
    }
    const conversationMatch = pathname.match(/^\/api\/(mobile\/)?mensagens\/conversa\/(\d+)$/);
    if (method === 'GET' && conversationMatch) {
      const actor = conversationMatch[1] ? await requireMobile(req) : await requireWeb(req); return json(res, 200, await getConversation(actor, Number(conversationMatch[2])));
    }
    if (method === 'POST' && [ '/api/mensagens', '/api/mobile/mensagens' ].includes(pathname)) {
      const actor = mobileMessage ? await requireMobile(req) : await requireWeb(req); return json(res, 201, await sendMessage(actor, body));
    }

    // Relatórios e logs (rotas legadas mantidas, com autorização administrativa para escrita/leitura de logs).
    if (method === 'GET' && pathname === '/relatorios') {
      await requireWeb(req); const rows = await store.select('relatorio');
      return json(res, 200, await Promise.all(rows.map(async (r) => {
        const student = r.id_aluno == null ? null : await store.byId('aluno', r.id_aluno);
        const studentUser = student?.id_usuario == null ? null : await store.byId('usuario', student.id_usuario);
        const professor = r.id_professor == null ? null : await store.byId('usuario', r.id_professor);
        return { id: r.id_relatorio, titulo: r.titulo, descricao: r.descricao, formato: r.formato, caminhoArquivo: r.caminho_arquivo, dataGeracao: r.data_geracao, alunoId: r.id_aluno, alunoNome: studentUser?.nome ?? null, professorId: r.id_professor, professorNome: professor?.nome ?? null };
      })));
    }
    if (method === 'POST' && pathname === '/relatorios') {
      await requireAdmin(req); assert(!blank(body.titulo), 'Informe o título do relatório.');
      if (body.aluno?.id != null) assert(await store.byId('aluno', body.aluno.id), 'Aluno do relatório não encontrado.');
      if (body.professor?.id != null) assert(await store.byId('professor', body.professor.id), 'Professor do relatório não encontrado.');
      const row = await store.insert('relatorio', { titulo: String(body.titulo).trim(), descricao: body.descricao ?? null, formato: body.formato ?? null, caminho_arquivo: body.caminhoArquivo ?? null, data_geracao: date(), id_aluno: body.aluno?.id ?? null, id_professor: body.professor?.id ?? null });
      return json(res, 201, { id: row.id_relatorio, titulo: row.titulo, descricao: row.descricao, formato: row.formato, caminhoArquivo: row.caminho_arquivo, dataGeracao: row.data_geracao, alunoId: row.id_aluno, professorId: row.id_professor });
    }
    if (method === 'GET' && pathname === '/logs') {
      await requireAdmin(req); const rows = await store.select('log_download_relatorio');
      return json(res, 200, await Promise.all(rows.map(async (r) => {
        const report = r.id_relatorio == null ? null : await store.byId('relatorio', r.id_relatorio);
        const user = r.id_usuario == null ? null : await store.byId('usuario', r.id_usuario);
        return { id: r.id_log, relatorioId: r.id_relatorio, relatorioTitulo: report?.titulo ?? null, usuarioId: r.id_usuario, usuarioNome: user?.nome ?? null, dataDownload: r.data_download, extensao: r.extensao };
      })));
    }
    if (method === 'POST' && pathname === '/logs') {
      await requireAdmin(req); assert(body.relatorio?.idRelatorio != null && body.usuario?.id != null, 'Informe o relatório e o usuário relacionados ao log.');
      assert(await store.byId('relatorio', body.relatorio.idRelatorio), 'Relatório ou usuário não encontrado.');
      assert(await store.byId('usuario', body.usuario.id), 'Relatório ou usuário não encontrado.');
      const row = await store.insert('log_download_relatorio', { id_relatorio: body.relatorio.idRelatorio, id_usuario: body.usuario.id, data_download: date(), extensao: body.extensao ?? null });
      const report = await store.byId('relatorio', row.id_relatorio); const user = await store.byId('usuario', row.id_usuario);
      return json(res, 201, { id: row.id_log, relatorioId: row.id_relatorio, relatorioTitulo: report?.titulo ?? null, usuarioId: row.id_usuario, usuarioNome: user?.nome ?? null, dataDownload: row.data_download, extensao: row.extensao });
    }

    // APIs administrativas legadas para compatibilidade com integrações antigas.
    if (method === 'GET' && pathname === '/usuarios') {
      const actor = await requireAdmin(req); const users = await store.select('usuario', () => true, (a, b) => byName(a, b));
      return json(res, 200, users.map(adminUser));
    }
    if (method === 'POST' && pathname === '/usuarios') {
      await requireAdmin(req); assert(!blank(body.nome) && !blank(body.email) && !blank(body.senhaHash), 'Informe nome, e-mail e senha inicial.');
      const email = normalizeEmail(body.email); assert(emailPattern.test(email), 'Informe um e-mail válido.');
      assert(String(body.senhaHash).length >= 12, 'A senha inicial deve ter pelo menos 12 caracteres.');
      assert(!(await uniqueEmail(email)), 'Já existe um usuário com esse e-mail.', 409);
      const profile = body.perfil == null || blank(body.perfil) ? 'USUARIO' : normalizeProfile(body.perfil);
      assert(profile === 'USUARIO' || profile === 'ADMIN', 'Perfil inválido. Use ADMIN ou USUARIO.');
      const row = await store.insert('usuario', { nome: String(body.nome).trim(), email, senha_hash: await hashPassword(body.senhaHash), perfil: profile, status: body.status == null ? 1 : (body.status ? 1 : 0), criado_em: date() });
      return json(res, 201, adminUser(row));
    }
    const legacyUser = pathname.match(/^\/usuarios\/(\d+)$/);
    if (legacyUser && method === 'GET') { await requireAdmin(req); const user = await store.byId('usuario', legacyUser[1]); assert(user, 'Usuário não encontrado.', 404); return json(res, 200, adminUser(user)); }
    if (legacyUser && method === 'DELETE') { const actor = await requireAdmin(req); return json(res, 200, await adminUpdate(actor, Number(legacyUser[1]), { status: false })); }

    return json(res, 404, { mensagem: 'Rota não encontrada.' });
  }

  return async function app(req, res) {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) { logger.error?.('Erro após envio dos headers:', error); return res.end(); }
      if (!(error.status && error.status < 500)) logger.error?.(error);
      sendError(res, error);
    }
  };
}

module.exports = { createApp, resolveTemplate, ROLES, MESSAGE_ROLES, PRE_REGISTER_ROLES };
