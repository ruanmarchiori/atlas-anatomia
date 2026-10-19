// Etapa 4: monta o catálogo final usado pelo app (public/dados/catalogo.json), juntando
//   - data/gerado/catalogo-base.json  (etapa 1: nome em inglês, sistema, região)
//   - data/gerado/modelos-indice.json (etapa 3: arquivo GLB, índice da peça, centro, tamanho)
//   - data/traducao/*.tsv              (tabelas de tradução, mantidas à mão)
// e lista os nomes marcados como "revisar" e os que ficaram sem tradução.
//
// Tradução: cada linha do TSV é
//   nome-base-em-inglês <TAB> nome em português <TAB> revisar (sim/vazio) <TAB> nota
// O "nome-base" é o nome sem "right/left". No português, {m} {f} {mp} {fp} marcam ONDE
// entra o lado e com qual concordância (direito/direita/direitos/direitas).
//
// Uso: node scripts/04-catalogo-app.mjs
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/gerado/catalogo-base.json'), 'utf8'));
const modelos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/gerado/modelos-indice.json'), 'utf8'));

/* ---------- Tabelas de tradução ---------- */
const tabela = new Map();
const dirTrad = path.join(RAIZ, 'data/traducao');
for (const arq of fs.readdirSync(dirTrad).filter((f) => f.endsWith('.tsv'))) {
  for (const linha of fs.readFileSync(path.join(dirTrad, arq), 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.startsWith('#')) continue;
    const [en, pt, revisar, nota] = linha.split('\t');
    if (!pt) continue;
    tabela.set(en.trim().toLowerCase(), { pt: pt.trim(), revisar: /^s/i.test(revisar || ''), nota: (nota || '').trim() });
  }
}

/* ---------- Regras para as séries (vértebras, costelas, falanges, dentes...) ---------- */
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const ORD_RE = Object.keys(ORD).join('|');
const REGIAO_VERT = { cervical: ['cervical', 'C'], thoracic: ['torácica', 'T'], lumbar: ['lombar', 'L'] };
const DEDO = {
  thumb: 'polegar {m}', 'index finger': 'dedo indicador {m}', 'middle finger': 'dedo médio {m}',
  'ring finger': 'dedo anular {m}', 'little finger': 'dedo mínimo da mão {f}',
  'big toe': 'hálux {m}', 'second toe': '2º dedo do pé {m}', 'third toe': '3º dedo do pé {m}',
  'fourth toe': '4º dedo do pé {m}', 'little toe': 'dedo mínimo do pé {m}',
};
const FALANGE = { distal: 'distal', middle: 'média', proximal: 'proximal' };
const regras = [
  [new RegExp(`^(${ORD_RE}) (cervical|thoracic|lumbar) vertebra$`), (m) => `Vértebra ${REGIAO_VERT[m[2]][0]} ${REGIAO_VERT[m[2]][1]}${ORD[m[1]]}`],
  [new RegExp(`^intervertebral disk of (${ORD_RE}) (cervical|thoracic|lumbar) vertebra$`), (m) => `Disco intervertebral da vértebra ${REGIAO_VERT[m[2]][1]}${ORD[m[1]]}`],
  [new RegExp(`^(${ORD_RE}) rib$`), (m) => `${ORD[m[1]]}ª costela {f}`],
  [new RegExp(`^(${ORD_RE}) costal cartilage$`), (m) => `${ORD[m[1]]}ª cartilagem costal {f}`],
  [new RegExp(`^(${ORD_RE}) metacarpal bone$`), (m) => `${ORD[m[1]]}º osso metacarpal {m}`],
  [new RegExp(`^(${ORD_RE}) metatarsal bone$`), (m) => `${ORD[m[1]]}º osso metatarsal {m}`],
  [/^(distal|middle|proximal) phalanx of (.+)$/, (m) => (DEDO[m[2]] ? `Falange ${FALANGE[m[1]]} do ${DEDO[m[2]]}` : null)],
  // Dentes "secondary" = permanentes.
  [/^(upper|lower) (?:(first|second) )?(?:(central|lateral) )?secondary (molar|premolar|incisor|canine) tooth$/, (m) => {
    const tipo = { molar: 'molar', premolar: 'pré-molar', incisor: 'incisivo', canine: 'canino' }[m[4]];
    const ord = m[2] ? `${ORD[m[2]]}º ` : '';
    const pos = m[3] ? ` ${{ central: 'central', lateral: 'lateral' }[m[3]]}` : '';
    const arcada = m[1] === 'upper' ? 'superior' : 'inferior';
    return `${ord}${tipo[0].toUpperCase()}${tipo.slice(1)}${pos} ${arcada} {m} (permanente)`.replace(/^(\d+º) ([A-Z])/, (_, o, l) => `${o} ${l.toLowerCase()}`);
  }],
];

/* ---------- Composição do nome com o lado ---------- */
const LADO = {
  direito: { '{m}': 'direito', '{f}': 'direita', '{mp}': 'direitos', '{fp}': 'direitas' },
  esquerdo: { '{m}': 'esquerdo', '{f}': 'esquerda', '{mp}': 'esquerdos', '{fp}': 'esquerdas' },
};
function aplicarLado(modelo, lado) {
  let s = modelo.replace(/\{(m|f|mp|fp)\}/g, (k) => (lado ? LADO[lado][k] : ''));
  s = s.replace(/\s+/g, ' ').replace(/\s+([,)])/g, '$1').trim();
  return s[0].toUpperCase() + s.slice(1);
}
const nomeBase = (en) => en.toLowerCase().replace(/\b(right|left)\b ?/g, '').replace(/\s+/g, ' ').trim();

function traduzir(p) {
  const b = nomeBase(p.en);
  const t = tabela.get(b);
  if (t) return { pt: aplicarLado(t.pt, p.lado), revisar: t.revisar, nota: t.nota };
  for (const [re, fn] of regras) {
    const m = b.match(re);
    if (m) {
      const pt = fn(m);
      if (pt) return { pt: aplicarLado(pt, p.lado), revisar: false, nota: '' };
    }
  }
  return null;
}

/* ---------- Monta o catálogo ---------- */
const NOMES_SISTEMA = {
  esqueletico: 'Esquelético', muscular: 'Muscular', arterias: 'Circulatório — artérias e coração',
  veias: 'Circulatório — veias', nervoso: 'Nervoso e olho', respiratorio: 'Respiratório',
  digestorio: 'Digestório', urinario: 'Urinário', linfatico: 'Linfático', reprodutor: 'Reprodutor', outros: 'Outros',
};
const NOMES_REGIAO = {
  cabeca: 'Cabeça', pescoco: 'Pescoço', torax: 'Tórax', abdome: 'Abdome', pelve: 'Pelve',
  'membro-superior': 'Membro superior', 'membro-inferior': 'Membro inferior',
};

const semTraducao = [];
const revisar = [];
const sistemas = {};
for (const p of base.pecas) {
  const t = traduzir(p);
  if (!t) semTraducao.push(p);
  else if (t.revisar || p.semNomeNaFonte) revisar.push({ ...p, pt: t.pt, nota: p.semNomeNaFonte ? 'peça sem nome na fonte (deduzido da estrutura que a contém)' : t.nota });
  const m = modelos.pecas[p.fj];
  if (!m) throw new Error(`Peça sem modelo: ${p.fj} — rode a etapa 3`);
  sistemas[p.sistema] = sistemas[p.sistema] || [];
  sistemas[p.sistema].push({ p, t, m });
}

const catalogo = {
  versao: new Date().toISOString().slice(0, 10),
  credito: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International; órgãos femininos: Human Reference Atlas (HuBMAP), CC BY 4.0',
  alturaCorpo: modelos.alturaCorpo,
  regioes: NOMES_REGIAO,
  sistemas: Object.keys(NOMES_SISTEMA).filter((s) => sistemas[s]).map((s) => {
    const lista = sistemas[s];
    // Ordem das peças = ordem dentro do GLB (índice _PIECE).
    const porArquivo = {};
    for (const versao of ['completo', 'reduzido']) {
      porArquivo[versao] = modelos.arquivos[`${versao}/${s}`].map((a) => ({ arquivo: a.arquivo, bytes: a.bytes, triangulos: a.triangulos }));
    }
    return {
      id: s,
      nome: NOMES_SISTEMA[s],
      arquivos: porArquivo,
      // [fj, fma, en, pt, regiao, revisar(0/1), cx, cy, cz, sx, sy, sz, idxCompleto, idxReduzido, arqCompleto, arqReduzido]
      pecas: lista.map(({ p, t, m }) => ({
        fj: p.fj,
        fma: p.fma || p.fmaPai || '',
        en: p.en,
        pt: t ? t.pt : p.en,
        regiao: p.regiao,
        revisar: !t || t.revisar || !!p.semNomeNaFonte,
        // 'm'/'f' = só aparece com o corpo masculino/feminino; vazio = nos dois
        sexo: p.sexo || '',
        fonte: p.fonte === 'HRA' ? 'HRA' : 'BP3D',
        centro: m.centro,
        tamanho: m.tamanho,
        completo: [porArquivo.completo.findIndex((a) => a.arquivo === m.completo.arquivo), m.completo.indice],
        reduzido: [porArquivo.reduzido.findIndex((a) => a.arquivo === m.reduzido.arquivo), m.reduzido.indice],
      })),
    };
  }),
};

fs.mkdirSync(path.join(RAIZ, 'public/dados'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'public/dados/catalogo.json'), JSON.stringify(catalogo));

const linha = (p) => `${p.fj}\t${NOMES_SISTEMA[p.sistema]}\t${p.en}\t→ ${p.pt || '(sem tradução)'}${p.nota ? `\t(${p.nota})` : ''}`;
fs.writeFileSync(path.join(RAIZ, 'data/gerado/revisar-nomes.txt'),
  `Nomes em português marcados como "revisar": ${revisar.length}\n\n${revisar.map(linha).join('\n')}\n\n`
  + `Sem tradução (aparecem em inglês no app): ${semTraducao.length}\n\n${semTraducao.map((p) => linha({ ...p, pt: '' })).join('\n')}\n`);

const total = base.pecas.length;
console.log(`Catálogo: ${total} peças | traduzidas ${total - semTraducao.length} | revisar ${revisar.length} | sem tradução ${semTraducao.length}`);
for (const s of catalogo.sistemas) {
  const sem = s.pecas.filter((x) => x.pt === x.en).length;
  console.log(`  ${s.nome.padEnd(36)} ${String(s.pecas.length).padStart(4)} peças  sem tradução: ${sem}`);
}
