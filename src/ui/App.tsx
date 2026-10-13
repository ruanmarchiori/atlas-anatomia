// Layout: computador/tablet deitado = painéis laterais recolhíveis;
// celular (ou tablet em pé estreito) = gavetas que sobem de baixo.
import { lazy, Suspense, useEffect, useState } from 'react';
import { centralizar, ligarSistema } from '../acoes';
import { carregarCatalogo, ehApp, versaoDoAparelho } from '../catalogo';
import { mudar, useEstado } from '../estado';
import type { Gaveta } from '../estado';
import { lerDados, pedirArmazenamentoPersistente } from '../estudo/armazenamento';
import BaixarOffline from './BaixarOffline';
import CreditoMini from './CreditoMini';
import Busca from './Busca';
import Detalhes from './Detalhes';
import Icone from './Icone';
import Mais from './Mais';
import PainelSistemas from './PainelSistemas';
import Progresso from './Progresso';
import Quiz from './Quiz';
import Rotulo from './Rotulo';
import SliderExplosao from './SliderExplosao';

const Cena = lazy(() => import('../3d/Cena'));

let iniciado = false;

function useLayoutLateral() {
  const consulta = '(min-width: 900px) and (min-aspect-ratio: 1/1)';
  const [lateral, setLateral] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const f = () => setLateral(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return lateral;
}

const ABAS: { id: Exclude<Gaveta, null | 'detalhes'>; rotulo: string; icone: string }[] = [
  { id: 'sistemas', rotulo: 'Sistemas', icone: 'camadas' },
  { id: 'busca', rotulo: 'Buscar', icone: 'lupa' },
  { id: 'quiz', rotulo: 'Quiz', icone: 'quiz' },
  { id: 'progresso', rotulo: 'Progresso', icone: 'progresso' },
  { id: 'mais', rotulo: 'Mais', icone: 'mais' },
];

function ConteudoAba({ aba }: { aba: Exclude<Gaveta, null> }) {
  switch (aba) {
    case 'sistemas': return <PainelSistemas />;
    case 'busca': return <Busca />;
    case 'quiz': return <Quiz />;
    case 'progresso': return <Progresso />;
    case 'mais': return <Mais />;
    case 'detalhes': return <Detalhes />;
  }
}

export default function App() {
  const lateral = useLayoutLateral();
  const catalogo = useEstado((e) => e.catalogo);
  const erro = useEstado((e) => e.erroCatalogo);
  const gaveta = useEstado((e) => e.gaveta);
  const esquerdo = useEstado((e) => e.painelEsquerdo);
  const direito = useEstado((e) => e.painelDireito);
  const detalhesAberto = useEstado((e) => e.detalhesAberto);
  const quizAtivo = useEstado((e) => e.quiz.ativo);
  const aviso = useEstado((e) => e.aviso);
  // Sistemas prontos, visíveis no HTML (ajuda a depurar e aos testes automáticos).
  const prontos = useEstado((e) => Object.entries(e.sistemas).filter(([, v]) => v.status === 'pronto' && v.visivel).map(([k]) => k).join(' '));
  const [abaLateral, setAbaLateral] = useState<'sistemas' | 'busca' | 'progresso' | 'mais'>('sistemas');

  // Início: catálogo + dados do aparelho; só o esquelético é carregado de cara.
  // (Uma vez só: o StrictMode roda efeitos duas vezes em desenvolvimento.)
  useEffect(() => {
    if (iniciado) return;
    iniciado = true;
    const versao = versaoDoAparelho();
    mudar({ versao });
    void pedirArmazenamentoPersistente();
    lerDados().then((dados) => mudar({ dados }));
    carregarCatalogo().then((catalogo) => {
      const sistemas = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, { visivel: false, status: 'nao' as const, progresso: 0 }]));
      mudar({ catalogo, sistemas });
      void ligarSistema('esqueletico');
    }).catch((e: Error) => mudar({ erroCatalogo: e.message }));
  }, []);

  if (erro) return <div className="tela-erro"><h1>Atlas Anatomia</h1><p>{erro}</p><button className="botao" onClick={() => location.reload()}>Tentar de novo</button></div>;

  const mostrarDireito = lateral && (quizAtivo || detalhesAberto);

  return (
    <div className={`app ${lateral ? 'layout-lateral' : 'layout-gavetas'}`} data-prontos={prontos}>
      <main className="palco">
        <Suspense fallback={<div className="carregando-3d">Preparando o 3D…</div>}>
          {catalogo && <Cena />}
        </Suspense>
        <Rotulo />
        <div className="controles-palco">
          <button className="botao-redondo" onClick={centralizar} aria-label="Recentralizar o modelo" title="Recentralizar">
            <Icone nome="centro" />
          </button>
        </div>
        <SliderExplosao />
        {aviso && <div className="aviso" role="status">{aviso}</div>}
        {/* Crédito exigido pela licença dos modelos (sempre visível no computador). */}
        {lateral && <CreditoMini />}
        {/* PWA: na primeira abertura, oferece baixar tudo para usar offline (o APK já traz tudo). */}
        {!ehApp() && <BaixarOffline banner />}
      </main>

      {lateral ? (
        <>
          <aside className={`painel painel-esquerdo ${esquerdo ? 'aberto' : 'fechado'}`} aria-label="Sistemas e estudo">
            <button className="alca alca-esquerda" onClick={() => mudar({ painelEsquerdo: !esquerdo })} aria-label={esquerdo ? 'Recolher painel' : 'Abrir painel'}>
              <Icone nome={esquerdo ? 'esquerda' : 'direita'} />
            </button>
            {esquerdo && (
              <>
                <header className="painel-topo">
                  <h1 className="marca">Atlas <span>Anatomia</span></h1>
                  <button className="botao botao-quiz" onClick={() => mudar({ painelDireito: true, gaveta: 'quiz' })}>
                    <Icone nome="quiz" /> Modo quiz
                  </button>
                </header>
                <nav className="abas" role="tablist">
                  {(['sistemas', 'busca', 'progresso', 'mais'] as const).map((a) => (
                    <button key={a} role="tab" aria-selected={abaLateral === a} className={abaLateral === a ? 'ativa' : ''} onClick={() => setAbaLateral(a)}>
                      {ABAS.find((x) => x.id === a)!.rotulo}
                    </button>
                  ))}
                </nav>
                <div className="painel-corpo"><ConteudoAba aba={abaLateral} /></div>
              </>
            )}
          </aside>
          <aside className={`painel painel-direito ${mostrarDireito || gaveta === 'quiz' ? (direito ? 'aberto' : 'fechado') : 'oculto'}`} aria-label="Detalhes">
            <button className="alca alca-direita" onClick={() => mudar({ painelDireito: !direito })} aria-label={direito ? 'Recolher painel' : 'Abrir painel'}>
              <Icone nome={direito ? 'direita' : 'esquerda'} />
            </button>
            {direito && <div className="painel-corpo">{quizAtivo || gaveta === 'quiz' ? <Quiz /> : <Detalhes />}</div>}
          </aside>
        </>
      ) : (
        <>
          {gaveta && (
            <section className="gaveta" aria-label="Painel">
              <div className="gaveta-puxador" onClick={() => mudar({ gaveta: null })} role="button" aria-label="Fechar painel"><span /></div>
              <div className="gaveta-corpo"><ConteudoAba aba={gaveta} /></div>
            </section>
          )}
          <nav className="barra-inferior">
            {ABAS.map((a) => (
              <button key={a.id} className={gaveta === a.id ? 'ativa' : ''} onClick={() => mudar({ gaveta: gaveta === a.id ? null : a.id })}>
                <Icone nome={a.icone} />
                <span>{a.rotulo}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

