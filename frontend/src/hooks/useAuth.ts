"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface User {
  id: number;
  email: string;
  nombre: string;
}

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

/**
 * Hook para verificar la sesión activa del usuario.
 *
 * - Llama a GET /auth/me al montar el componente.
 * - Si la cookie JWT es válida, el backend devuelve los datos del usuario.
 * - Si no hay cookie o expiró, redirige a /login.
 *
 * Uso:
 *   const { user, loading, logout } = useAuth();
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const logout = async () => {
    await api.post("/auth/logout");
    router.push("/login");
  };

  return { user, loading, logout };
}
