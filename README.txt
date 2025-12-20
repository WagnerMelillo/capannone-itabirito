Capannone Itabirito — Site estático + admin (Cloudflare Pages + KV + R2)

Arquivos principais:
- index.html (site)
- portal.html (portal Wi‑Fi opcional)
- admin.html (admin de campanhas/eventos)

Para o admin funcionar:
1) Cloudflare Pages (Framework: None)
2) Crie 1 KV e 1 R2
3) Faça bindings:
   - CAMPAIGNS_KV (KV)
   - CAMPAIGNS_BUCKET (R2)
4) Variável de ambiente: ADMIN_PIN=0502

Localmente, a galeria de campanhas mostra placeholders (prévia).