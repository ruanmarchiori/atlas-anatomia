# Atlas Anatomia

Atlas de anatomia 3D para estudo pessoal: 2.270 peças do corpo humano (ossos, músculos,
artérias e coração, veias, sistema nervoso e olho, respiratório, digestório, urinário,
linfático, **reprodutor masculino e feminino** e outros), com nomes em português e inglês,
filtro por sistema, busca, quiz, progresso de estudo, anotações e o controle
**Explodir anatomia**, que separa as peças até organizá-las numa grade.

No painel **Sistemas**, o seletor **Corpo masculino / Corpo feminino** troca as peças do
sistema reprodutor (e esconde a pele e os vasos do pênis/testículos no corpo feminino).
A escolha fica salva no aparelho. Buscar uma peça do outro corpo (ex.: "útero") troca o
corpo sozinho; o quiz só pergunta peças do corpo escolhido.

Funciona no computador, no tablet e no celular, **inclusive offline**:

- **Android** — app instalável por APK, com tudo dentro (sem hospedagem).
- **iPhone/iPad** (e também Android/computador) — PWA no GitHub Pages: depois de aberto
  uma vez e baixado pelo botão "Baixar para usar offline", funciona sem internet.

## Rodar no computador

```bash
npm install        # só na primeira vez
npm run dev        # abre em http://localhost:5173
```

O computador usa a versão **completa** dos modelos; celular, tablet e o APK usam a
**reduzida**. Para forçar uma delas: `http://localhost:5173/?versao=completo` (ou `reduzido`).
Computadores com 4 GB de RAM ou menos também usam a reduzida.

## Onde fica cada parte

```
scripts/                 pré-processamento (rodado uma vez; ver "Dados")
  01-catalogo.mjs        lê os OBJ + listas FMA → sistema, região e sexo de cada peça
  02-hra-para-obj.mjs    órgãos femininos do HRA → OBJ encaixados no corpo do BodyParts3D
  03-modelos.mjs         gera os GLB (completo e reduzido), um por sistema
  04-catalogo-app.mjs    junta tudo + traduções → public/dados/catalogo.json
data/raw/                dados originais do BodyParts3D e do HRA (NÃO vão para o git)
data/traducao/*.tsv      tabelas de tradução para o português (editáveis à mão)
data/gerado/             listas para revisão: revisar-nomes.txt, revisar-outros.txt
public/modelos/          GLB gerados (completo/ e reduzido/)
public/dados/            catálogo usado pelo app
src/3d/motor.ts          núcleo 3D: malhas por sistema, explosão, seleção (GPU picking)
src/3d/Cena.tsx          câmera, luzes, gestos, enquadramento automático
src/acoes.ts             ligar sistemas, seleção, busca, quiz, estudo
src/estado.ts            estado do app
src/estudo/              anotações, progresso e quiz no aparelho + exportar/importar
src/ui/                  interface (painéis, gavetas, slider, quiz, etc.)
android/                 projeto Android (Capacitor)
recursos/                ícone e tela de abertura do APK
```

## Dados (BodyParts3D)

- Fonte oficial: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Usado: `isa_BP3D_4.0_obj_99.zip` (136 MB, 2.234 OBJ) + as listas `*_parts_list_e.txt`,
  `*_inclusion_relation_list.txt` e `*_element_parts.txt`, todos em `data/raw/`.
- **Licença:** o site oficial informa **CC BY 4.0**; os cabeçalhos dos OBJ trazem a
  licença antiga **CC BY-SA 2.1 Japão**. O crédito aparece no rodapé do app e os modelos
  convertidos seguem a mesma licença:
  *BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.*

### Órgãos femininos (Human Reference Atlas)

O BodyParts3D é um corpo **masculino**. Útero, tubas uterinas, ovários e mamas vêm do
**Human Reference Atlas** (HuBMAP, NIH), *3D Reference Object Library* v1.3, feitos a
partir do Visible Human feminino.

- Fonte oficial: https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html
  (arquivos em https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.3/models).
- Usado (em `data/raw/hra/`, lista em `urls.txt`): `VH_F_Uterus.glb` (0,9 MB),
  `VH_F_Ovary_L/R.glb`, `VH_F_Fallopian_Tube_L/R.glb` (0,3 MB cada),
  `3d-vh-f-mammary-gland-l/r.glb` (13 e 23 MB) e `VH_F_Pelvis.glb` (1,5 MB, só para alinhar).
- **Licença: CC BY 4.0.** Crédito no rodapé e em **Mais**.
- `02-hra-para-obj.mjs` encaixa os órgãos no corpo do BodyParts3D: alinha a pelve óssea
  feminina do HRA com o quadril e o sacro (escala uniforme 0,944), põe o útero **em pé e
  de frente** (o HRA o traz antevertido, quase deitado: girado 60° para a vista clássica de
  atlas, com tubas e ovários para os lados), com o colo no meio da pelve logo acima da
  bexiga (que é a do modelo masculino), e apoia as mamas sobre o peitoral maior. É uma aproximação para estudo — a pelve óssea continua sendo a masculina.
- **Não existem nas fontes:** vagina e vulva (o HRA não tem); escroto, glândulas
  bulbouretrais e ductos ejaculatórios (o BodyParts3D não tem).

Para refazer tudo a partir dos originais: `npm run dados`.

| Arquivo GLB | Completo | Reduzido |
|---|---|---|
| esquelético | 4,3 MB | 1,8 MB |
| muscular | 19,3 MB | 7,0 MB |
| artérias e coração | 6,6 MB | 2,2 MB |
| veias | 6,3 MB | 1,8 MB |
| nervoso e olho | 5,3 MB | 1,8 MB |
| respiratório | 0,8 MB | 0,3 MB |
| digestório | 1,1 MB | 0,7 MB |
| urinário | 0,1 MB | 32 KB |
| linfático | 30 KB | 15 KB |
| reprodutor | 3,1 MB | 0,8 MB |
| outros | 1,6 MB | 0,6 MB |
| **total** | **48 MB** | **17 MB** |

### Traduções

`data/traducao/*.tsv`: nome-base em inglês → português (Terminologia Anatômica), com a
marcação **revisar** quando há dúvida. `{m}`/`{f}` indicam onde entra "direito/direita".
Séries (vértebras, costelas, falanges, dentes…) são geradas por regra no
`04-catalogo-app.mjs`. Depois de editar uma tabela: `npm run dados:app`.
A lista do que está marcado para revisão fica em `data/gerado/revisar-nomes.txt`, e as
peças que ficaram em "outros", em `data/gerado/revisar-outros.txt`.

## Android (APK)

Requer **JDK 21** e **Android SDK** (Android Studio instala os dois).

```bash
npm run android:apk
```

Gera `android/app/build/outputs/apk/release/app-release.apk`, assinado com a chave
indicada em `android/keystore.properties` (fora do git). O número de versão sobe
sozinho a cada build, então o APK novo instala **por cima** do antigo sem perder os
dados — desde que seja assinado com a **mesma chave**. Guarde a chave e a senha.

## Site / PWA (GitHub Pages)

```bash
npm run publicar   # gera o build e envia para o branch gh-pages
```

## Dados de estudo

Anotações, peças estudadas e quiz ficam no próprio aparelho (IndexedDB), sem login nem
servidor. Use **Mais → Exportar meus dados / Importar meus dados** para levar de um
aparelho para outro (a importação soma ao que já existe).
