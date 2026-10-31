# Margo 6.14.0 — Prado Vision

Base: production-v6.12, b7ce37cf1340939caba52d8734afa587bf86f370 (6.13.2).

## Entregue no código
Painel /tecnico, usuários exclusivos owner/support/auditor, MFA TOTP, CSRF,
sessões HttpOnly, auditoria HMAC local, saúde de arquivos/processo/disco,
latência da última hora, incidentes persistidos, diagnóstico por regras,
relatório JSON sanitizado para ChatGPT, PDF técnico/mensal, indicadores
mensais e evolução de seis meses, backup manual/diário AES-256-GCM com SHA-256,
inclusão de uploads/auditoria, retenção das 30 últimas cópias, recuperação
limitada à repetição de backup. SVG oficial transparente no rodapé.

## Limites que devem permanecer visíveis
- Sem modelo generativo externo; diagnóstico por regras do kit v0.1.
- Sem armazenamento remoto, monitor externo ou alertas fora do processo.
- Chave local no mesmo volume: exportar e guardar separadamente antes de
  considerar coberta a perda do volume. A chave não é incluída no backup.
- Auditoria com cadeia HMAC não equivale a WORM externo.
- Métricas HTTP de uma hora em memória; reinício perde essa janela.
- Indicadores de confirmação usam status atual. Ocupação usa expediente
  atual. Reagendamentos contam apenas eventos realmente registrados.
- Snapshot síncrono consistente com o escritor único deste serviço.
  Não aumentar réplicas nem introduzir outro escritor sem rever o mecanismo.
- Limite preventivo de 100 MiB por snapshot; falha explícita ao exceder.

## Primeiro acesso
Login master em /admin, depois /tecnico > Primeiro acesso técnico > Iniciar.
Cadastrar usuário individual, senha >=14 caracteres e autenticador TOTP.
Não reutilizar senha da cliente. Convites expiram em 15 minutos e não são
persistidos. Não colocar senhas ou chaves no GitHub ou nos relatórios.

## Testes
`node --test tests/*.test.js`: 34 testes aprovados (dados sintéticos isolados).
Backup real de 31/10/2026 18:08 restaurado em pasta temporária: inicialização
6.14.0 e 87 serviços; nove arquivos JSON permaneceram byte a byte idênticos.
Backup pré-publicação na Biblioteca privada, nunca neste repositório.

## Reversão
Antes do deploy: exportar backup JSON e registrar hashes por coleção.
Para reverter apenas aplicação, restaurar o commit b7ce37c na branch de
produção através de novo commit/reversão ou redeploy da versão anterior.
Não restaurar /data para reverter código: os arquivos operacionais mantêm
seu formato anterior. Preservar /data/prado-vision e sua chave mesmo se o
painel for desativado. Comparar hashes/contagens com o backup após deploy.
Não usar restauração sobre produção sem autorização explícita e ensaio isolado.
