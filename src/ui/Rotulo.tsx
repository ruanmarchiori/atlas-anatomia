// Rótulo com o nome da peça. A posição é atualizada a cada quadro pela cena 3D
// (id "rotulo-peca"); aqui só o conteúdo. No toque, traz o botão "Detalhes".
import { abrirDetalhes } from '../acoes';
import { ehToque } from '../catalogo';
import { useEstado } from '../estado';

export default function Rotulo() {
  const hover = useEstado((e) => e.hover);
  const selecionada = useEstado((e) => e.selecionada);
  const detalhes = useEstado((e) => e.detalhesAberto);
  const quiz = useEstado((e) => e.quiz.ativo);
  const peca = quiz ? null : hover || selecionada;
  const mostrarBotao = ehToque() && !!selecionada && peca === selecionada && !detalhes;
  return (
    <div id="rotulo-peca" className={`rotulo ${peca ? '' : 'vazio'}`} aria-live="polite">
      {peca && (
        <div className="rotulo-caixa">
          <span className="rotulo-nome">{peca.pt}</span>
          {mostrarBotao && (
            <button className="rotulo-botao" onClick={abrirDetalhes}>Detalhes</button>
          )}
        </div>
      )}
    </div>
  );
}
