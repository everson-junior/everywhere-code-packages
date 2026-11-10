# Everywhere Harness Monorepo 🛒

Repositório monorepo oficial do ecossistema **Everywhere Harness**: contém o launcher CLI (`@everywhere-harness/ewh`), identidade visual UI, provedores e o marketplace de plugins e presets.

---

## 📦 Pacotes no Monorepo

| Pacote | Diretório | Descrição |
|---|---|---|
| [`@everywhere-harness/ewh`](packages/ewh) | `packages/ewh` | CLI oficial do Everywhere Harness (boot de profiles, launcher e instalador automático de plugins no perfil web). |
| [`@everywhere-harness/client-ui-chat`](packages/client-ui-chat) | `packages/client-ui-chat` | Identidade visual Everywhere do chat e da sidebar: marca, wordmark, hero animado e slots. |
| [`@everywhere-harness/plugin-providers`](packages/plugin-providers) | `packages/plugin-providers` | Provedor Antigravity com Google OAuth, proxy Cloud Code, ferramentas, streaming e suporte multimodal. |
| [`@everywhere-harness/preset-protheus`](packages/preset-protheus) | `packages/preset-protheus` | Preset especializado para desenvolvimento em **TOTVS Protheus ERP** (AdvPL/TLPP, 35+ skills e migração SmartX). |

---

## 🌟 Como Usar no Everywhere Harness (Discover / Navegador de Plugins)

1. Abra as **Configurações (Settings)** no Everywhere Harness Web ou Desktop.
2. Navegue até **Built-in plugins** > aba **Discover (Descobrir)**.
3. Clique em **Index sources (Fontes de índice)**.
4. Adicione a URL do índice deste marketplace:
   ```text
   https://raw.githubusercontent.com/everson-junior/everywhere-code-packages/main/index.json
   ```
5. Os plugins e presets deste repositório aparecerão listados no catálogo prontos para instalação com um clique!

---

## 🛠️ Desenvolvimento e Validação

O projeto utiliza **Node.js `>=24.9.0`** e **pnpm `11.21.0`** com suporte a workspaces (`pnpm-workspace.yaml`).

### Instalação

```sh
pnpm install
```

### Validações e Testes

```sh
# Executar todos os testes do monorepo
pnpm test

# Validação do catálogo de plugins
pnpm run validate:index

# Verificação de tipos TypeScript (client-ui-chat)
pnpm run typecheck

# Build dos pacotes necessários (client-ui-chat)
pnpm run build

# Teste e validação específica de cada pacote
pnpm --filter @everywhere-harness/ewh run test
pnpm --filter @everywhere-harness/client-ui-chat run test
pnpm --filter @everywhere-harness/client-ui-chat run test:pack
```

### Empacotamento npm (Geração dos Tarballs `.tgz`)

Para testar a geração dos pacotes npm sem publicar:

```sh
# Gerar tarballs para todos os pacotes
pnpm --filter @everywhere-harness/ewh pack --pack-destination /tmp/dist
pnpm --filter @everywhere-harness/client-ui-chat pack --pack-destination /tmp/dist
pnpm --filter @everywhere-harness/plugin-providers pack --pack-destination /tmp/dist
pnpm --filter @everywhere-harness/preset-protheus pack --pack-destination /tmp/dist
```

---

## 🚀 Publicação no npm (GitHub Actions)

A publicação é gerenciada de forma centralizada pelo workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml):

1. **Gatilhos**:
   - Push na branch `main` com alterações em `packages/**` ou `index.json`.
   - Criação de uma Release no GitHub.
   - Execução manual via **Workflow Dispatch** com opção de `dist_tag` (padrão: `latest`).

2. **Secrets necessários**:
   - `NPM_TOKEN` (ou `NPM_ACCESS_TOKEN`): Token de automação com permissão de publicação para o escopo `@everywhere-harness`.
   - `ANTIGRAVITY_OAUTH_CLIENT_ID` e `ANTIGRAVITY_OAUTH_CLIENT_SECRET`: Credenciais OAuth necessárias para materialização segura do artefato de `plugin-providers`.

3. **Fluxo seguro de versionamento**:
   - O workflow verifica cada pacote: se a versão já existir no registro npm (`npm view <pkg>@<ver>`), ela é pulada com segurança.
   - Somente pacotes com versão incrementada são publicados via `pnpm publish --access public`.
