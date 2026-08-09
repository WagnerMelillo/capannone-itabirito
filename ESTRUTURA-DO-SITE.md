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
├── espaco-fotos.html        → Galeria pública do espaço para eventos
├── 404.html                 → Página real de erro para endereços inexistentes
├── _headers                 → Cabeçalhos de segurança aplicados pelo Cloudflare Pages
├── robots.txt / sitemap.xml → Indexação e mapa do site
├── README.txt               → Resumo rápido, aponta para este documento
├── ESTRUTURA-DO-SITE.md      → Este documento
├── css/
│   ├── site.css              → Estilo principal (cores, layout, cardápio, hero, etc.)
│   ├── overrides.css         → Pequenos ajustes específicos da seção "A Capannone"
│   ├── utility.css           → Estilo do portal Wi-Fi e do painel admin
│   ├── admin-overrides.css   → Ajustes finos exclusivos do painel admin
│   └── gallery.css           → Estilo da galeria pública
├── js/
│   ├── site.js               → Cardápio, pedidos, carrega campanhas e o texto "A Capannone"
│   ├── portal.js             → Lógica do botão "Liberar Wi-Fi"
│   ├── admin.js              → Login do admin, publicar campanha, editar texto "A Capannone"
│   ├── firebase-config.js    → Configuração pública do projeto Firebase
│   ├── espaco-fotos.js       → Leitura da galeria pública
│   └── admin-gallery.js      → Upload e exclusão das fotos do espaço
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

## 6. Pasta `functions/` — legado não usado pelo frontend, mas ainda publicado

A pasta `functions/api/...` contém código de Cloudflare Pages Functions (`auth.js`, `campaigns/*.js`, `content/*.js`) que faria o mesmo papel do Worker, mas usando caminhos relativos (`/api/...`) dentro do próprio Pages. **O frontend hoje não chama esses arquivos** — `js/site.js` e `js/admin.js` usam diretamente o Worker externo (`capannone-itabirito-api.wagnermelillo.workers.dev`). Mesmo assim, as rotas legadas foram confirmadas como públicas em produção (`/api/campaigns/list` e `/api/content/get`). Por isso o código foi endurecido para falhar fechado sem `ADMIN_PIN`, validar tipos/tamanhos e não aceitar um PIN padrão. A remoção completa deve ocorrer apenas depois de confirmar no painel Cloudflare que nenhum consumidor externo depende dessas rotas.

## 7. Como fazer alterações com segurança

Para qualquer mudança (texto, imagem, CSS, JS):

1. Edite o arquivo na pasta local `C:\Projetos\Site_Capannone`.
2. Publique o arquivo no branch `main` do repositório GitHub (`WagnerMelillo/capannone-itabirito`) — por `git push` (se tiver Git configurado com sua conta) ou fazendo upload direto pela interface do GitHub (Add file → Upload files), como foi feito na sincronização mais recente.
3. Aguarde alguns instantes: o Cloudflare Pages publica sozinho.
4. Confira o resultado em www.capannone.dasmmelhores.com.

Se a mudança for grande ou você quiser testar antes de ir para o público, crie um branch separado (ex.: `teste-alguma-coisa`), suba os arquivos nele e abra um Pull Request — o Cloudflare Pages gera automaticamente uma prévia (preview) daquele branch, com uma URL própria, sem afetar o site ao vivo. Só depois de conferir a prévia, faça o merge para `main`.

## 8. Acesso ao painel administrativo

- URL canônica: `https://capannone.dasmmelhores.com/admin`
- PIN atual: mantido exclusivamente como Secret do Worker. **Não registre o valor neste arquivo, no Git ou em mensagens.**
- Para trocar o PIN: Cloudflare → Workers e Pages → `capannone-itabirito-api` → Configurações → Variáveis e segredos → editar (ícone de lápis) o segredo `ADMIN_PIN` → "Girar" (Rotate) → digitar o novo valor → Implantar. Essa troca é imediata, não precisa esperar nenhum deploy.

## 9. Pastas de backup

- `_backup_arquivos_antigos/` — arquivos de um projeto anterior e não relacionado (um portal de Wi-Fi com login via Instagram, hospedado em outro serviço). Não fazem parte do site atual; guardados apenas por precaução.
- `_backup_rascunho_antigo/` — CSS de rascunho (`style.css`) que foi substituído por `site.css`/`overrides.css`/`utility.css`/`admin-overrides.css`, e um arquivo temporário usado durante a reconstrução do JS. Podem ser apagados manualmente quando você tiver certeza de que não precisa mais deles (o assistente não conseguiu apagá-los automaticamente por uma restrição do sistema de arquivos desta pasta sincronizada).

## 10. Galeria de fotos do Espaço (Firebase)

A partir de 24/07/2026, o site tem uma galeria de fotos do Espaço Capannone (`espaco-fotos.html`, com um link de destaque em "Locação do espaço" na página inicial). Diferente do restante do site, essa parte usa o **Firebase** (projeto `capannone-itabirito`, conta Google wagnermelillo@gmail.com), não o Cloudflare:

- **Cloud Firestore** — banco de dados onde cada foto é um documento na coleção `espaco_fotos` (imagem em base64 + legenda + data). Console: https://console.firebase.google.com/project/capannone-itabirito/firestore
- **Authentication (e-mail/senha)** — existe uma única conta técnica (`magnamelillo@gmail.com`) usada só para satisfazer a exigência de login do Firestore. Console: https://console.firebase.google.com/project/capannone-itabirito/authentication/users
- **Regras de segurança** — qualquer visitante pode ver as fotos; só quem estiver logado nessa conta técnica pode publicar ou remover.
- **js/firebase-config.js** — configuração pública do projeto (a chave não é secreta; a proteção real são as Regras de Segurança do Firestore).
- **js/espaco-fotos.js** — carrega e exibe as fotos na página pública.
- **js/admin-gallery.js** — upload (com redimensionamento automático da imagem) e exclusão, na seção "Fotos do Espaço" dentro de `admin.html`.

**Não existe mais login separado para a galeria.** Desde 24/07/2026 (correção pedida pelo Wagner), a seção "Fotos do Espaço" fica dentro do mesmo painel protegido pelo PIN de campanhas/história — ao entrar em `admin.html` com o PIN, a galeria já aparece pronta para uso. Por trás dos panos, o `admin-gallery.js` usa o próprio PIN digitado como senha para logar automaticamente na conta técnica do Firebase (`magnamelillo@gmail.com`), sem pedir nada a mais da pessoa.

**Isso cria uma dependência importante: a senha da conta técnica no Firebase precisa ser sempre igual ao PIN atual do admin.** Se um dia o PIN for trocado (Secret `ADMIN_PIN` no Worker, seção 8 acima), é preciso também atualizar a senha dessa conta no Firebase para o mesmo valor, senão a galeria mostra a mensagem "Não foi possível conectar a galeria de fotos com o PIN atual" (o restante do admin — campanhas e história — continua funcionando normalmente, só a galeria fica bloqueada até sincronizar).

**Como sincronizar a senha da galeria com o PIN atual:** Firebase Console → Authentication → Users → clique nos "⋮" ao lado de `magnamelillo@gmail.com` → Reset password → digite exatamente o mesmo valor do PIN atual (mínimo 6 caracteres, exigência do Firebase).

**Para adicionar um funcionário/outro administrador:** basta dar a ele o PIN de admin — não é preciso criar nenhuma conta nova no Firebase. Se quiser que essa pessoa NÃO tenha acesso à galeria de fotos (só a campanhas/história), isso exigiria voltar a ter PINs separados — hoje o sistema usa um único PIN para tudo, por decisão do Wagner (mais simples de administrar).

## 11. Resumo do que foi corrigido nesta organização

- Removido do repositório GitHub o arquivo `css/style.css`, que era um rascunho antigo sem nenhuma referência no HTML/JS atual (confirmado antes de remover).
- Reescrito o `README.txt`, que ainda expunha publicamente um PIN antigo e descrevia uma arquitetura (KV `CAMPAIGNS_KV` + R2) que não corresponde ao que está realmente em produção.
- Este documento (`ESTRUTURA-DO-SITE.md`) criado como referência central para qualquer pessoa (técnica ou não) que precisar entender ou mexer no site no futuro.

## 12. Proteções técnicas adicionadas em 08/08/2026

- Cabeçalhos CSP, HSTS, Permissions-Policy, proteção contra framing e `nosniff` em `_headers`.
- Canonical/Open Graph corrigidos para o domínio de marca, JSON-LD de restaurante, `robots.txt`, `sitemap.xml` e página 404 real.
- Renderização segura de campanhas e fotos sem interpolar conteúdo externo diretamente em `innerHTML`.
- Timeout e validação de resposta nas chamadas ao Worker.
- Revalidação do PIN salvo antes de reabrir o painel.
- Validação de MIME/tamanho e otimização da imagem da galeria para respeitar o limite do Firestore.
- Pages Functions legadas sem credencial padrão e com validação de entrada.
- `.gitattributes` e `.gitignore` para normalizar fim de linha e impedir que backups locais entrem no Git por engano.

Estas mudanças só passam a valer no site público depois de serem revisadas, commitadas e publicadas no branch usado pelo Cloudflare Pages.
