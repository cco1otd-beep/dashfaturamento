/* ===========================================================================
   AGREGADOS REPOM - OTD LOGISTICS
   tv_repom.js - modo TV / kiosk DEDICADO da aba Agregados (tv_repom.html)

   Isolado da Torre de proposito: nao le operacao, nao le segmento e nao
   compartilha estado com o tv.js. Uma TV apontada aqui mostra SO contrato de
   agregado. Toda a regra de negocio vem do common.js (OTD.repom*), a mesma
   que a aba do dashboard usa - se o numero diverge, o bug e de layout.

   Parametros de URL:
     ?tela=saldo|pendencias|idade|repasse|margem|agregados|geral
                                   fixa UMA tela (TV dedicada a um assunto)
     ?slide=25                     segundos por tela (padrao 25)
     ?reload=10                    minutos ate recarregar sozinho (padrao 10)
     ?de=2026-01-01&ate=2026-08-20 recorte de periodo (padrao: base inteira)
     ?prop=NOME                    trava num proprietario
   =========================================================================== */
(function () {
  "use strict";

  const E = OTD.escapeHtml;
  const P = new URLSearchParams(location.search);

  const SLIDE_SECONDS = Number(P.get("slide")) || 45;
  const PAGE_SECONDS = 8;
  const RELOAD_MINUTES = Number(P.get("reload")) || 10;

  const charts = {};
  const HOJE = OTD.dayKey(new Date());

  /* ---------------------------------------------------------- recorte --- */
  const RF = { de: P.get("de") || null, ate: P.get("ate") || null };
  if (P.get("prop")) RF.props = new Set([P.get("prop")]);

  const ROWS = OTD.repomFiltrar(RF);
  const T = OTD.repomTotais(ROWS);
  const ABERTOS = ROWS.filter(function (r) { return r.aberto; });
  const PREV = OTD.repomPrevisao(ROWS);
  const VENCIDOS = PREV.filter(function (p) { return p.data < HOJE; });
  const FUTUROS = PREV.filter(function (p) { return p.data >= HOJE; });
  const VENC_VALOR = VENCIDOS.reduce(function (a, p) { return a + p.valor; }, 0);
  const VENC_QTD = VENCIDOS.reduce(function (a, p) { return a + p.qtd; }, 0);

  const POR_PROP = OTD.repomAgrupar(ROWS, "prop");
  const POR_MOT = OTD.repomAgrupar(ROWS, "motorista");
  const POR_ROTA = OTD.repomAgrupar(ROWS, "rota");

  /* pendencias = quem tem mais contrato parado, ordenado por valor */
  function pendencias(campo) {
    const m = new Map();
    ABERTOS.forEach(function (r) {
      const k = r[campo] || "—";
      let g = m.get(k);
      if (!g) { g = { chave: k, qtd: 0, valor: 0, semPrev: 0, maisVelho: 0 }; m.set(k, g); }
      g.qtd += 1;
      g.valor += r.saldo || 0;
      if (!r.dtPrev) g.semPrev += 1;
      const d = OTD.repomDiasEmAberto(r);
      if (d !== null && d > g.maisVelho) g.maisVelho = d;
    });
    return Array.from(m.values()).sort(function (a, b) { return b.valor - a.valor; });
  }
  const PEND_MOT = pendencias("motorista");
  const PEND_PROP = pendencias("prop");

  /* movimento (hoje/semana/mes) e insights: mesmas funcoes que a aba usa */
  const MOV = OTD.repomMovimento(ROWS, HOJE);
  const INSIGHTS = OTD.repomInsights(ROWS, HOJE);

  /* linhas da provisao de caixa: os proximos cortes + o que ja venceu */
  function provisaoHtml() {
    const linhas = [];
    if (VENC_QTD) {
      linhas.push({ rot: "Vencido", ds: VENC_QTD + " contratos atrasados",
                    valor: VENC_VALOR, cor: "#F1553F" });
    }
    FUTUROS.slice(0, 4).forEach(function (p, i) {
      linhas.push({ rot: OTD.fmtData(p.data).slice(0, 5),
                    ds: p.qtd + " contratos" + (i === 0 ? " · próximo corte" : ""),
                    valor: p.valor, cor: i === 0 ? "#F0800E" : "#4FA3E3" });
    });
    if (!linhas.length) {
      return '<div class="tv-atraso-vazio">✅ Nenhum saldo com previsão em aberto.</div>';
    }
    const total = linhas.reduce(function (a, l) { return a + l.valor; }, 0);
    linhas.push({ rot: "Total", ds: "a desembolsar nos cortes listados",
                  valor: total, cor: "#4ADE80", forte: true });
    return linhas.map(function (l) {
      return '<div class="tv-repom-linha' + (l.forte ? " total" : "") + '">' +
        '<div class="dias num" style="color:' + l.cor + ';font-size:26px">' +
        E(l.rot) + "</div>" +
        '<div class="meio"><div class="ds">' + E(l.ds) + "</div></div>" +
        '<div class="vl num" style="color:' + l.cor + '">' +
        OTD.fmtBRL(l.valor) + "</div></div>";
    }).join("");
  }

  /* ======================================================================= */
  /* PAGINACAO INTERNA DOS CARDS (troca a cada 8s)                           */
  /* ======================================================================= */
  let blocos = [];
  let paginaAtual = 0;

  function registraBloco(nPag, render) {
    blocos.push({ nPag: Math.max(1, nPag), render: render });
    render(0);
  }
  function avancaPaginas() {
    paginaAtual++;
    blocos.forEach(function (b) { b.render(paginaAtual % b.nPag); });
  }

  /* ======================================================================= */
  /* HELPERS                                                                 */
  /* ======================================================================= */
  function criar(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    charts[id] = new Chart(el, config);
  }

  function kpi(lbl, val, sub) {
    return '<div class="card"><div class="lbl">' + E(lbl) + "</div>" +
      '<div class="val num">' + val + "</div>" +
      '<div class="sub">' + (sub || "") + "</div></div>";
  }

  function painel(id, titulo, extra) {
    return '<div class="card panel"><div class="phead"><span class="ptitle">' + E(titulo) +
      "</span>" + (extra ? '<span class="pcount">' + E(extra) + "</span>" : "") +
      '</div><div class="chart-wrap"><canvas id="' + id + '"></canvas></div></div>';
  }

  function listaCard(id, titulo, contador) {
    return '<div class="card panel"><div class="phead"><span class="ptitle">' + E(titulo) +
      "</span>" + '<span class="pcount tv-pag" id="' + id + 'Pag">' +
      E(contador || "") + "</span></div>" +
      '<div class="tv-repom-lista" id="' + id + '"></div></div>';
  }

  function barrasTv(id, pares, cor, formato) {
    criar(id, {
      type: "bar",
      data: {
        labels: pares.map(function (p) { return OTD.shortName(p[0], 26); }),
        datasets: [{ data: pares.map(function (p) { return p[1]; }),
                     backgroundColor: cor, borderRadius: 6, maxBarThickness: 34 }]
      },
      options: {
        indexAxis: "y",
        layout: { padding: { right: 90, top: 6 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false },
                   valores: { formato: formato || "brl", fonte: 16 } },
        scales: {
          x: { ticks: { font: { size: 14 }, callback: function (v) { return OTD.fmtCompacto(v); } } },
          y: { ticks: { color: "#d8d4cc", font: { size: 15 }, autoSkip: false },
               grid: { display: false } }
        }
      }
    });
  }

  /* linha de pendencia: tempo parado em destaque, cor pela idade */
  function linhaPend(g) {
    const f = OTD.repomFaixaIdade(g.maisVelho) || { cor: "#ABA69C" };
    return '<div class="tv-repom-linha">' +
      '<div class="dias num" style="color:' + f.cor + '">' + OTD.fmtNum(g.maisVelho) +
      '<span class="un">d</span></div>' +
      '<div class="meio"><div class="nm">' + E(OTD.shortName(g.chave, 34)) + "</div>" +
      '<div class="ds">' + OTD.fmtNum(g.qtd) + " contrato" + (g.qtd === 1 ? "" : "s") +
      " parado" + (g.qtd === 1 ? "" : "s") +
      (g.semPrev ? " · " + OTD.fmtNum(g.semPrev) + " sem previsão" : "") + "</div></div>" +
      '<div class="vl num">' + OTD.fmtBRL(g.valor) + "</div></div>";
  }

  function linhaAgregado(g, i) {
    return '<div class="tv-repom-linha">' +
      '<div class="pos num">' + (i + 1) + "º</div>" +
      '<div class="meio"><div class="nm">' + E(OTD.shortName(g.chave, 34)) + "</div>" +
      '<div class="ds">' + OTD.fmtNum(g.cargas) + " cargas · ticket " +
      OTD.fmtBRL(g.ticket) + "</div></div>" +
      '<div class="vl num">' + OTD.fmtBRL(g.pago) + "</div></div>";
  }

  /* pagina uma lista de N em N dentro do card */
  function paginarLista(id, itens, porPagina, montaLinha, rotulo) {
    const nPag = Math.max(1, Math.ceil(itens.length / porPagina));
    registraBloco(nPag, function (p) {
      const el = document.getElementById(id);
      if (!el) return;
      const fatia = itens.slice(p * porPagina, p * porPagina + porPagina);
      el.innerHTML = fatia.length
        ? fatia.map(function (g, k) { return montaLinha(g, p * porPagina + k); }).join("")
        : '<div class="tv-atraso-vazio">✅ Nada em aberto aqui.</div>';
      const pag = document.getElementById(id + "Pag");
      if (pag) pag.textContent = (rotulo || "") +
        (nPag > 1 ? " · " + (p + 1) + "/" + nPag : "");
    });
  }

  /* ======================================================================= */
  /* TELAS                                                                   */
  /* ======================================================================= */
  const telas = [];

  /* --- 1. Visao geral do contrato --------------------------------------- */
  telas.push({
    id: "geral",
    titulo: "Visão Geral",
    html: function () {
      return '<div class="tv-kpi">' +
        kpi("Receita das cargas", OTD.fmtBRL(T.receita),
            "faturamento da Torre nas cargas do agregado") +
        kpi("Pago ao agregado", OTD.fmtBRL(T.pago),
            "repasse de " + OTD.fmtPct(T.repasse, 1)) +
        kpi("Margem", '<span style="color:#4ADE80">' + OTD.fmtBRL(T.margem) + "</span>",
            OTD.fmtPct(T.pctMargem, 1) + " da receita") +
        kpi("Contratos", OTD.fmtNum(T.cargas),
            "ticket médio " + OTD.fmtBRL(T.ticket)) +
        kpi("Saldo em aberto",
            '<span style="color:#F1553F">' + OTD.fmtBRL(T.saldo) + "</span>",
            OTD.fmtNum(T.abertos) + " contratos parados") +
        kpi("Saldo já pago", OTD.fmtPct(T.pctPago, 1),
            OTD.fmtNum(T.pagos) + " de " + OTD.fmtNum(T.cargas) + " contratos") +
        "</div>";
    }
  });

  /* --- 2. Movimento do dia/semana/mes + provisao dos cortes -------------- */
  /* O que a operacao pergunta primeiro: quanto saiu de adiantamento hoje,   */
  /* qual o ritmo do mes, e quanto precisa estar em caixa nos proximos       */
  /* cortes (10 / 20 / ultimo dia). Tudo em fonte grande, sem tabela.        */
  telas.push({
    id: "movimento",
    titulo: "Movimento & Provisão de Caixa",
    html: function () {
      function bloco(rot, m, cor, ds) {
        return '<div class="tv-repom-big ' + cor + '">' +
          '<div class="rot">' + E(rot) + "</div>" +
          '<div class="vl num">' + OTD.fmtBRL(m.adiant) + "</div>" +
          '<div class="ds">' + OTD.fmtNum(m.qtd) + " cartas frete · " +
          OTD.fmtBRL(m.pago) + " pagos" + (ds ? " · " + E(ds) : "") + "</div></div>";
      }
      return '<div class="tv-repom-destaques">' +
        bloco("Adiantamento de hoje", MOV.hoje, "laranja",
              OTD.fmtData(MOV.ref).slice(0, 5)) +
        bloco("Semana atual", MOV.semana, "azul",
              "desde " + OTD.fmtData(MOV.iniSemana).slice(0, 5)) +
        bloco("Mês atual", MOV.mes, "verde",
              "média " + OTD.fmtBRL(MOV.mediaDia) + "/dia") +
        "</div>" +
        '<div class="tv-2">' +
        painel("rvMovDia", "Adiantamento por dia (mês atual)",
               OTD.fmtNum(MOV.diasComMovimento) + " dias com movimento") +
        '<div class="card panel"><div class="phead">' +
        '<span class="ptitle">Provisão de caixa nos próximos cortes</span>' +
        '<span class="pcount">saldo a pagar</span></div>' +
        '<div class="tv-repom-lista">' + provisaoHtml() + "</div></div>" +
        "</div>";
    },
    after: function () {
      const dias = MOV.dias;
      criar("rvMovDia", {
        type: "bar",
        data: {
          labels: dias.map(function (d) { return OTD.fmtData(d.data).slice(0, 5); }),
          datasets: [
            { data: dias.map(function (d) { return d.adiant; }),
              backgroundColor: "#F0800E", borderRadius: 6, maxBarThickness: 46 },
            { type: "line", label: "média",
              data: dias.map(function () { return MOV.mediaDia; }),
              borderColor: "#4FA3E3", borderWidth: 3, borderDash: [8, 6],
              pointRadius: 0, fill: false }
          ]
        },
        options: {
          plugins: {
            legend: { display: false }, tooltip: { enabled: false },
            valores: { formato: "compacto", somenteDataset: 0, fonte: 15 }
          },
          scales: {
            x: { ticks: { color: "#d8d4cc", font: { size: 14 } }, grid: { display: false } },
            y: { ticks: { font: { size: 13 },
                 callback: function (v) { return OTD.fmtCompacto(v); } } }
          }
        }
      });
    }
  });

  /* --- 3. Saldo parado + calendario de cortes ---------------------------- */
  telas.push({
    id: "saldo",
    titulo: "Saldo Parado & Calendário de Cortes",
    html: function () {
      const prox = FUTUROS[0];
      const destaque =
        '<div class="tv-repom-destaques">' +
          '<div class="tv-repom-big vermelho">' +
            '<div class="rot">Saldo em aberto</div>' +
            '<div class="vl num">' + OTD.fmtBRL(T.saldo) + "</div>" +
            '<div class="ds">' + OTD.fmtNum(T.abertos) + " contratos" +
            (T.maisVelho !== null ? " · mais antigo há " + OTD.fmtNum(T.maisVelho) + " dias" : "") +
            "</div>" +
          "</div>" +
          (prox
            ? '<div class="tv-repom-big laranja">' +
              '<div class="rot">Próximo corte · ' + E(OTD.fmtData(prox.data)) + "</div>" +
              '<div class="vl num">' + OTD.fmtBRL(prox.valor) + "</div>" +
              '<div class="ds">' + OTD.fmtNum(prox.qtd) + " contratos</div></div>"
            : '<div class="tv-repom-big"><div class="rot">Próximo corte</div>' +
              '<div class="vl num">—</div><div class="ds">nada previsto</div></div>') +
          (VENC_QTD
            ? '<div class="tv-repom-big vermelho pulsa">' +
              '<div class="rot">Passou da data e não pagou</div>' +
              '<div class="vl num">' + OTD.fmtBRL(VENC_VALOR) + "</div>" +
              '<div class="ds">' + OTD.fmtNum(VENC_QTD) + " contratos · desde " +
              E(OTD.fmtData(VENCIDOS[0].data)) + "</div></div>"
            : '<div class="tv-repom-big verde"><div class="rot">Cortes vencidos</div>' +
              '<div class="vl num">R$ 0</div><div class="ds">nada atrasado</div></div>') +
        "</div>";
      return destaque + '<div class="tv-full">' +
        painel("rvCortes", "Previsão por data de corte",
               "vermelho = corte que já passou") + "</div>";
    },
    after: function () {
      criar("rvCortes", {
        type: "bar",
        data: {
          labels: PREV.map(function (p) { return OTD.fmtData(p.data).slice(0, 5); }),
          datasets: [{
            data: PREV.map(function (p) { return p.valor; }),
            backgroundColor: PREV.map(function (p) {
              return p.data < HOJE ? "#F1553F" : "#2DD4BF"; }),
            borderRadius: 6, maxBarThickness: 74
          }]
        },
        options: {
          layout: { padding: { top: 26 } },
          plugins: { legend: { display: false }, tooltip: { enabled: false },
                     valores: { formato: "brl", fonte: 17 } },
          scales: {
            x: { ticks: { color: "#d8d4cc", font: { size: 17 } }, grid: { display: false } },
            y: { ticks: { font: { size: 14 },
                 callback: function (v) { return OTD.fmtCompacto(v); } } }
          }
        }
      });
    }
  });

  /* --- 3. Pendencias por motorista e proprietario ------------------------ */
  telas.push({
    id: "pendencias",
    titulo: "Quem Tem Mais Contrato em Aberto",
    html: function () {
      return '<div class="tv-2">' +
        listaCard("rvPendMot", "Motoristas com contrato parado", "") +
        listaCard("rvPendProp", "Proprietários com contrato parado", "") +
        "</div>";
    },
    after: function () {
      paginarLista("rvPendMot", PEND_MOT, 9, linhaPend,
                   OTD.fmtNum(PEND_MOT.length) + " motoristas");
      paginarLista("rvPendProp", PEND_PROP, 9, linhaPend,
                   OTD.fmtNum(PEND_PROP.length) + " proprietários");
    }
  });

  /* --- 4. Gargalo da quitacao (idade do contrato) ------------------------ */
  telas.push({
    id: "idade",
    titulo: "Gargalo da Quitação",
    html: function () {
      const faixas = OTD.repomIdade(ROWS);
      const legenda = faixas.map(function (f) {
        return '<div class="row"><span class="dot" style="background:' + f.cor + '"></span>' +
          '<span class="nm">' + E(f.rot) + "</span>" +
          '<span class="vl num">' + OTD.fmtBRL(f.valor) + "</span>" +
          '<span class="pc num">' + OTD.fmtNum(f.qtd) + "</span></div>";
      }).join("");
      return '<div class="tv-2">' +
        painel("rvIdade", "Saldo parado por idade do contrato", "contada da emissão") +
        '<div class="card panel"><div class="phead"><span class="ptitle">Faixas</span>' +
        '<span class="pcount">valor · contratos</span></div>' +
        '<div class="tv-legend">' + legenda + "</div></div>" +
        "</div>";
    },
    after: function () {
      const faixas = OTD.repomIdade(ROWS);
      criar("rvIdade", {
        type: "bar",
        data: {
          labels: faixas.map(function (f) { return f.rot; }),
          datasets: [{ data: faixas.map(function (f) { return f.valor; }),
                       backgroundColor: faixas.map(function (f) { return f.cor; }),
                       borderRadius: 6, maxBarThickness: 78 }]
        },
        options: {
          layout: { padding: { top: 26 } },
          plugins: { legend: { display: false }, tooltip: { enabled: false },
                     valores: { formato: "brl", fonte: 17 } },
          scales: {
            x: { ticks: { color: "#d8d4cc", font: { size: 15 } }, grid: { display: false } },
            y: { ticks: { font: { size: 14 },
                 callback: function (v) { return OTD.fmtCompacto(v); } } }
          }
        }
      });
    }
  });

  /* --- 5. Repasse ao agregado x faturamento da Torre --------------------- */
  telas.push({
    id: "repasse",
    titulo: "Repasse ao Agregado x Faturamento",
    html: function () {
      return '<div class="tv-repom-destaques">' +
        '<div class="tv-repom-big"><div class="rot">Receita das cargas</div>' +
        '<div class="vl num">' + OTD.fmtBRL(T.receita) + "</div>" +
        '<div class="ds">faturamento da Torre (CT-e/CRT + Ponta Grossa R8)</div></div>' +
        '<div class="tv-repom-big azul"><div class="rot">Pago ao agregado</div>' +
        '<div class="vl num">' + OTD.fmtBRL(T.pago) + "</div>" +
        '<div class="ds">repasse de ' + OTD.fmtPct(T.repasse, 1) + " da receita</div></div>" +
        '<div class="tv-repom-big verde"><div class="rot">Margem</div>' +
        '<div class="vl num">' + OTD.fmtBRL(T.margem) + "</div>" +
        '<div class="ds">' + OTD.fmtPct(T.pctMargem, 1) + " da receita</div></div>" +
        "</div>" +
        '<div class="tv-full">' +
        painel("rvRepasse", "Receita x pago, por rota", "as 7 maiores") + "</div>";
    },
    after: function () {
      const top = POR_ROTA.slice(0, 7);
      criar("rvRepasse", {
        type: "bar",
        data: {
          labels: top.map(function (g) { return OTD.shortName(g.chave, 30); }),
          datasets: [
            { label: "Receita da carga", data: top.map(function (g) { return g.receita; }),
              backgroundColor: "#F0800E", borderRadius: 5, maxBarThickness: 26 },
            { label: "Pago ao agregado", data: top.map(function (g) { return g.pago; }),
              backgroundColor: "#4FA3E3", borderRadius: 5, maxBarThickness: 26 }
          ]
        },
        options: {
          indexAxis: "y",
          layout: { padding: { right: 96 } },
          plugins: {
            legend: { labels: { color: "#ABA69C", font: { size: 16 }, boxWidth: 16 } },
            tooltip: { enabled: false },
            valores: { formato: "compacto", fonte: 14 }
          },
          scales: {
            x: { ticks: { font: { size: 14 },
                 callback: function (v) { return OTD.fmtCompacto(v); } } },
            y: { ticks: { color: "#d8d4cc", font: { size: 15 }, autoSkip: false },
                 grid: { display: false } }
          }
        }
      });
    }
  });

  /* --- 6. Margem: frete x valor pago ------------------------------------- */
  telas.push({
    id: "margem",
    titulo: "Margem — Frete x Valor Pago",
    html: function () {
      return '<div class="tv-2">' +
        painel("rvMargem", "Margem por rota", "R$ no período") +
        painel("rvMargemPct", "% de margem por rota", "quanto sobra do frete") +
        "</div>";
    },
    after: function () {
      const top = POR_ROTA.filter(function (g) { return g.receita > 0; }).slice(0, 8);
      barrasTv("rvMargem", top.map(function (g) { return [g.chave, g.margem]; }),
               "#4ADE80", "brl");
      const porPct = top.slice().sort(function (a, b) { return b.pctMargem - a.pctMargem; });
      criar("rvMargemPct", {
        type: "bar",
        data: {
          labels: porPct.map(function (g) { return OTD.shortName(g.chave, 26); }),
          datasets: [{ data: porPct.map(function (g) { return g.pctMargem; }),
                       backgroundColor: porPct.map(function (g) {
                         return g.pctMargem >= 35 ? "#4ADE80"
                              : (g.pctMargem >= 15 ? "#FFC145" : "#F1553F"); }),
                       borderRadius: 6, maxBarThickness: 34 }]
        },
        options: {
          indexAxis: "y",
          layout: { padding: { right: 82 } },
          plugins: { legend: { display: false }, tooltip: { enabled: false },
                     valores: { formato: "pct", fonte: 16 } },
          scales: {
            x: { ticks: { font: { size: 14 },
                 callback: function (v) { return OTD.fmtPct(v, 0); } } },
            y: { ticks: { color: "#d8d4cc", font: { size: 15 }, autoSkip: false },
                 grid: { display: false } }
          }
        }
      });
    }
  });

  /* --- 7. Faturamento Repom por agregado -------------------------------- */
  telas.push({
    id: "agregados",
    titulo: "Faturamento por Agregado",
    html: function () {
      return '<div class="tv-2">' +
        listaCard("rvProp", "Proprietários — pago, cargas e ticket", "") +
        listaCard("rvMot", "Motoristas — pago, cargas e ticket", "") +
        "</div>";
    },
    after: function () {
      paginarLista("rvProp", POR_PROP, 9, linhaAgregado,
                   OTD.fmtNum(POR_PROP.length) + " proprietários");
      paginarLista("rvMot", POR_MOT, 9, linhaAgregado,
                   OTD.fmtNum(POR_MOT.length) + " motoristas");
    }
  });

  const ICONE_SEV = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };

  /* --- 8. Alertas & Insights automaticos --------------------------------- */
  /* Leituras deterministicas do OTD.repomInsights - cada card traz o numero */
  /* que gerou a leitura. Sempre 4 por pagina, para nao abrir buraco na tela.*/
  telas.push({
    id: "insights",
    titulo: "Alertas & Insights",
    html: function () {
      /* .tv-full da a altura: sem ele o card encolhe para o conteudo */
      return '<div class="tv-full"><div class="card panel"><div class="phead">' +
        '<span class="ptitle">Leitura automática dos contratos de agregado</span>' +
        '<span class="pcount tv-pag" id="rvInsPag"></span></div>' +
        '<div class="tv-repom-insights" id="rvIns"></div></div></div>';
    },
    after: function () {
      const POR_PAG = 4;
      /* completa a ultima pagina dando a volta na lista: pagina cheia sempre */
      const lista = INSIGHTS.slice();
      const nPag = Math.max(1, Math.ceil(lista.length / POR_PAG));
      registraBloco(nPag, function (p) {
        const el = document.getElementById("rvIns");
        if (!el) return;
        const fatia = [];
        for (let k = 0; k < POR_PAG; k++) {
          if (!lista.length) break;
          fatia.push(lista[(p * POR_PAG + k) % lista.length]);
        }
        el.innerHTML = fatia.map(function (n) {
          return '<div class="tv-repom-ins ' + n.sev + '">' +
            '<div class="ic">' + ICONE_SEV[n.sev] + "</div>" +
            '<div class="txt"><div class="tt">' + E(n.titulo) + "</div>" +
            '<div class="ds">' + E(n.texto) + "</div></div>" +
            '<div class="vl num">' + E(n.valor) + "</div></div>";
        }).join("");
        const pag = document.getElementById("rvInsPag");
        if (pag) {
          pag.textContent = OTD.fmtNum(INSIGHTS.length) + " leituras" +
            (nPag > 1 ? " · " + (p + 1) + "/" + nPag : "");
        }
      });
    }
  });

  /* --------------------------------------------------------------- loop -- */
  const fixa = (P.get("tela") || "").toLowerCase();
  const SLIDES = fixa
    ? telas.filter(function (t) { return t.id === fixa; })
    : telas;
  const LOOP = SLIDES.length ? SLIDES : telas;

  let atual = 0;

  function montar() {
    document.getElementById("tvSlides").innerHTML = LOOP.map(function (t, i) {
      return '<div class="tv-slide" data-i="' + i + '"></div>';
    }).join("");
    document.getElementById("tvDots").innerHTML =
      LOOP.map(function () { return "<i></i>"; }).join("");
  }

  function mostrar(i) {
    atual = ((i % LOOP.length) + LOOP.length) % LOOP.length;
    blocos = [];
    paginaAtual = 0;

    const slides = document.querySelectorAll(".tv-slide");
    const t = LOOP[atual];
    slides[atual].innerHTML = t.html();
    slides.forEach(function (s, k) { s.classList.toggle("on", k === atual); });
    document.querySelectorAll("#tvDots i").forEach(function (d, k) {
      d.classList.toggle("on", k === atual);
    });

    if (t.after) { try { t.after(); } catch (e) { console.error(e); } }

    const r = OTD.REPOM.resumo || {};
    const periodo = (RF.de || RF.ate)
      ? (RF.de ? OTD.fmtData(RF.de) : "início") + " a " + (RF.ate ? OTD.fmtData(RF.ate) : "hoje")
      : (r.periodo && r.periodo[0]
          ? OTD.fmtData(r.periodo[0]) + " a " + OTD.fmtData(r.periodo[1]) : "base completa");
    document.getElementById("tvSub").textContent = t.titulo + " · " + periodo;

    /* selo permanente: o que esta parado e vencido e o alerta desta TV */
    const selo = document.getElementById("tvSelo");
    if (selo) {
      selo.innerHTML = VENC_QTD
        ? '<span class="live-tag" style="font-size:13px">⚠ ' + OTD.fmtNum(VENC_QTD) +
          " vencidos · " + OTD.fmtBRL(VENC_VALOR) + "</span>"
        : '<span class="badge b-green" style="font-size:13px">nenhum corte vencido</span>';
    }
    resetBarra();
  }

  function resetBarra() {
    const bar = document.getElementById("tvBar");
    bar.style.transition = "none";
    bar.style.width = "0%";
    void bar.offsetWidth;
    bar.style.transition = "width " + SLIDE_SECONDS + "s linear";
    bar.style.width = "100%";
  }

  function tickRelogio() {
    const d = new Date();
    document.getElementById("tvRelogio").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    document.getElementById("tvData").textContent =
      OTD.DIAS_PT_FULL[d.getDay()] + ", " + d.getDate() + " de " + OTD.MESES_PT_FULL[d.getMonth()];
  }

  function semDados() {
    document.getElementById("tvSlides").innerHTML =
      '<div class="tv-slide on"><div class="tv-full"><div class="card">' +
      '<div class="tv-atraso-vazio">Nenhum contrato de agregado no data.js.<br>' +
      "Guarde o export <b>lrepom</b> na pasta datada das bases e rode o pipeline." +
      "</div></div></div></div>";
    document.getElementById("tvSub").textContent = "sem base";
  }

  function boot() {
    OTD.setupChart();
    document.getElementById("tvBase").textContent =
      "Base: " + OTD.fmtDataHora(OTD.META.geradoEm);
    tickRelogio();
    setInterval(tickRelogio, 1000);

    if (!ROWS.length) { semDados(); return; }

    montar();
    mostrar(0);

    /* com ?tela= a TV fica fixa num assunto so: nao roda o loop */
    if (LOOP.length > 1) {
      setInterval(function () { mostrar(atual + 1); }, SLIDE_SECONDS * 1000);
    } else {
      const bar = document.getElementById("tvBar");
      if (bar) bar.style.display = "none";
    }
    /* setInterval SEPARADO do timer de slide: pagina as listas a cada 5s */
    setInterval(avancaPaginas, PAGE_SECONDS * 1000);

    setTimeout(function () {
      const base = location.search.replace(/([?&])_=\d+&?/, "$1").replace(/[?&]$/, "");
      location.href = location.pathname + base + (base ? "&" : "?") + "_=" + Date.now();
    }, RELOAD_MINUTES * 60 * 1000);

    window.OTD_TV = { mostrar: mostrar, telas: LOOP, total: LOOP.length,
                      paginar: avancaPaginas, op: "repom" };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
