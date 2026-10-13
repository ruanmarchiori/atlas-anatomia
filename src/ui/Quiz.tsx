// Modo quiz: destaca uma peça aleatória (opcionalmente de um sistema) e eu escolho o
// nome entre 4 opções ou digito. Mostra acertos e erros da sessão e do total.
import { useEffect, useRef, useState } from 'react';
import { iniciarQuiz, pararQuiz, proximaPergunta, responderQuiz } from '../acoes';
import { mudar, useEstado } from '../estado';
import Icone from './Icone';

export default function Quiz() {
  const quiz = useEstado((e) => e.quiz);
  const catalogo = useEstado((e) => e.catalogo);
  const total = useEstado((e) => e.dados.quiz);
  const [sistema, setSistema] = useState<string>('');
  const [modo, setModo] = useState<'opcoes' | 'digitar'>('opcoes');
  const [digitado, setDigitado] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { setDigitado(''); if (quiz.modo === 'digitar') campo.current?.focus(); }, [quiz.alvo, quiz.modo]);

  if (!quiz.ativo) {
    return (
      <div className="quiz">
        <h2>Modo quiz</h2>
        <p className="dica">Uma peça é destacada em azul e o resto fica apagado. Diga qual é.</p>
        <label className="campo-rotulo">Sistema
          <select className="campo" value={sistema} onChange={(e) => setSistema(e.target.value)}>
            <option value="">Todos os sistemas ligados</option>
            {catalogo?.sistemas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
        <div className="seletor" role="radiogroup" aria-label="Como responder">
          <button role="radio" aria-checked={modo === 'opcoes'} className={modo === 'opcoes' ? 'ativa' : ''} onClick={() => setModo('opcoes')}>4 opções</button>
          <button role="radio" aria-checked={modo === 'digitar'} className={modo === 'digitar' ? 'ativa' : ''} onClick={() => setModo('digitar')}>Digitar</button>
        </div>
        <button className="botao botao-principal" onClick={() => void iniciarQuiz(sistema || null, modo)}>Começar</button>
        <p className="placar-total">Total no aparelho: <strong>{total.acertos}</strong> acertos · <strong>{total.erros}</strong> erros</p>
      </div>
    );
  }

  const r = quiz.resposta;
  return (
    <div className="quiz">
      <div className="quiz-topo">
        <span className="placar"><Icone nome="check" tamanho={16} /> {quiz.sessao.acertos} · <Icone nome="fechar" tamanho={16} /> {quiz.sessao.erros}</span>
        <button className="botao botao-claro pequeno" onClick={() => { pararQuiz(); mudar({ gaveta: null }); }}>Encerrar</button>
      </div>
      <p className="quiz-pergunta">Qual é a peça destacada?</p>
      {quiz.modo === 'opcoes' ? (
        <div className="opcoes">
          {quiz.opcoes.map((o) => {
            const estado = r ? (o === quiz.alvo ? 'certa' : r.escolhida === o.pt ? 'errada' : '') : '';
            return (
              <button key={o.fj} className={`opcao ${estado}`} disabled={!!r} onClick={() => responderQuiz(o.pt)}>{o.pt}</button>
            );
          })}
        </div>
      ) : (
        <form className="quiz-digitar" onSubmit={(e) => { e.preventDefault(); if (digitado.trim()) responderQuiz(digitado); }}>
          <input ref={campo} className="campo" value={digitado} onChange={(e) => setDigitado(e.target.value)} disabled={!!r} placeholder="Digite o nome em português" autoComplete="off" />
          <button className="botao botao-principal" disabled={!!r || !digitado.trim()}>Responder</button>
        </form>
      )}
      {r && (
        <div className={`quiz-resultado ${r.certa ? 'ok' : 'erro'}`} role="status">
          <strong>{r.certa ? 'Acertou!' : 'Não foi dessa vez.'}</strong>
          {!r.certa && <span> É <em>{quiz.alvo?.pt}</em>.</span>}
          <button className="botao botao-principal" onClick={() => void proximaPergunta()}>Próxima</button>
        </div>
      )}
    </div>
  );
}
