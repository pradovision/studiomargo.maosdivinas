# Margo Estilo Fashion — Continuidade e implantação controlada
Atualização: 06/11/2026. Branch de homologação: `feature/prado-vision-614`.

## Implementado no ambiente de homologação
- Prado Vision Monitor + AI v6.14 (painel técnico com autenticação e diagnósticos conforme commit de 31/10).
- Importador SalonSoft em `/migracao.html` protegido por sessão administrativa master e CSRF.
- Validação, prévia e importação idempotente; preservação de clientes e demais registros preexistentes.
- Fila de "Informações que exigem atenção" com prioridade, origem, motivo e anotação de revisão.
- Agenda por profissional, **somente leitura**, em `/agenda-profissional.html`, com filtros, status e bloqueios.
- Armazenamento persistente **exclusivo** para homologação em `/app/homologacao-data` (volume `margo-homologacao-data`, 250 MB); não compartilha o volume de produção.

## O que foi verificado
- Build e verificação de sintaxe do servidor e da agenda na Railway (deploy de homologação SUCCESS).
- Testes locais de importação com base isolada: 10 casos de unidade e 12 verificações de integração, sem alterar dados de produção.
- Os arquivos confidenciais com nomes/telefones **não** foram adicionados ao repositório.
- Não existe confirmação de testes de navegação fim-a-fim autenticados no navegador da Railway.

## Fonte SalonSoft (cinco planilhas)
- 2.478 linhas de clientes, 105 serviços, 52 produtos, 5 profissionais e 1 pacote-resumo.
- Em base de teste vazia: 1.806 clientes aptos, 358 telefones ausentes/inválidos, 312 registros com telefones repetidos e 2 nomes ausentes.
- Os números de importação real variam conforme duplicidades ou conflitos com o banco já existente na produção.
- **Não recebidos**: histórico de agendamentos, histórico financeiro completo e associação de clientes a pacotes.
- Não inferir saldos, sessões disponíveis ou estoque; novos produtos ficam inativos e com estoque zero. Serviços novos ficam ocultos e indisponíveis na agenda até revisão.

## Bloqueios para a importação definitiva
1. Confirmar um backup **restaurável** do volume de produção `/data`, guardado fora do volume.
2. Usar credenciais administrativas master legítimas no navegador, sem revelar senhas ao assistente.
3. Validar homologação com cópia isolada da base real ou dados fictícios, incluindo revisão de conflitos.
4. Confirmar invariantes: contagens, preservação de clientes existentes, serviços inativos/ocultos, sem dinheiro criado.
5. Programar janela de importação com cliente; evitar edições concorrentes durante a migração.
6. Publicar uma versão aprovada no branch de produção com plano de rollback, sem substituir o bundle por ZIP antigo.
7. Executar importação autenticada, reconciliar cadastros e entregar lista de pendências à proprietária.

## Próximas funcionalidades (ainda não prontas)
- Gestão individual de pacotes e sessões por cliente (dados de vínculo não fornecidos).
- Comanda/caixa ampliado e conciliação de comissões e estoque, sem gateway online.
- Métricas de fidelização, ocupação e resultados mensais em relatório.
- Testes visuais e operacionais ponta a ponta com usuários/fluxos representativos.
- Revisão e eventual ativação de alertas de backup externo e autorrecuperação segura.

## Cuidados
**Não** enviar planilhas com PII, arquivos `salonsoft-input.json`, dados reais, senhas ou backups ao GitHub público.
**Não** executar mutações de teste na produção.
A homologação e a produção são serviços separados dentro do mesmo projeto Railway; selecionar sempre o ID correto.


## Revisão de segurança e testes — 06/11/2026
- Nova agenda por profissional publicada no ambiente de homologação, commit `14264d9` (versão de leitura, sem comandos de alteração).
- Volume persistente próprio da homologação `margo-homologacao-data` montado em `/app/homologacao-data`; não remover ou compartilhar com `/data`.
- Importador protegido na homologação: commit `81ba718`; em produção, recusa `/api/admin/migracao/aplicar` se não houver `PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT` com data válida nas últimas 24 horas.
- A presença da variável é **somente um registro operacional** de que um administrador validou um backup externo; ela não substitui evidência nem testa a restauração automaticamente.
- O backup interno anterior à importação agora é lido e conferido quanto aos blocos obrigatórios e quantidades **antes da primeira gravação**.
- O importador continua restrito ao usuário master e ao CSRF já existente.
- Validados localmente: 10 testes unitários, 12 verificações de integração e 2 testes de barreira de produção/consulta de prévia, todos aprovados.
- O build da homologação agora executa `node --test /app/prado-migration/tests/safety.test.js` como etapa obrigatória.
- Não foi possível consultar nem restaurar o backup **real** de produção pelos conectores disponíveis.
- Não foram executados testes E2E autenticados na instância pública da Railway.
- Nenhuma migração foi executada em `margo-beauty-studio`, que permanece ligado à branch `production-v6.12`.

### Critérios objetivos de promoção para produção
1. Exportar backup da produção **fora do mesmo volume**, com armazenamento seguro e, se aplicável, arquivo de chave criptográfica separado.
2. Restaurar a cópia em um ambiente isolado, verificar integridade, contagens, agendamentos, usuários, finanças, imagens e acessos; documentar a evidência.
3. Testar a importação e a fila de divergências em homologação com sessão master autorizada, sem misturar dados de testes com dados reais.
4. Confirmar contagens e cadastros preexistentes, serviço oculto e produto inativo, idempotência e ausência de lançamentos financeiros indevidos.
5. Promover o código validado (não um ZIP antigo), obter aprovação da proprietária para a janela de migração e conferir o rollback.
6. Somente depois da restauração testada e com a janela aprovada, registrar `PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT` em produção (ISO 8601 em UTC) e realizar a importação autenticada pelo painel.
7. Conferir logs, disponibilidade, cadastros, agendamentos, anexos, registros financeiros e dashboard; entregar as pendências para revisão assistida.

**Nota:** os pacotes e saldos por cliente não foram fornecidos de modo identificável nos arquivos SalonSoft e não podem ser criados por suposição.

- Ensaio de restauração local aprovado em 06/11/2026: nove arquivos JSON operacionais restaurados de uma cópia anterior à importação; preservação de um cadastro fictício preexistente confirmada. **Não** equivale a testar os dados reais, uploads e material do painel técnico.


## Complemento de homologacao — 06/11/2026 (entrega assistida)
- Correcao assistida no painel de revisao: `Corrigir e cadastrar` recupera cliente inicialmente omitido por nome ou telefone, exigindo verificacao de titularidade, evitando telefone duplicado e salvando backup local antes da alteracao.
- A correcao nao mescla cadastros existentes e nao cria valores financeiros. Casos de saldo permanecem sujeitos a revisao independente.
- Pacotes do SalonSoft sao **resumos sem vinculo com clientes**, portanto a quantidade de pacotes efetivamente importados e `0`, embora exista um resumo para revisao.
- Importacao idempotente: em base isolada, os 1.806 cadastros aptos entram uma vez; nova execucao nao recria clientes, profissionais, servicos nem produtos.
- Rotina CI de homologacao agora inclui `safety.test.js` (6 testes) e `smoke.test.js` (teste de inicializacao/HTTP com subtestes autenticados), total de **12 verificacoes** aprovadas no build Railway do commit `714adaa`.
- O smoke testa site, painel, bloqueio de acesso anonimo, login master sintetico, configuracoes, agenda e previa sem escrita na base de teste.
- A prova de backup externo **nao** pode ser inferida da variavel `PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT`; e necessario validar uma copia recuperavel, com teste de restauracao e evidencia independente.
- A Railway oferece snapshots nativos no menu `Service > Backups` com agendamento diario, semanal ou mensal, mas os snapshots do volume so podem ser restaurados no mesmo projeto e ambiente. Para validar uma restauracao isolada e preciso, adicionalmente, um export de dados/backup da aplicacao para armazenamento separado.
- **Producao permanece inalterada.** Nao publicar ou executar migracao sem a prova de backup restauravel, validacao autenticada e janela aprovada.

### Unica etapa operacional atualmente bloqueada
Uma sessao autorizada com acesso ao ambiente de producao deve acionar e guardar um backup externo, baixar a chave criptografica se o backup exigir uma, restaurar uma copia em teste isolado e fornecer um registro de que a restauracao foi concluida. Nao enviar senhas, chaves ou base de clientes ao repositorio.
