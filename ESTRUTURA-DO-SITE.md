# Capannone Itabirito — arquitetura e operação

Referência atualizada em 08/08/2026 após a reforma do painel administrativo e a auditoria de segurança.

## 1. Fonte da verdade e hospedagem

- Site oficial: `https://capannone.dasmmelhores.com/`.
- Hospedagem ativa: Cloudflare Pages, projeto `capannone-itabirito`.
- Repositório: `WagnerMelillo/capannone-itabirito`.
- Branch de produção: `main`.
- O Pages publica automaticamente cada commit aceito em `main`.
- O projeto Firebase possui um site de Hosting cadastrado, mas ele retorna “Site Not Found” e não é a hospedagem oficial.

## 2. Arquitetura

| Responsabilidade | Serviço | Identificação |
|---|---|---|
| HTML, CSS, JavaScript e assets estáticos | Cloudflare Pages | `capannone-itabirito` |
| Login individual | Firebase Authentication | projeto `capannone-itabirito` |
| Perfis, conteúdo, cardápio, campanhas e galeria | Cloud Firestore | banco `(default)`, região `nam5` |
| Imagens e vídeos enviados pelo painel | Cloudflare Worker + KV | Worker `capannone-itabirito-api`, binding `CAPANNONE_DATA` |
| DNS | Cloudflare DNS | zona `dasmmelhores.com` |

O navegador público lê conteúdo liberado pelas regras do Firestore. As gravações exigem uma conta ativa com perfil `admin` ou `superadmin` e senha definitiva. O Worker de mídia valida o token Firebase e o perfil no Firestore antes de aceitar upload ou exclusão.

## 3. Acessos

### Super-administrador

- Existe um único perfil autorizado como `superadmin`.
- Pode editar todo o conteúdo e gerenciar usuários.
- Pode criar administradores, bloquear ou reativar acesso, enviar redefinição de senha e exigir nova senha.
- As regras impedem a criação de um segundo super-administrador pelo painel.

### Administrador de marketing

- Usa e-mail e senha próprios.
- Ao receber uma senha provisória, precisa criar uma senha definitiva no primeiro acesso.
- Pode alterar conteúdo, fotos, vídeos, preços, cardápio, campanhas e galeria.
- Não pode listar ou gerenciar usuários e senhas.

O antigo acesso por credencial compartilhada foi aposentado. A senha Firebase de um usuário não depende de nenhum segredo do Worker.

## 4. Conteúdo gerenciado

Coleções/documentos principais do Firestore:

- `siteContent/home`: textos, contatos, links e imagens institucionais.
- `menuItems`: pizzas, bebidas, promoções, preços, ordem, visibilidade, foto, vídeo e mensagem de pedido.
- `campaigns`: título, descrição, situação, prioridade, período, desconto, produtos relacionados e imagem.
- `espaco_fotos`: galeria pública do espaço para eventos. Os dois registros antigos em base64 continuam compatíveis; novos uploads usam URL de mídia.
- `users`: perfil, papel, situação e obrigação de troca de senha.
- `auditLogs`: trilha das ações administrativas.

O `js/default-content.js` preserva um baseline local do conteúdo e do cardápio. Se o Firebase estiver temporariamente indisponível antes da inicialização do banco, o cliente continua vendo o conteúdo essencial.

## 5. Arquivos principais

```text
index.html                    página pública
admin.html                    painel administrativo responsivo
portal.html                   página atual do Wi-Fi
espaco-fotos.html             galeria pública
js/site.js                    leitura e renderização do conteúdo público
js/admin.js                   autenticação, permissões e operações do painel
js/default-content.js         baseline local e constantes compartilhadas
js/firebase-config.js         configuração pública do projeto Firebase
js/espaco-fotos.js            leitura compatível da galeria
js/portal.js                  aceite e redirecionamento do portal atual
worker/media-api.js           Worker autenticado para imagens e vídeos
firestore.rules               regras de acesso do banco
firebase.json                 configuração somente do Firestore
wrangler.toml                 configuração versionada do Worker
_headers                      cabeçalhos de segurança do Pages
```

Não existe etapa de build. Os módulos JavaScript são carregados diretamente pelo navegador.

## 6. Worker de mídia

URL: `https://capannone-itabirito-api.wagnermelillo.workers.dev`

Rotas atuais:

- `GET /health`: estado básico do serviço.
- `POST /media`: upload autenticado de JPG, PNG, WebP, MP4 ou WebM.
- `GET|HEAD /media/{id}`: entrega pública da mídia com cache e suporte a intervalo de bytes.
- `DELETE /media/{id}`: exclusão autenticada.
- `GET /campaigns`, `GET /content/history` e `GET|HEAD /images/{id}`: leitura temporária compatível com dados antigos em KV.

Uploads aceitam imagens de até 5 MB e vídeos de até 20 MB. A origem é limitada aos domínios oficiais, previews do Pages e ambiente local. O Worker verifica assinatura do arquivo, assinatura criptográfica do token Firebase, projeto emissor, validade do token e perfil ativo no Firestore.

## 7. Publicação segura

1. Trabalhar em branch separado.
2. Validar sintaxe, regras, links, interface pública e painel.
3. Publicar a branch e testar a URL de preview do Cloudflare Pages.
4. Aplicar previamente regras e dependências externas necessárias.
5. Fazer merge em `main` somente após a prévia passar.
6. Confirmar o domínio oficial e os endpoints após o deploy.

Para retorno, use o commit de produção anterior no GitHub e a versão anterior do Worker no histórico de implantações do Cloudflare. Regras do Firestore também mantêm histórico no console.

## 8. Segurança

- Regras Firestore versionadas e compiladas pelo Firebase antes da publicação.
- Leitura pública limitada ao conteúdo necessário ao site.
- Escrita limitada a perfis ativos e com troca de senha concluída.
- Gestão de usuários limitada ao super-administrador fixado nas regras.
- Cabeçalhos CSP, HSTS, `nosniff`, proteção contra framing e política de permissões em `_headers`.
- Renderização de dados externos com APIs de DOM, sem injeção de HTML.
- Validação de URL, MIME, assinatura e tamanho de arquivos.
- Sessão do painel limitada à aba do navegador.
- Logs administrativos sem armazenamento de senhas.
- As antigas Pages Functions administrativas foram removidas para reduzir a superfície de ataque.

As chaves presentes em `js/firebase-config.js` identificam o projeto cliente e são públicas por definição. A proteção efetiva está nas regras do Firestore, no Firebase Authentication e na validação do Worker.

## 9. Portal Wi-Fi

O `portal.html` atual mostra termos e, após o aceite, redireciona para o Aiqfome. Não foram encontrados callback, token, endereço de controlador, autorização de MAC, integração RADIUS nem parâmetros de um equipamento de hotspot.

Portanto, a página não comprova liberação real de rede. Para integrar o hotspot sem adivinhar parâmetros, ainda são necessários fabricante/modelo do controlador, fluxo de captive portal e credenciais/documentação técnica do equipamento. Até isso existir, preserve o fluxo atual para não quebrar o link exibido no site.

## 10. Operação do painel

- Acesso: `https://capannone.dasmmelhores.com/admin.html`.
- Use “Conteúdo do site” para textos, contatos, links e imagens institucionais.
- Use “Cardápio e preços” para criar, editar, ocultar ou excluir itens.
- Use “Campanhas” para rascunhar, agendar, ativar ou encerrar ações.
- Use “Fotos do espaço” para alimentar a galeria pública.
- “Usuários e acessos” aparece somente para o super-administrador.

Senhas provisórias devem ser entregues por canal seguro e nunca registradas no Git, em documentos públicos ou em código.
