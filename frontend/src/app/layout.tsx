import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Texo as a Service",
  description: "Análisis conversacional de datos de clientes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
