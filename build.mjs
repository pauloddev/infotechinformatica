// Gera o site em dist/ a partir de src/index.html + content/*.json.
// Roda na Vercel a cada alteração feita pelo painel (Pages CMS).
// Uso local: npm install && npm run build  (depois abra dist/index.html)

import { readFile, writeFile, mkdir, cp, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import Mustache from 'mustache';
import sharp from 'sharp';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://www.infotechinformatica.com/';
const MAX_W = 1600; // largura máxima das fotos enviadas pelo painel

// Só escapa o necessário: URLs ficam legíveis no HTML final.
Mustache.escape = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = async (f) => JSON.parse(await readFile(path.join(ROOT, 'content', f), 'utf8'));
const fail = (msg) => { console.error('\n✖ ' + msg + '\n'); process.exit(1); };

// ---------- conteúdo ----------
const loja = await readJson('loja.json');
const boleto = await readJson('boleto.json');
const conserto = await readJson('conserto.json');
const lista = (x) => (Array.isArray(x) ? x : x?.lista || []);
const acessorios = lista(await readJson('acessorios.json'));
const clientes = lista(await readJson('clientes.json'));
const faq = lista(await readJson('faq.json'));

// ---------- telefone / WhatsApp ----------
const digits = String(loja.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
if (!/^\d{10,11}$/.test(digits)) fail(`WhatsApp inválido em "Dados da loja": "${loja.whatsapp}". Use DDD + número, ex.: 41992351553.`);
const ddd = digits.slice(0, 2), num = digits.slice(2);
const numFmt = num.length === 9 ? `${num.slice(0, 5)}-${num.slice(5)}` : `${num.slice(0, 4)}-${num.slice(4)}`;
const waBase = `https://wa.me/55${digits}`;
const waMsg = (m) => `${waBase}?text=${encodeURIComponent(m)}`;

// ---------- endereço ----------
const rua = loja.endereco.split(' – ')[0].split(' - ')[0].trim();          // sem "Dentro do Boni"
const ruaSemNumero = rua.split(',')[0].trim();
const mapsQuery = encodeURIComponent(`${rua}, ${loja.cidade} - ${loja.uf}, ${loja.cep}`);

// ---------- horário ----------
const DIAS = [ // ordem de exibição (seg → dom); d = número do dia no JS (0 = domingo)
  { k: 'segunda', d: 1, nome: 'Segunda-feira', curto: 'Seg', en: 'Monday' },
  { k: 'terca', d: 2, nome: 'Terça-feira', curto: 'Ter', en: 'Tuesday' },
  { k: 'quarta', d: 3, nome: 'Quarta-feira', curto: 'Qua', en: 'Wednesday' },
  { k: 'quinta', d: 4, nome: 'Quinta-feira', curto: 'Qui', en: 'Thursday' },
  { k: 'sexta', d: 5, nome: 'Sexta-feira', curto: 'Sex', en: 'Friday' },
  { k: 'sabado', d: 6, nome: 'Sábado', curto: 'sáb', en: 'Saturday' },
  { k: 'domingo', d: 0, nome: 'Domingo', curto: 'Dom', en: 'Sunday' },
];
const toMin = (v, dia) => {
  const m = String(v || '').trim().match(/^(\d{1,2})(?::|h)?(\d{2})?h?$/i);
  if (!m || +m[1] > 24 || +(m[2] || 0) > 59) fail(`Horário inválido em ${dia}: "${v}". Use o formato 10:00.`);
  return +m[1] * 60 + +(m[2] || 0);
};
const fmtH = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${h}h${m ? String(m).padStart(2, '0') : ''}`; };
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const dias = DIAS.map((D) => {
  const h = loja.horario?.[D.k];
  if (!h) fail(`Falta o horário de ${D.nome} em "Dados da loja".`);
  if (h.fechado) return { ...D, fechado: true };
  const abre = toMin(h.abre, D.nome), fecha = toMin(h.fecha, D.nome);
  if (fecha <= abre) fail(`Em ${D.nome}, o horário de fechar (${h.fecha}) precisa ser depois do de abrir (${h.abre}).`);
  return { ...D, fechado: false, abre, fecha };
});

// agrupa dias seguidos com o mesmo horário: "Seg a sáb 10h–20h · Dom 10h–18h"
const grupos = [];
for (const d of dias) {
  const last = grupos[grupos.length - 1];
  const same = last && last.fechado === d.fechado && last.abre === d.abre && last.fecha === d.fecha;
  if (same) last.dias.push(d); else grupos.push({ fechado: d.fechado, abre: d.abre, fecha: d.fecha, dias: [d] });
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nomeGrupo = (g, longo) => {
  const a = g.dias[0], b = g.dias[g.dias.length - 1];
  if (g.dias.length === 1) return longo ? a.nome : cap(a.curto.toLowerCase());
  const lig = g.dias.length === 2 ? ' e ' : ' a ';
  return cap(a.curto.toLowerCase()) + lig + b.curto.toLowerCase();
};
const horarioResumo = grupos
  .map((g) => `${nomeGrupo(g)} ${g.fechado ? 'fechado' : `${fmtH(g.abre)}–${fmtH(g.fecha)}`}`)
  .join(' · ');
const horarioRodape = grupos.map((g) => `${nomeGrupo(g, true)}: ${g.fechado ? 'fechado' : `${fmtH(g.abre)} às ${fmtH(g.fecha)}`}`);
const horarioTabela = dias.map((d) => ({ d: d.d, nome: d.nome, fechado: d.fechado, texto: d.fechado ? 'Fechado' : `${fmtH(d.abre)} às ${fmtH(d.fecha)}` }));
const hrJs = [0, 1, 2, 3, 4, 5, 6].map((n) => { const d = dias.find((x) => x.d === n); return d.fechado ? null : [d.abre, d.fecha]; });

// ---------- dados estruturados (Google) ----------
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ElectronicsStore',
  name: 'Infotech Informática',
  url: SITE_URL,
  logo: SITE_URL + 'logo.png',
  image: SITE_URL + 'img/fachada.webp',
  telephone: `+55 ${ddd} ${numFmt}`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: loja.endereco,
    addressLocality: loja.cidade,
    addressRegion: loja.uf,
    postalCode: loja.cep,
    addressCountry: 'BR',
  },
  openingHoursSpecification: grupos.filter((g) => !g.fechado).map((g) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: g.dias.length === 1 ? g.dias[0].en : g.dias.map((d) => d.en),
    opens: hhmm(g.abre),
    closes: hhmm(g.fecha),
  })),
  sameAs: [`https://www.instagram.com/${loja.instagram}/`],
};

// ---------- imagens ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'img'), { recursive: true });

const STATIC = ['favicon.ico', 'favicon-32.png', 'favicon-512.png', 'apple-touch-icon.png', 'logo.png', 'robots.txt'];
for (const f of STATIC) await cp(path.join(ROOT, f), path.join(DIST, f));
// fotos fixas do layout (as .webp que já estão otimizadas)
for (const f of await readdir(path.join(ROOT, 'img'))) {
  if (f.endsWith('.webp')) await cp(path.join(ROOT, 'img', f), path.join(DIST, 'img', f));
}

const done = new Map();
// Recebe o caminho salvo pelo painel ("/img/foto.jpg" ou "img/foto.jpg"),
// gera uma .webp otimizada em dist/img e devolve { src, w, h }.
async function foto(p, onde) {
  if (!p) fail(`Falta a foto em ${onde}.`);
  const rel = decodeURIComponent(String(p)).replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '');
  if (done.has(rel)) return done.get(rel);
  const srcFile = path.join(ROOT, rel);
  try { await stat(srcFile); } catch { fail(`A foto "${p}" (${onde}) não foi encontrada no repositório.`); }
  const meta = await sharp(srcFile).metadata();
  const isWebpOk = meta.format === 'webp' && meta.width <= MAX_W;
  const base = path.basename(rel).replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto';
  let outName = `${base}.webp`;
  for (let n = 2; [...done.values()].some((v) => v.src === `img/${outName}`) || (!isWebpOk && outName !== path.basename(rel) && await stat(path.join(ROOT, 'img', outName)).then(() => true, () => false)); n++) outName = `${base}-${n}.webp`;
  let w = meta.width, h = meta.height;
  if (meta.orientation >= 5) [w, h] = [h, w]; // fotos de celular "em pé"
  if (isWebpOk) {
    await cp(srcFile, path.join(DIST, 'img', outName));
  } else {
    const info = await sharp(srcFile).rotate().resize({ width: MAX_W, withoutEnlargement: true }).webp({ quality: 80 })
      .toFile(path.join(DIST, 'img', outName));
    w = info.width; h = info.height;
  }
  const out = { src: `img/${outName}`, w, h };
  done.set(rel, out);
  return out;
}

const listaFotos = async (lista, secao) => {
  if (!Array.isArray(lista) || !lista.length) fail(`"${secao}" precisa ter pelo menos um item.`);
  const out = [];
  for (const [i, item] of lista.entries()) {
    const nome = item.titulo || `item ${i + 1}`;
    out.push({ ...item, foto: await foto(item.foto, `${secao} → ${nome}`), descricao_foto: item.descricao_foto || item.titulo || '' });
  }
  return out;
};

// ---------- monta a página ----------
const view = {
  wa: {
    base: waBase,
    boleto: waMsg('Quero meu celular no boleto'),
    conserto: waMsg('Pedir orçamento do conserto'),
    acessorio: waMsg('Perguntar se tem o acessório'),
    indo: waMsg('Olá, Infotech! Estou indo até a loja.'),
    site: waMsg('Olá, Infotech! Vim pelo site.'),
  },
  telDisplay: `(${ddd}) ${numFmt}`,
  instagram: loja.instagram.replace(/^@/, ''),
  instagramUrl: `https://www.instagram.com/${loja.instagram.replace(/^@/, '')}/`,
  links: loja.links,
  endereco: loja.endereco,
  cidade: loja.cidade,
  uf: loja.uf,
  rua: ruaSemNumero,
  enderecoCompleto: `${loja.endereco}, ${loja.cidade} – ${loja.uf}, ${loja.cep}`,
  mapsQuery,
  horarioResumo,
  horarioRodape,
  horarioTabela,
  horarioJs: JSON.stringify(hrJs),
  jsonLd: JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c'),
  boleto: { ...boleto, parcelas: Number(boleto.parcelas) || 18, modelos: (boleto.modelos || []).filter(Boolean) },
  conserto: { celulares: (conserto.celulares || []).filter(Boolean), informatica: (conserto.informatica || []).filter(Boolean) },
  acessorios: await listaFotos(acessorios, 'Acessórios'),
  clientes: await listaFotos(clientes, 'Clientes'),
  faq: faq.filter((f) => f.pergunta).map((f, i) => ({ ...f, aberta: i === 0 })),
};

const template = await readFile(path.join(ROOT, 'src', 'index.html'), 'utf8');
await writeFile(path.join(DIST, 'index.html'), Mustache.render(template, view));

const hoje = new Date().toISOString().slice(0, 10);
await writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);

console.log(`✔ Site gerado em dist/ (${view.acessorios.length} acessórios, ${view.clientes.length} clientes, ${view.faq.length} dúvidas)`);
