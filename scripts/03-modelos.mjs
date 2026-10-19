// Etapa 3 do pré-processamento: gera os modelos GLB a partir dos OBJ do BodyParts3D.
//
// - Um GLB por sistema (artérias, músculos, ...), com TODAS as peças do sistema numa
//   malha só (1 draw call). Cada vértice carrega o atributo _PIECE = índice da peça no
//   sistema; a lista de peças (ids FMA/arquivo) vai no "extras" da malha. Assim o app
//   continua selecionando peça por peça.
// - Duas versões: "completo" (geometria original) e "reduzido" (simplificada, p/ celular).
// - Compressão meshopt (EXT_meshopt_compression) + quantização. Nenhum arquivo passa de
//   50 MB: se passar, o sistema é dividido por região.
// - Coordenadas convertidas para metros, Y para cima, frente do corpo para +Z, corpo
//   centralizado na origem.
//
// Uso: node scripts/03-modelos.mjs            (todos os sistemas)
//      node scripts/03-modelos.mjs esqueletico (só um)
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const RAIZ = path.resolve(import.meta.dirname, '..');
const OBJ = path.join(RAIZ, 'data/raw/isa_BP3D_4.0_obj_99');
const SAIDA = path.join(RAIZ, 'public/modelos');
const LIMITE = 50 * 1024 * 1024;

// Versão reduzida: fração de triângulos mantida e erro máximo (relativo ao tamanho da peça).
const REDUCAO = { proporcao: 0.22, erro: 0.004, minimoTriangulos: 60 };

const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/gerado/catalogo-base.json'), 'utf8'));
const pecas = base.pecas;

// Centro do corpo (mm), para centralizar o modelo na origem.
const minG = [Infinity, Infinity, Infinity];
const maxG = [-Infinity, -Infinity, -Infinity];
for (const p of pecas) for (let i = 0; i < 3; i++) { minG[i] = Math.min(minG[i], p.min[i]); maxG[i] = Math.max(maxG[i], p.max[i]); }
const centroG = minG.map((v, i) => (v + maxG[i]) / 2);
// mm (Z para cima, frente = −Y)  →  metros (Y para cima, frente = +Z)
const converter = (x, y, z) => [(x - centroG[0]) / 1000, (z - centroG[2]) / 1000, -(y - centroG[1]) / 1000];

/* ---------- Leitura de um OBJ (v / vn / f v//vn, só triângulos) ---------- */
// p.obj: caminho relativo a data/raw (BodyParts3D ou órgãos do HRA convertidos na etapa 2).
function lerObj(p) {
  const texto = fs.readFileSync(path.join(RAIZ, 'data/raw', p.obj), 'utf8');
  const v = [];
  const vn = [];
  const faces = [];
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('v ')) {
      const [, x, y, z] = linha.trim().split(/\s+/);
      v.push(converter(+x, +y, +z));
    } else if (linha.startsWith('vn ')) {
      const [, x, y, z] = linha.trim().split(/\s+/);
      vn.push([+x, +z, -+y]); // mesma rotação das posições (sem translação/escala)
    } else if (linha.startsWith('f ')) {
      const idx = linha.trim().split(/\s+/).slice(1).map((t) => t.split('/'));
      // Triangula polígonos em leque (os arquivos já vêm em triângulos).
      for (let k = 1; k + 1 < idx.length; k++) faces.push(idx[0], idx[k], idx[k + 1]);
    }
  }
  // Vértice = par (posição, normal). No BodyParts3D os índices coincidem; ainda assim
  // monta um índice próprio para não depender disso.
  const mapa = new Map();
  const pos = [];
  const nor = [];
  const ind = new Uint32Array(faces.length);
  faces.forEach(([iv, , ivn], k) => {
    const chave = `${iv}/${ivn || iv}`;
    let i = mapa.get(chave);
    if (i === undefined) {
      i = pos.length / 3;
      mapa.set(chave, i);
      pos.push(...v[+iv - 1]);
      const n = vn[(+ivn || +iv) - 1] || [0, 1, 0];
      nor.push(...n);
    }
    ind[k] = i;
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), ind };
}

/* ---------- Simplificação (versão reduzida) ---------- */
// liberarBordas: malhas do HRA (mamas) têm muitas bordas abertas; travando as bordas a
// simplificação quase não reduz. Para elas, as bordas também podem ser simplificadas.
function simplificar(malha, liberarBordas = false) {
  const alvo = Math.max(REDUCAO.minimoTriangulos * 3, Math.floor((malha.ind.length * REDUCAO.proporcao) / 3) * 3);
  if (alvo >= malha.ind.length) return malha;
  const [ind] = liberarBordas
    // Prune: apaga componentes soltos minúsculos (lobos, ductos e ligamentos da mama são
    // centenas de pedacinhos; sem isso não há o que simplificar).
    ? MeshoptSimplifier.simplify(malha.ind, malha.pos, 3, alvo, 0.02, ['Prune'])
    : MeshoptSimplifier.simplify(malha.ind, malha.pos, 3, alvo, REDUCAO.erro, ['LockBorder']);
  // Compacta: só os vértices ainda usados.
  const novo = new Map();
  const pos = [];
  const nor = [];
  const out = new Uint32Array(ind.length);
  for (let k = 0; k < ind.length; k++) {
    let i = novo.get(ind[k]);
    if (i === undefined) {
      i = pos.length / 3;
      novo.set(ind[k], i);
      const o = ind[k] * 3;
      pos.push(malha.pos[o], malha.pos[o + 1], malha.pos[o + 2]);
      nor.push(malha.nor[o], malha.nor[o + 1], malha.nor[o + 2]);
    }
    out[k] = i;
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), ind: out };
}

/* ---------- Monta e grava um GLB com várias peças numa malha só ---------- */
async function gravarGlb(arquivo, lista) {
  let nv = 0;
  let ni = 0;
  for (const m of lista) { nv += m.malha.pos.length / 3; ni += m.malha.ind.length; }
  if (nv > 65535 * 65535) throw new Error('vértices demais');
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const peca = new Uint16Array(nv);
  const ind = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  lista.forEach((m, idx) => {
    const n = m.malha.pos.length / 3;
    pos.set(m.malha.pos, ov * 3);
    nor.set(m.malha.nor, ov * 3);
    peca.fill(idx, ov, ov + n);
    for (let k = 0; k < m.malha.ind.length; k++) ind[oi + k] = m.malha.ind[k] + ov;
    ov += n;
    oi += m.malha.ind.length;
  });

  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (tipo, arr) => doc.createAccessor().setType(tipo).setArray(arr).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos))
    .setAttribute('NORMAL', acc('VEC3', nor))
    .setAttribute('_PIECE', acc('SCALAR', peca))
    .setIndices(acc('SCALAR', ind));
  const malha = doc.createMesh(path.basename(arquivo, '.glb')).addPrimitive(prim)
    .setExtras({ pecas: lista.map((m) => m.fj) });
  doc.createScene().addChild(doc.createNode(path.basename(arquivo, '.glb')).setMesh(malha));

  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, bytes);
  return { bytes: bytes.length, vertices: nv, triangulos: ni / 3 };
}

/* ---------- Principal ---------- */
await MeshoptSimplifier.ready;
const filtro = process.argv[2];
const sistemas = [...new Set(pecas.map((p) => p.sistema))].filter((s) => !filtro || s === filtro);
const indicePath = path.join(RAIZ, 'data/gerado/modelos-indice.json');
const indice = fs.existsSync(indicePath) ? JSON.parse(fs.readFileSync(indicePath, 'utf8')) : { arquivos: {}, pecas: {} };
indice.centroCorpoMm = centroG;
indice.alturaCorpo = (maxG[2] - minG[2]) / 1000;

const fmt = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;
for (const sistema of sistemas) {
  const doSistema = pecas.filter((p) => p.sistema === sistema);
  console.log(`\n▸ ${sistema}: ${doSistema.length} peças — lendo OBJ...`);
  const completas = doSistema.map((p) => ({ fj: p.fj, p, malha: lerObj(p) }));

  for (const versao of ['completo', 'reduzido']) {
    const malhas = versao === 'completo' ? completas : completas.map((m) => ({ ...m, malha: simplificar(m.malha, m.p.fonte === 'HRA') }));
    // Tenta um arquivo só; se passar de 50 MB, divide por região.
    let grupos = [[sistema, malhas]];
    let resultado = [];
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      resultado = [];
      for (const [nome, lista] of grupos) {
        const arq = path.join(SAIDA, versao, `${nome}.glb`);
        const r = await gravarGlb(arq, lista);
        resultado.push({ nome, lista, ...r });
      }
      if (resultado.every((r) => r.bytes <= LIMITE)) break;
      // Divide por região e grava de novo.
      for (const r of resultado) fs.rmSync(path.join(SAIDA, versao, `${r.nome}.glb`), { force: true });
      const porRegiao = new Map();
      for (const m of malhas) {
        const k = `${sistema}-${m.p.regiao}`;
        if (!porRegiao.has(k)) porRegiao.set(k, []);
        porRegiao.get(k).push(m);
      }
      grupos = [...porRegiao.entries()];
      console.log(`  ${versao}: passou de 50 MB — dividindo em ${grupos.length} regiões`);
    }
    // Remove sobras de execuções anteriores deste sistema que não existem mais.
    for (const f of fs.readdirSync(path.join(SAIDA, versao))) {
      if ((f === `${sistema}.glb` || f.startsWith(`${sistema}-`)) && !resultado.some((r) => `${r.nome}.glb` === f)) fs.rmSync(path.join(SAIDA, versao, f));
    }
    indice.arquivos[`${versao}/${sistema}`] = resultado.map((r) => ({ arquivo: `modelos/${versao}/${r.nome}.glb`, bytes: r.bytes, pecas: r.lista.length, triangulos: r.triangulos }));
    for (const r of resultado) {
      r.lista.forEach((m, i) => {
        indice.pecas[m.fj] = indice.pecas[m.fj] || {};
        indice.pecas[m.fj][versao] = { arquivo: `modelos/${versao}/${r.nome}.glb`, indice: i };
      });
      console.log(`  ${versao.padEnd(9)} ${`${r.nome}.glb`.padEnd(28)} ${fmt(r.bytes).padStart(10)}  ${r.triangulos.toLocaleString('pt-BR')} triângulos`);
    }
  }
  // Centro e tamanho de cada peça já no sistema de coordenadas do app (metros).
  for (const p of doSistema) {
    const a = converter(p.min[0], p.min[1], p.min[2]);
    const b = converter(p.max[0], p.max[1], p.max[2]);
    const lo = a.map((v, i) => Math.min(v, b[i]));
    const hi = a.map((v, i) => Math.max(v, b[i]));
    indice.pecas[p.fj].centro = lo.map((v, i) => +((v + hi[i]) / 2).toFixed(4));
    indice.pecas[p.fj].tamanho = lo.map((v, i) => +(hi[i] - v).toFixed(4));
  }
  fs.writeFileSync(indicePath, JSON.stringify(indice));
}
console.log('\nÍndice gravado em data/gerado/modelos-indice.json');
