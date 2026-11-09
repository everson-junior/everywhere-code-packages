// @everywhere-harness/plugin-providers — Host plugin
//
// Registers:
//   1. An authorization flow "providers-antigravity/antigravity-oauth" that
//      performs Google OAuth 2.0 Authorization Code, opens a temporary
//      HTTP callback server on 127.0.0.1:3001,
//      exchanges the authorization code for tokens, and commits a GrantRecord.
//   2. A local OpenAI-compatible proxy on 127.0.0.1:3005 that reads the stored
//      GrantRecord, refreshes the access_token when needed, translates OpenAI
//      requests, and streams them through the Google Cloud Code endpoint.
//
// Both pieces use the Harness credential seam:
//   • The Grant is stored under credential key
//     "providers-antigravity/antigravity-oauth".
//   • The llm-pi-ai apiKeyEnv "ANTIGRAVITY_PROXY_KEY" is stored as a plain
//     api-key record so the pi-ai adapter can forward it to the local proxy
//     (the proxy ignores it; the real auth is the refreshed Google token).

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import {
  buildAntigravityEnvelope,
  collectOpenAIResponse,
  discoverAntigravityProject,
  requestAntigravity,
  streamOpenAIResponse,
} from './antigravity-proxy.js';

// Corporate TLS interception is opt-in. Prefer NODE_EXTRA_CA_CERTS; use
// ANTIGRAVITY_INSECURE_TLS=1 only in a trusted development network.
if (process.env.ANTIGRAVITY_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// ── OAuth constants ─────────────────────────────────────────────────
// Never ship OAuth credentials in the marketplace package. Operators provide
// a Desktop OAuth client through the launch environment or profile shell env.
const BUNDLED_OAUTH_CLIENT_ID = '__ANTIGRAVITY_OAUTH_CLIENT_ID__';
const BUNDLED_OAUTH_CLIENT_SECRET = '__ANTIGRAVITY_OAUTH_CLIENT_SECRET__';
const bundledValue = (value) => value.startsWith('__ANTIGRAVITY_') ? '' : value;
const GOOGLE_CLIENT_ID = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || bundledValue(BUNDLED_OAUTH_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || bundledValue(BUNDLED_OAUTH_CLIENT_SECRET);

function assertOAuthConfigured() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const error = new Error(
      'Antigravity OAuth não configurado. Defina ANTIGRAVITY_OAUTH_CLIENT_ID e ANTIGRAVITY_OAUTH_CLIENT_SECRET antes de iniciar o Harness.'
    );
    error.code = 'antigravity_oauth_not_configured';
    throw error;
  }
}
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 3001;
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');

// ── Proxy constants ────────────────────────────────────────────────
const PROXY_HOST = process.env.ANTIGRAVITY_PROXY_HOST || '127.0.0.1';
const PROXY_PORT = Number(process.env.ANTIGRAVITY_PROXY_PORT || 3005);
// Credential refs / keys
const CRED_KEY = 'providers-antigravity/antigravity-oauth';
const PROXY_KEY_REF = 'ANTIGRAVITY_PROXY_KEY';
const PROXY_INTERNAL_KEY = 'antigravity-proxy-internal';

const DEFAULT_ANTIGRAVITY_PROVIDER = {
  displayName: 'Antigravity',
  api: 'openai-completions',
  baseURL: 'http://127.0.0.1:3005/v1',
  apiKeyEnv: PROXY_KEY_REF,
  defaultContextWindow: 1048576,
  defaultMaxTokens: 65536,
  defaultInput: ['text', 'image'],
  models: [
    { id: 'antigravity/gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', input: ['text', 'image'] },
    { id: 'antigravity/gemini-3.7-flash-medium', name: 'Gemini 3.7 Flash (Medium)', input: ['text', 'image'] },
    { id: 'antigravity/gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)', input: ['text', 'image'] },
    { id: 'antigravity/gemini-3.7-flash-tiered', name: 'Gemini 3.7 Flash (Tiered)', input: ['text', 'image'] },
    { id: 'antigravity/gemini-pro-agent', name: 'Gemini Pro Agent', contextWindow: 2097152, input: ['text', 'image'] },
    { id: 'antigravity/gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', contextWindow: 2097152, input: ['text', 'image'] },
    { id: 'antigravity/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', input: ['text', 'image'] },
    { id: 'antigravity/claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', contextWindow: 200000, maxTokens: 16384, input: ['text', 'image'] },
    { id: 'antigravity/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 16384, input: ['text', 'image'] },
    { id: 'antigravity/gpt-oss-120b-medium', name: 'GPT OSS 120B (Medium)', contextWindow: 131072, maxTokens: 32768, input: ['text'] },
  ],
};

const DEFAULT_OMNIROUTE_PROVIDER = {
  displayName: 'Omniroute',
  api: 'openai-completions',
  baseURL: 'http://localhost:2028/v1',
  apiKeyEnv: 'OMNIROUTE_API_KEY',
  defaultContextWindow: 872000,
  defaultMaxTokens: 128000,
  defaultInput: ['text', 'image'],
  models: [
    { id: 'auto/best-coding', name: 'Auto Best Coding', contextWindow: 872000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'auto/best-reasoning', name: 'Auto Best Reasoning', contextWindow: 872000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'auto/best-fast', name: 'Auto Best Fast', contextWindow: 872000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'auto/best-vision', name: 'Auto Best Vision', contextWindow: 872000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'auto/best-chat', name: 'Auto Best Chat', contextWindow: 872000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1048576, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', contextWindow: 131072, maxTokens: 32768, input: ['text'] },
    { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, maxTokens: 8192, input: ['text', 'image'] },
  ],
};

async function ensureDefaultProviderRoutes(ctx) {
  const settings = ctx.get('settings');
  if (settings?.describe && settings?.mutate) {
    const descriptor = settings.describe().find((item) => {
      const ns = String(item.ns);
      return ns === 'llm-pi-ai' || ns === 'include:llm-pi-ai' || ns.endsWith(':llm-pi-ai');
    });
    const existing = descriptor?.value?.providers || {};
    const additions = [];
    if (!Object.hasOwn(existing, 'antigravity')) additions.push({
      op: 'set',
      path: ['providers', 'antigravity'],
      value: structuredClone(DEFAULT_ANTIGRAVITY_PROVIDER),
    });
    if (!Object.hasOwn(existing, 'custom-providers')) additions.push({
      op: 'set',
      path: ['providers', 'custom-providers'],
      value: structuredClone(DEFAULT_OMNIROUTE_PROVIDER),
    });
    if (additions.length === 0) return;
    await settings.mutate(String(descriptor.ns), additions, descriptor.revision);
    ctx.logger.info('Configured default Antigravity and Omniroute routes in llm-pi-ai settings.');
    return;
  }

  // Compatibility fallback for compositions without the Settings service.
  const editor = ctx.get('configEditor');
  if (!editor) return;
  const entry = editor.entries().find((candidate) => (
    candidate.options.id === 'llm-pi-ai'
    || candidate.options.id === 'include:llm-pi-ai'
    || candidate.options.name === '@deepseek-ai/dsh-llm-pi-ai'
  ));
  if (!entry) {
    ctx.logger.warn('Antigravity/Omniroute routes were not configured: llm-pi-ai is not mounted.');
    return;
  }
  const existing = entry.options.config?.providers || {};
  const additions = {};
  if (!Object.hasOwn(existing, 'antigravity')) additions.antigravity = structuredClone(DEFAULT_ANTIGRAVITY_PROVIDER);
  if (!Object.hasOwn(existing, 'custom-providers')) additions['custom-providers'] = structuredClone(DEFAULT_OMNIROUTE_PROVIDER);
  if (Object.keys(additions).length === 0) return;
  await editor.edit(entry, (raw) => ({ ...raw, providers: { ...(raw.providers || {}), ...additions } }));
}

// ── Cordis plugin ──────────────────────────────────────────────────
export const inject = ['authorization', 'credentials', 'settings', 'configEditor'];

// ── Helpers ────────────────────────────────────────────────────────

/** @param {number} length */
function randomB64(length = 32) {
  return randomBytes(length).toString('base64url').replace(/=+$/g, '');
}

/**
 * @param {string} url
 * @param {Record<string, string>} body
 */
async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Token endpoint ${res.status}: ${text}`);
  }
  return json;
}

/**
 * @param {string} code
 */
async function exchangeCode(code) {
  assertOAuthConfigured();
  return postForm(GOOGLE_TOKEN_URL, {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
}

/** @param {string} refreshToken */
async function refreshAccessToken(refreshToken) {
  assertOAuthConfigured();
  return postForm(GOOGLE_TOKEN_URL, {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

// ── Plugin apply ───────────────────────────────────────────────────

/**
 * @param {import('cordis').Context & {
 *   authorization: any,
 *   credentials: any,
 * }} ctx
 */
export function apply(ctx) {
  // Add the provider routes to the already-mounted llm-pi-ai adapter.
  // This is idempotent and never mounts a second adapter instance. The first
  // pass may run before the profile row has finished reconciling, so retry on
  // the Loader's settled config-reload event as well.
  const reconcileRoutes = () => {
    void ensureDefaultProviderRoutes(ctx).catch((error) => {
      ctx.logger.warn(`Could not configure default provider routes: ${String(error?.message || error)}`);
    });
  };
  ctx.effect(() => {
    const disposeReload = ctx.on('app-boot/config-reload', reconcileRoutes);
    reconcileRoutes();
    return disposeReload;
  });

  // ── Register OAuth authorization flow ────────────────────────────
  const disposeFlow = ctx.authorization.registerFlow({
    key: CRED_KEY,
    label: 'Antigravity (Google)',
    methods: [{ id: 'oauth', label: 'Sign in with Google' }],

    async run(session) {
      assertOAuthConfigured();
      const state = randomB64(24);

      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      session.notify({
        message: 'Abra o navegador para entrar com sua conta Google…',
        url: authUrl.toString(),
      });

      // Spin a temporary callback server and wait for the browser
      const code = await new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
          const requestUrl = new URL(req.url || '/', `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
          if (requestUrl.pathname !== CALLBACK_PATH) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const error = requestUrl.searchParams.get('error');
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><meta charset="utf-8">
              <title>Login cancelado</title>
              <h2>Login cancelado</h2>
              <p>${error}</p>
              <p>Pode fechar esta aba.</p>`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          const returnedState = requestUrl.searchParams.get('state');
          if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><meta charset="utf-8"><h2>State inválido</h2>');
            server.close();
            reject(new Error('OAuth state mismatch'));
            return;
          }

          const authCode = requestUrl.searchParams.get('code');
          if (!authCode) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><meta charset="utf-8"><h2>Sem code</h2>');
            server.close();
            reject(new Error('OAuth: no code returned'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><meta charset="utf-8">
            <title>Antigravity autenticado</title>
            <style>body{font-family:system-ui;margin:3rem auto;max-width:480px;text-align:center;color:#222}</style>
            <h2>✅ Autenticado com sucesso</h2>
            <p>O Antigravity foi conectado ao Harness.</p>
            <p>Pode fechar esta aba.</p>`);
          server.close();
          resolve(authCode);
        });

        server.on('error', (err) => reject(err));

        if (session.signal) {
          const onAbort = () => {
            try { server.close(); } catch {}
            reject(new Error('Fluxo cancelado pelo usuário'));
          };
          session.signal.addEventListener('abort', onAbort, { once: true });
        }

        server.listen(CALLBACK_PORT, CALLBACK_HOST);
      });

      // Exchange code, then bootstrap the account's Cloud Code project.
      const tokens = await exchangeCode(code);
      const bootstrap = await discoverAntigravityProject(tokens.access_token);
      const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

      // Persist the token together with the upstream project identity.
      await session.commit({
        kind: 'grant',
        payload: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || '',
          expires_at: expiresAt,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope || SCOPES,
          project_id: bootstrap.project_id,
          tier: bootstrap.tier,
          email: bootstrap.email,
        },
      });

      // Also populate the proxy key reference so llm-pi-ai resolves it
      try {
        await ctx.credentials.set(PROXY_KEY_REF, PROXY_INTERNAL_KEY);
      } catch {
        // fallback: user may need to set it manually in Settings → Models
      }

      session.notify({ message: '✅ Antigravity autenticado com sucesso!' });
    },
  });

  ctx.effect(() => disposeFlow);

  // ── Token accessor with cross-process refresh via modifyRecord ──
  /** @returns {Promise<any>} a valid grant payload */
  async function getValidGrant() {
    const current = await ctx.credentials.readRecord(CRED_KEY);
    if (!current || current.kind !== 'grant' || !current.payload) {
      throw new Error(
        'Antigravity não autenticado. Vá em Settings → Models → Antigravity e entre com sua conta Google.'
      );
    }
    const payload = /** @type {any} */ (current.payload);
    const now = Date.now();
    if (payload.access_token && payload.expires_at > now + 300_000) {
      if (!payload.project_id) {
        const bootstrap = await discoverAntigravityProject(payload.access_token);
        const enriched = await ctx.credentials.modifyRecord(CRED_KEY, async (rec) => ({
          kind: 'grant',
          payload: { ...rec?.payload, ...bootstrap },
        }));
        return enriched.payload;
      }
      return payload;
    }
    if (!payload.refresh_token) {
      throw new Error(
        'Antigravity: refresh_token ausente. Re-autentique em Settings → Models → Antigravity.'
      );
    }

    // Serialized refresh under the credential-store lock
    const updated = await ctx.credentials.modifyRecord(CRED_KEY, async (rec) => {
      const p = rec && rec.kind === 'grant' ? /** @type {any} */ (rec.payload) : null;
      if (!p || !p.refresh_token) return rec;
      // Re-check under lock: another process may have refreshed already
      if (p.access_token && p.expires_at > Date.now() + 300_000 && p.project_id) return rec;
      let accessToken = p.access_token;
      let fresh = null;
      if (!accessToken || p.expires_at <= Date.now() + 300_000) {
        fresh = await refreshAccessToken(p.refresh_token);
        accessToken = fresh.access_token;
      }
      const bootstrap = p.project_id ? null : await discoverAntigravityProject(accessToken);
      return {
        kind: 'grant',
        payload: {
          ...p,
          access_token: accessToken,
          refresh_token: fresh?.refresh_token || p.refresh_token,
          expires_at: fresh ? Date.now() + (fresh.expires_in || 3600) * 1000 : p.expires_at,
          token_type: fresh?.token_type || p.token_type || 'Bearer',
          scope: fresh?.scope || p.scope,
          ...(bootstrap || {}),
        },
      };
    });

    const final = /** @type {any} */ (updated?.payload);
    if (!final?.access_token) throw new Error('Antigravity: falha ao renovar o token.');
    if (!final?.project_id) throw new Error('Antigravity: projeto Cloud Code não descoberto.');
    return final;
  }

  // ── Local OpenAI-compatible proxy on 127.0.0.1:3005 ──────────────
  const proxy = createServer(async (req, res) => {
    // Harness Web may use a dynamic loopback port. Reflect only trusted local
    // origins; never grant browser access to an external origin.
    const origin = req.headers.origin;
    let localOrigin = false;
    if (origin) {
      try {
        const parsed = new URL(origin);
        localOrigin = (parsed.protocol === 'http:' || parsed.protocol === 'https:')
          && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1');
      } catch {}
    }
    if (localOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    }
    // CORS preflight. Refuse external origins explicitly.
    if (req.method === 'OPTIONS') {
      if (origin && !localOrigin) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Origin not allowed' } }));
      } else {
        res.writeHead(204);
        res.end();
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', provider: 'antigravity' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/internal/oauth/status') {
      try {
        const record = await ctx.credentials.readRecord(CRED_KEY);
        const payload = record?.payload;
        if (payload?.access_token) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ connected: true, email: payload.email || '', project_id: payload.project_id || '' }));
          return;
        }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ connected: false }));
      return;
    }

    if (req.method === 'POST' && req.url === '/internal/oauth/start') {
      if (req.headers.authorization !== `Bearer ${PROXY_INTERNAL_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
        return;
      }
      // Clear an abandoned browser attempt before starting a new one. cancel()
      // is a no-op when no attempt is active.
      ctx.authorization.cancel(CRED_KEY);
      // Allow the aborted runner to release its in-flight guard first.
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Wait only until the flow emits its authorization URL, then return it to
      // the browser. The remaining OAuth attempt continues asynchronously.
      let settled = false;
      let resolveUrl;
      let rejectUrl;
      const urlReady = new Promise((resolve, reject) => { resolveUrl = resolve; rejectUrl = reject; });
      ctx.authorization.begin({
        key: CRED_KEY,
        method: 'oauth',
        interaction: {
          notify(notice) {
            if (!settled && notice?.url) {
              settled = true;
              resolveUrl(notice.url);
            }
          },
          prompt: async () => { throw new Error('Este fluxo não requer entrada no Harness.'); },
        },
      }).catch((err) => {
        if (!settled) {
          settled = true;
          rejectUrl(err);
        }
        ctx.logger?.('plugin-providers')?.warn?.(`Antigravity login falhou: ${String(err?.message || err)}`);
      });
      try {
        const url = await Promise.race([
          urlReady,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao preparar o login Google.')), 5000)),
        ]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'login_started', url }));
      } catch (err) {
        res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: String(err?.message || err) } }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/internal/oauth/logout') {
      if (req.headers.authorization !== `Bearer ${PROXY_INTERNAL_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
        return;
      }
      try {
        await ctx.credentials.deleteRecord(CRED_KEY);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'logged_out' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: String(err?.message || err) } }));
      }
      return;
    }

    // Standalone login helper commit seam. Never writes YAML directly: the
    // credentials service serializes, locks, validates and atomically replaces it.
    if (req.method === 'POST' && req.url === '/internal/oauth/commit') {
      if (req.headers.authorization !== `Bearer ${PROXY_INTERNAL_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        const payload = JSON.parse(raw);
        if (!payload?.access_token || !payload?.refresh_token || !Number.isFinite(payload?.expires_at) || !payload?.project_id) {
          throw new Error('Grant incompleto: access_token, refresh_token, expires_at e project_id são obrigatórios.');
        }
        await ctx.credentials.modifyRecord(CRED_KEY, async () => ({ kind: 'grant', payload }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'saved' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: String(err?.message || err) } }));
      }
      return;
    }

    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        object: 'list',
        data: [
          { id: 'antigravity/gemini-3.7-flash-high',     object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-3.7-flash-medium',   object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-3.7-flash-low',      object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-3.7-flash-tiered',   object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-pro-agent',          object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-3.1-pro-low',        object: 'model', owned_by: 'google' },
          { id: 'antigravity/gemini-3.1-flash-lite',     object: 'model', owned_by: 'google' },
          { id: 'antigravity/claude-opus-4-6-thinking',  object: 'model', owned_by: 'anthropic' },
          { id: 'antigravity/claude-sonnet-4-6',         object: 'model', owned_by: 'anthropic' },
          { id: 'antigravity/gpt-oss-120b-medium',       object: 'model', owned_by: 'openai' },
        ],
      }));
      return;
    }

    if (
      req.method === 'POST' &&
      (req.url === '/v1/chat/completions' || req.url === '/chat/completions')
    ) {
      let body = '';
      for await (const chunk of req) body += chunk;

      let grant;
      try {
        grant = await getValidGrant();
      } catch (err) {
        const status = Number(err?.status) || 401;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: {
          message: String(err?.message || err),
          type: status === 401 ? 'authentication_error' : 'invalid_request_error',
          code: err?.code || 'antigravity_unauthenticated',
        } }));
        return;
      }

      let parsedBody;
      try { parsedBody = JSON.parse(body); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON body', type: 'invalid_request_error' } }));
        return;
      }

      try {
        const envelope = buildAntigravityEnvelope(parsedBody, grant);
        const upstreamRes = await requestAntigravity(grant.access_token, grant.project_id, envelope);
        if (!upstreamRes.ok) {
          const errorText = await upstreamRes.text();
          res.writeHead(upstreamRes.status, { 'Content-Type': upstreamRes.headers.get('content-type') || 'application/json' });
          res.end(errorText);
          return;
        }
        if (parsedBody.stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          await streamOpenAIResponse(upstreamRes, parsedBody.model, res);
        } else {
          const result = await collectOpenAIResponse(upstreamRes, parsedBody.model);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        }
      } catch (err) {
        res.writeHead(Number(err?.status) || 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: {
          message: `Antigravity upstream: ${String(err?.message || err)}`,
          type: 'upstream_error',
          code: err?.code || 'bad_gateway',
        } }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Not found', type: 'invalid_request' } }));
  });

  proxy.on('error', (err) => {
    // Port already in use or similar — surface via Harness logs
    ctx.logger?.('plugin-providers')?.warn?.(
      `Antigravity proxy failed to start on ${PROXY_HOST}:${PROXY_PORT}: ${err.message}`
    );
  });

  proxy.listen(PROXY_PORT, PROXY_HOST);

  ctx.effect(() => () => {
    try { proxy.close(); } catch {}
  });

  // Ensure the proxy-key reference is seeded so llm-pi-ai doesn't fail
  // with MISSING_CREDENTIAL before the user signs in (the real auth is
  // the Google token; this one is just the dummy that pi-ai requires).
  (async () => {
    try {
      const info = await ctx.credentials.describe(PROXY_KEY_REF);
      if (!info?.configured) {
        await ctx.credentials.set(PROXY_KEY_REF, PROXY_INTERNAL_KEY);
      }
    } catch {
      // ignore — credential seam may be read-only in this profile
    }
  })();
}
