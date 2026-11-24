'use strict';
require('./env').loadEnvFile();
const http = require('node:http');
const { createMySQLStore } = require('./store');
const { migrate } = require('./schema');
const { createApp } = require('./app');
const { hashPassword } = require('./security');

async function bootstrapAdmin(store, env) {
  const email = String(env.RATEIF_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.RATEIF_ADMIN_PASSWORD || '';
  if (!email || !password) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('RATEIF_ADMIN_EMAIL não é um e-mail válido.');
  if (password.length < 12) throw new Error('RATEIF_ADMIN_PASSWORD deve ter ao menos 12 caracteres.');
  const existing = await store.first('usuario', (user) => String(user.email || '').toLowerCase() === email);
  if (existing) return; // Não promove silenciosamente uma conta que já existe.
  await store.insert('usuario', {
    nome: (env.RATEIF_ADMIN_NAME || 'Administrador RateIF').trim(), email,
    senha_hash: await hashPassword(password), perfil: 'ADMIN', status: 1, criado_em: new Date()
  });
}

async function start() {
  const env = process.env;
  const store = await createMySQLStore(env);
  await migrate(store.pool);
  await bootstrapAdmin(store, env);
  const app = createApp({ store, env });
  const server = http.createServer(app);
  const port = Number(env.SERVER_PORT || env.PORT || 8080);
  server.listen(port, '0.0.0.0', () => console.log(`RateIF Node backend executando na porta ${port}.`));
  const shutdown = async () => {
    server.close(async () => { await store.close(); process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) start().catch((error) => { console.error('Falha ao iniciar o RateIF:', error); process.exitCode = 1; });
module.exports = { start, bootstrapAdmin };
