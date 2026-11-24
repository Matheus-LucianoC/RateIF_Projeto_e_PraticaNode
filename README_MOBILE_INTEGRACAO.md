# Integração Web + Mobile

O RateIF mantém a interface web e o aplicativo React Native + Expo conectados ao mesmo backend Node.js e à mesma base MySQL.

## Endpoints mobile

- `/api/mobile/auth/*` — login, cadastro, refresh token rotativo e logout.
- `/api/mobile/profile` — leitura e atualização do perfil.
- `/api/mobile/dashboard` — indicadores do painel.
- `/api/mobile/turmas` — consulta e operações administrativas.
- `/api/mobile/professores` e `/api/mobile/alunos` — cadastros acadêmicos.
- `/api/mobile/vdc/*` — sessões, votos e encerramento do Conselho de Classe.
- `/api/mobile/saa/avaliacoes*` e `/api/mobile/saa/resumo` — avaliações, histórico, filtros, resumo por unidade e acompanhamento pedagógico.
- `/api/mobile/sessoes` — listagem e revogação das sessões do próprio usuário.
- `/api/mobile/requerimentos/*` — requerimentos e encaminhamentos.
- `/api/mobile/admin/*` — usuários, criação e edição de contas, indicadores, sessões globais e pré-cadastro de e-mails.
- `/api/mobile/mensagens/*` — contatos, presença, conversas e envio.

## Segurança de sessão

A autenticação mobile usa `Authorization: Bearer <accessToken>`. O access token JWT tem duração curta e configurável por `MOBILE_JWT_EXPIRATION_HOURS`. O refresh token é rotativo: cada renovação invalida o token anterior e emite outro. A duração deslizante padrão é de 30 dias, respeitando um limite absoluto padrão de 90 dias, configurável por `MOBILE_REFRESH_DAYS` e `MOBILE_REFRESH_MAX_DAYS`.

Os tokens são vinculados a uma sessão/dispositivo persistida no banco. O aplicativo guarda os tokens com `expo-secure-store`, tenta renovar automaticamente o access token expirado e encerra a sessão no servidor durante o logout. Um refresh token antigo não pode ser reutilizado. Usuários podem consultar e revogar suas próprias sessões; administradores podem consultar e revogar sessões de qualquer conta.

As permissões são verificadas no servidor; ocultar botões no aplicativo não substitui a autorização da API. No SAA, estudantes e responsáveis veem apenas os registros associados a eles. Professores e perfis de gestão têm acesso conforme o vínculo e o perfil definido no backend.

## Execução

Inicie o backend pela raiz do repositório com `npm install` e `npm start`. Configure `.env` com os dados MySQL e um `MOBILE_JWT_SECRET` aleatório com pelo menos 32 caracteres. Depois, entre em `mobile/`, execute `npm install`, configure `EXPO_PUBLIC_API_URL` e rode `npm start`. Em dispositivo físico, informe o IP da máquina que hospeda o backend; `localhost` aponta para o próprio telefone.

Consulte `README.md` para os requisitos, variáveis de ambiente, migrações e testes.
