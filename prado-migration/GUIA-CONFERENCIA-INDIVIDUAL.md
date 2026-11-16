# Margo Estilo Fashion — Conferencia individual do SalonSoft

Atualização: 16/11/2026

## Nova regra aprovada
TODOS os 2.478 registros de contatos passam por conferência individual. A presença de nome ou telefone aparentemente válido NÃO dá autorização para incluir automaticamente na base do Studio.

A origem pode conter contatos pessoais da agenda do celular da responsável. Não é permitido considerar cada pessoa como cliente real sem avaliação.

## Conteúdo exportado
| Arquivo | Registros | Resultado |
|---|---:|---|
| Clientes.xlsx | 2.478 | Entram apenas na fila privada |
| Serviços.xlsx | 105 | Cadastros auxiliares preparados separadamente, ocultos da agenda online |
| Produtos.xlsx | 52 | Cadastros auxiliares inativos, estoque zero até conferência |
| Profissionais.xlsx | 5 | Cadastros auxiliares inativos até vínculo e escala |
| Pacotes ativos.xlsx | 1 | Apenas resumo; não inventar clientes/sessões |

Os arquivos de clientes contêm Nome, Celular e "Saldo na casa". Não contêm histórico de agendamentos, tratamentos, visitas, serviços prestados ou recebimentos por cliente. Assim, histórico antigo do SalonSoft NÃO é importável com os arquivos fornecidos. O histórico já existente no Margo é preservado e pode ser associado pelo mesmo telefone, preferindo vínculo ao cadastro existente e sem duplicação. Saldos continuam sujeitos a verificação e não são criados no financeiro.

## Acesso à nova área
Homologação: `https://margo-prado-homologacao-production.up.railway.app/aprovacao-clientes.html`

Login: acesso administrativo master com senha legítima do ambiente. Não fornecer senhas nem códigos ao assistente.

1. Na Etapa 1, selecionar o JSON preparado (`salonsoft-input.json` extraído do pacote privado).
2. Clicar **Conferir arquivo** e validar o total de 2.478 contatos, com importação automática de 0 clientes.
3. Clicar **Preparar lista de conferência**. Isso salva os contatos privados apenas no armazenamento separado, sem incluí-los nos cadastros oficiais.
4. Para cada pessoa, conferir nome, telefone, observações e eventuais avisos. Escolher:
   - **Aprovar e cadastrar** quando confirmar que é cliente real, corrigindo o telefone com DDD quando necessário.
   - **Descartar** quando não for cliente; a decisão fica registrada na fila e não cria cadastro.
   - **Vincular ao cadastro existente** quando o telefone já está na base oficial; a ação preserva os dados e o histórico do cliente atual e não duplica a pessoa.
   - **Reabrir conferência** apenas para uma pessoa descartada por engano.
5. A Etapa 3 é independente, para serviços/produtos/profissionais. Produtos ficam inativos e com estoque zero. Serviços ficam ocultos e indisponíveis para agendamentos online; profissionais ficam inativos. Não existem lançamentos financeiros nem sessões inventadas.
6. A fila mostra pendentes, aprovados, vinculados e descartados, com usuário e data da decisão.

## Proteções técnicas implementadas
- Legacy `/api/admin/migracao/aplicar` retornará HTTP 410: importação automática desativada.
- Todas as rotas novas `/api/admin/migracao/v2/` são protegidas por sessão master e CSRF da própria aplicação.
- Lista de origem fica no arquivo privado `DATA_DIR/salonsoft-aprovacao-individual-v2.json`, com gravação atômica e permissão 0600.
- Reenvio idêntico não apaga decisões; envio de lote diferente é bloqueado para evitar perda de revisão.
- Aprovação exige nome válido e telefone com DDD; impede duplicidade contra clientes atuais e previamente aprovadas.
- Cada cadastro aprovado cria snapshot local e verifica a integridade mínima antes de salvar; grava auditoria.
- Nenhum dado pessoal foi colocado no repositório GitHub, código-fonte, imagens Docker ou variáveis de ambiente.

## Evidência de homologação
- Commit de deploy: `09ff94f4bb93f65951658c6f90a6dfec80e86166`.
- Railway: **SUCCESS** em 16/11/2026.
- Build: **20 verificações automatizadas**, nenhuma falha. Testes abrangem preparação sem cadastro, aprovação de uma pessoa, descarte, correção, vínculo com cliente existente, bloqueio de duplicidades, prevenção de importação sem backup em produção, smoke HTTP e restauração criptografada em dados fictícios.

## O que ainda está PENDENTE
- **Importação dos dados reais:** o JSON confidencial ainda não foi carregado na Railway. Não transmitir dados pessoais pelo GitHub ou variáveis de ambiente.
- **Validação do backup real:** os conectores não oferecem acesso direto aos snapshots nativos do volume /data, nem teste de restauração da produção. O snapshot de código no GitHub não é backup de dados.
- **Produção:** continua vinculada à branch `production-v6.12`. O módulo novo está somente em homologação; não pedir à responsável que revise a base real na homologação, pois as decisões não são automaticamente reproduzidas na produção.
- Antes de promover, comprovar snapshot nativo e uma cópia externa restaurável da produção, testar restore isolado, e promover em janela segura.
- Em produção, usar somente uma sessão master autorizada para enviar o JSON privado e iniciar a conferência final. A aprovação definitiva está protegida pela exigência de backup externo verificado recentemente.

## Privacidade
O arquivo de upload contém dados pessoais. Armazená-lo somente em lugar privado e compartilhar apenas com pessoa autorizada. Não colocar nomes, telefones e saldos em tickets públicos, logs ou GitHub.
