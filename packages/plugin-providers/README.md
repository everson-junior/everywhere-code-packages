# Antigravity Provider for Everywhere Harness

Integra o Antigravity ao Everywhere/DeepSeek Harness com autenticação Google OAuth, proxy local OpenAI-compatible e suporte a texto, imagens, streaming e ferramentas.

## Instalação

Instale o bundle pela loja de plugins. O bundle adiciona automaticamente:

- o Host plugin de OAuth/proxy;
- o provider `antigravity` em **Settings → Models**;
- os modelos disponíveis no seletor do chat;
- o botão **Conectar/Desconectar Antigravity** dentro do card do provider.

Não é necessário editar YAML nem executar comandos para autenticar. O artefato npm oficial recebe o OAuth Client durante o workflow de publicação, usando GitHub Actions Secrets; os valores não ficam no repositório. Operadores também podem substituí-los no ambiente que inicia o Harness:

```text
ANTIGRAVITY_OAUTH_CLIENT_ID=...
ANTIGRAVITY_OAUTH_CLIENT_SECRET=...
```

## Conectar a conta

1. Abra **Settings → Models**.
2. Localize o card **Antigravity**.
3. Clique em **Conectar Antigravity**.
4. Conclua o login Google na nova aba.
5. Após a confirmação, feche a aba e volte ao Harness.

O grant OAuth é salvo pelo credential service do Harness. Tokens são renovados automaticamente e nunca são gravados pelo plugin com manipulação manual de YAML.

## Arquitetura

```text
Harness llm-pi-ai
       │ OpenAI chat/completions (texto, imagens e ferramentas)
       ▼
127.0.0.1:3005
       │ token OAuth + projectId
       │ tradução OpenAI → Cloud Code
       ▼
daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
```

O callback OAuth usa temporariamente `127.0.0.1:3001/callback`. O proxy escuta apenas em loopback.

## Modelos

O bundle declara aliases Antigravity para as famílias Gemini, Claude e GPT OSS. A disponibilidade real e as cotas dependem da conta Google conectada e podem mudar no serviço upstream.

## Rede corporativa e TLS

A validação TLS permanece ativa por padrão. Em redes com inspeção TLS, prefira configurar a CA corporativa com `NODE_EXTRA_CA_CERTS`. Apenas em um ambiente de desenvolvimento confiável, use `ANTIGRAVITY_INSECURE_TLS=1` para desabilitar a validação.

## Segurança

Este pacote usa o client OAuth nativo do Antigravity para compatibilidade com o serviço Cloud Code. Não inclua access tokens, refresh tokens, arquivos `.credentials.yaml` ou chaves pessoais no repositório.

## Desenvolvimento

```powershell
node --check index.js
node --check antigravity-proxy.js
node --check client.js
```

A instalação local do bundle pode ser feita pelo Plugin Manager apontando para esta pasta.
