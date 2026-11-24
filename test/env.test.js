'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvFile } = require('../backend/env');

test('carrega .env sem sobrescrever variáveis já definidas', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rateif-env-'));
  const file = path.join(dir, '.env');
  const target = { KEEP_ME: 'sistema' };
  fs.writeFileSync(file, '# comentário\nKEEP_ME=arquivo\nNEW_VALUE="valor de teste"\nNUMBER=8080 # porta\n', 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  loadEnvFile(file, target);
  assert.equal(target.KEEP_ME, 'sistema');
  assert.equal(target.NEW_VALUE, 'valor de teste');
  assert.equal(target.NUMBER, '8080');
});
