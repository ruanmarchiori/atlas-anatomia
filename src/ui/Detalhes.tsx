// Painel de detalhes da peça selecionada: nomes, sistema, região, "estudada" e anotação.
import { alternarEstudada, focarPeca, selecionar, setAnotacao } from '../acoes';
import { COR_SISTEMA } from '../catalogo';
import { mudar, sistemaDaPeca, useEstado } from '../estado';
import Icone from './Icone';

export default function Detalhes() {
  const peca = useEstado((e) => e.selecionada);
  const catalogo = useEstado((e) => e.catalogo);
  const anotacao = useEstado((e) => (peca ? e.dados.anotacoes[peca.fj] || '' : ''));
  const estudada = useEstado((e) => (peca ? !!e.dados.estudadas[peca.fj] : false));
  const quiz = useEstado((e) => (peca ? e.dados.quiz.porPeca[peca.fj] : undefined));

  if (!peca || !catalogo) {
    return <p className="vazio">Toque ou clique numa peça do modelo para ver os detalhes.</p>;
  }
  const sistemaId = sistemaDaPeca(peca);
  const sistema = catalogo.sistemas.find((s) => s.id === sistemaId);
  return (
    <div className="detalhes">
      <div className="detalhes-topo">
        <span className="sistema-cor grande" style={{ background: COR_SISTEMA[sistemaId] }} />
        <div>
          <h2 className="detalhes-pt">{peca.pt}</h2>
          <p className="detalhes-en" lang="en">{peca.en}</p>
        </div>
        <button className="botao-icone" onClick={() => { selecionar(null); mudar({ gaveta: null }); }} aria-label="Fechar detalhes">
          <Icone nome="fechar" />
        </button>
      </div>
      {peca.revisar && (
        <p className="alerta-revisar">
          <Icone nome="info" tamanho={18} /> Nome em português marcado para revisão — confira na Terminologia Anatômica.
        </p>
      )}
      <dl className="ficha">
        <div><dt>Sistema</dt><dd>{sistema?.nome}</dd></div>
        <div><dt>Região</dt><dd>{catalogo.regioes[peca.regiao] || peca.regiao}</dd></div>
        {peca.fonte === 'HRA'
          ? <div><dt>Modelo</dt><dd>Human Reference Atlas (HuBMAP)</dd></div>
          : <div><dt>Código FMA</dt><dd>{peca.fma ? peca.fma.replace('FMA', 'FMA ') : '—'}</dd></div>}
        {peca.sexo && <div><dt>Corpo</dt><dd>{peca.sexo === 'f' ? 'Feminino' : 'Masculino'}</dd></div>}
        {quiz && <div><dt>No quiz</dt><dd>{quiz.a} acerto(s) · {quiz.e} erro(s)</dd></div>}
      </dl>
      <div className="detalhes-acoes">
        <button className={`botao ${estudada ? 'botao-ok' : ''}`} onClick={() => alternarEstudada(peca)} aria-pressed={estudada}>
          <Icone nome="check" /> {estudada ? 'Estudada' : 'Marcar como estudada'}
        </button>
        <button className="botao botao-claro" onClick={() => void focarPeca(peca, true)}>
          <Icone nome="centro" /> Focar
        </button>
      </div>
      <label className="anotacao">
        <span>Minha anotação</span>
        <textarea
          value={anotacao}
          onChange={(e) => setAnotacao(peca, e.target.value)}
          placeholder="Origem, inserção, inervação, dicas de memorização…"
          rows={5}
        />
        <small>Salva automaticamente neste aparelho.</small>
      </label>
    </div>
  );
}
