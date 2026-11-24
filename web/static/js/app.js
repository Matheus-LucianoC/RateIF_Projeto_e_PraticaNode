const jsonHeaders = {"Content-Type":"application/json"};
function message(id,text,type="error"){const e=document.getElementById(id);if(!e)return;e.className=`message show ${type}`;e.textContent=text;}
async function jsonRequest(url,options={}){const r=await fetch(url,{...options,headers:{...jsonHeaders,...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.mensagem||`Erro HTTP ${r.status}`);return data;}
async function logout(){try{await jsonRequest('/api/mensagens/presenca/offline',{method:'POST',body:'{}'}).catch(()=>{});const d=await jsonRequest('/auth/logout',{method:'POST',body:'{}'});location.href=d.redirect||'/login';}catch{location.href='/login';}}
let turmaState={items:[],editingId:null};
async function loadProfessors(){const select=document.getElementById('professorId');if(!select)return;try{const data=await jsonRequest('/professores');select.innerHTML='<option value="">Não definido</option>'+data.map(p=>`<option value="${p.id}">${escapeHtml(p.nome||'Professor #'+p.id)}</option>`).join('');}catch{}}
async function loadTurmas(){const list=document.getElementById('turmaList');if(!list)return;try{turmaState.items=await jsonRequest('/turmas');document.getElementById('turmaCount').textContent=turmaState.items.length;const isAdmin=document.body.dataset.admin==='true';list.innerHTML=turmaState.items.length?turmaState.items.map(t=>`<div class="list-item"><div><strong>${escapeHtml(t.nomeTurma)}</strong><small>${t.anoLetivo} · ${escapeHtml(t.turno)} · ${escapeHtml(t.professorNome)} · ${t.alunos} aluno(s)</small></div>${isAdmin?`<div class="row-actions"><button type="button" onclick="editarTurma(${t.id})">Editar</button><button type="button" class="danger" onclick="excluirTurma(${t.id})">Excluir</button></div>`:''}</div>`).join(''):'<div class="empty-state">Nenhuma turma cadastrada.</div>';}catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}}
function editarTurma(id){const t=turmaState.items.find(x=>x.id===id);if(!t)return;turmaState.editingId=id;document.getElementById('turmaFormTitle').textContent='Editar turma';document.getElementById('nomeTurma').value=t.nomeTurma||'';document.getElementById('anoLetivo').value=t.anoLetivo||new Date().getFullYear();document.getElementById('turno').value=t.turno||'Manhã';document.getElementById('professorId').value=t.professorId||'';document.getElementById('cancelTurmaEdit').classList.remove('hidden');}
function resetTurmaForm(){turmaState.editingId=null;document.getElementById('turmaFormTitle').textContent='Nova turma';document.getElementById('turmaForm').reset();document.getElementById('anoLetivo').value=new Date().getFullYear();document.getElementById('cancelTurmaEdit').classList.add('hidden');}
async function salvarTurma(e){e.preventDefault();try{const body={nomeTurma:document.getElementById('nomeTurma').value,anoLetivo:Number(document.getElementById('anoLetivo').value),turno:document.getElementById('turno').value,professorId:document.getElementById('professorId').value?Number(document.getElementById('professorId').value):null};const url=turmaState.editingId?`/turmas/${turmaState.editingId}`:'/turmas';await jsonRequest(url,{method:turmaState.editingId?'PUT':'POST',body:JSON.stringify(body)});message('turmaMessage','Turma salva com sucesso.','success');resetTurmaForm();await loadTurmas();}catch(err){message('turmaMessage',err.message);}}
async function excluirTurma(id){if(!confirm('Excluir esta turma?'))return;try{await jsonRequest(`/turmas/${id}`,{method:'DELETE'});loadTurmas();}catch(err){alert(err.message);}}
let vdcState={sessions:[],selectedId:null};
async function loadVdcTurmas(){const s=document.getElementById('vdcTurmaId');if(!s)return;try{const data=await jsonRequest('/turmas');s.innerHTML='<option value="">Selecione...</option>'+data.map(t=>`<option value="${t.id}">${escapeHtml(t.nomeTurma)} · ${t.anoLetivo}</option>`).join('');}catch(e){}}
async function loadVdc(){const list=document.getElementById('vdcSessions');if(!list)return;try{vdcState.sessions=await jsonRequest('/vdc');document.getElementById('vdcCount').textContent=vdcState.sessions.length;list.innerHTML=vdcState.sessions.length?vdcState.sessions.map(v=>`<div class="session-item ${vdcState.selectedId===v.id?'selected':''}" onclick="selectVdc(${v.id})"><div><strong>${escapeHtml(v.titulo)}</strong><small>${escapeHtml(v.turmaNome)} · ${v.anoLetivo} · ${v.alunos.length} aluno(s)</small></div><span class="status-badge ${v.status==='ABERTA'?'open':'closed'}">${v.status==='ABERTA'?'Aberta':'Encerrada'}</span></div>`).join(''):'<div class="empty-state">Nenhuma votação criada.</div>';if(vdcState.selectedId){const exists=vdcState.sessions.find(v=>v.id===vdcState.selectedId);if(exists)renderVdc(exists);}}catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}}
function renderVdc(v){document.getElementById('vdcDetailPanel').classList.remove('hidden');document.getElementById('vdcDetailTitle').textContent=v.titulo;document.getElementById('vdcDetailMeta').textContent=`${v.turmaNome} · ${v.anoLetivo}`;const st=document.getElementById('vdcStatus');st.textContent=v.status==='ABERTA'?'Aberta':'Encerrada';st.className=`status-badge ${v.status==='ABERTA'?'open':'closed'}`;const close=document.getElementById('closeVdc');close.style.display=v.status==='ABERTA'?'inline-flex':'none';close.onclick=async()=>{try{await jsonRequest(`/vdc/${v.id}/encerrar`,{method:'POST',body:'{}'});await loadVdc();}catch(e){alert(e.message);}};const box=document.getElementById('vdcStudents');box.innerHTML=v.alunos.length?v.alunos.map(a=>{const counts=`${a.aprovar}/${a.recuperacao}/${a.reter}/${a.abstencao}`;return `<div class="student-row"><div class="student-name"><strong>${escapeHtml(a.nome)}</strong><small>Matrícula ${escapeHtml(a.matricula||'-')}</small></div><div class="vote-buttons"><button class="vote-btn approve ${a.meuVoto==='APROVAR'?'active':''}" onclick="votar(${v.id},${a.id},'APROVAR')" ${v.status==='ENCERRADA'?'disabled':''}>Aprovar</button><button class="vote-btn recovery ${a.meuVoto==='RECUPERACAO'?'active':''}" onclick="votar(${v.id},${a.id},'RECUPERACAO')" ${v.status==='ENCERRADA'?'disabled':''}>Recuperação</button><button class="vote-btn retain ${a.meuVoto==='RETER'?'active':''}" onclick="votar(${v.id},${a.id},'RETER')" ${v.status==='ENCERRADA'?'disabled':''}>Reter</button><button class="vote-btn abstain ${a.meuVoto==='ABSTENCAO'?'active':''}" onclick="votar(${v.id},${a.id},'ABSTENCAO')" ${v.status==='ENCERRADA'?'disabled':''}>Abstenção</button></div><div class="result-box"><strong>${escapeHtml(a.resultado)}</strong><small>Votos A/R/Rt/Abs: ${counts}</small></div></div>`}).join(''):'<div class="empty-state">A turma não possui alunos vinculados.</div>';}
async function selectVdc(id){vdcState.selectedId=id;const v=vdcState.sessions.find(x=>x.id===id);if(v)renderVdc(v);await loadVdc();}
async function votar(vdcId,alunoId,decisao){try{const data=await jsonRequest(`/vdc/${vdcId}/votos`,{method:'POST',body:JSON.stringify({alunoId,decisao})});vdcState.sessions=vdcState.sessions.map(x=>x.id===vdcId?data:x);renderVdc(data);loadVdc();}catch(e){alert(e.message);}}
async function criarVdc(e){e.preventDefault();try{const body={turmaId:Number(document.getElementById('vdcTurmaId').value),titulo:document.getElementById('vdcTitulo').value,anoLetivo:Number(document.getElementById('vdcAno').value)};const v=await jsonRequest('/vdc',{method:'POST',body:JSON.stringify(body)});message('vdcMessage','Votação aberta com sucesso.','success');vdcState.selectedId=v.id;await loadVdc();}catch(err){message('vdcMessage',err.message);}}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

let saaState={items:[],editingId:null};
async function loadSaaBase(){
  const aluno=document.getElementById('saaAlunoId'); const professor=document.getElementById('saaProfessorId');
  if(!aluno||!professor)return;
  try{
    const [alunos,professores]=await Promise.all([jsonRequest('/alunos'),jsonRequest('/professores')]);
    const alunoOptions=alunos.map(a=>`<option value="${a.id}">${escapeHtml(a.usuario?.nome||('Aluno #'+a.id))} · ${escapeHtml(a.matricula||'-')}</option>`).join('');
    aluno.innerHTML='<option value="">Selecione...</option>'+alunoOptions;
    const filter=document.getElementById('saaFilterAluno');
    if(filter)filter.innerHTML='<option value="">Todos os alunos</option>'+alunoOptions;
    professor.innerHTML='<option value="">Selecione...</option>'+professores.map(p=>`<option value="${p.id}">${escapeHtml(p.nome||('Professor #'+p.id))}</option>`).join('');
  }catch(e){message('saaMessage',e.message);}
}
function statusSaaLabel(status){return ({EM_ACOMPANHAMENTO:'Em acompanhamento',NECESSITA_INTERVENCAO:'Necessita intervenção',CONCLUIDO:'Concluído'})[status]||'Em acompanhamento';}
function tipoSaaLabel(tipo){return ({GERAL:'Geral',DIAGNOSTICA:'Diagnóstica',FORMATIVA:'Formativa',SOMATIVA:'Somativa'})[tipo]||tipo||'Geral';}
async function loadSaa(){
  const list=document.getElementById('saaList'); if(!list)return;
  try{
    const params=new URLSearchParams();
    const alunoId=document.getElementById('saaFilterAluno')?.value;
    const status=document.getElementById('saaFilterStatus')?.value;
    const unidade=document.getElementById('saaFilterUnidade')?.value;
    const tipo=document.getElementById('saaFilterTipo')?.value;const ano=document.getElementById('saaFilterAno')?.value;
    if(alunoId)params.set('alunoId',alunoId);if(status)params.set('statusAcompanhamento',status);if(unidade)params.set('unidade',unidade);if(tipo)params.set('tipoAvaliacao',tipo);if(ano)params.set('ano',ano);
    const query=params.toString();
    saaState.items=await jsonRequest(`/saa/avaliacoes${query?'?'+query:''}`);
    const data=saaState.items;
    const summaryData=await jsonRequest(`/saa/resumo${query?'?'+query:''}`);
    document.getElementById('saaCount').textContent=data.length;
    const media=Number(summaryData.mediaGeral||0).toFixed(1).replace('.',',');
    const summary=document.getElementById('saaSummary');
    if(summary)summary.innerHTML=`<div><small>Média do filtro</small><strong>${media}</strong></div><div><small>Registros</small><strong>${summaryData.total||0}</strong></div><div><small>Com intervenção</small><strong>${summaryData.necessitaIntervencao||0}</strong></div><div><small>Reavaliações pendentes</small><strong>${summaryData.reavaliacoesPendentes||0}</strong></div>${(summaryData.porUnidade||[]).map(u=>`<div><small>${u.unidade}ª unidade · ${u.quantidade} registro(s)</small><strong>${u.media==null?'—':Number(u.media).toFixed(1).replace('.',',')}</strong></div>`).join('')}`;
    const canEdit=['ADMIN','COORDENACAO','PROFESSOR'].includes(String(document.body.dataset.perfil||'').toUpperCase());
    list.innerHTML=data.length?data.map(a=>`<div class="list-item saa-record"><div class="saa-record-main"><strong>${escapeHtml(a.titulo||'Avaliação pedagógica')} · ${escapeHtml(a.alunoNome)}</strong><small>Nota ${Number(a.nota).toFixed(1)} · ${escapeHtml(a.professorNome)} · ${a.dataAvaliacao?new Date(a.dataAvaliacao).toLocaleDateString('pt-BR'):''}</small><small>${escapeHtml(tipoSaaLabel(a.tipoAvaliacao))}${a.unidade?' · '+a.unidade+'ª unidade':''} · ${escapeHtml(statusSaaLabel(a.statusAcompanhamento))}</small>${a.competencias?`<small><b>Competências:</b> ${escapeHtml(a.competencias)}</small>`:''}${a.pontosFortes?`<small><b>Pontos fortes:</b> ${escapeHtml(a.pontosFortes)}</small>`:''}${a.dificuldades?`<small><b>Dificuldades:</b> ${escapeHtml(a.dificuldades)}</small>`:''}${a.comentario?`<small><b>Comentário:</b> ${escapeHtml(a.comentario)}</small>`:''}${a.intervencaoRecomendada?`<small><b>Intervenção:</b> ${escapeHtml(a.intervencaoRecomendada)}</small>`:''}${a.planoAcao?`<small><b>Plano de ação:</b> ${escapeHtml(a.planoAcao)}</small>`:''}${a.dataReavaliacao?`<small><b>Reavaliar em:</b> ${new Date(a.dataReavaliacao).toLocaleDateString('pt-BR')}</small>`:''}</div><div class="saa-record-actions"><span class="status-badge ${a.statusAcompanhamento==='NECESSITA_INTERVENCAO'?'closed':'open'}">${Number(a.nota).toFixed(1)}</span>${canEdit?`<button type="button" onclick="editarSaa(${a.id})">Editar</button>`:''}</div></div>`).join(''):'<div class="empty-state">Nenhuma avaliação para este filtro.</div>';
  }catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
function editarSaa(id){
  const a=saaState.items.find(x=>Number(x.id)===Number(id));if(!a)return;
  saaState.editingId=id;
  document.getElementById('saaFormTitle').textContent='Editar avaliação';
  document.getElementById('saaSaveButton').textContent='Salvar alterações';
  document.getElementById('saaCancelEdit').classList.remove('hidden');
  for(const [id,value] of Object.entries({saaAlunoId:a.alunoId,saaProfessorId:a.professorId,saaTitulo:a.titulo||'',saaTipo:a.tipoAvaliacao||'GERAL',saaUnidade:a.unidade||'',saaNota:a.nota,saaCompetencias:a.competencias||'',saaComentario:a.comentario||'',saaPontosFortes:a.pontosFortes||'',saaDificuldades:a.dificuldades||'',saaIntervencao:a.intervencaoRecomendada||'',saaPlanoAcao:a.planoAcao||'',saaDataReavaliacao:a.dataReavaliacao?String(a.dataReavaliacao).slice(0,10):'',saaStatus:a.statusAcompanhamento||'EM_ACOMPANHAMENTO'})){const el=document.getElementById(id);if(el)el.value=value;}
  document.getElementById('saaFormTitle').scrollIntoView({behavior:'smooth',block:'center'});
}
function cancelarEdicaoSaa(){saaState.editingId=null;document.getElementById('saaForm').reset();document.getElementById('saaFormTitle').textContent='Lançar avaliação';document.getElementById('saaSaveButton').textContent='Registrar avaliação';document.getElementById('saaCancelEdit').classList.add('hidden');}
async function salvarSaa(e){
  e.preventDefault();
  try{
    const unidade=document.getElementById('saaUnidade').value;
    const body={alunoId:Number(document.getElementById('saaAlunoId').value),professorId:Number(document.getElementById('saaProfessorId').value),nota:Number(document.getElementById('saaNota').value),comentario:document.getElementById('saaComentario').value,titulo:document.getElementById('saaTitulo').value,tipoAvaliacao:document.getElementById('saaTipo').value,unidade:unidade?Number(unidade):null,competencias:document.getElementById('saaCompetencias').value,pontosFortes:document.getElementById('saaPontosFortes').value,dificuldades:document.getElementById('saaDificuldades').value,intervencaoRecomendada:document.getElementById('saaIntervencao').value,planoAcao:document.getElementById('saaPlanoAcao').value,dataReavaliacao:document.getElementById('saaDataReavaliacao').value||null,statusAcompanhamento:document.getElementById('saaStatus').value};
    const editing=Boolean(saaState.editingId);
    await jsonRequest(editing?`/saa/avaliacoes/${saaState.editingId}`:'/saa/avaliacoes',{method:editing?'PUT':'POST',body:JSON.stringify(body)});
    message('saaMessage',editing?'Avaliação atualizada com sucesso.':'Avaliação registrada com sucesso.','success');cancelarEdicaoSaa();await loadSaa();
  }catch(e){message('saaMessage',e.message);}
}

let adminState={users:[],emails:[],sessions:[]};
const perfilLabels={ADMIN:'Administrador',COORDENACAO:'Coordenação',ALUNO:'Aluno',PROFESSOR:'Professor',TECNICO:'Técnico',RESPONSAVEL:'Responsável',USUARIO:'Usuário padrão'};
const roleOptions=[['USUARIO','Usuário'],['ALUNO','Aluno'],['PROFESSOR','Professor'],['COORDENACAO','Coordenação'],['TECNICO','Técnico'],['RESPONSAVEL','Responsável'],['ADMIN','Administrador']];
function formatSessionDate(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');}
async function loadAdminOverview(){
  const box=document.getElementById('adminOverview');if(!box)return;
  try{const d=await jsonRequest('/api/admin/overview');const pairs=[['Alunos',d.alunos],['Turmas',d.turmas],['Avaliações',d.avaliacoes],['Relatórios',d.relatorios],['Votações abertas',d.votacoesAbertas],['Requerimentos',d.requerimentos],['Sessões ativas',d.sessoesAtivas],['Convites pendentes',d.convitesPendentes]];box.innerHTML=pairs.map(([label,value])=>`<article class="admin-overview-card"><small>${escapeHtml(label)}</small><strong>${Number(value||0)}</strong></article>`).join('');}
  catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function loadAdminUsers(){
  const list=document.getElementById('adminUserList');if(!list)return;list.innerHTML='<div class="empty-state">Carregando contas...</div>';
  try{adminState.users=await jsonRequest('/api/admin/usuarios');renderAdminUsers();}
  catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;message('adminMessage',e.message);}
}
function renderAdminUsers(){
  const list=document.getElementById('adminUserList');if(!list)return;
  const q=(document.getElementById('adminSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const visible=adminState.users.filter(u=>`${u.nome||''} ${u.email||''}`.toLocaleLowerCase('pt-BR').includes(q));
  const total=document.getElementById('adminTotal'),active=document.getElementById('adminActive'),admins=document.getElementById('adminAdmins');
  if(total)total.textContent=adminState.users.length;if(active)active.textContent=adminState.users.filter(u=>u.status).length;if(admins)admins.textContent=adminState.users.filter(u=>u.perfil==='ADMIN'&&u.status).length;
  list.innerHTML=visible.length?visible.map(u=>`<article class="admin-user-card"><div class="admin-user-identity"><span class="admin-avatar">${escapeHtml((u.nome||'?').trim().charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(u.nome)}</strong><small>${escapeHtml(u.email)}</small><small>Criado em ${u.criadoEm?new Date(u.criadoEm).toLocaleDateString('pt-BR'):'data não informada'}</small></div></div><div class="admin-user-controls admin-user-edit"><label>Nome<input id="adminNome-${u.id}" value="${escapeHtml(u.nome||'')}" maxlength="255"></label><label>E-mail<input id="adminEmail-${u.id}" type="email" value="${escapeHtml(u.email||'')}" maxlength="254"></label><label>Perfil<select id="adminPerfil-${u.id}">${roleOptions.map(([v,l])=>`<option value="${v}" ${u.perfil===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Nova senha<input id="adminSenha-${u.id}" type="password" minlength="12" autocomplete="new-password" placeholder="Manter atual"></label><label class="admin-check"><input id="adminStatus-${u.id}" type="checkbox" ${u.status?'checked':''}> Conta ativa</label><button class="btn primary" type="button" onclick="salvarAdminUsuario(${u.id})">Salvar alterações</button></div></article>`).join(''):'<div class="empty-state">Nenhuma conta corresponde à pesquisa.</div>';
}
async function salvarAdminUsuario(id){
  const body={nome:document.getElementById(`adminNome-${id}`)?.value,email:document.getElementById(`adminEmail-${id}`)?.value,perfil:document.getElementById(`adminPerfil-${id}`)?.value,status:document.getElementById(`adminStatus-${id}`)?.checked};
  const senha=document.getElementById(`adminSenha-${id}`)?.value;if(senha)body.senha=senha;
  try{await jsonRequest(`/api/admin/usuarios/${id}`,{method:'PATCH',body:JSON.stringify(body)});if(senha&&Number(document.body.dataset.userId)===Number(id)){alert('Sua senha foi alterada. Entre novamente com a nova senha.');location.href='/login';return;}message('adminMessage','Dados e permissões atualizados. Sessões do usuário foram encerradas caso senha ou status tenham sido alterados.','success');await Promise.all([loadAdminUsers(),loadAdminOverview(),loadAdminSessions()]);}
  catch(e){message('adminMessage',e.message);}
}
async function criarAdminUsuario(event){
  event.preventDefault();const body={nome:document.getElementById('adminNewName').value,email:document.getElementById('adminNewEmail').value,senha:document.getElementById('adminNewPassword').value,perfil:document.getElementById('adminNewRole').value,status:true};
  try{const created=await jsonRequest('/api/admin/usuarios',{method:'POST',body:JSON.stringify(body)});message('adminCreateMessage',`Conta ${created.nome||body.nome} criada com sucesso.`,'success');event.target.reset();document.getElementById('adminNewRole').value='USUARIO';await Promise.all([loadAdminUsers(),loadAdminOverview()]);}
  catch(e){message('adminCreateMessage',e.message);}
}
async function loadAdminSessions(){
  const list=document.getElementById('adminSessionList');if(!list)return;list.innerHTML='<div class="empty-state">Carregando sessões...</div>';
  try{adminState.sessions=await jsonRequest('/api/admin/sessoes');list.innerHTML=adminState.sessions.length?adminState.sessions.map(s=>`<article class="session-item"><div><strong>${escapeHtml(s.usuarioNome||'Usuário')} · ${escapeHtml(s.dispositivo||s.tipo)} ${s.atual?'<span class="status-badge open">Esta sessão</span>':''}</strong><small>${escapeHtml(s.usuarioEmail||'')} · ${escapeHtml(perfilLabels[s.perfil]||s.perfil||'')}</small><small>${s.tipo==='MOBILE'?'Aplicativo mobile':'Navegador web'} · IP ${escapeHtml(s.ip||'não identificado')}</small><small>Último acesso: ${formatSessionDate(s.ultimoAcesso)} · Expira: ${formatSessionDate(s.expiraEm)}</small></div><div class="row-actions"><button class="danger" type="button" onclick="revogarAdminSessao('${s.id}',${s.atual?'true':'false'})">Encerrar sessão</button></div></article>`).join(''):'<div class="empty-state">Não há sessões ativas.</div>';}
  catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function revogarAdminSessao(id,current=false){if(!confirm(current?'Encerrar sua sessão atual? Você será desconectado.':'Encerrar esta sessão imediatamente?'))return;try{await jsonRequest(`/api/admin/sessoes/${encodeURIComponent(id)}`,{method:'DELETE'});if(current){location.href='/login';return;}message('adminSessionMessage','Sessão revogada.','success');await Promise.all([loadAdminSessions(),loadAdminOverview()]);}catch(e){message('adminSessionMessage',e.message);}}
async function loadAdminEmailsPerfil(){
  const list=document.getElementById('adminEmailPerfilList');if(!list)return;list.innerHTML='<div class="empty-state">Carregando pré-cadastros...</div>';
  try{adminState.emails=await jsonRequest('/api/admin/emails-perfil');renderAdminEmailsPerfil();}
  catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;message('adminEmailPerfilMessage',e.message);}
}
function renderAdminEmailsPerfil(){
  const list=document.getElementById('adminEmailPerfilList');if(!list)return;
  list.innerHTML=adminState.emails.length?adminState.emails.map(item=>`<article class="admin-user-card"><div class="admin-user-identity"><span class="admin-avatar">@</span><div><strong>${escapeHtml(item.email)}</strong><small>Perfil a atribuir: ${escapeHtml(perfilLabels[item.perfil]||item.perfil)}</small><small>Convite ainda não utilizado</small></div></div><div class="admin-user-controls admin-invite-actions"><button type="button" class="btn danger" onclick="removerEmailPerfil(${item.id})">Remover pré-cadastro</button></div></article>`).join(''):'<div class="empty-state">Nenhum e-mail pré-cadastrado. Adicione um e-mail institucional acima.</div>';
}
async function salvarEmailPerfil(event){
  event.preventDefault();const email=document.getElementById('adminEmailPermitido').value.trim();const perfil=document.getElementById('adminPerfilPermitido').value;
  try{await jsonRequest('/api/admin/emails-perfil',{method:'POST',body:JSON.stringify({email,perfil})});message('adminEmailPerfilMessage','E-mail pré-cadastrado. O perfil será aplicado no cadastro dessa conta.','success');event.target.reset();document.getElementById('adminPerfilPermitido').value='ALUNO';await loadAdminEmailsPerfil();}
  catch(e){message('adminEmailPerfilMessage',e.message);}
}
async function removerEmailPerfil(id){
  if(!confirm('Remover este pré-cadastro?'))return;
  try{await jsonRequest(`/api/admin/emails-perfil/${id}`,{method:'DELETE'});message('adminEmailPerfilMessage','Pré-cadastro removido.','success');await loadAdminEmailsPerfil();}
  catch(e){message('adminEmailPerfilMessage',e.message);}
}
async function carregarPerfilWeb(){
  const form=document.getElementById('perfilForm');if(!form)return;
  try{const usuario=await jsonRequest('/api/perfil');document.getElementById('perfilNome').value=usuario.nome||'';document.getElementById('perfilEmail').value=usuario.email||'';document.getElementById('perfilRole').value=perfilLabels[usuario.perfil]||usuario.perfil||'Usuário';}
  catch(e){message('perfilMessage',e.message);}
}
async function salvarPerfilWeb(event){
  event.preventDefault();
  try{const body={nome:document.getElementById('perfilNome').value,email:document.getElementById('perfilEmail').value};await jsonRequest('/api/perfil',{method:'PUT',body:JSON.stringify(body)});message('perfilMessage','Perfil atualizado com sucesso.','success');document.querySelectorAll('.profile-chip strong').forEach(e=>e.textContent=body.nome.trim());}
  catch(e){message('perfilMessage',e.message);}
}
async function loadMySessions(){
  const list=document.getElementById('mySessionList');if(!list)return;list.innerHTML='<div class="empty-state">Carregando sessões...</div>';
  try{const sessions=await jsonRequest('/api/sessoes');list.innerHTML=sessions.length?sessions.map(s=>`<article class="session-item"><div><strong>${escapeHtml(s.dispositivo||s.tipo)} ${s.atual?'<span class="status-badge open">Esta sessão</span>':''}</strong><small>${s.tipo==='MOBILE'?'Aplicativo mobile':'Navegador web'} · IP ${escapeHtml(s.ip||'não identificado')}</small><small>Último acesso: ${formatSessionDate(s.ultimoAcesso)}</small><small>Expira: ${formatSessionDate(s.expiraEm)}</small></div><div class="row-actions"><button type="button" class="danger" onclick="revogarMinhaSessao('${s.id}',${s.atual?'true':'false'})">Encerrar</button></div></article>`).join(''):'<div class="empty-state">Nenhuma sessão ativa encontrada.</div>';}
  catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function revogarMinhaSessao(id,current){if(!confirm(current?'Encerrar esta sessão? Você será desconectado.':'Encerrar esta sessão deste dispositivo?'))return;try{await jsonRequest(`/api/sessoes/${encodeURIComponent(id)}`,{method:'DELETE'});message('mySessionMessage','Sessão encerrada.','success');if(current){location.href='/login';return;}await loadMySessions();}catch(e){message('mySessionMessage',e.message);}}

let reqState={vdc:[]};
async function loadRequerimentosBase(){
  const aluno=document.getElementById('reqAlunoId'); const vdc=document.getElementById('reqVdcId'); if(!aluno||!vdc)return;
  try{
    const [alunos,vdcs]=await Promise.all([jsonRequest('/alunos'),jsonRequest('/vdc')]); reqState.vdc=vdcs;
    aluno.innerHTML='<option value="">Selecione...</option>'+alunos.map(a=>`<option value="${a.id}">${escapeHtml(a.usuario?.nome||('Aluno #'+a.id))} · ${escapeHtml(a.matricula||'-')}</option>`).join('');
    vdc.innerHTML='<option value="">Não vincular agora</option>'+vdcs.filter(v=>v.status==='ABERTA').map(v=>`<option value="${v.id}">${escapeHtml(v.turmaNome)} · ${escapeHtml(v.titulo)} · Aberta</option>`).join('');
  }catch(e){message('requerimentoMessage',e.message);}
}
function reqStatusLabel(status){return ({ABERTO:'Aberto',EM_ANALISE:'Em análise',ENCAMINHADO_VDC:'Encaminhado ao VdC',CONCLUIDO:'Concluído'})[status]||status;}
async function loadRequerimentos(){
  const list=document.getElementById('requerimentoList'); if(!list)return;
  try{
    const data=await jsonRequest('/api/requerimentos');document.getElementById('reqCount').textContent=data.length;
    list.innerHTML=data.length?data.map(r=>`<div class="list-item"><div><strong>${escapeHtml(r.tipo)} · ${escapeHtml(r.alunoNome)}</strong><small>${escapeHtml(r.turmaNome)} · ${escapeHtml(r.descricao)}</small>${r.vdcTitulo?`<small>VdC: ${escapeHtml(r.vdcTitulo)}</small>`:''}</div><div class="row-actions"><span class="status-badge ${r.status==='CONCLUIDO'?'open':r.status==='ENCAMINHADO_VDC'?'open':'closed'}">${escapeHtml(reqStatusLabel(r.status))}</span>${r.status!=='CONCLUIDO'?`<select onchange="alterarStatusRequerimento(${r.id},this.value)" aria-label="Status"><option value="">Status</option><option value="ABERTO">Aberto</option><option value="EM_ANALISE">Em análise</option><option value="CONCLUIDO">Concluído</option></select>`:''}</div></div>`).join(''):'<div class="empty-state">Nenhum requerimento registrado.</div>';
  }catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function salvarRequerimento(e){
  e.preventDefault();
  try{
    const vdcId=document.getElementById('reqVdcId').value; const body={alunoId:Number(document.getElementById('reqAlunoId').value),tipo:document.getElementById('reqTipo').value,descricao:document.getElementById('reqDescricao').value,vdcId:vdcId?Number(vdcId):null};
    await jsonRequest('/api/requerimentos',{method:'POST',body:JSON.stringify(body)});message('requerimentoMessage','Requerimento enviado com sucesso.','success');e.target.reset();await loadRequerimentos();
  }catch(e){message('requerimentoMessage',e.message);}
}
async function alterarStatusRequerimento(id,status){if(!status)return;try{await jsonRequest(`/api/requerimentos/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});await loadRequerimentos();}catch(e){alert(e.message);await loadRequerimentos();}}

const messageState={contacts:[],selectedId:null,items:[],lastUnread:0};
function formatMessageTime(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
let globalUnreadCount=0;
async function refreshGlobalMessagesBadge(){
  const badges=[...document.querySelectorAll('[data-unread-badge]')];if(!badges.length)return;
  try{const contacts=await jsonRequest('/api/mensagens/contatos');const total=contacts.reduce((sum,c)=>sum+Number(c.naoLidas||0),0);badges.forEach(b=>{b.textContent=total>99?'99+':String(total);b.classList.toggle('hidden',total===0)});if(total>globalUnreadCount&&globalUnreadCount>=0&&'Notification'in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){const contact=contacts.find(c=>Number(c.naoLidas)>0);if(contact)new Notification('RateIF · nova mensagem',{body:`Mensagem não lida de ${contact.nome}`});}globalUnreadCount=total;}catch{}
}
async function startPresence(){
  const perfil=String(document.body.dataset.perfil||'').toUpperCase();
  if(!['ADMIN','COORDENACAO','PROFESSOR'].includes(perfil))return;
  const ping=()=>jsonRequest('/api/mensagens/presenca',{method:'POST',body:'{}'}).catch(()=>{});
  await ping();
  window.__rateIfPresenceTimer=setInterval(ping,25000);
  refreshGlobalMessagesBadge();
  window.__rateIfGlobalUnreadTimer=setInterval(refreshGlobalMessagesBadge,15000);
}
function renderMessageContacts(){
  const list=document.getElementById('messagesContactList');if(!list)return;
  const contacts=messageState.contacts;
  if(!contacts.length){list.innerHTML='<div class="empty-state">Nenhum contato disponível para o seu perfil.</div>';return;}
  list.innerHTML=contacts.map(c=>`<button type="button" class="message-contact ${Number(c.id)===Number(messageState.selectedId)?'selected':''}" onclick="selectMessageContact(${Number(c.id)})"><span class="presence-dot ${c.online?'online':'offline'}"></span><span class="message-contact-copy"><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.perfil==='ADMIN'?'ADM':c.perfil==='COORDENACAO'?'Coordenação':'Professor')} · ${c.online?'Online':'Offline'}</small></span>${Number(c.naoLidas)>0?`<span class="message-unread">${Number(c.naoLidas)}</span>`:''}</button>`).join('');
  const total=contacts.reduce((sum,c)=>sum+Number(c.naoLidas||0),0);const nav=document.getElementById('navUnread');if(nav){nav.textContent=total>99?'99+':String(total);nav.classList.toggle('hidden',total===0);}
  messageState.lastUnread=total;
  const current=contacts.find(c=>Number(c.id)===Number(messageState.selectedId));if(current){document.getElementById('threadPresence').textContent=current.online?'● Online agora':'○ Offline';document.getElementById('threadUnread').textContent=current.naoLidas||0;document.getElementById('threadUnread').classList.toggle('hidden',!Number(current.naoLidas));}
}
async function loadMessageContacts(){
  const list=document.getElementById('messagesContactList');if(!list)return;
  try{await jsonRequest('/api/mensagens/presenca',{method:'POST',body:'{}'});messageState.contacts=await jsonRequest('/api/mensagens/contatos');renderMessageContacts();if(messageState.selectedId&&!messageState.contacts.some(c=>Number(c.id)===Number(messageState.selectedId))){messageState.selectedId=null;showMessageEmpty();}}
  catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
function showMessageEmpty(){document.getElementById('messagesThreadEmpty')?.classList.remove('hidden');document.getElementById('messagesThread')?.classList.add('hidden');}
async function selectMessageContact(id){messageState.selectedId=Number(id);document.getElementById('messagesThreadEmpty').classList.add('hidden');document.getElementById('messagesThread').classList.remove('hidden');const contact=messageState.contacts.find(c=>Number(c.id)===Number(id));document.getElementById('threadName').textContent=contact?.nome||'Contato';document.getElementById('threadAvatar').textContent=(contact?.nome||'?').trim().charAt(0).toUpperCase();renderMessageContacts();await loadMessageConversation();}
async function loadMessageConversation(){
  if(!messageState.selectedId)return;const box=document.getElementById('messagesList');if(!box)return;
  try{messageState.items=await jsonRequest(`/api/mensagens/conversa/${messageState.selectedId}`);box.innerHTML=messageState.items.length?messageState.items.map(m=>`<article class="message-bubble ${m.minha?'mine':'theirs'}"><p>${escapeHtml(m.conteudo).replace(/\n/g,'<br>')}</p><small>${escapeHtml(formatMessageTime(m.enviadaEm))}${m.minha&&m.lidaEm?' · Lida':''}</small></article>`).join(''):'<div class="empty-state">Esta conversa ainda não tem mensagens.</div>';box.scrollTop=box.scrollHeight;await loadMessageContacts();}
  catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function sendMessage(event){event.preventDefault();if(!messageState.selectedId)return;const input=document.getElementById('messageComposeInput');const text=input.value.trim();if(!text)return;const button=event.submitter; if(button)button.disabled=true;try{await jsonRequest('/api/mensagens',{method:'POST',body:JSON.stringify({destinatarioId:messageState.selectedId,conteudo:text})});input.value='';message('messageFeedback','Mensagem enviada.','success');await loadMessageConversation();}catch(e){message('messageFeedback',e.message);}finally{if(button)button.disabled=false;}}
function initMessages(){
  const list=document.getElementById('messagesContactList');if(!list)return;
  loadMessageContacts();
  if('Notification'in window){const hint=document.createElement('button');hint.type='button';hint.className='btn outline';hint.textContent='Ativar notificações do navegador';hint.addEventListener('click',async()=>{try{const permission=await Notification.requestPermission();hint.textContent=permission==='granted'?'Notificações ativadas':'Notificações não autorizadas';}catch{hint.textContent='Notificações indisponíveis';}});document.querySelector('.messages-contact-panel .panel-heading')?.appendChild(hint);}
  document.getElementById('messageComposeForm')?.addEventListener('submit',sendMessage);
  window.__rateIfMessageContactsTimer=setInterval(loadMessageContacts,12000);
  window.__rateIfMessageThreadTimer=setInterval(()=>{if(messageState.selectedId)loadMessageConversation();},5000);
  window.addEventListener('pagehide',()=>{if(window.__rateIfPresenceTimer)clearInterval(window.__rateIfPresenceTimer);if(window.__rateIfGlobalUnreadTimer)clearInterval(window.__rateIfGlobalUnreadTimer);if(window.__rateIfMessageContactsTimer)clearInterval(window.__rateIfMessageContactsTimer);if(window.__rateIfMessageThreadTimer)clearInterval(window.__rateIfMessageThreadTimer);});
}

function init(){
  const page=document.body.dataset.page;
  startPresence();
  if(page==='mensagens')initMessages();
  if(page==='turmas'){loadProfessors();loadTurmas();const form=document.getElementById('turmaForm');if(form)form.addEventListener('submit',salvarTurma);const cancel=document.getElementById('cancelTurmaEdit');if(cancel)cancel.addEventListener('click',resetTurmaForm);}
  if(page==='vdc'){loadVdcTurmas();loadVdc();document.getElementById('vdcForm').addEventListener('submit',criarVdc);}
  if(page==='saa'){loadSaaBase();loadSaa();document.getElementById('saaForm')?.addEventListener('submit',salvarSaa);document.getElementById('saaCancelEdit')?.addEventListener('click',cancelarEdicaoSaa);['saaFilterAluno','saaFilterStatus','saaFilterUnidade','saaFilterTipo','saaFilterAno'].forEach(id=>document.getElementById(id)?.addEventListener('change',loadSaa));}
  if(page==='admin'){loadAdminOverview();loadAdminUsers();loadAdminSessions();loadAdminEmailsPerfil();document.getElementById('adminSearch')?.addEventListener('input',renderAdminUsers);document.getElementById('adminEmailPerfilForm')?.addEventListener('submit',salvarEmailPerfil);document.getElementById('adminCreateUserForm')?.addEventListener('submit',criarAdminUsuario);}
  if(page==='perfil'){carregarPerfilWeb();loadMySessions();document.getElementById('perfilForm')?.addEventListener('submit',salvarPerfilWeb);}
  if(page==='requerimentos'){loadRequerimentosBase();loadRequerimentos();document.getElementById('requerimentoForm').addEventListener('submit',salvarRequerimento);}
}

document.addEventListener('DOMContentLoaded',init);
