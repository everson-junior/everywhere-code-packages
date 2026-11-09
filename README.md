# @everywhere-harness/ewh

`ewh` e um alias para o CLI oficial [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh). Todos os comandos sao encaminhados para o CLI oficial, que e a unica dependencia de runtime deste pacote.

Plugins e presets do Everywhere sao instalados nos perfis pela loja. Eles nao sao dependencias diretas do `ewh`, evitando que uma versao embutida na instalacao global substitua a copia instalada ou atualizada no perfil.

## Inicio rapido

Execute a interface Web diretamente com `npx` (requer Node.js >= 24.9.0):

```sh
npx @everywhere-harness/ewh web
```

Por padrao, o servidor inicia em `http://127.0.0.1:3080` e abre o navegador. Para iniciar sem abrir o navegador:

```sh
npx @everywhere-harness/ewh web --no-open
```

## Instalacao global

```sh
npm install -g @everywhere-harness/ewh
ewh web
```

A instalação global configura automaticamente o perfil `web` com estes plugins, sempre usando a versão mais recente publicada:

- `@everywhere-harness/plugin-providers`
- `@everywhere-harness/client-ui-chat`
- `@deepseek-ai/dsh-experimental-plugin-market-bundle`

Além de instalar os pacotes, o `postinstall` garante que os três bundles estejam
na lista `dsh.profile.bundles` do perfil. Isso faz com que apareçam como
**Habilitados**, inclusive o `@deepseek-ai/dsh-plugin-market`, que é carregado
pelo bundle experimental. A rotina é idempotente e atualizações futuras usam
`@latest` novamente. Em ambientes sem `pnpm` (como runners limpos do GitHub
Actions), o script instala temporariamente o `pnpm` necessário para concluir a
configuração.

Para adicionar outro plugin automaticamente, basta incluir seu package specifier
no array `webPlugins` de `bin/postinstall.js`. Se o pacote for um bundle Cordis
(com `dsh.bundle.patch`), ele também será habilitado automaticamente pelo mesmo
fluxo.

O comando `ewh` encaminha os argumentos, a entrada e saida do terminal, os sinais e o codigo de saida para o executavel oficial `dsh`.

## Comandos

| Comando | Finalidade |
|---|---|
| `ewh web` | Inicia a interface Web e o backend local. |
| `ewh <nome>` | Inicia um perfil em `$DSH_HOME/profiles/<nome>`. |
| `ewh --profile <nome>` | Inicia explicitamente um perfil. |
| `ewh --profile headless "tarefa"` | Executa uma sessao headless e imprime a resposta. |
| `ewh --profile acp` | Inicia o servidor ACP por stdio. |
| `ewh --profile sdk` | Inicia o servidor SDK por JSON-RPC em stdio. |
| `ewh --profile sdk-minimal` | Inicia a composicao minima do SDK. |
| `ewh plugin --profile <nome> <args>` | Gerencia plugins externos do perfil. |
| `ewh --help` | Exibe a ajuda oficial do CLI. |

Argumentos posteriores ao perfil sao encaminhados para a aplicacao selecionada:

```sh
ewh web --port 8080
ewh web --help
ewh --profile headless "execute os testes"
```

## Atualizacoes

Cada versao deste pacote fixa uma versao do `@deepseek-ai/dsh`. Atualizar `@everywhere-harness/ewh` atualiza o runtime oficial usado pelo comando `ewh`:

```sh
npm install -g @everywhere-harness/ewh@latest
```

## Repositorio

- [GitHub](https://github.com/everson-junior/everywhere-harness)
- [Issues](https://github.com/everson-junior/everywhere-harness/issues)

## Licenca

[MIT](LICENSE)
