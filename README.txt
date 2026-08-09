Capannone Itabirito — site estático (Cloudflare Pages) + painel admin (Cloudflare Worker + KV)

Para o passo a passo completo, arquitetura, como publicar alterações e como acessar o
painel admin, veja o arquivo ESTRUTURA-DO-SITE.md nesta mesma pasta.

Resumo rápido:
- Site publicado em: www.capannone.dasmmelhores.com
- Código-fonte (branch main) = o que está publicado. Deploy é automático via Cloudflare Pages.
- Campanhas e o texto "A Capannone" são servidos por um Cloudflare Worker separado
  (capannone-itabirito-api), com dados guardados em KV. Não há R2 em uso.
- O PIN do painel admin fica em um Secret do Worker (não no Pages). Veja a seção 8 de
  ESTRUTURA-DO-SITE.md para saber onde trocá-lo com segurança.
