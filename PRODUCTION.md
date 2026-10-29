# Margo Beauty Studio — Produção v6.11

Branch de produção usada pela Prado Vision para publicação do site, agendamento e painel de gestão.

## Segurança
- Cookie administrativo __Host-* / HttpOnly / Secure / SameSite=Strict.
- Proteção CSRF por sessão.
- Validação de origem para operações sensíveis.
- Sessão com expiração por inatividade e limite absoluto.
- Hash scrypt reforçado e upgrade automático de hashes antigos.
- Política de senha forte para novos acessos.
- Rate limits de login e rotas públicas.
- CSP/HSTS/anti-frame e métodos perigosos bloqueados.
- Processo Node executado sem root após preparação do volume.
- Dados operacionais somente no Volume persistente.

Nunca adicionar senhas, tokens, clientes, agendamentos ou dados financeiros ao repositório.
