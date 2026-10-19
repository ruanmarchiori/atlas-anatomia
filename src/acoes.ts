// Ações do app: ligam a interface ao estado e ao motor 3D.
import type { Motor } from './3d/motor';
import type { Peca, Sexo } from './catalogo';
import { doCorpo, normalizar, poucaMemoria } from './catalogo';
import { avisar, lerEstado, mudar, sistemaDaPeca } from './estado';
import { salvarDados } from './estudo/armazenamento';

let motor: Motor | null = null;
const esperandoMotor: (() => void)[] = [];
export function registrarMotor(m: Motor | null) {
  motor = m;
  m?.setSexo(lerEstado().sexo);
  if (m) esperandoMotor.splice(0).forEach((f) => f());
}
const comMotor = () => new Promise<Motor>((ok) => (motor ? ok(motor) : esperandoMotor.push(() => ok(motor!))));
export const motorAtual = () => motor;

/* ---------- Corpo masculino / feminino ---------- */
export function escolherSexo(sexo: Sexo) {
  const { selecionada, hover, quiz } = lerEstado();
  try { localStorage.setItem('atlas-sexo', sexo); } catch { /* sem armazenamento: vale só nesta sessão */ }
  // A peça selecionada pode não existir no outro corpo.
  const manter = selecionada && doCorpo(selecionada, sexo) ? selecionada : null;
  mudar((e) => ({
    sexo,
    selecionada: manter,
    hover: hover && doCorpo(hover, sexo) ? hover : null,
    detalhesAberto: manter ? e.detalhesAberto : false,
    gaveta: !manter && e.gaveta === 'detalhes' ? null : e.gaveta,
  }));
  motor?.setSexo(sexo);
  sincronizarEstados();
  if (quiz.ativo && quiz.alvo && !doCorpo(quiz.alvo, sexo)) void proximaPergunta();
}

/* ---------- Sistemas ---------- */
const carregando = new Map<string, Promise<void>>();

/** Garante que o sistema está carregado (baixa sob demanda) e visível. */
export async function ligarSistema(id: string): Promise<void> {
  const { catalogo, versao } = lerEstado();
  const sistema = catalogo?.sistemas.find((s) => s.id === id);
  if (!sistema) return;
  mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { ...e.sistemas[id], visivel: true } } }));
  const m = await comMotor();
  if (m.carregado(id)) { m.setVisivel(id, true); return; }
  if (!carregando.has(id)) {
    mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { visivel: true, status: 'carregando', progresso: 0 } } }));
    const tarefa = m.carregarSistema(sistema, versao, (progresso) => {
      mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { ...e.sistemas[id], progresso } } }));
    }).then(() => {
      const visivel = lerEstado().sistemas[id]?.visivel ?? true;
      m.setVisivel(id, visivel);
      mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { visivel, status: 'pronto', progresso: 1 } } }));
      sincronizarEstados();
    }).catch((err: Error) => {
      mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { visivel: false, status: 'erro', progresso: 0, erro: err.message } } }));
      avisar(`Não foi possível carregar: ${sistema.nome}. Verifique a conexão.`);
    }).finally(() => carregando.delete(id));
    carregando.set(id, tarefa);
  }
  return carregando.get(id);
}

/** Libera da memória sistemas desligados há algum tempo em aparelhos com pouca memória. */
const temporizadores = new Map<string, number>();
export function desligarSistema(id: string) {
  mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { ...e.sistemas[id], visivel: false } } }));
  motor?.setVisivel(id, false);
  const { selecionada } = lerEstado();
  if (selecionada && sistemaDaPeca(selecionada) === id) selecionar(null);
  if (poucaMemoria()) {
    window.clearTimeout(temporizadores.get(id));
    temporizadores.set(id, window.setTimeout(() => {
      if (!lerEstado().sistemas[id]?.visivel && motor?.carregado(id)) {
        motor.descarregar(id);
        mudar((e) => ({ sistemas: { ...e.sistemas, [id]: { visivel: false, status: 'nao', progresso: 0 } } }));
      }
    }, 20000));
  }
}

export function alternarSistema(id: string) {
  if (lerEstado().sistemas[id]?.visivel) desligarSistema(id);
  else void ligarSistema(id);
}

/* ---------- Seleção ---------- */
export function sincronizarEstados() {
  const { hover, selecionada, quiz } = lerEstado();
  const mapa = new Map<string, number>();
  if (quiz.ativo && quiz.alvo) {
    mapa.set(quiz.alvo.fj, 2);
    motor?.setEstados(mapa, true);
    return;
  }
  if (hover) mapa.set(hover.fj, 1);
  if (selecionada) mapa.set(selecionada.fj, 2);
  motor?.setEstados(mapa, false);
}

export function setHover(peca: Peca | null) {
  if (lerEstado().hover === peca) return;
  mudar({ hover: peca });
  sincronizarEstados();
}

export function selecionar(peca: Peca | null, abrirDetalhes = false) {
  mudar((e) => ({
    selecionada: peca,
    detalhesAberto: peca ? abrirDetalhes || e.detalhesAberto && e.selecionada === peca : false,
    gaveta: peca && abrirDetalhes ? 'detalhes' : e.gaveta === 'detalhes' && !peca ? null : e.gaveta,
    painelDireito: abrirDetalhes ? true : e.painelDireito,
  }));
  sincronizarEstados();
}

export function abrirDetalhes() {
  if (!lerEstado().selecionada) return;
  mudar({ detalhesAberto: true, gaveta: 'detalhes', painelDireito: true });
}

/** Clique/toque numa peça. No toque: 1º toque seleciona; 2º na mesma abre os detalhes. */
export function tocarPeca(peca: Peca | null, toque: boolean) {
  const { selecionada, quiz } = lerEstado();
  if (quiz.ativo) return; // no quiz, a peça destacada é fixa
  if (!peca) { selecionar(null); return; }
  if (!toque) { selecionar(peca, true); return; }
  if (selecionada === peca) abrirDetalhes();
  else selecionar(peca, false);
}

/** Leva a câmera até a peça (busca, quiz). Liga e carrega o sistema se preciso. */
export async function focarPeca(peca: Peca, abrir = true) {
  // Peça que só existe no outro corpo (ex.: buscar "útero" com o corpo masculino): troca o corpo.
  if (peca.sexo && peca.sexo !== lerEstado().sexo) {
    escolherSexo(peca.sexo);
    avisar(peca.sexo === 'f' ? 'Mostrando o corpo feminino.' : 'Mostrando o corpo masculino.');
  }
  const sis = sistemaDaPeca(peca);
  await ligarSistema(sis);
  selecionar(peca, abrir);
  mudar((e) => ({ pedidoFoco: { peca, n: (e.pedidoFoco?.n || 0) + 1 } }));
}

export function centralizar() {
  mudar((e) => ({ pedidoCentralizar: e.pedidoCentralizar + 1 }));
}

/* ---------- Busca ---------- */
export function buscar(texto: string, limite = 40): { peca: Peca; sistema: string }[] {
  const q = normalizar(texto);
  if (q.length < 2) return [];
  const termos = q.split(' ');
  const res: { peca: Peca; sistema: string; nota: number }[] = [];
  for (const s of lerEstado().catalogo?.sistemas || []) {
    for (const peca of s.pecas) {
      const pt = normalizar(peca.pt);
      const en = normalizar(peca.en);
      if (!termos.every((t) => pt.includes(t) || en.includes(t))) continue;
      const nota = (pt.startsWith(q) ? 0 : pt.includes(q) ? 1 : en.startsWith(q) ? 2 : 3) * 1000 + pt.length;
      res.push({ peca, sistema: s.id, nota });
    }
  }
  return res.sort((a, b) => a.nota - b.nota).slice(0, limite);
}

/* ---------- Estudo: anotações e "estudada" ---------- */
let salvarDepois = 0;
function persistir() {
  window.clearTimeout(salvarDepois);
  salvarDepois = window.setTimeout(() => void salvarDados(lerEstado().dados), 400);
}

export function setAnotacao(peca: Peca, texto: string) {
  mudar((e) => {
    const anotacoes = { ...e.dados.anotacoes };
    if (texto.trim()) anotacoes[peca.fj] = texto; else delete anotacoes[peca.fj];
    return { dados: { ...e.dados, anotacoes } };
  });
  persistir();
}

export function alternarEstudada(peca: Peca) {
  mudar((e) => {
    const estudadas = { ...e.dados.estudadas };
    if (estudadas[peca.fj]) delete estudadas[peca.fj]; else estudadas[peca.fj] = Date.now();
    return { dados: { ...e.dados, estudadas } };
  });
  persistir();
}

export function substituirDados(dados: ReturnType<typeof lerEstado>['dados']) {
  mudar({ dados });
  void salvarDados(dados);
}

/* ---------- Quiz ---------- */
const sortear = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

export async function iniciarQuiz(sistema: string | null, modo: 'opcoes' | 'digitar') {
  if (sistema) await ligarSistema(sistema);
  mudar((e) => ({ quiz: { ...e.quiz, ativo: true, sistema, modo, sessao: { acertos: 0, erros: 0 } } }));
  await proximaPergunta();
}

export async function proximaPergunta() {
  const { catalogo, sistemas, quiz, sexo } = lerEstado();
  if (!catalogo) return;
  const ids = quiz.sistema ? [quiz.sistema] : catalogo.sistemas.filter((s) => sistemas[s.id]?.visivel && sistemas[s.id]?.status === 'pronto').map((s) => s.id);
  if (!ids.length) { avisar('Ligue ao menos um sistema para o quiz.'); pararQuiz(); return; }
  // Nomes repetidos (ex.: dois "Corpo mamilar") confundem as opções: usa nomes únicos.
  const candidatas = catalogo.sistemas.filter((s) => ids.includes(s.id)).flatMap((s) => s.pecas).filter((p) => doCorpo(p, sexo));
  if (!candidatas.length) { avisar('Este sistema não tem peças no corpo escolhido.'); pararQuiz(); return; }
  const alvo = sortear(candidatas);
  const outras = new Map<string, Peca>();
  const mesmoSistema = catalogo.sistemas.find((s) => s.pecas.some((p) => p.fj === alvo.fj))!.pecas.filter((p) => doCorpo(p, sexo));
  let tentativas = 0;
  while (outras.size < 3 && tentativas++ < 200) {
    const p = sortear(mesmoSistema);
    if (p.pt !== alvo.pt && !outras.has(p.pt)) outras.set(p.pt, p);
  }
  const opcoes = [alvo, ...outras.values()].sort(() => Math.random() - 0.5);
  mudar((e) => ({ quiz: { ...e.quiz, alvo, opcoes, resposta: null }, selecionada: null, hover: null }));
  sincronizarEstados();
  mudar((e) => ({ pedidoFoco: { peca: alvo, n: (e.pedidoFoco?.n || 0) + 1 } }));
}

export function responderQuiz(resposta: string) {
  const { quiz } = lerEstado();
  if (!quiz.alvo || quiz.resposta) return;
  const alvo = quiz.alvo;
  const certa = normalizar(resposta) === normalizar(alvo.pt)
    // Digitando: aceita sem o lado ("costela" para "5ª costela direita" não; mas aceita sem acento/caixa).
    || (quiz.modo === 'digitar' && normalizar(resposta) === normalizar(alvo.pt.replace(/\s+(direit|esquerd)[oa]s?\b/i, '')));
  mudar((e) => {
    const pp = { ...e.dados.quiz.porPeca };
    const atual = pp[alvo.fj] || { a: 0, e: 0 };
    pp[alvo.fj] = certa ? { ...atual, a: atual.a + 1 } : { ...atual, e: atual.e + 1 };
    return {
      quiz: { ...e.quiz, resposta: { certa, escolhida: resposta }, sessao: { acertos: e.quiz.sessao.acertos + (certa ? 1 : 0), erros: e.quiz.sessao.erros + (certa ? 0 : 1) } },
      dados: { ...e.dados, quiz: { acertos: e.dados.quiz.acertos + (certa ? 1 : 0), erros: e.dados.quiz.erros + (certa ? 0 : 1), porPeca: pp } },
    };
  });
  persistir();
}

export function pararQuiz() {
  mudar((e) => ({ quiz: { ...e.quiz, ativo: false, alvo: null, opcoes: [], resposta: null } }));
  sincronizarEstados();
}
