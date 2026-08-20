/* ===========================================================================
   TORRE DE CONTROLE LOGISTICA - OTD LOGISTICS
   tv.js - modo TV / kiosk (tv.html)

   - Cards proprios (nao e "print" do dashboard): tipografia grande, uma ideia
     por tela, nada de tabela densa.
   - Tela troca a cada 20s. Cards com muita informacao paginam a cada 5s.
   - Card de ATENCAO destacado: so severidade critica.
   - Travado no MES ATUAL, sem interacao, loop infinito.

   Parametros de URL:
     ?op=geral|pranchas|bens|latas   visao macro por operacao
     ?seg=LATAS,BENS DE CONSUMO      filtro livre por segmento
     ?titulo=Nome do telao           rotulo no cabecalho
     ?slide=5                        acelera as telas (homologacao)
   =========================================================================== */
(function () {
  "use strict";

  const E = OTD.escapeHtml;
  const P = new URLSearchParams(location.search);

  const SLIDE_SECONDS = Number(P.get("slide")) || 20;
  const PAGE_SECONDS = 5;
  const RELOAD_MINUTES = 10;

  const charts = {};

  /* ======================================================================= */
  /* OPERACOES (visao macro)                                                 */
  /* ======================================================================= */
  const OPERACOES = {
    geral: { nome: "Operação Geral", segs: null, grupos: null, icone: "🏭" },
    pranchas: {
      nome: "Pranchas & Rodando", icone: "🚜",
      segs: ["PRANCHA", "AUTOPROPULSOR"], grupos: ["PRANCHA", "RODANDO"]
    },
    bens: {
      nome: "Bens de Consumo", icone: "📦",
      segs: ["BENS DE CONSUMO"], grupos: ["BENS DE CO"]
    },
    latas: {
      nome: "Latas", icone: "🥫",
      segs: ["LATAS"], grupos: ["LATAS"]
    }
  };

  const opKey = (P.get("op") || "geral").toLowerCase();
  const OP = OPERACOES[opKey] || OPERACOES.geral;
  const MACRO = opKey !== "geral";

  const MES = (function () {
    const meses = OTD.availableMonths();
    const atual = OTD.nowKey();
    return meses.indexOf(atual) >= 0 ? atual : meses[meses.length - 1];
  })();

  /* filtro: prioridade para ?op=, senao ?seg= livre */
  const filtroUrl = OTD.filtroDaUrl();
  const F = { meses: new Set([MES]) };
  if (OP.segs) F.segs = new Set(OP.segs);
  else if (filtroUrl.segs) F.segs = filtroUrl.segs;
  if (OP.grupos) F.grupos = new Set(OP.grupos);

  /* Para o faturamento o filtro por grupo atrapalha (documento sem viagem
     vinculada nao tem grupo), entao filtramos so por segmento. */
  const F_FAT = { meses: F.meses, segs: F.segs };
  const ROWS = OTD.filterAll(F_FAT);
  const OPS = OTD.operational(F.grupos ? { grupos: F.grupos } : {});
  const CONT = OTD.contadorCargas(F.grupos ? { grupos: F.grupos } : {});
  const INSIGHTS = OTD.gerarInsights(ROWS, {
    mes: MES,
    metaVeiculo: Number(OTD.META.metaVeiculoMes) || 60000,
    filtro: F.grupos ? { grupos: F.grupos } : {},
    gruposOms: OP.grupos || null,
    segs: OP.segs || null
  });
  const CRITICOS = INSIGHTS.filter(function (i) { return i.nivel === "critico"; });

  const NOME_GRUPO = { "BENS DE CO": "Bens de Consumo", "LATAS": "Latas" };

  const TITULO = P.get("titulo") || OP.nome;

  /* ======================================================================= */
  /* CARDS DE PREENCHIMENTO                                                  */
  /* Telao com 1 alerta so deixa dois buracos na tela. Em vez de esticar o   */
  /* card, completamos a pagina com leituras REAIS do mes (nada inventado:   */
  /* sao os mesmos numeros das outras telas, so que em formato de card).     */
  /* ======================================================================= */
  const COMPLEMENTOS = (function () {
    const out = [];
    function add(nivel, icone, titulo, valor, texto) {
      if (valor === null || valor === undefined || valor === "") return;
      out.push({ nivel: nivel, icone: icone, titulo: titulo, valor: valor,
                 texto: texto, preenchimento: true });
    }
    const total = OTD.totalFaturamento(ROWS);
    const viagens = OTD.contarViagens(ROWS);
    const km = OTD.totalKm(ROWS);
    const p = OTD.projectMonth(ROWS, MES);
    const serie = OTD.dailySeries(ROWS, MES);

    function top1(chave) {
      const t = OTD.topN(OTD.sumBy(ROWS, chave), 1);
      return t.length && t[0][0] !== "—" ? t[0] : null;
    }
    const cli = top1(function (r) { return r.cliente; });
    const rot = top1(function (r) { return r.rota; });
    const mot = top1(function (r) { return r.motorista; });
    const pla = top1(function (r) { return r.placa; });

    if (cli) add("info", "🏆", "Maior cliente do mês", OTD.fmtBRL(cli[1]),
      OTD.shortName(cli[0], 34) + " — " + OTD.fmtPct(total ? 100 * cli[1] / total : 0, 1) +
      " do faturamento de " + OTD.monthLabelFull(MES) + ".");
    if (rot) add("info", "🛣️", "Rota mais faturada", OTD.fmtBRL(rot[1]),
      OTD.shortName(rot[0], 40) + " — " + OTD.fmtPct(total ? 100 * rot[1] / total : 0, 1) +
      " do total do mês.");
    if (mot) add("info", "👤", "Motorista destaque", OTD.fmtBRL(mot[1]),
      OTD.shortName(mot[0], 34) + " lidera o faturamento no período.");
    if (pla) add("info", "🚚", "Placa destaque", OTD.fmtBRL(pla[1]),
      "Placa " + pla[0] + " é a de maior receita no mês.");

    add("info", "💰", "Ticket médio por viagem", OTD.fmtBRL(viagens ? total / viagens : 0),
      OTD.fmtNum(viagens) + " viagens e " + OTD.fmtNum(ROWS.length) + " documentos em " +
      OTD.monthLabelFull(MES) + ".");
    add("info", "📈", "Projeção de fechamento", OTD.fmtBRL(p.projected),
      "Ritmo de " + OTD.fmtBRL(p.dailyAvg) + "/dia · apuração no dia " + p.elapsed +
      " de " + p.totalDays + ".");
    if (km) add("info", "📏", "R$ por KM rodado", OTD.fmtBRLcents(total / km),
      OTD.fmtKm(km) + " no mês, sendo " +
      OTD.fmtPct(100 * OTD.totalKmVazio(ROWS) / km, 1) + " em vazio (regra R12).");

    const melhorDia = serie.reduce(function (a, v, i) {
      return v > a[1] ? [i + 1, v] : a;
    }, [0, 0]);
    if (melhorDia[0]) add("positivo", "⭐", "Melhor dia do mês", OTD.fmtBRL(melhorDia[1]),
      "Dia " + melhorDia[0] + " foi o pico de faturamento até agora.");

    const emAberto = (CONT.emTransito || 0) + (CONT.aguardando || 0) +
                     (CONT.emViagem || 0) + (CONT.destinado || 0) + (CONT.emDescarga || 0);
    add("info", "🚦", "Cargas em aberto agora", OTD.fmtNum(emAberto),
      OTD.fmtNum(CONT.emTransito || 0) + " em trânsito · " +
      OTD.fmtNum(CONT.emDescarga || 0) + " em descarga · " +
      OTD.fmtNum(CONT.aguardando || 0) + " aguardando início.");
    add("positivo", "✅", "Finalizadas no dia", OTD.fmtNum(CONT.finalizadasDia || 0),
      "Descargas concluídas em " + OTD.fmtData(CONT.dia) + ".");

    add("info", "👥", "Base ativa no mês", OTD.fmtNum(OTD.distinctClientes(ROWS)) + " clientes",
      OTD.fmtNum(OTD.distinctPlacas(ROWS)) + " placas, " +
      OTD.fmtNum(OTD.distinctMotoristas(ROWS)) + " motoristas e " +
      OTD.fmtNum(OTD.distinctRotas(ROWS)) + " rotas movimentadas.");
    return out;
  })();

  /* Completa a lista ate fechar paginas inteiras de `n`, puxando primeiro os
     itens de reserva (alertas de menor severidade) e depois os complementos.
     Nunca repete um item: se acabar o material, a ultima pagina fica menor. */
  function completaPagina(base, reserva, n) {
    const out = base.slice();
    const fila = (reserva || []).concat(COMPLEMENTOS);
    for (let i = 0; i < fila.length; i++) {
      if (out.length >= n && out.length % n === 0) break;
      if (out.indexOf(fila[i]) < 0) out.push(fila[i]);
    }
    return out;
  }

  /* ======================================================================= */
  /* PAGINACAO INTERNA DOS CARDS (troca a cada 5s)                           */
  /* ======================================================================= */
  let blocos = [];        /* {render(pagina), nPag} do slide ativo */
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
  /* HELPERS DE CARD                                                         */
  /* ======================================================================= */
  function criar(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    charts[id] = new Chart(el, config);
  }

  function barrasTv(id, pares, cor, formato) {
    criar(id, {
      type: "bar",
      data: {
        labels: pares.map(function (p) { return OTD.shortName(p[0], 26); }),
        datasets: [{ data: pares.map(function (p) { return p[1]; }), backgroundColor: cor,
                     borderRadius: 6, maxBarThickness: 34 }]
      },
      options: {
        indexAxis: "y",
        layout: { padding: { right: 78, top: 6 } },
        plugins: {
          legend: { display: false }, tooltip: { enabled: false },
          valores: { formato: formato || "brl", fonte: 16 }
        },
        scales: {
          x: { ticks: { font: { size: 14 }, callback: function (v) { return OTD.fmtCompacto(v); } } },
          /* autoSkip:false garante os itens completos (13.3) */
          y: { ticks: { color: "#d8d4cc", font: { size: 15 }, autoSkip: false }, grid: { display: false } }
        }
      }
    });
  }

  function gaugeTv(id, pct) {
    const v = Math.max(0, Math.min(100, pct || 0));
    criar(id, {
      type: "doughnut",
      data: { labels: ["", ""], datasets: [{ data: [v, 100 - v],
              backgroundColor: [pct >= 100 ? "#4ADE80" : "#F0800E", "#221e19"],
              borderWidth: 0, cutout: "76%" }] },
      options: { rotation: -90, circumference: 180, layout: { padding: 0 },
                 plugins: { legend: { display: false }, tooltip: { enabled: false }, valores: false } }
    });
  }

  function cardKpiTv(lbl, val, sub) {
    return '<div class="card"><div class="lbl">' + E(lbl) + "</div>" +
      '<div class="val num">' + val + "</div>" +
      '<div class="sub">' + E(sub || "") + "</div></div>";
  }

  function cardAlerta(i, pulsa) {
    return '<div class="tv-alerta ' + (i.nivel === "critico" ? "" : "atencao") +
      (pulsa ? " pulsa" : "") + '">' +
      '<div class="ic">' + i.icone + "</div><div class='txt'>" +
      '<div class="tit">' + E(i.titulo) + "</div>" +
      '<div class="vl">' + E(i.valor) + "</div>" +
      '<div class="ds">' + E(i.texto) + "</div></div></div>";
  }

  function cardInsightTv(i) {
    return '<div class="tv-insight ' + i.nivel + '"><div class="ic">' + i.icone + "</div>" +
      "<div class='txt'><div class='tit'>" + E(i.titulo) + "</div>" +
      "<div class='vl'>" + E(i.valor) + "</div>" +
      "<div class='ds'>" + E(i.texto) + "</div></div></div>";
  }

  /* ======================================================================= */
  /* TELAS                                                                   */
  /* ======================================================================= */
  const telas = [];

  /* --- 1. Visao Geral ---------------------------------------------------- */
  telas.push({
    titulo: "Visão Geral",
    html: function () {
      const total = OTD.totalFaturamento(ROWS);
      const viagens = OTD.contarViagens(ROWS);
      const km = OTD.totalKm(ROWS);
      const p = OTD.projectMonth(ROWS, MES);
      return '<div class="tv-kpi">' +
        cardKpiTv("Faturamento do Mês", OTD.fmtBRL(total), OTD.monthLabelFull(MES)) +
        cardKpiTv("Viagens", OTD.fmtNum(viagens), ROWS.length + " documentos") +
        cardKpiTv("Ticket Médio", OTD.fmtBRL(viagens ? total / viagens : 0), "por viagem") +
        cardKpiTv("Projeção do Mês", OTD.fmtBRL(p.projected),
                  "ritmo de " + OTD.fmtBRL(p.dailyAvg) + "/dia") +
        cardKpiTv("KM Rodado", OTD.fmtKm(km),
                  OTD.fmtPct(km ? 100 * OTD.totalKmVazio(ROWS) / km : 0, 1) + " vazio") +
        cardKpiTv("R$ / KM", km ? OTD.fmtBRLcents(total / km) : "—", "regra R12") +
        "</div>";
    }
  });

  /* --- 2. Contador de Cargas --------------------------------------------- */
  telas.push({
    titulo: "Contador de Cargas",
    html: function () {
      function c(ic, cor, n, t, d) {
        return '<div class="card"><div class="ic">' + ic + "</div>" +
          '<div class="n num" style="color:' + cor + '">' + OTD.fmtNum(n) + "</div>" +
          '<div class="t">' + E(t) + "</div><div class='d'>" + E(d) + "</div></div>";
      }
      return '<div class="tv-contador">' +
        c("🚚", "#F0800E", CONT.emTransito, "Em trânsito", "carga iniciada, sem descarga") +
        c("⏳", "#FFC145", CONT.aguardando, "Aguardando início", "romaneio aberto") +
        c("🛣️", "#4FA3E3", CONT.emViagem, "Em viagem", "com documento emitido") +
        c("📌", "#B18CFF", CONT.destinado, "Destinado", "veículo destinado, sem doc") +
        c("📦", "#2DD4BF", CONT.emDescarga, "Em descarga", "chegou, descarregando") +
        c("✅", "#4ADE80", CONT.finalizadasDia, "Finalizadas no dia", OTD.fmtData(CONT.dia)) +
        "</div>";
    }
  });

  /* --- 3. Pontos Criticos (destaque) ------------------------------------- */
  telas.push({
    titulo: "Pontos de Atenção",
    html: function () {
      if (!CRITICOS.length) {
        return '<div class="card tv-full" style="flex-direction:column">' +
          '<div class="tv-ok"><div class="ic">🟢</div>' +
          '<div class="tt">Nenhum ponto crítico agora</div>' +
          '<div class="ds">OTP, OTD, KM vazio e emissão dentro dos limites em ' +
          E(TITULO) + ".</div></div></div>";
      }
      return '<div id="tvCriticos" style="display:flex;flex-direction:column;gap:18px;' +
        'height:100%;justify-content:center"></div>' +
        '<div class="tv-pag" id="tvCriticosPag" style="text-align:center"></div>';
    },
    after: function () {
      if (!CRITICOS.length) return;
      const box = document.getElementById("tvCriticos");
      const pag = document.getElementById("tvCriticosPag");
      const porPagina = 3;
      /* sempre 3 por pagina: completa com os alertas de menor severidade e,
         se ainda faltar, com leituras do mes — nunca deixa buraco na tela */
      const reserva = INSIGHTS.filter(function (i) { return i.nivel !== "critico"; });
      const LISTA = completaPagina(CRITICOS, reserva, porPagina);
      const nPag = Math.max(1, Math.ceil(LISTA.length / porPagina));
      registraBloco(nPag, function (p) {
        const fatia = LISTA.slice(p * porPagina, p * porPagina + porPagina);
        box.innerHTML = fatia.map(function (i) {
          return i.nivel === "critico" ? cardAlerta(i, true) : cardInsightTv(i);
        }).join("");
        pag.textContent = (nPag > 1 ? "página " + (p + 1) + " de " + nPag + " · " : "") +
          CRITICOS.length + (CRITICOS.length === 1 ? " ponto crítico" : " pontos críticos") +
          (LISTA.length > CRITICOS.length
            ? " · demais cards: acompanhamento do mês" : "");
      });
    }
  });

  /* --- 4. Faturamento Diario --------------------------------------------- */
  telas.push({
    titulo: "Faturamento Diário",
    html: function () {
      const p = OTD.projectMonth(ROWS, MES);
      const hoje = new Date();
      const serie = OTD.dailySeries(ROWS, MES);
      const diaHoje = (OTD.monthKey(hoje) === MES) ? hoje.getDate() : 0;
      const vHoje = diaHoje ? serie[diaHoje - 1] : 0;
      return '<div class="tv-full"><div class="card panel">' +
        '<div class="phead"><span class="ptitle">Faturamento Diário · ' +
        E(OTD.monthLabelFull(MES)) + "</span>" +
        '<span class="pcount" style="font-size:19px;color:#FFC145">Hoje: ' + OTD.fmtBRL(vHoje) +
        ' &nbsp;·&nbsp; <span style="color:#ABA69C">Mês: ' + OTD.fmtBRL(p.total) + "</span></span></div>" +
        '<div class="chart-wrap"><canvas id="tvDiario"></canvas></div></div></div>';
    },
    after: function () {
      const serie = OTD.dailySeries(ROWS, MES);
      const hoje = new Date();
      /* data LOCAL, nunca toISOString (13.2) */
      const todayIndex = (OTD.monthKey(hoje) === MES) ? hoje.getDate() - 1 : -1;
      const barras = serie.map(function (v, i) {
        return (todayIndex >= 0 && i > todayIndex) ? null : v;
      });
      /* media dos dias JA APURADOS com movimento (dia zerado nao entra na
         conta, senao fim de semana derruba a media e a linha perde sentido) */
      const comMovimento = barras.filter(function (v) { return v !== null && v > 0; });
      const media = comMovimento.length
        ? comMovimento.reduce(function (a, b) { return a + b; }, 0) / comMovimento.length
        : 0;
      criar("tvDiario", {
        type: "bar",
        data: {
          labels: serie.map(function (_, i) { return String(i + 1); }),
          datasets: [{
            data: barras,
            backgroundColor: serie.map(function (_, i) {
              return i === todayIndex ? "#FFC145" : "rgba(240,128,14,.85)";
            }),
            borderRadius: 5, maxBarThickness: 34, order: 2
          }, {
            /* linha da media — referencia visual de ritmo do mes */
            label: "Média dos dias com movimento: " + OTD.fmtBRL(media),
            type: "line",
            data: barras.map(function (v) { return v === null ? null : media; }),
            borderColor: "#4FA3E3", borderWidth: 3, borderDash: [9, 6],
            pointRadius: 0, tension: 0, fill: false, spanGaps: false, order: 1
          }]
        },
        options: {
          layout: { padding: { top: 34 } },
          plugins: {
            legend: {
              display: true, position: "top", align: "end",
              labels: { filter: function (l) { return l.datasetIndex === 1; },
                        font: { size: 15 }, boxWidth: 26, color: "#ABA69C" }
            },
            tooltip: { enabled: false },
            /* rotulos so nas barras: a linha e uma referencia, o valor dela
               vai escrito na legenda/subtitulo e nao em cada ponto */
            valores: { formato: "compacto", fonte: 12, somenteDataset: 0 }
          },
          scales: {
            y: { ticks: { font: { size: 15 }, callback: function (v) { return OTD.fmtCompacto(v); } } },
            x: { grid: { display: false }, ticks: { font: { size: 14 }, autoSkip: false } }
          }
        }
      });
    }
  });

  /* --- 5. Clientes & Rotas ----------------------------------------------- */
  telas.push({
    titulo: "Clientes & Rotas",
    html: function () {
      return '<div class="tv-2">' +
        '<div class="card panel"><div class="phead"><span class="ptitle">Top Clientes</span>' +
        '<span class="pcount tv-pag" id="pagCli"></span></div>' +
        '<div class="chart-wrap"><canvas id="tvCliente"></canvas></div></div>' +
        '<div class="card panel"><div class="phead"><span class="ptitle">Top Rotas</span>' +
        '<span class="pcount tv-pag" id="pagRot"></span></div>' +
        '<div class="chart-wrap"><canvas id="tvRotas"></canvas></div></div></div>';
    },
    after: function () {
      const cli = OTD.topN(OTD.sumBy(ROWS, function (r) { return r.cliente; }), 40);
      const rot = OTD.topN(OTD.sumBy(ROWS, function (r) { return r.rota; }), 40);
      const porPagina = 6;
      function bloco(dados, canvas, cor, elPag, rotulo) {
        const nPag = Math.max(1, Math.ceil(Math.min(dados.length, 24) / porPagina));
        registraBloco(nPag, function (p) {
          const fatia = dados.slice(p * porPagina, p * porPagina + porPagina);
          barrasTv(canvas, fatia, cor);
          const el = document.getElementById(elPag);
          if (el) el.textContent = rotulo + " " + (p * porPagina + 1) + "–" +
            (p * porPagina + fatia.length) + " de " + Math.min(dados.length, 24);
        });
      }
      bloco(cli, "tvCliente", "rgba(240,128,14,.85)", "pagCli", "clientes");
      bloco(rot, "tvRotas", "rgba(45,212,191,.85)", "pagRot", "rotas");
    }
  });

  /* --- 6. Motoristas & Placas -------------------------------------------- */
  telas.push({
    titulo: "Motoristas & Placas",
    html: function () {
      return '<div class="tv-2">' +
        '<div class="card panel"><div class="phead"><span class="ptitle">Top Motoristas</span>' +
        '<span class="pcount tv-pag" id="pagMot"></span></div>' +
        '<div class="chart-wrap"><canvas id="tvMot"></canvas></div></div>' +
        '<div class="card panel"><div class="phead"><span class="ptitle">Top Placas</span>' +
        '<span class="pcount tv-pag" id="pagPla"></span></div>' +
        '<div class="chart-wrap"><canvas id="tvPla"></canvas></div></div></div>';
    },
    after: function () {
      const mot = OTD.topN(OTD.sumBy(ROWS, function (r) { return r.motorista; }), 24);
      const pla = OTD.topN(OTD.sumBy(ROWS, function (r) { return r.placa; }), 24);
      const porPagina = 6;
      function bloco(dados, canvas, cor, elPag, rotulo) {
        const nPag = Math.max(1, Math.ceil(dados.length / porPagina));
        registraBloco(nPag, function (p) {
          const fatia = dados.slice(p * porPagina, p * porPagina + porPagina);
          barrasTv(canvas, fatia, cor);
          const el = document.getElementById(elPag);
          if (el) el.textContent = rotulo + " " + (p * porPagina + 1) + "–" +
            (p * porPagina + fatia.length) + " de " + dados.length;
        });
      }
      bloco(mot, "tvMot", "rgba(240,128,14,.85)", "pagMot", "motoristas");
      bloco(pla, "tvPla", "rgba(79,163,227,.85)", "pagPla", "placas");
    }
  });

  /* --- 7. OMS ------------------------------------------------------------ */
  telas.push({
    titulo: "OMS — Qualidade",
    aplicavel: function () {
      return !!(OTD.OMS && gruposOms().length);
    },
    html: function () {
      const painel = OTD.OMS.painel;
      const grupos = gruposOms();
      const cards = grupos.map(function (g) {
        const d = painel.grupos[g];
        function corPct(v) { return v === null ? "#FFC145" : (v >= 90 ? "#4ADE80" : v >= 75 ? "#FFC145" : "#F1553F"); }
        function corVz(v) { return v === null ? "#FFC145" : (v <= 25 ? "#4ADE80" : v <= 40 ? "#FFC145" : "#F1553F"); }
        function sub(t, a) { return !t ? "nenhuma no período" : (!a ? "todas as " + t + " no prazo" : a + " de " + t + " atrasadas"); }
        function c(lbl, val, s, cor) {
          return '<div class="card kpi"><div class="lbl">' + E(lbl) + "</div>" +
            '<div class="val num" style="color:' + cor + '">' + val + "</div>" +
            '<div class="sub">' + E(s) + "</div></div>";
        }
        return '<div><h3 style="margin:0 0 10px;font-size:17px;color:#ABA69C;' +
          'text-transform:uppercase;letter-spacing:1.6px">' + E(NOME_GRUPO[g] || g) + "</h3>" +
          '<div class="grid g-3">' +
          c("OTP · coletas", OTD.fmtPct(d.otpPct), sub(d.otpTotal, d.otpAtrasadas), corPct(d.otpPct)) +
          c("OTD · entregas", OTD.fmtPct(d.otdPct), sub(d.otdTotal, d.otdAtrasadas), corPct(d.otdPct)) +
          c("KM vazio", OTD.fmtPct(d.vazioMedia), "média de " + d.vazioN + " romaneios", corVz(d.vazioMedia)) +
          "</div></div>";
      }).join("");
      return '<div style="display:flex;flex-direction:column;gap:18px;height:100%">' + cards +
        '<div class="card panel" style="flex:1"><div class="phead">' +
        '<span class="ptitle">Comparativo</span><span class="pcount">dia avaliado: ' +
        E((painel.dias || OTD.OMS.dias || []).map(OTD.fmtData).join(", ")) + "</span></div>" +
        '<div class="chart-wrap"><canvas id="tvOms"></canvas></div></div></div>';
    },
    after: function () {
      const painel = OTD.OMS.painel;
      const grupos = gruposOms();
      criar("tvOms", {
        type: "bar",
        data: {
          labels: ["OTP (coletas)", "OTD (entregas)", "KM vazio"],
          datasets: grupos.map(function (g, i) {
            const d = painel.grupos[g];
            return { label: NOME_GRUPO[g] || g,
                     data: [d.otpPct || 0, d.otdPct || 0, d.vazioMedia || 0],
                     backgroundColor: OTD.PALETTE[i], borderRadius: 8, maxBarThickness: 96 };
          })
        },
        options: {
          layout: { padding: { top: 30 } },
          plugins: {
            legend: { labels: { font: { size: 17 }, boxWidth: 16, usePointStyle: true } },
            tooltip: { enabled: false },
            valores: { formato: "pct", fonte: 19 }
          },
          scales: {
            y: { min: 0, max: 100, ticks: { font: { size: 15 }, callback: function (v) { return v + "%"; } } },
            x: { grid: { display: false }, ticks: { font: { size: 17 } } }
          }
        }
      });
    }
  });

  /* --- 8. Controle de Entregas ------------------------------------------- */
  telas.push({
    titulo: "Controle de Entregas",
    aplicavel: function () { return !!(OTD.ENTREGAS && gruposOms().length); },
    html: function () {
      const ent = OTD.ENTREGAS;
      const grupos = gruposOms();
      const ORDEM = [["em_descarga", "Em descarga", "#2DD4BF"],
                     ["destinado", "Destinado", "#B18CFF"],
                     ["em_viagem", "Em viagem", "#4FA3E3"],
                     ["finalizada", "Finalizadas no dia", "#4ADE80"]];
      return '<div class="' + (grupos.length > 1 ? "tv-2" : "tv-full") + '">' +
        grupos.map(function (g) {
          const b = ent.grupos[g] || {};
          /* fontes maiores: esta tela e lida de longe, no chao de operacao */
          const umGrupo = grupos.length === 1;
          return '<div class="card"><h3 style="margin:0 0 18px;font-size:24px;color:#ABA69C;' +
            'text-transform:uppercase;letter-spacing:1.6px">' + E(NOME_GRUPO[g] || g) + "</h3>" +
            '<div class="grid g-2" style="gap:18px;flex:1">' + ORDEM.map(function (s) {
              const lista = b[s[0]] || [];
              return '<div class="card" style="padding:18px;background:#151210;' +
                'justify-content:center">' +
                '<div style="font-size:22px;color:#8E8880;text-transform:uppercase;' +
                'letter-spacing:1.4px;font-weight:800;margin-bottom:10px">' + E(s[1]) + "</div>" +
                '<div style="font-size:' + (umGrupo ? 132 : 104) +
                'px;font-weight:800;line-height:1;color:' + s[2] + '" class="num">' +
                lista.length + "</div>" +
                '<div style="font-size:20px;color:#8E8880;margin-top:12px;line-height:1.45" class="lst-' +
                g.replace(/\s/g, "") + "-" + s[0] + '">' +
                (lista.length ? "" : "Nenhuma carga nesse status.") + "</div></div>";
            }).join("") + "</div></div>";
        }).join("") + "</div>";
    },
    after: function () {
      /* lista de romaneios paginando dentro do card */
      const ent = OTD.ENTREGAS;
      const grupos = gruposOms();
      grupos.forEach(function (g) {
        ["em_descarga", "destinado", "em_viagem", "finalizada"].forEach(function (st) {
          const lista = (ent.grupos[g] || {})[st] || [];
          const el = document.querySelector(".lst-" + g.replace(/\s/g, "") + "-" + st);
          if (!el || !lista.length) return;
          const porPagina = 4;
          const nPag = Math.max(1, Math.ceil(lista.length / porPagina));
          registraBloco(nPag, function (p) {
            el.textContent = lista.slice(p * porPagina, p * porPagina + porPagina)
              .map(function (c) { return c.romaneio; }).join(" · ") +
              (nPag > 1 ? "   (" + (p + 1) + "/" + nPag + ")" : "");
          });
        });
      });
    }
  });

  /* --- 9. Cargas em Atraso (coleta e entrega) ---------------------------- */
  /* Complemento da OMS: a OMS mostra o que JA foi atendido (no prazo ou nao);
     esta tela mostra o que AINDA NAO chegou e ja passou do prazo. Base:
     romaneios em aberto (sem chegada / sem descarga) com prazo vencido. */
  function segsAtraso() {
    if (!OTD.ATRASOS || !OTD.ATRASOS.segmentos) return [];
    let ss = Object.keys(OTD.ATRASOS.segmentos);
    if (F.segs && F.segs.size) {
      ss = ss.filter(function (s) { return F.segs.has(s.toUpperCase()); });
    }
    return ss.sort();
  }

  function listaAtrasos(tipo) {
    const out = [];
    segsAtraso().forEach(function (s) {
      (OTD.ATRASOS.segmentos[s][tipo] || []).forEach(function (a) {
        out.push(Object.assign({ seg: s }, a));
      });
    });
    /* mais atrasado primeiro */
    out.sort(function (a, b) { return b.atrasoH - a.atrasoH; });
    return out;
  }

  function fmtAtraso(h) {
    const horas = Math.max(0, Math.round(Number(h) || 0));
    if (horas < 48) return { n: horas + "h", u: "de atraso" };
    const d = Math.floor(horas / 24);
    const r = horas % 24;
    return { n: d + "d" + (r ? " " + r + "h" : ""), u: "de atraso" };
  }

  function cardAtraso(a) {
    const t = fmtAtraso(a.atrasoH);
    const multi = segsAtraso().length > 1;
    return '<div class="tv-atraso ' + E(a.sev || "leve") + '">' +
      '<div class="tempo">' + E(t.n) + "<small>" + E(t.u) + "</small></div>" +
      '<div class="info">' +
      '<div class="rom">' + E("Rom. " + a.romaneio) +
      (a.placa ? ' <span style="font-size:16px;color:#6E6A62;font-weight:700">· ' +
        E(a.placa) + "</span>" : "") + "</div>" +
      '<div class="cli">' + E(OTD.shortName(a.cliente || "—", 34)) +
      (multi ? ' <span style="color:#6E6A62">· ' + E(a.seg) + "</span>" : "") + "</div>" +
      '<div class="rot">' + E(OTD.shortName(a.rota || "—", 52)) +
      (a.motorista && a.motorista !== "Sem Motorista"
        ? " · " + E(OTD.shortName(a.motorista, 18)) : " · sem motorista") + "</div></div>" +
      '<div class="prazo">prazo<b>' + E(OTD.fmtDataHora(a.prazo)) + "</b></div></div>";
  }

  telas.push({
    titulo: "Cargas em Atraso",
    aplicavel: function () { return !!(OTD.ATRASOS && segsAtraso().length); },
    html: function () {
      const col = [["coletas", "🟠 Coletas em atraso",
                    "Nenhum romaneio em aberto com a coleta vencida — tudo dentro da " +
                    "programação de carregamento."],
                   ["entregas", "🔴 Entregas em atraso",
                    "Nenhuma carga em trânsito passou do prazo de entrega."]];
      return '<div style="display:flex;flex-direction:column;gap:14px;height:100%">' +
        '<div class="tv-2" style="flex:1">' + col.map(function (c) {
          const lista = listaAtrasos(c[0]);
          const criticos = lista.filter(function (a) { return a.sev === "critico"; }).length;
          return '<div class="card panel" style="gap:10px">' +
            '<div class="tv-col-titulo">' + E(c[1]) +
            '<span class="qtd' + (lista.length ? "" : " zero") + '">' + lista.length + "</span>" +
            (criticos ? '<span class="qtd">' + criticos + " crítica" +
              (criticos === 1 ? "" : "s") + "</span>" : "") + "</div>" +
            (lista.length
              ? '<div class="tv-atraso-lista" id="lst-' + c[0] + '"></div>' +
                '<div class="tv-pag" id="pag-' + c[0] + '" style="text-align:center"></div>'
              : '<div class="tv-atraso-vazio"><div class="ic">🟢</div>' +
                '<div class="tt">Nada vencido</div><div class="ds">' + E(c[2]) + "</div></div>") +
            "</div>";
        }).join("") + "</div>" +
        '<div class="tv-pag" style="text-align:center">Foto de ' +
        E(OTD.fmtDataHora(OTD.ATRASOS.geradoEm)) + " · só romaneios em aberto (sem chegada " +
        "ou sem descarga) · " + E(String(OTD.ATRASOS.semReferencia)) +
        " cargas de toda a base ficam de fora por não terem prazo cadastrado" +
        "</div></div>";
    },
    after: function () {
      ["coletas", "entregas"].forEach(function (tipo) {
        const lista = listaAtrasos(tipo);
        const box = document.getElementById("lst-" + tipo);
        const pag = document.getElementById("pag-" + tipo);
        if (!box || !lista.length) return;
        const porPagina = 6;
        const nPag = Math.max(1, Math.ceil(Math.min(lista.length, 42) / porPagina));
        registraBloco(nPag, function (p) {
          box.innerHTML = lista.slice(p * porPagina, p * porPagina + porPagina)
            .map(cardAtraso).join("");
          if (pag) {
            pag.textContent = nPag > 1
              ? (p * porPagina + 1) + "–" + Math.min(lista.length, p * porPagina + porPagina) +
                " de " + lista.length + " (mais atrasadas primeiro)"
              : lista.length + (lista.length === 1 ? " carga vencida" : " cargas vencidas");
          }
        });
      });
    }
  });

  /* --- 10. Insights de I.A. ---------------------------------------------- */
  telas.push({
    titulo: "Insights & Sugestões",
    html: function () {
      if (!INSIGHTS.length) {
        return '<div class="card tv-full" style="flex-direction:column">' +
          '<div class="tv-ok"><div class="ic">🤖</div><div class="tt">Sem apontamentos</div>' +
          '<div class="ds">Nada fora do padrão nos indicadores acompanhados.</div></div></div>';
      }
      return '<div id="tvInsights" style="display:flex;flex-direction:column;gap:16px;' +
        'height:100%;justify-content:center"></div>' +
        '<div class="tv-pag" id="tvInsightsPag" style="text-align:center"></div>';
    },
    after: function () {
      if (!INSIGHTS.length) return;
      const box = document.getElementById("tvInsights");
      const pag = document.getElementById("tvInsightsPag");
      const porPagina = 4;
      /* sempre 4 por pagina — completa com leituras do mes se faltar material */
      const LISTA = completaPagina(INSIGHTS, [], porPagina);
      const nPag = Math.max(1, Math.ceil(LISTA.length / porPagina));
      registraBloco(nPag, function (p) {
        box.innerHTML = LISTA.slice(p * porPagina, p * porPagina + porPagina)
          .map(cardInsightTv).join("");
        pag.textContent = "análise automática · página " + (p + 1) + " de " + nPag +
          " · " + INSIGHTS.length + " apontamentos";
      });
    }
  });

  /* --- 11. Destaques & Meta ---------------------------------------------- */
  telas.push({
    titulo: "Destaques & Meta do Mês",
    html: function () {
      function top(map) { const t = OTD.topN(map, 1); return t.length ? t[0] : ["—", 0]; }
      const cli = top(OTD.sumBy(ROWS, function (r) { return r.cliente; }));
      const rot = top(OTD.sumBy(ROWS, function (r) { return r.rota; }));
      const mot = top(OTD.sumBy(ROWS, function (r) { return r.motorista; }));
      function hl(medal, tag, nome, valor) {
        return '<div class="card hl"><div class="medal" style="font-size:28px">' + medal + "</div>" +
          '<span class="tag">' + E(tag) + "</span>" +
          '<div class="nome">' + E(OTD.shortName(nome, 28)) + "</div>" +
          '<div class="valor num">' + valor + "</div></div>";
      }
      const p = OTD.projectMonth(ROWS, MES);
      const meta = OTD.getGoal(MES);
      const pctM = meta > 0 ? 100 * p.total / meta : 0;
      const pctP = meta > 0 ? 100 * p.projected / meta : 0;
      function g(id, titulo, pct, l1, l2) {
        return '<div class="card goal-card"><div class="ptitle" style="align-self:flex-start">' +
          E(titulo) + "</div>" +
          '<div class="gauge-wrap"><canvas id="' + id + '"></canvas>' +
          '<div class="gauge-center"><div class="pct num" style="color:' +
          (pct >= 100 ? "#4ADE80" : "#F0800E") + '">' + OTD.fmtPct(pct, 0) + "</div>" +
          '<div class="cap">da meta</div></div></div>' +
          '<div class="goal-lines"><div class="goal-line"><span>' + E(l1[0]) +
          '</span><b class="num">' + l1[1] + "</b></div>" +
          '<div class="goal-line"><span>' + E(l2[0]) + '</span><b class="num">' + l2[1] +
          "</b></div></div></div>";
      }
      return '<div style="display:flex;flex-direction:column;gap:18px;height:100%">' +
        '<div class="tv-3">' +
        hl("🥇", "Cliente", cli[0], OTD.fmtBRL(cli[1])) +
        hl("🛣️", "Rota", rot[0], OTD.fmtBRL(rot[1])) +
        hl("👤", "Motorista", mot[0], OTD.fmtBRL(mot[1])) + "</div>" +
        '<div class="tv-2" style="flex:1">' +
        g("tvGMeta", "Meta do Mês", pctM, ["Realizado", OTD.fmtBRL(p.total)], ["Meta", OTD.fmtBRL(meta)]) +
        g("tvGProj", "Projeção de Fechamento", pctP, ["Projeção", OTD.fmtBRL(p.projected)],
          ["Apuração", "Dia " + p.elapsed + " de " + p.totalDays]) +
        "</div></div>";
    },
    after: function () {
      const p = OTD.projectMonth(ROWS, MES);
      const meta = OTD.getGoal(MES);
      gaugeTv("tvGMeta", meta > 0 ? 100 * p.total / meta : 0);
      gaugeTv("tvGProj", meta > 0 ? 100 * p.projected / meta : 0);
    }
  });

  /* ======================================================================= */
  /* GRUPOS OMS VISIVEIS PARA ESTA OPERACAO                                  */
  /* ======================================================================= */
  function gruposOms() {
    if (!OTD.OMS || !OTD.OMS.painel) return [];
    let gs = Object.keys(OTD.OMS.painel.grupos);
    if (OP.grupos) gs = gs.filter(function (g) { return OP.grupos.indexOf(g) >= 0; });
    else if (F.segs && F.segs.size) {
      gs = gs.filter(function (g) { return F.segs.has((OTD.GRUPO_SEG[g] || "").toUpperCase()); });
    }
    return gs;
  }

  /* telas que nao se aplicam a esta operacao saem do loop
     (ex.: Pranchas/Rodando nao entram no OMS, que so cobre Bens e Latas) */
  const ATIVAS = telas.filter(function (t) {
    return typeof t.aplicavel !== "function" || t.aplicavel();
  });

  /* No modo macro por operacao o telao fica mais enxuto: sem detalhamento
     de motorista/placa, que e leitura de dashboard e nao de chao de fabrica. */
  const ORDEM_MACRO = ["Visão Geral", "Contador de Cargas", "Pontos de Atenção",
                       "Faturamento Diário", "Clientes & Rotas", "OMS — Qualidade",
                       "Controle de Entregas", "Cargas em Atraso", "Insights & Sugestões"];
  const SLIDES = MACRO
    ? ATIVAS.filter(function (t) { return ORDEM_MACRO.indexOf(t.titulo) >= 0; })
    : ATIVAS;

  /* ======================================================================= */
  /* LOOP                                                                    */
  /* ======================================================================= */
  let atual = 0;

  function montar() {
    document.getElementById("tvSlides").innerHTML = SLIDES.map(function (t, i) {
      return '<div class="tv-slide" data-i="' + i + '"></div>';
    }).join("");
    document.getElementById("tvDots").innerHTML =
      SLIDES.map(function () { return "<i></i>"; }).join("");
  }

  function mostrar(i) {
    atual = ((i % SLIDES.length) + SLIDES.length) % SLIDES.length;
    blocos = [];
    paginaAtual = 0;

    const slides = document.querySelectorAll(".tv-slide");
    const t = SLIDES[atual];
    /* monta o HTML so do slide que vai aparecer (mantem a TV leve) */
    slides[atual].innerHTML = t.html();
    slides.forEach(function (s, k) { s.classList.toggle("on", k === atual); });
    document.querySelectorAll("#tvDots i").forEach(function (d, k) {
      d.classList.toggle("on", k === atual);
    });

    if (t.after) { try { t.after(); } catch (e) { console.error(e); } }

    /* o segmento fica AO LADO do titulo (no cabecalho), nao embaixo */
    const elOp = document.getElementById("tvOp");
    if (elOp) elOp.textContent = OP.icone + " " + TITULO;
    document.getElementById("tvSub").textContent =
      t.titulo + " · " + OTD.monthLabelFull(MES);

    /* selo de alerta permanente no cabecalho quando ha critico */
    const selo = document.getElementById("tvSelo");
    if (selo) {
      selo.innerHTML = CRITICOS.length
        ? '<span class="live-tag" style="font-size:13px">⚠ ' + CRITICOS.length +
          (CRITICOS.length === 1 ? " ponto crítico" : " pontos críticos") + "</span>"
        : '<span class="badge b-green" style="font-size:13px">operação sem alertas críticos</span>';
    }
    resetBarra();
  }

  function resetBarra() {
    const bar = document.getElementById("tvBar");
    bar.style.transition = "none";
    bar.style.width = "0%";
    void bar.offsetWidth;                       /* força reflow */
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

  function boot() {
    OTD.setupChart();
    document.getElementById("tvBase").textContent = "Base: " + OTD.fmtDataHora(OTD.META.geradoEm);
    tickRelogio();
    setInterval(tickRelogio, 1000);

    montar();
    mostrar(0);

    setInterval(function () { mostrar(atual + 1); }, SLIDE_SECONDS * 1000);
    /* setInterval SEPARADO do timer de slide: pagina os cards a cada 5s */
    setInterval(avancaPaginas, PAGE_SECONDS * 1000);

    /* recarrega a pagina (busca HTML + data.js novos) */
    setTimeout(function () {
      const base = location.search.replace(/([?&])_=\d+&?/, "$1").replace(/[?&]$/, "");
      location.href = location.pathname + base + (base ? "&" : "?") + "_=" + Date.now();
    }, RELOAD_MINUTES * 60 * 1000);

    /* hook de controle (homologação / captura de telas) */
    window.OTD_TV = { mostrar: mostrar, telas: SLIDES, total: SLIDES.length,
                      paginar: avancaPaginas, op: opKey };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
