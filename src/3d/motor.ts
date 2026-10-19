// Núcleo 3D do atlas (Three.js puro; o React Three Fiber só fornece renderer/câmera/cena).
//
// - Cada arquivo GLB é UMA malha com todas as peças de um sistema (1 draw call). O
//   atributo _piece de cada vértice diz a qual peça ele pertence.
// - Uma textura pequena guarda, por peça: deslocamento (xyz) + escala, e centro (xyz) +
//   estado (normal, hover, selecionada, oculta, esmaecida). O shader lê essa textura,
//   então explodir/organizar 2 mil peças é só atualizar alguns kB por quadro.
// - Seleção por GPU picking: um passe que desenha o "número" de cada peça num pixel. Funciona
//   com o corpo explodido, ao contrário do raycast da Three.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Peca, Sexo, Sistema, Versao } from '../catalogo';
import { COR_SISTEMA, doCorpo } from '../catalogo';

export const ESTADO = { normal: 0, hover: 1, selecionada: 2, oculta: 3, esmaecida: 4 } as const;

interface Parte {
  id: number; // índice global (cabe em 8 bits no picking)
  sistema: string;
  pecas: Peca[]; // na ordem do atributo _piece
  malha: THREE.Mesh;
  malhaPick: THREE.Mesh;
  dados: Float32Array; // 8 floats por peça
  textura: THREE.DataTexture;
}

export interface Alvo { sistema: string; peca: Peca }

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/* ---------- Shaders ---------- */
const VERTEX_PECAS = /* glsl */ `
  int ip = int(_piece + 0.5);
  vec4 d0 = texelFetch(uPecas, ivec2(ip * 2, 0), 0);
  vec4 d1 = texelFetch(uPecas, ivec2(ip * 2 + 1, 0), 0);
  vec4 mundo = modelMatrix * vec4(transformed, 1.0);
  // escala em torno do centro da peça + deslocamento (explosão / grade)
  vec3 pm = d1.xyz + (mundo.xyz - d1.xyz) * d0.w + d0.xyz;
  vec4 mvPosition = viewMatrix * vec4(pm, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // peça oculta: triângulo degenerado, nem chega ao fragment shader
  if (d1.w > 2.5 && d1.w < 3.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
`;

function criarMaterial(cor: string, textura: THREE.DataTexture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.62, metalness: 0.0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPecas = { value: textura };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _piece;\nuniform highp sampler2D uPecas;\nvarying float vEstado;\nvarying float vTom;')
      .replace('#include <project_vertex>', `${VERTEX_PECAS}\n  vEstado = d1.w;\n  vTom = fract(sin(float(ip) * 12.9898) * 43758.5453);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEstado;\nvarying float vTom;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // leve variação de tom entre peças vizinhas, pra distinguir onde uma termina
        diffuseColor.rgb *= 0.86 + 0.28 * vTom;
        if (vEstado > 0.5 && vEstado < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.18), 0.55);
        else if (vEstado > 1.5 && vEstado < 2.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.62, 0.86), 0.62);
        else if (vEstado > 3.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.93, 0.9), 0.78);`);
  };
  return m;
}

function criarMaterialPick(textura: THREE.DataTexture, idParte: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPecas: { value: textura }, uParte: { value: idParte } },
    vertexShader: /* glsl */ `
      attribute float _piece;
      uniform highp sampler2D uPecas;
      flat varying int vPeca;
      void main() {
        vec3 transformed = position;
        ${VERTEX_PECAS}
        vPeca = ip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uParte;
      flat varying int vPeca;
      void main() {
        // R = parte + 1 (0 = fundo), G/B = índice da peça (16 bits)
        gl_FragColor = vec4((uParte + 1.0) / 255.0, float(vPeca / 256) / 255.0, float(vPeca - (vPeca / 256) * 256) / 255.0, 1.0);
      }`,
  });
}

/* ---------- Motor ---------- */
export class Motor {
  readonly cena = new THREE.Group();
  private cenaPick = new THREE.Scene();
  private partes: Parte[] = [];
  private indice = new Map<string, { parte: Parte; i: number }>(); // fj → onde a peça está
  private proximoId = 0;
  private alvoPick = new THREE.WebGLRenderTarget(1, 1);
  private pixel = new Uint8Array(4);
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;

  // Estado de exibição
  private visiveis = new Set<string>();
  private estados = new Map<string, number>(); // fj → estado especial (hover/selecionada/esmaecida)
  private esmaecerOutras = false;
  private sexo: Sexo = 'm'; // peças do outro corpo ficam ocultas
  private explosao = 0; // 0..1 aplicada
  private aspecto = 1;
  private layout = new Map<string, { radial: THREE.Vector3; grade: THREE.Vector3; escala: number }>();
  private layoutSujo = true;
  private limitesGrade = new THREE.Box3();

  constructor(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.camera = camera;
  }

  /* ----- Carregamento ----- */
  async carregarSistema(sistema: Sistema, versao: Versao, aoProgredir: (fracao: number) => void): Promise<void> {
    const arquivos = sistema.arquivos[versao];
    const total = arquivos.reduce((s, a) => s + a.bytes, 0);
    const carregados = new Array(arquivos.length).fill(0);
    await Promise.all(arquivos.map(async (a, iArq) => {
      const gltf = await loader.loadAsync(`./${a.arquivo}`, (ev) => {
        carregados[iArq] = ev.loaded;
        aoProgredir(Math.min(0.99, carregados.reduce((s, b) => s + b, 0) / total));
      });
      let original: THREE.Mesh | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !original) original = o as THREE.Mesh; });
      if (!original) throw new Error(`Sem malha em ${a.arquivo}`);
      const mesh = original as THREE.Mesh;
      const geometria = mesh.geometry as THREE.BufferGeometry;
      // Ordem das peças no GLB = ordem no catálogo para este arquivo.
      const pecas = sistema.pecas.filter((p) => p[versao][0] === iArq).sort((x, y) => x[versao][1] - y[versao][1]);
      this.adicionarParte(sistema.id, pecas, geometria, mesh.matrixWorld);
    }));
    this.visiveis.add(sistema.id);
    this.layoutSujo = true;
    aoProgredir(1);
  }

  private adicionarParte(sistemaId: string, pecas: Peca[], geometria: THREE.BufferGeometry, matriz: THREE.Matrix4) {
    const id = this.proximoId++;
    const n = pecas.length;
    const dados = new Float32Array(n * 8);
    const textura = new THREE.DataTexture(dados, n * 2, 1, THREE.RGBAFormat, THREE.FloatType);
    // Sem interpolação: texturas float com filtro linear não funcionam em vários celulares.
    textura.minFilter = THREE.NearestFilter;
    textura.magFilter = THREE.NearestFilter;
    textura.generateMipmaps = false;
    textura.needsUpdate = true;
    pecas.forEach((p, i) => {
      dados[i * 8 + 3] = 1; // escala
      dados[i * 8 + 4] = p.centro[0];
      dados[i * 8 + 5] = p.centro[1];
      dados[i * 8 + 6] = p.centro[2];
    });
    // Memória: depois que a geometria vai para a GPU, a cópia em JavaScript não é mais
    // usada (a seleção é por GPU picking) — descartá-la economiza ~60% da memória, o que
    // importa no iPhone (o Safari fecha a página que passa do limite). A esfera envolvente
    // é calculada antes, porque o renderizador ainda a consulta depois.
    geometria.computeBoundingSphere();
    const descartar = function (this: { array: unknown }) { this.array = null; };
    for (const a of Object.values(geometria.attributes)) {
      const alvo = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : (a as THREE.BufferAttribute);
      alvo.onUpload(descartar as () => void);
    }
    geometria.index?.onUpload(descartar as () => void);
    const malha = new THREE.Mesh(geometria, criarMaterial(COR_SISTEMA[sistemaId] || '#bbbbbb', textura));
    malha.matrixAutoUpdate = false;
    malha.matrix.copy(matriz);
    malha.frustumCulled = false; // as peças se movem para fora do volume original
    const malhaPick = new THREE.Mesh(geometria, criarMaterialPick(textura, id));
    malhaPick.matrixAutoUpdate = false;
    malhaPick.matrix.copy(matriz);
    malhaPick.frustumCulled = false;
    this.cena.add(malha);
    this.cenaPick.add(malhaPick);
    const parte = { id, sistema: sistemaId, pecas, malha, malhaPick, dados, textura };
    this.partes.push(parte);
    pecas.forEach((peca, i) => this.indice.set(peca.fj, { parte, i }));
  }

  carregado = (sistemaId: string) => this.partes.some((p) => p.sistema === sistemaId);

  /** Libera da memória (GPU e CPU) um sistema desligado. */
  descarregar(sistemaId: string) {
    for (const p of this.partes.filter((x) => x.sistema === sistemaId)) {
      this.cena.remove(p.malha);
      this.cenaPick.remove(p.malhaPick);
      p.malha.geometry.dispose();
      (p.malha.material as THREE.Material).dispose();
      (p.malhaPick.material as THREE.Material).dispose();
      p.textura.dispose();
    }
    for (const [fj, ref] of this.indice) if (ref.parte.sistema === sistemaId) this.indice.delete(fj);
    this.partes = this.partes.filter((x) => x.sistema !== sistemaId);
    this.visiveis.delete(sistemaId);
    this.layoutSujo = true;
  }

  /* ----- Visibilidade e estados ----- */
  setVisivel(sistemaId: string, visivel: boolean) {
    if (visivel) this.visiveis.add(sistemaId); else this.visiveis.delete(sistemaId);
    for (const p of this.partes) if (p.sistema === sistemaId) { p.malha.visible = visivel; p.malhaPick.visible = visivel; }
    this.layoutSujo = true;
  }

  /** Define hover/seleção/quiz. `esmaecer` apaga as demais peças (destaque forte). */
  setEstados(estados: Map<string, number>, esmaecer = false) {
    this.estados = estados;
    this.esmaecerOutras = esmaecer;
    this.atualizarTexturas();
  }

  /** Troca o corpo (masculino/feminino): oculta as peças que só existem no outro. */
  setSexo(sexo: Sexo) {
    if (sexo === this.sexo) return;
    this.sexo = sexo;
    this.layoutSujo = true;
    this.atualizarTexturas();
  }

  setExplosao(p: number) {
    if (Math.abs(p - this.explosao) < 1e-4) return;
    this.explosao = p;
    this.atualizarTexturas();
  }

  setAspecto(a: number) {
    if (Math.abs(a - this.aspecto) < 0.05) return;
    this.aspecto = a;
    this.layoutSujo = true;
    this.atualizarTexturas();
  }

  /* ----- Layout: radial (meio do caminho) e grade por sistema (100%) ----- */
  private recalcularLayout() {
    this.layout.clear();
    const visiveis = this.partes.filter((p) => this.visiveis.has(p.sistema));
    // Ordem fixa dos sistemas; dentro do sistema, por região e tamanho.
    const ordemSis = ['esqueletico', 'muscular', 'arterias', 'veias', 'nervoso', 'respiratorio', 'digestorio', 'urinario', 'linfatico', 'reprodutor', 'outros'];
    const ordemReg = ['cabeca', 'pescoco', 'torax', 'abdome', 'pelve', 'membro-superior', 'membro-inferior'];
    const grupos = ordemSis.map((s) => visiveis.filter((p) => p.sistema === s).flatMap((p) => p.pecas.filter((x) => doCorpo(x, this.sexo))))
      .filter((g) => g.length)
      .map((g) => [...g].sort((a, b) => ordemReg.indexOf(a.regiao) - ordemReg.indexOf(b.regiao) || Math.max(...b.tamanho) - Math.max(...a.tamanho)));
    const total = grupos.reduce((s, g) => s + g.length, 0);
    if (!total) return;

    // Grade: tela larga → mais colunas; celular em pé → mais linhas.
    const celula = 0.13;
    const cols = Math.max(4, Math.round(Math.sqrt(total * Math.max(0.35, Math.min(this.aspecto, 3))) ));
    let linha = 0;
    const posGrade: { peca: Peca; x: number; y: number }[] = [];
    for (const g of grupos) {
      g.forEach((peca, i) => posGrade.push({ peca, x: i % cols, y: linha + Math.floor(i / cols) }));
      linha += Math.ceil(g.length / cols) + 1; // uma linha vazia entre sistemas
    }
    const largura = (cols - 1) * celula;
    const altura = (linha - 2) * celula;
    this.limitesGrade.makeEmpty();
    for (const { peca, x, y } of posGrade) {
      const grade = new THREE.Vector3(x * celula - largura / 2, altura / 2 - y * celula, 0);
      this.limitesGrade.expandByPoint(grade);
      const maior = Math.max(...peca.tamanho, 0.004);
      const escala = THREE.MathUtils.clamp((celula * 0.78) / maior, 0.02, 8); // peças grandes (pele) encolhem até caber na célula
      // Radial: afasta do eixo vertical do corpo, mais as peças longe do centro.
      const c = new THREE.Vector3(...peca.centro);
      const dir = new THREE.Vector3(c.x, c.y * 0.35, c.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      const radial = c.clone().add(dir.multiplyScalar(0.9));
      this.layout.set(peca.fj, { radial, grade, escala });
    }
    this.limitesGrade.expandByScalar(celula * 0.6);
    this.layoutSujo = false;
  }

  /** Recalcula deslocamentos/estados e envia à GPU. */
  private atualizarTexturas() {
    if (this.layoutSujo) this.recalcularLayout();
    const p = this.explosao;
    const suave = (t: number) => t * t * (3 - 2 * t);
    // 0–50%: abre radialmente; 50–100%: vai do radial para a grade (escala junto).
    const fase1 = suave(Math.min(1, p * 2));
    const fase2 = suave(Math.max(0, p * 2 - 1));
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const parte of this.partes) {
      const d = parte.dados;
      parte.pecas.forEach((peca, i) => {
        const o = i * 8;
        const L = this.layout.get(peca.fj);
        if (L && p > 0) {
          c.set(peca.centro[0], peca.centro[1], peca.centro[2]);
          v.copy(c).lerp(L.radial, fase1).lerp(L.grade, fase2).sub(c);
          d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z;
          d[o + 3] = THREE.MathUtils.lerp(1, L.escala, fase2);
        } else {
          d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 1;
        }
        const especial = this.estados.get(peca.fj);
        d[o + 7] = !doCorpo(peca, this.sexo) ? ESTADO.oculta
          : especial ?? (this.esmaecerOutras ? ESTADO.esmaecida : ESTADO.normal);
      });
      parte.textura.needsUpdate = true;
    }
  }

  /** Posição atual (com explosão) do centro de uma peça. */
  posicaoAtual(peca: Peca, saida = new THREE.Vector3()): THREE.Vector3 {
    const ref = this.indice.get(peca.fj);
    if (!ref) return saida.set(...peca.centro);
    const d = ref.parte.dados;
    const o = ref.i * 8;
    return saida.set(peca.centro[0] + d[o], peca.centro[1] + d[o + 1], peca.centro[2] + d[o + 2]);
  }

  escalaAtual(peca: Peca): number {
    const ref = this.indice.get(peca.fj);
    return ref ? ref.parte.dados[ref.i * 8 + 3] : 1;
  }

  /** Caixa que envolve tudo o que está visível no estado atual da explosão. */
  limitesVisiveis(): THREE.Box3 {
    const caixa = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const parte of this.partes) {
      if (!this.visiveis.has(parte.sistema)) continue;
      parte.pecas.forEach((peca, i) => {
        if (!doCorpo(peca, this.sexo)) return;
        const s = parte.dados[i * 8 + 3];
        this.posicaoAtual(peca, tmp);
        const meia = new THREE.Vector3(...peca.tamanho).multiplyScalar(0.5 * s);
        caixa.expandByPoint(tmp.clone().sub(meia));
        caixa.expandByPoint(tmp.clone().add(meia));
      });
    }
    return caixa;
  }

  /* ----- Seleção (GPU picking) ----- */
  pick(xCss: number, yCss: number): Alvo | null {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.setViewOffset(w, h, Math.floor(xCss), Math.floor(yCss), 1, 1);
    const antes = this.renderer.getRenderTarget();
    const corAntes = new THREE.Color();
    this.renderer.getClearColor(corAntes);
    const alphaAntes = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.alvoPick);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.cenaPick, this.camera);
    this.renderer.readRenderTargetPixels(this.alvoPick, 0, 0, 1, 1, this.pixel);
    this.renderer.setRenderTarget(antes);
    this.renderer.setClearColor(corAntes, alphaAntes);
    this.camera.clearViewOffset();
    const [r, g, b] = this.pixel;
    if (!r) return null;
    const parte = this.partes.find((p) => p.id === r - 1);
    const peca = parte?.pecas[g * 256 + b];
    return parte && peca ? { sistema: parte.sistema, peca } : null;
  }

  liberar() {
    for (const s of new Set(this.partes.map((p) => p.sistema))) this.descarregar(s);
    this.alvoPick.dispose();
  }
}
