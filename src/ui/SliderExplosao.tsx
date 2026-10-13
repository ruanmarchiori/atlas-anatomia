// Slider "Explodir anatomia": 0% = corpo montado, 100% = peças organizadas em grade.
// O valor vai direto para o estado; a cena anima até ele (transição suave).
import { mudar, useEstado } from '../estado';
import Icone from './Icone';

export default function SliderExplosao() {
  const valor = useEstado((e) => e.explosao);
  const pct = Math.round(valor * 100);
  return (
    <div className="slider-explosao">
      <label htmlFor="explosao" className="slider-rotulo">
        <Icone nome="explodir" tamanho={18} />
        <span>Explodir anatomia</span>
        <strong>{pct}%</strong>
      </label>
      <input
        id="explosao"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(ev) => mudar({ explosao: Number(ev.target.value) / 100 })}
        style={{ ['--pct' as string]: `${pct}%` }}
        aria-valuetext={pct === 0 ? 'corpo montado' : pct === 100 ? 'peças em grade' : `${pct}%`}
      />
    </div>
  );
}
