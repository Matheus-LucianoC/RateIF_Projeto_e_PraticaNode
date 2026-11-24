import React,{useCallback,useEffect,useState}from'react';
import{Alert,Pressable,ScrollView,StyleSheet,Text,View}from'react-native';
import{Input}from'../components/Input';
import{PrimaryButton}from'../components/PrimaryButton';
import{TopBar}from'../components/TopBar';
import{useAuth}from'../context/AuthContext';
import{mobileApi}from'../api';
import{COLORS}from'../theme';

const PERFIS=[
  {value:'USUARIO',label:'Usuário padrão'},
  {value:'COORDENACAO',label:'Coordenação'},
  {value:'ALUNO',label:'Aluno'},
  {value:'PROFESSOR',label:'Professor'},
  {value:'TECNICO',label:'Técnico'},
  {value:'RESPONSAVEL',label:'Responsável'},
  {value:'ADMIN',label:'Administrador'}
];
const rotuloPerfil=perfil=>PERFIS.find(p=>p.value===perfil)?.label||perfil||'Usuário padrão';
const dataHora=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

export function AdminScreen({onVoltar}){
  const{token,usuario,logout}=useAuth();
  const[usuarios,setUsuarios]=useState([]);const[emails,setEmails]=useState([]);const[sessoes,setSessoes]=useState([]);const[overview,setOverview]=useState({});
  const[novoEmail,setNovoEmail]=useState('');const[novoPerfil,setNovoPerfil]=useState('ALUNO');
  const[nomeNovo,setNomeNovo]=useState('');const[emailNovo,setEmailNovo]=useState('');const[senhaNova,setSenhaNova]=useState('');const[perfilNovo,setPerfilNovo]=useState('USUARIO');
  const[editando,setEditando]=useState(null);const[nomeEditado,setNomeEditado]=useState('');const[emailEditado,setEmailEditado]=useState('');const[senhaEditada,setSenhaEditada]=useState('');const[perfilEditado,setPerfilEditado]=useState('USUARIO');const[statusEditado,setStatusEditado]=useState(true);
  const[loading,setLoading]=useState(false);const[enviando,setEnviando]=useState(false);

  const carregar=useCallback(async()=>{
    try{
      setLoading(true);
      const[contas,convites,resumo,activeSessions]=await Promise.all([
        mobileApi.adminUsuarios(token),mobileApi.adminEmailsPerfil(token),mobileApi.adminOverview(token),mobileApi.adminSessoes(token)
      ]);
      setUsuarios(contas);setEmails(convites);setOverview(resumo);setSessoes(activeSessions);
    }catch(e){Alert.alert('Administração',e.message)}finally{setLoading(false)}
  },[token]);
  useEffect(()=>{carregar()},[carregar]);

  const atualizar=async(id,body)=>{
    try{await mobileApi.atualizarAdminUsuario(token,id,body);await carregar();Alert.alert('Administração','Dados e permissões atualizados.')}catch(e){Alert.alert('Não foi possível atualizar',e.message)}
  };
  const abrirEdicao=u=>{setEditando(u.id);setNomeEditado(u.nome||'');setEmailEditado(u.email||'');setSenhaEditada('');setPerfilEditado(u.perfil||'USUARIO');setStatusEditado(Boolean(u.status));};
  const salvarEdicao=async()=>{
    if(!editando)return;
    const body={nome:nomeEditado.trim(),email:emailEditado.trim(),perfil:perfilEditado,status:statusEditado};
    if(senhaEditada)body.senha=senhaEditada;
    if(body.nome.length<3)return Alert.alert('Conta','O nome precisa ter pelo menos 3 caracteres.');
    if(body.senha&&body.senha.length<12)return Alert.alert('Conta','A nova senha precisa ter pelo menos 12 caracteres.');
    await atualizar(editando,body);setEditando(null);
  };
  const escolherPerfilUsuario=u=>Alert.alert('Definir perfil',`Escolha o perfil de ${u.nome}.`,[
    ...PERFIS.filter(p=>p.value!==u.perfil).map(p=>({text:p.label,onPress:()=>atualizar(u.id,{perfil:p.value})})),
    {text:'Cancelar',style:'cancel'}
  ]);
  const salvarEmail=async()=>{
    if(!novoEmail.trim())return Alert.alert('Pré-cadastro','Informe um e-mail institucional.');
    try{setEnviando(true);await mobileApi.definirAdminEmailPerfil(token,{email:novoEmail.trim(),perfil:novoPerfil});setNovoEmail('');await carregar();Alert.alert('Pré-cadastro','E-mail definido. O perfil será aplicado no próximo cadastro dessa conta.');}
    catch(e){Alert.alert('Não foi possível pré-cadastrar',e.message)}finally{setEnviando(false)}
  };
  const criarUsuario=async()=>{
    if(nomeNovo.trim().length<3||!emailNovo.trim()||senhaNova.length<12)return Alert.alert('Nova conta','Informe nome, e-mail e uma senha inicial de pelo menos 12 caracteres.');
    try{setEnviando(true);await mobileApi.criarAdminUsuario(token,{nome:nomeNovo.trim(),email:emailNovo.trim(),senha:senhaNova,perfil:perfilNovo,status:true});setNomeNovo('');setEmailNovo('');setSenhaNova('');setPerfilNovo('USUARIO');await carregar();Alert.alert('Nova conta','Usuário criado com sucesso.');}
    catch(e){Alert.alert('Não foi possível criar',e.message)}finally{setEnviando(false)}
  };
  const removerEmail=item=>Alert.alert('Remover pré-cadastro',`Remover ${item.email}?`,[
    {text:'Cancelar',style:'cancel'},
    {text:'Remover',style:'destructive',onPress:async()=>{try{await mobileApi.removerAdminEmailPerfil(token,item.id);await carregar()}catch(e){Alert.alert('Erro',e.message)}}}
  ]);
  const revogarSessao=s=>Alert.alert('Encerrar sessão',`Revogar acesso de ${s.usuarioNome||'usuário'} neste dispositivo?`,[
    {text:'Cancelar',style:'cancel'},
    {text:'Encerrar',style:'destructive',onPress:async()=>{try{await mobileApi.revogarAdminSessao(token,s.id);if(s.atual){await logout();return;}await carregar();Alert.alert('Sessão','Acesso encerrado.')}catch(e){Alert.alert('Erro',e.message)}}}
  ]);
  const ativos=usuarios.filter(u=>u.status).length;
  const admins=usuarios.filter(u=>u.status&&u.perfil==='ADMIN').length;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
    <TopBar title="Administração" subtitle="Controle central do RateIF" usuario={usuario}/>
    <View style={styles.summary}>
      <View style={styles.metric}><Text style={styles.metricValue}>{overview.usuarios??usuarios.length}</Text><Text style={styles.metricLabel}>Contas</Text></View>
      <View style={styles.metric}><Text style={styles.metricValue}>{overview.usuariosAtivos??ativos}</Text><Text style={styles.metricLabel}>Ativas</Text></View>
      <View style={styles.metric}><Text style={styles.metricValue}>{overview.sessoesAtivas??sessoes.length}</Text><Text style={styles.metricLabel}>Sessões</Text></View>
    </View>
    <View style={styles.card}><Text style={styles.title}>Visão geral</Text>
      <View style={styles.overviewGrid}>{[['Alunos',overview.alunos],['Turmas',overview.turmas],['Avaliações',overview.avaliacoes],['Relatórios',overview.relatorios],['Votações abertas',overview.votacoesAbertas],['Requerimentos',overview.requerimentos],['Administradores',overview.administradores??admins],['Convites',overview.convitesPendentes]].map(([label,value])=><View key={label} style={styles.overviewItem}><Text style={styles.overviewNumber}>{Number(value||0)}</Text><Text style={styles.meta}>{label}</Text></View>)}</View>
    </View>

    <Text style={styles.title}>Criar conta diretamente</Text>
    <View style={styles.card}>
      <Text style={styles.help}>O administrador pode criar contas e definir o perfil inicial sem depender do cadastro público.</Text>
      <Input label="Nome completo" value={nomeNovo} onChangeText={setNomeNovo} autoCapitalize="words" maxLength={255}/>
      <Input label="E-mail" value={emailNovo} onChangeText={setEmailNovo} keyboardType="email-address" autoCapitalize="none"/>
      <Input label="Senha inicial (mínimo 12 caracteres)" value={senhaNova} onChangeText={setSenhaNova} secureTextEntry autoCapitalize="none" maxLength={128}/>
      <Text style={styles.label}>Perfil</Text>{chips(PERFIS,perfilNovo,setPerfilNovo)}
      <PrimaryButton title="Criar usuário" onPress={criarUsuario} loading={enviando}/>
    </View>

    {editando!==null?<View style={styles.card}>
      <Text style={styles.title}>Editar conta #{editando}</Text>
      <Input label="Nome" value={nomeEditado} onChangeText={setNomeEditado} autoCapitalize="words" maxLength={255}/>
      <Input label="E-mail" value={emailEditado} onChangeText={setEmailEditado} keyboardType="email-address" autoCapitalize="none" maxLength={254}/>
      <Input label="Nova senha (opcional, mínimo 12 caracteres)" value={senhaEditada} onChangeText={setSenhaEditada} secureTextEntry autoCapitalize="none" maxLength={128}/>
      <Text style={styles.label}>Perfil</Text>{chips(PERFIS,perfilEditado,setPerfilEditado)}
      <Pressable style={styles.statusToggle} onPress={()=>setStatusEditado(v=>!v)}><View style={[styles.checkbox,statusEditado&&styles.checkboxOn]}/><Text style={styles.meta}>Conta {statusEditado?'ativa':'inativa'}</Text></Pressable>
      <PrimaryButton title="Salvar alterações" onPress={salvarEdicao}/><PrimaryButton title="Cancelar" onPress={()=>setEditando(null)} secondary/>
    </View>:null}

    <Text style={styles.title}>Usuários e permissões</Text>
    {usuarios.map(u=>{const proprio=Number(u.id)===Number(usuario?.id);return <View key={u.id} style={styles.card}>
      <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{(u.nome||'?').trim().charAt(0).toUpperCase()}</Text></View><View style={styles.identityText}><Text style={styles.name}>{u.nome}</Text><Text style={styles.email}>{u.email}</Text><Text style={styles.meta}>{rotuloPerfil(u.perfil)} · {u.status?'Ativo':'Inativo'}{proprio?' · Você':''}</Text></View></View>
      <View style={styles.actions}><PrimaryButton title="Editar dados e permissões" secondary onPress={()=>abrirEdicao(u)}/><PrimaryButton title="Alterar perfil rapidamente" secondary disabled={proprio} onPress={()=>escolherPerfilUsuario(u)}/><PrimaryButton title={u.status?'Desativar conta':'Reativar conta'} secondary disabled={proprio} onPress={()=>Alert.alert('Alterar status',`Deseja ${u.status?'desativar':'reativar'} esta conta?`,[{text:'Cancelar',style:'cancel'},{text:'Confirmar',onPress:()=>atualizar(u.id,{status:!u.status})}])}/></View>
    </View>})}
    {!usuarios.length&&!loading?<Text style={styles.empty}>Nenhuma conta encontrada.</Text>:null}

    <Text style={styles.title}>Sessões ativas globais</Text>
    <Text style={styles.help}>O administrador pode encerrar uma sessão em qualquer dispositivo, inclusive de outro usuário.</Text>
    {sessoes.map(s=><View key={s.id} style={styles.card}>
      <View style={styles.sessionHeading}><Text style={styles.name}>{s.usuarioNome||'Usuário'} · {s.dispositivo||s.tipo}</Text>{s.atual?<Text style={styles.current}>Esta sessão</Text>:null}</View><Text style={styles.meta}>{s.usuarioEmail||''} · {rotuloPerfil(s.perfil)}</Text><Text style={styles.meta}>{s.tipo==='MOBILE'?'Aplicativo mobile':'Navegador web'} · IP {s.ip||'não identificado'}</Text><Text style={styles.meta}>Último acesso: {dataHora(s.ultimoAcesso)}</Text><PrimaryButton title="Encerrar sessão" danger onPress={()=>revogarSessao(s)}/>
    </View>)}
    {!sessoes.length&&!loading?<Text style={styles.empty}>Nenhuma sessão ativa.</Text>:null}

    <Text style={styles.title}>Pré-cadastro de e-mails</Text>
    <View style={styles.card}>
      <Text style={styles.help}>Defina o e-mail institucional e o perfil que será aplicado no cadastro. O convite é removido depois de utilizado.</Text>
      <Input label="E-mail institucional" value={novoEmail} onChangeText={setNovoEmail} keyboardType="email-address" autoCapitalize="none" placeholder="aluno@instituicao.edu.br" />
      <Text style={styles.label}>Perfil a atribuir</Text>{chips(PERFIS.filter(p=>p.value!=='ADMIN'),novoPerfil,setNovoPerfil)}
      <PrimaryButton title={enviando?'Salvando...':'Pré-cadastrar e-mail'} onPress={salvarEmail} loading={enviando}/>
    </View>
    {emails.map(item=><View key={item.id} style={styles.card}>
      <View style={styles.emailHeader}><View style={{flex:1}}><Text style={styles.name}>{item.email}</Text><Text style={styles.meta}>Perfil: {rotuloPerfil(item.perfil)}</Text><Text style={styles.meta}>Aguardando cadastro</Text></View><Pressable onPress={()=>removerEmail(item)}><Text style={styles.delete}>Remover</Text></Pressable></View>
    </View>)}
    {!emails.length&&!loading?<Text style={styles.empty}>Nenhum e-mail pré-cadastrado.</Text>:null}
    <PrimaryButton title={loading?'Atualizando...':'Atualizar dados' } onPress={carregar} loading={loading}/>
    <PrimaryButton title="Voltar" onPress={onVoltar} secondary/>
  </ScrollView>
}

function chips(values,value,setter){return <View style={styles.profileChoices}>{values.map(p=><Pressable key={p.value} onPress={()=>setter(p.value)} style={[styles.choice,value===p.value&&styles.choiceActive]}><Text style={[styles.choiceText,value===p.value&&styles.choiceTextActive]}>{p.label}</Text></Pressable>)}</View>}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:COLORS.bg},container:{padding:16,paddingTop:22,paddingBottom:36,gap:12},
  summary:{flexDirection:'row',gap:8},metric:{flex:1,backgroundColor:COLORS.surface,borderColor:COLORS.line,borderWidth:1,borderRadius:13,padding:14},metricValue:{fontSize:24,fontWeight:'900',color:COLORS.primary},metricLabel:{fontSize:11,color:COLORS.muted,marginTop:4},
  title:{fontSize:19,fontWeight:'900',color:COLORS.ink,marginTop:10},card:{padding:14,borderRadius:15,backgroundColor:COLORS.surface,borderColor:COLORS.line,borderWidth:1,gap:12},
  help:{fontSize:12,lineHeight:18,color:COLORS.muted},label:{fontSize:12,fontWeight:'800',color:'#4D5872',marginBottom:6},profileChoices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{paddingVertical:9,paddingHorizontal:10,borderWidth:1,borderColor:COLORS.line,borderRadius:10},choiceActive:{backgroundColor:COLORS.soft,borderColor:'#A0ADEE'},choiceText:{fontSize:11,color:COLORS.muted,fontWeight:'800'},choiceTextActive:{color:COLORS.primaryDark},
  overviewGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},overviewItem:{width:'48%',backgroundColor:COLORS.surface2,borderRadius:11,padding:11},overviewNumber:{fontSize:22,fontWeight:'900',color:COLORS.primary},
  emailHeader:{flexDirection:'row',alignItems:'center',gap:10},identity:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:40,height:40,borderRadius:12,backgroundColor:COLORS.soft,alignItems:'center',justifyContent:'center'},avatarText:{fontWeight:'900',fontSize:16,color:COLORS.primary},identityText:{flex:1},name:{fontWeight:'900',fontSize:14,color:COLORS.ink},email:{fontSize:11,color:COLORS.muted,marginTop:3},meta:{fontSize:11,color:COLORS.muted,marginTop:5},actions:{gap:4},delete:{color:COLORS.danger,fontSize:12,fontWeight:'900'},empty:{textAlign:'center',color:COLORS.muted,padding:24},sessionHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},current:{fontSize:10,fontWeight:'900',color:COLORS.success},statusToggle:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:6},checkbox:{width:19,height:19,borderWidth:1,borderColor:COLORS.line,borderRadius:5},checkboxOn:{backgroundColor:COLORS.primary,borderColor:COLORS.primary}
});
