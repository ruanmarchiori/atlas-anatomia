// "Baixar para usar offline" (PWA): baixa TODOS os modelos da versão deste aparelho
// para o cache do navegador, com barra de progresso. O service worker usa o mesmo
// cache (CACHE_MODELOS), então depois disso o atlas abre sem internet.
import { useEffect, useState } from 'react';
import type { Catalogo, Versao } from '../catalogo';
import { useEstado } from '../estado';
import Icone from './Icone';

export const CACHE_MODELOS = 'atlas-modelos-v1';
const CHAVE_BANNER = 'atlas-banner-offline-dispensado';

const arquivosDe = (catalogo: Catalogo, versao: Versao) => catalogo.sistemas.flatMap((s) => s.arquivos[versao]);
const urlDe = (arquivo: string) => new URL(arquivo, location.href).href;
const mb = (b: number) => `${(b / 1048576).toFixed(0)} MB`;

async function quantosNoCache(catalogo: Catalogo, versao: Versao) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(CACHE_MODELOS);
  let n = 0;
  for (const a of arquivosDe(catalogo, versao)) if (await cache.match(urlDe(a.arquivo))) n++;
  return n;
}

async function baixarTudo(catalogo: Catalogo, versao: Versao, aoProgredir: (f: number) => void) {
  const cache = await caches.open(CACHE_MODELOS);
  const lista = arquivosDe(catalogo, versao);
  const total = lista.reduce((s, a) => s + a.bytes, 0);
  let feito = 0;
  for (const a of lista) {
    const url = urlDe(a.arquivo);
    if (await cache.match(url)) { feito += a.bytes; aoProgredir(feito / total); continue; }
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok || !resp.body) throw new Error(`Falha ao baixar ${a.arquivo} (${resp.status})`);
    // Lê em pedaços pra a barra andar durante cada arquivo.
    const leitor = resp.body.getReader();
    const pedacos: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacos.push(value);
      feito += value.length;
      aoProgredir(Math.min(0.999, feito / total));
    }
    await cache.put(url, new Response(new Blob(pedacos as BlobPart[]), { headers: { 'Content-Type': 'model/gltf-binary' } }));
  }
  aoProgredir(1);
}

export default function BaixarOffline({ banner = false }: { banner?: boolean }) {
  const catalogo = useEstado((e) => e.catalogo);
  const versao = useEstado((e) => e.versao);
  const [noCache, setNoCache] = useState<number | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [dispensado, setDispensado] = useState(() => { try { return !!localStorage.getItem(CHAVE_BANNER); } catch { return false; } });

  useEffect(() => { if (catalogo) quantosNoCache(catalogo, versao).then(setNoCache).catch(() => setNoCache(0)); }, [catalogo, versao, progresso === 1]);

  if (!catalogo || !('caches' in window)) return null;
  const lista = arquivosDe(catalogo, versao);
  const total = lista.reduce((s, a) => s + a.bytes, 0);
  const completo = noCache === lista.length;
  if (banner && (completo || dispensado || noCache === null)) return null;

  const iniciar = async () => {
    setErro('');
    setProgresso(0);
    try {
      await baixarTudo(catalogo, versao, setProgresso);
      try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
    } catch (e) {
      setErro(`${(e as Error).message}. Verifique a internet e tente de novo (o que já baixou fica guardado).`);
      setProgresso(null);
    }
  };

  const conteudo = (
    <>
      {completo ? (
        <p className="dica ok"><Icone nome="check" tamanho={18} /> Tudo baixado: o atlas funciona sem internet neste aparelho.</p>
      ) : progresso !== null && progresso < 1 ? (
        <div className="baixando">
          <span className="barra grande"><span style={{ width: `${progresso * 100}%` }} /></span>
          <small>{Math.round(progresso * 100)}% de {mb(total)}</small>
        </div>
      ) : (
        <>
          <p className="dica">Baixa os {catalogo.sistemas.length} sistemas de uma vez para estudar sem internet. Vai ocupar cerca de <strong>{mb(total)}</strong> no aparelho{noCache ? ` (${noCache} de ${lista.length} arquivos já estão aqui)` : ''}.</p>
          <button className="botao botao-principal" onClick={() => void iniciar()}><Icone nome="baixar" /> Baixar para usar offline</button>
        </>
      )}
      {erro && <p className="sistema-erro">{erro}</p>}
    </>
  );

  if (banner) {
    return (
      <div className="banner-offline" role="region" aria-label="Uso offline">
        <button className="botao-icone fechar-banner" aria-label="Agora não" onClick={() => { setDispensado(true); try { localStorage.setItem(CHAVE_BANNER, '1'); } catch { /* */ } }}>
          <Icone nome="fechar" />
        </button>
        <strong>Usar sem internet?</strong>
        {conteudo}
      </div>
    );
  }
  return (
    <section>
      <h3>Usar offline</h3>
      {conteudo}
    </section>
  );
}
