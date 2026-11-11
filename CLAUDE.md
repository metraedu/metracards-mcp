# MetraCards MCP

## Contexto

MetraCards MCP é o servidor Model Context Protocol do MetraCards. O projeto usa TypeScript ESM com Node.js 20+, MCP SDK e Zod, integra-se à MetraCards API e oferece dois transportes: stdio local e HTTP remoto. O fluxo remoto usa OAuth/Firebase e DynamoDB; a infraestrutura é definida com AWS CDK e executa o servidor HTTP em AWS Lambda.

## Princípios

- Priorize, nesta ordem: correção, clareza, simplicidade e consistência com o projeto.
- Implemente somente o necessário para o requisito atual. Não crie abstrações ou infraestrutura para necessidades especulativas.
- Antes de adicionar código, procure uma solução equivalente no projeto e reutilize-a quando adequado.
- Use Ponytail para buscar a menor solução correta, sem simplificar segurança, autenticação, validação, compatibilidade de protocolo ou prevenção de perda de dados.
- Prefira nomes e estruturas autoexplicativos. Use comentários para registrar decisões ou restrições que o código não consegue expressar, não para narrar a implementação.
- Escreva código-fonte, identificadores, comentários e descrições de testes sempre em inglês.

## Fluxo de desenvolvimento

- Use os skills do Superpowers adequados em alterações que envolvam código. Alterações restritas a documentos ou diagramas não precisam usar Superpowers.
- Faça mudanças de implementação em uma worktree dedicada. Se a tarefa já contiver trabalho iniciado pelo usuário, preserve essas alterações e confirme a estratégia antes de movê-las, formatá-las ou substituí-las.
- Antes de escrever a spec, crie uma issue no repositório GitHub correspondente e adicione-a ao [MetraEdu Project #1](https://github.com/orgs/metraedu/projects/1).
- Mantenha a spec na descrição da própria issue, que é sua fonte de verdade. Depois de criar a issue, atualize sua descrição com objetivo, contexto, escopo, fora de escopo, comportamento esperado, critérios de aceitação, estratégia de testes, riscos e etapas manuais.
- Inclua na spec da issue diagramas de sequência em Mermaid que representem os fluxos relevantes entre cliente MCP, transporte, autenticação, tools, MetraCards API e serviços externos. Mantenha os diagramas alinhados ao comportamento aprovado.
- Não publique o plano de implementação em comentários da issue, no PR ou em documentação versionada. Mantenha-o somente em um arquivo local dentro de `tmp/` e não o adicione ao Git.
- Use TDD para lógica, correções de bugs e mudanças de comportamento: escreva o teste que falha, execute-o, implemente o mínimo necessário e refatore com os testes passando.
- Corrija a causa raiz no ponto compartilhado mais apropriado. Antes de alterar uma função, verifique seus chamadores, os dois transportes e as tools relacionadas.
- Revise o diff final e remova código morto, duplicações, logs temporários, artefatos gerados e arquivos sem uso.

## Arquitetura e composição

- Preserve TypeScript strict, ESM e `NodeNext`. Use importações relativas com extensões compatíveis com a configuração e a convenção do diretório; não normalize imports em massa fora da tarefa.
- `src/index.ts` é a entrada do transporte stdio e `src/http.ts` é a entrada do transporte HTTP.
- `createServer()` em `src/server/create-server.ts` é o composition root do servidor MCP. Registre grupos de tools por domínio nesse ponto.
- `MetraCardsApiClient` é a fronteira para a MetraCards API; não espalhe `fetch` pelas tools.
- `TokenProvider` é a fronteira de autenticação e `CredentialStore` é a fronteira das credenciais locais.
- Injete cliente, token provider, credential store e demais dependências. Não as instancie dentro de uma tool quando podem ser fornecidas pela composição do transporte.
- Mantenha diferenças entre stdio e HTTP nas entradas, nos adapters e nas fronteiras de autenticação. A lógica compartilhada de domínio não deve depender do transporte.
- Organize tools por domínio em `src/tools/` e mantenha cada registro focado em um contrato público.
- Evite duplicar comportamento da API no MCP. O servidor valida e adapta o contrato MCP, delegando regras de negócio à MetraCards API.

## Contratos das tools

- Use nomes públicos estáveis em `snake_case`, agrupados pelo domínio, como `cards_generate_audio`.
- Descreva a tool e seus campos de forma suficiente para o cliente escolher e chamar o contrato corretamente, sem instruções redundantes.
- Valide toda entrada externa com Zod. Reutilize schemas de `src/tools/schemas.ts` quando representarem o mesmo contrato.
- Converta explicitamente campos públicos em `snake_case` para os nomes internos esperados pelo cliente da API. Não faça casts para contornar validação ausente.
- Reutilize `textResult` para resultados textuais e `mapToolError` para falhas conhecidas, em vez de criar envelopes diferentes por tool.
- Falhas esperadas devem retornar resultado MCP estruturado com `isError: true`, mensagem pública e, quando útil, uma ação segura para recuperação.
- Não exponha stack traces, tokens, credenciais, presigned URLs, detalhes internos do OAuth ou corpos upstream que possam conter dados sensíveis. Revise qualquer payload de erro antes de retorná-lo.
- Trate nomes, schemas, descrições, payloads e semântica de erros como contrato público. Mudanças incompatíveis exigem decisão explícita, documentação e versionamento adequados.
- Ao adicionar uma tool:
  1. adicione ou reutilize o método correspondente em `MetraCardsApiClient`;
  2. defina ou reutilize o schema Zod;
  3. implemente o registro no domínio apropriado;
  4. exporte e registre a tool no grupo e em `createServer()` quando necessário;
  5. teste sucesso, validação, autenticação e erro da API;
  6. atualize a tabela e os fluxos públicos do `README.md`.

## Transportes e autenticação

- No transporte stdio, stdout pertence exclusivamente ao protocolo MCP. Envie logs operacionais e diagnósticos para stderr, usando `console.error` ou o mecanismo equivalente adotado pelo projeto; nunca use `console.log` nesse fluxo.
- O stdio usa login no navegador e armazenamento local de refresh token. Preserve permissões restritas do arquivo de credenciais e a renovação automática do token.
- O HTTP remoto usa OAuth Connect ou `Authorization: Bearer <Firebase ID token>`. Preserve a verificação do token, metadados OAuth, proteção do recurso e isolamento por requisição.
- Não reutilize credenciais ou estado autenticado entre usuários ou requisições HTTP.
- Mantenha login e logout específicos do stdio como erros estruturados no HTTP, com orientação para OAuth Connect ou Bearer.
- Mudanças em login, refresh, logout, DCR, authorization, token exchange, metadata ou verificação Firebase devem testar sucesso, expiração, token inválido e falhas do store aplicáveis.
- Nunca registre authorization headers, ID tokens, refresh tokens, authorization codes, client secrets ou conteúdo do arquivo local de credenciais.

## Media

- O servidor HTTP remoto não acessa o disco do cliente. Não tente fazer `file_path` funcionar no ambiente hospedado.
- No HTTP, prefira `cards_media_presign` para que os bytes sejam enviados diretamente do cliente ao S3.
- No stdio, prefira `file_path` absoluto quando o agente precisar enviar um arquivo local.
- Use `content_base64` somente como fallback explícito; ele aumenta significativamente o consumo de contexto e memória.
- Valide exclusividade das fontes de arquivo, extensão, tipo, tamanho e limites configurados antes do upload.
- Presigned URLs são temporárias e sensíveis: não as registre, persista, publique, compartilhe ou inclua em mensagens de erro.
- Mantenha explícito o mapeamento entre lado/tipo da mídia e os campos de URL e tamanho do flashcard.

## Infraestrutura e operações

- Mantenha a infraestrutura CDK em `infrastructure/` e a entrada do app no fluxo já existente do repositório.
- Preserve a precedência documentada: contexto local pode sobrescrever placeholders da configuração do app. Arquivos locais de contexto não devem ser versionados.
- Faça a configuração falhar com mensagens claras quando formato ou valores obrigatórios forem inválidos.
- Execute `npm --prefix infrastructure run build` para validar o contrato TypeScript da infraestrutura e `npm --prefix infrastructure run synth` para sintetizar a stack.
- Antes de qualquer deploy, execute e revise o CDK diff pelo comando CDK equivalente do projeto, com atenção a IAM, domínio, API Gateway, Lambda, DynamoDB, logs e políticas de remoção.
- Não execute `npm --prefix infrastructure run deploy`, `cdk deploy`, `cdk destroy` ou comandos AWS equivalentes sem autorização explícita para o ambiente específico.
- Revise com cuidado mudanças em `RemovalPolicy.DESTROY`, estado OAuth, domínio e tabelas. Uma alteração pequena pode apagar sessões ou substituir recursos.
- Não trate `cdk.out/`, `dist/`, bundles, caches ou arquivos gerados como fonte de verdade ou arquivos para commit.

## Testes e qualidade

Adicione testes proporcionais ao comportamento alterado:

- tool: schema, conversão de argumentos, resposta de sucesso e erro estruturado;
- cliente da API: método, URL, headers, corpo, parsing, erro e retry de autenticação relevantes;
- autenticação/OAuth: casos válidos, inválidos, expirados e isolamento de estado;
- transporte: comportamento específico de stdio ou HTTP, incluindo proteção do protocolo;
- configuração/CDK: precedência, validação e recursos alterados;
- fluxo crítico entre camadas: teste de integração quando testes isolados não comprovarem o contrato.

Também:

- Use o runner nativo com `node:test` e `node:assert/strict`; não introduza outro framework sem necessidade comprovada.
- Estruture os testes em Given–When–Then.
- Coloque fixtures e helpers em pastas dedicadas somente quando houver reutilização real.
- Garanta 100% de cobertura de linhas e branches nas funções modificadas. Cobertura integral não substitui cenários relevantes nem assertions de comportamento.
- Execute testes diretamente relacionados durante o desenvolvimento e `npm test` antes de concluir.
- Execute `npm run build` para validar TypeScript e a cópia dos assets HTML necessários.
- Para infraestrutura, execute `npm --prefix infrastructure run build` e, quando ela mudar, `npm --prefix infrastructure run synth`.
- O projeto não possui script próprio de lint ou format; preserve o estilo existente e não introduza dependência apenas para formatar esta tarefa.

## Documentação

- Escreva documentação, specs, planos e descrições de pull requests em português. Mantenha em inglês o conteúdo público do `README.md` enquanto esse for o idioma adotado pelo arquivo.
- A spec e seus diagramas de sequência pertencem à descrição da issue; não crie uma segunda spec versionada para o mesmo trabalho.
- Atualize o `README.md` sempre que mudar tools, nomes, schemas, descrições relevantes, autenticação, transportes, instalação, configuração, compatibilidade de clientes ou fluxo de media.
- Atualize documentação técnica, diagramas permanentes e playbooks operacionais quando suas instruções deixarem de representar o sistema.
- Após concluir o review do PR e tratar seus apontamentos, faça uma nova verificação de `README.md`, documentação técnica, diagramas e playbooks afetados. Inclua as atualizações necessárias no mesmo PR antes de finalizá-lo.
- Não crie relatórios permanentes para código autoexplicativo, experimentos temporários ou detalhes já cobertos pelo código.

## Segurança, logs e temporários

- Registre apenas contexto operacional necessário para diagnóstico, sempre em stderr no stdio.
- Nunca registre ou exponha credenciais, tokens, authorization codes, headers de autorização, dados pessoais, conteúdo sensível ou presigned URLs.
- Não leia, copie, publique ou versione `.env`, `cdk.context.local.json`, arquivos em `~/.config/metracards-mcp/` ou outras credenciais sem necessidade explícita.
- Preserve allowlists de hosts, validação de redirect URIs, expiração/TTL e verificações criptográficas do OAuth. Não enfraqueça esses controles para facilitar testes locais.
- Limite mensagens de erro ao necessário para recuperação segura. Não devolva detalhes internos do ambiente, filesystem, DynamoDB ou Firebase.
- Coloque planos e artefatos temporários de investigação em `tmp/`. Eles não devem ser versionados.

## Versionamento e pull requests

- Siga SemVer: **patch** para correções compatíveis, **minor** para funcionalidades compatíveis e **major** para quebras de contrato.
- Incremente a versão somente no PR de release ou quando o fluxo de entrega exigir uma versão publicável; PRs intermediários não precisam alterar a versão.
- Cada PR deve ter uma responsabilidade coesa e ser fácil de revisar. Separe mudanças independentes.
- Relacione o PR à issue que contém a spec, sem copiar o plano de implementação para comentários ou descrição.
- Explique na descrição do PR o comportamento alterado, os contratos públicos afetados, a estratégia de testes, os riscos e quaisquer etapas manuais.
- Não faça commit, push, merge, deploy ou destroy sem a autorização correspondente.

## Checklist de conclusão

Antes de declarar uma tarefa concluída, confirme:

- [ ] A issue foi criada antes da spec e adicionada ao [MetraEdu Project #1](https://github.com/orgs/metraedu/projects/1).
- [ ] A descrição da issue contém a spec atualizada e os diagramas de sequência Mermaid relevantes.
- [ ] O plano permaneceu somente em `tmp/`, sem comentários na issue ou no PR e sem ser versionado.
- [ ] O comportamento solicitado foi implementado sem ampliar o escopo.
- [ ] Os contratos das tools, os schemas e os resultados de erro permanecem coerentes e documentados.
- [ ] As diferenças entre stdio e HTTP ficaram restritas às fronteiras apropriadas.
- [ ] stdout permaneceu reservado ao protocolo no stdio, e nenhum log expõe dados sensíveis.
- [ ] Testes relevantes estão passando, e as funções modificadas têm 100% de cobertura de linhas e branches.
- [ ] `npm run build` foi executado; build e synth da infraestrutura foram executados quando aplicáveis.
- [ ] Mudanças em tools, autenticação, transportes, instalação ou media foram refletidas no `README.md`.
- [ ] Após o review do PR, README, documentação, diagramas e playbooks foram reavaliados e atualizados quando necessário.
- [ ] Nenhuma presigned URL, credencial, token ou arquivo local sensível foi publicado ou versionado.
- [ ] Não restaram código morto, duplicações, logs temporários ou artefatos gerados fora de `tmp/`.
- [ ] O diff final contém somente mudanças relacionadas à tarefa e preserva o trabalho preexistente.
