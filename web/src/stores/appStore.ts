import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AppState = {
  token: string;
  namespace: string;
  userName: string;
  setToken: (token: string) => void;
  clearToken: () => void;
  setNamespace: (namespace: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: '',
      namespace: 'default',
      userName: '当前用户',
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: '' }),
      setNamespace: (namespace) => set({ namespace }),
    }),
    {
      name: 'k8s-admin-app',
    },
  ),
);
