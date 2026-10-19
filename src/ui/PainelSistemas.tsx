// Liga/desliga de cada sistema, com contagem de peças, progresso de estudo e
// indicador de carregamento (os sistemas são baixados sob demanda).
// O reprodutor aparece em duas linhas (masculino e feminino): ligar uma delas também
// troca o corpo mostrado.
import { alternarSistema, desligarSistema, escolherSexo, ligarSistema } from '../acoes';
import type { Sexo, Sistema } from '../catalogo';
import { COR_SISTEMA, doCorpo } from '../catalogo';
import { useEstado } from '../estado';
import CreditoMini from './CreditoMini';

interface Linha { chave: string; sistema: Sistema; nome: string; sexo: Sexo | null }

export default function PainelSistemas() {
  const catalogo = useEstado((e) => e.catalogo);
  const sistemas = useEstado((e) => e.sistemas);
  const estudadas = useEstado((e) => e.dados.estudadas);
  const versao = useEstado((e) => e.versao);
  const sexo = useEstado((e) => e.sexo);
  if (!catalogo) return <p className="vazio">Carregando catálogo…</p>;

  const linhas: Linha[] = catalogo.sistemas.flatMap((s): Linha[] => s.id === 'reprodutor'
    ? [
      { chave: 'reprodutor-m', sistema: s, nome: 'Reprodutor masculino', sexo: 'm' },
      { chave: 'reprodutor-f', sistema: s, nome: 'Reprodutor feminino', sexo: 'f' },
    ]
    : [{ chave: s.id, sistema: s, nome: s.nome, sexo: null }]);

  function tocar(l: Linha, ligada: boolean) {
    if (!l.sexo) { alternarSistema(l.sistema.id); return; }
    if (ligada) { desligarSistema(l.sistema.id); return; }
    if (sexo !== l.sexo) escolherSexo(l.sexo);
    void ligarSistema(l.sistema.id);
  }

  return (
    <div className="lista-sistemas">
      <div className="seletor seletor-corpo" role="radiogroup" aria-label="Corpo">
        <button role="radio" aria-checked={sexo === 'm'} className={sexo === 'm' ? 'ativa' : ''} onClick={() => escolherSexo('m')}>Corpo masculino</button>
        <button role="radio" aria-checked={sexo === 'f'} className={sexo === 'f' ? 'ativa' : ''} onClick={() => escolherSexo('f')}>Corpo feminino</button>
      </div>
      <p className="dica">Toque para ligar ou desligar. Cada sistema é baixado na primeira vez.</p>
      {linhas.map((l) => {
        const s = l.sistema;
        const st = sistemas[s.id];
        const ligada = !!st?.visivel && (!l.sexo || l.sexo === sexo);
        const pecas = s.pecas.filter((p) => (l.sexo ? p.sexo === l.sexo : doCorpo(p, sexo)));
        const feitas = pecas.filter((p) => estudadas[p.fj]).length;
        const bytes = s.arquivos[versao].reduce((t, a) => t + a.bytes, 0);
        const tamanho = bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
        return (
          <button
            key={l.chave}
            className={`sistema ${ligada ? 'ligado' : ''}`}
            onClick={() => tocar(l, ligada)}
            aria-pressed={ligada}
          >
            <span className="sistema-cor" style={{ background: COR_SISTEMA[s.id] }} />
            <span className="sistema-texto">
              <span className="sistema-nome">{l.nome}</span>
              <span className="sistema-info">
                {pecas.length} peças · {feitas} estudadas
                {st?.status === 'nao' && ` · ${tamanho}`}
              </span>
              {st?.status === 'carregando' && ligada && (
                <span className="barra"><span style={{ width: `${Math.round(st.progresso * 100)}%` }} /></span>
              )}
              {st?.status === 'erro' && <span className="sistema-erro">Falhou — toque para tentar de novo</span>}
            </span>
            <span className={`chave ${ligada ? 'on' : ''}`} aria-hidden="true"><span /></span>
          </button>
        );
      })}
      <CreditoMini />
    </div>
  );
}
