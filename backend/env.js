'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath = path.join(__dirname, '..', '.env'), target = process.env) {
  if (!fs.existsSync(filePath)) return target;
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(target, match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    target[match[1]] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  return target;
}

module.exports = { loadEnvFile };
