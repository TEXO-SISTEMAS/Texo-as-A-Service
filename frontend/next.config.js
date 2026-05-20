/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * En producción local, Next.js y FastAPI corren en puertos distintos.
   * No se configura rewrites porque las llamadas van directo al backend
   * desde el cliente con axios (con withCredentials). Las cookies httpOnly
   * funcionan cross-origin porque ambos son localhost.
   */
};

module.exports = nextConfig;
