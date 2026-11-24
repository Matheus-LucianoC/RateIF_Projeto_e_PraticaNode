# Relatório de funcionalidades e validação — RateIF Node.js

**Data:** 23/11/2026  
**Suíte automatizada:** 26 testes aprovados, 0 falhas e 0 ignorados.

## Escopo desta atualização

A atualização foi aplicada sobre a versão Node.js do RateIF. O backend permanece exclusivamente em Node.js; nenhum backend Java foi reintroduzido. Os três cartões da coluna **Fazendo** da imagem recebida foram tratados:

1. **Tokens de sessão (web e mobile):** sessões web persistidas no banco, com expiração por inatividade e limite absoluto; sessões mobile com access JWT, refresh token rotativo, expiração, revogação por dispositivo e armazenamento seguro no Expo.
2. **Sistema de Avaliação do Aluno (SAA):** campos para competências, pontos fortes, dificuldades, intervenção recomendada, plano de ação, status e data de reavaliação; histórico, filtros e resumo por unidade; restrições de acesso aplicadas no backend.
3. **Administração central:** indicadores, criação e edição de contas, alteração de perfil/status, redefinição de senha, pré-cadastro institucional e gerenciamento global de sessões.

As novas ações foram expostas nas áreas web de Administração, Perfil e SAA e nas telas mobile correspondentes. Os outros módulos existentes — turmas, VdC, requerimentos, mensagens, presença, relatórios e rotas legadas — foram mantidos.

## Sessões e segurança

- **Web:** padrão de 30 minutos sem atividade e limite absoluto de 12 horas; ambos configuráveis por `WEB_SESSION_IDLE_MINUTES` e `WEB_SESSION_MAX_HOURS`.
- **Mobile:** access JWT de duração configurável por `MOBILE_JWT_EXPIRATION_HOURS`; refresh token rotativo, com 30 dias deslizantes e limite absoluto de 90 dias por padrão, configuráveis por `MOBILE_REFRESH_DAYS` e `MOBILE_REFRESH_MAX_DAYS`.
- Cada sessão identifica o tipo de cliente, dispositivo, IP, último acesso e prazo de expiração. A revogação invalida a sessão no servidor.
- Refresh token usado anteriormente não pode ser reaproveitado. O app tenta renovar automaticamente a sessão ao receber uma resposta 401 e guarda os tokens com `expo-secure-store`.
- O SAA aplica autorização no backend: estudante e responsável têm acesso limitado aos registros associados, enquanto perfis pedagógicos e administrativos são verificados conforme o papel e o vínculo.

## Testes executados no ambiente isolado

Ambiente: Node.js v22.16.0 e npm 10.9.2. Os testes sobem o servidor HTTP e fazem requisições reais às rotas. A persistência é substituída por um adaptador em memória para que a suíte não dependa de um banco externo nem altere dados do usuário.

| Verificação | Resultado |
|---|---:|
| `npm run check` — sintaxe dos módulos Node | Aprovado |
| `node --check web/static/js/app.js` — sintaxe do JavaScript web | Aprovado |
| `npm test` — testes HTTP e regras de negócio | 26/26 aprovados |
| Extração do ZIP + repetição de `npm run check` e `npm test` | Aprovado; 26/26 testes |
| Integridade do ZIP (`unzip -t`) | Aprovado |
| Parsing dos arquivos JavaScript/JSX mobile | 21/21 arquivos sem erro sintático |
| Falhas / ignorados na suíte | 0 / 0 |

A suíte cobre autenticação e segurança web, pré-cadastro, proteção do último administrador, turmas, VdC e votos, campos e permissões do SAA, persistência e revogação de sessões web, rotação/reutilização/revogação de refresh token mobile, criação e gestão administrativa de contas e sessões, APIs administrativas mobile, requerimentos, mensagens/presença/leitura, endpoints legados, páginas/assets, recuperação de senha, cadastro mobile e integração Google simulada, além do carregamento de `.env` e exigência de segredo JWT em produção.

O parsing mobile foi feito usando o compilador TypeScript disponível no ambiente para validar sintaxe JSX/JavaScript. Isso não equivale a gerar um bundle do Metro/Expo.

## Testes do pacote ZIP

O ZIP de entrega foi testado com `unzip -t` e extraído para uma pasta limpa, fora do diretório de desenvolvimento. A partir da pasta extraída, foram executados novamente `npm run check`, `npm test` (26/26 aprovados) e `node --check web/static/js/app.js`. Também foram confirmados os arquivos essenciais do backend, das telas web e das telas Expo; nenhum artefato Java/Maven, `node_modules` ou `.git` foi incluído no pacote. O pacote contém o projeto e os arquivos de configuração/documentação, mas não inclui `.env` nem dependências instaladas, que devem ser criadas/instaladas no computador de execução.

## Integridade do front e remoção de Java

Apenas os componentes necessários às funcionalidades novas foram alterados nas áreas Administração, Perfil e SAA (web e mobile). Os outros módulos e os contratos de API existentes foram preservados. Esta atualização não afirma identidade byte a byte do front, porque as telas citadas receberam controles e formulários novos.

A entrega não deve conter arquivos `.java`, `.class`, `.jar`, `pom.xml`, `mvnw`, `mvnw.cmd` ou diretório `.mvn`. O backend e scripts de execução são Node.js.

## Limitações conhecidas da validação

- **MySQL/MariaDB real:** não foi possível iniciar um servidor de banco dentro deste sandbox. As rotas foram testadas com um adaptador de persistência em memória. As migrações SQL e a conexão precisam de um smoke test no ambiente de implantação, usando uma cópia/backup do banco antes da primeira inicialização.
- **Dependências instaladas:** o ambiente não concluiu a instalação completa via `npm install`; as dependências de runtime (`mysql2` e `bcryptjs`) estão declaradas no `package.json`, mas não foram exercitadas contra um servidor MySQL real aqui.
- **Expo/Metro:** os 21 arquivos mobile passaram no parsing sintático, mas o bundler/Expo Go e builds EAS não foram executados neste sandbox.
- **Google OAuth:** o contrato do fluxo foi testado com resposta do provedor simulada; credenciais e comunicação reais precisam ser confirmadas no ambiente de implantação.

Portanto, os testes aprovados comprovam as regras e os fluxos HTTP cobertos em ambiente isolado; eles não substituem a validação de integração com MySQL, Expo/Metro e credenciais reais.

## Como executar

Na raiz do projeto, com Node.js 20+ e MySQL/MariaDB compatível:

```bash
cp .env.example .env
# configure o MySQL e um MOBILE_JWT_SECRET aleatório com pelo menos 32 caracteres
npm install
npm run check
npm test
npm start
```

No Windows, o `EXECUTAR_BACKEND.bat` também pode iniciar o backend. Para o app Expo, entre em `mobile/`, configure `EXPO_PUBLIC_API_URL`, instale as dependências e execute `npm start`. Não use `localhost` no telefone físico: informe o IP da máquina na rede local.
