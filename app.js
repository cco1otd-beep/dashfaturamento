/* ===========================================================================
   TORRE DE CONTROLE LOGISTICA - OTD LOGISTICS
   app.js - dashboard interativo (index.html) - 11 abas
   =========================================================================== */
(function () {
  "use strict";

  const E = OTD.escapeHtml;
  const charts = {};
  const OP_PAGE_SECONDS = 5;
  const LINHAS_PAGINA = 12;
  const LINHAS_OP = 8;
  const META_VEICULO_PADRAO = Number(OTD.META.metaVeiculoMes) || 60000;
  const COMISSAO = Number(OTD.META.comissaoMotorista) || 0.05;
  const DOCS = OTD.DOCS || [];

  const NOME_GRUPO = { "BENS DE CO": "Bens de Consumo", "LATAS": "Latas" };

  /* estado dos filtros */
  const F = {
    meses: new Set(), de: null, ate: null,
    clientes: new Set(), motoristas: new Set(), placas: new Set(),
    rotas: new Set(), segs: new Set(), modalidades: new Set(), emitentes: new Set()
  };

  let abaAtiva = "geral";
  let linhasCache = {};           /* linhas das tabelas paginadas por id */
  const pag = { viagens: 0, transito: 0, aguardando: 0 };

  /* ======================================================================= */
  /* META POR VEÍCULO (editável, guardada no navegador)                      */
  /* ======================================================================= */
  function metaVeiculo() {
    try {
      const v = localStorage.getItem("otd_meta_veiculo");
      if (v !== null && v !== "") return Number(v);
    } catch (e) { }
    return META_VEICULO_PADRAO;
  }
  function setMetaVeiculo(v) {
    try { localStorage.setItem("otd_meta_veiculo", String(v)); } catch (e) { }
  }

  /* ======================================================================= */
  /* HELPERS DE UI                                                           */
  /* ======================================================================= */
  function card(conteudo, classe) {
    return '<div class="card ' + (classe || "") + '">' + conteudo + "</div>";
  }
  function secao(titulo, extra) {
    return '<div class="section-title"><h2>' + E(titulo) + "</h2>" +
           (extra || "") + "</div>";
  }
  function painel(id, titulo, contador, classeWrap) {
    return card('<div class="phead"><span class="ptitle">' + E(titulo) + "</span>" +
      '<span class="pcount">' + E(contador || "") + "</span></div>" +
      '<div class="chart-wrap ' + (classeWrap || "") + '"><canvas id="' + id + '"></canvas></div>',
      "panel");
  }
  function tabelaCard(id, titulo, contador, busca) {
    return '<div class="card tablecard">' +
      '<div class="tablehead"><span class="ptitle">' + E(titulo) + "</span>" +
      '<span class="pcount" id="' + id + 'Cnt">' + E(contador || "") + "</span>" +
      '<span class="spacer"></span>' +
      (busca ? '<input type="text" class="busca" data-alvo="' + id +
               '" placeholder="Buscar…" style="min-width:240px">' : "") +
      "</div>" +
      '<div class="tablewrap"><table class="dtbl" id="' + id + '"></table></div></div>';
  }
  function kpi(ico, classe, label, valor, sub, delta) {
    let d = "";
    if (delta) {
      const cls = delta.v > 0.05 ? "up" : (delta.v < -0.05 ? "down" : "flat");
      const seta = delta.v > 0.05 ? "▲" : (delta.v < -0.05 ? "▼" : "•");
      d = ' <span class="delta ' + cls + '">' + seta + " " + OTD.fmtPct(delta.v, 1) +
          ' <span style="color:var(--text-faint);font-weight:400">' + E(delta.txt) + "</span></span>";
    }
    return '<div class="card kpi"><div class="top"><div class="ico ' + classe + '">' + ico + "</div>" +
      '<div class="lbl">' + E(label) + "</div></div>" +
      '<div class="val num">' + valor + "</div>" +
      '<div class="sub">' + (sub || "") + d + "</div></div>";
  }
  const CORES_CONTADOR = {
    emTransito: ["#F0800E", "🚚", "Em trânsito", "carga iniciada, sem descarga"],
    aguardando: ["#FFC145", "⏳", "Aguardando início", "romaneio aberto, sem carregar"],
    emViagem: ["#4FA3E3", "🛣️", "Em viagem", "com documento emitido"],
    destinado: ["#B18CFF", "📌", "Destinado", "veículo destinado, sem doc"],
    emDescarga: ["#2DD4BF", "📦", "Em descarga", "chegou, descarregando"],
    finalizadasDia: ["#4ADE80", "✅", "Finalizadas no dia", ""],
    concluidas: ["#9AA5B1", "🏁", "Concluídas (base)", "acumulado do arquivo"]
  };

  function cardContador(chave, valor, extra) {
    const c = CORES_CONTADOR[chave];
    return '<div class="card contador"><div class="ic">' + c[1] + "</div>" +
      '<div class="n num" style="color:' + c[0] + '">' + OTD.fmtNum(valor) + "</div>" +
      '<div class="t">' + E(c[2]) + "</div>" +
      '<div class="d">' + E(extra !== undefined ? extra : c[3]) + "</div></div>";
  }

  function cardInsight(i) {
    return '<div class="insight ' + i.nivel + '"><div class="ic">' + i.icone + "</div>" +
      '<div class="txt"><div class="tit">' + E(i.titulo) + "</div>" +
      '<div class="vl">' + E(i.valor) + "</div>" +
      '<div class="ds">' + E(i.texto) + "</div></div></div>";
  }

  function pctCell(v) {
    return '<span class="num">' + OTD.fmtPct(v, 1) + "</span>";
  }
  function vazioBadge(pct) {
    const cls = pct <= 25 ? "b-green" : (pct <= 40 ? "b-amber" : "b-red");
    return '<span class="badge ' + cls + '">' + OTD.fmtPct(pct, 1) + "</span>";
  }

  /* tabela genérica com paginação opcional */
  function pintarTabela(id, cols, linhas, pagina, porPagina) {
    const el = document.getElementById(id);
    if (!el) return { pagina: 1, nPag: 1, total: 0 };
    const total = linhas.length;
    let fatia = linhas, p = 0, nPag = 1;
    if (porPagina) {
      nPag = Math.max(1, Math.ceil(total / porPagina));
      p = (((pagina || 0) % nPag) + nPag) % nPag;
      fatia = linhas.slice(p * porPagina, p * porPagina + porPagina);
    }
    el.innerHTML = "<thead><tr>" + cols.map(function (c) {
        return '<th' + (c.right ? ' style="text-align:right"' : "") + ">" + E(c.t || c) + "</th>";
      }).join("") + "</tr></thead><tbody class='pagefade'>" +
      (fatia.length ? fatia.map(function (l) {
        return "<tr>" + l.map(function (c, i) {
          const right = cols[i] && cols[i].right;
          return "<td" + (right ? ' class="right"' : "") + ">" + c + "</td>";
        }).join("") + "</tr>";
      }).join("")
        : '<tr><td colspan="' + cols.length + '"><div class="empty-state">' +
          "Nenhum registro para os filtros selecionados.</div></td></tr>") + "</tbody>";
    const cnt = document.getElementById(id + "Cnt");
    if (cnt) cnt.textContent = OTD.fmtNum(total) + " linhas" +
      (porPagina && nPag > 1 ? " · pág " + (p + 1) + "/" + nPag : "");
    return { pagina: p + 1, nPag: nPag, total: total };
  }

  function criarGrafico(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    charts[id] = new Chart(el, config);
  }
  function barrasH(id, pares, cor, formatador, formatoRotulo) {
    criarGrafico(id, {
      type: "bar",
      data: {
        labels: pares.map(function (p) { return OTD.shortName(p[0], 30); }),
        datasets: [{
          data: pares.map(function (p) { return p[1]; }),
          backgroundColor: cor || "rgba(240,128,14,.75)",
          borderRadius: 5, maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          valores: { formato: formatoRotulo || "brl" },
          tooltip: { callbacks: { label: function (c) {
            return (formatador || OTD.fmtBRL)(c.parsed.x); } } }
        },
        scales: {
          x: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } },
          y: OTD.eixoCategoriasY()
        }
      }
    });
  }

  /* ======================================================================= */
  /* AGREGAÇÕES POR DIMENSÃO (usadas nas abas de tabela)                     */
  /* ======================================================================= */
  function agrupar(rows, keyFn) {
    const m = new Map();
    rows.forEach(function (r) {
      const k = keyFn(r) || "—";
      let a = m.get(k);
      if (!a) { a = { chave: k, frete: 0, docs: 0, kmV: 0, kmC: 0, viagens: new Set() }; m.set(k, a); }
      a.frete += Number(r.frete) || 0;
      a.docs += 1;
      a.kmV += Number(r.kmVazio) || 0;
      a.kmC += Number(r.kmCarreg) || 0;
      if (r.id) a.viagens.add(r.id);
    });
    m.delete("—");
    const arr = Array.from(m.values());
    arr.forEach(function (a) {
      a.nViagens = a.viagens.size;
      a.pctVazio = (a.kmV + a.kmC) > 0 ? 100 * a.kmV / (a.kmV + a.kmC) : 0;
      a.rsKm = (a.kmV + a.kmC) > 0 ? a.frete / (a.kmV + a.kmC) : 0;   /* R12 */
      a.ticket = a.nViagens ? a.frete / a.nViagens : 0;
    });
    arr.sort(function (a, b) { return b.frete - a.frete; });
    return arr;
  }

  /* ======================================================================= */
  /* ABA 1 · VISÃO GERAL                                                     */
  /* ======================================================================= */
  function abaGeral(rows) {
    return secao("KPIs Financeiros", '<span class="hint" id="hintPeriodo"></span>') +
      '<div class="grid g-kpi" id="gridKpi"></div>' +
      secao("Contador de Cargas", '<span class="live-tag">tempo real</span>' +
            '<span class="hint" id="hintContador"></span>') +
      '<div class="grid g-kpi" id="gridContador"></div>' +
      secao("Insights & Pontos de Atenção",
            '<span class="selo-ia">análise automática</span>') +
      '<div class="grid g-3" id="gridInsights"></div>' +
      secao("Faturado & Projeção por Segmento") +
      '<div class="grid g-4" id="gridSeg"></div>' +
      secao("Destaques do Período") +
      '<div class="grid g-highlight" id="gridDestaques"></div>' +
      secao("Faturamento Diário") +
      '<div class="grid g-charts-2">' +
        painel("chDiario", "Faturamento Diário + acumulado", "linha = dia · área = acumulado") +
        painel("chDiarioSeg", "Volume Diário por Segmento", "empilhado") +
      "</div>" +
      secao("Composição") +
      '<div class="grid g-charts-3">' +
        painel("chSegmento", "Por Segmento", "") +
        painel("chModalidade", "Modalidade", "frota × agregado") +
        painel("chStatusCte", "Status CTes", "quantidade de documentos") +
      "</div>";
  }

  function renderGeral(rows) {
    const total = OTD.totalFaturamento(rows);
    const viagens = OTD.contarViagens(rows);
    const km = OTD.totalKm(rows), kmC = OTD.totalKmCarregado(rows), kmV = OTD.totalKmVazio(rows);

    let delta = null;
    if (F.meses.size === 1 && !F.de && !F.ate) {
      const mes = Array.from(F.meses)[0];
      const ant = OTD.prevMonthKey(mes);
      const base = OTD.applyEntityFilters(OTD.DATA, F);
      const tAnt = base.reduce(function (s, r) { return s + (r.mesRef === ant ? r.frete : 0); }, 0);
      if (tAnt > 0) delta = { v: 100 * (total - tAnt) / tAnt, txt: "vs " + OTD.monthLabel(ant) };
    }

    document.getElementById("gridKpi").innerHTML =
      kpi("💰", "accent", "Faturamento Total", OTD.fmtBRL(total), rows.length + " documentos", delta) +
      kpi("🚚", "info", "Viagens no Período", OTD.fmtNum(viagens), "romaneios distintos") +
      kpi("🎯", "ok", "Ticket Médio", OTD.fmtBRL(viagens ? total / viagens : 0), "por viagem") +
      kpi("⚖️", "warn", "Frete Peso Total", OTD.fmtBRL(OTD.totalFretePeso(rows)), "componente peso") +
      kpi("🛣️", "accent", "KM Rodado", OTD.fmtKm(km),
          OTD.fmtKm(kmV) + " vazio · " + OTD.fmtPct(km ? 100 * kmV / km : 0, 1) + " vazio") +
      kpi("📈", "ok", "R$ / KM", km ? OTD.fmtBRLcents(total / km) : "—",
          "R12 · carregado: " + (kmC ? OTD.fmtBRLcents(total / kmC) : "—"));

    /* --- contador de cargas (tempo real) --- */
    const cc = OTD.contadorCargas(F);
    document.getElementById("gridContador").innerHTML =
      cardContador("emTransito", cc.emTransito) +
      cardContador("aguardando", cc.aguardando) +
      cardContador("emViagem", cc.emViagem) +
      cardContador("destinado", cc.destinado) +
      cardContador("emDescarga", cc.emDescarga) +
      cardContador("finalizadasDia", cc.finalizadasDia, OTD.fmtData(cc.dia));
    document.getElementById("hintContador").textContent =
      OTD.fmtNum(cc.totalBase) + " romaneios na base · " +
      OTD.fmtNum(cc.concluidasBase || cc.concluidas) + " já concluídos · " +
      "janela operacional de " + (OTD.META.janelaViagensDias || 60) + " dias no arquivo";

    /* --- insights automáticos --- */
    const insights = OTD.gerarInsights(rows, {
      mes: (F.meses.size === 1 && !F.de && !F.ate) ? Array.from(F.meses)[0] : null,
      metaVeiculo: metaVeiculo(), filtro: F,
      segs: F.segs.size ? Array.from(F.segs) : null,
      gruposOms: F.segs.size
        ? Object.keys(OTD.GRUPO_SEG).filter(function (g) { return F.segs.has(OTD.GRUPO_SEG[g]); })
        : null
    });
    document.getElementById("gridInsights").innerHTML = insights.length
      ? insights.slice(0, 9).map(cardInsight).join("")
      : '<div class="card"><div class="empty-state">Nenhum ponto de atenção no período.</div></div>';

    /* --- Faturado & Projeção por segmento (meta = R13) --- */
    const segs = ["LATAS", "BENS DE CONSUMO", "AUTOPROPULSOR", "PRANCHA"];
    const mesProj = (F.meses.size === 1 && !F.de && !F.ate) ? Array.from(F.meses)[0] : null;
    const mv = metaVeiculo();
    document.getElementById("gridSeg").innerHTML = segs.map(function (s, i) {
      const sub = rows.filter(function (r) { return r.seg === s; });
      const v = OTD.totalFaturamento(sub);
      const placas = new Set(sub.map(function (r) { return r.placa; }).filter(Boolean));
      /* R13: a meta soma so placas REAIS - "OTD-xxxx" e placa propria ficticia
         do autopropulsor (o veiculo transportado), nao um caminhao da frota. */
      const placasReais = new Set(sub.filter(function (r) { return r.placa && !r.otd; })
        .map(function (r) { return r.placa; }));
      const metaSeg = placasReais.size * mv;                  /* R13 */
      let linha = OTD.contarViagens(sub) + " viagens · " + placasReais.size + " placas" +
        (placas.size > placasReais.size ? " (+" + (placas.size - placasReais.size) + " fictícias)" : "");
      if (mesProj) {
        const p = OTD.projectMonth(sub, mesProj);
        linha += p.isCurrent ? " · projeção " + OTD.fmtBRL(p.projected) : " · mês fechado";
      }
      const pctMeta = metaSeg > 0 ? 100 * v / metaSeg : 0;
      return '<div class="card kpi">' +
        '<div class="top"><div class="ico" style="background:' + OTD.PALETTE[i] +
        '22;color:' + OTD.PALETTE[i] + ';border-color:' + OTD.PALETTE[i] + '44">■</div>' +
        '<div class="lbl">' + E(s) + "</div></div>" +
        '<div class="val num">' + OTD.fmtBRL(v) + "</div>" +
        '<div class="sub">' + E(linha) + "</div>" +
        (metaSeg > 0
          ? '<div class="pbar' + (pctMeta >= 100 ? " ok" : "") + '"><i style="width:' +
            Math.min(100, pctMeta) + '%"></i></div>' +
            '<div class="sub">meta R13 ' + OTD.fmtBRL(metaSeg) + " · " + OTD.fmtPct(pctMeta, 0) + "</div>"
          : '<div class="sub" style="color:var(--text-faint)">sem meta R13 — só placas fictícias</div>') +
        "</div>";
    }).join("");

    /* --- destaques --- */
    const top = function (map) { const t = OTD.topN(map, 1); return t.length ? t[0] : ["—", 0]; };
    const cli = top(OTD.sumBy(rows, function (r) { return r.cliente; }));
    const rot = top(OTD.sumBy(rows, function (r) { return r.rota; }));
    const mot = top(OTD.sumBy(rows, function (r) { return r.motorista; }));
    const pla = top(OTD.sumBy(rows, function (r) { return r.placa; }));
    const motQtd = top(OTD.countBy(rows, function (r) { return r.motorista; }));
    let maior = { frete: 0, doc: "—", cliente: "—" };
    rows.forEach(function (r) { if (r.frete > maior.frete) maior = r; });
    function hl(medal, tag, nome, valor, rodape) {
      return '<div class="card hl"><div class="medal">' + medal + "</div>" +
        '<span class="tag">' + E(tag) + "</span>" +
        '<div class="nome">' + E(nome) + "</div>" +
        '<div class="valor num">' + E(valor) + "</div>" +
        '<div class="rodape">' + E(rodape) + "</div></div>";
    }
    document.getElementById("gridDestaques").innerHTML =
      hl("🥇", "Cliente", cli[0], OTD.fmtBRL(cli[1]), "maior faturamento") +
      hl("🛣️", "Rota", OTD.shortName(rot[0], 38), OTD.fmtBRL(rot[1]), "maior faturamento") +
      hl("👤", "Motorista", mot[0], OTD.fmtBRL(mot[1]), "maior faturamento") +
      hl("🚛", "Placa", pla[0], OTD.fmtBRL(pla[1]), "maior faturamento") +
      hl("💎", "Maior Frete", OTD.shortName(maior.cliente, 26), OTD.fmtBRL(maior.frete), "doc " + (maior.doc || "—")) +
      hl("🏁", "Motorista + Viagens", motQtd[0], OTD.fmtNum(motQtd[1]) + " viagens", "por contagem");

    /* --- faturamento diário + acumulado --- */
    const mes = mesProj || (Array.from(F.meses).sort().pop()) || OTD.nowKey();
    const serie = OTD.dailySeries(rows, mes);
    let acc = 0;
    const acumulado = serie.map(function (v) { acc += v; return acc; });
    const hoje = new Date();
    const diaHoje = (OTD.monthKey(hoje) === mes) ? hoje.getDate() : serie.length;
    criarGrafico("chDiario", {
      data: {
        labels: serie.map(function (_, i) { return String(i + 1); }),
        datasets: [
          { type: "line", label: "Acumulado", yAxisID: "y2",
            data: acumulado.map(function (v, i) { return i < diaHoje ? v : null; }),
            borderColor: "#4FA3E3", fill: false, tension: .3, pointRadius: 0, borderWidth: 2.4 },
          { type: "bar", label: "Dia",
            data: serie.map(function (v, i) { return i < diaHoje ? v : null; }),
            backgroundColor: "rgba(240,128,14,.8)", borderRadius: 4, maxBarThickness: 18 }
        ]
      },
      options: {
        plugins: {
          legend: { labels: { boxWidth: 12, usePointStyle: true } },
          valores: { formato: "brl", somenteDataset: 1 },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + OTD.fmtBRL(c.parsed.y); } } }
        },
        scales: {
          y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } },
          y2: { position: "right", grid: { display: false },
                ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } },
          x: { grid: { display: false } }
        }
      }
    });

    /* --- volume diário por segmento (empilhado) --- */
    const dias = serie.length;
    const porSeg = segs.map(function (s, i) {
      const sub = rows.filter(function (r) { return r.seg === s; });
      return {
        label: s, data: OTD.dailySeries(sub, mes).map(function (v, k) { return k < diaHoje ? v : null; }),
        backgroundColor: OTD.PALETTE[i], borderRadius: 3, maxBarThickness: 18
      };
    });
    criarGrafico("chDiarioSeg", {
      type: "bar",
      data: { labels: Array.from({ length: dias }, function (_, i) { return String(i + 1); }), datasets: porSeg },
      options: {
        plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true, font: { size: 10.5 } } },
                   valores: { formato: "brl" },
                   tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + OTD.fmtBRL(c.parsed.y); } } } },
        scales: { x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } } }
      }
    });

    /* --- donuts de composição --- */
    function donut(id, mapa, formatador, formatoRotulo) {
      const pares = OTD.topN(mapa, 8);
      criarGrafico(id, {
        type: "doughnut",
        data: { labels: pares.map(function (p) { return p[0]; }),
                datasets: [{ data: pares.map(function (p) { return p[1]; }),
                             backgroundColor: OTD.PALETTE, borderWidth: 0, cutout: "52%" }] },
        options: {
          plugins: {
            valores: { formato: formatoRotulo || "brl", minPct: 5 },
            legend: { position: "right", labels: { boxWidth: 11, usePointStyle: true, font: { size: 11 } } },
            tooltip: { callbacks: { label: function (c) { return c.label + ": " + (formatador || OTD.fmtBRL)(c.parsed); } } }
          }
        }
      });
    }
    donut("chSegmento", OTD.sumBy(rows, function (r) { return r.seg; }));
    donut("chModalidade", OTD.sumBy(rows, function (r) { return r.modalidade; }));
    donut("chStatusCte", OTD.countBy(docsFiltrados(), function (d) { return d.situacao; }), OTD.fmtNum, "num");
  }

  /* ======================================================================= */
  /* ABA 2 · CLIENTES                                                        */
  /* ======================================================================= */
  function abaClientes() {
    return secao("Top Clientes") +
      '<div class="grid g-charts-2">' +
        painel("chTopCli", "Top 12 Clientes", "por faturamento", "tall") +
        painel("chCliDonut", "Participação", "top 7 + outros", "tall") +
      "</div>" +
      secao("Faturamento por Cliente") +
      tabelaCard("tbCli", "Faturamento por Cliente", "", true);
  }
  function renderClientes(rows) {
    barrasH("chTopCli", OTD.topN(OTD.sumBy(rows, function (r) { return r.cliente; }), 12));
    const mapa = OTD.sumBy(rows, function (r) { return r.cliente; });
    const top7 = OTD.topN(mapa, 7);
    const totalGeral = OTD.totalFaturamento(rows);
    const soma = top7.reduce(function (s, p) { return s + p[1]; }, 0);
    const labels = top7.map(function (p) { return p[0]; });
    const vals = top7.map(function (p) { return p[1]; });
    if (totalGeral - soma > 1) { labels.push("Outros"); vals.push(totalGeral - soma); }
    criarGrafico("chCliDonut", {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: vals, backgroundColor: OTD.PALETTE, borderWidth: 0, cutout: "56%" }] },
      options: { plugins: {
        valores: { formato: "brl", minPct: 5 },
        legend: { position: "right", labels: { boxWidth: 11, usePointStyle: true, font: { size: 11 } } },
        tooltip: { callbacks: { label: function (c) { return c.label + ": " + OTD.fmtBRL(c.parsed); } } } } }
    });

    const total = OTD.totalFaturamento(rows);
    linhasCache.tbCli = agrupar(rows, function (r) { return r.cliente; }).map(function (a) {
      return [
        '<span class="strong">' + E(a.chave) + "</span>",
        OTD.fmtBRL(a.frete), pctCell(total ? 100 * a.frete / total : 0),
        OTD.fmtNum(a.docs), OTD.fmtBRL(a.ticket),
        OTD.fmtNum(a.kmV, 0), OTD.fmtNum(a.kmC, 0), vazioBadge(a.pctVazio)
      ];
    });
    pintarTabela("tbCli", [
      "Cliente", { t: "Faturamento", right: true }, { t: "% Total", right: true },
      { t: "CTes", right: true }, { t: "Ticket Médio", right: true },
      { t: "KM Vazio", right: true }, { t: "KM Carregado", right: true }, { t: "% Vazio", right: true }
    ], linhasCache.tbCli);
  }

  /* ======================================================================= */
  /* ABA 3 · VEÍCULOS                                                        */
  /* ======================================================================= */
  function abaVeiculos() {
    return secao("Faturamento por Placa",
      '<span class="hint">verde = meta atingida</span>') +
      card('<div class="filterrow"><span class="lbl">Meta mensal por placa</span>' +
        '<input type="number" id="inMetaVeic" value="' + metaVeiculo() + '" step="1000">' +
        '<button class="btn primary" id="btMetaVeic">Salvar</button>' +
        '<span class="pcount">R13 · meta do segmento = meta da placa × nº de placas do segmento</span></div>') +
      '<div class="grid g-charts-2" style="margin-top:14px">' +
        painel("chPlacaFat", "Top 12 Placas", "por faturamento", "tall") +
        painel("chPlacaKm", "Top 12 Placas · % KM vazio", "quanto menor, melhor", "tall") +
      "</div>" +
      secao("Detalhamento por Placa") +
      tabelaCard("tbVei", "Faturamento por Placa", "", true);
  }
  function renderVeiculos(rows) {
    barrasH("chPlacaFat", OTD.topN(OTD.sumBy(rows, function (r) { return r.placa; }), 12));
    const ag = agrupar(rows, function (r) { return r.placa; });
    const porVazio = ag.slice(0, 12).map(function (a) { return [a.chave, a.pctVazio]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    barrasH("chPlacaKm", porVazio, "rgba(241,85,63,.7)", function (v) { return OTD.fmtPct(v, 1); }, "pct");

    const mv = metaVeiculo();
    const ficticias = new Set(rows.filter(function (r) { return r.otd; })
      .map(function (r) { return r.placa; }));
    linhasCache.tbVei = ag.map(function (a) {
      const pct = mv > 0 ? 100 * a.frete / mv : 0;
      const bateu = pct >= 100;
      return [
        '<span class="strong">' + E(a.chave) + "</span>" +
          (ficticias.has(a.chave) ? ' <span class="badge b-grey">fictícia</span>' : ""),
        '<span style="color:' + (bateu ? "#4ADE80" : "var(--orange-soft)") + ';font-weight:700">' +
          OTD.fmtBRL(a.frete) + "</span>",
        OTD.fmtBRL(mv),
        '<span class="badge ' + (bateu ? "b-green" : pct >= 70 ? "b-amber" : "b-grey") + '">' +
          OTD.fmtPct(pct, 0) + "</span>",
        OTD.fmtNum(a.nViagens),
        OTD.fmtNum(a.kmV, 0), OTD.fmtNum(a.kmC, 0), vazioBadge(a.pctVazio),
        OTD.fmtBRLcents(a.rsKm)
      ];
    });
    pintarTabela("tbVei", [
      "Placa", { t: "Faturamento", right: true }, { t: "Meta", right: true },
      { t: "% Meta", right: true }, { t: "Cargas", right: true },
      { t: "KM Vazio", right: true }, { t: "KM Carregado", right: true },
      { t: "% Vazio", right: true }, { t: "R$/km", right: true }
    ], linhasCache.tbVei);

    const bt = document.getElementById("btMetaVeic");
    if (bt) bt.addEventListener("click", function () {
      const v = Number(document.getElementById("inMetaVeic").value);
      if (v >= 0) { setMetaVeiculo(v); render(); }
    });
  }

  /* ======================================================================= */
  /* ABA 4 · MOTORISTAS                                                      */
  /* ======================================================================= */
  function abaMotoristas() {
    return secao("Motoristas") +
      '<div class="grid g-charts-2">' +
        painel("chMotFat", "Top 12 Motoristas", "por faturamento", "tall") +
        card('<div class="phead"><span class="ptitle">Mais e Menos Utilizados</span>' +
          '<span class="pcount">nº de viagens</span></div>' +
          '<div class="grid g-2" style="gap:22px">' +
          '<div><div class="pcount" style="margin-bottom:8px">Mais utilizados</div>' +
          '<div class="ranklist" id="rankMais"></div></div>' +
          '<div><div class="pcount" style="margin-bottom:8px">Menos utilizados</div>' +
          '<div class="ranklist" id="rankMenos"></div></div></div>', "panel") +
      "</div>" +
      secao("Faturamento + Comissão " + Math.round(COMISSAO * 100) + "%") +
      tabelaCard("tbMot", "Faturamento por Motorista", "", true);
  }
  function renderMotoristas(rows) {
    barrasH("chMotFat", OTD.topN(OTD.sumBy(rows, function (r) { return r.motorista; }), 12));
    const uso = OTD.countBy(rows, function (r) { return r.motorista; });
    const mais = OTD.topN(uso, 8), menos = OTD.topN(uso, 8, true);
    const maxV = mais.length ? mais[0][1] : 1;
    function linhas(arr) {
      if (!arr.length) return '<div class="empty-state">Sem dados no período.</div>';
      return arr.map(function (p, i) {
        return '<div class="rankrow"><span class="pos">' + (i + 1) + "º</span>" +
          '<span><span class="nm">' + E(OTD.shortName(p[0], 30)) + "</span>" +
          '<span class="bar"><i style="width:' + Math.max(3, 100 * p[1] / maxV) + '%"></i></span></span>' +
          '<span class="vl num">' + OTD.fmtNum(p[1]) + " viagens</span></div>";
      }).join("");
    }
    document.getElementById("rankMais").innerHTML = linhas(mais);
    document.getElementById("rankMenos").innerHTML = linhas(menos);

    const total = OTD.totalFaturamento(rows);
    linhasCache.tbMot = agrupar(rows, function (r) { return r.motorista; }).map(function (a) {
      return [
        '<span class="strong">' + E(a.chave) + "</span>",
        OTD.fmtBRL(a.frete), pctCell(total ? 100 * a.frete / total : 0),
        OTD.fmtNum(a.nViagens), OTD.fmtNum(a.kmV, 0), OTD.fmtNum(a.kmC, 0),
        '<span style="color:var(--green);font-weight:700">' + OTD.fmtBRLcents(a.frete * COMISSAO) + "</span>"
      ];
    });
    pintarTabela("tbMot", [
      "Motorista", { t: "Faturamento", right: true }, { t: "% Total", right: true },
      { t: "Cargas", right: true }, { t: "KM Vazio", right: true },
      { t: "KM Carregado", right: true },
      { t: "Comissão " + Math.round(COMISSAO * 100) + "%", right: true }
    ], linhasCache.tbMot);
  }

  /* ======================================================================= */
  /* ABA 5 · ROTAS & UF                                                      */
  /* ======================================================================= */
  function abaRotas() {
    return secao("UF de Destino") +
      '<div class="grid g-charts-2">' +
        painel("chUf", "Faturamento por UF Destino", "", "tall") +
        painel("chUfQtd", "Documentos por UF Destino", "quantidade", "tall") +
      "</div>" +
      secao("Top Rotas") +
      painel("chRotas", "Top 12 Rotas", "por faturamento", "tall") +
      secao("Detalhamento por Rota") +
      tabelaCard("tbRot", "Faturamento por Rota", "", true);
  }
  function renderRotas(rows) {
    barrasH("chUf", OTD.topN(OTD.sumBy(rows, function (r) { return r.uf; }), 12));
    barrasH("chUfQtd", OTD.topN(OTD.countBy(rows, function (r) { return r.uf; }), 12),
            "rgba(79,163,227,.72)", OTD.fmtNum, "num");
    barrasH("chRotas", OTD.topN(OTD.sumBy(rows, function (r) { return r.rota; }), 12),
            "rgba(45,212,191,.72)");

    const total = OTD.totalFaturamento(rows);
    linhasCache.tbRot = agrupar(rows, function (r) { return r.rota; }).map(function (a) {
      return [
        '<span class="strong">' + E(a.chave) + "</span>",
        OTD.fmtBRL(a.frete), pctCell(total ? 100 * a.frete / total : 0),
        OTD.fmtNum(a.docs), OTD.fmtNum(a.kmV, 0), OTD.fmtNum(a.kmC, 0), vazioBadge(a.pctVazio)
      ];
    });
    pintarTabela("tbRot", [
      "Rota", { t: "Faturamento", right: true }, { t: "% Total", right: true },
      { t: "CTes", right: true }, { t: "KM Vazio", right: true },
      { t: "KM Carregado", right: true }, { t: "% Vazio", right: true }
    ], linhasCache.tbRot);
  }

  /* ======================================================================= */
  /* ABA 6 · CTE & EMISSÃO                                                   */
  /* ======================================================================= */
  function docsFiltrados() {
    return DOCS.filter(function (d) {
      if (F.de || F.ate) {
        const k = String(d.dt || "").slice(0, 10);
        if (F.de && k < F.de) return false;
        if (F.ate && k > F.ate) return false;
        if (!k) return false;
      } else if (F.meses.size && !F.meses.has(d.mesRef)) return false;
      if (F.segs.size && !F.segs.has(d.seg)) return false;
      if (F.modalidades.size && !F.modalidades.has(d.modalidade)) return false;
      if (F.emitentes.size && !F.emitentes.has(d.emitente)) return false;
      return true;
    });
  }

  function abaCte() {
    return secao("Documentos Emitidos", '<span class="hint">todos os CT-e, em qualquer situação</span>') +
      '<div class="grid g-kpi" id="gridCteKpi"></div>' +
      '<div class="grid g-charts-2" style="margin-top:14px">' +
        painel("chDocSit", "Docs por Situação", "") +
        painel("chVolDia", "Volume Diário de CTes", "por situação") +
      "</div>" +
      secao("Taxa de Erro por Emitente") +
      '<div class="grid g-3" id="gridAlertas"></div>' +
      tabelaCard("tbEmi", "Desempenho por Emitente", "", false);
  }
  function renderCte() {
    const docs = docsFiltrados();
    const c = { "Autorizada": 0, "Cancelada": 0, "Substituída": 0, "Em processamento": 0, "Outra": 0 };
    docs.forEach(function (d) { c[d.situacao] = (c[d.situacao] || 0) + 1; });
    const total = docs.length;
    const erros = c["Cancelada"] + c["Substituída"];
    const taxa = total ? 100 * erros / total : 0;

    document.getElementById("gridCteKpi").innerHTML =
      kpi("📄", "info", "CT-e Emitidos", OTD.fmtNum(total), "no período filtrado") +
      kpi("✅", "ok", "Autorizados", OTD.fmtNum(c["Autorizada"]),
          OTD.fmtPct(total ? 100 * c["Autorizada"] / total : 0, 1) + " do total") +
      kpi("🚫", "danger", "Cancelados", OTD.fmtNum(c["Cancelada"]),
          OTD.fmtPct(total ? 100 * c["Cancelada"] / total : 0, 1) + " do total") +
      kpi("♻️", "warn", "Substituídos", OTD.fmtNum(c["Substituída"]), "CT-e substituto (R10)") +
      kpi("⏳", "warn", "Em processamento", OTD.fmtNum(c["Em processamento"]), "aguardando SEFAZ") +
      kpi("⚠️", taxa > 10 ? "danger" : taxa > 5 ? "warn" : "ok", "Taxa de Erro Geral",
          OTD.fmtPct(taxa, 1), "cancelados + substituídos");

    criarGrafico("chDocSit", {
      type: "doughnut",
      data: {
        labels: Object.keys(c).filter(function (k) { return c[k] > 0; }),
        datasets: [{
          data: Object.keys(c).filter(function (k) { return c[k] > 0; }).map(function (k) { return c[k]; }),
          backgroundColor: ["#4ADE80", "#F1553F", "#FFC145", "#4FA3E3", "#9AA5B1"],
          borderWidth: 0, cutout: "58%"
        }]
      },
      options: { plugins: {
        valores: { formato: "num", minPct: 4 },
        legend: { position: "right", labels: { boxWidth: 11, usePointStyle: true } },
        tooltip: { callbacks: { label: function (x) { return x.label + ": " + OTD.fmtNum(x.parsed); } } } } }
    });

    /* volume diário por situação */
    const mes = (F.meses.size === 1 ? Array.from(F.meses)[0] : (Array.from(F.meses).sort().pop() || OTD.nowKey()));
    const nDias = OTD.daysInMonth(mes);
    const sits = ["Autorizada", "Cancelada", "Substituída", "Em processamento"];
    const cores = ["#4ADE80", "#F1553F", "#FFC145", "#4FA3E3"];
    const ds = sits.map(function (s, i) {
      const arr = new Array(nDias).fill(0);
      docs.forEach(function (d) {
        if (d.situacao !== s || d.mesRef !== mes) return;
        const dt = OTD.parseD(d.dt);
        if (dt) arr[dt.getDate() - 1]++;
      });
      return { label: s, data: arr, backgroundColor: cores[i], borderRadius: 3, maxBarThickness: 18 };
    });
    criarGrafico("chVolDia", {
      type: "bar",
      data: { labels: Array.from({ length: nDias }, function (_, i) { return String(i + 1); }), datasets: ds },
      options: {
        plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true, font: { size: 10.5 } } },
                   valores: { formato: "num" } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } }
      }
    });

    /* por emitente */
    const porEmi = new Map();
    docs.forEach(function (d) {
      let a = porEmi.get(d.emitente);
      if (!a) { a = { emi: d.emitente, t: 0, a: 0, c: 0, s: 0, p: 0, rom: new Set() }; porEmi.set(d.emitente, a); }
      a.t++;
      if (d.situacao === "Autorizada") a.a++;
      else if (d.situacao === "Cancelada") a.c++;
      else if (d.situacao === "Substituída") a.s++;
      else if (d.situacao === "Em processamento") a.p++;
      if (d.romaneio) a.rom.add(d.romaneio);
    });
    const lista = Array.from(porEmi.values()).map(function (a) {
      a.taxa = a.t ? 100 * (a.c + a.s) / a.t : 0;
      return a;
    }).sort(function (x, y) { return y.t - x.t; });

    const piores = lista.slice().filter(function (a) { return a.t >= 5; })
      .sort(function (x, y) { return y.taxa - x.taxa; }).slice(0, 3);
    document.getElementById("gridAlertas").innerHTML = piores.length ? piores.map(function (a) {
      const cls = a.taxa > 15 ? "danger" : a.taxa > 8 ? "warn" : "ok";
      return kpi("👤", cls, a.emi, OTD.fmtPct(a.taxa, 1),
        a.c + " cancelados · " + a.s + " substituídos de " + a.t + " docs");
    }).join("") : '<div class="card"><div class="empty-state">Sem emitentes com 5+ documentos no período.</div></div>';

    linhasCache.tbEmi = lista.map(function (a) {
      const cls = a.taxa > 15 ? "b-red" : a.taxa > 8 ? "b-amber" : "b-green";
      return ['<span class="strong">' + E(a.emi) + "</span>",
        OTD.fmtNum(a.t), OTD.fmtNum(a.a), OTD.fmtNum(a.c), OTD.fmtNum(a.s), OTD.fmtNum(a.p),
        '<span class="badge ' + cls + '">' + OTD.fmtPct(a.taxa, 1) + "</span>",
        OTD.fmtNum(a.rom.size)];
    });
    pintarTabela("tbEmi", [
      "Emitente", { t: "Total", right: true }, { t: "Autorizados", right: true },
      { t: "Cancelados", right: true }, { t: "Substituídos", right: true },
      { t: "Em Proc.", right: true }, { t: "Taxa Erro", right: true }, { t: "Viagens", right: true }
    ], linhasCache.tbEmi);
  }

  /* ======================================================================= */
  /* ABA 7 · PROJEÇÃO                                                        */
  /* ======================================================================= */
  function abaProjecao() {
    return secao("Meta & Projeção do Mês") +
      '<div class="grid g-goal" id="gridMeta"></div>' +
      secao("Realizado vs Projeção") +
      painel("chRealProj", "Acumulado realizado × projeção linear", "", "tall") +
      secao("Projeção por Veículo") +
      tabelaCard("tbProj", "Projeção por Veículo", "", true);
  }
  function renderProjecao(rows) {
    const box = document.getElementById("gridMeta");
    if (F.meses.size !== 1 || F.de || F.ate) {
      box.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty-state">' +
        "Selecione <b>exatamente um mês</b> (sem intervalo de datas) para ver meta e projeção.</div></div>";
      const el = document.getElementById("tbProj");
      if (el) pintarTabela("tbProj", ["Placa"], []);
      return;
    }
    const mes = Array.from(F.meses)[0];
    const p = OTD.projectMonth(rows, mes);
    const meta = OTD.getGoal(mes);
    const pctMeta = meta > 0 ? 100 * p.total / meta : 0;
    const pctProj = meta > 0 ? 100 * p.projected / meta : 0;

    box.innerHTML =
      '<div class="card goal-card">' +
        '<div class="ptitle" style="align-self:flex-start">Meta do Mês · ' + E(OTD.monthLabelFull(mes)) + "</div>" +
        '<div class="gauge-wrap"><canvas id="gMeta"></canvas>' +
        '<div class="gauge-center"><div class="pct num" id="pctMeta">—</div><div class="cap">da meta</div></div></div>' +
        '<div class="goal-lines">' +
          '<div class="goal-line"><span>Realizado</span><b class="num">' + OTD.fmtBRL(p.total) + "</b></div>" +
          '<div class="goal-line"><span>Meta</span><b class="num">' + OTD.fmtBRL(meta) + "</b></div>" +
          '<div class="goal-line"><span>Falta</span><b class="num">' + OTD.fmtBRL(Math.max(0, meta - p.total)) + "</b></div>" +
        "</div>" +
        '<div class="goal-edit"><input type="number" id="inMeta" placeholder="nova meta (R$)">' +
        '<button class="btn primary" id="btMeta">Salvar</button></div>' +
      "</div>" +
      '<div class="card goal-card">' +
        '<div class="ptitle" style="align-self:flex-start">Projeção de Fechamento</div>' +
        '<div class="gauge-wrap"><canvas id="gProj"></canvas>' +
        '<div class="gauge-center"><div class="pct num" id="pctProj">—</div><div class="cap">da meta</div></div></div>' +
        '<div class="goal-lines">' +
          '<div class="goal-line"><span>Projeção</span><b class="num">' + OTD.fmtBRL(p.projected) + "</b></div>" +
          '<div class="goal-line"><span>Média diária</span><b class="num">' + OTD.fmtBRL(p.dailyAvg) + "</b></div>" +
          '<div class="goal-line"><span>Apuração</span><b>Dia ' + p.elapsed + " de " + p.totalDays + "</b></div>" +
        "</div>" +
      "</div>" +
      '<div class="card panel"><div class="phead"><span class="ptitle">Faturamento Diário</span>' +
      '<span class="pcount">projeção linear pontilhada</span></div>' +
      '<div class="chart-wrap"><canvas id="chDiarioProj"></canvas></div></div>';

    function gauge(id, pct) {
      const v = Math.max(0, Math.min(100, pct || 0));
      criarGrafico(id, {
        type: "doughnut",
        data: { labels: ["", ""], datasets: [{ data: [v, 100 - v],
          backgroundColor: [pct >= 100 ? "#4ADE80" : "#F0800E", "#221e19"], borderWidth: 0, cutout: "76%" }] },
        options: { rotation: -90, circumference: 180, layout: { padding: 0 },
          plugins: { legend: { display: false }, tooltip: { enabled: false }, valores: false } }
      });
    }
    gauge("gMeta", pctMeta); gauge("gProj", pctProj);
    document.getElementById("pctMeta").textContent = OTD.fmtPct(pctMeta, 0);
    document.getElementById("pctMeta").style.color = pctMeta >= 100 ? "#4ADE80" : "#F0800E";
    document.getElementById("pctProj").textContent = OTD.fmtPct(pctProj, 0);
    document.getElementById("pctProj").style.color = pctProj >= 100 ? "#4ADE80" : "#F0800E";
    document.getElementById("btMeta").addEventListener("click", function () {
      const v = Number(document.getElementById("inMeta").value);
      if (v > 0) { OTD.setGoal(mes, v); render(); }
    });

    const serie = OTD.dailySeries(rows, mes);
    const hoje = new Date();
    const diaHoje = (OTD.monthKey(hoje) === mes) ? hoje.getDate() : p.totalDays;
    criarGrafico("chDiarioProj", {
      type: "line",
      data: {
        labels: serie.map(function (_, i) { return String(i + 1); }),
        datasets: [
          { label: "Realizado", data: serie.map(function (v, i) { return i < diaHoje ? v : null; }),
            borderColor: "#F0800E", backgroundColor: "rgba(240,128,14,.14)", fill: true,
            tension: .32, pointRadius: 2.5, borderWidth: 2.4 },
          { label: "Projeção", data: serie.map(function (v, i) { return i >= diaHoje - 1 ? p.dailyAvg : null; }),
            borderColor: "#4FA3E3", borderDash: [6, 5], fill: false, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: {
        plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true } },
          valores: { formato: "brl", somenteDataset: 0 },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + OTD.fmtBRL(c.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } }, x: { grid: { display: false } } }
      }
    });

    /* realizado vs projeção (acumulado) */
    let acc = 0;
    const realAcum = serie.map(function (v, i) { acc += v; return i < diaHoje ? acc : null; });
    const projAcum = serie.map(function (_, i) { return p.dailyAvg * (i + 1); });
    const metaLinha = serie.map(function (_, i) { return meta * (i + 1) / p.totalDays; });
    criarGrafico("chRealProj", {
      type: "line",
      data: {
        labels: serie.map(function (_, i) { return String(i + 1); }),
        datasets: [
          { label: "Realizado acumulado", data: realAcum, borderColor: "#F0800E",
            backgroundColor: "rgba(240,128,14,.14)", fill: true, tension: .25, pointRadius: 0, borderWidth: 3 },
          { label: "Projeção linear", data: projAcum, borderColor: "#4FA3E3",
            borderDash: [6, 5], fill: false, pointRadius: 0, borderWidth: 2 },
          { label: "Ritmo da meta", data: metaLinha, borderColor: "#4ADE80",
            borderDash: [2, 4], fill: false, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: {
        plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true } },
          valores: { formato: "brl", somenteDataset: 0 },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + OTD.fmtBRL(c.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } }, x: { grid: { display: false } } }
      }
    });

    /* projeção por veículo */
    const mv = metaVeiculo();
    linhasCache.tbProj = agrupar(rows, function (r) { return r.placa; }).map(function (a) {
      const media = p.elapsed ? a.frete / p.elapsed : 0;
      const proj = media * p.totalDays;
      const pctV = mv > 0 ? 100 * proj / mv : 0;
      return [
        '<span class="strong">' + E(a.chave) + "</span>",
        OTD.fmtBRL(a.frete), OTD.fmtBRL(media), OTD.fmtBRL(proj), OTD.fmtBRL(mv),
        '<span class="badge ' + (pctV >= 100 ? "b-green" : pctV >= 70 ? "b-amber" : "b-grey") + '">' +
          OTD.fmtPct(pctV, 0) + "</span>",
        '<span class="pbar' + (pctV >= 100 ? " ok" : "") + '"><i style="width:' +
          Math.min(100, pctV) + '%"></i></span>'
      ];
    });
    pintarTabela("tbProj", [
      "Placa", { t: "Realizado", right: true }, { t: "Média/Dia", right: true },
      { t: "Projeção Mês", right: true }, { t: "Meta", right: true },
      { t: "% Meta", right: true }, "Progresso"
    ], linhasCache.tbProj);
  }

  /* ======================================================================= */
  /* ABA 8 · OMS                                                             */
  /* ======================================================================= */
  function abaOms() {
    return secao("OMS · Qualidade Operacional", '<span class="hint" id="hintOms"></span>') +
      '<div class="grid g-2" id="gridOms"></div>' +
      painel("chOms", "Comparativo Bens de Consumo × Latas", "OTP · OTD · KM vazio", "short") +
      '<div class="grid g-2" style="margin-top:14px">' +
        tabelaCard("tbOtp", "Coletas atrasadas (OTP)", "", false) +
        tabelaCard("tbOtd", "Entregas atrasadas (OTD)", "", false) +
      "</div>" +
      '<div style="margin-top:14px">' +
        tabelaCard("tbVazio", "Cargas ofensoras de KM vazio · Latas > 50%, Bens de Consumo > 20%", "", false) +
      "</div>" +
      secao("Avarias & Sinistros", '<span class="hint">preenchimento manual na reunião</span>') +
      '<div class="grid g-4" id="gridManual"></div>';
  }
  function renderOms() {
    const oms = OTD.OMS;
    const box = document.getElementById("gridOms");
    if (!oms) { box.innerHTML = '<div class="card"><div class="empty-state">Sem dados de OMS.</div></div>'; return; }
    const painelOms = oms.painel;
    const dias = (painelOms.dias || oms.dias || []).map(OTD.fmtData).join(", ");
    document.getElementById("hintOms").textContent =
      "reunião de " + OTD.fmtData(oms.dataReuniao) + " · dia" + (oms.consolidado ? "s" : "") +
      " avaliado" + (oms.consolidado ? "s" : "") + ": " + dias;

    box.innerHTML = Object.keys(painelOms.grupos).map(function (g) {
      const d = painelOms.grupos[g];
      function clsPct(v) { return v === null || v === undefined ? "warn" : (v >= 90 ? "ok" : v >= 75 ? "warn" : "danger"); }
      function clsVz(v) { return v === null || v === undefined ? "warn" : (v <= 25 ? "ok" : v <= 40 ? "warn" : "danger"); }
      function cor(cls) { return cls === "ok" ? "#4ADE80" : cls === "warn" ? "#FFC145" : cls === "danger" ? "#F1553F" : "#F6F4F0"; }
      function c(ico, cls, lbl, val, sub) {
        return '<div class="card kpi"><div class="top"><div class="ico ' + cls + '">' + ico + "</div>" +
          '<div class="lbl">' + E(lbl) + "</div></div>" +
          '<div class="val num" style="color:' + cor(cls) + '">' + val + "</div>" +
          '<div class="sub">' + E(sub) + "</div></div>";
      }
      function sub(t, a) { return !t ? "nenhuma no período" : (!a ? "todas as " + t + " no prazo" : a + " de " + t + " atrasadas"); }
      return '<div class="oms-group"><h3>' + E(NOME_GRUPO[g] || g) + "</h3><div class='grid g-3'>" +
        c("📦", clsPct(d.otpPct), "OTP · coletas no prazo", OTD.fmtPct(d.otpPct), sub(d.otpTotal, d.otpAtrasadas)) +
        c("🏁", clsPct(d.otdPct), "OTD · entregas no prazo", OTD.fmtPct(d.otdPct), sub(d.otdTotal, d.otdAtrasadas)) +
        c("🅿️", clsVz(d.vazioMedia), "KM vazio", OTD.fmtPct(d.vazioMedia), "média de " + d.vazioN + " romaneios") +
        "</div></div>";
    }).join("");

    const grupos = Object.keys(painelOms.grupos);
    criarGrafico("chOms", {
      type: "bar",
      data: {
        labels: ["OTP (coletas)", "OTD (entregas)", "KM vazio"],
        datasets: grupos.map(function (g, i) {
          const d = painelOms.grupos[g];
          return { label: NOME_GRUPO[g] || g, data: [d.otpPct || 0, d.otdPct || 0, d.vazioMedia || 0],
                   backgroundColor: OTD.PALETTE[i], borderRadius: 6, maxBarThickness: 54 };
        })
      },
      options: {
        plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true } },
          valores: { formato: "pct", fonte: 15 },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + OTD.fmtPct(c.parsed.y); } } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + "%"; } } },
                  x: { grid: { display: false } } }
      }
    });

    const colsAtraso = ["Data", "Grupo", "Cliente", "Romaneio", "Atraso", "Programado", "Realizado", "Motorista", "Placa", "Rota"];
    function linhasAtraso(arr) {
      return arr.map(function (a) {
        return [OTD.fmtData(a.data), '<span class="badge b-grey">' + E(NOME_GRUPO[a.grupo] || a.grupo) + "</span>",
          E(OTD.shortName(a.cliente, 22)), '<span class="strong">' + E(a.romaneio) + "</span>",
          '<span class="badge ' + OTD.corSeveridade(a.sev) + '">' + OTD.fmtHoras(a.atrasoH) + " · " + OTD.rotuloSeveridade(a.sev) + "</span>",
          OTD.fmtDataHora(a.programado), OTD.fmtDataHora(a.realizado),
          E(OTD.shortName(a.motorista, 20)), E(a.placa), E(OTD.shortName(a.rota, 32))];
      });
    }
    pintarTabela("tbOtp", colsAtraso, linhasAtraso(painelOms.atrasosOTP));
    pintarTabela("tbOtd", colsAtraso, linhasAtraso(painelOms.atrasosOTD));
    pintarTabela("tbVazio", ["Data", "Grupo", "Cliente", "Romaneio", "% vazio", "KM vazio",
      "KM carregado", "Motorista", "Rota (vazio → carregamento)"],
      painelOms.ofensoresVazio.map(function (o) {
        return [OTD.fmtData(o.data), '<span class="badge b-grey">' + E(NOME_GRUPO[o.grupo] || o.grupo) + "</span>",
          E(OTD.shortName(o.cliente, 22)), '<span class="strong">' + E(o.romaneio) + "</span>",
          '<span class="badge ' + OTD.corSeveridade(o.sev) + '">' + OTD.fmtPct(o.pct) + " · " + OTD.rotuloSeveridade(o.sev) + "</span>",
          OTD.fmtNum(o.kmVazio, 1), OTD.fmtNum(o.kmCarreg, 1),
          E(OTD.shortName(o.motorista, 20)), E(OTD.shortName(o.rotaVazio, 38))];
      }));

    document.getElementById("gridManual").innerHTML =
      ["Avaria · Bens de Consumo", "Avaria · Latas", "Sinistro · Bens de Consumo", "Sinistro · Latas"]
      .map(function (t) {
        return '<div class="card kpi manual-card"><div class="top"><div class="ico warn">✍️</div>' +
          '<div class="lbl">' + E(t) + "</div></div><div class='val'>—</div>" +
          "<div class='sub'>(preencher manualmente)</div></div>";
      }).join("");
  }

  /* ======================================================================= */
  /* ABA 9 · CONTROLE DE ENTREGAS                                            */
  /* ======================================================================= */
  const ORDEM_ENTREGA = [
    ["em_descarga", "Em descarga", ""],
    ["destinado", "Destinado", ""],
    ["em_viagem", "Em viagem", ""],
    ["finalizada", "Finalizadas", "no dia avaliado"]
  ];
  function abaEntregas() {
    return secao("Controle de Entregas", '<span class="live-tag">tempo real</span>' +
      '<span class="hint" id="hintEntregas"></span>') +
      '<div class="grid g-2" id="gridEntregas"></div>';
  }
  function renderEntregas() {
    const ent = OTD.ENTREGAS;
    const box = document.getElementById("gridEntregas");
    if (!ent) { box.innerHTML = '<div class="card"><div class="empty-state">Sem dados.</div></div>'; return; }
    document.getElementById("hintEntregas").textContent = " dia avaliado: " + OTD.fmtData(ent.dia);
    box.innerHTML = Object.keys(ent.grupos).map(function (g) {
      const bloco = ent.grupos[g];
      return '<div class="card"><h3 style="margin:0 0 14px;font-size:12px;text-transform:uppercase;' +
        'letter-spacing:1.2px;color:var(--text-dim)">' + E(NOME_GRUPO[g] || g) + "</h3>" +
        ORDEM_ENTREGA.map(function (s) {
          const lista = bloco[s[0]] || [];
          return '<div class="status-col" style="margin-bottom:16px"><h4>' + E(s[1]) +
            '<span class="cnt">' + lista.length + "</span>" +
            (s[2] ? '<span style="font-weight:400;color:var(--text-faint);font-size:10.5px">' + E(s[2]) + "</span>" : "") +
            "</h4>" +
            (lista.length ? lista.slice(0, 14).map(function (c) {
              return '<div class="miniline"><b>' + E(c.romaneio) + "</b> · " + E(OTD.shortName(c.cliente, 22)) +
                " · " + E(c.placa) + " · " + E(OTD.shortName(c.motorista, 20)) +
                '<br><span style="color:var(--text-faint)">' + E(OTD.shortName(c.rota, 52)) + "</span></div>";
            }).join("") + (lista.length > 14 ? '<div class="miniline" style="color:var(--text-faint)">+ ' +
              (lista.length - 14) + " outras…</div>" : "")
              : '<div class="miniline" style="color:var(--text-faint)">Nenhuma carga nesse status no momento.</div>') +
            "</div>";
        }).join("") + "</div>";
    }).join("");
  }

  /* ======================================================================= */
  /* ABA 10 · PAINEL OPERACIONAL                                             */
  /* ======================================================================= */
  function abaOperacional() {
    return secao("Painel Operacional", '<span class="live-tag">tempo real</span>' +
      '<span class="hint">ignora o filtro de período</span>') +
      '<div class="grid g-3" id="gridOperacional"></div>' +
      '<div class="grid g-kpi" id="gridContadorOp" style="margin-top:14px"></div>' +
      '<div class="grid g-2" style="margin-top:14px">' +
        '<div class="card tablecard"><div class="tablehead"><span class="ptitle">Em Trânsito</span>' +
        '<span class="spacer"></span><span class="pcount" id="pgTransito"></span></div>' +
        '<div class="tablewrap"><table class="dtbl" id="tblTransito"></table></div></div>' +
        '<div class="card tablecard"><div class="tablehead"><span class="ptitle">Aguardando Início</span>' +
        '<span class="spacer"></span><span class="pcount" id="pgAguardando"></span></div>' +
        '<div class="tablewrap"><table class="dtbl" id="tblAguardando"></table></div></div>' +
      "</div>" +
      secao("Viagens no Período") +
      '<div class="card tablecard">' +
        '<div class="tablehead"><span class="ptitle">Documentos faturados</span><span class="spacer"></span>' +
        '<input type="text" id="buscaViagens" placeholder="Buscar cliente, motorista, placa, rota, documento…" style="min-width:320px"></div>' +
        '<div class="tablewrap"><table class="dtbl" id="tblViagens"></table></div>' +
        '<div class="tablefoot"><span id="infoViagens">—</span>' +
        '<span>página <b id="pgViagens">1</b> · troca automática a cada 5s</span></div>' +
      "</div>";
  }
  function renderOperacional() {
    if (abaAtiva !== "operacional") return;
    const ops = OTD.operational(F);
    const c = OTD.statusCounts(ops);
    const el = document.getElementById("gridOperacional");
    if (!el) return;
    el.innerHTML =
      kpi("🚛", "info", "Em Trânsito", OTD.fmtNum(c.em_transito), "carga iniciada, sem descarga") +
      kpi("⏳", "warn", "Aguardando Início", OTD.fmtNum(c.nao_iniciado), "romaneio sem carregamento") +
      kpi("✅", "ok", "Concluídas", OTD.fmtNum(c.concluido), "descarga iniciada");

    const cols = ["Grupo", "Cliente", "Romaneio", "Placa", "Motorista", "Rota", "Início"];
    function linhas(arr, campoData) {
      return arr.map(function (v) {
        return ['<span class="badge b-blue">' + E(v.grupo) + "</span>",
          E(OTD.shortName(v.cliente, 24)), '<span class="strong">' + E(v.id) + "</span>",
          E(v.placa), E(OTD.shortName(v.motorista, 22)), E(OTD.shortName(v.rota, 34)),
          OTD.fmtDataHora(v[campoData])];
      });
    }
    const trans = linhas(ops.filter(function (v) { return v.status === "em_transito"; })
      .sort(function (a, b) { return (b.dtCargaI || "").localeCompare(a.dtCargaI || ""); }), "dtCargaI");
    const aguard = linhas(ops.filter(function (v) { return v.status === "nao_iniciado"; })
      .sort(function (a, b) { return (a.dtSol || "").localeCompare(b.dtSol || ""); }), "dtSol");
    const r1 = pintarTabela("tblTransito", cols, trans, pag.transito, LINHAS_OP);
    const r2 = pintarTabela("tblAguardando", cols, aguard, pag.aguardando, LINHAS_OP);
    document.getElementById("pgTransito").textContent = r1.total + " cargas · pág " + r1.pagina + "/" + r1.nPag;
    document.getElementById("pgAguardando").textContent = r2.total + " cargas · pág " + r2.pagina + "/" + r2.nPag;

    const cc = OTD.contadorCargas(F);
    const gc = document.getElementById("gridContadorOp");
    if (gc) gc.innerHTML =
      cardContador("emTransito", cc.emTransito) + cardContador("aguardando", cc.aguardando) +
      cardContador("emViagem", cc.emViagem) + cardContador("destinado", cc.destinado) +
      cardContador("emDescarga", cc.emDescarga) +
      cardContador("finalizadasDia", cc.finalizadasDia, OTD.fmtData(cc.dia));
  }

  function prepararViagens(rows) {
    const el = document.getElementById("buscaViagens");
    if (!el) return;
    const q = (el.value || "").toLowerCase();
    let arr = rows.slice().sort(function (a, b) {
      return String(b.dtEmissao || b.dtCargaI || "").localeCompare(String(a.dtEmissao || a.dtCargaI || ""));
    });
    if (q) arr = arr.filter(function (r) {
      return (r.cliente + " " + r.motorista + " " + r.placa + " " + r.rota + " " +
              r.doc + " " + r.id + " " + r.seg + " " + r.emitente).toLowerCase().indexOf(q) >= 0;
    });
    const bSt = { concluido: "b-green", em_transito: "b-blue", nao_iniciado: "b-amber" };
    const nSt = { concluido: "Concluída", em_transito: "Em trânsito", nao_iniciado: "Aguardando" };
    linhasCache.tblViagens = arr.map(function (r) {
      return [OTD.fmtData(r.dtEmissao || r.dtCargaI),
        '<span class="badge ' + (r.tipoDoc === "CRT" ? "b-orange" : r.tipoDoc === "PG" ? "b-grey" : "b-blue") + '">' + E(r.tipoDoc) + "</span>",
        '<span class="strong">' + E(r.doc) + "</span>", E(r.id),
        E(OTD.shortName(r.cliente, 22)), E(r.seg), E(r.modalidade),
        E(OTD.shortName(r.rota, 34)), E(r.placa), E(OTD.shortName(r.motorista, 22)),
        E(r.emitente),
        '<span style="color:var(--orange-soft);font-weight:700">' + OTD.fmtBRL(r.frete) + "</span>",
        '<span class="badge ' + (bSt[r.status] || "b-grey") + '">' + (nSt[r.status] || "—") + "</span>"];
    });
    pag.viagens = 0;
    pintarViagens();
  }
  function pintarViagens() {
    if (!document.getElementById("tblViagens")) return;
    const cols = ["Data", "Tipo", "Documento", "Romaneio", "Cliente", "Segmento", "Modalidade",
                  "Rota", "Placa", "Motorista", "Emitente", { t: "Faturamento", right: true }, "Status"];
    const r = pintarTabela("tblViagens", cols, linhasCache.tblViagens || [], pag.viagens, LINHAS_PAGINA);
    document.getElementById("pgViagens").textContent = r.pagina + "/" + r.nPag;
    document.getElementById("infoViagens").textContent =
      OTD.fmtNum(r.total) + " documentos · " + OTD.fmtBRL(OTD.totalFaturamento(OTD.filterAll(F)));
  }

  /* ======================================================================= */
  /* ABA 11 · REGRAS                                                         */
  /* ======================================================================= */
  const REGRAS = [
    ["R1", "<b>BENS + OTD SJP</b> → KM Vazio = 0 (carregamento na base própria)."],
    ["R2", "<b>LATAS + Crown Cabreúva → SPAL Jundiaí</b> → KM Vazio = KM Carregado = 21 km (fixo). Nunca entra como ofensora."],
    ["R3", "<b>LATAS + VIP Cajamar → SPAL Jundiaí</b> → KM Vazio = KM Carregado = 31 km (fixo). Nunca entra como ofensora."],
    ["R4", "<b>LATAS + carregamento Jundiaí (SPAL origem)</b> → KM Vazio = 0."],
    ["R5", "<b>Crown PG × Heineken PG</b> → KM Vazio = 8, KM Carregado = 8."],
    ["R6", "<b>Crown PG × SPM PG</b> → KM Vazio = 4, KM Carregado = 4."],
    ["R7", "<b>Heineken PG × Crown PG</b> → KM Vazio = 8, KM Carregado = 8."],
    ["R8", "<b>LATAS PG × PG (não-NBH)</b> → R$ 630,53/carga (≤ abr/26) · R$ 662,06 (≥ mai/26). A data da receita é a <b>Dt. Carga (I) real da lviagens</b> (cruzando pelo romaneio); só cai na data programada do lcargas quando o romaneio não existe lá. Só conta até hoje."],
    ["R9", "<b>Placa NBH9F10 + PG × PG</b> → R$ 1.600,00/dia ÷ nº de cargas do dia."],
    ["R10", "<b>CTe substituto</b> → data corrigida para a data original (\"emitido em: …\" na Observação)."],
    ["R11", "<b>SPAL (todas as filiais)</b> → consolidado como grupo único. HEINEKEN conta como CROWN (pagador)."],
    ["R12", "<b>R$/KM</b> = Σ(faturamento) ÷ Σ(KM Vazio + KM Carregado) por romaneio."],
    ["R13", "<b>Meta por segmento</b> = soma das metas de todas as placas cujo segmento primário é o segmento."]
  ];
  const REGRAS_FATURAMENTO = [
    ["F1", "Faturamento = <b>Total do conhec.</b> dos CT-e com <b>Situação = Autorizada</b>. Dedup por <b>Nº conhec.</b>"],
    ["F2", "CRT vem do <b>lcrt</b> (não do CT-e): soma <b>Valor total CRT (R$)</b> dos não-cancelados. <b>Não</b> filtra por \"Faturado?\". CT-e com prefixo <b>BR.</b> é removido."],
    ["F3", "CT-e com frete zerado cujo romaneio existe no lcrt recebe o valor do CRT. Linha com vários romaneios divide o valor igualmente."],
    ["F4", "CRT sem romaneio válido/sem viagem vira registro <b>órfão</b> — receita real sem viagem vinculada."],
    ["F5", "KM vem do lviagens por Nº Romaneio e é <b>dividido entre os CT-es do romaneio</b> (não infla)."],
    ["F6", "Carga sem Nota Fiscal é descartada, <b>exceto</b> se o romaneio existe no lcrt."],
    ["OMS1", "Atraso = <b>LVIAGENS − referência</b>; delta &gt; 0 já é atrasado. Cruzamento por Nº Romaneio, 1º match. Sem match = no prazo."],
    ["OMS1b", "<b>Rotas com carga pré-datada</b> (Cabreúva/Cajamar ↔ Jundiaí e Ponta Grossa × Ponta Grossa): o OTP mede contra a <b>Dt. Prev. (C) da LVIAGENS</b>, não contra a data do lcargas. Motivo: nessas linhas a operação deixa cargas prontas com data de fim de mês, o que fazia a coleta entrar como \"no prazo\" automaticamente."],
    ["OMS2", "Severidade do atraso: ≥ 8h <b>Crítico</b> · 2h–8h <b>Atenção</b> · &lt; 2h <b>Leve</b>."],
    ["OMS3", "KM vazio ofensor: <b>Latas &gt; 50%</b>, <b>Bens de Consumo &gt; 20%</b>. Severidade ≥50% Crítico · 35–50% Atenção · &lt;35% Leve."],
    ["OMS4", "Rota do indicador de KM vazio = <b>\"Vazio de\" → \"Carregamento\"</b>."],
    ["OMS5", "Segunda-feira apura 3 dias consolidados (soma das contagens + média simples dos percentuais)."],
    ["ENT1", "Controle de Entregas em 4 status exclusivos: Finalizadas → Em descarga → Em viagem → Destinado. Só Finalizadas filtra pelo dia avaliado."]
  ];

  function abaRegras() {
    const M = OTD.META;
    function bloco(titulo, lista) {
      return card('<div class="phead"><span class="ptitle">' + E(titulo) + "</span></div>" +
        lista.map(function (r) {
          return '<div class="rule"><span class="cod">' + E(r[0]) + "</span><span>" + r[1] + "</span></div>";
        }).join(""));
    }
    function aud(rot, val) {
      return '<div class="goal-line"><span>' + E(rot) + "</span><b class='num'>" + E(String(val)) + "</b></div>";
    }
    return secao("Regras de Negócio · KM, Preço e Metas") +
      bloco("Regras da operação (R1–R13)", REGRAS) +
      secao("Regras de Faturamento e OMS") +
      bloco("Pipeline", REGRAS_FATURAMENTO) +
      secao("Auditoria da Base") +
      '<div class="grid g-2">' +
        card('<div class="phead"><span class="ptitle">Origem dos dados</span></div>' +
          '<div class="goal-lines">' +
          aud("Gerado em", OTD.fmtDataHora(M.geradoEm)) +
          aud("Arquivo CT-e", M.arquivoOrigem) +
          aud("Arquivo CRT", M.arquivoCrt) +
          aud("Arquivo viagens", M.arquivoViagens) +
          aud("Arquivo cargas", M.arquivoCargas) +
          aud("Reunião OMS", OTD.fmtData(M.dataReuniaoOMS)) +
          "</div>") +
        card('<div class="phead"><span class="ptitle">Contagens de auditoria</span></div>' +
          '<div class="goal-lines">' +
          aud("CT-e ignorados (não autorizados)", OTD.fmtNum(M.registrosIgnoradosNaoAutorizado)) +
          aud("CT-e ignorados (prefixo BR.)", OTD.fmtNum(M.registrosIgnoradosCteBR)) +
          aud("CT-e ignorados (sem NF e sem CRT)", OTD.fmtNum(M.registrosIgnoradosSemNFSemCRT)) +
          aud("CT-e enriquecidos pelo lcrt", OTD.fmtNum(M.registrosEnriquecidosCRT) + " · " + OTD.fmtBRL(M.valorEnriquecidoCRT)) +
          aud("CRT órfãos (sem viagem)", OTD.fmtNum(M.crtOrfaosSemViagem) + " · " + OTD.fmtBRL(M.valorCrtOrfaos)) +
          aud("CRT cancelados (fora)", OTD.fmtNum(M.crtCancelados)) +
          aud("Ponta Grossa faturado (R8/R9)", OTD.fmtNum(M.pgCargasFaturadas) + " · " + OTD.fmtBRL(M.pgValor)) +
          aud("Ponta Grossa com data futura (fora)", OTD.fmtNum(M.pgFuturaIgnorada)) +
          aud("Romaneios PG sem regra de KM", OTD.fmtNum(M.pontaGrossaSemRegraKm)) +
          aud("Meta por placa vigente", OTD.fmtBRL(metaVeiculo())) +
          "</div>") +
      "</div>";
  }

  /* ======================================================================= */
  /* REGISTRO DAS ABAS                                                       */
  /* ======================================================================= */
  const ABAS = [
    { id: "geral", ico: "📊", nome: "Visão Geral", html: abaGeral, render: renderGeral },
    { id: "clientes", ico: "👥", nome: "Clientes", html: abaClientes, render: renderClientes },
    { id: "veiculos", ico: "🚛", nome: "Veículos", html: abaVeiculos, render: renderVeiculos },
    { id: "motoristas", ico: "👤", nome: "Motoristas", html: abaMotoristas, render: renderMotoristas },
    { id: "rotas", ico: "🗺️", nome: "Rotas & UF", html: abaRotas, render: renderRotas },
    { id: "cte", ico: "📄", nome: "CTE & Emissão", html: abaCte, render: renderCte },
    { id: "projecao", ico: "🎯", nome: "Projeção", html: abaProjecao, render: renderProjecao },
    { id: "oms", ico: "🧭", nome: "OMS", html: abaOms, render: renderOms },
    { id: "entregas", ico: "📦", nome: "Entregas", html: abaEntregas, render: renderEntregas },
    { id: "operacional", ico: "🛰️", nome: "Operacional", html: abaOperacional,
      render: function (rows) { renderOperacional(); prepararViagens(rows); } },
    { id: "regras", ico: "⚙️", nome: "Regras", html: abaRegras, render: function () { } }
  ];

  function montarAbas() {
    document.getElementById("tabs").innerHTML = ABAS.map(function (a) {
      return '<button class="tab" data-aba="' + a.id + '">' + a.ico + " " + E(a.nome) + "</button>";
    }).join("");
    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { abaAtiva = b.dataset.aba; render(); });
    });
  }

  /* ======================================================================= */
  /* FILTROS                                                                 */
  /* ======================================================================= */
  function opcoes(sel, valores, rotulo) {
    const el = document.getElementById(sel);
    el.innerHTML = '<option value="">' + E(rotulo) + "</option>" +
      valores.map(function (v) { return '<option value="' + E(v) + '">' + E(v) + "</option>"; }).join("");
  }

  function montarFiltros() {
    const meses = OTD.availableMonths();
    document.getElementById("selMes").innerHTML =
      '<option value="">Todos</option>' + meses.map(function (m) {
        return '<option value="' + m + '">' + E(m.slice(5) + "/" + m.slice(0, 4)) + "</option>";
      }).join("");
    opcoes("selSeg", OTD.distinctSegmentos(), "Todos");
    opcoes("selMod", Array.from(new Set(OTD.DATA.map(function (r) { return r.modalidade; })
      .filter(Boolean))).sort(), "Todas");
    opcoes("selEmi", (OTD.META.emitentes || []).concat(["CRT", "PONTA GROSSA"]).sort(), "Todos");

    document.getElementById("selMes").addEventListener("change", function (e) {
      F.meses.clear();
      if (e.target.value) F.meses.add(e.target.value);
      F.de = F.ate = null;
      document.getElementById("dtDe").value = "";
      document.getElementById("dtAte").value = "";
      render();
    });
    ["dtDe", "dtAte"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        F.de = document.getElementById("dtDe").value || null;
        F.ate = document.getElementById("dtAte").value || null;
        if (F.de || F.ate) { F.meses.clear(); document.getElementById("selMes").value = ""; }
        render();
      });
    });
    function ligaSelect(id, alvo) {
      document.getElementById(id).addEventListener("change", function (e) {
        alvo.clear();
        if (e.target.value) alvo.add(e.target.value);
        render();
      });
    }
    ligaSelect("selSeg", F.segs);
    ligaSelect("selMod", F.modalidades);
    ligaSelect("selEmi", F.emitentes);

    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        const meses2 = OTD.availableMonths(), atual = OTD.nowKey();
        F.meses.clear(); F.de = F.ate = null;
        document.getElementById("dtDe").value = "";
        document.getElementById("dtAte").value = "";
        if (b.dataset.preset === "mes") F.meses.add(meses2.indexOf(atual) >= 0 ? atual : meses2[meses2.length - 1]);
        else if (b.dataset.preset === "anterior") {
          const alvo = OTD.prevMonthKey(atual);
          F.meses.add(meses2.indexOf(alvo) >= 0 ? alvo : meses2[Math.max(0, meses2.length - 2)]);
        } else if (b.dataset.preset === "3m") meses2.slice(-3).forEach(function (m) { F.meses.add(m); });
        else meses2.filter(function (m) { return m.slice(0, 4) === atual.slice(0, 4); })
          .forEach(function (m) { F.meses.add(m); });
        document.getElementById("selMes").value = F.meses.size === 1 ? Array.from(F.meses)[0] : "";
        render();
      });
    });

    document.getElementById("btnLimpar").addEventListener("click", function () {
      [F.meses, F.clientes, F.motoristas, F.placas, F.rotas, F.segs, F.modalidades, F.emitentes]
        .forEach(function (s) { s.clear(); });
      F.de = F.ate = null;
      ["dtDe", "dtAte"].forEach(function (id) { document.getElementById(id).value = ""; });
      ["selMes", "selSeg", "selMod", "selEmi"].forEach(function (id) { document.getElementById(id).value = ""; });
      ["msCliente", "msMotorista", "msPlaca", "msRota"].forEach(function (id) {
        const el = document.getElementById(id); if (el.__sync) el.__sync();
      });
      const meses2 = OTD.availableMonths(), atual = OTD.nowKey();
      const alvo = meses2.indexOf(atual) >= 0 ? atual : meses2[meses2.length - 1];
      F.meses.add(alvo);
      document.getElementById("selMes").value = alvo;
      render();
    });

    montarMultiselect("msCliente", "Cliente", OTD.distinctClientes(), F.clientes);
    montarMultiselect("msMotorista", "Motorista", OTD.distinctMotoristas(), F.motoristas);
    montarMultiselect("msPlaca", "Placa", OTD.distinctPlacas(), F.placas);
    montarMultiselect("msRota", "Rota", OTD.distinctRotas(), F.rotas);

    document.addEventListener("click", function () {
      document.querySelectorAll(".ms.open").forEach(function (o) { o.classList.remove("open"); });
    });
  }

  function montarMultiselect(id, rotulo, valores, alvo) {
    const el = document.getElementById(id);
    el.innerHTML =
      '<button class="btn ms-toggle"><span>' + E(rotulo) + '</span><span class="cnt" style="display:none">0</span></button>' +
      '<div class="ms-pop"><input type="text" placeholder="Buscar…"><div class="ms-list"></div>' +
      '<div class="ms-actions"><button class="btn bt-todos">Todos</button>' +
      '<button class="btn bt-nenhum">Nenhum</button></div></div>';
    const lista = el.querySelector(".ms-list");
    lista.innerHTML = valores.map(function (v) {
      return '<label class="ms-item"><input type="checkbox" value="' + E(v) + '">' +
             "<span>" + E(OTD.shortName(v, 40)) + "</span></label>";
    }).join("");
    const cnt = el.querySelector(".cnt");
    function sync() {
      cnt.textContent = alvo.size;
      cnt.style.display = alvo.size ? "inline-block" : "none";
      render();
    }
    lista.addEventListener("change", function (ev) {
      if (ev.target.checked) alvo.add(ev.target.value); else alvo.delete(ev.target.value);
      sync();
    });
    el.querySelector(".ms-toggle").addEventListener("click", function (ev) {
      ev.stopPropagation();
      document.querySelectorAll(".ms.open").forEach(function (o) { if (o !== el) o.classList.remove("open"); });
      el.classList.toggle("open");
    });
    el.querySelector(".ms-pop input").addEventListener("input", function (ev) {
      const q = ev.target.value.toLowerCase();
      lista.querySelectorAll(".ms-item").forEach(function (it) {
        it.style.display = it.textContent.toLowerCase().indexOf(q) >= 0 ? "flex" : "none";
      });
    });
    el.querySelector(".bt-todos").addEventListener("click", function () {
      lista.querySelectorAll("input").forEach(function (cb) {
        if (cb.parentElement.style.display !== "none") { cb.checked = true; alvo.add(cb.value); }
      });
      sync();
    });
    el.querySelector(".bt-nenhum").addEventListener("click", function () {
      lista.querySelectorAll("input").forEach(function (cb) { cb.checked = false; });
      alvo.clear(); sync();
    });
    el.__sync = function () {
      lista.querySelectorAll("input").forEach(function (cb) { cb.checked = alvo.has(cb.value); });
      cnt.textContent = alvo.size;
      cnt.style.display = alvo.size ? "inline-block" : "none";
    };
  }

  /* filtro por modalidade/emitente não está no common.js (é específico daqui) */
  function filtrar() {
    let rows = OTD.filterAll(F);
    if (F.modalidades.size) rows = rows.filter(function (r) { return F.modalidades.has(r.modalidade); });
    if (F.emitentes.size) rows = rows.filter(function (r) { return F.emitentes.has(r.emitente); });
    return rows;
  }

  /* ======================================================================= */
  /* BUSCA NAS TABELAS                                                       */
  /* ======================================================================= */
  function ligarBuscas() {
    document.querySelectorAll("input.busca").forEach(function (inp) {
      inp.addEventListener("input", function () {
        const alvo = inp.dataset.alvo;
        const q = inp.value.toLowerCase();
        const el = document.getElementById(alvo);
        if (!el) return;
        el.querySelectorAll("tbody tr").forEach(function (tr) {
          tr.style.display = tr.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none";
        });
      });
    });
  }

  /* ======================================================================= */
  /* RENDER GERAL                                                            */
  /* ======================================================================= */
  function render() {
    const rows = filtrar();

    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("on", b.dataset.aba === abaAtiva);
    });

    let periodo;
    if (F.de || F.ate) periodo = (F.de ? OTD.fmtData(F.de) : "início") + " → " + (F.ate ? OTD.fmtData(F.ate) : "hoje");
    else if (F.meses.size) periodo = Array.from(F.meses).sort().map(OTD.monthLabel).join(", ");
    else periodo = "toda a base";
    document.getElementById("pillPeriodo").textContent = periodo;
    document.getElementById("pillTotal").textContent =
      OTD.fmtNum(rows.length) + " reg · " + OTD.fmtBRLcents(OTD.totalFaturamento(rows));
    document.getElementById("contadorRegistros").textContent = OTD.fmtNum(rows.length) + " registros";

    const aba = ABAS.filter(function (a) { return a.id === abaAtiva; })[0] || ABAS[0];
    document.getElementById("conteudo").innerHTML = '<div class="tabpane">' + aba.html(rows) + "</div>";
    try { aba.render(rows); } catch (e) { console.error(e); }
    ligarBuscas();

    const hp = document.getElementById("hintPeriodo");
    if (hp) hp.textContent = "período: " + periodo;
    const bv = document.getElementById("buscaViagens");
    if (bv) bv.addEventListener("input", function () { prepararViagens(filtrar()); });

    document.getElementById("footEscopo").textContent =
      "Escopo: " + (OTD.META.segmentos || []).join(" · ") +
      " · faturamento CT-e + CRT + Ponta Grossa (R8/R9) · OMS Bens/Latas";
    document.getElementById("footBase").textContent =
      "Base atualizada em " + OTD.fmtDataHora(OTD.META.geradoEm) + " · " +
      OTD.fmtNum(OTD.META.totalViagens) + " viagens · " +
      OTD.fmtNum(OTD.META.totalRegistros) + " documentos";
  }

  /* ======================================================================= */
  /* BOOT                                                                    */
  /* ======================================================================= */
  function tickRelogio() {
    const d = new Date();
    document.getElementById("relogio").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") +
      ":" + String(d.getSeconds()).padStart(2, "0");
    document.getElementById("dataHoje").textContent =
      OTD.DIAS_PT_FULL[d.getDay()] + ", " + d.getDate() + " de " +
      OTD.MESES_PT_FULL[d.getMonth()] + " de " + d.getFullYear();
  }

  function boot() {
    OTD.setupChart();
    document.getElementById("baseAtualizada").textContent =
      "Base atualizada em " + OTD.fmtDataHora(OTD.META.geradoEm);
    tickRelogio(); setInterval(tickRelogio, 1000);

    montarAbas();
    montarFiltros();

    const meses = OTD.availableMonths(), atual = OTD.nowKey();
    const alvo = meses.indexOf(atual) >= 0 ? atual : meses[meses.length - 1];
    F.meses.add(alvo);
    document.getElementById("selMes").value = alvo;
    render();

    /* paginação automática das tabelas operacionais */
    setInterval(function () {
      if (abaAtiva !== "operacional") return;
      pag.viagens++; pintarViagens();
      pag.transito++; pag.aguardando++; renderOperacional();
    }, OP_PAGE_SECONDS * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
