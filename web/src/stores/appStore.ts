import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AppState = {
  token: string;
  namespace: string;
  userName: string;
  sessionMode: 'demo' | 'token';
  setToken: (token: string) => void;
  setUserName: (userName: string) => void;
  setSessionMode: (sessionMode: 'demo' | 'token') => void;
  clearToken: () => void;
  setNamespace: (namespace: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: '',
      namespace: 'default',
      userName: '当前用户',
      sessionMode: 'demo',
      setToken: (token) => set({ token }),
      setUserName: (userName) => set({ userName }),
      setSessionMode: (sessionMode) => set({ sessionMode }),
      clearToken: () => set({ token: '', sessionMode: 'demo', userName: '当前用户' }),
      setNamespace: (namespace) => set({ namespace }),
    }),
    {
      name: 'k8s-admin-app',
    },
  ),
);
