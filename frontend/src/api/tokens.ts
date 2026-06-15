// Token storage for the session. localStorage keeps the user logged in across
// reloads; acceptable for an internal ops panel. The refresh token is rotated on
// every use server-side, so a stolen copy is short-lived.
const ACCESS_KEY = "willy.accessToken";
const REFRESH_KEY = "willy.refreshToken";

export const tokens = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },

  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },

  set(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
