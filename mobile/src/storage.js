import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "rateif.mobile.token";
const REFRESH_TOKEN_KEY = "rateif.mobile.refresh-token";

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveRefreshToken(token) {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken() {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function removeAuthTokens() {
  await Promise.all([removeToken(), removeRefreshToken()]);
}
