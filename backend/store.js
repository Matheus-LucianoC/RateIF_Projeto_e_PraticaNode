'use strict';

const TABLES = new Set([
  'usuario', 'email_perfil_permitido', 'recuperacao_senha', 'mobile_token_revogado', 'sessao_usuario',
  'presenca_usuario', 'mensagem_interna', 'turma', 'aluno', 'professor', 'responsavel',
  'tecnico', 'avaliacao', 'relatorio', 'log_download_relatorio', 'votacao_conselho',
  'voto_conselho', 'requerimento'
]);

const ALWAYS_TRUE = () => true;

const PRIMARY_KEYS = {
  usuario: 'id_usuario', email_perfil_permitido: 'id', recuperacao_senha: 'id_recuperacao',
  mobile_token_revogado: 'jti', sessao_usuario: 'id_sessao', presenca_usuario: 'usuario_id', mensagem_interna: 'id_mensagem',
  turma: 'id_turma', aluno: 'id_aluno', professor: 'id_professor', responsavel: 'id_responsavel',
  tecnico: 'id_tecnico', avaliacao: 'id_avaliacao', relatorio: 'id_relatorio',
  log_download_relatorio: 'id_log', votacao_conselho: 'id_votacao', voto_conselho: 'id_voto',
  requerimento: 'id_requerimento'
};

function assertTable(table) {
  if (!TABLES.has(table)) throw new Error(`Tabela não permitida: ${table}`);
}

class MemoryStore {
  constructor(seed = {}) {
    this.tables = new Map();
    this.sequences = new Map();
    for (const table of TABLES) {
      const rows = (seed[table] || []).map((row) => ({ ...row }));
      this.tables.set(table, rows);
      const pk = PRIMARY_KEYS[table];
      const max = rows.reduce((m, row) => typeof row[pk] === 'number' ? Math.max(m, row[pk]) : m, 0);
      this.sequences.set(table, max + 1);
    }
  }
  async select(table, predicate = ALWAYS_TRUE, compare = null) {
    assertTable(table);
    const rows = this.tables.get(table).filter(predicate).map((row) => ({ ...row }));
    if (compare) rows.sort(compare);
    return rows;
  }
  async first(table, predicate = ALWAYS_TRUE) {
    const rows = await this.select(table, predicate);
    return rows[0] || null;
  }
  async byId(table, id) {
    const pk = PRIMARY_KEYS[table];
    return this.first(table, (row) => String(row[pk]) === String(id));
  }
  async insert(table, value) {
    assertTable(table);
    const row = { ...value };
    const pk = PRIMARY_KEYS[table];
    if (row[pk] == null && pk !== 'jti' && pk !== 'usuario_id') {
      row[pk] = this.sequences.get(table);
      this.sequences.set(table, row[pk] + 1);
    }
    const rows = this.tables.get(table);
    if (rows.some((existing) => String(existing[pk]) === String(row[pk]))) {
      throw new Error(`Chave duplicada em ${table}.${pk}`);
    }
    rows.push(row);
    return { ...row };
  }
  async update(table, id, patch) {
    assertTable(table);
    const pk = PRIMARY_KEYS[table];
    const row = this.tables.get(table).find((item) => String(item[pk]) === String(id));
    if (!row) return null;
    Object.assign(row, patch);
    return { ...row };
  }
  async remove(table, id) {
    assertTable(table);
    const pk = PRIMARY_KEYS[table];
    const rows = this.tables.get(table);
    const index = rows.findIndex((row) => String(row[pk]) === String(id));
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }
  async count(table, predicate = ALWAYS_TRUE) {
    return (await this.select(table, predicate)).length;
  }
  async close() {}
}

class MySQLStore {
  constructor(pool) { this.pool = pool; }
  async select(table, predicate = ALWAYS_TRUE, compare = null) {
    assertTable(table);
    const [rows] = await this.pool.query(`SELECT * FROM \`${table}\``);
    const result = rows.filter(predicate);
    if (compare) result.sort(compare);
    return result;
  }
  async first(table, predicate = ALWAYS_TRUE) {
    const rows = await this.select(table, predicate);
    return rows[0] || null;
  }
  async byId(table, id) {
    assertTable(table);
    const pk = PRIMARY_KEYS[table];
    const [rows] = await this.pool.execute(`SELECT * FROM \`${table}\` WHERE \`${pk}\` = ? LIMIT 1`, [id]);
    return rows[0] || null;
  }
  async insert(table, value) {
    assertTable(table);
    const entries = Object.entries(value);
    if (!entries.length) throw new Error('Registro vazio.');
    const columns = entries.map(([key]) => `\`${key}\``).join(', ');
    const marks = entries.map(() => '?').join(', ');
    const [result] = await this.pool.execute(`INSERT INTO \`${table}\` (${columns}) VALUES (${marks})`, entries.map(([, v]) => v));
    const pk = PRIMARY_KEYS[table];
    return { ...value, [pk]: value[pk] ?? result.insertId };
  }
  async update(table, id, patch) {
    assertTable(table);
    const entries = Object.entries(patch);
    if (!entries.length) return this.byId(table, id);
    const pk = PRIMARY_KEYS[table];
    const set = entries.map(([key]) => `\`${key}\` = ?`).join(', ');
    await this.pool.execute(`UPDATE \`${table}\` SET ${set} WHERE \`${pk}\` = ?`, [...entries.map(([, v]) => v), id]);
    return this.byId(table, id);
  }
  async remove(table, id) {
    assertTable(table);
    const pk = PRIMARY_KEYS[table];
    const [result] = await this.pool.execute(`DELETE FROM \`${table}\` WHERE \`${pk}\` = ?`, [id]);
    return result.affectedRows > 0;
  }
  async count(table, predicate = ALWAYS_TRUE) {
    assertTable(table);
    if (predicate === ALWAYS_TRUE) {
      const [[row]] = await this.pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      return Number(row.total);
    }
    return (await this.select(table, predicate)).length;
  }
  async close() { await this.pool.end(); }
}

async function createMySQLStore(env = process.env) {
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch { throw new Error('Dependência mysql2 ausente. Execute npm install antes de iniciar o backend.'); }
  const connectionString = env.DB_URL || 'mysql://root:root123@localhost:3306/sistema_escolar';
  const parsed = new URL(connectionString.replace(/^jdbc:mysql:/, 'mysql:'));
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'sistema_escolar');
  const config = {
    host: parsed.hostname || 'localhost', port: Number(parsed.port || 3306),
    user: env.DB_USERNAME || decodeURIComponent(parsed.username || 'root'),
    password: env.DB_PASSWORD ?? decodeURIComponent(parsed.password || 'root123'),
    database, waitForConnections: true, connectionLimit: Number(env.DB_POOL_SIZE || 10),
    timezone: 'Z', decimalNumbers: true, dateStrings: false,
    ...(env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {})
  };
  // Primeiro tenta acessar o banco existente. Só solicita CREATE DATABASE
  // quando o servidor informa explicitamente que ele ainda não existe.
  let pool = mysql.createPool(config);
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    await pool.end().catch(() => {});
    if (error.code !== 'ER_BAD_DB_ERROR' && error.errno !== 1049) throw error;
    if (!/^[A-Za-z0-9_$-]+$/.test(database)) throw new Error('Nome de banco inválido em DB_URL.');
    const bootstrapConfig = { ...config };
    delete bootstrapConfig.database;
    const bootstrapPool = mysql.createPool(bootstrapConfig);
    try {
      await bootstrapPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
      await bootstrapPool.end();
    }
    pool = mysql.createPool(config);
    await pool.query('SELECT 1');
  }
  return new MySQLStore(pool);
}

module.exports = { MemoryStore, MySQLStore, createMySQLStore, PRIMARY_KEYS, TABLES };
