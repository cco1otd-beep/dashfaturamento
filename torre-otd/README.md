# Torre de Controle Logística — OTD LOGISTICS

Dashboard offline (HTML/CSS/JS puro, sem servidor, sem internet) para acompanhar a operação
**autopropulsionada** da OTD (viagens com placas fictícias `OTD-xxxx`, coluna **Grupo = RODANDO**
na planilha lviagens). Todos os outros segmentos (LATAS, BENS DE CO, PRANCHA) são ignorados.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Dashboard interativo, para computador — filtros, tabelas, gráficos. |
| `tv.html` | Modo TV / kiosk — telas cheias alternando sozinhas a cada 1 minuto. Feito para Raspberry Pi. |
| `data.js` | Base de dados gerada a partir do lviagens.xlsx. **É o único arquivo que muda a cada atualização.** |
| `common.js` | Funções compartilhadas (filtros, cálculos, formatação). |
| `style.css` | Tema visual (cores OTD, cards, animações). |
| `chart.umd.min.js` | Biblioteca de gráficos (Chart.js), local — funciona sem internet. |
| `logo.png` | Logo OTD. |
| `generate_data.py` | Script que gera/atualiza o `data.js` a partir do lviagens.xlsx (+ lcrt.xlsx opcional). |

Todos os arquivos precisam ficar **na mesma pasta**.

## Como atualizar os dados

Toda vez que chegar um novo `lviagens` (novo dia, nova exportação), e opcionalmente um novo
`lcrt` (base do Mercosul):

```bash
pip install openpyxl --break-system-packages   # só na primeira vez
python3 generate_data.py "lviagens_diario_atualizada_XX.XX.xlsx" "lcrt_diario_atualizado_XX.XX.xlsx"
```

Se o arquivo `lcrt` não for informado, o script procura sozinho por um arquivo `lcrt*.xlsx`
na mesma pasta do lviagens; se não encontrar nenhum, ele roda mesmo assim (sem o
enriquecimento Mercosul, exibindo um aviso no terminal).

Isso regrava o `data.js`. Não precisa mexer em mais nada — só atualizar esse arquivo e
recarregar as páginas (o `tv.html` já recarrega sozinho a cada 30 min).

Dica: se quiser automatizar 100%, é possível criar uma tarefa agendada (cron / Agendador de
Tarefas) que roda esse comando sempre que os arquivos forem substituídos numa pasta
compartilhada.

### Regras de limpeza e cruzamento aplicadas nos dados

- **Cargas sem Nota Fiscal são descartadas**: romaneios com a coluna "Nota Fiscal" em branco
  não representam carregamentos reais e são retirados da análise — **exceto** quando o
  romaneio aparece na base `lcrt` (cargas do Mercosul, que são faturadas por CRT e não têm
  Nota Fiscal brasileira).
- **Faturamento do Mercosul (base lcrt)**: para cargas com Frete Total/Frete Peso zerados no
  lviagens, o faturamento é preenchido com o "Valor total CRT (R$)" da base lcrt, cruzando
  pela coluna Romaneio (chave presente nas duas planilhas). Quando um mesmo CRT cobre mais de
  um romaneio, o valor é dividido igualmente entre eles.

## Como usar no computador

Basta abrir `index.html` com dois cliques (funciona em qualquer navegador, sem internet).

- O filtro de período já abre sempre no **mês atual**.
- Botões rápidos: Mês Atual, Mês Anterior, Últimos 3 Meses, Ano — ou selecione manualmente
  os meses desejados (múltipla escolha) ou um intervalo de datas personalizado.
- Filtros por Cliente, Motorista, Placa e Rota são todos de múltipla escolha, com busca.
- A **Meta do Mês** é editável (fica salva no navegador) — clique no campo "Meta" e salve.
- O painel "Painel Operacional" (cargas em trânsito / aguardando início) é sempre em tempo
  real e não é afetado pelo filtro de período — só pelos filtros de cliente/motorista/placa/rota.

## Como configurar o modo TV no Raspberry Pi

1. Copie a pasta inteira (`torre-otd`) para o Raspberry Pi, por exemplo em
   `/home/pi/torre-otd/`.
2. Instale o Chromium, se ainda não tiver:
   ```bash
   sudo apt update && sudo apt install -y chromium-browser unclutter
   ```
3. Configure o Chromium para abrir em modo kiosk apontando para o `tv.html` local. Crie/edite
   `~/.config/autostart/torre-tv.desktop`:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Torre TV
   Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito --disable-session-crashed-bubble "file:///home/pi/torre-otd/tv.html"
   X-GNOME-Autostart-enabled=true
   ```
   (em instalações mais novas o binário pode se chamar `chromium` em vez de `chromium-browser`.)
4. Opcional — esconder o cursor do mouse com `unclutter`, adicionando ao mesmo autostart:
   ```
   unclutter -idle 0.5 -root &
   ```
5. Reinicie o Raspberry Pi. O `tv.html` deve abrir em tela cheia sozinho.

O modo TV alterna automaticamente entre 5 telas a cada 1 minuto (barra de progresso laranja
embaixo indica o tempo até a próxima troca):

1. Visão Geral (KPIs + faturamento diário + status da frota)
2. Faturamento por Cliente e por Rota
3. Motoristas e Placas (ranking de mais/menos utilizados)
4. Painel Operacional em tempo real (cargas em trânsito / aguardando início)
5. Destaques do mês + Meta e Projeção de fechamento

A página inteira recarrega sozinha a cada 30 minutos para captar qualquer atualização do
`data.js` — não precisa reiniciar o Raspberry Pi para ver dados novos, só atualizar o
`data.js` na pasta.

## Definições usadas

- **Em trânsito**: viagem com `Dt. Carga (I)` preenchida e `Dt. Descarga (I)` em branco.
- **Aguardando início**: viagem sem `Dt. Carga (I)` preenchida (ainda não saiu).
- **Rota**: `Carregamento → Destino`.
- **Mês de referência** (usado nos filtros de período): mês da `Dt. Carga (I)`; quando a
  viagem ainda não iniciou, usa a `Dt. Carga Solicitação (I)` se existir.
- **Meta do mês**: editável manualmente; se nunca foi definida, o sistema sugere automaticamente
  5% acima do faturamento do mês anterior.
- **Projeção de fechamento**: (faturamento acumulado no mês ÷ dias já passados) × dias totais
  do mês.

## Próximas atualizações

Este é um primeiro modelo funcional pensado para já poder rodar no computador e no Raspberry Pi.
Fique à vontade para pedir ajustes de layout, novos indicadores, ou mudanças nas regras acima —
a estrutura foi feita para ser fácil de estender.
