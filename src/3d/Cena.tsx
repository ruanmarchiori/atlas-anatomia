// Cena 3D: câmera, luz, controles e a ponte entre o motor e a interface.
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { registrarMotor, setHover, tocarPeca } from '../acoes';
import { ehToque } from '../catalogo';
import { assinar, lerEstado } from '../estado';
import { Motor } from './motor';

const FUNDO = '#f4f1ea';

/**
 * Faixa vertical da tela que NÃO está coberta por banner, slider, gaveta ou barra
 * inferior (em px, relativa ao canvas). O modelo é enquadrado/focado dentro dela.
 */
function areaLivre(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  let topo = r.top;
  let base = r.bottom;
  const cobreCentro = (b: DOMRect) => b.width > 0 && b.left < cx && b.right > cx;
  for (const el of document.querySelectorAll('.banner-offline')) {
    const b = el.getBoundingClientRect();
    if (cobreCentro(b)) topo = Math.max(topo, b.bottom + 8);
  }
  for (const el of document.querySelectorAll('.slider-explosao, .gaveta, .barra-inferior')) {
    const b = el.getBoundingClientRect();
    if (cobreCentro(b) && b.top > r.top + r.height * 0.25) base = Math.min(base, b.top - 8);
  }
  return { topo: topo - r.top, base: base - r.top, altura: r.height };
}

/**
 * Posição da câmera para ver `centro` (com raio vertical `meiaAltura` e horizontal
 * `meiaLargura`) inteiro e centralizado na área livre. Mantém a direção atual da câmera.
 */
function posicionar(
  cam: THREE.PerspectiveCamera, alvoAtual: THREE.Vector3, centro: THREE.Vector3,
  meiaAltura: number, meiaLargura: number, profundidade: number, livre: ReturnType<typeof areaLivre>,
) {
  const tanMeio = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const fracao = Math.max(0.25, (livre.base - livre.topo) / livre.altura);
  const distAltura = meiaAltura / (tanMeio * fracao);
  const distLargura = meiaLargura / (tanMeio * cam.aspect);
  const distancia = Math.max(distAltura, distLargura, 0.12) * 1.12 + profundidade / 2;
  // Desloca o alvo pra o objeto aparecer no meio da área livre, não no meio do canvas.
  const mundoPorPx = (2 * distancia * tanMeio) / livre.altura;
  const deslocPx = livre.altura / 2 - (livre.topo + livre.base) / 2; // >0: área livre está acima do centro
  const cima = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const alvo = centro.clone().addScaledVector(cima, -deslocPx * mundoPorPx);
  const dir = cam.position.clone().sub(alvoAtual).normalize();
  return { alvo, pos: alvo.clone().add(dir.multiplyScalar(distancia)) };
}

function Conteudo() {
  const { gl, camera, size, controls } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const motor = useMemo(() => new Motor(gl, cam), [gl, cam]);
  const explosaoMostrada = useRef(0);
  const voo = useRef<{ alvo: THREE.Vector3; pos: THREE.Vector3 } | null>(null);
  const autoEnquadrar = useRef(true);
  // true depois que o usuário gira/aproxima: aí a câmera não se ajeita mais sozinha.
  const cameraManual = useRef(false);
  const ultimoFoco = useRef(0);
  const refocar = useRef<import('../catalogo').Peca | null>(null);
  const ultimoCentro = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    registrarMotor(motor);
    // Só desregistra: o React (StrictMode) monta/desmonta duas vezes em desenvolvimento,
    // e liberar aqui apagaria os sistemas que estão carregando.
    return () => registrarMotor(null);
  }, [motor]);

  // Grade de explosão acompanha o formato da tela.
  useEffect(() => { motor.setAspecto(size.width / Math.max(1, size.height)); }, [motor, size.width, size.height]);

  // Usuário mexeu na câmera: para de enquadrar automaticamente.
  useEffect(() => {
    const c = controls as unknown as OrbitControlsImpl | null;
    if (!c) return;
    const antes = new THREE.Vector3();
    const parar = () => { autoEnquadrar.current = false; voo.current = null; antes.copy(cam.position); };
    // Um toque pra selecionar também dispara 'start'; só conta como manual se a câmera se mexeu.
    const fim = () => { if (cam.position.distanceTo(antes) > 1e-3) cameraManual.current = true; };
    c.addEventListener('start', parar);
    c.addEventListener('end', fim);
    return () => { c.removeEventListener('start', parar); c.removeEventListener('end', fim); };
  }, [controls, cam]);

  // Slider mexeu → volta a enquadrar enquanto a explosão anima.
  // Gaveta abriu/fechou → a área livre mudou: reenquadra (ou refoca a peça), mas só se a
  // câmera ainda está na posição automática.
  useEffect(() => {
    let anterior = lerEstado().explosao;
    let gaveta = lerEstado().gaveta;
    return assinar(() => {
      const e = lerEstado();
      if (e.explosao !== anterior) { anterior = e.explosao; autoEnquadrar.current = true; voo.current = null; cameraManual.current = false; }
      if (e.gaveta !== gaveta) {
        gaveta = e.gaveta;
        if (cameraManual.current) return;
        // espera a gaveta aparecer/sumir no DOM antes de medir a área livre
        window.setTimeout(() => {
          const alvo = lerEstado().quiz.alvo || lerEstado().selecionada;
          if (alvo && lerEstado().pedidoFoco) refocar.current = alvo;
          else { autoEnquadrar.current = true; voo.current = null; }
        }, 60);
      }
    });
  }, []);

  /* ----- Ponteiro: hover (mouse) e toque/clique ----- */
  useEffect(() => {
    const el = gl.domElement;
    let inicio: { x: number; y: number; t: number } | null = null;
    let ultimoHover = 0;
    let ponteiroAtivo = false;
    const pos = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const baixo = (ev: PointerEvent) => { inicio = { ...pos(ev), t: performance.now() }; ponteiroAtivo = true; };
    const cima = (ev: PointerEvent) => {
      ponteiroAtivo = false;
      if (!inicio) return;
      const p = pos(ev);
      const moveu = Math.hypot(p.x - inicio.x, p.y - inicio.y);
      const tempo = performance.now() - inicio.t;
      inicio = null;
      if (moveu > 7 || tempo > 500) return; // foi arrasto, não toque
      const alvo = motor.pick(p.x, p.y);
      tocarPeca(alvo?.peca || null, ev.pointerType !== 'mouse');
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || ponteiroAtivo) return;
      const agora = performance.now();
      if (agora - ultimoHover < 45) return; // ~20 picks/s bastam
      ultimoHover = agora;
      const p = pos(ev);
      setHover(motor.pick(p.x, p.y)?.peca || null);
      el.style.cursor = lerEstado().hover ? 'pointer' : 'grab';
    };
    const sair = () => setHover(null);
    el.addEventListener('pointerdown', baixo);
    el.addEventListener('pointerup', cima);
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerleave', sair);
    return () => {
      el.removeEventListener('pointerdown', baixo);
      el.removeEventListener('pointerup', cima);
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerleave', sair);
    };
  }, [gl, motor]);

  /* ----- A cada quadro ----- */
  useFrame((_, dt) => {
    const e = lerEstado();
    const c = controls as unknown as OrbitControlsImpl | null;

    // Explosão: anima suavemente até o valor do slider.
    const alvo = e.explosao;
    const atual = explosaoMostrada.current;
    if (Math.abs(alvo - atual) > 1e-4) {
      explosaoMostrada.current = Math.abs(alvo - atual) < 0.002 ? alvo : atual + (alvo - atual) * (1 - Math.exp(-dt * 7));
      motor.setExplosao(explosaoMostrada.current);
    }

    if (!c) return;

    // Pedido de foco (busca/quiz): voa até a peça. (refocar: mesma peça, área livre mudou)
    const pedidoNovo = e.pedidoFoco && e.pedidoFoco.n !== ultimoFoco.current;
    if (pedidoNovo || refocar.current) {
      if (pedidoNovo) { ultimoFoco.current = e.pedidoFoco!.n; cameraManual.current = false; }
      const peca = pedidoNovo ? e.pedidoFoco!.peca : refocar.current!;
      refocar.current = null;
      const centro = motor.posicaoAtual(peca, new THREE.Vector3());
      // Mostra a peça com folga em volta (2,5× o tamanho), mínimo de ~12 cm de campo.
      const raio = Math.max(0.06, (Math.max(...peca.tamanho) * motor.escalaAtual(peca)) * 1.25);
      voo.current = posicionar(cam, c.target, centro, raio, raio, 0, areaLivre(gl.domElement));
      autoEnquadrar.current = false;
    }
    // Recentralizar = enquadrar tudo o que está visível.
    if (e.pedidoCentralizar !== ultimoCentro.current) {
      ultimoCentro.current = e.pedidoCentralizar;
      autoEnquadrar.current = true;
      cameraManual.current = false;
    }
    // Enquanto enquadra automaticamente, o destino é recalculado a cada quadro (as peças
    // se movem durante a explosão).
    if (autoEnquadrar.current) {
      const caixa = motor.limitesVisiveis();
      if (!caixa.isEmpty()) {
        const centro = caixa.getCenter(new THREE.Vector3());
        const tam = caixa.getSize(new THREE.Vector3());
        voo.current = posicionar(cam, c.target, centro, tam.y / 2, tam.x / 2, tam.z, areaLivre(gl.domElement));
      }
    }
    if (voo.current) {
      const k = 1 - Math.exp(-dt * 5);
      c.target.lerp(voo.current.alvo, k);
      cam.position.lerp(voo.current.pos, k);
      c.update();
      const chegou = cam.position.distanceTo(voo.current.pos) < 0.002 && c.target.distanceTo(voo.current.alvo) < 0.002;
      const explosaoParada = Math.abs(alvo - explosaoMostrada.current) < 1e-3;
      if (chegou && (!autoEnquadrar.current || explosaoParada)) {
        voo.current = null;
        autoEnquadrar.current = false;
      }
    }

    // Rótulo com o nome: acompanha a peça (hover no computador, seleção no toque).
    const rotulo = document.getElementById('rotulo-peca');
    const peca = e.quiz.ativo ? null : e.hover || e.selecionada;
    if (rotulo) {
      if (peca) {
        motor.posicaoAtual(peca, tmp).project(cam);
        const x = (tmp.x * 0.5 + 0.5) * size.width;
        const y = (-tmp.y * 0.5 + 0.5) * size.height;
        const dentro = tmp.z < 1 && x > -50 && x < size.width + 50 && y > -50 && y < size.height + 50;
        rotulo.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        rotulo.style.opacity = dentro ? '1' : '0';
      } else rotulo.style.opacity = '0';
    }
  });

  return <primitive object={motor.cena} />;
}

export default function Cena() {
  const toque = useMemo(() => ehToque(), []);
  return (
    <Canvas
      className="canvas-3d"
      // Nunca acima de 2: em telas 3x o custo triplica e a diferença quase não se vê.
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 38, near: 0.01, far: 60, position: [0, 0.15, 2.6] }}
      onCreated={({ gl }) => gl.setClearColor(FUNDO)}
    >
      <color attach="background" args={[FUNDO]} />
      <hemisphereLight args={['#ffffff', '#c9bfae', 1.35]} />
      <directionalLight position={[1.5, 2.5, 3]} intensity={1.5} />
      <directionalLight position={[-2, 1, -2.5]} intensity={0.55} />
      <Conteudo />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={toque ? 0.9 : 0.7}
        zoomSpeed={0.9}
        minDistance={0.05}
        maxDistance={15}
        // Um dedo gira; dois dedos: pinça (zoom) + arrastar (mover a câmera).
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />
    </Canvas>
  );
}
