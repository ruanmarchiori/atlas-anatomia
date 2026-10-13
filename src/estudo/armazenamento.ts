// Dados de estudo salvos no próprio aparelho (IndexedDB), sem login e sem servidor:
// anotações, peças marcadas como estudadas e histórico do quiz.
// Exportar/importar em JSON permite levar tudo de um aparelho para outro.

export interface DadosEstudo {
  anotacoes: Record<string, string>; // fj → texto
  estudadas: Record<string, number>; // fj → data (ms) em que foi marcada
  quiz: { acertos: number; erros: number; porPeca: Record<string, { a: number; e: number }> };
}

export const vazio = (): DadosEstudo => ({ anotacoes: {}, estudadas: {}, quiz: { acertos: 0, erros: 0, porPeca: {} } });

const BANCO = 'atlas-anatomia';
const LOJA = 'estudo';
const CHAVE = 'dados';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}

export async function lerDados(): Promise<DadosEstudo> {
  try {
    const db = await abrir();
    const v = await new Promise<DadosEstudo | undefined>((ok, erro) => {
      const r = db.transaction(LOJA).objectStore(LOJA).get(CHAVE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    db.close();
    return { ...vazio(), ...(v || {}) };
  } catch {
    // Navegação privada antiga ou IndexedDB bloqueado: cai para o localStorage.
    try { return { ...vazio(), ...JSON.parse(localStorage.getItem(BANCO) || '{}') }; } catch { return vazio(); }
  }
}

let fila: Promise<void> = Promise.resolve();
/** Grava (em fila, pra duas gravações seguidas não se atropelarem). */
export function salvarDados(dados: DadosEstudo): Promise<void> {
  fila = fila.then(async () => {
    try {
      const db = await abrir();
      await new Promise<void>((ok, erro) => {
        const t = db.transaction(LOJA, 'readwrite');
        t.objectStore(LOJA).put(dados, CHAVE);
        t.oncomplete = () => ok();
        t.onerror = () => erro(t.error);
      });
      db.close();
    } catch {
      try { localStorage.setItem(BANCO, JSON.stringify(dados)); } catch { /* sem espaço */ }
    }
  });
  return fila;
}

/** Pede ao navegador pra não apagar os dados quando faltar espaço (Safari/Chrome). */
export async function pedirArmazenamentoPersistente() {
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}

/* ---------- Exportar / importar ---------- */
export function exportar(dados: DadosEstudo) {
  const conteudo = JSON.stringify({ app: 'atlas-anatomia', versao: 1, exportadoEm: new Date().toISOString(), dados }, null, 2);
  const blob = new Blob([conteudo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atlas-anatomia-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Lê um arquivo exportado e MESCLA com os dados atuais (não apaga o que já existe):
 * anotações do arquivo substituem as do mesmo item; estudadas e quiz somam.
 */
export async function importar(arquivo: File, atuais: DadosEstudo): Promise<{ dados: DadosEstudo; resumo: string }> {
  const texto = await arquivo.text();
  let json: unknown;
  try { json = JSON.parse(texto); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  const d = (json as { app?: string; dados?: DadosEstudo }).dados;
  if ((json as { app?: string }).app !== 'atlas-anatomia' || !d) throw new Error('Este arquivo não foi exportado pelo Atlas Anatomia.');
  const novo: DadosEstudo = {
    anotacoes: { ...atuais.anotacoes, ...(d.anotacoes || {}) },
    estudadas: { ...atuais.estudadas, ...(d.estudadas || {}) },
    quiz: {
      acertos: Math.max(atuais.quiz.acertos, d.quiz?.acertos || 0),
      erros: Math.max(atuais.quiz.erros, d.quiz?.erros || 0),
      porPeca: { ...atuais.quiz.porPeca, ...(d.quiz?.porPeca || {}) },
    },
  };
  const resumo = `${Object.keys(d.anotacoes || {}).length} anotações e ${Object.keys(d.estudadas || {}).length} peças estudadas importadas.`;
  return { dados: novo, resumo };
}
