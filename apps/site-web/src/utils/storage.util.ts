const USER_EMAIL_KEY = 'user_email';

export const storageUtil = {
  /**
   * Get user email from localStorage
   */
  getUserEmail: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(USER_EMAIL_KEY);
  },

  /**
   * Save user email to localStorage
   */
  setUserEmail: (email: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_EMAIL_KEY, email);
  },

  /**
   * Remove user email from localStorage
   */
  clearUserEmail: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(USER_EMAIL_KEY);
  },
};