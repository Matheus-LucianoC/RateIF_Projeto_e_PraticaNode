'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../backend/app');
const { MemoryStore } = require('../backend/store');
const { hashPassword, verifyPassword, createMobileToken, verifyToken } = require('../backend/security');

const SECRET = 'rateif-test-secret-which-is-at-least-32-characters-long';
const quietLogger = { error() {} };

async function makeFixture() {
  const users = [
    { id_usuario: 1, nome: 'Administradora', email: 'admin@rateif.test', perfil: 'ADMIN', status: 1, criado_em: new Date(), senha_hash: await hashPassword('Admin#123456') },
    { id_usuario: 2, nome: 'Professor Teste', email: 'prof@rateif.test', perfil: 'PROFESSOR', status: 1, criado_em: new Date(), senha_hash: await hashPassword('Professor#123') },
    { id_usuario: 3, nome: 'Aluno Teste', email: 'aluno@rateif.test', perfil: 'ALUNO', status: 1, criado_em: new Date(), senha_hash: await hashPassword('Aluno#123456') },
    { id_usuario: 4, nome: 'Coordenadora', email: 'coord@rateif.test', perfil: 'COORDENACAO', status: 1, criado_em: new Date(), senha_hash: await hashPassword('Coord#123456') }
  ];
  const store = new MemoryStore({
    usuario: users,
    professor: [{ id_professor: 2, formacao: 'Física', nivel_formacao: 'Superior' }],
    aluno: [{ id_aluno: 1, id_usuario: 3, matricula: '2026-001', idade: 17, email_institucional: 'aluno@if.test', id_turma: 1, id_responsavel: null, status: 1 }],
    turma: [{ id_turma: 1, nome_turma: '3º B DS', ano_letivo: 2026, turno: 'Manhã', id_professor: 2 }]
  });
  const app = createApp({ store, env: { MOBILE_JWT_SECRET: SECRET, MOBILE_JWT_EXPIRATION_HOURS: '8' }, logger: quietLogger });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || null };
  }
  async function webLogin(email = 'admin@rateif.test', senha = 'Admin#123456') {
    const result = await request('/auth/login', { method: 'POST', body: { email, senha } });
    assert.equal(result.response.status, 200);
    return result.cookie;
  }
  async function mobileLogin(email = 'admin@rateif.test', senha = 'Admin#123456') {
    const result = await request('/api/mobile/auth/login', { method: 'POST', body: { email, senha } });
    assert.equal(result.response.status, 200);
    return result.data.token;
  }
  return { store, server, request, webLogin, mobileLogin, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('hashes e JWT preservam autenticação e integridade', async () => {
  const hash = await hashPassword('Senha-forte-123');
  assert.equal(await verifyPassword('Senha-forte-123', hash), true);
  assert.equal(await verifyPassword('errada', hash), false);
  const token = createMobileToken({ id_usuario: 12, email: 'a@b.test', nome: 'A', perfil: 'ALUNO' }, SECRET, 1);
  assert.equal(verifyToken(token, SECRET).sub, '12');
  assert.throws(() => verifyToken(token, 'another-different-secret-value-000'), /inválido/);
});

test('autenticação web, páginas, perfil e segurança de permissões', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const page = await fx.request('/login', { headers: { Accept: 'text/html' } });
  assert.equal(page.response.status, 200);
  assert.match(page.data, /Rate/);
  assert.doesNotMatch(page.data, /\sth:/);
  const login = await fx.request('/auth/login', { method: 'POST', body: { email: 'ADMIN@RATEIF.TEST', senha: 'Admin#123456' } });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.redirect, '/dashboard');
  const cookie = login.cookie;
  const dashboard = await fx.request('/dashboard', { headers: { cookie, Accept: 'text/html' } });
  assert.equal(dashboard.response.status, 200);
  assert.match(dashboard.data, /Administradora/);
  const profile = await fx.request('/api/perfil', { headers: { cookie } });
  assert.equal(profile.data.perfil, 'ADMIN');
  const updated = await fx.request('/api/perfil', { method: 'PUT', headers: { cookie }, body: { nome: 'Admin Renomeada', email: 'admin@rateif.test' } });
  assert.equal(updated.response.status, 200);
  const logout = await fx.request('/auth/logout', { method: 'POST', headers: { cookie }, body: {} });
  assert.equal(logout.response.status, 200);
  const denied = await fx.request('/api/perfil', { headers: { cookie } });
  assert.equal(denied.response.status, 401);
});

test('pré-cadastro institucional é consumido no cadastro e impede autoelevação', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const invite = await fx.request('/api/admin/emails-perfil', { method: 'POST', headers: { cookie }, body: { email: 'nova.prof@rateif.test', perfil: 'PROFESSOR' } });
  assert.equal(invite.response.status, 201);
  const signup = await fx.request('/auth/cadastro', { method: 'POST', body: { nome: 'Nova Professora', email: 'NOVA.PROF@RATEIF.TEST', senha: 'Senha#123', confirmarSenha: 'Senha#123' } });
  assert.equal(signup.response.status, 200);
  const user = await fx.store.first('usuario', (row) => row.email === 'nova.prof@rateif.test');
  assert.equal(user.perfil, 'PROFESSOR');
  assert.equal(await fx.store.count('email_perfil_permitido'), 0);
  const attempt = await fx.request('/api/admin/emails-perfil', { method: 'POST', headers: { cookie }, body: { email: 'auto.admin@rateif.test', perfil: 'ADMIN' } });
  assert.equal(attempt.response.status, 400);
});

test('administração protege último administrador e auto-rebaixamento', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const self = await fx.request('/api/admin/usuarios/1', { method: 'PATCH', headers: { cookie }, body: { perfil: 'USUARIO' } });
  assert.equal(self.response.status, 400);
  const lastAdmin = await fx.request('/api/admin/usuarios/1', { method: 'PATCH', headers: { cookie }, body: { status: false } });
  assert.equal(lastAdmin.response.status, 400);
  const promote = await fx.request('/api/admin/usuarios/2', { method: 'PATCH', headers: { cookie }, body: { perfil: 'COORDENACAO' } });
  assert.equal(promote.response.status, 200);
  assert.equal(promote.data.perfil, 'COORDENACAO');
});

test('turmas mantêm caminho legado e validações administrativas', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const admin = await fx.webLogin();
  const list = await fx.request('/turmas', { headers: { cookie: admin } });
  assert.equal(list.response.status, 200);
  assert.equal(list.data[0].professorNome, 'Professor Teste');
  const noAdmin = await fx.webLogin('prof@rateif.test', 'Professor#123');
  const denied = await fx.request('/api/turmas', { method: 'POST', headers: { cookie: noAdmin }, body: { nomeTurma: '3º C', anoLetivo: 2026, turno: 'Tarde' } });
  assert.equal(denied.response.status, 403);
  const created = await fx.request('/api/turmas', { method: 'POST', headers: { cookie: admin }, body: { nomeTurma: '2º A', anoLetivo: 2027, turno: 'Tarde', professorId: 2 } });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.nomeTurma, '2º A');
  const blockedDelete = await fx.request('/api/turmas/1', { method: 'DELETE', headers: { cookie: admin } });
  assert.equal(blockedDelete.response.status, 409);
});

test('VdC cria sessão, permite atualizar voto, calcula resultado e encerra', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminCookie = await fx.webLogin();
  const created = await fx.request('/api/vdc', { method: 'POST', headers: { cookie: adminCookie }, body: { turmaId: 1, titulo: 'Conselho 2026' } });
  assert.equal(created.response.status, 201);
  const id = created.data.id;
  const vote = await fx.request(`/api/vdc/${id}/votos`, { method: 'POST', headers: { cookie: adminCookie }, body: { alunoId: 1, decisao: 'APROVAR' } });
  assert.equal(vote.response.status, 200);
  assert.equal(vote.data.alunos[0].aprovar, 1);
  const replaceVote = await fx.request(`/api/vdc/${id}/votos`, { method: 'POST', headers: { cookie: adminCookie }, body: { alunoId: 1, decisao: 'RETER' } });
  assert.equal(replaceVote.data.alunos[0].aprovar, 0);
  assert.equal(replaceVote.data.alunos[0].reter, 1);
  const close = await fx.request(`/api/vdc/${id}/encerrar`, { method: 'POST', headers: { cookie: adminCookie }, body: {} });
  assert.equal(close.data.status, 'ENCERRADA');
  const after = await fx.request(`/api/vdc/${id}/votos`, { method: 'POST', headers: { cookie: adminCookie }, body: { alunoId: 1, decisao: 'APROVAR' } });
  assert.equal(after.response.status, 409);
});

test('SAA valida nota/unidade e conserva todos os campos de acompanhamento', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const invalid = await fx.request('/saa/avaliacoes', { method: 'POST', headers: { cookie }, body: { alunoId: 1, professorId: 2, nota: 11 } });
  assert.equal(invalid.response.status, 400);
  const created = await fx.request('/saa/avaliacoes', { method: 'POST', headers: { cookie }, body: { alunoId: 1, professorId: 2, nota: 8.5, unidade: 2, titulo: 'Avaliação prática', tipoAvaliacao: 'FORMATIVA', competencias: 'Modelagem', pontosFortes: 'Raciocínio lógico', dificuldades: 'Normalização', intervencaoRecomendada: 'Atendimento', planoAcao: 'Duas monitorias e exercício guiado', dataReavaliacao: '2026-12-15', statusAcompanhamento: 'NECESSITA_INTERVENCAO', comentario: 'Evoluindo' } });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.tipoAvaliacao, 'FORMATIVA');
  assert.equal(created.data.statusAcompanhamento, 'NECESSITA_INTERVENCAO');
  assert.equal(created.data.intervencaoRecomendada, 'Atendimento');
  assert.equal(created.data.pontosFortes, 'Raciocínio lógico');
  assert.equal(created.data.dificuldades, 'Normalização');
  assert.equal(created.data.planoAcao, 'Duas monitorias e exercício guiado');
  assert.match(String(created.data.dataReavaliacao), /2026-12-15/);
  const updated = await fx.request(`/saa/avaliacoes/${created.data.id}`, { method: 'PUT', headers: { cookie }, body: { alunoId: 1, professorId: 2, nota: 9.5, unidade: 3, tipoAvaliacao: 'SOMATIVA', statusAcompanhamento: 'CONCLUIDO' } });
  assert.equal(updated.data.nota, 9.5);
  assert.equal(updated.data.statusAcompanhamento, 'CONCLUIDO');
});

test('sessões web ficam persistidas, podem ser listadas e revogadas individualmente', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookieA = await fx.webLogin();
  const cookieB = await fx.webLogin();
  assert.equal(await fx.store.count('sessao_usuario', (row) => row.tipo === 'WEB'), 2);
  const listed = await fx.request('/api/sessoes', { headers: { cookie: cookieA } });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.data.length, 2);
  assert.equal(listed.data.filter((session) => session.atual).length, 1);
  const other = listed.data.find((session) => !session.atual);
  const revoked = await fx.request(`/api/sessoes/${other.id}`, { method: 'DELETE', headers: { cookie: cookieA } });
  assert.equal(revoked.response.status, 200);
  const stillOwn = await fx.request('/api/perfil', { headers: { cookie: cookieA } });
  assert.equal(stillOwn.response.status, 200);
  const otherDenied = await fx.request('/api/perfil', { headers: { cookie: cookieB } });
  assert.equal(otherDenied.response.status, 401);
});

test('mobile usa refresh token rotativo, invalida o anterior e encerra a sessão', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const login = await fx.request('/api/mobile/auth/login', { method: 'POST', body: { email: 'admin@rateif.test', senha: 'Admin#123456' } });
  assert.equal(login.response.status, 200);
  assert.ok(login.data.token);
  assert.ok(login.data.refreshToken);
  assert.ok(login.data.sessionId);
  assert.ok(login.data.refreshExpiresIn > 0);
  const oldToken = login.data.token;
  const oldRefresh = login.data.refreshToken;
  const sessionsBefore = await fx.request('/api/mobile/sessoes', { headers: { Authorization: `Bearer ${oldToken}` } });
  assert.equal(sessionsBefore.response.status, 200);
  assert.equal(sessionsBefore.data.length, 1);
  assert.equal(sessionsBefore.data[0].atual, true);
  const renewed = await fx.request('/api/mobile/auth/refresh', { method: 'POST', body: { refreshToken: oldRefresh } });
  assert.equal(renewed.response.status, 200);
  assert.notEqual(renewed.data.token, oldToken);
  assert.notEqual(renewed.data.refreshToken, oldRefresh);
  assert.equal((await fx.request('/api/mobile/dashboard', { headers: { Authorization: `Bearer ${oldToken}` } })).response.status, 401);
  assert.equal((await fx.request('/api/mobile/dashboard', { headers: { Authorization: `Bearer ${renewed.data.token}` } })).response.status, 200);
  const replay = await fx.request('/api/mobile/auth/refresh', { method: 'POST', body: { refreshToken: oldRefresh } });
  assert.equal(replay.response.status, 401);
  const logout = await fx.request('/api/mobile/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${renewed.data.token}` }, body: { refreshToken: renewed.data.refreshToken } });
  assert.equal(logout.response.status, 200);
  assert.equal((await fx.request('/api/mobile/dashboard', { headers: { Authorization: `Bearer ${renewed.data.token}` } })).response.status, 401);
});

test('administração central cria contas, apresenta indicadores e revoga sessões de outros usuários', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminCookie = await fx.webLogin();
  const created = await fx.request('/api/admin/usuarios', { method: 'POST', headers: { cookie: adminCookie }, body: { nome: 'Novo Técnico', email: 'tecnico.novo@rateif.test', senha: 'Tecnico#2026Senha', perfil: 'TECNICO', status: true, crad: 'CRAD-2026', formacao: 'Redes', nivelFormacao: 'Técnico' } });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.perfil, 'TECNICO');
  assert.equal((await fx.store.byId('tecnico', created.data.id)).crad, 'CRAD-2026');
  const mobile = await fx.request('/api/mobile/auth/login', { method: 'POST', body: { email: 'tecnico.novo@rateif.test', senha: 'Tecnico#2026Senha' } });
  assert.equal(mobile.response.status, 200);
  const overview = await fx.request('/api/admin/overview', { headers: { cookie: adminCookie } });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.usuarios, 5);
  assert.ok(overview.data.sessoesAtivas >= 2);
  const sessions = await fx.request('/api/admin/sessoes', { headers: { cookie: adminCookie } });
  assert.equal(sessions.data.filter((s) => s.atual).length, 1);
  const targetSession = sessions.data.find((s) => s.usuarioEmail === 'tecnico.novo@rateif.test');
  assert.ok(targetSession);
  const revoke = await fx.request(`/api/admin/sessoes/${targetSession.id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.equal(revoke.response.status, 200);
  assert.equal((await fx.request('/api/mobile/dashboard', { headers: { Authorization: `Bearer ${mobile.data.token}` } })).response.status, 401);
  const updated = await fx.request(`/api/admin/usuarios/${created.data.id}`, { method: 'PATCH', headers: { cookie: adminCookie }, body: { nome: 'Técnico Atualizado', email: 'tecnico.atualizado@rateif.test', perfil: 'TECNICO', status: false } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.nome, 'Técnico Atualizado');
  assert.equal(updated.data.email, 'tecnico.atualizado@rateif.test');
  const forbidden = await fx.request('/api/admin/overview', { headers: { cookie: await fx.webLogin('prof@rateif.test', 'Professor#123') } });
  assert.equal(forbidden.response.status, 403);
});

test('APIs administrativas mobile oferecem overview, criação e revogação de sessões', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const admin = await fx.request('/api/mobile/auth/login', { method: 'POST', body: { email: 'admin@rateif.test', senha: 'Admin#123456' } });
  const auth = { Authorization: `Bearer ${admin.data.token}` };
  const created = await fx.request('/api/mobile/admin/usuarios', { method: 'POST', headers: auth, body: { nome: 'Aluno Criado pelo ADM', email: 'aluno.criado@rateif.test', senha: 'AlunoCriado#2026', perfil: 'ALUNO' } });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.perfil, 'ALUNO');
  const studentProfile = await fx.store.first('aluno', (row) => String(row.id_usuario) === String(created.data.id));
  assert.ok(studentProfile);
  const overview = await fx.request('/api/mobile/admin/overview', { headers: auth });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.usuarios, 5);
  const createdLogin = await fx.request('/api/mobile/auth/login', { method: 'POST', body: { email: 'aluno.criado@rateif.test', senha: 'AlunoCriado#2026' } });
  const activeSessions = await fx.request('/api/mobile/admin/sessoes', { headers: auth });
  assert.equal(activeSessions.data.filter((s) => s.atual).length, 1);
  const session = activeSessions.data.find((item) => item.usuarioEmail === 'aluno.criado@rateif.test');
  assert.ok(session);
  const revoke = await fx.request(`/api/mobile/admin/sessoes/${session.id}`, { method: 'DELETE', headers: auth });
  assert.equal(revoke.response.status, 200);
  assert.equal((await fx.request('/api/mobile/saa/avaliacoes', { headers: { Authorization: `Bearer ${createdLogin.data.token}` } })).response.status, 401);
});

test('SAA mobile fornece resumo e histórico; aluno só consulta os próprios registros', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminCookie = await fx.webLogin();
  const created = await fx.request('/api/saa/avaliacoes', { method: 'POST', headers: { cookie: adminCookie }, body: { alunoId: 1, professorId: 2, nota: 7.5, titulo: 'Acompanhamento mobile', unidade: 1, pontosFortes: 'Boa participação', dificuldades: 'Organização', planoAcao: 'Roteiro semanal', dataReavaliacao: '2020-01-01', statusAcompanhamento: 'NECESSITA_INTERVENCAO' } });
  assert.equal(created.response.status, 201);
  const studentLogin = await fx.request('/api/mobile/auth/login', { method: 'POST', body: { email: 'aluno@rateif.test', senha: 'Aluno#123456' } });
  const auth = { Authorization: `Bearer ${studentLogin.data.token}` };
  const items = await fx.request('/api/mobile/saa/avaliacoes', { headers: auth });
  assert.equal(items.response.status, 200);
  assert.equal(items.data.length, 1);
  assert.equal(items.data[0].planoAcao, 'Roteiro semanal');
  const summary = await fx.request('/api/mobile/saa/resumo', { headers: auth });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.data.total, 1);
  assert.equal(summary.data.necessitaIntervencao, 1);
  assert.equal(summary.data.reavaliacoesPendentes, 1);
  const otherStudent = await fx.request('/api/mobile/saa/avaliacoes?alunoId=999', { headers: auth });
  assert.equal(otherStudent.response.status, 403);
  const blockedCreate = await fx.request('/api/mobile/saa/avaliacoes', { method: 'POST', headers: auth, body: { alunoId: 1, professorId: 2, nota: 8 } });
  assert.equal(blockedCreate.response.status, 403);
});

test('requerimentos validam turma do aluno, encaminhamento e status', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const vdc = await fx.request('/api/vdc', { method: 'POST', headers: { cookie }, body: { turmaId: 1 } });
  const created = await fx.request('/api/requerimentos', { method: 'POST', headers: { cookie }, body: { alunoId: 1, tipo: 'Revisão', descricao: 'Solicito revisão', vdcId: vdc.data.id } });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.status, 'ENCAMINHADO_VDC');
  const status = await fx.request(`/api/requerimentos/${created.data.id}/status`, { method: 'PATCH', headers: { cookie }, body: { status: 'CONCLUIDO' } });
  assert.equal(status.data.status, 'CONCLUIDO');
  const bad = await fx.request(`/api/requerimentos/${created.data.id}/status`, { method: 'PATCH', headers: { cookie }, body: { status: 'INVALIDO' } });
  assert.equal(bad.response.status, 400);
});

test('mensagens aplicam regra de perfis, presença, unread e confirmação de leitura', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminCookie = await fx.webLogin();
  const profCookie = await fx.webLogin('prof@rateif.test', 'Professor#123');
  await fx.request('/api/mensagens/presenca', { method: 'POST', headers: { cookie: profCookie }, body: {} });
  const contacts = await fx.request('/api/mensagens/contatos', { headers: { cookie: adminCookie } });
  assert.equal(contacts.response.status, 200);
  assert.equal(contacts.data[0].id, 2);
  assert.equal(contacts.data[0].online, true);
  const sent = await fx.request('/api/mensagens', { method: 'POST', headers: { cookie: adminCookie }, body: { destinatarioId: 2, conteudo: 'Olá, professor.' } });
  assert.equal(sent.response.status, 201);
  const unread = await fx.request('/api/mensagens/contatos', { headers: { cookie: adminCookie } });
  assert.equal(unread.data[0].naoLidas, 0);
  const profContacts = await fx.request('/api/mensagens/contatos', { headers: { cookie: profCookie } });
  assert.equal(profContacts.data[0].naoLidas, 1);
  const conversation = await fx.request('/api/mensagens/conversa/1', { headers: { cookie: profCookie } });
  assert.equal(conversation.data.length, 1);
  assert.equal(conversation.data[0].conteudo, 'Olá, professor.');
  const contactsAfterRead = await fx.request('/api/mensagens/contatos', { headers: { cookie: adminCookie } });
  assert.equal(contactsAfterRead.data[0].naoLidas, 0);
});

test('mobile autentica com JWT, protege endpoints e revoga token no logout', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const token = await fx.mobileLogin();
  const auth = { Authorization: `Bearer ${token}` };
  const dash = await fx.request('/api/mobile/dashboard', { headers: auth });
  assert.equal(dash.response.status, 200);
  assert.equal(dash.data.alunos, 1);
  const list = await fx.request('/api/mobile/turmas', { headers: auth });
  assert.equal(list.response.status, 200);
  const create = await fx.request('/api/mobile/turmas', { method: 'POST', headers: auth, body: { nomeTurma: 'Mobile turma', anoLetivo: 2027, turno: 'Noite' } });
  assert.equal(create.response.status, 201);
  const logout = await fx.request('/api/mobile/auth/logout', { method: 'POST', headers: auth, body: {} });
  assert.equal(logout.response.status, 200);
  const denied = await fx.request('/api/mobile/dashboard', { headers: auth });
  assert.equal(denied.response.status, 401);
});

test('rotas legadas de alunos, relatórios e administração continuam disponíveis', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const students = await fx.request('/alunos', { headers: { cookie } });
  assert.equal(students.response.status, 200);
  assert.equal(students.data[0].usuario.nome, 'Aluno Teste');
  const reports = await fx.request('/relatorios', { method: 'POST', headers: { cookie }, body: { titulo: 'Relatório pedagógico', formato: 'PDF', aluno: { id: 1 }, professor: { id: 2 } } });
  assert.equal(reports.response.status, 201);
  const list = await fx.request('/relatorios', { headers: { cookie } });
  assert.equal(list.response.status, 200);
  assert.equal(list.data[0].titulo, 'Relatório pedagógico');
  const logs = await fx.request('/logs', { headers: { cookie } });
  assert.equal(logs.response.status, 200);
});

test('todas as páginas e assets web continuam servidos pelo Node com os novos módulos', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  for (const page of ['/dashboard', '/mensagens', '/perfil', '/admin', '/turmas', '/vdc', '/saa', '/requerimentos']) {
    const result = await fx.request(page, { headers: { cookie, Accept: 'text/html' } });
    assert.equal(result.response.status, 200, `falha ao abrir ${page}`);
    assert.equal(typeof result.data, 'string');
    assert.doesNotMatch(result.data, /\sth:[\w:-]+=/, `atributo de template não resolvido em ${page}`);
  }
  const css = await fx.request('/css/style.css');
  const js = await fx.request('/js/app.js');
  assert.equal(css.response.status, 200);
  assert.match(css.response.headers.get('content-type'), /text\/css/);
  assert.equal(js.response.status, 200);
  assert.match(js.response.headers.get('content-type'), /javascript/);
});

test('recuperação de senha gera token de uso único e troca a credencial', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const request = await fx.request('/auth/recuperacao', { method: 'POST', body: { email: 'admin@rateif.test' } });
  assert.equal(request.response.status, 200);
  const token = new URL(request.data.link, 'http://rateif.test').searchParams.get('token');
  assert.ok(token);
  const reset = await fx.request(`/auth/recuperacao/nova?token=${encodeURIComponent(token)}`, { method: 'POST', body: { senha: 'NovaSenha#123', confirmarSenha: 'NovaSenha#123' } });
  assert.equal(reset.response.status, 200);
  const reused = await fx.request(`/auth/recuperacao/nova?token=${encodeURIComponent(token)}`, { method: 'POST', body: { senha: 'OutraSenha#123', confirmarSenha: 'OutraSenha#123' } });
  assert.equal(reused.response.status, 400);
  const oldLogin = await fx.request('/auth/login', { method: 'POST', body: { email: 'admin@rateif.test', senha: 'Admin#123456' } });
  assert.equal(oldLogin.response.status, 401);
  const newLogin = await fx.request('/auth/login', { method: 'POST', body: { email: 'admin@rateif.test', senha: 'NovaSenha#123' } });
  assert.equal(newLogin.response.status, 200);
});

test('API mobile cobre cadastro institucional, perfil e gestão de e-mails', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const token = await fx.mobileLogin();
  const auth = { Authorization: `Bearer ${token}` };
  const invite = await fx.request('/api/mobile/admin/emails-perfil', { method: 'POST', headers: auth, body: { email: 'mobile.prof@rateif.test', perfil: 'PROFESSOR' } });
  assert.equal(invite.response.status, 201);
  const invites = await fx.request('/api/mobile/admin/emails-perfil', { headers: auth });
  assert.equal(invites.data.length, 1);
  const signup = await fx.request('/api/mobile/auth/cadastro', { method: 'POST', body: { nome: 'Professor Mobile', email: 'mobile.prof@rateif.test', senha: 'Mobile#123', confirmarSenha: 'Mobile#123' } });
  assert.equal(signup.response.status, 201);
  assert.equal(signup.data.usuario.perfil, 'PROFESSOR');
  const mobileAuth = { Authorization: `Bearer ${signup.data.token}` };
  const profile = await fx.request('/api/mobile/profile', { headers: mobileAuth });
  assert.equal(profile.data.email, 'mobile.prof@rateif.test');
  const updated = await fx.request('/api/mobile/profile', { method: 'PUT', headers: mobileAuth, body: { nome: 'Professor Mobile 2', email: 'mobile.prof@rateif.test' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.usuario.nome, 'Professor Mobile 2');
  const newAuth = { Authorization: `Bearer ${updated.data.token}` };
  assert.equal((await fx.request('/api/mobile/profile', { headers: newAuth })).data.nome, 'Professor Mobile 2');
  const pending = await fx.request('/api/mobile/admin/emails-perfil', { method: 'POST', headers: auth, body: { email: 'pending.user@rateif.test', perfil: 'USUARIO' } });
  const removed = await fx.request(`/api/mobile/admin/emails-perfil/${pending.data.id}`, { method: 'DELETE', headers: auth });
  assert.equal(removed.response.status, 204);
});

test('APIs mobile preservam SAA, VdC e fluxo de requerimentos', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const token = await fx.mobileLogin();
  const auth = { Authorization: `Bearer ${token}` };
  const teachers = await fx.request('/api/mobile/professores', { headers: auth });
  const students = await fx.request('/api/mobile/alunos', { headers: auth });
  assert.equal(teachers.data[0].id, 2);
  assert.equal(students.data[0].id, 1);
  const saa = await fx.request('/api/mobile/saa/avaliacoes', { method: 'POST', headers: auth, body: { alunoId: 1, professorId: 2, nota: 7.5, titulo: 'Mobile SAA', tipoAvaliacao: 'DIAGNOSTICA' } });
  assert.equal(saa.response.status, 201);
  const saaUpdate = await fx.request(`/api/mobile/saa/avaliacoes/${saa.data.id}`, { method: 'PUT', headers: auth, body: { alunoId: 1, professorId: 2, nota: 8.5, titulo: 'Mobile SAA atualizada', tipoAvaliacao: 'FORMATIVA' } });
  assert.equal(saaUpdate.data.nota, 8.5);
  const vdc = await fx.request('/api/mobile/vdc', { method: 'POST', headers: auth, body: { turmaId: 1, titulo: 'VdC mobile' } });
  assert.equal(vdc.response.status, 201);
  const vote = await fx.request(`/api/mobile/vdc/${vdc.data.id}/votos`, { method: 'POST', headers: auth, body: { alunoId: 1, decisao: 'RECUPERAÇÃO' } });
  assert.equal(vote.data.alunos[0].recuperacao, 1);
  const requirement = await fx.request('/api/mobile/requerimentos', { method: 'POST', headers: auth, body: { alunoId: 1, tipo: 'Revisão de nota', descricao: 'Reavaliar atividade' } });
  assert.equal(requirement.response.status, 201);
  const forward = await fx.request(`/api/mobile/requerimentos/${requirement.data.id}/vdc/${vdc.data.id}`, { method: 'POST', headers: auth, body: {} });
  assert.equal(forward.data.status, 'ENCAMINHADO_VDC');
  const close = await fx.request(`/api/mobile/vdc/${vdc.data.id}/encerrar`, { method: 'POST', headers: auth, body: {} });
  assert.equal(close.data.status, 'ENCERRADA');
});

test('API mobile mantém mensagens, presença e leitura compatíveis com a web', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const admin = await fx.mobileLogin();
  const prof = await fx.mobileLogin('prof@rateif.test', 'Professor#123');
  const adminAuth = { Authorization: `Bearer ${admin}` };
  const profAuth = { Authorization: `Bearer ${prof}` };
  await fx.request('/api/mobile/mensagens/presenca', { method: 'POST', headers: profAuth, body: {} });
  const sent = await fx.request('/api/mobile/mensagens', { method: 'POST', headers: adminAuth, body: { destinatarioId: 2, conteudo: 'Mensagem pelo app' } });
  assert.equal(sent.response.status, 201);
  const contacts = await fx.request('/api/mobile/mensagens/contatos', { headers: profAuth });
  assert.equal(contacts.data[0].naoLidas, 1);
  const conversation = await fx.request('/api/mobile/mensagens/conversa/1', { headers: profAuth });
  assert.equal(conversation.data[0].conteudo, 'Mensagem pelo app');
  await fx.request('/api/mobile/mensagens/presenca/offline', { method: 'POST', headers: profAuth, body: {} });
  const after = await fx.request('/api/mobile/mensagens/contatos', { headers: adminAuth });
  assert.equal(after.data[0].online, false);
});

test('rotas administrativas antigas de alunos, responsáveis, técnicos e logs continuam disponíveis', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const cookie = await fx.webLogin();
  const responsavel = await fx.request('/responsaveis', { method: 'POST', headers: { cookie }, body: { usuario: { id: 4 }, documentacao: 'DOC-123' } });
  assert.equal(responsavel.response.status, 201);
  assert.equal(responsavel.data.documentacao, 'DOC-123');
  const responsavelUpdated = await fx.request('/responsaveis', { method: 'POST', headers: { cookie }, body: { usuario: { id: 4 }, documentacao: 'DOC-456' } });
  assert.equal(responsavelUpdated.data.documentacao, 'DOC-456');
  const aluno = await fx.request('/alunos', { method: 'POST', headers: { cookie }, body: { usuario: { id: 4 }, matricula: 'A-2027', idade: 18, emailInstitucional: 'coord@if.test', turmaId: 1, responsavelId: 4 } });
  assert.equal(aluno.response.status, 201);
  assert.equal(aluno.data.usuario.perfil, 'COORDENACAO');
  assert.equal(aluno.data.turma.nomeTurma, '3º B DS');
  const tecnico = await fx.request('/tecnicos', { method: 'POST', headers: { cookie }, body: { usuario: { id: 4 }, crad: 'CRAD-1', formacao: 'Técnica', nivelFormacao: 'Médio' } });
  assert.equal(tecnico.response.status, 201);
  assert.equal(tecnico.data.nivelFormacao, 'Médio');
  const tecnicoUpdated = await fx.request('/tecnicos', { method: 'POST', headers: { cookie }, body: { usuario: { id: 4 }, crad: 'CRAD-2', formacao: 'Técnica', nivelFormacao: 'Superior' } });
  assert.equal(tecnicoUpdated.data.crad, 'CRAD-2');
  assert.equal((await fx.request('/responsaveis', { headers: { cookie } })).response.status, 200);
  assert.equal((await fx.request('/tecnicos', { headers: { cookie } })).response.status, 200);
  const report = await fx.request('/relatorios', { method: 'POST', headers: { cookie }, body: { titulo: 'Relatório para log', formato: 'PDF' } });
  const log = await fx.request('/logs', { method: 'POST', headers: { cookie }, body: { relatorio: { idRelatorio: report.data.id }, usuario: { id: 1 }, extensao: 'pdf' } });
  assert.equal(log.response.status, 201);
  assert.equal(log.data.relatorioTitulo, 'Relatório para log');
});

test('renderização preserva a visibilidade dos menus e painéis conforme o perfil', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminCookie = await fx.webLogin();
  const studentCookie = await fx.webLogin('aluno@rateif.test', 'Aluno#123456');
  const adminDashboard = await fx.request('/dashboard', { headers: { cookie: adminCookie, Accept: 'text/html' } });
  const studentDashboard = await fx.request('/dashboard', { headers: { cookie: studentCookie, Accept: 'text/html' } });
  assert.match(adminDashboard.data, /href="\/admin"/);
  assert.match(adminDashboard.data, /href="\/mensagens"/);
  assert.doesNotMatch(studentDashboard.data, /href="\/admin"/);
  assert.doesNotMatch(studentDashboard.data, /href="\/mensagens"/);
  const adminTurmas = await fx.request('/turmas', { headers: { cookie: adminCookie, Accept: 'text/html' } });
  const studentTurmas = await fx.request('/turmas', { headers: { cookie: studentCookie, Accept: 'text/html' } });
  assert.match(adminTurmas.data, /id="turmaForm"/);
  assert.doesNotMatch(adminTurmas.data, /ACESSO DE LEITURA/);
  assert.doesNotMatch(studentTurmas.data, /id="turmaForm"/);
  assert.match(studentTurmas.data, /ACESSO DE LEITURA/);
  const adminPage = await fx.request('/admin', { headers: { cookie: adminCookie, Accept: 'text/html' } });
  assert.match(adminPage.data, /Indicadores do sistema/);
  assert.match(adminPage.data, /Criar conta diretamente/);
  assert.match(adminPage.data, /Sessões ativas em todo o sistema/);
  const profilePage = await fx.request('/perfil', { headers: { cookie: studentCookie, Accept: 'text/html' } });
  assert.match(profilePage.data, /Minhas sessões/);
  const saaPage = await fx.request('/saa', { headers: { cookie: adminCookie, Accept: 'text/html' } });
  assert.match(saaPage.data, /Pontos fortes/);
  assert.match(saaPage.data, /Dificuldades identificadas/);
  assert.match(saaPage.data, /Plano de ação/);
});

test('login Google valida e-mail verificado e aplica pré-cadastro institucional', async (t) => {
  const fx = await makeFixture(); t.after(fx.close);
  const adminToken = await fx.mobileLogin();
  const adminAuth = { Authorization: `Bearer ${adminToken}` };
  await fx.request('/api/mobile/admin/emails-perfil', { method: 'POST', headers: adminAuth, body: { email: 'google.prof@rateif.test', perfil: 'PROFESSOR' } });
  const nativeFetch = global.fetch;
  global.fetch = async (input, options) => {
    if (String(input).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return { ok: true, json: async () => ({ email: 'google.prof@rateif.test', name: 'Google Professor', email_verified: 'true' }) };
    }
    return nativeFetch(input, options);
  };
  try {
    const result = await fx.request('/auth/google', { method: 'POST', body: { credential: 'token-google-de-teste' } });
    assert.equal(result.response.status, 200);
    const user = await fx.store.first('usuario', (row) => row.email === 'google.prof@rateif.test');
    assert.equal(user.perfil, 'PROFESSOR');
    assert.equal(user.nome, 'Google Professor');
    assert.equal(await fx.store.count('email_perfil_permitido'), 0);
  } finally {
    global.fetch = nativeFetch;
  }
});

test('produção exige segredo JWT próprio', () => {
  assert.throws(() => createApp({ store: new MemoryStore(), env: { NODE_ENV: 'production' }, logger: quietLogger }), /MOBILE_JWT_SECRET/);
});
