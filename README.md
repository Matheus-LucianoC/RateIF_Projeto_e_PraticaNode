# RateIF

Sistema acadêmico e pedagógico com interface web, aplicativo mobile e backend Node.js compartilhando a mesma base MySQL.

## Funcionalidades

- Autenticação web e mobile, cadastro e recuperação de senha.
- Login opcional com Google, validado no servidor.
- Perfis `ADMIN`, `COORDENACAO`, `ALUNO`, `PROFESSOR`, `TECNICO`, `RESPONSAVEL` e `USUARIO`.
- Pré-cadastro de e-mails institucionais com atribuição controlada de perfil.
- Painel, perfil, turmas, professores, alunos, responsáveis e técnicos.
- Sistema de Avaliação do Aluno (SAA) com histórico, filtros, resumo por unidade, competências, pontos fortes, dificuldades, intervenção, plano de ação e data de reavaliação.
- Conselho de Classe (VdC), votação por aluno, atualização de voto, resultados e encerramento.
- Requerimentos com encaminhamento ao VdC e acompanhamento de status.
- Relatórios e logs de download nas rotas legadas.
- Mensagens entre administração/coordenação e professores, com presença, contagem de não lidas e confirmação de leitura.
- Sessões web persistidas no banco, com expiração por inatividade e limite absoluto.
- Sessões mobile com JWT de curta duração, refresh token rotativo, armazenamento seguro no dispositivo e revogação por sessão/dispositivo.
- Administração central com criação e edição de contas, perfis, status, redefinição de senha, indicadores e encerramento de sessões globais.
- Telas web e Expo atualizadas para expor os novos controles, mantendo os módulos e fluxos existentes.

## Requisitos

- Node.js 20 ou superior.
- npm.
- MySQL 8+ ou MariaDB compatível.

## Configuração e execução

Na raiz do projeto, copie `.env.example` para `.env` e configure o acesso ao banco:

```env
DB_URL=mysql://localhost:3306/sistema_escolar
DB_USERNAME=root
DB_PASSWORD=sua-senha
SERVER_PORT=8080
MOBILE_JWT_SECRET=gere-um-segredo-aleatorio-com-no-minimo-32-caracteres
WEB_SESSION_IDLE_MINUTES=30
WEB_SESSION_MAX_HOURS=12
MOBILE_REFRESH_DAYS=30
MOBILE_REFRESH_MAX_DAYS=90
```

O backend lê `.env` sem precisar de biblioteca adicional. Também aceita a URL no formato `jdbc:mysql://...` para facilitar a migração de configurações antigas. Caso o banco indicado ainda não exista, o backend tenta criá-lo automaticamente; o usuário do MySQL precisa ter permissão para isso. As tabelas ausentes são criadas sem apagar tabelas nem registros existentes.

As migrações adicionam a tabela `sessao_usuario` e as colunas adicionais do SAA em bancos existentes, sem apagar avaliações anteriores. A sessão web padrão expira após 30 minutos de inatividade (limite absoluto de 12 horas). No mobile, o access token padrão dura 8 horas e o refresh token é rotativo: renova por até 30 dias por uso, respeitando o limite absoluto de 90 dias. Ajuste esses valores no `.env` conforme a política institucional.

Instale as dependências e inicie:

```bash
npm install
npm start
```

No Windows, `EXECUTAR_BACKEND.bat` executa esses passos e inicia o servidor. O backend ficará disponível em `http://localhost:8080` por padrão.

### Primeiro administrador em ambiente local

Para criar automaticamente uma conta administrativa apenas quando o e-mail ainda não existir, configure no `.env`:

```env
RATEIF_ADMIN_EMAIL=admin@rateif.local
RATEIF_ADMIN_PASSWORD=uma-senha-local-com-12-ou-mais-caracteres
RATEIF_ADMIN_NAME=Administrador RateIF
```

O bootstrap não promove contas preexistentes. Não use credenciais de teste em ambientes compartilhados ou de produção. Configure `MOBILE_JWT_SECRET` com valor aleatório próprio e `SESSION_COOKIE_SECURE=true` quando o backend estiver atrás de HTTPS.

### Autenticação e senha

As dependências `bcryptjs` e `mysql2` são instaladas por `npm install`. O `bcryptjs` permite verificar os hashes BCrypt já armazenados pela versão anterior e gerar novos hashes compatíveis. O backend não altera a tabela de usuários para migrar credenciais.

Para habilitar login com Google, configure `GOOGLE_CLIENT_ID` com o identificador do cliente OAuth usado pelo front.

## Interface web

A aplicação mantém os templates, CSS e JavaScript em `web/templates` e `web/static`. As telas de Administração, Perfil e SAA receberam componentes para as novas funcionalidades; os demais módulos e fluxos foram mantidos. Os endpoints JSON e as rotas das páginas são servidos pelo backend Node.js.

## Aplicativo mobile

O aplicativo Expo permanece em `mobile/`. Dentro dessa pasta:

```bash
npm install
npm start
```

Configure `EXPO_PUBLIC_API_URL` no `.env` do mobile com o endereço acessível pelo dispositivo. Em um telefone físico, use o IP da máquina na rede local, não `localhost`. Para builds hospedados, configure a URL HTTPS pública da API nos ambientes correspondentes do EAS. Não armazene segredos de servidor nem tokens de CI em variáveis `EXPO_PUBLIC_*`.

## Testes

A suíte de integração usa o servidor HTTP real e um adaptador de dados em memória; assim, os testes não dependem de um MySQL local e não modificam uma base de dados de usuário.

```bash
npm test
npm run check
```

O teste de integração de banco MySQL precisa ser realizado no ambiente de implantação, com as credenciais e o serviço MySQL reais. O relatório da conversão e da bateria executada neste sandbox está em `VALIDACAO_NODE.md`.

## Estrutura

```text
backend/       servidor HTTP, rotas, persistência, esquema e segurança
  mobile/        aplicativo React Native + Expo
web/
  templates/   páginas web
  static/      CSS e JavaScript do front
test/          testes automatizados de integração
server.js      ponto de entrada do backend
```

## Autores

Matheus Luciano de Caldas Figueiredo  
Renan Aprigio Dias de Moura
