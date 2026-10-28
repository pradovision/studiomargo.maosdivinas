# Margo Beauty Studio — Produção v6.10

Branch de produção usada pela Prado Vision para publicação do site, agendamento e painel de gestão.

O código da aplicação está empacotado em `.margo-prod.b64` e é extraído durante o build do Dockerfile.

## Segurança de produção
- A senha Master é fornecida exclusivamente por variável `ADMIN_PASSWORD`.
- Os dados operacionais devem ficar em Volume persistente da Railway.
- Nunca adicionar senhas, tokens, clientes, agendamentos ou financeiro ao repositório.

## Runtime
Node.js 22 / porta definida por `PORT` / healthcheck `/health`.
