const DEFAULT_APP_ID = "egp-cotacao-app";
const DEFAULT_ADMIN_LOGIN = "egp242622";
const DEFAULT_ADMIN_PASSWORD = "Egpeletrificador40116124000151";
const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";

const normalizeUrl = (value?: string | null) =>
  value?.trim().replace(/\/+$/, "") ?? "";

export const ENV = {
  appId: process.env.VITE_APP_ID?.trim() || DEFAULT_APP_ID,
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  adminLogin: process.env.ADMIN_LOGIN?.trim() || DEFAULT_ADMIN_LOGIN,
  adminPassword: process.env.ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD,
  clientOrigin:
    normalizeUrl(process.env.CLIENT_ORIGIN) || DEFAULT_CLIENT_ORIGIN,
};
