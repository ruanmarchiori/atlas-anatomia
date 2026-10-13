// Progresso de estudo por sistema (peças marcadas como "estudada").
import { focarPeca } from '../acoes';
import { COR_SISTEMA } from '../catalogo';
import { useEstado } from '../estado';

export default function Progresso() {
  const catalogo = useEstado((e) => e.catalogo);
  const estudadas = useEstado((e) => e.dados.estudadas);
  const quiz = useEstado((e) => e.dados.quiz);
  if (!catalogo) return null;
  const total = catalogo.sistemas.reduce((s, x) => s + x.pecas.length, 0);
  const feitas = Object.keys(estudadas).length;
  const recentes = Object.entries(estudadas).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([fj]) => catalogo.sistemas.flatMap((s) => s.pecas).find((p) => p.fj === fj)).filter(Boolean);
  return (
    <div className="progresso">
      <div className="progresso-geral">
        <strong>{feitas}</strong> de {total} peças estudadas
        <span className="barra grande"><span style={{ width: `${(feitas / total) * 100}%` }} /></span>
        <small>Quiz: {quiz.acertos} acertos · {quiz.erros} erros{quiz.acertos + quiz.erros ? ` (${Math.round((quiz.acertos / (quiz.acertos + quiz.erros)) * 100)}%)` : ''}</small>
      </div>
      <ul className="progresso-sistemas">
        {catalogo.sistemas.map((s) => {
          const n = s.pecas.filter((p) => estudadas[p.fj]).length;
          const pct = (n / s.pecas.length) * 100;
          return (
            <li key={s.id}>
              <span className="sistema-cor" style={{ background: COR_SISTEMA[s.id] }} />
              <span className="progresso-nome">{s.nome}</span>
              <span className="progresso-num">{n}/{s.pecas.length}</span>
              <span className="barra"><span style={{ width: `${pct}%`, background: COR_SISTEMA[s.id] }} /></span>
            </li>
          );
        })}
      </ul>
      {recentes.length > 0 && (
        <>
          <h3>Estudadas recentemente</h3>
          <ul className="resultados">
            {recentes.map((p) => (
              <li key={p!.fj}><button className="resultado" onClick={() => void focarPeca(p!, true)}><span className="resultado-pt">{p!.pt}</span></button></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
