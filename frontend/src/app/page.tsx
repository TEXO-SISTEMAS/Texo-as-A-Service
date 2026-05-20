import { redirect } from "next/navigation";

/**
 * La raíz del sitio redirige siempre a /dashboard.
 * Si el usuario no está autenticado, useAuth() en dashboard redirigirá a /login.
 */
export default function HomePage() {
  redirect("/dashboard");
}
