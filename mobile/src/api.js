const configuredApiUrl = String(process.env.EXPO_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
const API_URL = configuredApiUrl || (__DEV__ ? "http://192.168.0.101:8080" : "");

let tokenRefreshHandler = null;
export function setTokenRefreshHandler(handler) { tokenRefreshHandler = handler; }

async function request(path, options = {}, allowRefresh = true) {
  if (!API_URL) throw new Error("A URL do backend não foi configurada. Defina EXPO_PUBLIC_API_URL no ambiente EAS ou no arquivo .env local.");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { mensagem: "O servidor retornou uma resposta inválida." }; } }
  if (!response.ok && response.status === 401 && allowRefresh && headers.Authorization && tokenRefreshHandler) {
    try {
      const nextToken = await tokenRefreshHandler();
      if (nextToken) {
        return request(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${nextToken}` } }, false);
      }
    } catch { /* O contexto de autenticação encerrará a sessão quando a renovação falhar. */ }
  }
  if (!response.ok) { const error = new Error(data.mensagem || `Erro HTTP ${response.status}`); error.status = response.status; throw error; }
  return data;
}
export const mobileApi = {
  get baseUrl() { return API_URL; },
  login(email, senha) { return request("/api/mobile/auth/login", { method:"POST", body:JSON.stringify({email,senha}) }); },
  refresh(refreshToken) { return request("/api/mobile/auth/refresh", { method:"POST", body:JSON.stringify({refreshToken}) }, false); },
  cadastro(nome,email,senha,confirmarSenha) { return request("/api/mobile/auth/cadastro", { method:"POST", body:JSON.stringify({nome,email,senha,confirmarSenha}) }); },
  logout(token, refreshToken) { return request("/api/mobile/auth/logout", { method:"POST", headers:token?{Authorization:`Bearer ${token}`}:{}, body:JSON.stringify({refreshToken}), }, false); },
  perfil(token) { return request("/api/mobile/profile", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  atualizarPerfil(token,nome,email) { return request("/api/mobile/profile", { method:"PUT", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify({nome,email}) }); },
  dashboard(token) { return request("/api/mobile/dashboard", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  turmas(token) { return request("/api/mobile/turmas", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  criarTurma(token,body) { return request("/api/mobile/turmas", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  atualizarTurma(token,id,body) { return request(`/api/mobile/turmas/${id}`, { method:"PUT", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  excluirTurma(token,id) { return request(`/api/mobile/turmas/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} }); },
  professores(token) { return request("/api/mobile/professores", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  alunos(token) { return request("/api/mobile/alunos", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  vdc(token) { return request("/api/mobile/vdc", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  criarVdc(token,body) { return request("/api/mobile/vdc", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  votarVdc(token,id,body) { return request(`/api/mobile/vdc/${id}/votos`, { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  encerrarVdc(token,id) { return request(`/api/mobile/vdc/${id}/encerrar`, { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:"{}" }); },
  saaAvaliacoes(token, filters = {}) { const q = new URLSearchParams(Object.entries(filters).filter(([,v])=>v!=null&&v!=="")).toString(); return request(`/api/mobile/saa/avaliacoes${q?`?${q}`:""}`, { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  saaResumo(token, filters = {}) { const q = new URLSearchParams(Object.entries(filters).filter(([,v])=>v!=null&&v!=="")).toString(); return request(`/api/mobile/saa/resumo${q?`?${q}`:""}`, { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  criarSaaAvaliacao(token,body) { return request("/api/mobile/saa/avaliacoes", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  atualizarSaaAvaliacao(token,id,body) { return request(`/api/mobile/saa/avaliacoes/${id}`, { method:"PUT", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  adminUsuarios(token) { return request("/api/mobile/admin/usuarios", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  adminOverview(token) { return request("/api/mobile/admin/overview", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  criarAdminUsuario(token,body) { return request("/api/mobile/admin/usuarios", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  adminSessoes(token) { return request("/api/mobile/admin/sessoes", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  revogarAdminSessao(token,id) { return request(`/api/mobile/admin/sessoes/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} }); },
  atualizarAdminUsuario(token,id,body) { return request(`/api/mobile/admin/usuarios/${id}`, { method:"PATCH", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  sessoes(token) { return request("/api/mobile/sessoes", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  revogarSessao(token,id) { return request(`/api/mobile/sessoes/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} }); },
  adminEmailsPerfil(token) { return request("/api/mobile/admin/emails-perfil", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  definirAdminEmailPerfil(token,body) { return request("/api/mobile/admin/emails-perfil", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  removerAdminEmailPerfil(token,id) { return request(`/api/mobile/admin/emails-perfil/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} }); },
  requerimentos(token) { return request("/api/mobile/requerimentos", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  criarRequerimento(token,body) { return request("/api/mobile/requerimentos", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(body) }); },
  atualizarRequerimentoStatus(token,id,status) { return request(`/api/mobile/requerimentos/${id}/status`, { method:"PATCH", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify({status}) }); },
  encaminharRequerimentoVdc(token,id,vdcId) { return request(`/api/mobile/requerimentos/${id}/vdc/${vdcId}`, { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:"{}" }); },
  mensagensPresenca(token) { return request("/api/mobile/mensagens/presenca", { method:"POST", headers:{Authorization:`Bearer ${token}`} }); },
  mensagensOffline(token) { return request("/api/mobile/mensagens/presenca/offline", { method:"POST", headers:{Authorization:`Bearer ${token}`} }); },
  mensagensContatos(token) { return request("/api/mobile/mensagens/contatos", { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  mensagensConversa(token,contatoId) { return request(`/api/mobile/mensagens/conversa/${contatoId}`, { method:"GET", headers:{Authorization:`Bearer ${token}`} }); },
  enviarMensagem(token,destinatarioId,conteudo) { return request("/api/mobile/mensagens", { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify({destinatarioId,conteudo}) }); }
};
