'use strict';

const statements = [
`CREATE TABLE IF NOT EXISTS usuario (
  id_usuario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255), email VARCHAR(255), senha_hash VARCHAR(255), perfil VARCHAR(64),
  status TINYINT(1) DEFAULT 1, criado_em DATETIME,
  UNIQUE KEY uk_usuario_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS email_perfil_permitido (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL,
  perfil VARCHAR(32) NOT NULL, criado_em DATETIME NOT NULL,
  UNIQUE KEY uk_email_perfil_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS professor (
  id_professor INT NOT NULL PRIMARY KEY, formacao VARCHAR(255), nivel_formacao VARCHAR(255),
  CONSTRAINT fk_professor_usuario FOREIGN KEY (id_professor) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS responsavel (
  id_responsavel INT NOT NULL PRIMARY KEY, documentacao VARCHAR(255),
  CONSTRAINT fk_responsavel_usuario FOREIGN KEY (id_responsavel) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS tecnico (
  id_tecnico INT NOT NULL PRIMARY KEY, crad VARCHAR(255), formacao VARCHAR(255), nivel_formacao VARCHAR(255),
  CONSTRAINT fk_tecnico_usuario FOREIGN KEY (id_tecnico) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS turma (
  id_turma INT NOT NULL AUTO_INCREMENT PRIMARY KEY, nome_turma VARCHAR(255), ano_letivo INT, turno VARCHAR(100), id_professor INT,
  INDEX idx_turma_professor (id_professor),
  CONSTRAINT fk_turma_professor FOREIGN KEY (id_professor) REFERENCES professor(id_professor) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS aluno (
  id_aluno INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_usuario INT UNIQUE, matricula VARCHAR(255), idade INT,
  email_institucional VARCHAR(255), id_turma INT, id_responsavel INT, status TINYINT(1) DEFAULT 1,
  INDEX idx_aluno_turma (id_turma), INDEX idx_aluno_responsavel (id_responsavel),
  CONSTRAINT fk_aluno_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_aluno_turma FOREIGN KEY (id_turma) REFERENCES turma(id_turma) ON DELETE SET NULL,
  CONSTRAINT fk_aluno_responsavel FOREIGN KEY (id_responsavel) REFERENCES responsavel(id_responsavel) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS avaliacao (
  id_avaliacao INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_aluno INT, id_professor INT, nota DOUBLE,
  comentario TEXT, data_avaliacao DATETIME, atualizado_em DATETIME NULL, titulo VARCHAR(120), tipo_avaliacao VARCHAR(30), unidade INT,
  competencias TEXT, pontos_fortes TEXT, dificuldades TEXT, intervencao_recomendada TEXT, plano_acao TEXT,
  data_reavaliacao DATE NULL, status_acompanhamento VARCHAR(30),
  INDEX idx_avaliacao_aluno (id_aluno), INDEX idx_avaliacao_professor (id_professor),
  CONSTRAINT fk_avaliacao_aluno FOREIGN KEY (id_aluno) REFERENCES aluno(id_aluno) ON DELETE SET NULL,
  CONSTRAINT fk_avaliacao_professor FOREIGN KEY (id_professor) REFERENCES professor(id_professor) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS relatorio (
  id_relatorio INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_aluno INT, id_professor INT, titulo VARCHAR(255),
  descricao TEXT, formato VARCHAR(100), caminho_arquivo VARCHAR(1000), data_geracao DATETIME,
  CONSTRAINT fk_relatorio_aluno FOREIGN KEY (id_aluno) REFERENCES aluno(id_aluno) ON DELETE SET NULL,
  CONSTRAINT fk_relatorio_professor FOREIGN KEY (id_professor) REFERENCES professor(id_professor) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS log_download_relatorio (
  id_log INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_relatorio INT, id_usuario INT, data_download DATETIME, extensao VARCHAR(80),
  CONSTRAINT fk_log_relatorio FOREIGN KEY (id_relatorio) REFERENCES relatorio(id_relatorio) ON DELETE SET NULL,
  CONSTRAINT fk_log_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id_recuperacao INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_usuario INT, token VARCHAR(255), expira_em DATETIME, usado_em DATETIME,
  UNIQUE KEY uk_recuperacao_token (token), INDEX idx_recuperacao_usuario (id_usuario),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS votacao_conselho (
  id_votacao INT NOT NULL AUTO_INCREMENT PRIMARY KEY, titulo VARCHAR(140) NOT NULL, id_turma INT NOT NULL,
  ano_letivo INT NOT NULL, status VARCHAR(20) NOT NULL, criado_em DATETIME NOT NULL, encerrado_em DATETIME,
  INDEX idx_vdc_status (status), CONSTRAINT fk_vdc_turma FOREIGN KEY (id_turma) REFERENCES turma(id_turma)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS voto_conselho (
  id_voto INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_votacao INT NOT NULL, id_aluno INT NOT NULL, id_usuario INT NOT NULL,
  decisao VARCHAR(20) NOT NULL, comentario VARCHAR(500), votado_em DATETIME NOT NULL,
  UNIQUE KEY uk_voto_conselho_votacao_aluno_usuario (id_votacao,id_aluno,id_usuario),
  CONSTRAINT fk_voto_vdc FOREIGN KEY (id_votacao) REFERENCES votacao_conselho(id_votacao) ON DELETE CASCADE,
  CONSTRAINT fk_voto_aluno FOREIGN KEY (id_aluno) REFERENCES aluno(id_aluno),
  CONSTRAINT fk_voto_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS requerimento (
  id_requerimento INT NOT NULL AUTO_INCREMENT PRIMARY KEY, id_aluno INT NOT NULL, tipo VARCHAR(80) NOT NULL,
  descricao TEXT NOT NULL, status VARCHAR(30) NOT NULL, criado_em DATETIME NOT NULL, id_votacao_conselho INT,
  INDEX idx_requerimento_data (criado_em),
  CONSTRAINT fk_requerimento_aluno FOREIGN KEY (id_aluno) REFERENCES aluno(id_aluno),
  CONSTRAINT fk_requerimento_vdc FOREIGN KEY (id_votacao_conselho) REFERENCES votacao_conselho(id_votacao) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS mensagem_interna (
  id_mensagem BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, remetente_id INT NOT NULL, destinatario_id INT NOT NULL,
  conteudo TEXT NOT NULL, enviada_em DATETIME NOT NULL, lida_em DATETIME,
  INDEX idx_mensagem_conversa (remetente_id,destinatario_id,enviada_em),
  INDEX idx_mensagem_nao_lida (remetente_id,destinatario_id,lida_em),
  CONSTRAINT fk_mensagem_remetente FOREIGN KEY (remetente_id) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_mensagem_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS presenca_usuario (
  usuario_id INT NOT NULL PRIMARY KEY, ultimo_acesso DATETIME NOT NULL,
  CONSTRAINT fk_presenca_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS mobile_token_revogado (
  jti VARCHAR(36) NOT NULL PRIMARY KEY, expira_em_epoch BIGINT NOT NULL,
  INDEX idx_token_revogado_expira (expira_em_epoch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS sessao_usuario (
  id_sessao VARCHAR(64) NOT NULL PRIMARY KEY, id_usuario INT NOT NULL, tipo VARCHAR(16) NOT NULL,
  access_jti VARCHAR(36) NULL, refresh_hash CHAR(64) NULL, criada_em DATETIME NOT NULL,
  ultimo_acesso DATETIME NOT NULL, expira_em DATETIME NOT NULL, expira_absoluta_em DATETIME NOT NULL,
  revogada_em DATETIME NULL, ip VARCHAR(45) NULL, user_agent VARCHAR(500) NULL, dispositivo VARCHAR(255) NULL,
  UNIQUE KEY uk_sessao_access_jti (access_jti), UNIQUE KEY uk_sessao_refresh_hash (refresh_hash),
  INDEX idx_sessao_usuario_ativa (id_usuario, revogada_em, expira_em),
  CONSTRAINT fk_sessao_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (Number(rows[0].total) === 0) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function migrate(pool) {
  for (const sql of statements) await pool.query(sql);
  // Complementa bases criadas por versões anteriores sem apagar nem recriar dados.
  const compatibilityColumns = {
    usuario: { criado_em: 'DATETIME NULL', status: 'TINYINT(1) DEFAULT 1', perfil: 'VARCHAR(64) NULL' },
    avaliacao: {
      titulo: 'VARCHAR(120) NULL', tipo_avaliacao: 'VARCHAR(30) NULL', unidade: 'INT NULL',
      competencias: 'TEXT NULL', pontos_fortes: 'TEXT NULL', dificuldades: 'TEXT NULL',
      intervencao_recomendada: 'TEXT NULL', plano_acao: 'TEXT NULL', data_reavaliacao: 'DATE NULL',
      atualizado_em: 'DATETIME NULL', status_acompanhamento: 'VARCHAR(30) NULL'
    },
    requerimento: { id_votacao_conselho: 'INT NULL' },
    votacao_conselho: { encerrado_em: 'DATETIME NULL' }
  };
  for (const [table, columns] of Object.entries(compatibilityColumns)) {
    for (const [column, definition] of Object.entries(columns)) await ensureColumn(pool, table, column, definition);
  }
}

module.exports = { migrate, statements };
