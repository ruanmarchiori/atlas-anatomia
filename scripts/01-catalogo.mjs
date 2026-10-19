// Etapa 1 do pré-processamento: lê os cabeçalhos dos OBJ e as listas do BodyParts3D
// e monta o catálogo base (id FMA, nome em inglês, sistema, região, limites).
// Saída: data/gerado/catalogo-base.json e data/gerado/revisar-outros.txt
//
// Uso: node scripts/01-catalogo.mjs
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const RAW = path.join(RAIZ, 'data/raw');
const OBJ = path.join(RAW, 'isa_BP3D_4.0_obj_99');
// Órgãos femininos do Human Reference Atlas, já convertidos (etapa 2).
const OBJ_HRA = path.join(RAW, 'hra-obj');
const SAIDA = path.join(RAIZ, 'data/gerado');
fs.mkdirSync(SAIDA, { recursive: true });

const lerTabela = (arq) => fs.readFileSync(path.join(RAW, arq), 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('\t').map((c) => c.trim()));

/* ---------- Hierarquia FMA (IS-A = "é um tipo de"; PART-OF = "faz parte de") ---------- */
const pais = { isa: new Map(), partof: new Map() };
const nomeConceito = new Map();
for (const arvore of ['isa', 'partof']) {
  for (const [pai, nomePai, filho, nomeFilho] of lerTabela(`${arvore}_inclusion_relation_list.txt`)) {
    if (!pais[arvore].has(filho)) pais[arvore].set(filho, []);
    pais[arvore].get(filho).push(pai);
    nomeConceito.set(pai, nomePai);
    nomeConceito.set(filho, nomeFilho);
  }
  for (const [c, , en] of lerTabela(`${arvore}_parts_list_e.txt`)) nomeConceito.set(c, en);
}
const nomeDe = (c) => (nomeConceito.get(c) || '').toLowerCase();

// Ancestrais em ordem de proximidade (busca em largura).
function ancestraisEmOrdem(conceito, arvore) {
  const ordem = [];
  const vistos = new Set([conceito]);
  let nivel = [conceito];
  while (nivel.length) {
    const prox = [];
    for (const x of nivel) {
      for (const p of pais[arvore].get(x) || []) {
        if (!vistos.has(p)) { vistos.add(p); ordem.push(p); prox.push(p); }
      }
    }
    nivel = prox;
  }
  return ordem;
}
const nomesAncestrais = (c, arvore) => ancestraisEmOrdem(c, arvore).map(nomeDe);

/* ---------- Estruturas compostas (pra deduzir as peças sem nome na fonte) ---------- */
const elementosPorConceito = new Map();
for (const arvore of ['isa', 'partof']) {
  for (const [c, nome, fj] of lerTabela(`${arvore}_element_parts.txt`)) {
    if (!elementosPorConceito.has(c)) elementosPorConceito.set(c, { nome, fjs: new Set() });
    elementosPorConceito.get(c).fjs.add(fj);
  }
}
function menorEstruturaQueContem(fj) {
  let melhor = null;
  for (const [c, v] of elementosPorConceito) {
    if (v.fjs.has(fj) && v.fjs.size > 1 && (!melhor || v.fjs.size < melhor.tam)) melhor = { c, nome: v.nome, tam: v.fjs.size };
  }
  return melhor;
}

/* ---------- Sistema ----------
   Ordem importa: primeiro o TIPO da peça (IS-A: é artéria, veia, osso, músculo, nervo),
   depois o SISTEMA ao qual pertence (PART-OF). Ex.: "artéria pulmonar" faz parte do
   pulmão, mas é uma artéria → artérias. O coração entra junto com as artérias (o
   grupo "circulatório-artérias" do atlas). */
const tem = (lista, ...termos) => lista.some((n) => termos.some((t) => (t instanceof RegExp ? t.test(n) : n === t)));
const RE = {
  arterias: /\barter(y|ies|ial)\b|\baorta\b|palmar arch|plantar arch|arterial arch|circle of willis/,
  veias: /\bveins?\b|vena cava|venous|dural sinus|sinus of dura|transverse sinus|sigmoid sinus|sagittal sinus/,
  linfatico: /lymph|thoracic duct|spleen|thymus|tonsil|cisterna chyli/,
  coracao: /\bheart\b|cardiac|atri(um|al)\b|ventricle of heart|cavity of (right|left) ventricle|(mitral|tricuspid|aortic|pulmonary) valve|papillary|chordae|myocardium|pericardi/,
  esqueletico: /\bbones?\b|vertebra|\bribs?\b|sternum|manubrium|xiphoid|skull|cranium|mandible|maxilla|cartilage|ligament|\bteeth\b|\btooth\b|incisor|canine tooth|premolar|molar tooth|meniscus|intervertebral disc|interosseous membrane|pubic symphysis|sacrum|coccyx|\bscapula\b|clavicle|patella|phalanx|carpal|tarsal|\bhyoid\b/,
  muscular: /muscle|tendon|aponeurosis|diaphragm|fascia|interosse[io]|lumbrical|levatores|trapezius|intertransversari|interspinal|iliotibial tract|linea alba|tendinous ring|raphe|retinaculum|galea/,
  nervoso: /nerve|ganglion|plexus|cerebr|cerebell|brain|spinal cord|medulla oblongata|pons\b|midbrain|thalam|putamen|caudate nucleus|pallidus|corpus callosum|fornix|colliculus|geniculate|mammillary|commissure|stria |stria$|septum of telencephalon|lamina terminalis|interventricular foramen|interpeduncular|peduncle|gyrus|sulcus|lobe of brain|insula|hippocamp|amygdal|ventricle of brain|lateral ventricle|third ventricle|fourth ventricle|neural|cauda equina|eyeball|retina|optic/,
  respiratorio: /lung|bronch|trache|laryn|pleura|nasal (cavity|septum|concha)|epiglott|conus elasticus|thyrohyoid membrane|vocal|glottis|arytenoid|cricoid|thyroid cartilage|alveol/,
  digestorio: /stomach|intestin|colon|duodenum|jejunum|ileum|cecum|caecum|rectum|\banal\b|anus|esophag|oesophag|liver|hepat|biliary|bile duct|gall|pancrea|tongue|oral|pharyn|salivary|parotid|sublingual gland|submandibular gland|appendix|mesentery|omentum|peritone|gingiva/,
  urinario: /kidney|renal|ureter|urinary|bladder|urethra/,
};
function sistemaDe(isa, partof, nome) {
  if (tem(isa, 'artery', 'segment of arterial tree organ', 'arterial tree') || RE.arterias.test(nome)) return 'arterias';
  if (tem(isa, 'vein', 'segment of venous tree organ', 'venous tree') || RE.veias.test(nome)) return 'veias';
  // Olho (órgão dos sentidos) fica com o sistema nervoso; laringe com o respiratório —
  // antes das regras de osso/ligamento/cartilagem, que capturariam essas peças. Músculos,
  // nervos e vasos dessas regiões seguem as regras do próprio tipo.
  // Músculos cujo nome contém "hyoid"/"scapula" e tendões. Membranas e ligamentos com
  // esses nomes (membrana tíreo-hióidea, ligamento estilo-hióideo) não entram aqui.
  if (/tendon\b|check ligament/.test(nome)) return 'muscular';
  if (!/membrane|ligament/.test(nome) && /\b(genio|mylo|omo|sterno|stylo|thyro)hyoid\b|levator scapulae|subscapularis/.test(nome)) return 'muscular';
  if (!/nerve/.test(nome) && /eyelid|lacrimal|tarsal plate/.test(nome)) return 'outros';
  const tipoProprio = /muscle|nerve|arter|vein|venous/.test(nome)
    || tem(isa, 'muscle organ', 'skeletal muscle organ', /muscle/, 'nerve', /nerve/);
  if (!tipoProprio && /\blens\b|cornea|\biris\b|ciliar|zonul|sclera|choroid|vitreous|corona ciliaris/.test(nome)) return 'nervoso';
  if (!tipoProprio && /laryn|epiglott|arytenoid|corniculate|cuneiform cartilage|cricoid|thyroid cartilage|vocal (ligament|fold)|conus elasticus|thyrohyoid/.test(nome)) return 'respiratorio';
  if (tem(isa, 'lymphatic vessel', 'lymph node', /lymphatic/) || tem(partof, 'lymphatic system', 'lymphoid system') || RE.linfatico.test(nome)) return 'linfatico';
  if (tem(isa, 'heart', /cardiac/) || tem(partof, 'heart') || RE.coracao.test(nome)) return 'arterias';
  if (tem(isa, 'bone organ', 'bone', 'cartilage organ', 'set of bones', 'tooth', 'ligament organ', /joint/, /articular/) || RE.esqueletico.test(nome)) return 'esqueletico';
  if (tem(isa, 'muscle organ', 'skeletal muscle organ', 'tendon', /muscle/) || RE.muscular.test(nome)) return 'muscular';
  if (tem(isa, 'nerve', /nerve/, /ganglion/, /plexus/) || tem(partof, 'nervous system', 'neuraxis', 'brain', 'spinal cord') || RE.nervoso.test(nome)) return 'nervoso';
  if (tem(partof, 'respiratory system', 'respiratory tract', 'lung', 'right lung', 'left lung', /bronch/, /trache/, /laryn/) || RE.respiratorio.test(nome)) return 'respiratorio';
  if (tem(partof, 'alimentary system', 'gastrointestinal tract', 'liver', 'biliary tree') || RE.digestorio.test(nome)) return 'digestorio';
  if (tem(partof, 'urinary system', 'kidney') || RE.urinario.test(nome)) return 'urinario';
  return 'outros';
}

/* ---------- Região ----------
   Pelo nome da peça quando ele diz (mão, pé, coxa...); senão, pela posição do centro da
   peça no corpo (coordenadas em mm, Z para cima, X lateral). */
const MEMBRO_SUP = /upper limb|\barm\b|forearm|\bhand\b|finger|thumb|wrist|carpal|metacarp|humer|\bradius\b|\bulna|axill|brachial|brachialis|biceps brachii|triceps|cubital|palm|thenar|pollicis|deltoid|of index finger|digiti minimi of hand/;
const MEMBRO_INF = /lower limb|thigh|\bleg\b|\bfoot\b|\btoe\b|hallu|ankle|tarsal|metatars|femor|femur|tibi|fibul|patell|popliteal|plantar|gluteal|gluteus|calcane|talus|crural|sartorius|gracilis|quadriceps|vastus|soleus|gastrocnemius|hamstring|semitendinosus|semimembranosus|biceps femoris/;
const GENITAL = /testis|epididym|penis|scrot|deferent duct|seminal vesicle|prostate|pubic hair/;
const REPRODUTOR_MASC = /testis|epididym|corpus cavernosum of penis|corpus spongiosum of penis|glans penis|deferent duct|seminal vesicle|prostate/;
function regiaoDe(partof, centro, alturaTotal, zMin, nome) {
  if (GENITAL.test(nome)) return 'pelve';
  if (MEMBRO_SUP.test(nome) || tem(partof, /upper limb/, /\bhand\b/, /forearm/)) return 'membro-superior';
  if (MEMBRO_INF.test(nome) || tem(partof, /lower limb/, /\bfoot\b/, /thigh/)) return 'membro-inferior';
  const h = (centro[2] - zMin) / alturaTotal; // 0 = sola do pé, 1 = topo da cabeça
  const lateral = Math.abs(centro[0]);
  if (h > 0.87) return 'cabeca';
  if (h > 0.82) return lateral > 120 ? 'membro-superior' : 'pescoco';
  if (h > 0.52 && lateral > 150) return 'membro-superior';
  if (h > 0.70) return 'torax';
  if (h > 0.58) return 'abdome';
  // Braço solto ao lado do corpo: a mão fica na altura do quadril, porém bem afastada.
  if (h > 0.38 && lateral > 210) return 'membro-superior';
  if (h > 0.47) return lateral > 140 ? 'membro-inferior' : 'pelve';
  return 'membro-inferior';
}

/* ---------- Leitura dos cabeçalhos dos OBJ (BodyParts3D + HRA) ---------- */
const arquivos = [
  ...fs.readdirSync(OBJ).filter((f) => f.endsWith('.obj')).sort().map((f) => path.join(OBJ, f)),
  ...(fs.existsSync(OBJ_HRA) ? fs.readdirSync(OBJ_HRA).filter((f) => f.endsWith('.obj')).sort().map((f) => path.join(OBJ_HRA, f)) : []),
];
const pecas = [];
for (const caminho of arquivos) {
  const arq = path.basename(caminho);
  const cab = fs.readFileSync(caminho, 'utf8').slice(0, 1500);
  // [ \t]* e não \s*: com \s*, um campo vazio "vazava" para a linha seguinte.
  const campo = (k) => (cab.match(new RegExp(`# ${k}[ \\t]*:[ \\t]*([^\\r\\n]*)`)) || [])[1]?.trim() || '';
  const lim = cab.match(/Bounds\(mm\): \(([^)]*)\)-\(([^)]*)\)/);
  pecas.push({
    fj: campo('File ID') || arq.replace('.obj', ''),
    fma: campo('Concept ID'),
    en: campo('English name'),
    min: lim[1].split(',').map(Number),
    max: lim[2].split(',').map(Number),
    obj: path.relative(RAW, caminho).replace(/\\/g, '/'),
    fonte: campo('Source') || 'BodyParts3D',
    sexo: (campo('Sex') || '').toLowerCase(),
  });
}
const zMin = Math.min(...pecas.map((p) => p.min[2]));
const zMax = Math.max(...pecas.map((p) => p.max[2]));
const altura = zMax - zMin;

const semNome = [];
for (const p of pecas) {
  p.centro = p.min.map((v, i) => +((v + p.max[i]) / 2).toFixed(1));
  const nomeMin = p.en.toLowerCase();
  p.lado = /\bright\b/.test(nomeMin) ? 'direito' : /\bleft\b/.test(nomeMin) ? 'esquerdo' : '';
  // Órgãos femininos do HRA: sistema reprodutor, sem hierarquia FMA.
  if (p.fonte === 'HRA') {
    p.sistema = 'reprodutor';
    p.regiao = /breast|mammary/.test(nomeMin) ? 'torax' : 'pelve';
    continue;
  }
  let conceito = p.fma;
  if (!p.fma) {
    // Peça sem nome na fonte: herda da menor estrutura que a contém, marcada pra revisar.
    const m = menorEstruturaQueContem(p.fj);
    p.en = m ? `Part of ${m.nome}` : 'Unnamed part';
    p.fmaPai = m ? m.c : '';
    p.semNomeNaFonte = true;
    conceito = p.fmaPai;
    semNome.push(p);
  }
  const nome = p.en.toLowerCase();
  const isa = conceito ? nomesAncestrais(conceito, 'isa') : [];
  const partof = conceito ? nomesAncestrais(conceito, 'partof') : [];
  if (!p.fma && p.fmaPai) { isa.unshift(nomeDe(p.fmaPai)); partof.unshift(nomeDe(p.fmaPai)); }

  p.sistema = sistemaDe(isa, partof, nome);
  // Sem sistema pelo próprio tipo: tenta pelo tipo das estruturas de que ela faz parte,
  // da mais próxima para a mais distante (ex.: "parte ascendente do trapézio" → o
  // trapézio é um músculo).
  if (p.sistema === 'outros' && conceito) {
    for (const anc of ancestraisEmOrdem(conceito, 'partof')) {
      const s = sistemaDe(nomesAncestrais(anc, 'isa'), [], nomeDe(anc));
      if (s !== 'outros') { p.sistema = s; p.herdouDe = nomeConceito.get(anc); break; }
    }
  }
  p.regiao = regiaoDe(partof, p.centro, altura, zMin, nome);
  // Aparelho reprodutor masculino (o BodyParts3D é um corpo masculino): sai de "outros".
  if (REPRODUTOR_MASC.test(nome)) { p.sistema = 'reprodutor'; p.sexo = 'm'; }
  // Peças só do corpo masculino em outros sistemas: somem quando o estudante escolhe o
  // corpo feminino (vasos do pênis e dos testículos; a pele, que tem a forma masculina).
  else if (/penis|testicular|^skin$/.test(nome)) p.sexo = 'm';
}

fs.writeFileSync(path.join(SAIDA, 'catalogo-base.json'), JSON.stringify({
  fonte: 'BodyParts3D 4.0 (isa_BP3D_4.0_obj_99), DBCLS + Human Reference Atlas (HuBMAP) — órgãos femininos',
  unidades: 'mm, Z para cima',
  limites: { zMin, zMax },
  pecas,
}, null, 1));

const outros = pecas.filter((p) => p.sistema === 'outros');
fs.writeFileSync(path.join(SAIDA, 'revisar-outros.txt'),
  `Peças que ficaram em "outros" (não pertencem a nenhum sistema da lista ou não deu pra classificar): ${outros.length}\n\n`
  + outros.map((p) => `${p.fj}\t${p.fma || '-'}\t${p.en}\t[${p.regiao}]`).join('\n') + '\n');

const conta = (campo) => {
  const r = {};
  for (const p of pecas) r[p[campo]] = (r[p[campo]] || 0) + 1;
  return Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | ');
};
console.log('Peças:', pecas.length, '| sem nome na fonte (deduzidas):', semNome.length);
console.log('Por sistema:', conta('sistema'));
console.log('Por região:', conta('regiao'));
console.log('Sem nome:', semNome.map((p) => `${p.fj}=${p.en} [${p.sistema}]`).join('; '));
