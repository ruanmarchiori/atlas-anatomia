// Etapa 2: órgãos reprodutores FEMININOS do Human Reference Atlas (HuBMAP, CC BY 4.0).
//
// O BodyParts3D é um corpo masculino. Os órgãos femininos vêm do HRA (feitos a partir do
// Visible Human feminino), em outro sistema de coordenadas. Este script:
//   1. lê os GLB do HRA (data/raw/hra/), peça por peça;
//   2. encaixa cada peça no nosso corpo:
//      - útero, ovários e tubas: escala pela pelve óssea feminina do HRA comparada ao quadril
//        e ao sacro do BodyParts3D; depois o conjunto é posto EM PÉ (eixo colo → fundo na
//        vertical, face anterior para a frente — a vista clássica de atlas; o HRA traz o
//        útero antevertido, quase deitado) e o colo vai para o meio da pelve, logo acima
//        da bexiga e na frente do reto (a bexiga do modelo masculino é grande);
//      - mamas: apoiadas sobre o músculo peitoral maior;
//   3. grava cada peça como OBJ no MESMO formato dos arquivos do BodyParts3D (mm, Z para
//      cima, frente = −Y, cabeçalho com nome e limites) em data/raw/hra-obj/.
// Daí em diante elas seguem o mesmo caminho das outras (etapas 1, 3 e 4).
//
// Uso: node scripts/02-hra-para-obj.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const RAIZ = path.resolve(import.meta.dirname, '..');
const HRA = path.join(RAIZ, 'data/raw/hra');
const BP = path.join(RAIZ, 'data/raw/isa_BP3D_4.0_obj_99');
const SAIDA = path.join(RAIZ, 'data/raw/hra-obj');
const MAX_TRIANGULOS = 45000; // por peça, já na versão "completa" (as mamas passam de 500 mil)

await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/* ---------- Limites (mm) de peças do BodyParts3D, lidos do cabeçalho dos OBJ ---------- */
const limitesBP = new Map();
for (const f of fs.readdirSync(BP)) {
  const cab = fs.readFileSync(path.join(BP, f), 'utf8').slice(0, 1500);
  const nome = (cab.match(/# English name[ \t]*:[ \t]*([^\r\n]*)/) || [])[1]?.trim();
  const b = cab.match(/Bounds\(mm\): \(([^)]*)\)-\(([^)]*)\)/);
  if (nome && b) limitesBP.set(nome, { min: b[1].split(',').map(Number), max: b[2].split(',').map(Number) });
}
const caixaBP = (...nomes) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const n of nomes) {
    const l = limitesBP.get(n);
    if (!l) throw new Error(`Peça de referência não encontrada no BodyParts3D: ${n}`);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], l.min[i]); max[i] = Math.max(max[i], l.max[i]); }
  }
  return { min, max };
};

/* ---------- Encaixe pela pelve ----------
   HRA (metros): X = esquerda, Y = cima, Z = frente.  BodyParts3D (mm): X = esquerda,
   Z = cima, −Y = frente. Mesma orientação, só troca de eixos e unidade. */
const pelveHra = getBounds((await io.read(path.join(HRA, 'VH_F_Pelvis.glb'))).getRoot().listScenes()[0]);
const pelveBp = caixaBP('Right hip bone', 'Left hip bone', 'Sacrum');
// Escala pela largura e altura da pelve (a profundidade do HRA inclui o cóccix, que o
// BodyParts3D não tem, e distorceria a conta).
const sLargura = (pelveBp.max[0] - pelveBp.min[0]) / ((pelveHra.max[0] - pelveHra.min[0]) * 1000);
const sAltura = (pelveBp.max[2] - pelveBp.min[2]) / ((pelveHra.max[1] - pelveHra.min[1]) * 1000);
const ESCALA = Math.sqrt(sLargura * sAltura);
const pelve = {
  // centro em X e na altura; na profundidade, alinha a face anterior (sínfise púbica)
  hra: [(pelveHra.min[0] + pelveHra.max[0]) / 2, (pelveHra.min[1] + pelveHra.max[1]) / 2, pelveHra.max[2]],
  bp: [(pelveBp.min[0] + pelveBp.max[0]) / 2, (pelveBp.min[2] + pelveBp.max[2]) / 2, pelveBp.min[1]],
};
// HRA (m) → BodyParts3D (mm), com âncora `a` (no HRA) e `b` (no BodyParts3D: x, z, y-frente).
const paraBp = (p, a, b, desloc = [0, 0, 0]) => [
  ESCALA * (p[0] - a[0]) * 1000 + b[0] + desloc[0],
  -(ESCALA * (p[2] - a[2]) * 1000) + b[2] + desloc[1],
  ESCALA * (p[1] - a[1]) * 1000 + b[1] + desloc[2],
];
const normalParaBp = (n) => [n[0], -n[2], n[1]];

/* ---------- Peças e nomes ---------- */
// nó do HRA → [nome em inglês (com right/left como no BodyParts3D), região]
const NOMES = {
  VH_F_body_of_uterus: 'Body of uterus', VH_F_fundus_of_uterus: 'Fundus of uterus',
  VH_F_cornua: 'Cornua of uterus', VH_F_lower_uterine_segment: 'Lower uterine segment',
  VH_F_posterior_wall_of_uterus: 'Posterior wall of uterus', VH_F_anterior_wall_of_uterus: 'Anterior wall of uterus',
  VH_F_cervix: 'Cervix of uterus', VH_F_internal_cervical_os: 'Internal os of cervix',
  VH_F_external_cervical_os: 'External os of cervix', VH_F_abdominal_ostium_of_uterine_tube: 'Abdominal ostium of uterine tube',
  VH_F_left_ovary: 'Left ovary', VH_F_right_ovary: 'Right ovary',
};
const LADO = { L: 'left', R: 'right' };
function nomeDe(no) {
  if (NOMES[no]) return NOMES[no];
  const m = no.match(/^VH_F_(.+)_([LR])$/);
  if (!m) return null;
  const lado = LADO[m[2]];
  const tuba = {
    ampulla_of_uterine_tube: `Ampulla of ${lado} uterine tube`, isthmus_of_fallopian_tube: `Isthmus of ${lado} uterine tube`,
    fibria_of_uterine_tube: `Fimbriae of ${lado} uterine tube`, uterine_tube_infundibulum: `Infundibulum of ${lado} uterine tube`,
  }[m[1]];
  if (tuba) return tuba;
  return {
    fat: `Adipose tissue of ${lado} breast`, areolar_tubercles: `Areolar tubercles of ${lado} breast`,
    nipple: `Nipple of ${lado} breast`, areola: `Areola of ${lado} breast`, mammary_lobes: `Lobes of ${lado} mammary gland`,
    main_lactiferous_ducts: `Lactiferous ducts of ${lado} breast`, main_lactiferous_sinuses: `Lactiferous sinuses of ${lado} breast`,
    suspensory_ligaments: `Suspensory ligaments of ${lado} breast`,
  }[m[1]] || null;
}

/* ---------- Leitura de uma malha (posições/normais no mundo do HRA) ---------- */
function extrair(no) {
  const mundo = no.getWorldMatrix();
  const pos = [];
  const nor = [];
  const ind = [];
  for (const prim of no.getMesh().listPrimitives()) {
    const P = prim.getAttribute('POSITION');
    const N = prim.getAttribute('NORMAL');
    const I = prim.getIndices();
    const base = pos.length / 3;
    const v = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, v);
      const x = mundo[0] * v[0] + mundo[4] * v[1] + mundo[8] * v[2] + mundo[12];
      const y = mundo[1] * v[0] + mundo[5] * v[1] + mundo[9] * v[2] + mundo[13];
      const z = mundo[2] * v[0] + mundo[6] * v[1] + mundo[10] * v[2] + mundo[14];
      pos.push(x, y, z);
      if (N) {
        N.getElement(i, v);
        const nx = mundo[0] * v[0] + mundo[4] * v[1] + mundo[8] * v[2];
        const ny = mundo[1] * v[0] + mundo[5] * v[1] + mundo[9] * v[2];
        const nz = mundo[2] * v[0] + mundo[6] * v[1] + mundo[10] * v[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l);
      }
    }
    if (I) for (let i = 0; i < I.getCount(); i++) ind.push(base + I.getScalar(i));
    else for (let i = 0; i < P.getCount(); i++) ind.push(base + i);
  }
  return { pos: new Float32Array(pos), nor: nor.length ? new Float32Array(nor) : null, ind: new Uint32Array(ind) };
}

function normaisSuaves(pos, ind) {
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < ind.length; t += 3) {
    const [a, b, c] = [ind[t] * 3, ind[t + 1] * 3, ind[t + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return nor;
}

/** Junta vértices na mesma posição (algumas malhas do HRA repetem o vértice em cada
 *  triângulo — sem isso o simplificador não consegue reduzir nada). Normais recalculadas. */
function soldar(m) {
  const mapa = new Map();
  const pos = [];
  const novo = new Uint32Array(m.pos.length / 3);
  for (let i = 0; i < novo.length; i++) {
    const chave = `${m.pos[i * 3].toFixed(6)},${m.pos[i * 3 + 1].toFixed(6)},${m.pos[i * 3 + 2].toFixed(6)}`;
    let k = mapa.get(chave);
    if (k === undefined) { k = pos.length / 3; mapa.set(chave, k); pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); }
    novo[i] = k;
  }
  if (mapa.size === novo.length) return m; // já era soldada
  const ind = new Uint32Array(m.ind.length);
  for (let i = 0; i < ind.length; i++) ind[i] = novo[m.ind[i]];
  return { pos: new Float32Array(pos), nor: null, ind };
}

function simplificar(m) {
  if (m.ind.length / 3 <= MAX_TRIANGULOS) return m;
  const [ind] = MeshoptSimplifier.simplify(m.ind, m.pos, 3, MAX_TRIANGULOS * 3, 0.01, ['LockBorder']);
  return { ...m, ind };
}

/* ---------- Conversão ---------- */
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });

// Mamas: centro de cada uma sobre o peitoral maior (parte esternocostal) do mesmo lado.
const peitoral = { left: caixaBP('Sternocostal part of left pectoralis major'), right: caixaBP('Sternocostal part of right pectoralis major') };
const bexiga = caixaBP('Urinary bladder');
// Útero em pé: o óstio externo do colo fica no centro da pelve, logo acima da bexiga e
// ~18 mm na frente do reto (medido na fatia de 820–865 mm de altura).
const ALVO_COLO = [pelve.bp[0], -90, bexiga.max[2] - 2];
const grupoUtero = []; // peças do útero/tubas/ovários: giradas e movidas juntas no fim

const arquivos = ['VH_F_Uterus.glb', 'VH_F_Ovary_L.glb', 'VH_F_Ovary_R.glb', 'VH_F_Fallopian_Tube_L.glb', 'VH_F_Fallopian_Tube_R.glb',
  '3d-vh-f-mammary-gland-l.glb', '3d-vh-f-mammary-gland-r.glb'];
const relatorio = [];

for (const arq of arquivos) {
  const doc = await io.read(path.join(HRA, arq));
  const cena = doc.getRoot().listScenes()[0];
  const mama = /mammary/.test(arq);
  const ladoMama = /-l\.glb$/.test(arq) ? 'left' : 'right';
  // Âncora das mamas: centro em X/altura e face posterior (encostada no peitoral).
  let ancora = pelve;
  if (mama) {
    const b = getBounds(cena);
    const p = peitoral[ladoMama];
    ancora = {
      hra: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]],
      // um pouco medial ao centro do peitoral; na altura entre a 4ª e a 5ª costela; a face
      // de trás da mama 15 mm atrás do ponto mais anterior do músculo (a superfície é curva)
      bp: [((p.min[0] + p.max[0]) / 2) * 0.88, p.min[2] + (p.max[2] - p.min[2]) * 0.38, p.min[1] + 15],
    };
  }

  for (const no of doc.getRoot().listNodes().filter((n) => n.getMesh())) {
    const nome = nomeDe(no.getName());
    if (!nome) { console.log('  (ignorado)', no.getName()); continue; }
    let m = simplificar(soldar(extrair(no)));
    // Converte para o BodyParts3D (mm) e compacta vértices não usados após simplificar.
    const usados = new Map();
    const pos = [];
    const norOrig = m.nor;
    const nor = [];
    const ind = [];
    for (const i of m.ind) {
      let k = usados.get(i);
      if (k === undefined) {
        k = pos.length / 3;
        usados.set(i, k);
        pos.push(...paraBp([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]], ancora.hra, ancora.bp));
        if (norOrig) nor.push(...normalParaBp([norOrig[i * 3], norOrig[i * 3 + 1], norOrig[i * 3 + 2]]));
      }
      ind.push(k);
    }
    const normais = nor.length ? nor : Array.from(normaisSuaves(pos, ind));
    const peca = { no: no.getName(), arq, nome, pos, normais, ind };
    if (mama) gravar(peca); else grupoUtero.push(peca);
  }
}

/* ---------- Útero em pé ---------- */
const centroide = (no) => {
  const pc = grupoUtero.find((x) => x.no === no);
  if (!pc) throw new Error(`Peça não encontrada: ${no}`);
  const c = [0, 0, 0];
  for (let i = 0; i < pc.pos.length; i += 3) for (let j = 0; j < 3; j++) c[j] += pc.pos[i + j];
  return c.map((v) => v / (pc.pos.length / 3));
};
const colo = centroide('VH_F_external_cervical_os');
const fundo = centroide('VH_F_fundus_of_uterus');
// Ângulo do eixo colo → fundo no plano sagital (Y = profundidade, Z = altura), medido a
// partir da vertical; girar por −φ em torno do eixo X deixa o eixo vertical.
const phi = Math.atan2(fundo[1] - colo[1], fundo[2] - colo[2]);
const [cs, sn] = [Math.cos(phi), Math.sin(phi)];
for (const pc of grupoUtero) {
  for (let i = 0; i < pc.pos.length; i += 3) {
    const y = pc.pos[i + 1] - colo[1];
    const z = pc.pos[i + 2] - colo[2];
    pc.pos[i] += ALVO_COLO[0] - colo[0];
    pc.pos[i + 1] = y * cs - z * sn + ALVO_COLO[1];
    pc.pos[i + 2] = y * sn + z * cs + ALVO_COLO[2];
    const [ny, nz] = [pc.normais[i + 1], pc.normais[i + 2]];
    pc.normais[i + 1] = ny * cs - nz * sn;
    pc.normais[i + 2] = ny * sn + nz * cs;
  }
  gravar(pc);
}

function gravar({ no: nomeNo, arq, nome, pos, normais, ind }) {
  {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], pos[i + j]); max[j] = Math.max(max[j], pos[i + j]); }
    const id = `HRA_${nomeNo.replace(/^VH_F_/, 'F_')}`;
    const linhas = [
      '#',
      '# Human Reference Atlas (HuBMAP) 3D reference organ — CC BY 4.0 — https://humanatlas.io/3d-reference-library',
      `# Original node : ${nomeNo} (${arq})`,
      '# Converted to the BodyParts3D frame (mm, Z up, front = -Y) by scripts/02-hra-para-obj.mjs',
      '#',
      `# File ID : ${id}`,
      '# Concept ID : ',
      `# English name : ${nome}`,
      '# Source : HRA',
      '# Sex : F',
      `# Bounds(mm): (${min.map((v) => v.toFixed(4)).join(',')})-(${max.map((v) => v.toFixed(4)).join(',')})`,
      '#',
    ];
    for (let i = 0; i < pos.length; i += 3) linhas.push(`v ${pos[i].toFixed(4)} ${pos[i + 1].toFixed(4)} ${pos[i + 2].toFixed(4)}`);
    for (let i = 0; i < normais.length; i += 3) linhas.push(`vn ${normais[i].toFixed(5)} ${normais[i + 1].toFixed(5)} ${normais[i + 2].toFixed(5)}`);
    for (let t = 0; t < ind.length; t += 3) linhas.push(`f ${ind[t] + 1}//${ind[t] + 1} ${ind[t + 1] + 1}//${ind[t + 1] + 1} ${ind[t + 2] + 1}//${ind[t + 2] + 1}`);
    fs.writeFileSync(path.join(SAIDA, `${id}.obj`), linhas.join('\n') + '\n');
    relatorio.push(`${id.padEnd(46)} ${nome.padEnd(42)} ${(ind.length / 3).toLocaleString('pt-BR').padStart(8)} triângulos`);
  }
}
console.log(`Escala HRA → BodyParts3D: ${ESCALA.toFixed(3)} | útero posto em pé (girado ${(-phi * 180 / Math.PI).toFixed(0)}°), colo em ${ALVO_COLO.map((v) => v.toFixed(0)).join(', ')} mm`);
console.log(relatorio.join('\n'));
console.log(`${relatorio.length} peças gravadas em data/raw/hra-obj/`);
