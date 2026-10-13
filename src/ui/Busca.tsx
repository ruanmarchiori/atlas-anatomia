// Busca por nome (português ou inglês, sem diferenciar acento): foca a câmera e destaca.
import { useMemo, useState } from 'react';
import { buscar, focarPeca } from '../acoes';
import { COR_SISTEMA } from '../catalogo';
import { mudar, useEstado } from '../estado';

export default function Busca() {
  const [texto, setTexto] = useState('');
  const catalogo = useEstado((e) => e.catalogo);
  const resultados = useMemo(() => (catalogo ? buscar(texto) : []), [texto, catalogo]);
  return (
    <div className="busca">
      <input
        className="campo"
        type="search"
        inputMode="search"
        placeholder="Ex.: fêmur, deltoide, aorta, femur…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoComplete="off"
        aria-label="Buscar peça"
      />
      {texto.trim().length >= 2 && !resultados.length && <p className="vazio">Nada encontrado.</p>}
      <ul className="resultados">
        {resultados.map(({ peca, sistema }) => (
          <li key={peca.fj}>
            <button
              className="resultado"
              onClick={() => {
                void focarPeca(peca, true);
                // No celular, fecha a busca pra mostrar o modelo e abre os detalhes.
                mudar({ gaveta: 'detalhes' });
              }}
            >
              <span className="sistema-cor" style={{ background: COR_SISTEMA[sistema] }} />
              <span>
                <span className="resultado-pt">{peca.pt}</span>
                <span className="resultado-en">{peca.en}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
