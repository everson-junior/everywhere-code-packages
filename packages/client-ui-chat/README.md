# @everywhere-harness/client-ui-chat

Identidade visual Everywhere do chat e da sidebar, com marca, wordmark, hero animado e indicador de execucao. A versao `0.2.0` acrescenta o componente opcional `totvs`, instalado desativado por padrao.

## Runtime e ativacao progressiva

Os alvos de integracao sao `@everywhere-harness/ewh@0.2.7` ou hosts com pacotes `@deepseek-ai/dsh-*` em `0.2.1-rc.3`. O manifesto usa Cordis `4.0.5`. Isso nao significa suporte a todas as versoes do Harness nem comprova execucao visual nesses hosts.

O entrypoint raiz e um plugin host sem contribuicoes visuais diretas. A declaracao `dsh.client` entrega o entrypoint `./client` ao carregador Web do host e depende de seus plugins de chat, conversation e sidebar. O pacote nao substitui esses servicos, o loop do agente ou os dados de conversacao.

Marca e hero funcionam pelos slots existentes: `sidebar.brand.mark`, `sidebar.brand.name` e `conversation.hero.brand.mark`. O indicador requer `conversation.chat.running.icon`, e o titulo reativo requer `shell.document.title`. Os dois slots estao implementados na branch local `feat/client-ui-chat-extension-points` da origem, mas ainda nao estao publicados nos runtimes citados. A identidade completa depende de uma release do host com esses slots.

As contribuicoes aguardam a declaracao de cada slot por `slots.inject`. Em hosts sem os novos slots, marca e hero continuam disponiveis; indicador e titulo nativos permanecem inalterados.

## Componente opcional TOTVS

A instalacao cria tambem o componente `totvs` desativado por padrao. O usuario pode ativa-lo na pagina de Components/Plugins quando quiser aplicar o tema. Ele oferece as mesmas cinco contribuicoes visuais do componente Everywhere, mas usa o simbolo TOTVS fornecido no chat e na sidebar, mostra particulas `+` no hover, preserva rotacao e batimento, e troca a marca para `TOTVS ENG V&D [CODE]`. Quando os dois componentes estao ativos, o TOTVS tem prioridade visual; desativa-lo restaura o Everywhere sem reinstalar o pacote.

As contribuicoes usam os slots do host e podem disputar prioridade com outros plugins de marca. O titulo do documento e os estilos pertencem ao ciclo de vida deste plugin. A compatibilidade deve ser confirmada no host escolhido, nao inferida apenas do numero de versao.

## Matriz do delta visual

| Area | Delta real da origem | Tratamento no pacote |
| --- | --- | --- |
| Sidebar | Marca e wordmark Everywhere | Contribuicoes em `sidebar.brand.mark` e `sidebar.brand.name`. |
| Hero da conversa | Arte de coracao/circuito, orbitas e animacoes de hover | Contribuicao em `conversation.hero.brand.mark`, com estilos `ewh-chat-*`. |
| Running icon | Indicador animado de execucao | Ativado quando o host declara `conversation.chat.running.icon`; esse slot ainda nao esta publicado. |
| Titulo | Identidade EveryWhere Harness | O slot `shell.document.title` preserva o prefixo da sessao e acompanha sua renomeacao. |
| PWA e Apple | Nomes EveryWhere Harness / EWH | Metadados reversiveis; o manifesto conserva seus campos e URLs de assets. |
| Paleta core | **Nao mudou** | Nao ha nova paleta global nem substituicao do tema core; a arte usa cores herdadas e variaveis locais `--ewh-chat-*`. |
| Locale | Apenas `brand.localBuild` no delta visual | A substituicao do nome pelo slot cobre a marca da sidebar; nao copia dicionarios nem altera o locale global. |
| Icon fallback | Correcao de bug de infraestrutura | Nao e redesign da GUI. O patch de sprite global nao e transportado para este plugin. |
| Runtime e dados | Fora do delta visual | Nao inclui system prompt, providers, persistencia, estado de sessao ou servicos duplicados. |

Os estilos incluem tratamento de movimento reduzido e cores forcadas. O manifesto e carregado pelo navegador e substituido por uma URL Blob enquanto o plugin esta ativo; a politica CSP do host deve permitir esse recurso. Atualizar o manifesto nao renomeia necessariamente uma PWA ja instalada, pois esse comportamento pertence ao navegador. O favicon original e preservado.

## Desenvolvimento e empacotamento local

Requisitos: Node.js `>=24.9.0` e pnpm `11.21.0` (versao usada localmente e no CI). Execute os comandos na raiz do repositorio. Preserve `allowBuilds.esbuild: true` em `pnpm-workspace.yaml` para permitir o build da dependencia.

```sh
pnpm install --frozen-lockfile
pnpm --filter @everywhere-harness/client-ui-chat run typecheck
pnpm --filter @everywhere-harness/client-ui-chat run build
pnpm --filter @everywhere-harness/client-ui-chat run test
pnpm --filter @everywhere-harness/client-ui-chat run test:pack
pnpm run validate:index
pnpm --filter @everywhere-harness/client-ui-chat pack --pack-destination <diretorio-temporario>
```

Substitua `<diretorio-temporario>` por um diretorio fora do repositorio. `pack` executa o `prepack` e gera um tarball, sem publicar. O artefato deve incluir `lib`, este README e a licenca MIT. Os pacotes DSH e React fornecidos pelo host nao devem ser substituidos por servicos locais do plugin.

O CI faz install frozen, typecheck, build, testes, validacao do indice e smoke obrigatorio do tarball. Os testes cobrem o protocolo do carregador, estilos e metadados reversiveis, cancelamento de requests, titulo reativo, reativacao, slots ausentes e IDs SVG unicos. `test:pack` instala o tarball em um projeto temporario isolado, importa o entrypoint host e carrega o bundle com React compartilhado; `PACK_DIRECTORY` permite usar um tarball previamente gerado. Esses testes nao executam um fluxo real com modelo.

## Instalar o tarball no perfil Web

O descritor `cordis.patch.yml` ativa o plugin quando o pacote e instalado no perfil pelo gerenciador oficial. Depois de gerar o tarball, execute no terminal com o CLI `ewh` disponivel:

```sh
ewh plugin --profile web add /caminho/everywhere-harness-client-ui-chat-0.2.0.tgz
ewh web --no-open
```

O pacote aparece nos plugins instalados com `everywhere-client-ui-chat` ativo e `totvs` desativado. Ative `totvs` para usar a identidade TOTVS; desativa-lo remove seus estilos, metadados e contribuicoes, restaurando a identidade Everywhere. Para remover o pacote do perfil, use `ewh plugin --profile web remove @everywhere-harness/client-ui-chat`. Nao adicione manualmente uma segunda entrada para o mesmo plugin.

## Catalogo e release futura

O `index.json` ativo permanece sem este pacote para nao apontar para npm 404. O trecho abaixo e apenas um exemplo para revisao futura, nao uma entrada distribuida nem uma autorizacao de release:

```json
{
  "name": "@everywhere-harness/client-ui-chat",
  "title": {
    "en": "Everywhere chat identity",
    "pt": "Identidade Everywhere do chat"
  },
  "versions": [
    {
      "version": "0.2.0",
      "source": { "type": "npm" }
    }
  ]
}
```

Somente depois de a versao existir no npm deve-se completar os metadados e adicionar a entrada em `plugins` no indice ativo. Execute `pnpm run validate:index` para validar o formato local; esse validador faz verificacoes estruturais basicas e nao consulta o npm nem certifica compatibilidade de runtime.

O workflow de publicacao inclui este pacote e publica automaticamente novas versoes no npm apos validacao na branch `main`. O script raiz `publish:packages` permanece recursivo e nao deve ser usado para uma release parcial.

## Origem e licenca

Extraido de [Everywhere Harness](https://github.com/everson-junior/everywhere-harness), com base no commit [`22ddee3792`](https://github.com/everson-junior/everywhere-harness/commit/22ddee3792) e deltas visuais ate [`0b731b172b`](https://github.com/everson-junior/everywhere-harness/commit/0b731b172b). A origem deriva do DeepSeek Harness; a atribuicao original e **Copyright (c) 2026 DeepSeek**.

O arquivo [LICENSE](LICENSE) reproduz integralmente a licenca MIT da raiz da origem, incluindo o aviso de copyright e a isencao de garantias. O transplante visual nao inclui o patch global de sprites nem implica endosso dos autores originais.
