// Exportar/importar meus dados, uso offline e créditos.
import { useRef, useState } from 'react';
import { substituirDados } from '../acoes';
import { ehApp } from '../catalogo';
import { avisar, lerEstado, useEstado } from '../estado';
import { exportar, importar } from '../estudo/armazenamento';
import BaixarOffline from './BaixarOffline';
import Icone from './Icone';

export default function Mais() {
  const dados = useEstado((e) => e.dados);
  const versao = useEstado((e) => e.versao);
  const catalogo = useEstado((e) => e.catalogo);
  const arquivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const nAnot = Object.keys(dados.anotacoes).length;
  const nEst = Object.keys(dados.estudadas).length;

  return (
    <div className="mais">
      <section>
        <h3>Meus dados</h3>
        <p className="dica">{nAnot} anotações · {nEst} peças estudadas · {dados.quiz.acertos + dados.quiz.erros} respostas no quiz. Tudo fica só neste aparelho.</p>
        <div className="detalhes-acoes">
          <button className="botao" onClick={() => exportar(lerEstado().dados)}><Icone nome="baixar" /> Exportar meus dados</button>
          <button className="botao botao-claro" onClick={() => arquivo.current?.click()}><Icone nome="subir" /> Importar meus dados</button>
        </div>
        <input
          ref={arquivo}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { dados: novos, resumo } = await importar(f, lerEstado().dados);
              substituirDados(novos);
              setMsg(resumo);
              avisar('Dados importados.');
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        />
        {msg && <p className="dica" role="status">{msg}</p>}
        <p className="dica">Para levar de um aparelho a outro: exporte aqui, passe o arquivo (e-mail, Drive, cabo) e importe no outro. A importação soma ao que já existe.</p>
      </section>

      {!ehApp() && <BaixarOffline />}

      <section>
        <h3>Sobre</h3>
        <p className="dica">
          Modelos: versão {versao === 'completo' ? 'completa (computador)' : 'reduzida (celular/tablet)'}.
          {catalogo && ` ${catalogo.sistemas.reduce((s, x) => s + x.pecas.length, 0)} peças.`} Atlas para estudo pessoal; nomes em português
          marcados com aviso devem ser conferidos na Terminologia Anatômica.
        </p>
      </section>

      <footer className="credito">
        <p>
          Modelos 3D: <strong>BodyParts3D</strong>, © The Database Center for Life Science, licenciado sob{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.pt-br" target="_blank" rel="noopener">CC BY 4.0</a>{' '}
          (os arquivos originais trazem CC BY-SA 2.1 Japão; os modelos convertidos aqui seguem a mesma licença).{' '}
          <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">Fonte</a>.
          Modificados: convertidos para GLB, agrupados por sistema e simplificados.
        </p>
        <p>
          Órgãos reprodutores femininos (útero, tubas uterinas, ovários e mamas):{' '}
          <strong>Human Reference Atlas</strong> 3D Reference Object Library v1.3 (HuBMAP, NIH), licenciado sob{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.pt-br" target="_blank" rel="noopener">CC BY 4.0</a>.{' '}
          <a href="https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html" target="_blank" rel="noopener">Fonte</a>.
          Modificados: escalados e posicionados na pelve e no tórax do modelo BodyParts3D, divididos em peças e simplificados.
        </p>
      </footer>
    </div>
  );
}
