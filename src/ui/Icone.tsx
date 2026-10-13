// Ícones em SVG embutido (funcionam offline, sem fonte de ícones externa).
const CAMINHOS: Record<string, string> = {
  camadas: 'M12 3 2 8l10 5 10-5-10-5Zm-8.5 9.2L12 16.5l8.5-4.3M3.5 16.2 12 20.5l8.5-4.3',
  lupa: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm4.8 11.3L20 20',
  quiz: 'M9.2 9a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1v.4M12 17.5h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z',
  progresso: 'M4 20V10m5.3 10V4m5.4 16v-7m5.3 7v-11',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  centro: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  esquerda: 'm15 5-7 7 7 7',
  direita: 'm9 5 7 7-7 7',
  fechar: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7',
  info: 'M12 11v6m0-9.5h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z',
  baixar: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  subir: 'M12 20V9m0 0-4.5 4.5M12 9l4.5 4.5M5 4h14',
  olho: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  olhoFechado: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.3-1',
  explodir: 'M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8',
};

export default function Icone({ nome, tamanho = 22 }: { nome: string; tamanho?: number }) {
  return (
    <svg className="icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome] || ''} />
    </svg>
  );
}
