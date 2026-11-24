# RateIF Mobile

Aplicativo React Native + Expo integrado ao backend Node.js do RateIF.

## Requisitos

- Node.js LTS compatível com o SDK Expo do projeto.
- npm.
- Backend RateIF em execução.

## Instalação

Dentro de `mobile/`:

```bash
npm install
npm start
```

Para usar um celular na mesma rede do computador, configure `EXPO_PUBLIC_API_URL` com o IP do computador e a porta do backend (por padrão, `8080`). Em aparelho físico, não use `localhost`.

## Módulos

- Início e perfil, incluindo listagem e encerramento de sessões web/mobile.
- Mensagens internas entre ADMIN/COORDENACAO e PROFESSOR, com presença, não lidas e confirmação de leitura.
- Turmas, Conselho de Classe (VdC), Sistema de Avaliação do Aluno (SAA) ampliado e requerimentos.
- Administração de usuários, criação e edição de contas, indicadores, sessões globais e pré-cadastro de e-mails para `ADMIN`.

O aplicativo armazena access token e refresh token no SecureStore. A renovação é automática e rotativa; tokens antigos deixam de ser aceitos. O usuário pode encerrar sessões individuais pela tela Perfil, e o administrador pode revogar qualquer sessão na tela Administração.

## Configuração EAS

Para os perfis EAS `preview`, `preview-apk` e `production`, configure `EXPO_PUBLIC_API_URL` no painel do projeto Expo com a URL HTTPS pública real do backend. `EXPO_PUBLIC_API_URL` é uma configuração pública incorporada ao app; nunca coloque senhas, chaves de assinatura ou tokens de CI nela. Configure `EXPO_TOKEN` como segredo do provedor de CI.
