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

  /* Qual mes a tela deve tratar como "o mes fechado". Vale pelo seletor MES e
     TAMBEM quando o gestor digita o intervalo do mes inteiro (01/08 a 31/08) -
     e o mesmo recorte. Antes disso a aba Projecao ficava em branco e as metas
     sumiam quando ele preenchia DE/ATE na mao. (01/09) */
  function mesDoFiltro() {
    if (F.meses.size === 1 && !F.de && !F.ate) return Array.from(F.meses)[0];
    if (F.de && F.ate && F.de.slice(0, 7) === F.ate.slice(0, 7)) {
      const mes = F.de.slice(0, 7);
      const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
      const inteiro = Number(F.de.slice(8, 10)) === 1 && Number(F.ate.slice(8, 10)) >= ultimo;
      const mesOk = F.meses.size === 0 ||
        (F.meses.size === 1 && Array.from(F.meses)[0] === mes);
      if (inteiro && mesOk) return mes;
    }
    return null;
  }

  function renderGeral(rows) {
    const total = OTD.totalFaturamento(rows);
    const viagens = OTD.contarViagens(rows);
    const km = OTD.totalKm(rows), kmC = OTD.totalKmCarregado(rows), kmV = OTD.totalKmVazio(rows);

    let delta = null;
    if (mesDoFiltro()) {
      const mes = mesDoFiltro();
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
      mes: mesDoFiltro(),
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
    const mesProj = mesDoFiltro();
    const mv = metaVeiculo();
    document.getElementById("gridSeg").innerHTML = segs.map(function (s, i) {
      const sub = rows.filter(function (r) { return r.seg === s; });
      const v = OTD.totalFaturamento(sub);
      /* R13: a meta soma so placas REAIS - "OTD-xxxx" e placa propria ficticia
         do autopropulsor (o veiculo transportado), nao um caminhao da frota. */
      /* R13 revisado em 01/09: meta individual por placa, e o Autopropulsor
         fora da regra de placa (ultimo mes fechado x 1,05). A contagem de
         placas sai do mesmo lugar da meta, senao card e meta discordam. */
      const r13 = OTD.metaR13Seg(sub, s, mv, mesProj);
      const metaSeg = r13.valor;
      const nFicticias = new Set(sub.filter(function (r) { return r.placa && r.otd; })
        .map(function (r) { return OTD.placaChave(r.placa); })).size;
      let linha = OTD.contarViagens(sub) + " viagens · " + r13.placas + " placas" +
        (nFicticias ? " (+" + nFicticias + " fictícias)" : "");
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
            '<div class="sub">meta R13 ' + OTD.fmtBRL(metaSeg) + " · " + OTD.fmtPct(pctMeta, 0) +
            '<span style="color:var(--text-faint)"> · ' + E(r13.regra) +
            (r13.cadastradas && r13.rodaram < r13.cadastradas
              ? " · " + r13.rodaram + " de " + r13.cadastradas + " cadastradas rodaram"
              : "") +
            (r13.semMeta.length
              ? " · " + r13.semMeta.length + " placa" + (r13.semMeta.length > 1 ? "s" : "") +
                " sem meta cadastrada"
              : "") + "</span></div>"
          : '<div class="sub" style="color:var(--text-faint)">sem meta R13 — ' +
            (OTD.segMetaSemPlaca(s) ? "sem mês fechado anterior" : "só placas fictícias") +
            "</div>") +
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
        '<span class="pcount">padrão para placa sem meta cadastrada · R13 · a meta do ' +
        'segmento é a soma da meta de cada placa real (Autopropulsor fora da regra)' +
        "</span></div>") +
      card('<div id="avisoMetaPlaca"></div>') +
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
    /* aviso das placas que faturam sem meta cadastrada - o gestor pediu para
       ser acusado quando faltar alguma (01/09) */
    const semMeta = OTD.placasSemMeta();
    const av = document.getElementById("avisoMetaPlaca");
    if (av) {
      av.innerHTML = semMeta.length
        ? '<div class="phead"><span class="ptitle">⚠️ ' + semMeta.length +
          " placas rodando sem meta cadastrada</span>" +
          '<span class="pcount">entram com o padrão de ' + OTD.fmtBRL(mv) +
          " até você mandar o valor de cada uma · " +
          OTD.placasSemMeta(true).length + " no total, contando as que pararam" +
          "</span></div>" +
          '<div class="sub" style="margin-top:6px;line-height:1.9">' +
          semMeta.map(function (d) {
            return '<span class="badge b-grey">' + E(d.placa) + " · " +
              E(d.seg.slice(0, 12)) + " · " + OTD.fmtBRL(d.valor) + "</span>";
          }).join(" ") + "</div>"
        : '<div class="phead"><span class="ptitle">✅ Todas as placas que faturam ' +
          "têm meta cadastrada</span></div>";
    }
    linhasCache.tbVei = ag.map(function (a) {
      const meta = OTD.metaDaPlaca(a.chave, mv);
      const cadastrada = OTD.metaDaPlacaCadastrada(a.chave) > 0;
      const pct = meta > 0 ? 100 * a.frete / meta : 0;
      const bateu = pct >= 100;
      return [
        '<span class="strong">' + E(a.chave) + "</span>" +
          (ficticias.has(a.chave) ? ' <span class="badge b-grey">fictícia</span>' : ""),
        '<span style="color:' + (bateu ? "#4ADE80" : "var(--orange-soft)") + ';font-weight:700">' +
          OTD.fmtBRL(a.frete) + "</span>",
        OTD.fmtBRL(meta) + (cadastrada ? ""
          : ' <span class="badge b-grey" title="placa sem meta cadastrada">padrão</span>'),
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
      secao("Meta por Operação",
        '<span class="hint">a meta do mês é a soma das quatro</span>') +
      '<div id="gridMetaSeg"></div>' +
      secao("Realizado vs Projeção") +
      painel("chRealProj", "Acumulado realizado × projeção linear", "", "tall") +
      secao("Projeção por Veículo") +
      tabelaCard("tbProj", "Projeção por Veículo", "", true);
  }
  /**
   * Card de metas por operacao. Quatro linhas editaveis + o total.
   * O gestor escolheu em 31/08 o modelo "global = soma das quatro", entao aqui
   * e o UNICO lugar onde a meta se edita; o card de cima so mostra o total.
   * Cada linha diz se o valor foi definido por ele ou se ainda e a sugestao
   * automatica - sem isso ninguem sabe se o numero foi decidido ou calculado.
   */
  function montarMetaPorSegmento(mes, rows) {
    const box = document.getElementById("gridMetaSeg");
    if (!box) return;

    const realizado = {};
    rows.forEach(function (r) {
      if (r.mesRef !== mes) return;
      realizado[r.seg] = (realizado[r.seg] || 0) + (Number(r.frete) || 0);
    });

    let somaMeta = 0, somaReal = 0;
    const linhas = OTD.SEGMENTOS_META.map(function (seg) {
      const meta = OTD.getGoalSeg(mes, seg);
      const real = realizado[seg] || 0;
      const pct = meta > 0 ? 100 * real / meta : 0;
      const propria = OTD.goalSegDefinida(mes, seg);
      somaMeta += meta; somaReal += real;
      return '<tr>' +
        '<td><b>' + E(OTD.ROTULO_SEG_META[seg] || seg) + "</b>" +
        '<div class="sub">' + (propria ? "definida por você"
          : "sugestão automática (mês anterior +5%)") + "</div></td>" +
        '<td class="right">' + OTD.fmtBRL(real) + "</td>" +
        '<td class="right">' + OTD.fmtBRL(meta) + "</td>" +
        '<td class="right" style="color:' + (pct >= 100 ? "#4ADE80" : "#F0800E") +
        '"><b>' + OTD.fmtPct(pct, 0) + "</b></td>" +
        '<td><div class="goal-edit">' +
        '<input type="number" class="mseg-in" data-seg="' + E(seg) +
        '" placeholder="nova meta (R$)">' +
        '<button class="btn primary mseg-ok" data-seg="' + E(seg) + '">Salvar</button>' +
        (propria ? '<button class="btn mseg-rst" data-seg="' + E(seg) +
          '" title="voltar para a sugestão automática">↺</button>' : "") +
        "</div></td></tr>";
    }).join("");

    /* O TOTAL tem que ser o MESMO numero do medidor de cima, senao a tela mostra
       duas metas do mes. Quando a meta global antiga ainda esta valendo, e ela
       que manda - a soma das quatro so entra depois da primeira definida. */
    const metaMes = OTD.getGoal(mes);
    const legado = !OTD.algumaGoalSegDefinida(mes) && OTD.goalLegado(mes) > 0;
    const pctTot = metaMes > 0 ? 100 * somaReal / metaMes : 0;
    box.innerHTML = '<div class="card tablecard">' +
      '<div class="tablehead"><span class="ptitle">Meta do mês por operação</span>' +
      '<span class="pcount">' + E(OTD.monthLabelFull(mes)) +
      (legado ? " · meta global antiga em vigor: " + OTD.fmtBRL(metaMes) +
        " (a soma das quatro só passa a valer depois que você salvar a primeira)"
        : "") + "</span></div>" +
      '<div class="tablewrap"><table class="dtbl"><thead><tr>' +
      "<th>Operação</th>" +
      '<th style="text-align:right">Realizado</th>' +
      '<th style="text-align:right">Meta</th>' +
      '<th style="text-align:right">% Meta</th>' +
      "<th>Ajustar</th></tr></thead><tbody>" + linhas +
      '<tr class="linha-total"><td><b>TOTAL — meta do mês</b>' +
      (legado ? '<div class="sub">soma das quatro: ' + OTD.fmtBRL(somaMeta) + "</div>" : "") +
      "</td>" +
      '<td class="right"><b>' + OTD.fmtBRL(somaReal) + "</b></td>" +
      '<td class="right"><b>' + OTD.fmtBRL(metaMes) + "</b></td>" +
      '<td class="right"><b>' + OTD.fmtPct(pctTot, 0) + "</b></td><td></td></tr>" +
      "</tbody></table></div></div>";

    box.querySelectorAll(".mseg-ok").forEach(function (b) {
      b.addEventListener("click", function () {
        const seg = b.getAttribute("data-seg");
        const inp = box.querySelector('.mseg-in[data-seg="' + seg + '"]');
        const v = Number(inp && inp.value);
        if (v > 0) { OTD.setGoalSeg(mes, seg, v); render(); }
      });
    });
    box.querySelectorAll(".mseg-rst").forEach(function (b) {
      b.addEventListener("click", function () {
        OTD.setGoalSeg(mes, b.getAttribute("data-seg"), "");
        render();
      });
    });
  }

  function renderProjecao(rows) {
    const box = document.getElementById("gridMeta");
    const mes = mesDoFiltro();
    if (!mes) {
      box.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty-state">' +
        "Selecione <b>um mês</b> no seletor MÊS — ou um intervalo DE/ATÉ que cubra o " +
        "mês inteiro — para ver meta e projeção.</div></div>";
      /* a tabela de metas tambem some junto; sem esta linha ela ficava em
         branco sem explicacao (reclamacao do gestor em 01/09) */
      const bs = document.getElementById("gridMetaSeg");
      if (bs) bs.innerHTML = '<div class="card" style="grid-column:1/-1">' +
        '<div class="empty-state">As metas são por mês. Escolha o mês acima para ' +
        "editá-las.</div></div>";
      const el = document.getElementById("tbProj");
      if (el) pintarTabela("tbProj", ["Placa"], []);
      return;
    }
    const p = OTD.projectMonth(rows, mes);
    const meta = OTD.getGoal(mes);
    const pctMeta = meta > 0 ? 100 * p.total / meta : 0;
    const pctProj = meta > 0 ? 100 * p.projected / meta : 0;
    /* de onde saiu o numero - o gestor precisa saber se e o dele ou a sugestao */
    const usaLegado = !OTD.algumaGoalSegDefinida(mes) && OTD.goalLegado(mes) > 0;
    const notaMeta = OTD.META.metaFixaTemporaria && OTD.META.metaFixaTemporaria[mes]
      ? "meta fixa definida no pipeline"
      : (usaLegado
        ? "meta global antiga deste mês — vale até você definir a primeira " +
          "meta em <b>Meta por Operação</b>"
        : "soma das quatro metas por operação — edite abaixo, em " +
          "<b>Meta por Operação</b>");

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
        '<div class="goal-nota">' + notaMeta + "</div>" +
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
    montarMetaPorSegmento(mes, rows);

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
      const metaP = OTD.metaDaPlaca(a.chave, mv);
      const pctV = metaP > 0 ? 100 * proj / metaP : 0;
      return [
        '<span class="strong">' + E(a.chave) + "</span>",
        OTD.fmtBRL(a.frete), OTD.fmtBRL(media), OTD.fmtBRL(proj), OTD.fmtBRL(metaP),
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
      '<div class="grid g-2" id="gridEntregas"></div>' +
      secao("Cargas em Atraso", '<span class="live-tag">tempo real</span>' +
        '<span class="hint" id="hintAtrasos"></span>') +
      '<div id="gridAtrasos" style="display:flex;flex-direction:column;gap:14px"></div>';
  }

  /* Complemento da OMS: a OMS mede o que JA foi atendido; aqui listamos o que
     ainda NAO chegou e ja passou do prazo (romaneio em aberto, prazo vencido). */
  function renderAtrasos() {
    const box = document.getElementById("gridAtrasos");
    if (!box) return;
    const A = OTD.ATRASOS;
    const hint = document.getElementById("hintAtrasos");
    if (!A || !A.segmentos) {
      box.innerHTML = '<div class="card"><div class="empty-state">Sem dados.</div></div>';
      return;
    }
    if (hint) {
      hint.textContent = " foto de " + OTD.fmtDataHora(A.geradoEm) + " · " +
        A.semReferencia + " cargas em aberto sem prazo cadastrado ficam de fora";
    }
    const segs = Object.keys(A.segmentos).sort();
    function junta(tipo) {
      const out = [];
      segs.forEach(function (s) {
        (A.segmentos[s][tipo] || []).forEach(function (a) {
          out.push(Object.assign({ seg: s }, a));
        });
      });
      out.sort(function (a, b) { return b.atrasoH - a.atrasoH; });
      return out;
    }
    function tempo(h) {
      const horas = Math.max(0, Math.round(Number(h) || 0));
      return horas < 48 ? horas + "h"
        : Math.floor(horas / 24) + "d " + (horas % 24) + "h";
    }
    const COR = { critico: "b-red", atencao: "b-amber", leve: "b-blue" };
    function tabela(titulo, tipo, dica) {
      const lista = junta(tipo);
      const criticos = lista.filter(function (a) { return a.sev === "critico"; }).length;
      const linhas = lista.slice(0, 40).map(function (a) {
        return "<tr><td><span class='badge " + (COR[a.sev] || "b-blue") + "'>" +
          E(tempo(a.atrasoH)) + "</span></td>" +
          "<td class='strong'>" + E(a.romaneio) + "</td>" +
          "<td>" + E(OTD.shortName(a.cliente, 24)) + "</td>" +
          "<td>" + E(a.placa) + "</td>" +
          "<td>" + E(OTD.shortName(a.motorista, 20)) + "</td>" +
          "<td>" + E(OTD.shortName(a.rota, 40)) + "</td>" +
          "<td>" + E(OTD.fmtDataHora(a.prazo)) + "</td>" +
          "<td>" + E(a.seg) + "</td></tr>";
      }).join("");
      return '<div class="card tablecard"><div class="tablehead">' +
        '<span class="ptitle">' + E(titulo) + "</span><span class='spacer'></span>" +
        '<span class="pcount">' + lista.length + " vencidas" +
        (criticos ? " · " + criticos + " críticas" : "") + "</span></div>" +
        (lista.length
          ? '<div class="tablewrap"><table class="dtbl"><thead><tr>' +
            ["Atraso", "Romaneio", "Cliente", "Placa", "Motorista", "Rota", "Prazo", "Segmento"]
              .map(function (c) { return "<th>" + c + "</th>"; }).join("") +
            "</tr></thead><tbody>" + linhas + "</tbody></table></div>" +
            (lista.length > 40 ? '<div class="tablefoot"><span>mostrando as 40 mais atrasadas de ' +
              lista.length + "</span></div>" : "")
          : '<div class="empty-state">' + E(dica) + "</div>") + "</div>";
    }
    box.innerHTML =
      tabela("Coletas em atraso", "coletas",
             "Nenhum romaneio em aberto com a coleta vencida.") +
      tabela("Entregas em atraso", "entregas",
             "Nenhuma carga em trânsito passou do prazo de entrega.");
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
    renderAtrasos();
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
    ["R13", "<b>Meta por placa</b> — cada caminhão tem a sua (50, 80 ou 100 mil), " +
      "definida pelo gestor em 01/09/2026 e guardada no pipeline, igual em todas as telas. " +
      "A <b>meta do segmento</b> é a soma da meta das placas reais que rodaram no período; " +
      "placa ainda sem cadastro entra com o padrão e é acusada na aba Veículos. " +
      "O <b>Autopropulsor fica fora da regra de placa</b> — a frota dele é o veículo " +
      "transportado (placa fictícia OTD-xxxx), então a meta é o último mês fechado × 1,05."]
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
    ["ENT1", "Controle de Entregas em 4 status exclusivos: Finalizadas → Em descarga → Em viagem → Destinado. Só Finalizadas filtra pelo dia avaliado."],
    ["ENT2", "<b>Cargas em Atraso</b> é o complemento da OMS: a OMS mede o que <b>já foi atendido</b> (no prazo ou não); esta lista mostra o que <b>ainda não chegou</b> e já passou do prazo. Entra só romaneio <b>em aberto</b>: coleta sem <b>Dt. Carga (I)</b> (prazo = programação de carregamento do lcargas) e entrega já carregada mas sem <b>Dt. Descarga (I)</b> (prazo = previsão de entrega do lcargas), sempre comparados com o horário de geração da base. Romaneio sem prazo cadastrado fica de fora e é contado à parte."],
    ["ENT3", "Severidade em Cargas em Atraso segue a mesma régua da OMS2: ≥ 8h <b>Crítico</b> · 2h–8h <b>Atenção</b> · &lt; 2h <b>Leve</b>. Nas rotas da regra OMS1b o prazo de coleta usado é o da LVIAGENS."],
    ["M1", "<b>Rodando só opera com pedido.</b> No segmento Rodando, veículo <b>Destinado</b> com <b>Pedido/shipment em branco</b> está parado sem utilidade e sai de TODAS as contas do painel — contador, mapa e listas de ação. Na base de estreia isso tirou 286 dos 300 \"Destinado\" do Rodando."],
    ["M2", "<b>Documento pendente ignora dois casos.</b> Carga <b>internacional</b> (UF \"EX\") não entra, e <b>Ponta Grossa × Ponta Grossa</b> também não: pela regra R8 essa rota nunca emite CT-e, o faturamento é simulado."],
    ["M3", "Os campos de tempo do lmonitoramento (<b>Tempo evento</b> e <b>Tempo parado</b>) são <b>acumulados</b>: \"30:00\" são trinta horas, não seis. Lidos direto, sem tratar virada de dia."],
    ["M4", "Veículo <b>sem posição registrada</b> entra na tela de 12h marcado como \"sem rastreio\", em vez de ficar invisível."],
    ["M5", "Motorista <b>DAVID DE AZEVEDO</b> é código interno de <b>veículo sem motorista</b> — gera a lista para o RH contratar."],
    ["M6", "<b>MDF-e emitido pelo cliente.</b> Quando o remetente é <b>TIROL</b>, a falta de MDF-e <b>não é pendência</b>: a emissão é automática do cliente, então se há CT-e, há MDF-e. O <b>CT-e</b> faltando continua sendo cobrado normalmente. Confirmado com o gestor em 26/08/2026."]
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
  /* ======================================================================= */
  /* ABA AGREGADOS REPOM                                                     */
  /*                                                                         */
  /* Aba independente: tem o proprio filtro (o da Torre nao se aplica aqui,  */
  /* porque o recorte e por contrato de agregado, nao por documento fiscal). */
  /* Toda a regra de negocio vive no common.js (OTD.repom*), para a aba e o  */
  /* telao dedicado lerem exatamente o mesmo numero.                         */
  /* ======================================================================= */

  const RF = {
    props: new Set(), mots: new Set(), placas: new Set(),
    sts: new Set(), unis: new Set(), sits: new Set(), de: null, ate: null
  };
  let repomSub = "geral";
  const repomOrd = { geral: null, prop: { c: "pago", asc: false },
                     mot: { c: "pago", asc: false }, placa: { c: "pago", asc: false } };

  const REPOM_SUBS = [
    { id: "geral", ico: "📊", nome: "Visão Geral" },
    { id: "prop", ico: "🏢", nome: "Proprietários" },
    { id: "mot", ico: "👤", nome: "Motoristas" },
    { id: "placa", ico: "🚛", nome: "Placas" },
    { id: "previsao", ico: "📅", nome: "Previsão de Pagamento" },
    { id: "regras", ico: "⚙️", nome: "Regras" }
  ];

  function repomTemDados() {
    return OTD.REPOM && OTD.REPOM.itens && OTD.REPOM.itens.length > 0;
  }

  function abaRepom() {
    if (!repomTemDados()) {
      return secao("Agregados REPOM") + card(
        '<div class="empty-state">Nenhum contrato de agregado no data.js.<br>' +
        "Guarde o export <b>lrepom</b> na pasta datada das bases e rode o pipeline de novo." +
        "</div>");
    }
    const r = OTD.REPOM.resumo;
    return secao("Agregados REPOM",
        '<span class="hint">contratos de ' + E(OTD.fmtData(r.periodo[0])) + " a " +
        E(OTD.fmtData(r.periodo[1])) + " · chave: nº carta frete</span>") +
      '<div class="filterbar" style="margin-bottom:14px">' +
        '<div class="filterrow">' +
          '<span class="lbl">Quem</span>' +
          '<div class="ms" id="rmProp"></div>' +
          '<div class="ms" id="rmMot"></div>' +
          '<div class="ms" id="rmPlaca"></div>' +
        "</div>" +
        '<div class="filterrow">' +
          '<span class="lbl">Situação</span>' +
          '<div class="ms" id="rmStatus"></div>' +
          '<div class="ms" id="rmSit"></div>' +
          '<div class="ms" id="rmUni"></div>' +
        "</div>" +
        '<div class="filterrow">' +
          '<span class="lbl">Período</span>' +
          '<input type="date" id="rmDe" value="' + (RF.de || "") + '">' +
          '<span style="color:var(--text-faint);font-size:12px">até</span>' +
          '<input type="date" id="rmAte" value="' + (RF.ate || "") + '">' +
          '<button class="btn" id="rmLimpar">Limpar filtros</button>' +
          '<span class="spacer" style="flex:1"></span>' +
          '<span class="pill" id="rmCont">—</span>' +
        "</div>" +
      "</div>" +
      '<div class="tabs" id="repomSubnav" style="margin-top:0">' +
        REPOM_SUBS.map(function (t) {
          return '<button class="tab' + (t.id === repomSub ? " on" : "") +
                 '" data-sub="' + t.id + '">' + t.ico + " " + E(t.nome) + "</button>";
        }).join("") +
      "</div>" +
      '<div id="repomPane"></div>';
  }

  /* ------------------------------------------------------------ render --- */
  function renderRepom() {
    if (!repomTemDados()) return;

    montarMultiselect("rmProp", "Proprietário", OTD.repomOpcoes("prop"), RF.props, repintarRepom);
    montarMultiselect("rmMot", "Motorista", OTD.repomOpcoes("motorista"), RF.mots, repintarRepom);
    montarMultiselect("rmPlaca", "Placa", OTD.repomOpcoes("placa"), RF.placas, repintarRepom);
    montarMultiselect("rmStatus", "Status Repom", OTD.repomOpcoes("st"), RF.sts, repintarRepom);
    montarMultiselect("rmSit", "Situação saldo", OTD.repomOpcoes("sit"), RF.sits, repintarRepom);
    montarMultiselect("rmUni", "Unidade", OTD.repomOpcoes("unidade"), RF.unis, repintarRepom);
    ["rmProp", "rmMot", "rmPlaca", "rmStatus", "rmSit", "rmUni"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el && el.__sync) el.__sync();
    });

    document.getElementById("rmDe").addEventListener("change", function (e) {
      RF.de = e.target.value || null; repintarRepom();
    });
    document.getElementById("rmAte").addEventListener("change", function (e) {
      RF.ate = e.target.value || null; repintarRepom();
    });
    document.getElementById("rmLimpar").addEventListener("click", function () {
      RF.props.clear(); RF.mots.clear(); RF.placas.clear();
      RF.sts.clear(); RF.unis.clear(); RF.sits.clear();
      RF.de = null; RF.ate = null;
      document.getElementById("rmDe").value = "";
      document.getElementById("rmAte").value = "";
      ["rmProp", "rmMot", "rmPlaca", "rmStatus", "rmSit", "rmUni"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el && el.__sync) el.__sync();
      });
      repintarRepom();
    });
    document.querySelectorAll("#repomSubnav .tab").forEach(function (b) {
      b.addEventListener("click", function () {
        repomSub = b.dataset.sub;
        document.querySelectorAll("#repomSubnav .tab").forEach(function (o) {
          o.classList.toggle("on", o.dataset.sub === repomSub);
        });
        repintarRepom();
      });
    });
    repintarRepom();
  }

  /* Repinta SO o painel interno - todas as sub-telas leem o mesmo recorte,
     entao trocar de sub-aba nunca mostra numero velho. */
  function repintarRepom() {
    const rows = OTD.repomFiltrar(RF);
    const cont = document.getElementById("rmCont");
    if (cont) cont.textContent = OTD.fmtNum(rows.length) + " contratos filtrados";
    const pane = document.getElementById("repomPane");
    if (!pane) return;
    const t = OTD.repomTotais(rows);
    if (repomSub === "geral") pane.innerHTML = repomGeralHtml(rows, t);
    else if (repomSub === "previsao") pane.innerHTML = repomPrevisaoHtml(rows, t);
    else if (repomSub === "regras") pane.innerHTML = repomRegrasHtml();
    else pane.innerHTML = repomRankHtml(repomSub);
    if (repomSub === "geral") repomGeralGraficos(rows);
    else if (repomSub === "previsao") repomPrevisaoGraficos(rows);
    else if (repomSub !== "regras") repomRankRender(repomSub, rows);
    ligarBuscas();
  }

  /* ------------------------------------------------------- visão geral --- */
  function repomGeralHtml(rows, t) {
    const dest = ["prop", "motorista", "placa"].map(function (campo) {
      const top = OTD.repomAgrupar(rows, campo)[0];
      const rot = campo === "prop" ? "Proprietário destaque"
                : (campo === "motorista" ? "Motorista destaque" : "Placa destaque");
      if (!top) return card('<div class="lbl">' + rot + '</div><div class="empty-state">—</div>', "destaque");
      return '<div class="card destaque"><div class="lbl">' + E(rot) + "</div>" +
        '<div class="nome">' + E(OTD.shortName(top.chave, 34)) + "</div>" +
        '<div class="vl num">' + OTD.fmtBRL(top.pago) + "</div>" +
        '<div class="sub">' + OTD.fmtNum(top.cargas) + " cargas · ticket " +
        OTD.fmtBRL(top.ticket) + "</div></div>";
    }).join("");

    /* Movimento do dia / semana / mes + insights: MESMAS funcoes do telao
       (OTD.repomMovimento / OTD.repomInsights). Se o numero divergir entre a
       aba e a TV, o bug e de layout, nao de regra. */
    const mov = OTD.repomMovimento(rows);
    const ins = OTD.repomInsights(rows);
    const ICO = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };

    function cardMov(ico, cor, rot, m, ds) {
      return kpi(ico, cor, rot, OTD.fmtBRLcents(m.adiant),
        OTD.fmtNum(m.qtd) + " cartas frete · " + OTD.fmtBRL(m.pago) +
        " pagos" + (ds ? " · " + ds : ""));
    }
    /* reaproveita o cardInsight da aba Geral: mesmo componente, mesma leitura */
    const insHtml = ins.map(function (n) {
      return cardInsight({ nivel: n.sev, icone: ICO[n.sev], titulo: n.titulo,
                           valor: n.valor, texto: n.texto });
    }).join("");

    return secao("Movimento",
                 '<span class="hint">adiantamentos emitidos, pela data da carta frete</span>') +
      '<div class="grid g-3">' +
        cardMov("🕐", "c-orange", "Hoje", mov.hoje, OTD.fmtData(mov.ref).slice(0, 5)) +
        cardMov("📅", "c-blue", "Semana atual", mov.semana,
                "desde " + OTD.fmtData(mov.iniSemana).slice(0, 5)) +
        cardMov("🗓️", "c-green", "Mês atual", mov.mes,
                "média " + OTD.fmtBRL(mov.mediaDia) + "/dia em " +
                mov.diasComMovimento + " dias") +
      "</div>" +
      secao("Alertas & Insights",
            '<span class="hint">leitura automática — cada linha traz o número que a originou</span>') +
      '<div class="grid g-3">' + insHtml + "</div>" +
      secao("Números do período") +
      '<div class="grid g-kpi">' +
        kpi("💰", "c-orange", "Receita das cargas", OTD.fmtBRLcents(t.receita),
            "faturamento da Torre nas cargas do agregado") +
        kpi("🤝", "c-blue", "Pago ao agregado", OTD.fmtBRLcents(t.pago),
            "repasse de " + OTD.fmtPct(t.repasse, 1) + " da receita") +
        kpi("📈", "c-green", "Margem", OTD.fmtBRLcents(t.margem),
            OTD.fmtPct(t.pctMargem, 1) + " da receita") +
        kpi("📦", "c-purple", "Contratos", OTD.fmtNum(t.cargas),
            "ticket médio " + OTD.fmtBRL(t.ticket)) +
        kpi("⏸️", "c-red", "Saldo em aberto", OTD.fmtBRLcents(t.saldo),
            OTD.fmtNum(t.abertos) + " contratos parados" +
            (t.maisVelho !== null ? " · mais antigo há " + OTD.fmtNum(t.maisVelho) + " dias" : "")) +
        kpi("✅", "c-teal", "Saldo já pago", OTD.fmtPct(t.pctPago, 1),
            OTD.fmtNum(t.pagos) + " de " + OTD.fmtNum(t.cargas) + " contratos") +
      "</div>" +
      secao("Destaques do período") +
      '<div class="grid g-3">' + dest + "</div>" +
      secao("Movimento") +
      '<div class="grid g-charts-2">' +
        painel("rgDiario", "Pago ao agregado por dia", "coluna Vlr. unitário") +
        painel("rgStatus", "Status Repom", "clique para filtrar") +
      "</div>" +
      '<div class="grid g-charts-2">' +
        painel("rgProp", "Top 12 proprietários", "clique para filtrar") +
        painel("rgSit", "Situação do saldo", "pago x aberto") +
      "</div>";
  }

  function repomGeralGraficos(rows) {
    /* Movimento no tempo: dia a dia enquanto cabe na tela; acima de 62 dias
       o eixo vira mensal, senao viram 230 barras ilegiveis. */
    const porDiaBruto = new Map();
    rows.forEach(function (r) {
      if (!r.dtEmi) return;
      porDiaBruto.set(r.dtEmi, (porDiaBruto.get(r.dtEmi) || 0) + (r.pago || 0));
    });
    const mensal = porDiaBruto.size > 62;
    const porDia = new Map();
    porDiaBruto.forEach(function (v, k) {
      const ch = mensal ? k.slice(0, 7) : k;
      porDia.set(ch, (porDia.get(ch) || 0) + v);
    });
    const dias = Array.from(porDia.keys()).sort();
    const tituloEixo = document.querySelector("#rgDiario");
    if (tituloEixo) {
      const head = tituloEixo.closest(".card").querySelector(".ptitle");
      if (head) head.textContent = mensal ? "Pago ao agregado por mês"
                                          : "Pago ao agregado por dia";
    }
    criarGrafico("rgDiario", {
      type: "bar",
      data: {
        labels: dias.map(function (d) {
          return mensal ? OTD.monthLabel(d) : OTD.fmtData(d).slice(0, 5); }),
        datasets: [{ data: dias.map(function (d) { return porDia.get(d); }),
                     backgroundColor: "rgba(240,128,14,.8)", borderRadius: 4,
                     maxBarThickness: 64 }]
      },
      options: {
        plugins: { legend: { display: false }, valores: { formato: "compacto" },
          tooltip: { callbacks: { label: function (c) { return OTD.fmtBRL(c.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } } }
      }
    });

    /* status (clicavel) */
    const porSt = OTD.repomAgrupar(rows, "st").sort(function (a, b) { return b.cargas - a.cargas; });
    criarGrafico("rgStatus", {
      type: "doughnut",
      data: {
        labels: porSt.map(function (g) { return g.chave; }),
        datasets: [{ data: porSt.map(function (g) { return g.cargas; }),
                     backgroundColor: OTD.PALETTE, borderWidth: 0 }]
      },
      options: {
        cutout: "56%",
        plugins: { legend: { position: "right", labels: { color: "#ABA69C", boxWidth: 12 } },
                   valores: { formato: "num" } },
        onClick: function (ev, els) {
          if (!els.length) return;
          const v = porSt[els[0].index].chave;
          RF.sts.has(v) ? RF.sts.delete(v) : RF.sts.add(v);
          const el = document.getElementById("rmStatus");
          if (el && el.__sync) el.__sync();
          repintarRepom();
        }
      }
    });

    /* top proprietarios (clicavel) */
    const props = OTD.repomAgrupar(rows, "prop").slice(0, 12);
    criarGrafico("rgProp", {
      type: "bar",
      data: {
        labels: props.map(function (g) { return OTD.shortName(g.chave, 28); }),
        datasets: [{ data: props.map(function (g) { return g.pago; }),
                     backgroundColor: "rgba(79,163,227,.8)", borderRadius: 5,
                     maxBarThickness: 20 }]
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false }, valores: { formato: "brl" },
          tooltip: { callbacks: { label: function (c) { return OTD.fmtBRL(c.parsed.x); } } } },
        scales: { x: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } },
                  y: OTD.eixoCategoriasY() },
        onClick: function (ev, els) {
          if (!els.length) return;
          const v = props[els[0].index].chave;
          RF.props.has(v) ? RF.props.delete(v) : RF.props.add(v);
          const el = document.getElementById("rmProp");
          if (el && el.__sync) el.__sync();
          repintarRepom();
        }
      }
    });

    /* situacao do saldo */
    const porSit = OTD.repomAgrupar(rows, "sit");
    criarGrafico("rgSit", {
      type: "doughnut",
      data: {
        labels: porSit.map(function (g) { return g.chave; }),
        datasets: [{ data: porSit.map(function (g) { return g.cargas; }),
                     backgroundColor: porSit.map(function (g) {
                       return /^aberto/i.test(g.chave) ? "#F1553F" : "#4ADE80"; }),
                     borderWidth: 0 }]
      },
      options: {
        cutout: "56%",
        plugins: { legend: { position: "right", labels: { color: "#ABA69C", boxWidth: 12 } },
                   valores: { formato: "num" } }
      }
    });
  }

  /* ------------------------------------------ proprietários / mot / placa */
  const REPOM_CAMPO = { prop: "prop", mot: "motorista", placa: "placa" };
  const REPOM_ROTULO = { prop: "Proprietário", mot: "Motorista", placa: "Placa" };
  const REPOM_COLS = [
    { c: "chave", t: "#", right: false },
    { c: "pago", t: "Pago ao agregado", right: true },
    { c: "pct", t: "% do total", right: true },
    { c: "cargas", t: "Contratos", right: true },
    { c: "ticket", t: "Ticket médio", right: true },
    { c: "receita", t: "Receita da carga", right: true },
    { c: "margem", t: "Margem", right: true },
    { c: "pctMargem", t: "% margem", right: true },
    { c: "saldo", t: "Saldo parado", right: true }
  ];

  function repomRankHtml(sub) {
    const rot = REPOM_ROTULO[sub];
    return secao(rot + " — pago ao agregado") +
      painel("rgRank", "Top 15 " + rot.toLowerCase(), "clique para filtrar") +
      tabelaCard("tblRepomRank", rot, "", true);
  }

  function repomRankRender(sub, rows) {
    const campo = REPOM_CAMPO[sub];
    const grupos = OTD.repomAgrupar(rows, campo);
    const total = grupos.reduce(function (a, g) { return a + g.pago; }, 0);
    const alvo = sub === "prop" ? RF.props : (sub === "mot" ? RF.mots : RF.placas);
    const msId = sub === "prop" ? "rmProp" : (sub === "mot" ? "rmMot" : "rmPlaca");

    const top = grupos.slice(0, 15);
    criarGrafico("rgRank", {
      type: "bar",
      data: {
        labels: top.map(function (g) { return OTD.shortName(g.chave, 30); }),
        datasets: [{ data: top.map(function (g) { return g.pago; }),
                     backgroundColor: "rgba(240,128,14,.78)", borderRadius: 5,
                     maxBarThickness: 20 }]
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false }, valores: { formato: "brl" },
          tooltip: { callbacks: { label: function (c) { return OTD.fmtBRL(c.parsed.x); } } } },
        scales: { x: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } },
                  y: OTD.eixoCategoriasY() },
        onClick: function (ev, els) {
          if (!els.length) return;
          const v = top[els[0].index].chave;
          alvo.has(v) ? alvo.delete(v) : alvo.add(v);
          const el = document.getElementById(msId);
          if (el && el.__sync) el.__sync();
          repintarRepom();
        }
      }
    });

    const ord = repomOrd[sub];
    grupos.forEach(function (g) { g.pct = total ? 100 * g.pago / total : 0; });
    grupos.sort(function (a, b) {
      const va = a[ord.c], vb = b[ord.c];
      if (typeof va === "string") return ord.asc ? va.localeCompare(vb, "pt-BR") : vb.localeCompare(va, "pt-BR");
      return ord.asc ? va - vb : vb - va;
    });

    const linhas = grupos.map(function (g, i) {
      return [
        '<span style="color:var(--text-faint)">' + (i + 1) + "</span> " + E(g.chave),
        '<span class="num">' + OTD.fmtBRLcents(g.pago) + "</span>",
        pctCell(g.pct),
        '<span class="num">' + OTD.fmtNum(g.cargas) + "</span>",
        '<span class="num">' + OTD.fmtBRL(g.ticket) + "</span>",
        '<span class="num">' + OTD.fmtBRLcents(g.receita) + "</span>",
        '<span class="num">' + OTD.fmtBRLcents(g.margem) + "</span>",
        '<span class="badge ' + (g.pctMargem >= 35 ? "b-green" : (g.pctMargem >= 15 ? "b-amber" : "b-red")) +
          '">' + OTD.fmtPct(g.pctMargem, 1) + "</span>",
        '<span class="num">' + (g.saldo ? OTD.fmtBRLcents(g.saldo) : "—") + "</span>"
      ];
    });
    const cols = REPOM_COLS.map(function (c) {
      const seta = ord.c === c.c ? (ord.asc ? " ▲" : " ▼") : "";
      return { t: (c.c === "chave" ? REPOM_ROTULO[sub] : c.t) + seta, right: c.right };
    });
    pintarTabela("tblRepomRank", cols, linhas);

    /* ordenar clicando no cabeçalho */
    const tbl = document.getElementById("tblRepomRank");
    if (tbl) {
      tbl.querySelectorAll("th").forEach(function (th, i) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
          const c = REPOM_COLS[i].c;
          if (ord.c === c) ord.asc = !ord.asc; else { ord.c = c; ord.asc = false; }
          repintarRepom();
        });
      });
    }
  }

  /* -------------------------------------------- previsão de pagamento --- */
  function repomPrevisaoHtml(rows, t) {
    const abertos = rows.filter(function (r) { return r.aberto; });
    const porStatus = OTD.repomAgrupar(abertos, "st")
      .sort(function (a, b) { return b.saldo - a.saldo; });
    const cards = porStatus.map(function (g) {
      return '<div class="card contador"><div class="ic">⏸️</div>' +
        '<div class="n num" style="font-size:30px;color:#F0800E">' + OTD.fmtBRL(g.saldo) + "</div>" +
        '<div class="t">' + E(g.chave) + "</div>" +
        '<div class="d">' + OTD.fmtNum(g.abertos) + " contratos</div></div>";
    }).join("");

    /* A previsao pode estar no passado: contrato que ja passou da data de corte
       e continua com saldo aberto. Isso e um alerta, nao "o proximo corte". */
    const hoje = OTD.dayKey(new Date());
    const todas = OTD.repomPrevisao(rows);
    const vencidos = todas.filter(function (p) { return p.data < hoje; });
    const prox = todas.filter(function (p) { return p.data >= hoje; })[0];
    const vencidoValor = vencidos.reduce(function (a, p) { return a + p.valor; }, 0);
    const vencidoQtd = vencidos.reduce(function (a, p) { return a + p.qtd; }, 0);
    const destaque = function (cor, rot, valor, linha1, linha2) {
      return '<div class="card" style="border-color:' + cor + ';margin-top:14px">' +
        '<div style="color:#6E6A62;font-size:11px;letter-spacing:1.4px;' +
        'text-transform:uppercase;font-weight:800">' + E(rot) + "</div>" +
        '<div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-top:6px">' +
        '<div class="num" style="font-size:30px;font-weight:800;color:#F6F4F0">' +
        E(linha1) + "</div>" +
        '<div class="num" style="font-size:26px;font-weight:800;color:' + cor + '">' +
        valor + "</div>" +
        '<div style="color:#ABA69C;font-size:13px">' + E(linha2) + "</div></div></div>";
    };
    return secao("Saldo parado por status",
        '<span class="hint">saldo em aberto: ' + OTD.fmtBRLcents(t.saldo) + " em " +
        OTD.fmtNum(t.abertos) + " contratos</span>") +
      '<div class="grid g-3">' + (cards || '<div class="empty-state">Nenhum saldo em aberto.</div>') + "</div>" +
      (vencidoQtd ? destaque("#F1553F", "Passou da data e continua em aberto",
          OTD.fmtBRLcents(vencidoValor),
          OTD.fmtNum(vencidoQtd) + " contratos",
          "corte mais antigo: " + OTD.fmtData(vencidos[0].data)) : "") +
      (prox ? destaque("#F0800E", "Próximo corte", OTD.fmtBRLcents(prox.valor),
          OTD.fmtData(prox.data), OTD.fmtNum(prox.qtd) + " contratos") : "") +
      secao("Calendário de pagamento") +
      '<div class="grid g-charts-2">' +
        painel("rgParado", "Valor parado por status") +
        painel("rgCortes", "Previsão por data de corte") +
      "</div>" +
      '<div class="grid g-charts-2">' +
        tabelaCard("tblRepomPrev", "Detalhe da previsão", "", false) +
        tabelaCard("tblRepomAguard", "Aguardando quitação (sem previsão possível)", "", false) +
      "</div>" +
      secao("Gargalo da quitação",
        '<span class="hint">idade do contrato em aberto, contada da emissão</span>') +
      painel("rgIdade", "Saldo parado por faixa de idade");
  }

  function repomPrevisaoGraficos(rows) {
    const abertos = rows.filter(function (r) { return r.aberto; });
    const porStatus = OTD.repomAgrupar(abertos, "st")
      .sort(function (a, b) { return b.saldo - a.saldo; });
    criarGrafico("rgParado", {
      type: "bar",
      data: {
        labels: porStatus.map(function (g) { return g.chave; }),
        datasets: [{ data: porStatus.map(function (g) { return g.saldo; }),
                     backgroundColor: "rgba(241,85,63,.8)", borderRadius: 5,
                     maxBarThickness: 46 }]
      },
      options: {
        plugins: { legend: { display: false }, valores: { formato: "brl" },
          tooltip: { callbacks: { label: function (c) { return OTD.fmtBRL(c.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } } }
      }
    });

    const prev = OTD.repomPrevisao(rows);
    const hojeK = OTD.dayKey(new Date());
    criarGrafico("rgCortes", {
      type: "bar",
      data: {
        labels: prev.map(function (p) { return OTD.fmtData(p.data).slice(0, 5); }),
        datasets: [{ data: prev.map(function (p) { return p.valor; }),
                     /* vermelho = corte que ja passou e o saldo continua aberto */
                     backgroundColor: prev.map(function (p) {
                       return p.data < hojeK ? "rgba(241,85,63,.85)" : "rgba(45,212,191,.8)"; }),
                     borderRadius: 5, maxBarThickness: 40 }]
      },
      options: {
        plugins: { legend: { display: false }, valores: { formato: "compacto" },
          tooltip: { callbacks: {
            title: function (c) { return OTD.fmtData(prev[c[0].dataIndex].data); },
            label: function (c) { return OTD.fmtBRL(c.parsed.y) + " · " +
              OTD.fmtNum(prev[c.dataIndex].qtd) + " contratos"; } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } } }
      }
    });

    const faixas = OTD.repomIdade(rows);
    criarGrafico("rgIdade", {
      type: "bar",
      data: {
        labels: faixas.map(function (f) { return f.rot; }),
        datasets: [{ data: faixas.map(function (f) { return f.valor; }),
                     backgroundColor: faixas.map(function (f) { return f.cor; }),
                     borderRadius: 5, maxBarThickness: 54 }]
      },
      options: {
        plugins: { legend: { display: false }, valores: { formato: "brl" },
          tooltip: { callbacks: { label: function (c) {
            return OTD.fmtBRL(c.parsed.y) + " · " + OTD.fmtNum(faixas[c.dataIndex].qtd) +
                   " contratos"; } } } },
        scales: { y: { ticks: { callback: function (v) { return OTD.fmtCompacto(v); } } } }
      }
    });

    pintarTabela("tblRepomPrev",
      [{ t: "Data prevista" }, { t: "Contratos", right: true }, { t: "Valor do saldo", right: true }],
      prev.map(function (p) {
        return [E(OTD.fmtData(p.data)),
                '<span class="num">' + OTD.fmtNum(p.qtd) + "</span>",
                '<span class="num">' + OTD.fmtBRLcents(p.valor) + "</span>"];
      }));

    pintarTabela("tblRepomAguard",
      [{ t: "Status Repom" }, { t: "Contratos", right: true }, { t: "Valor do saldo", right: true }],
      OTD.repomAguardando(rows).map(function (g) {
        return [E(g.status),
                '<span class="num">' + OTD.fmtNum(g.qtd) + "</span>",
                '<span class="num">' + OTD.fmtBRLcents(g.valor) + "</span>"];
      }));
  }

  /* ------------------------------------------------------------ regras --- */
  function repomRegrasHtml() {
    const a = OTD.REPOM.auditoria, r = OTD.REPOM.resumo;
    const regra = function (cod, tit, txt) {
      return '<div class="miniline"><b>' + E(cod) + " · " + E(tit) + "</b><br>" +
             '<span style="color:var(--text-dim);font-size:12.5px">' + txt + "</span></div>";
    };
    return secao("Como cada número é calculado") +
      '<div class="grid g-charts-2">' +
      card(
        '<div class="phead"><span class="ptitle">Regras do contrato</span></div>' +
        regra("A1", "Chave única = Nº carta frete",
          "O romaneio <b>não</b> serve de chave: quando uma carta frete é cancelada e " +
          "reemitida, o mesmo romaneio aparece várias vezes. Nesta base são 11.682 cartas " +
          "para 11.086 romaneios.") +
        regra("A2", "Cancelado fica fora de tudo",
          "Contrato com Status Repom = <b>Cancelado</b> não entra em valor, contagem nem " +
          "gráfico (decisão do gestor em 20/08/2026). Depois desse corte sobra exatamente " +
          "uma linha viva por romaneio.") +
        regra("A3", "Saldo em aberto",
          "É todo contrato com <b>Situação saldo = Aberto</b>, qualquer que seja o Status " +
          "Repom — inclusive os que constam como “Pago”. O valor é sempre a coluna " +
          "<i>Vlr. saldo</i>.") +
        regra("A4", "Previsão de pagamento",
          "O saldo é pago nos dias <b>10, 20 e no último dia do mês</b>, sempre <b>20 dias " +
          "depois do corte em que a quitação caiu</b> — ou seja, dois cortes adiante:" +
          '<br><span style="color:var(--text)">quitou de <b>01 a 10</b> → recebe no <b>fim do mês</b>' +
          "<br>quitou de <b>11 a 20</b> → recebe no <b>dia 10</b> do mês seguinte" +
          "<br>quitou do <b>21 ao fim do mês</b> → recebe no <b>dia 20</b> do mês seguinte</span>" +
          "<br>Só existe com saldo aberto <b>e</b> data de quitação preenchida.") +
        regra("A5", "Aguardando quitação",
          "Contrato aberto <b>sem</b> data de quitação (tipicamente Pendente ou Em Trânsito) " +
          "não tem previsão — aparece em lista separada, nunca misturado ao calendário.")
      ) +
      card(
        '<div class="phead"><span class="ptitle">De onde vem cada valor</span></div>' +
        regra("A5b", "Carta frete reemitida",
          "Quando o mesmo <b>romaneio</b> aparece com mais de uma carta frete, vale " +
          "<b>somente a mais recente</b> — é reemissão, a segunda substitui a primeira. " +
          "Sem isso a receita daquela carga entraria duas vezes. Confirmado com o gestor " +
          "em 24/08/2026. A auditoria do pipeline informa quantas foram descartadas.") +
        regra("A6", "Pago ao agregado",
          "Coluna <i>Vlr. unitário</i> do lrepom — o valor cheio do contrato, confirmado " +
          "com o gestor.") +
        regra("A7", "Receita da carga",
          "Vem da <b>Torre</b>, não do lrepom: CT-e/CRT real do romaneio e, nas cargas " +
          "Ponta Grossa × Ponta Grossa, o faturamento simulado da regra R8. A coluna " +
          "<i>Total CTe bruto</i> do lrepom fica zerada nessas cargas, por isso não serve " +
          "sozinha (onde ela existe, bate com o frete da viagem).") +
        regra("A8", "Margem",
          "Receita da carga menos o pago ao agregado, contrato a contrato.") +
        regra("A9", "Cruzamento com a Torre",
          "Feito pelo <b>Nº romaneio</b> contra o lviagens — é o que traz cliente, rota, " +
          "segmento e KM. Contrato sem carga correspondente fica de fora (é o caso de " +
          "todo o histórico de dez/25, autorizado pelo gestor).")
      ) +
      "</div>" +
      secao("Metadados da base") +
      card('<div class="grid g-3" style="gap:10px">' +
        [["Arquivo de origem", (r.arquivos || []).join(", ") || "—"],
         ["Período coberto", OTD.fmtData(r.periodo[0]) + " a " + OTD.fmtData(r.periodo[1])],
         ["Contratos aproveitados", OTD.fmtNum(a.aproveitados || 0)],
         ["Cancelados descartados", OTD.fmtNum(a.cancelados || 0)],
         ["Sem carga na Torre", OTD.fmtNum(a.semViagem || 0)],
         ["Romaneios repetidos após o corte", OTD.fmtNum(a.romaneiosDuplicadosAposCorte || 0) +
          (a.romaneiosDuplicadosAposCorte ? " ⚠️" : " ✓")],
         ["Sem receita em nenhuma fonte", OTD.fmtNum(a.semReceita || 0)],
         ["Abertos sem data de quitação", OTD.fmtNum(a.abertoSemQuitacao || 0)],
         ["Linhas não-agregado descartadas", OTD.fmtNum((a.naoAgregado || 0) + (a.linhaSemModalidade || 0))]
        ].map(function (p) {
          return '<div class="miniline"><b>' + E(p[0]) + "</b><br>" +
                 '<span class="num" style="color:var(--text-dim)">' + E(p[1]) + "</span></div>";
        }).join("") + "</div>");
  }

  /* ======================================================================= */
  /* ABA · PAINEL DE MONITORAMENTO                                           */
  /* Foto AO VIVO da frota. Le exatamente as mesmas funcoes que o telao       */
  /* (OTD.monitor*), entao aba e TV nunca divergem: se o numero diferir, o    */
  /* bug e de layout, nunca de criterio.                                     */
  /* Nao usa os filtros de periodo do topo - "agora" nao tem periodo.         */
  /* ======================================================================= */
  let monSeg = "TODOS";

  function monSegmentosDisponiveis() {
    return (OTD.MONITOR && OTD.MONITOR.segmentos) || [];
  }
  function monSegsAtivos() {
    return monSeg === "TODOS" ? [] : [monSeg];
  }

  function abaMonitoramento() {
    if (!OTD.monitorTem()) {
      return secao("Painel de Monitoramento") +
        '<div class="card"><div class="manual-card"><span class="val">' +
        "Sem base de monitoramento. Coloque o <b>lmonitoramento</b> numa pasta " +
        "de bases e rode o pipeline.</span></div></div>";
    }
    const M = OTD.MONITOR;
    const chips = ["TODOS"].concat(monSegmentosDisponiveis()).map(function (s) {
      return '<button class="chip' + (s === monSeg ? " on" : "") +
        '" data-monseg="' + OTD.escapeHtml(s) + '">' +
        OTD.escapeHtml(s === "TODOS" ? "Todos os segmentos" : s) + "</button>";
    }).join("");

    return secao("Painel de Monitoramento",
        '<span class="live-tag">tempo real</span>' +
        '<span class="hint">foto de ' + OTD.fmtDataHora(M.geradoEm) + "</span>") +
      '<div class="filterbar" style="margin-bottom:16px"><div class="filterrow">' +
      '<span class="lbl">Segmento</span>' + chips + "</div></div>" +
      '<div class="grid g-3" id="monKpis"></div>' +
      secao("Onde Está a Frota") +
      /* precisa da classe "panel": o flex do .phead so existe dentro dela -
         sem ela o titulo e a contagem saem colados ("Mapa da frota16 cidades") */
      '<div class="card panel"><div class="phead">' +
      '<span class="ptitle">Mapa da frota</span>' +
      '<span class="pcount" id="monMapaCnt"></span></div>' +
      '<div id="monMapaDash" style="height:560px;display:flex;' +
      'align-items:center;justify-content:center"></div></div>' +
      secao("Ações do Monitoramento",
        '<span class="hint">cada lista está ordenada da mais urgente para a menos</span>') +
      '<div class="grid g-2" id="monListas"></div>' +
      secao("Alertas & Insights") +
      '<div class="card"><div id="monInsightsDash"></div></div>';
  }

  function monCardLista(titulo, itens, montaLinha, vazio) {
    return '<div class="card panel"><div class="phead">' +
      '<span class="ptitle">' + OTD.escapeHtml(titulo) + "</span>" +
      '<span class="pcount">' + OTD.fmtNum(itens.length) + "</span></div>" +
      (itens.length
        ? '<div class="mon-lista">' + itens.slice(0, 12).map(montaLinha).join("") +
          (itens.length > 12
            ? '<div class="mon-mais">+' + (itens.length - 12) + " outros</div>"
            : "") + "</div>"
        : '<div class="manual-card"><span class="val">✅ ' +
          OTD.escapeHtml(vazio) + "</span></div>") +
      "</div>";
  }

  function renderMonitoramento() {
    if (!OTD.monitorTem()) return;
    const M = OTD.MONITOR;
    const segs = monSegsAtivos();
    const LIM = M.limites;
    const c = OTD.monitorContador(segs);
    const E = OTD.escapeHtml;

    /* ---- KPIs: os cinco status + finalizadas ---- */
    const kpis = document.getElementById("monKpis");
    if (kpis) {
      kpis.innerHTML = OTD.MONITOR_STATUS.map(function (s) {
        return '<div class="card kpi"><div class="lbl">' + E(s.rot) + "</div>" +
          '<div class="val num" style="color:' + s.cor + '">' +
          OTD.fmtNum(c[s.id]) + "</div>" +
          '<div class="sub">' + s.ic + " de " + OTD.fmtNum(c.total) +
          " ativos</div></div>";
      }).join("") +
      '<div class="card kpi"><div class="lbl">Finalizadas no dia</div>' +
      '<div class="val num" style="color:#4ADE80">' + OTD.fmtNum(c.finalizadas) +
      "</div><div class=\"sub\">🏁 vem do lviagens</div></div>";
    }

    /* ---- mapa ----
       O desenho usa a REGIAO (estado/provincia), que nao depende da tabela de
       coordenadas: a UF vem preenchida sempre, entao todo veiculo ativo conta.
       A contagem por cidade continua existindo, mas so como detalhe. */
    const regioes = OTD.monitorMapaUF(segs);
    const pts = OTD.monitorMapa(segs);
    const mapa = document.getElementById("monMapaDash");
    if (mapa) {
      mapa.innerHTML = window.OTD_MAPA
        ? OTD_MAPA.desenhar(regioes, { escape: E })
        : "";
    }
    const cnt = document.getElementById("monMapaCnt");
    if (cnt) {
      const total = regioes.reduce(function (a, g) { return a + g.qtd; }, 0);
      cnt.textContent = total + " veículos em " + regioes.length +
        " estados/províncias · " + pts.length + " cidades identificadas";
    }

    /* ---- listas de acao ---- */
    /* Layout proprio: o .rankrow tem a 1a coluna de 24px e o tempo ("23h36
       parado") vazava por cima da placa. Aqui cada peca tem sua coluna. */
    /* Mesmo desenho do telão: STATUS em caixa alta no topo, placa + cliente
       embaixo. Assim a aba e a TV se leem igual. */
    function linhaBase(r, titulo, tempo, cor, extra) {
      return '<div class="mon-item">' +
        '<div class="mon-hd"><span class="st">' + E(String(titulo).toUpperCase()) +
        '</span><span class="tp" style="color:' + cor + '">' + E(tempo) + "</span></div>" +
        '<div class="mon-bd"><span class="pl">' + E(r.placa) + "</span>" +
        (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 30)) +
         "</span>" : "") +
        '<span class="sg">' + E(r.seg) + "</span></div>" +
        '<div class="mon-lo">' + E(r.cidade) + "/" + E(r.uf) +
        (extra ? " · " + extra : "") + "</div></div>";
    }
    const listas = document.getElementById("monListas");
    if (listas) {
      listas.innerHTML =
        monCardLista("Vazios — precisam de destino",
          OTD.monitorLista("vazios", segs),
          function (r) {
            return linhaBase(r, "parado", OTD.fmtHM(r.hParado), "#F1553F");
          }, "Nenhum veículo vazio.") +
        monCardLista("Retidos em carga/descarga acima de " + LIM.retido + "h",
          OTD.monitorLista("retidos", segs),
          function (r) {
            const quem = r.status === "Carga" ? r.remetente : r.destinatario;
            return linhaBase(r, r.status, OTD.fmtHM(r.hEvento),
                             OTD.monitorCorTempo(r.hEvento, LIM.retido),
                             "acionar <b>" + E(OTD.shortName(quem || "—", 34)) + "</b>");
          }, "Nada retido além do limite.") +
        monCardLista("Em viagem parados acima de " + LIM.pernoite + "h",
          OTD.monitorLista("pernoite", segs),
          function (r) {
            return linhaBase(r, "parado em rota", OTD.fmtHM(r.hParado),
                             OTD.monitorCorTempo(r.hParado, LIM.pernoite));
          }, "Ninguém parado além do pernoite.") +
        monCardLista("Sem CT-e ou MDF-e emitido",
          OTD.monitorLista("semDocumento", segs),
          function (r) {
            const falta = [r.faltaCte ? "CT-e" : null,
                           r.faltaMdfe ? "MDF-e" : null].filter(Boolean).join(" e ");
            return linhaBase(r, "falta " + falta, "—", "#FFC145",
                             "destino <b>" + E(OTD.shortName(r.destino || "—", 34)) + "</b>");
          }, "Documentação em dia.") +
        monCardLista("Sem posicionar acima de " + LIM.semPosicao + "h",
          OTD.monitorLista("semPosicao", segs),
          function (r) {
            return linhaBase(r, r.semRastreio ? "sem rastreio" : "sem posição",
                             r.semRastreio ? "—" : OTD.fmtHM(r.horas),
                             r.semRastreio ? "#F1553F" : "#FFC145");
          }, "Toda a frota posicionando.") +
        monCardLista("Veículo sem motorista (para o RH)",
          OTD.monitorLista("semMotorista", segs),
          function (r) { return linhaBase(r, "sem motorista", "RH", "#B18CFF"); },
          "Todos os veículos com motorista.");
    }

    /* ---- insights: as mesmas leituras do telao ---- */
    const ins = document.getElementById("monInsightsDash");
    if (ins) {
      const lista = OTD.monitorInsights(segs);
      const ICO = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };
      ins.innerHTML = '<div class="mon-ins-lista">' + lista.map(function (n) {
        return '<div class="mon-ins ' + n.sev + '">' +
          '<div class="ic">' + ICO[n.sev] + "</div>" +
          '<div class="tx"><div class="tt">' + E(n.titulo) + "</div>" +
          '<div class="ds">' + E(n.texto) + "</div></div>" +
          '<div class="vl num">' + E(String(n.valor)) + "</div></div>";
      }).join("") + "</div>";
    }

    /* ---- chips de segmento ---- */
    document.querySelectorAll("[data-monseg]").forEach(function (b) {
      b.onclick = function () {
        monSeg = b.dataset.monseg;
        document.querySelectorAll("[data-monseg]").forEach(function (o) {
          o.classList.toggle("on", o.dataset.monseg === monSeg);
        });
        renderMonitoramento();
      };
    });
  }

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
    { id: "repom", ico: "🤝", nome: "Agregados", html: abaRepom, render: renderRepom },
    { id: "monitoramento", ico: "🛰️", nome: "Monitoramento",
      html: abaMonitoramento, render: renderMonitoramento },
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

  function montarMultiselect(id, rotulo, valores, alvo, aoMudar) {
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
      (aoMudar || render)();
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
    /* a aba Agregados tem filtro proprio (por contrato, nao por documento):
       esconder o filtro da Torre evita dois filtros concorrentes na tela */
    const barra = document.querySelector(".page > .filterbar");
    if (barra) barra.style.display = (aba.id === "repom") ? "none" : "";
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
