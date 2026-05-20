import axios from "axios";

/**
 * Cliente axios preconfigurado para hablar con el backend.
 *
 * withCredentials: true es CRÍTICO — le dice al navegador que incluya
 * las cookies (donde está el JWT) en cada request al backend.
 * Sin esto, la httpOnly cookie nunca se envía y todas las rutas
 * protegidas devuelven 401.
 */
const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

export default api;
