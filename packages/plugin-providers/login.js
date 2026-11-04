#!/usr/bin/env node
// login.js — Script auxiliar para fazer login no Antigravity (Google OAuth 2.0)
//
// Execute UMA vez no terminal:
//   node packages/plugin-providers/login.js
//
// O script:
//   1. Abre um servidor HTTP temporário em 127.0.0.1:3001/callback
//   2. Abre o browser automaticamente com a URL de autorização Google
//   3. Após o callback, troca o código pelo token
//   4. Envia o GrantRecord ao proxy do Harness, que persiste pelo credentials service
//      sob a chave "providers-antigravity/antigravity-oauth"
//   5. O proxy em :3005 lê o token automaticamente na próxima requisição

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { discoverAntigravityProject } from './antigravity-proxy.js';
import { URLSearchParams, URL } from 'node:url';

import { execSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';

const INSECURE_TLS = process.env.ANTIGRAVITY_INSECURE_TLS === '1';
if (INSECURE_TLS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BUNDLED_CLIENT_ID = '__ANTIGRAVITY_OAUTH_CLIENT_ID__';
const BUNDLED_CLIENT_SECRET = '__ANTIGRAVITY_OAUTH_CLIENT_SECRET__';
const bundledValue = (value) => value.startsWith('__ANTIGRAVITY_') ? '' : value;
const CLIENT_ID = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || bundledValue(BUNDLED_CLIENT_ID);
const CLIENT_SECRET = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || bundledValue(BUNDLED_CLIENT_SECRET);
if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Defina ANTIGRAVITY_OAUTH_CLIENT_ID e ANTIGRAVITY_OAUTH_CLIENT_SECRET antes de executar o login.');
}
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'http://127.0.0.1:3001/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');

// ── helpers ───────────────────────────────────────────────────────────────────

function randomB64(n = 32) {
  return randomBytes(n).toString('base64url').replace(/=+$/, '');
}
function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
        rejectUnauthorized: !INSECURE_TLS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Token endpoint ${res.statusCode}: ${data}`));
          } else {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`JSON inválido: ${data}`)); }
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

const state = randomB64(16);

const authUrl = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES,
  state,
  access_type: 'offline',
  prompt: 'consent',
}).toString()}`;

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   Antigravity — Login Google OAuth 2.0   ║');
console.log('╚══════════════════════════════════════════╝\n');
console.log('Abrindo o navegador... Se não abrir, copie e cole a URL abaixo:\n');
console.log(authUrl);
console.log('\nAguardando callback em http://127.0.0.1:3001/callback ...\n');

// Abrir no browser (Windows)
try { execSync(`start "" "${authUrl}"`); } catch {}

const { code, receivedState } = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:3001');
    if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

    const code  = u.searchParams.get('code');
    const st    = u.searchParams.get('state');
    const err   = u.searchParams.get('error');

    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(`<h2>Erro: ${err}</h2><p>Pode fechar esta aba.</p>`);
      server.close();
      reject(new Error(`OAuth error: ${err}`));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0">
        <h1 style="color:#4ade80">✅ Autenticado com sucesso!</h1>
        <p>O Antigravity foi conectado ao Harness.<br>Pode fechar esta aba.</p>
      </body></html>
    `);
    server.close();
    resolve({ code, receivedState: st });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      reject(new Error('Porta 3001 já está em uso. Feche o Harness, tente de novo, ou aguarde o login terminar.'));
    } else {
      reject(e);
    }
  });

  server.listen(3001, '127.0.0.1');
});

if (receivedState !== state) {
  console.error('❌ State inválido — possível ataque CSRF. Tente novamente.');
  process.exit(1);
}

console.log('✅ Código recebido! Trocando pelo access_token...\n');

const tokens = await postForm(GOOGLE_TOKEN_URL, {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code,
  redirect_uri: REDIRECT_URI,
  grant_type: 'authorization_code',
});

console.log('🔎 Descobrindo projeto Cloud Code da conta...\n');
const bootstrap = await discoverAntigravityProject(tokens.access_token);

const payload = {
  access_token:  tokens.access_token,
  refresh_token: tokens.refresh_token,
  expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
  token_type:    tokens.token_type ?? 'Bearer',
  scope:         tokens.scope ?? SCOPES,
  project_id:    bootstrap.project_id,
  tier:          bootstrap.tier,
  email:         bootstrap.email,
};

// The standalone helper deliberately does not edit .credentials.yaml. Direct
// file writes race the live credentials service and previously corrupted YAML.
// Commit through the same local OpenAI proxy, which delegates to
// ctx.credentials.modifyRecord under the provider's file lock.
const commitResponse = await fetch('http://127.0.0.1:3005/internal/oauth/commit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer antigravity-proxy-internal',
  },
  body: JSON.stringify(payload),
});
if (!commitResponse.ok) {
  throw new Error(`Falha ao salvar grant pelo Harness (${commitResponse.status}): ${await commitResponse.text()}`);
}

console.log('✅ Token salvo pelo credential service do Harness.');
console.log(`   Expira em: ${new Date(payload.expires_at).toLocaleString('pt-BR')}`);
if (!payload.refresh_token) {
  console.warn('\n⚠️  Nenhum refresh_token retornado. O login vai expirar em 1h.');
  console.warn('   Se isso acontecer, rode este script novamente.\n');
} else {
  console.log('   Refresh token: ✅ recebido (renovação automática habilitada)');
}
console.log('\n🚀 Pronto! Volte ao Harness e use um modelo Antigravity.\n');
