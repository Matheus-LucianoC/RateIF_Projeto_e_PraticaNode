const profile = String(process.env.EAS_BUILD_PROFILE || '').toLowerCase();
const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
const hostedProfiles = new Set(['preview', 'preview-apk', 'production']);

if (!hostedProfiles.has(profile)) {
  console.log(`Validação da API ignorada para perfil local/desenvolvimento (${profile || 'não informado'}).`);
  process.exit(0);
}

if (!apiUrl) {
  console.error('ERRO: defina EXPO_PUBLIC_API_URL no ambiente EAS associado ao perfil ' + profile + '.');
  console.error('Use a URL pública real do backend RateIF. Não use localhost nem um IP privado em preview/production.');
  process.exit(1);
}

let parsed;
try { parsed = new URL(apiUrl); }
catch {
  console.error('ERRO: EXPO_PUBLIC_API_URL precisa ser uma URL absoluta.');
  process.exit(1);
}
if (parsed.protocol !== 'https:') {
  console.error('ERRO: preview/production exigem HTTPS na URL pública do backend.');
  process.exit(1);
}
if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(parsed.hostname)) {
  console.error('ERRO: o backend configurado parece estar em uma rede local e não é acessível por usuários externos.');
  process.exit(1);
}
console.log(`URL da API validada para o perfil ${profile}: ${parsed.origin}`);
