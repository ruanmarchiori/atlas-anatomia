// Liga/desliga de cada sistema, com contagem de peças, progresso de estudo e
// indicador de carregamento (os sistemas são baixados sob demanda).
import { alternarSistema } from '../acoes';
import { COR_SISTEMA } from '../catalogo';
import { useEstado } from '../estado';
import CreditoMini from './CreditoMini';

export default function PainelSistemas() {
  const catalogo = useEstado((e) => e.catalogo);
  const sistemas = useEstado((e) => e.sistemas);
  const estudadas = useEstado((e) => e.dados.estudadas);
  const versao = useEstado((e) => e.versao);
  if (!catalogo) return <p className="vazio">Carregando catálogo…</p>;
  return (
    <div className="lista-sistemas">
      <p className="dica">Toque para ligar ou desligar. Cada sistema é baixado na primeira vez.</p>
      {catalogo.sistemas.map((s) => {
        const st = sistemas[s.id];
        const feitas = s.pecas.filter((p) => estudadas[p.fj]).length;
        const bytes = s.arquivos[versao].reduce((t, a) => t + a.bytes, 0);
        const tamanho = bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
        return (
          <button
            key={s.id}
            className={`sistema ${st?.visivel ? 'ligado' : ''}`}
            onClick={() => alternarSistema(s.id)}
            aria-pressed={!!st?.visivel}
          >
            <span className="sistema-cor" style={{ background: COR_SISTEMA[s.id] }} />
            <span className="sistema-texto">
              <span className="sistema-nome">{s.nome}</span>
              <span className="sistema-info">
                {s.pecas.length} peças · {feitas} estudadas
                {st?.status === 'nao' && ` · ${tamanho}`}
              </span>
              {st?.status === 'carregando' && (
                <span className="barra"><span style={{ width: `${Math.round(st.progresso * 100)}%` }} /></span>
              )}
              {st?.status === 'erro' && <span className="sistema-erro">Falhou — toque para tentar de novo</span>}
            </span>
            <span className={`chave ${st?.visivel ? 'on' : ''}`} aria-hidden="true"><span /></span>
          </button>
        );
      })}
      <CreditoMini />
    </div>
  );
}
