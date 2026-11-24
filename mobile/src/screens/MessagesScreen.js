import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { TopBar } from '../components/TopBar';
import { useAuth } from '../context/AuthContext';
import { mobileApi } from '../api';
import { COLORS } from '../theme';

const formatDate = value => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export function MessagesScreen({ onVoltar }) {
  const { token, usuario } = useAuth();
  const [contatos, setContatos] = useState([]);
  const [contatoId, setContatoId] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef(null);
  const contatoIdRef = useRef(contatoId);
  useEffect(() => { contatoIdRef.current = contatoId; }, [contatoId]);

  const contatoAtual = contatos.find(c => Number(c.id) === Number(contatoId));

  const carregarContatos = useCallback(async () => {
    try {
      const data = await mobileApi.mensagensContatos(token);
      setContatos(data);
      if (contatoIdRef.current && !data.some(c => Number(c.id) === Number(contatoIdRef.current))) setContatoId(null);
    } catch (e) { /* Falha momentânea de rede não derruba a conversa. */ }
  }, [token]);

  const carregarConversa = useCallback(async (id, mostrarErro = false) => {
    if (!id) { setMensagens([]); return; }
    try {
      const data = await mobileApi.mensagensConversa(token, id);
      setMensagens(data);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60);
      await carregarContatos();
    } catch (e) { if (mostrarErro) Alert.alert('Mensagens', e.message); }
  }, [token, carregarContatos]);

  useEffect(() => {
    let active = true;
    setCarregando(true);
    mobileApi.mensagensContatos(token).then(data => { if (active) setContatos(data); }).catch(e => { if (active) Alert.alert('Mensagens', e.message); }).finally(() => { if (active) setCarregando(false); });
    const contactsTimer = setInterval(() => { if (active) carregarContatos(); }, 12000);
    return () => { active = false; clearInterval(contactsTimer); };
  }, [token, carregarContatos]);

  useEffect(() => {
    if (!contatoId) return undefined;
    carregarConversa(contatoId, true);
    const timer = setInterval(() => carregarConversa(contatoId, false), 5000);
    return () => clearInterval(timer);
  }, [contatoId, carregarConversa]);

  const enviar = async () => {
    if (!contatoId || !texto.trim() || enviando) return;
    try {
      setEnviando(true);
      await mobileApi.enviarMensagem(token, Number(contatoId), texto.trim());
      setTexto('');
      await carregarConversa(contatoId, true);
      await carregarContatos();
    } catch (e) { Alert.alert('Não foi possível enviar', e.message); }
    finally { setEnviando(false); }
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TopBar title="Mensagens" subtitle="COMUNICAÇÃO INTERNA" usuario={usuario} />
      <Text style={styles.explain}>Converse com professores ou com ADM/coordenação. O status online é atualizado automaticamente.</Text>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Contatos</Text>
        {carregando && !contatos.length ? <Text style={styles.empty}>Carregando contatos...</Text> : contatos.length ? contatos.map(c => <Pressable key={c.id} style={[styles.contact, Number(contatoId) === Number(c.id) && styles.contactActive]} onPress={() => setContatoId(c.id)}>
          <View style={[styles.dot, c.online && styles.dotOnline]} />
          <View style={styles.contactInfo}><Text style={styles.contactName}>{c.nome}</Text><Text style={styles.contactMeta}>{c.perfil === 'COORDENACAO' ? 'Coordenação' : c.perfil === 'ADMIN' ? 'ADM' : 'Professor'} · {c.online ? 'Online' : 'Offline'}</Text></View>
          {Number(c.naoLidas) > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{c.naoLidas}</Text></View> : null}
        </Pressable>) : <Text style={styles.empty}>Nenhum contato disponível. A lista mostra professores e equipe de gestão com conta ativa.</Text>}
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{contatoAtual ? contatoAtual.nome : 'Conversa'}</Text>
        {contatoAtual ? <Text style={styles.contactMeta}>{contatoAtual.online ? '● Online agora' : '○ Offline'}</Text> : <Text style={styles.empty}>Selecione um contato para abrir a conversa.</Text>}
        {contatoAtual ? <ScrollView nestedScrollEnabled ref={scrollRef} style={styles.thread} contentContainerStyle={styles.threadContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd?.({ animated: true })}>
          {mensagens.length ? mensagens.map(m => <View key={m.id} style={[styles.bubble, m.minha ? styles.myBubble : styles.theirBubble]}><Text style={[styles.bubbleText, m.minha && styles.myBubbleText]}>{m.conteudo}</Text><Text style={[styles.bubbleDate, m.minha && styles.myBubbleDate]}>{formatDate(m.enviadaEm)}{m.minha && m.lidaEm ? ' · Lida' : ''}</Text></View>) : <Text style={styles.empty}>Ainda não há mensagens nesta conversa.</Text>}
        </ScrollView> : null}
        {contatoAtual ? <View style={styles.compose}><TextInput style={styles.input} value={texto} onChangeText={setTexto} placeholder="Escreva uma mensagem..." multiline maxLength={5000} /><PrimaryButton title={enviando ? 'Enviando...' : 'Enviar mensagem'} onPress={enviar} loading={enviando} disabled={!texto.trim() || enviando} /></View> : null}
      </View>
      <PrimaryButton title="Voltar" onPress={onVoltar} secondary />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg }, scroll: { flex: 1 }, container: { padding: 16, paddingTop: 22, paddingBottom: 38, gap: 12 },
  explain: { color: COLORS.muted, fontSize: 12, lineHeight: 18 }, panel: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.line, gap: 9 },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900' }, contact: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: '#F9FAFE', borderWidth: 1, borderColor: COLORS.line, gap: 9 }, contactActive: { borderColor: COLORS.primary, backgroundColor: COLORS.soft }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#A7AFBF' }, dotOnline: { backgroundColor: COLORS.success }, contactInfo: { flex: 1 }, contactName: { fontSize: 13, fontWeight: '900', color: COLORS.ink }, contactMeta: { marginTop: 3, fontSize: 11, color: COLORS.muted }, unread: { borderRadius: 10, minWidth: 22, height: 22, paddingHorizontal: 5, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, unreadText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  empty: { color: COLORS.muted, fontSize: 12, lineHeight: 18, paddingVertical: 12 }, thread: { maxHeight: 360, minHeight: 90 }, threadContent: { gap: 8, paddingVertical: 8 }, bubble: { maxWidth: '90%', padding: 11, borderRadius: 12, gap: 5 }, myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.primary }, theirBubble: { alignSelf: 'flex-start', backgroundColor: '#EFF2F8' }, bubbleText: { color: COLORS.ink, fontSize: 13, lineHeight: 19 }, myBubbleText: { color: '#fff' }, bubbleDate: { color: COLORS.muted, fontSize: 9, alignSelf: 'flex-end' }, myBubbleDate: { color: '#E3E8FF' }, compose: { gap: 9, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 }, input: { minHeight: 60, maxHeight: 140, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 11, textAlignVertical: 'top', color: COLORS.ink, backgroundColor: '#fff' }
});
