# Infotech Informática — site

Site: https://www.infotechinformatica.com
Painel para editar: https://app.pagescms.org (entrar com a conta do GitHub)

## Para o cliente: como atualizar o site

1. Entre em **app.pagescms.org** e clique em **Sign in with GitHub**.
2. Escolha o projeto **infotechinformatica**.
3. No menu da esquerda, escolha o que quer mudar:
   - **Fotos de clientes** — adicionar a foto de quem levou celular. Clique em **Add an entry**, envie a foto (pode ser direto do celular), preencha marca e modelo.
   - **Celular no boleto** — número de parcelas, brinde da promoção e modelos que "Já saíram daqui".
   - **Acessórios** — fotos e textos de cada categoria.
   - **Serviços de conserto** — as duas listas de serviços.
   - **Dúvidas frequentes** — perguntas e respostas.
   - **Dados da loja** — WhatsApp, Instagram, endereço, horário e links.
4. Clique em **Save**. Em 1 a 2 minutos o site atualiza sozinho.

Dicas:
- Para mudar a ordem, arraste os itens pela alça ao lado.
- "Foto grande" deixa o quadro em destaque. Use em uma ou duas fotos.
- Se algo for salvo errado (ex.: horário "dez" em vez de "10:00"), o site **não quebra**: a versão anterior continua no ar até a correção.
- Todo salvamento fica no histórico; dá para voltar qualquer versão.

## Para o desenvolvedor

- `src/index.html` — template (Mustache). Layout, CSS e textos fixos ficam aqui.
- `content/*.json` — tudo que o painel edita.
- `.pages.yml` — campos do painel.
- `build.mjs` — gera `dist/`: preenche o template, monta horário/JSON-LD/sitemap e converte fotos enviadas para `.webp` (até 1600px).
- `vercel.json` — a Vercel roda `npm run build` e publica `dist/`.

Rodar local:

```bash
npm install
npm run build   # abra dist/index.html
```
