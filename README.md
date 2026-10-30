# Margo Estilo Fashion

Site institucional estático: `index.html`, `style.css`, `favicon.svg` e `assets/`.
A identidade e os contatos foram reaproveitados do pacote v6.13. A logo SVG e o favicon têm fundo transparente. As fotos são os assets de referência do projeto, sem alegação de representar o espaço físico.

## Visualizar

Execute `python3 -m http.server 8000` na raiz e abra http://localhost:8000.
Não requer build, JavaScript nem CDN de estilos. Publique todos os arquivos e a pasta `assets` juntos.

## Publicação e sistema existente

Em 30/10/2026, Railway usa a branch `production-v6.12`, com runtime em `.margo-prod.b64` e volume persistente `/data`. A raiz da branch `main` não é a página servida por esse runtime.

Esta atualização é do site institucional. Os links de serviços e agendamento apontam para o sistema existente em https://margoestilofashion.com.br. Não substitua a branch de produção por esta página estática: isso removeria as rotas do sistema. Para integrar ao Railway, transportar esta página e seus assets para `public/` do runtime em uma alteração específica, preservando servidor, páginas de agendamento e volume `/data`.

O Instagram mantém o identificador configurado no projeto; renomear a marca não altera automaticamente o perfil externo. O WhatsApp foi obtido de `data/settings.json` da versão v6.13.
