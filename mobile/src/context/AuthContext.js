import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { mobileApi, setTokenRefreshHandler } from "../api";
import { getToken, getRefreshToken, removeAuthTokens, saveToken, saveRefreshToken } from "../storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restore() {
      try {
        let storedToken = await getToken();
        let storedRefreshToken = await getRefreshToken();
        if (!storedToken && !storedRefreshToken) return;
        let data;
        try {
          if (!storedToken) throw new Error('Token de acesso ausente.');
          data = await mobileApi.perfil(storedToken);
        } catch {
          if (!storedRefreshToken) throw new Error('Sessão expirada.');
          const renewed = await mobileApi.refresh(storedRefreshToken);
          storedToken = renewed.token;
          storedRefreshToken = renewed.refreshToken;
          await saveToken(storedToken);
          await saveRefreshToken(storedRefreshToken);
          data = renewed.usuario || await mobileApi.perfil(storedToken);
        }
        if (mounted) {
          setToken(storedToken);
          setRefreshToken(storedRefreshToken);
          setUsuario(data);
        }
      } catch {
        await removeAuthTokens();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    restore();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!refreshToken) { setTokenRefreshHandler(null); return undefined; }
    let refreshing = false;
    const handler = async () => {
      if (refreshing) throw new Error('Renovação de sessão em andamento.');
      refreshing = true;
      try {
        const data = await mobileApi.refresh(refreshToken);
        await saveToken(data.token);
        await saveRefreshToken(data.refreshToken);
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUsuario(data.usuario);
        return data.token;
      } finally { refreshing = false; }
    };
    setTokenRefreshHandler(handler);
    return () => setTokenRefreshHandler(null);
  }, [refreshToken]);
  async function login(email, senha) {
    const data = await mobileApi.login(email, senha);
    await saveToken(data.token);
    await saveRefreshToken(data.refreshToken);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUsuario(data.usuario);
    return data;
  }

  async function cadastro(nome, email, senha, confirmarSenha) {
    const data = await mobileApi.cadastro(nome, email, senha, confirmarSenha);
    await saveToken(data.token);
    await saveRefreshToken(data.refreshToken);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUsuario(data.usuario);
    return data;
  }

  async function logout() {
    if (token || refreshToken) {
      try {
        await mobileApi.mensagensOffline(token);
      } catch {
        // A presença expira automaticamente se o dispositivo estiver sem rede.
      }
      try {
        await mobileApi.logout(token, refreshToken);
      } catch {
        // A limpeza local continua mesmo quando o backend já expirou o token.
      }
    }
    await removeAuthTokens();
    setToken(null);
    setRefreshToken(null);
    setUsuario(null);
  }

  async function atualizarPerfil(nome, email) {
    const data = await mobileApi.atualizarPerfil(token, nome, email);
    await saveToken(data.token);
    await saveRefreshToken(data.refreshToken);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUsuario(data.usuario);
    return data;
  }

  const value = useMemo(
    () => ({
      token,
      refreshToken,
      usuario,
      loading,
      autenticado: Boolean(token && usuario),
      login,
      cadastro,
      logout,
      atualizarPerfil
    }),
    [token, refreshToken, usuario, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
