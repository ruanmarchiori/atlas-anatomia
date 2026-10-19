// Estado central do app: uma "loja" mínima (sem bibliotecas), lida pelo React via
// useSyncExternalStore e também pelo motor 3D.
import { useSyncExternalStore } from 'react';
import type { Catalogo, Peca, Sexo, Versao } from './catalogo';
import type { DadosEstudo } from './estudo/armazenamento';
import { vazio } from './estudo/armazenamento';

export type StatusSistema = 'nao' | 'carregando' | 'pronto' | 'erro';
export type Gaveta = null | 'sistemas' | 'busca' | 'quiz' | 'progresso' | 'detalhes' | 'mais';

export interface QuizEstado {
  ativo: boolean;
  sistema: string | null; // filtro (null = todos os ligados)
  modo: 'opcoes' | 'digitar';
  alvo: Peca | null;
  opcoes: Peca[];
  resposta: { certa: boolean; escolhida: string } | null;
  sessao: { acertos: number; erros: number };
}

export interface Estado {
  catalogo: Catalogo | null;
  erroCatalogo: string | null;
  versao: Versao;
  sexo: Sexo; // corpo masculino ou feminino
  sistemas: Record<string, { visivel: boolean; status: StatusSistema; progresso: number; erro?: string }>;
  explosao: number; // alvo do slider, 0..1
  hover: Peca | null;
  selecionada: Peca | null;
  detalhesAberto: boolean;
  gaveta: Gaveta; // celular: gaveta (bottom sheet) aberta
  painelEsquerdo: boolean; // computador/tablet deitado
  painelDireito: boolean;
  quiz: QuizEstado;
  dados: DadosEstudo;
  aviso: string | null;
  pedidoFoco: { peca: Peca; n: number } | null; // pede ao 3D pra focar a câmera
  pedidoCentralizar: number;
}

const estadoInicial: Estado = {
  catalogo: null,
  erroCatalogo: null,
  versao: 'reduzido',
  sexo: lerSexoSalvo(),
  sistemas: {},
  explosao: 0,
  hover: null,
  selecionada: null,
  detalhesAberto: false,
  gaveta: null,
  painelEsquerdo: true,
  painelDireito: true,
  quiz: { ativo: false, sistema: null, modo: 'opcoes', alvo: null, opcoes: [], resposta: null, sessao: { acertos: 0, erros: 0 } },
  dados: vazio(),
  aviso: null,
  pedidoFoco: null,
  pedidoCentralizar: 0,
};

function lerSexoSalvo(): Sexo {
  try { return localStorage.getItem('atlas-sexo') === 'f' ? 'f' : 'm'; } catch { return 'm'; }
}

let estado = estadoInicial;
const ouvintes = new Set<() => void>();

export const lerEstado = () => estado;
export function mudar(parcial: Partial<Estado> | ((e: Estado) => Partial<Estado>)) {
  const p = typeof parcial === 'function' ? parcial(estado) : parcial;
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
}
export function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Hook: lê uma fatia do estado e re-renderiza só quando ela muda. */
export function useEstado<T>(seletor: (e: Estado) => T): T {
  return useSyncExternalStore(assinar, () => seletor(estado), () => seletor(estado));
}

export function avisar(texto: string) {
  mudar({ aviso: texto });
  window.setTimeout(() => { if (lerEstado().aviso === texto) mudar({ aviso: null }); }, 3500);
}

/** Busca uma peça pelo código do arquivo (FJ). */
export function pecaPorFj(fj: string): { peca: Peca; sistema: string } | null {
  for (const s of estado.catalogo?.sistemas || []) {
    const peca = s.pecas.find((p) => p.fj === fj);
    if (peca) return { peca, sistema: s.id };
  }
  return null;
}

/** Sistema da peça, pelo código (FJ) — não depende de ser o mesmo objeto do catálogo. */
export function sistemaDaPeca(peca: Peca): string {
  for (const s of estado.catalogo?.sistemas || []) if (s.pecas.some((p) => p.fj === peca.fj)) return s.id;
  return '';
}
