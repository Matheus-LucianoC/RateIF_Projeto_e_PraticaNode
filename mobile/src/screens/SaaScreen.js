import React,{useCallback,useEffect,useState}from'react';
import{Alert,Pressable,ScrollView,StyleSheet,Text,View}from'react-native';
import{Input}from'../components/Input';import{PrimaryButton}from'../components/PrimaryButton';import{TopBar}from'../components/TopBar';import{useAuth}from'../context/AuthContext';import{mobileApi}from'../api';import{COLORS}from'../theme';
const TIPOS=[['GERAL','Geral'],['DIAGNOSTICA','Diagnóstica'],['FORMATIVA','Formativa'],['SOMATIVA','Somativa']];
const STATUS=[['EM_ACOMPANHAMENTO','Em acompanhamento'],['NECESSITA_INTERVENCAO','Necessita intervenção'],['CONCLUIDO','Concluído']];
const UNIDADES=[['','Não informada'],['1','1ª'],['2','2ª'],['3','3ª'],['4','4ª']];
const canManage=perfil=>['ADMIN','COORDENACAO','PROFESSOR'].includes(String(perfil||'').toUpperCase());
const statusLabel=status=>STATUS.find(s=>s[0]===status)?.[1]||'Em acompanhamento';
const tipoLabel=tipo=>TIPOS.find(t=>t[0]===tipo)?.[1]||tipo||'Geral';
const dateLabel=value=>value?new Date(value).toLocaleDateString('pt-BR'):'—';
export function SaaScreen({onVoltar}){
  const{token,usuario}=useAuth();
  const[alunos,setAlunos]=useState([]);const[professores,setProfessores]=useState([]);const[items,setItems]=useState([]);const[summary,setSummary]=useState({});
  const[alunoId,setAlunoId]=useState(null);const[professorId,setProfessorId]=useState(null);const[nota,setNota]=useState('');const[comentario,setComentario]=useState('');
  const[titulo,setTitulo]=useState('');const[tipoAvaliacao,setTipoAvaliacao]=useState('GERAL');const[unidade,setUnidade]=useState('');const[competencias,setCompetencias]=useState('');const[pontosFortes,setPontosFortes]=useState('');const[dificuldades,setDificuldades]=useState('');const[intervencaoRecomendada,setIntervencaoRecomendada]=useState('');const[planoAcao,setPlanoAcao]=useState('');const[dataReavaliacao,setDataReavaliacao]=useState('');const[statusAcompanhamento,setStatusAcompanhamento]=useState('EM_ACOMPANHAMENTO');
  const[filterStatus,setFilterStatus]=useState('');const[filterUnit,setFilterUnit]=useState('');const[editingId,setEditingId]=useState(null);const[busy,setBusy]=useState(false);const[loading,setLoading]=useState(false);
  const gerencia=canManage(usuario?.perfil);
  const carregar=useCallback(async()=>{
    try{
      setLoading(true);
      const filters={statusAcompanhamento:filterStatus||undefined,unidade:filterUnit||undefined};
      const requests=[mobileApi.saaAvaliacoes(token,filters),mobileApi.saaResumo(token,filters)];
      if(gerencia)requests.push(mobileApi.alunos(token),mobileApi.professores(token));
      const result=await Promise.all(requests);setItems(result[0]);setSummary(result[1]||{});
      if(gerencia){setAlunos(result[2]||[]);setProfessores(result[3]||[]);if(usuario?.perfil==='PROFESSOR')setProfessorId(Number(usuario.id));}
    }catch(e){Alert.alert('SAA',e.message)}finally{setLoading(false)}
  },[token,filterStatus,filterUnit,gerencia,usuario?.perfil,usuario?.id]);
  useEffect(()=>{carregar()},[carregar]);
  const limpar=()=>{setEditingId(null);setAlunoId(null);setProfessorId(usuario?.perfil==='PROFESSOR'?Number(usuario.id):null);setNota('');setComentario('');setTitulo('');setTipoAvaliacao('GERAL');setUnidade('');setCompetencias('');setPontosFortes('');setDificuldades('');setIntervencaoRecomendada('');setPlanoAcao('');setDataReavaliacao('');setStatusAcompanhamento('EM_ACOMPANHAMENTO')};
  const editar=a=>{setEditingId(a.id);setAlunoId(a.alunoId);setProfessorId(a.professorId);setNota(String(a.nota));setComentario(a.comentario||'');setTitulo(a.titulo||'');setTipoAvaliacao(a.tipoAvaliacao||'GERAL');setUnidade(a.unidade?String(a.unidade):'');setCompetencias(a.competencias||'');setPontosFortes(a.pontosFortes||'');setDificuldades(a.dificuldades||'');setIntervencaoRecomendada(a.intervencaoRecomendada||'');setPlanoAcao(a.planoAcao||'');setDataReavaliacao(a.dataReavaliacao?String(a.dataReavaliacao).slice(0,10):'');setStatusAcompanhamento(a.statusAcompanhamento||'EM_ACOMPANHAMENTO')};
  const salvar=async()=>{
    const n=Number(String(nota).replace(',','.'));
    if(!alunoId||!professorId||nota.trim()===''||Number.isNaN(n)||n<0||n>10)return Alert.alert('SAA','Selecione aluno, professor e uma nota de 0 a 10.');
    const body={alunoId:Number(alunoId),professorId:Number(professorId),nota:n,comentario,titulo,tipoAvaliacao,unidade:unidade?Number(unidade):null,competencias,pontosFortes,dificuldades,intervencaoRecomendada,planoAcao,dataReavaliacao:dataReavaliacao||null,statusAcompanhamento};
    try{setBusy(true);const editing=Boolean(editingId);if(editing)await mobileApi.atualizarSaaAvaliacao(token,editingId,body);else await mobileApi.criarSaaAvaliacao(token,body);limpar();await carregar();Alert.alert('SAA',editing?'Avaliação atualizada.':'Avaliação registrada.')}catch(e){Alert.alert('SAA',e.message)}finally{setBusy(false)}
  };
  const chips=(values,value,setter)=> <View style={styles.chips}>{values.map(([v,label])=><Pressable key={v} style={[styles.chip,value===v&&styles.chipActive]} onPress={()=>setter(v)}><Text style={[styles.chipText,value===v&&styles.chipTextActive]}>{label}</Text></Pressable>)}</View>;
  const canEdit=a=>gerencia&&(usuario?.perfil!=='PROFESSOR'||Number(a.professorId)===Number(usuario?.id));
  return <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
    <TopBar title="SAA" subtitle="Sistema de Avaliação do Aluno" usuario={usuario}/>
    <View style={styles.summary}>
      <View style={styles.metric}><Text style={styles.metricValue}>{summary.total??items.length}</Text><Text style={styles.metricLabel}>Avaliações</Text></View>
      <View style={styles.metric}><Text style={styles.metricValue}>{Number(summary.mediaGeral||0).toFixed(1).replace('.',',')}</Text><Text style={styles.metricLabel}>Média geral</Text></View>
      <View style={styles.metric}><Text style={styles.metricValue}>{summary.necessitaIntervencao??items.filter(a=>a.statusAcompanhamento==='NECESSITA_INTERVENCAO').length}</Text><Text style={styles.metricLabel}>Intervenções</Text></View>
    </View>
    <View style={styles.summaryExtra}><Text style={styles.summaryExtraText}>Em acompanhamento: {summary.emAcompanhamento??0}</Text><Text style={styles.summaryExtraText}>Concluídas: {summary.concluidas??0}</Text><Text style={styles.summaryExtraText}>Reavaliações pendentes: {summary.reavaliacoesPendentes??0}</Text></View>

    {gerencia?<View style={styles.panel}>
      <Text style={styles.kicker}>{editingId?'EDITAR REGISTRO':'NOVA AVALIAÇÃO'}</Text><Text style={styles.section}>{editingId?'Atualizar avaliação':'Registrar avaliação'}</Text>
      <Text style={styles.label}>Aluno</Text>{chips(alunos.map(a=>[String(a.id),a.nome||`Aluno #${a.id}`]),alunoId?String(alunoId):'',v=>setAlunoId(Number(v)))}
      {usuario?.perfil==='PROFESSOR'?<Text style={styles.fixedTeacher}>Professor responsável: {usuario.nome}</Text>:<><Text style={styles.label}>Professor</Text>{chips(professores.map(p=>[String(p.id),p.nome||`Professor #${p.id}`]),professorId?String(professorId):'',v=>setProfessorId(Number(v)))}</>}
      <Input label="Título" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Acompanhamento de Matemática" maxLength={120}/>
      <Text style={styles.label}>Tipo de avaliação</Text>{chips(TIPOS,tipoAvaliacao,setTipoAvaliacao)}
      <Text style={styles.label}>Unidade</Text>{chips(UNIDADES,unidade,setUnidade)}
      <Input label="Nota (0 a 10)" value={nota} onChangeText={setNota} keyboardType="decimal-pad" placeholder="0 a 10"/>
      <Input label="Competências observadas" value={competencias} onChangeText={setCompetencias} multiline maxLength={2000} placeholder="Conteúdos consolidados e pontos a desenvolver"/>
      <Input label="Pontos fortes" value={pontosFortes} onChangeText={setPontosFortes} multiline maxLength={2000} placeholder="Habilidades e conteúdos já consolidados"/>
      <Input label="Dificuldades identificadas" value={dificuldades} onChangeText={setDificuldades} multiline maxLength={2000} placeholder="Pontos que exigem reforço"/>
      <Input label="Comentário pedagógico" value={comentario} onChangeText={setComentario} multiline maxLength={2000} placeholder="Observação sobre o desempenho"/>
      <Input label="Intervenção recomendada" value={intervencaoRecomendada} onChangeText={setIntervencaoRecomendada} multiline maxLength={2000} placeholder="Monitoria, atividade orientada, recuperação..."/>
      <Input label="Plano de ação" value={planoAcao} onChangeText={setPlanoAcao} multiline maxLength={2000} placeholder="Etapas, responsáveis e estratégias combinadas"/>
      <Input label="Data prevista para reavaliação (AAAA-MM-DD)" value={dataReavaliacao} onChangeText={setDataReavaliacao} placeholder="2027-03-15" maxLength={10}/>
      <Text style={styles.label}>Status do acompanhamento</Text>{chips(STATUS,statusAcompanhamento,setStatusAcompanhamento)}
      <PrimaryButton title={busy?'Salvando...':editingId?'Salvar alterações':'Registrar avaliação'} onPress={salvar} loading={busy}/>{editingId?<PrimaryButton title="Cancelar edição" onPress={limpar} secondary/>:null}
    </View>:<View style={styles.readOnlyNotice}><Text style={styles.readOnlyTitle}>Consulta do acompanhamento</Text><Text style={styles.meta}>Seu perfil possui acesso de leitura ao histórico do SAA. O lançamento e a alteração de avaliações são restritos à administração, coordenação e professores.</Text></View>}

    <Text style={styles.section}>Histórico de avaliações</Text>
    <View style={styles.filterPanel}><Text style={styles.label}>Filtrar por status</Text>{chips([['','Todos'],...STATUS],filterStatus,setFilterStatus)}<Text style={styles.label}>Filtrar por unidade</Text>{chips(UNIDADES,filterUnit,setFilterUnit)}</View>
    {items.length?items.map(a=><View key={a.id} style={styles.item}>
      <View style={{flex:1}}><Text style={styles.itemTitle}>{a.titulo||'Avaliação pedagógica'} · {a.alunoNome}</Text><Text style={styles.meta}>Professor: {a.professorNome} · {tipoLabel(a.tipoAvaliacao)}{a.unidade?` · ${a.unidade}ª unidade`:''}</Text><Text style={styles.meta}>Lançada em {dateLabel(a.dataAvaliacao)}{a.atualizadoEm?` · Atualizada ${dateLabel(a.atualizadoEm)}`:''}</Text>
      {a.competencias?<Text style={styles.meta}>Competências: {a.competencias}</Text>:null}{a.pontosFortes?<Text style={styles.meta}>Pontos fortes: {a.pontosFortes}</Text>:null}{a.dificuldades?<Text style={styles.meta}>Dificuldades: {a.dificuldades}</Text>:null}{a.comentario?<Text style={styles.meta}>Comentário: {a.comentario}</Text>:null}{a.intervencaoRecomendada?<Text style={styles.meta}>Intervenção: {a.intervencaoRecomendada}</Text>:null}{a.planoAcao?<Text style={styles.meta}>Plano de ação: {a.planoAcao}</Text>:null}{a.dataReavaliacao?<Text style={styles.meta}>Reavaliar em: {dateLabel(a.dataReavaliacao)}</Text>:null}
      <Text style={styles.status}>{statusLabel(a.statusAcompanhamento)}</Text>{canEdit(a)?<PrimaryButton title="Editar avaliação" onPress={()=>editar(a)} secondary/>:null}</View><Text style={styles.nota}>{Number(a.nota).toFixed(1)}</Text>
    </View>):<Text style={styles.empty}>{loading?'Carregando avaliações...':'Nenhuma avaliação encontrada para estes filtros.'}</Text>}
    <PrimaryButton title={loading?'Atualizando...':'Atualizar histórico'} onPress={carregar} secondary loading={loading}/>
    <PrimaryButton title="Voltar" onPress={onVoltar} secondary/>
  </ScrollView>
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:COLORS.bg},container:{padding:16,paddingTop:22,paddingBottom:40},summary:{flexDirection:'row',gap:8,marginBottom:9},metric:{flex:1,padding:12,borderRadius:13,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.line},metricValue:{fontWeight:'900',fontSize:22,color:COLORS.primary},metricLabel:{fontSize:10,color:COLORS.muted,marginTop:3},summaryExtra:{backgroundColor:COLORS.surface,borderColor:COLORS.line,borderWidth:1,borderRadius:12,padding:12,marginBottom:14,gap:5},summaryExtraText:{fontSize:11,color:COLORS.muted},panel:{padding:17,borderRadius:17,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.line,marginBottom:18},kicker:{color:COLORS.purple,fontSize:10,fontWeight:'900',letterSpacing:1},section:{color:COLORS.ink,fontSize:18,fontWeight:'900',marginBottom:10,marginTop:12},label:{color:'#4D5872',fontSize:12,fontWeight:'800',marginTop:12,marginBottom:7},chips:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingBottom:5},chip:{paddingHorizontal:10,paddingVertical:8,borderRadius:10,backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line},chipActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},chipText:{fontSize:11,fontWeight:'800',color:COLORS.muted},chipTextActive:{color:'#fff'},item:{padding:14,borderRadius:14,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.line,flexDirection:'row',alignItems:'flex-start',gap:10,marginBottom:8},itemTitle:{fontSize:13,fontWeight:'900',color:COLORS.ink},meta:{fontSize:10,color:COLORS.muted,marginTop:5,lineHeight:15},status:{fontSize:10,color:COLORS.purple,fontWeight:'900',marginTop:8},nota:{fontSize:20,fontWeight:'900',color:COLORS.primary},empty:{textAlign:'center',color:COLORS.muted,paddingVertical:20},readOnlyNotice:{padding:14,borderRadius:14,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.line,gap:6,marginBottom:16},readOnlyTitle:{color:COLORS.ink,fontWeight:'900',fontSize:14},filterPanel:{padding:14,backgroundColor:COLORS.surface,borderRadius:14,borderWidth:1,borderColor:COLORS.line,marginBottom:10},fixedTeacher:{fontSize:12,color:COLORS.muted,marginVertical:8}});
