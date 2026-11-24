# Integração Web + Mobile — atualização 23/11/2026

A interface web e o aplicativo Expo compartilham o backend Node.js, os dados MySQL e as regras de autorização.

## Módulos compartilhados

- Autenticação, cadastro, recuperação de senha e perfil.
- Painel, turmas, SAA, VdC e requerimentos.
- SAA ampliado com histórico, resumo por unidade, competências, pontos fortes, dificuldades, intervenção recomendada, plano de ação, status e reavaliação.
- Sessões web persistidas, com expiração por inatividade, limite absoluto e revogação individual.
- Sessões mobile com JWT de acesso, refresh token rotativo, armazenamento no Expo SecureStore e revogação por dispositivo.
- Administração de usuários, status, perfis, redefinição de senha, indicadores, sessões globais e pré-cadastros institucionais.
- Mensagens internas entre ADMIN/COORDENACAO e PROFESSOR, com presença e confirmação de leitura.

## API mobile

`/api/mobile/auth/*`, `/api/mobile/profile`, `/api/mobile/dashboard`, `/api/mobile/turmas`, `/api/mobile/professores`, `/api/mobile/alunos`, `/api/mobile/vdc/*`, `/api/mobile/saa/*`, `/api/mobile/sessoes`, `/api/mobile/requerimentos/*`, `/api/mobile/admin/*` e `/api/mobile/mensagens/*`.

As permissões são confirmadas em cada requisição. Estudantes e responsáveis só consultam avaliações associadas a eles; ações pedagógicas e administrativas exigem perfil autorizado. Operações de criação, edição e exclusão de turmas permanecem exclusivas dos perfis administrativos previstos no backend.
