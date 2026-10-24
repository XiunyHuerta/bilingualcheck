// Función única de Vercel: sirve la app Hono empaquetada por `pnpm build`
// (esbuild). Todas las rutas llegan aquí por el rewrite de vercel.json.
export { default } from "../dist/server.mjs";
