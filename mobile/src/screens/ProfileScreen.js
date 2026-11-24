import React,{useCallback,useEffect,useState}from'react';
import{Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,View}from'react-native';
import{Input}from'../components/Input';
import{PrimaryButton}from'../components/PrimaryButton';
import{useAuth}from'../context/AuthContext';
import{mobileApi}from'../api';
import{COLORS}from'../theme';

const dataHora=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
export function ProfileScreen({onVoltar}){
  const{token,usuario,atualizarPerfil,logout}=useAuth();
  const[nome,setNome]=useState(usuario?.nome||'');const[email,setEmail]=useState(usuario?.email||'');
  const[sessoes,setSessoes]=useState([]);const[loading,setLoading]=useState(false);const[loadingSessions,setLoadingSessions]=useState(false);
  useEffect(()=>{setNome(usuario?.nome||'');setEmail(usuario?.email||'')},[usuario]);
  const carregarSessoes=useCallback(async()=>{try{setLoadingSessions(true);setSessoes(await mobileApi.sessoes(token));}catch(e){Alert.alert('Sessões',e.message)}finally{setLoadingSessions(false)}},[token]);
  useEffect(()=>{carregarSessoes()},[carregarSessoes]);
  const salvar=async()=>{try{setLoading(true);const d=await atualizarPerfil(nome.trim(),email.trim());Alert.alert('Perfil',d.mensagem)}catch(e){Alert.alert('Perfil',e.message)}finally{setLoading(false)}};
  const recarregar=async()=>{try{const d=await mobileApi.perfil(token);setNome(d.nome||'');setEmail(d.email||'')}catch(e){Alert.alert('Perfil',e.message)}};
  const encerrar=s=>Alert.alert('Encerrar sessão',s.atual?'Você será desconectado deste dispositivo. Deseja continuar?':'Deseja encerrar esta sessão neste dispositivo?',[
    {text:'Cancelar',style:'cancel'},
    {text:'Encerrar',style:'destructive',onPress:async()=>{try{await mobileApi.revogarSessao(token,s.id);if(s.atual){await logout();return;}await carregarSessoes();Alert.alert('Sessões','A sessão foi encerrada.')}catch(e){Alert.alert('Sessões',e.message)}}}
  ]);
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.back} onPress={onVoltar}>‹ Voltar</Text><Text style={styles.title}>Meu perfil</Text><Text style={styles.subtitle}>Dados sincronizados com o mesmo usuário do RateIF web.</Text>
      <Input label="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" placeholder="Seu nome"/>
      <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="seu@email.com"/>
      <Text style={styles.readonly}>Perfil: {usuario?.perfil||'USUARIO'}</Text><Text style={styles.readonly}>Status: {usuario?.status?'Ativo':'Inativo'}</Text>
      <PrimaryButton title="Salvar alterações" onPress={salvar} loading={loading}/><PrimaryButton title="Recarregar dados" onPress={recarregar} secondary/>

      <View style={styles.sectionHeader}><View style={{flex:1}}><Text style={styles.sectionTitle}>Minhas sessões</Text><Text style={styles.sectionHint}>Acessos web e mobile vinculados à sua conta.</Text></View><Pressable onPress={carregarSessoes}><Text style={styles.refresh}>Atualizar</Text></Pressable></View>
      {sessoes.map(s=><View key={s.id} style={styles.sessionCard}>
        <View style={styles.sessionHeading}><Text style={styles.sessionName}>{s.dispositivo||s.tipo}</Text>{s.atual?<Text style={styles.current}>Esta sessão</Text>:null}</View>
        <Text style={styles.sessionMeta}>{s.tipo==='MOBILE'?'Aplicativo mobile':'Navegador web'} · IP {s.ip||'não identificado'}</Text>
        <Text style={styles.sessionMeta}>Último acesso: {dataHora(s.ultimoAcesso)}</Text>
        <Text style={styles.sessionMeta}>Expira: {dataHora(s.expiraEm)}</Text>
        <PrimaryButton title="Encerrar sessão" secondary danger onPress={()=>encerrar(s)}/>
      </View>)}
      {!sessoes.length&&!loadingSessions?<Text style={styles.empty}>Nenhuma sessão ativa encontrada.</Text>:null}
      {loadingSessions?<Text style={styles.empty}>Atualizando sessões...</Text>:null}
    </ScrollView>
  </KeyboardAvoidingView>
}
const styles=StyleSheet.create({flex:{flex:1},container:{flexGrow:1,padding:20,paddingBottom:38,backgroundColor:COLORS.bg},back:{color:COLORS.primary,fontSize:14,fontWeight:'900',marginBottom:24,marginTop:5},title:{color:COLORS.ink,fontSize:30,fontWeight:'900'},subtitle:{color:COLORS.muted,lineHeight:19,marginTop:7,marginBottom:23},readonly:{color:COLORS.muted,fontSize:12,marginTop:6},sectionHeader:{flexDirection:'row',alignItems:'center',marginTop:30,marginBottom:12},sectionTitle:{fontSize:20,fontWeight:'900',color:COLORS.ink},sectionHint:{fontSize:11,color:COLORS.muted,marginTop:4},refresh:{fontSize:12,fontWeight:'900',color:COLORS.primary},sessionCard:{backgroundColor:COLORS.surface,borderColor:COLORS.line,borderWidth:1,borderRadius:14,padding:14,marginBottom:9},sessionHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},sessionName:{fontSize:14,fontWeight:'900',color:COLORS.ink,flex:1},current:{fontSize:10,fontWeight:'900',color:COLORS.success},sessionMeta:{fontSize:11,color:COLORS.muted,marginTop:6},empty:{textAlign:'center',color:COLORS.muted,padding:18}});
