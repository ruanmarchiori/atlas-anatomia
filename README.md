# Atlas Anatomia

Atlas de anatomia 3D para estudo pessoal: 2.234 peças do corpo humano (ossos, músculos,
artérias e coração, veias, sistema nervoso e olho, respiratório, digestório, urinário,
linfático e outros), com nomes em português e inglês, filtro por sistema, busca, quiz,
progresso de estudo, anotações e o controle **Explodir anatomia**, que separa as peças
até organizá-las numa grade.

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
  01-catalogo.mjs        lê os OBJ + listas FMA → sistema e região de cada peça
  03-modelos.mjs         gera os GLB (completo e reduzido), um por sistema
  04-catalogo-app.mjs    junta tudo + traduções → public/dados/catalogo.json
data/raw/                dados originais do BodyParts3D (NÃO vão para o git)
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
| outros | 1,6 MB | 0,6 MB |
| **total** | **45 MB** | **16 MB** |

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
