const configuredApiUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

module.exports = ({ config }) => {
  if (configuredApiUrl) {
    let parsed;
    try { parsed = new URL(configuredApiUrl); }
    catch { throw new Error('EXPO_PUBLIC_API_URL precisa ser uma URL absoluta, por exemplo https://api.seu-dominio.br.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('EXPO_PUBLIC_API_URL deve usar HTTP ou HTTPS.');
    }
  }
  return {
    ...config,
    extra: { ...(config.extra || {}), apiUrl: configuredApiUrl }
  };
};
