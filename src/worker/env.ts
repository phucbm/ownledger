import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  ASSETS?: Fetcher;
  /** https://<worker>.<subdomain>.workers.dev (or the custom domain), no trailing slash */
  PUBLIC_URL: string;
  /** owner/name of the private data repo */
  DATA_REPO: string;
  DATA_BRANCH?: string;
  /** GitHub logins allowed to sign in, comma-separated */
  ALLOWED_LOGINS: string;
  TIMEZONE?: string;
  // secrets (wrangler secret put; never in the repo)
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_SECRET: string;
  // `ownledger dev` only
  DEV_DATA_URL?: string;
  DEV_LOGIN?: string;
}

export interface Props {
  login: string;
}

export function allowed(env: Env, login: string): boolean {
  return env.ALLOWED_LOGINS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
}
