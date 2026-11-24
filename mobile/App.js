import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CadastroScreen } from './src/screens/CadastroScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TurmasScreen } from './src/screens/TurmasScreen';
import { VdcScreen } from './src/screens/VdcScreen';
import { SaaScreen } from './src/screens/SaaScreen';
import { RequerimentosScreen } from './src/screens/RequerimentosScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { mobileApi } from './src/api';
import { COLORS } from './src/theme';

function MobileApp() {
  const { loading, autenticado, usuario, token } = useAuth();
  const [authScreen, setAuthScreen] = useState('login');
  const [appScreen, setAppScreen] = useState('home');
  const unreadBefore = useRef(null);

  useEffect(() => {
    const profile = String(usuario?.perfil || '').toUpperCase();
    if (!autenticado || !token || !['ADMIN', 'COORDENACAO', 'PROFESSOR'].includes(profile)) return undefined;
    let mounted = true;
    const heartbeat = async () => {
      try { if (mounted) await mobileApi.mensagensPresenca(token); } catch { /* Sessão pode estar expirando; status expira sozinho. */ }
    };
    heartbeat();
    const interval = setInterval(heartbeat, 25000);
    return () => {
      mounted = false;
      clearInterval(interval);
      mobileApi.mensagensOffline(token).catch(() => {});
    };
  }, [autenticado, token, usuario?.perfil]);

  useEffect(() => {
    const profile = String(usuario?.perfil || '').toUpperCase();
    if (!autenticado || !token || !['ADMIN', 'COORDENACAO', 'PROFESSOR'].includes(profile)) {
      unreadBefore.current = null;
      return undefined;
    }
    let active = true;
    const verificarNotificacoes = async () => {
      try {
        const contatos = await mobileApi.mensagensContatos(token);
        if (!active) return;
        const total = contatos.reduce((sum, contato) => sum + Number(contato.naoLidas || 0), 0);
        if (unreadBefore.current !== null && total > unreadBefore.current) {
          const contato = contatos.find(c => Number(c.naoLidas || 0) > 0);
          Alert.alert('Nova mensagem', `Você recebeu uma mensagem${contato?.nome ? ` de ${contato.nome}` : ''}.`);
        }
        unreadBefore.current = total;
      } catch { /* O contador será atualizado quando a conexão voltar. */ }
    };
    verificarNotificacoes();
    const timer = setInterval(verificarNotificacoes, 12000);
    return () => { active = false; clearInterval(timer); };
  }, [autenticado, token, usuario?.perfil]);

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!autenticado) return authScreen === 'cadastro'
    ? <CadastroScreen onVoltar={() => setAuthScreen('login')} />
    : <LoginScreen onCadastrar={() => setAuthScreen('cadastro')} />;
  if (appScreen === 'profile') return <ProfileScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'turmas') return <TurmasScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'vdc') return <VdcScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'saa') return <SaaScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'requerimentos') return <RequerimentosScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'messages') return <MessagesScreen onVoltar={() => setAppScreen('home')} />;
  if (appScreen === 'admin' && usuario?.perfil === 'ADMIN') return <AdminScreen onVoltar={() => setAppScreen('home')} />;
  return <HomeScreen onPerfil={() => setAppScreen('profile')} onTurmas={() => setAppScreen('turmas')} onVdc={() => setAppScreen('vdc')} onSaa={() => setAppScreen('saa')} onRequerimentos={() => setAppScreen('requerimentos')} onAdmin={() => setAppScreen('admin')} onMensagens={() => setAppScreen('messages')} />;
}

export default function App() {
  return <AuthProvider><SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} /><MobileApp /></SafeAreaView></AuthProvider>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: COLORS.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg } });
