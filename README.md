# Torre de Controle Logística — OTD LOGISTICS

Dashboard offline (HTML/CSS/JS puro, sem servidor, sem internet) para acompanhar a operação
**autopropulsionada** da OTD (viagens com placas fictícias `OTD-xxxx`, coluna **Grupo = RODANDO**
na planilha lviagens). Todos os outros segmentos (LATAS, BENS DE CO, PRANCHA) são ignorados.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Dashboard interativo, para computador — filtros, tabelas, gráficos. |
| `tv.html` | Modo TV / kiosk — telas cheias alternando sozinhas a cada 1 minuto. Feito para Raspberry Pi. |
| `data.js` | Base de dados gerada a partir do lviagens.xlsx. É o único arquivo que muda a cada atualização. |
| `common.js` | Funções compartilhadas (filtros, cálculos, formatação). |
| `style.css` | Tema visual (cores OTD, cards, animações). |
| `logo.png` | Logo OTD (nesta versão web, incorporada como base64 dentro do HTML). |
| `generate_data.py` | Script que gera/atualiza o data.js a partir do lviagens.xlsx (+ lcrt.xlsx opcional). |

Esta é a versão publicada no GitHub Pages. Nesta versão, index.html e tv.html carregam o
Chart.js via CDN (jsDelivr) e o logo embutido em base64, para não depender de arquivos
binários no repositório. A versão local (para o Raspberry Pi, 100% offline) usa chart.umd.min.js
e logo.png como arquivos separados.

## Como atualizar os dados

1. Rode localmente: pip install openpyxl --break-system-packages (só na primeira vez)
2. python3 generate_data.py "lviagens_atualizado.xlsx" "lcrt_atualizado.xlsx"
3. Suba o novo data.js para este repositório (substituindo o arquivo existente).

### Regras de limpeza e cruzamento aplicadas nos dados

- Cargas sem Nota Fiscal são descartadas da análise — exceto quando o romaneio aparece na base lcrt (cargas do Mercosul, faturadas por CRT, sem Nota Fiscal brasileira).
- Faturamento do Mercosul: quando Frete Total/Frete Peso vêm zerados no lviagens, usa-se o Valor total CRT (R$) da base lcrt, cruzando pela coluna Romaneio. Quando um CRT cobre mais de um romaneio, o valor é dividido igualmente entre eles.

## Definições usadas

- Em trânsito: viagem com Dt. Carga (I) preenchida e Dt. Descarga (I) em branco.
- Aguardando início: viagem sem Dt. Carga (I) preenchida.
- Rota: Carregamento → Destino.
- Meta do mês: editável manualmente no navegador; sugestão automática de 5% acima do mês anterior.
- Projeção de fechamento: (faturamento acumulado ÷ dias decorridos) × dias totais do mês.
