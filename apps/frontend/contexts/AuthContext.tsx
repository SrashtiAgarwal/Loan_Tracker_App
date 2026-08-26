import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'beneficiary' | 'officer' | 'admin';

export interface User {
  id: string;
  phone_number: string;
  role: UserRole;
  name: string | null;
  fcm_token?: string | null;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  sendOTP: (phoneNumber: string) => Promise<{ otp?: string }>;
  login: (phoneNumber: string, otp: string, name?: string, role?: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise an Indian phone number to +91XXXXXXXXXX */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+91')) return phone;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]   = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate session on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.warn('[AuthContext] Failed to rehydrate session:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── sendOTP ──────────────────────────────────────────────────────────────
  const sendOTP = useCallback(async (phoneNumber: string): Promise<{ otp?: string }> => {
    const formatted = formatPhone(phoneNumber);
    const res = await authAPI.sendOTP(formatted);
    // Returns { message, data: { otp, phone } } in dev — pass otp up to UI for alert
    return { otp: res.data?.data?.otp };
  }, []);

  // ── login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (
    phoneNumber: string,
    otp: string,
    name?: string,
    role?: UserRole
  ): Promise<void> => {
    const formatted = formatPhone(phoneNumber);
    const res = await authAPI.verifyOTP(formatted, otp, name, role);
    const { access_token, user: userData } = res.data;

    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, access_token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(userData)),
    ]);

    setToken(access_token);
    setUser(userData);
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    setToken(null);
    setUser(null);
  }, []);

  // ── refreshUser ───────────────────────────────────────────────────────────
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const res = await authAPI.getMe();
      const updated: User = res.data;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
      setUser(updated);
    } catch (err) {
      console.warn('[AuthContext] Could not refresh user:', err);
    }
  }, []);

  // ─── Value ────────────────────────────────────────────────────────────────
  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      isAuthenticated: !!user && !!token,
      sendOTP,
      login,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Convenience hook — returns true when the user is officer or admin */
export function useIsOfficer(): boolean {
  const { user } = useAuth();
  return user?.role === 'officer' || user?.role === 'admin';
}
