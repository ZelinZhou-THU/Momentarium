/** 会话令牌的 localStorage 存取（唯一存储实现；sessionStore 与页面不直接碰 localStorage）。 */
const TOKEN_STORAGE_KEY = "momentarium.session.token";

export const readStoredToken = (): string | null =>
  window.localStorage.getItem(TOKEN_STORAGE_KEY);

export const storeToken = (token: string): void => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearStoredToken = (): void => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
};
