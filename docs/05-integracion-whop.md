# 05 · Integración con Whop

Revisión: **2026-10-24**. Whop proporciona identidad y checkout alojado. Terac coordina y cobra el trabajo de los profesionales. Esta implementación usa `@whop/sdk` 2.x en el backend y OAuth con PKCE en Expo/web; no requiere ejecutar la app dentro de Whop.

## Entornos y fuentes oficiales

| Servicio | Sandbox | Producción |
|----------|---------|------------|
| Panel y checkout | `https://sandbox.whop.com` | `https://whop.com` |
| API del SDK | `https://sandbox-api.whop.com/api/v1` | `https://api.whop.com/api/v1` |
| Base OAuth | `https://sandbox-api.whop.com/oauth` | `https://api.whop.com/oauth` |
| Backend | `WHOP_ENV=sandbox` | `WHOP_ENV=production` |
| Cliente Expo | `EXPO_PUBLIC_WHOP_ENV=sandbox` | `EXPO_PUBLIC_WHOP_ENV=production` |

El SDK selecciona `WhopEnvironment.Sandbox` o `.Production`. Las cuentas, claves y datos son independientes: cambiar el entorno exige reemplazar las credenciales y los IDs de app/producto/cuenta, además de registrar el webhook correspondiente. Fuentes: [guía oficial de sandbox](https://docs.whop.com/developer/guides/sandbox) y [ejemplo oficial con los hosts OAuth de ambos entornos](https://whop.com/blog/build-subscription-app/). La [guía OAuth](https://docs.whop.com/developer/guides/oauth) muestra el host de producción; el host OAuth de sandbox también está utilizado explícitamente en el ejemplo oficial citado.

El sandbox admite tarjetas de prueba: `4242 4242 4242 4242` aprueba y `4000 0000 0000 0002` rechaza. Usar fecha futura y CVC de tres dígitos. La guía documenta que payouts y métodos alternativos como Apple Pay/Google Pay no están disponibles; también advierte sobre Apps & Messaging y sobre disponibilidad de Elements. El flujo de este proyecto usa checkout alojado. Consultar estas limitaciones antes de probar capacidades adicionales. [Fuente oficial y tarjetas adicionales](https://docs.whop.com/developer/guides/sandbox).

## Variables y registro de URIs

Backend:

```dotenv
WHOP_ENV=sandbox
WHOP_CLIENT_ID=app_...
WHOP_CLIENT_SECRET=       # solo si la configuración OAuth de la app lo exige
WHOP_API_KEY=             # clave del mismo entorno
WHOP_ACCOUNT_ID=biz_...
WHOP_PRODUCT_ID=prod_...
WHOP_WEBHOOK_SECRET=
PUBLIC_API_URL=https://bilingualcheck-api.vercel.app
WEB_APP_URL=https://bilingualcheck-app.vercel.app
APP_SCHEME=bilingualcheck
```

`WEB_APP_URL` es la única variable nueva para estos cambios; está integrada en `env.ts` por el responsable de ese archivo. Debe contener solo el origen de la web, sin ruta, query ni fragmento. En desarrollo: `WEB_APP_URL=http://localhost:8081` y `PUBLIC_API_URL=http://localhost:8787`. El validador admite HTTP únicamente en `localhost`, `127.0.0.1` o `[::1]`; el puerto debe coincidir exactamente. En un dispositivo nativo, localhost corresponde al dispositivo: usar una API HTTPS accesible para probar el puente.

Cliente, sin secretos:

```dotenv
EXPO_PUBLIC_API_URL=https://bilingualcheck-api.vercel.app
EXPO_PUBLIC_WHOP_CLIENT_ID=app_...
EXPO_PUBLIC_WHOP_ENV=sandbox
```

Registrar estas **redirect URIs OAuth exactas** en la app Whop del entorno elegido:

- Web desplegada: `https://bilingualcheck-app.vercel.app/auth/callback`.
- Web local, al usar el origen local en la API: `http://localhost:8081/auth/callback`.
- Nativo, mediante puente HTTPS: `https://bilingualcheck-api.vercel.app/v1/auth/whop/callback/native`.

La API admite únicamente `${WEB_APP_URL}/auth/callback` y `${PUBLIC_API_URL}/v1/auth/whop/callback/native`. No acepta comodines, otros hosts, puertos, barras finales, query, fragmentos ni URLs con credenciales. Registrar una URI en Whop no amplía esta lista del servidor. Para previews, configurar un origen concreto en su API y registrarlo en Whop; no usar dominios de preview con login de Vercel para callbacks o webhooks.

La guía exige coincidencia exacta y muestra HTTP(S); no establece una garantía general de soporte para esquemas propios. Por eso **no se registra `bilingualcheck://auth/callback` en Whop**: es el destino interno del puente de la API. [Registro OAuth](https://docs.whop.com/developer/guides/oauth), [referencia de creación de apps](https://docs.whop.com/api-reference/beta/apps/create-app).

## OAuth web y nativo

Endpoints relativos a la base OAuth: `GET /authorize`, `POST /token`, `GET /userinfo`, `POST /revoke`. Scopes: `openid profile email`. El intercambio y la revocación envían **JSON**, como los ejemplos oficiales. El secreto opcional permanece en el backend; nunca se añade al bundle. [Protocolo y ejemplos oficiales](https://docs.whop.com/developer/guides/oauth).

### Web

1. `sign-in.tsx` prepara una petición Expo AuthSession con PKCE S256, `state` y `nonce`.
2. Antes de navegar a Whop en la misma pestaña, guarda verifier, state, URI, client ID, entorno y fecha en `sessionStorage`.
3. `/auth/callback` recupera esa transacción, valida state/origen/entorno y su caducidad de diez minutos; rechaza parámetros duplicados, código ausente y denegaciones.
4. Consume el estado temporal y elimina los parámetros OAuth del historial. Envía `{ code, code_verifier, redirect_uri }` a `POST /v1/auth/whop` una sola vez por montaje, también bajo React StrictMode.
5. El backend valida la URI, intercambia el código, consulta userinfo, actualiza el usuario y devuelve una sesión JWT propia. El callback guarda la sesión y navega a proyectos.

Un callback directo, caducado, denegado o fallido muestra una opción de reintento. El intercambio web se aborta tras 35 segundos para evitar una espera indefinida. Un código consumido requiere iniciar otra autorización. No se almacenan tokens de Whop en el navegador. El almacén de sesión propio existente usa `localStorage` en web; cambiarlo a cookies HttpOnly requiere trabajo separado.

### Nativo

AuthSession conserva PKCE y state en memoria. Whop vuelve al callback HTTPS de la API, que responde con una redirección al destino fijo `bilingualcheck://auth/callback`. Solo transmite `code`, `state`, `error` y `error_description`; no refleja `next`, URLs arbitrarias ni tokens. Usa `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. La app abre el navegador esperando ese esquema, verifica state mediante el parser de AuthSession e intercambia el código con la **URI HTTPS original**. Cancelar el navegador libera el botón; un fallo permite reintentar.

Usar un development build con el esquema de `app.json`, no Expo Go. La [documentación Expo SDK 58 de AuthSession](https://docs.expo.dev/versions/v58.0.0/sdk/auth-session/) explica PKCE y los callbacks; [WebBrowser SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/) describe las diferencias de retorno entre web, iOS y Android.

## Checkout: destino según plataforma

El cliente envía a `POST /v1/projects/:id/quote/accept`:

```json
{ "platform": "web" }
```

Contrato acordado para `routes/projects.ts`: `platform` opcional, enum `"web" | "native"`, con default `"native"` para clientes anteriores. La ruta calcula `returnTo` en servidor y lo pasa a `createProjectCheckout`; no debe aceptar destinos arbitrarios del navegador.

| Plataforma | `returnTo` interno permitido | `redirect_url` enviado a Whop |
|------------|-----------------------------|--------------------------------|
| Web | `${WEB_APP_URL}/checkout/return` | `${WEB_APP_URL}/checkout/return?project_id=…` |
| Nativo | `${APP_SCHEME}://checkout/return` | `${PUBLIC_API_URL}/checkout/return?platform=native&project_id=…` |

`createProjectCheckout` valida `returnTo` antes de llamar al SDK; si se invoca sin ese argumento su retorno por defecto es web. El puente `/checkout/return` de `app.ts` devuelve `platform=native` al esquema de la app, y `platform=web` o plataforma ausente al origen web configurado. Valida el UUID del proyecto y solo conserva `project_id`; rechaza plataformas ambiguas o inválidas. El SDK recibe siempre HTTP(S), evitando depender de soporte de esquemas propios en el checkout.

En web, el bloque `pay` usa `window.location.assign(purchase_url)`; así no espera un popup tras una llamada asíncrona. En nativo mantiene `openAuthSessionAsync` y la pantalla de retorno consulta el estado al cerrar o regresar. La pantalla valida `project_id`, sondea el backend y ofrece salida ante falta de ID, error o espera prolongada. Conserva compatibilidad con popups web anteriores mediante `maybeCompleteAuthSession`, con la comprobación de origen de Expo activa.

Cada checkout crea una configuración con plan de pago único al precio de la cotización y metadata `{ project_id, quote_id }`. La referencia admite `metadata`, `plan` y `redirect_url`; no se usa el ejemplo antiguo `variants.create`. [Crear checkout configuration](https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration).

**El retorno no acredita un pago.** Se ignoran como autoridad los parámetros `status`, `payment`, etc. Solo el webhook verificado y el estado guardado en servidor pueden permitir continuar el proyecto. No se supone que Whop añada siempre un conjunto concreto de parámetros al retorno. [Flujo oficial de checkout y retorno](https://whop.com/blog/add-checkout-to-nextjs-app/).

## Verificación sin cuentas y pendientes reales

```powershell
pnpm --filter @bc/api exec vitest run src/whop
pnpm --filter @bc/api typecheck
pnpm --filter @bc/mobile typecheck
```

Los tests propios viven en `apps/api/src/whop/`: transporte OAuth JSON de ambos entornos, secretos opcionales, errores upstream, emisión de sesión con DB mock, allowlist de URIs, puente nativo, creación de checkout con SDK mock y persistencia/consumo/caducidad de PKCE con navegador mock. No llaman a Whop, Supabase ni Terac.

Para validar de extremo a extremo todavía se necesitan:

- App OAuth y client ID reales del entorno correcto; secreto si lo requiere su configuración. Registrar las URIs anteriores y probar consentimiento, denegación y retorno web.
- API key, `biz_` y `prod_` reales, junto con webhook y secreto del mismo entorno. Probar checkout aprobado/rechazado con tarjeta de sandbox y entrega del webhook.
- API/BD configuradas y accesibles; comprobar creación del usuario y persistencia de la sesión propia.
- Development builds de iOS/Android: comprobar apertura del esquema después del puente HTTPS, cancelación y retorno del checkout en dispositivos.
- Al pasar a producción, sustituir todas las credenciales/IDs, registrar las URIs y webhook en producción y reconstruir Expo web después de cambiar `EXPO_PUBLIC_*`.

Los mocks no certifican el registro real de URIs, permisos de la clave, disponibilidad de OAuth sandbox para una cuenta concreta ni comportamiento del navegador del dispositivo. No se ha accedido a cuentas ni creado infraestructura. El apartado Whop del doc 09 puede conservar notas anteriores a esta revisión: para callbacks, JSON y hosts OAuth, esta sección recoge el comportamiento actualizado; los cambios de doc 09 se coordinan fuera de este alcance.

Los reembolsos automáticos quedan fuera de estos cambios; comprobar su implementación por separado antes de prometerlos. La revisión de las reglas vigentes de Apple/Google para pagos externos también queda pendiente antes de una publicación en tiendas.
