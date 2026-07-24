# Capannone Itabirito — Estrutura do site

Documento de referência sobre como o site funciona, onde cada peça está hospedada e como fazer alterações com segurança. Escrito em 24/07/2026 depois de recuperar o acesso e sincronizar esta pasta com o que está publicado em produção.

## 1. Visão geral

O site é estático (HTML/CSS/JS puro, sem build). Ele é hospedado no Cloudflare Pages e tem uma parte dinâmica (campanhas e o texto "A Capannone") que é atendida por um Cloudflare Worker separado, com dados guardados em uma KV (banco chave-valor do Cloudflare).

Domínio publicado: **www.capannone.dasmmelhores.com** (e capannone.dasmmelhores.com).

Fonte da verdade do código: **repositório GitHub `WagnerMelillo/capannone-itabirito`, branch `main`**. Qualquer alteração publicada precisa passar por esse branch — é ele que o Cloudflare Pages usa para gerar o site ao vivo automaticamente.

## 2. Onde cada peça está hospedada (conta Cloudflare)

| Peça | Onde fica | Nome/identificação |
|---|---|---|
| Site estático | Cloudflare Pages | Projeto `capannone-itabirito` |
| Backend de campanhas/história | Cloudflare Workers | Worker `capannone-itabirito-api` |
| Dados das campanhas e do texto "A Capannone" | Cloudflare KV | Binding `CAPANNONE_DATA` (dentro do Worker acima) |
| PIN do painel admin | Secret do Worker | `ADMIN_PIN` (Workers e Pages → capannone-itabirito-api → Configurações → Variáveis e segredos) |
| DNS do domínio | Cloudflare DNS | Zona `dasmmelhores.com`, registro CNAME `capannone` apontando para o projeto Pages |
| Código-fonte | GitHub | `WagnerMelillo/capannone-itabirito`, branch `main` |

Importante: a mesma conta Cloudflare provavelmente tem outros Workers/registros DNS de outros projetos seus. Nenhum deles foi tocado durante esta organização — mexa apenas nos itens listados acima quando for editar a Capannone.

**Pages x Worker — não confunda:** o painel do Pages (`capannone-itabirito`) tem uma variável de ambiente `ADMIN_PIN` que ficou configurada lá de um teste antigo, mas ela **não é usada** pelo site. O PIN de verdade mora no **Secret do Worker**. Se um dia o login do admin parar de funcionar, o lugar certo para checar/trocar o PIN é sempre no Worker, não no Pages.

## 3. Como o deploy acontece

O Cloudflare Pages está conectado ao GitHub e faz deploy automático sempre que o branch `main` recebe um novo commit. O comando de build é `exit 0` (não há build — os arquivos são publicados como estão). Ou seja:

1. Você edita um arquivo (localmente ou pelo site do GitHub).
2. O arquivo é commitado no branch `main`.
3. O Cloudflare Pages detecta o commit e publica automaticamente em alguns segundos/minutos.
4. O site em www.capannone.dasmmelhores.com atualiza sozinho — não é preciso fazer nada manual no Cloudflare.

**Cuidado:** nunca clique em "Tentar implantar novamente"/"Retry deployment" de um deploy antigo no Cloudflare Pages sem checar antes qual commit ele vai reconstruir — isso pode publicar uma versão desatualizada do `main` por cima da atual.

## 4. Estrutura de arquivos desta pasta

```
Site_Capannone/
├── index.html              → Página principal do site
├── portal.html             → Portal de Wi-Fi do cliente (link "Wi-Fi" no site)
├── admin.html               → Painel administrativo (campanhas + texto "A Capannone")
├── README.txt               → Resumo rápido, aponta para este documento
├── ESTRUTURA-DO-SITE.md      → Este documento
├── css/
│   ├── site.css              → Estilo principal (cores, layout, cardápio, hero, etc.)
│   ├── overrides.css         → Pequenos ajustes específicos da seção "A Capannone"
│   ├── utility.css           → Estilo do portal Wi-Fi e do painel admin
│   └── admin-overrides.css   → Ajustes finos exclusivos do painel admin
├── js/
│   ├── site.js               → Cardápio, pedidos, carrega campanhas e o texto "A Capannone"
│   ├── portal.js             → Lógica do botão "Liberar Wi-Fi"
│   └── admin.js               → Login do admin, publicar campanha, editar texto "A Capannone"
├── assets/
│   ├── brand/                → Logo (jpg e webp)
│   ├── img/                  → Fotos usadas no site (pares .jpg/.webp)
│   └── favicon.svg
├── functions/                → Cloudflare Pages Functions (ver seção 6 — hoje sem uso)
├── _backup_arquivos_antigos/  → Arquivos de um projeto antigo e não relacionado (ver LEIA-ME dentro da pasta)
└── _backup_rascunho_antigo/   → Rascunhos/CSS antigo, já substituídos (ver LEIA-ME dentro da pasta)
```

### O que cada página faz

- **index.html** — página inicial: hero, cardápio (abas Pizzas/Cervejas/Refrigerantes/Sucos/Promoções, montado pelo `js/site.js`), seção "A Capannone" (texto vindo do Worker), pedidos (WhatsApp/Aiqfome), campanhas em destaque (vindas do Worker), localização (mapa) e rodapé com link discreto para `admin.html`.
- **portal.html** — página simples de portal de Wi-Fi: checkbox de termos + botão "Liberar Wi-Fi", que redireciona para o Aiqfome do Capannone.
- **admin.html** — protegida por PIN. Depois de logar, permite publicar/remover campanhas (imagem + título + mensagem) e editar o texto da seção "A Capannone".

## 5. O backend (Worker) e os dados

Endereço do Worker: `https://capannone-itabirito-api.wagnermelillo.workers.dev`

Endpoints usados pelo site:
- `POST /auth` — valida o PIN digitado no admin.
- `GET /campaigns` — lista campanhas para o index e para o admin.
- `POST /campaigns` — publica campanha nova (exige o PIN no cabeçalho `X-Admin-Pin`).
- `DELETE /campaigns/{id}` — remove campanha (exige PIN).
- `GET /content/history` — busca o texto da seção "A Capannone".
- `PUT /content/history` — salva o texto da seção "A Capannone" (exige PIN).

Todos os dados (campanhas publicadas e o texto da história) ficam guardados na KV `CAPANNONE_DATA`, dentro do Worker. Não há banco de dados externo nem R2 em uso — apesar do que dizia o README antigo.

## 6. Pasta `functions/` — atenção, provavelmente legado

A pasta `functions/api/...` contém código de Cloudflare Pages Functions (`auth.js`, `campaigns/*.js`, `content/*.js`) que faria o mesmo papel do Worker, mas usando caminhos relativos (`/api/...`) dentro do próprio Pages. **O site hoje não usa esses arquivos** — o `js/site.js` e o `js/admin.js` chamam diretamente o Worker externo (`capannone-itabirito-api.wagnermelillo.workers.dev`), não `/api/...`. Prováveis explicações: uma tentativa anterior de arquitetura que foi substituída pelo Worker separado, sem remover o código antigo do repositório. Está documentado aqui para não gerar confusão — pode ser removido no futuro com segurança, mas isso não foi feito agora para não mexer em nada além do que foi pedido.

## 7. Como fazer alterações com segurança

Para qualquer mudança (texto, imagem, CSS, JS):

1. Edite o arquivo na pasta local `C:\Projetos\Site_Capannone`.
2. Publique o arquivo no branch `main` do repositório GitHub (`WagnerMelillo/capannone-itabirito`) — por `git push` (se tiver Git configurado com sua conta) ou fazendo upload direto pela interface do GitHub (Add file → Upload files), como foi feito na sincronização mais recente.
3. Aguarde alguns instantes: o Cloudflare Pages publica sozinho.
4. Confira o resultado em www.capannone.dasmmelhores.com.

Se a mudança for grande ou você quiser testar antes de ir para o público, crie um branch separado (ex.: `teste-alguma-coisa`), suba os arquivos nele e abra um Pull Request — o Cloudflare Pages gera automaticamente uma prévia (preview) daquele branch, com uma URL própria, sem afetar o site ao vivo. Só depois de conferir a prévia, faça o merge para `main`.

## 8. Acesso ao painel administrativo

- URL: `https://www.capannone.dasmmelhores.com/admin.html`
- PIN atual (provisório): `Capa2026Prov` — recomendo trocar por um PIN definitivo que só você saiba.
- Para trocar o PIN: Cloudflare → Workers e Pages → `capannone-itabirito-api` → Configurações → Variáveis e segredos → editar (ícone de lápis) o segredo `ADMIN_PIN` → "Girar" (Rotate) → digitar o novo valor → Implantar. Essa troca é imediata, não precisa esperar nenhum deploy.

## 9. Pastas de backup

- `_backup_arquivos_antigos/` — arquivos de um projeto anterior e não relacionado (um portal de Wi-Fi com login via Instagram, hospedado em outro serviço). Não fazem parte do site atual; guardados apenas por precaução.
- `_backup_rascunho_antigo/` — CSS de rascunho (`style.css`) que foi substituído por `site.css`/`overrides.css`/`utility.css`/`admin-overrides.css`, e um arquivo temporário usado durante a reconstrução do JS. Podem ser apagados manualmente quando você tiver certeza de que não precisa mais deles (o assistente não conseguiu apagá-los automaticamente por uma restrição do sistema de arquivos desta pasta sincronizada).

## 10. Resumo do que foi corrigido nesta organização

- Removido do repositório GitHub o arquivo `css/style.css`, que era um rascunho antigo sem nenhuma referência no HTML/JS atual (confirmado antes de remover).
- Reescrito o `README.txt`, que ainda expunha publicamente um PIN antigo (`0502`) e descrevia uma arquitetura (KV `CAMPAIGNS_KV` + R2) que não corresponde ao que está realmente em produção.
- Este documento (`ESTRUTURA-DO-SITE.md`) criado como referência central para qualquer pessoa (técnica ou não) que precisar entender ou mexer no site no futuro.
