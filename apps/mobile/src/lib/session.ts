import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

// Sesión propia (JWT del backend) guardada en SecureStore.
// En web SecureStore no existe; se usa localStorage solo para desarrollo.

const KEY = "session";

const storage = {
  get: () => (Platform.OS === "web" ? Promise.resolve(localStorage.getItem(KEY)) : SecureStore.getItemAsync(KEY)),
  set: (v: string) => (Platform.OS === "web" ? Promise.resolve(localStorage.setItem(KEY, v)) : SecureStore.setItemAsync(KEY, v)),
  clear: () => (Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(KEY)) : SecureStore.deleteItemAsync(KEY)),
};

type SessionState = {
  token: string | null;
  ready: boolean;
  load: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  token: null,
  ready: false,
  load: async () => set({ token: await storage.get(), ready: true }),
  signIn: async (token) => {
    await storage.set(token);
    set({ token });
  },
  signOut: async () => {
    await storage.clear();
    set({ token: null });
  },
}));
