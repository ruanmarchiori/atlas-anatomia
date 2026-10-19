// Catálogo das peças (gerado por scripts/04-catalogo-app.mjs) e detecção do aparelho.

export type Versao = 'completo' | 'reduzido';

/** Corpo escolhido pelo estudante: muda as peças do sistema reprodutor (e a pele). */
export type Sexo = 'm' | 'f';

export interface Peca {
  fj: string;
  fma: string;
  en: string;
  pt: string;
  regiao: string;
  revisar: boolean;
  sexo: '' | Sexo; // '' = aparece nos dois corpos
  fonte: 'BP3D' | 'HRA'; // BodyParts3D ou Human Reference Atlas (órgãos femininos)
  centro: [number, number, number];
  tamanho: [number, number, number];
  completo: [number, number]; // [arquivo do sistema, índice da peça no GLB]
  reduzido: [number, number];
}

export interface ArquivoModelo {
  arquivo: string;
  bytes: number;
  triangulos: number;
}

export interface Sistema {
  id: string;
  nome: string;
  arquivos: Record<Versao, ArquivoModelo[]>;
  pecas: Peca[];
}

export interface Catalogo {
  versao: string;
  credito: string;
  alturaCorpo: number;
  regioes: Record<string, string>;
  sistemas: Sistema[];
}

/** Cor base de cada sistema (fundo claro: tons médios, sem saturar). */
export const COR_SISTEMA: Record<string, string> = {
  esqueletico: '#e8e0cc',
  muscular: '#c4675a',
  arterias: '#c8343a',
  veias: '#3c64b4',
  nervoso: '#e3c049',
  respiratorio: '#d99aa8',
  digestorio: '#c98a52',
  urinario: '#b08a3c',
  linfatico: '#6aa36f',
  reprodutor: '#c77dab',
  outros: '#b9a7a0',
};

export async function carregarCatalogo(): Promise<Catalogo> {
  const r = await fetch('./dados/catalogo.json');
  if (!r.ok) throw new Error(`Não foi possível carregar o catálogo (${r.status})`);
  return r.json();
}

/** A peça existe no corpo escolhido? */
export const doCorpo = (p: Peca, sexo: Sexo) => !p.sexo || p.sexo === sexo;

/** Nome sem acento e em minúsculas, pra busca e quiz. */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ºª ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- Aparelho ---------- */
export const ehApp = () => typeof (window as unknown as { Capacitor?: unknown }).Capacitor !== 'undefined';

/** Toque como entrada principal (celular, tablet). */
export const ehToque = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * Versão dos modelos: a completa só no computador. Celular, tablet e o app Android
 * usam a reduzida (menos memória, abre mais rápido). Dá pra forçar com ?versao=.
 */
export function versaoDoAparelho(): Versao {
  const forcada = new URLSearchParams(location.search).get('versao');
  if (forcada === 'completo' || forcada === 'reduzido') return forcada;
  if (ehApp() || ehToque()) return 'reduzido';
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem <= 4) return 'reduzido';
  return 'completo';
}

/** Pouca memória: iPhone/iPad (limite do Safari) ou aparelho com ≤ 4 GB. */
export function poucaMemoria(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return ios || (mem !== undefined && mem <= 4);
}
