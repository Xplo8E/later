export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  MCP_ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  OWNER_NAME?: string;
  OWNER_HANDLE?: string;
  LOCAL_DEV?: string;
}
