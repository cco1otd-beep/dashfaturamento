/* ===========================================================================
   TORRE DE CONTROLE LOGISTICA - OTD LOGISTICS
   common.js - utilidades compartilhadas (namespace OTD)
   Carrega DEPOIS do data.js.
   =========================================================================== */

const OTD = (function () {

  /* ---------------------------------------------------------------- dados */
  /* O data.js vem compactado em duas camadas, para caber num Raspberry:
       1. formato COLUNAR  {c:[colunas], l:[[valores]]}  — não repete o nome
          de cada campo em milhares de registros;
       2. DICIONÁRIO de textos — campos que se repetem (cliente, motorista,
          placa…) viram índices em window.OTD_DIC.
     As duas são desfeitas aqui, uma única vez, na carga. */
  const DIC = (window.OTD_DIC || {});

  function expandir(pacote) {
    if (!pacote) return [];
    if (Array.isArray(pacote)) return pacote;          /* formato antigo */
    const cols = pacote.c || [], linhas = pacote.l || [];
    const n = cols.length;
    const saida = new Array(linhas.length);
    for (let i = 0; i < linhas.length; i++) {
      const ln = linhas[i], obj = {};
      for (let j = 0; j < n; j++) {
        const k = cols[j];
        const v = ln[j];
        obj[k] = (DIC[k] && typeof v === "number") ? DIC[k][v] : v;
      }
      saida[i] = obj;
    }
    return saida;
  }

  const DATA = expandir(window.OTD_DATA);
  const VIAGENS = expandir(window.OTD_VIAGENS);
  const DOCS = expandir(window.OTD_DOCS);
  const OMS = (window.OTD_OMS || null);
  const ENTREGAS = (window.OTD_ENTREGAS || null);
  const ATRASOS = (window.OTD_ATRASOS || null);
  const MONITOR = (window.OTD_MONITOR || null);
  const META = (window.OTD_META || {});

  /* ---- Agregados REPOM (aba propria + telao proprio) --------------------- */
  const REPOM_RAW = (window.OTD_REPOM || null);
  const REPOM = REPOM_RAW ? {
    itens: expandir(REPOM_RAW.itens),
    resumo: REPOM_RAW.resumo || {},
    auditoria: REPOM_RAW.auditoria || {}
  } : { itens: [], resumo: {}, auditoria: {} };

  const GRUPO_SEG = {
    "LATAS": "LATAS",
    "BENS DE CO": "BENS DE CONSUMO",
    "RODANDO": "AUTOPROPULSOR",
    "PRANCHA": "PRANCHA"
  };

  /* Hidrata campos derivados que o data.js nao carrega (para ficar leve). */
  VIAGENS.forEach(function (v) {
    v.seg = GRUPO_SEG[v.grupo] || "OUTROS";
    v.rota = (v.carreg || "—") + " → " + (v.destino || "—");
    v.rotaVazio = (v.origem || v.carreg || "—") + " → " + (v.carreg || "—");
    v.otd = /^OTD/i.test((v.placa || "").replace("-", ""));
  });
  DATA.forEach(function (r) {
    r.rota = (r.carreg || "—") + " → " + (r.destino || "—");
    r.otd = /^OTD/i.test((r.placa || "").replace("-", ""));
  });

  const PALETTE = ["#F0800E", "#2DD4BF", "#4FA3E3", "#FFC145", "#B18CFF",
                   "#4ADE80", "#F1553F", "#FF7AB6", "#C4650A", "#9AA5B1"];

  const MESES_PT_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const MESES_PT_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                          "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const DIAS_PT_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
                        "Quinta-feira", "Sexta-feira", "Sábado"];

  /* ----------------------------------------------------------- formatacao */
  function fmtBRL(v) {
    v = Number(v) || 0;
    return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtBRLcents(v) {
    v = Number(v) || 0;
    return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNum(v, dec) {
    dec = dec || 0;
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtKm(v) { return fmtNum(v, 0) + " km"; }
  function fmtPct(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    dec = (dec === undefined) ? 1 : dec;
    /* sem separador de milhar: "1024%" e nao "1.024%" (evita ler como 1,024) */
    return (Number(v)).toLocaleString("pt-BR", {
      minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false
    }) + "%";
  }
  function fmtCompacto(v) {
    v = Number(v) || 0;
    if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "M";
    if (Math.abs(v) >= 1000) return Math.round(v / 1000) + "k";
    return fmtNum(v, 0);
  }
  function fmtHoras(h) {
    h = Number(h) || 0;
    const sinal = h < 0 ? "-" : "";
    h = Math.abs(h);
    const dias = Math.floor(h / 24);
    const horas = Math.floor(h % 24);
    const min = Math.round((h - Math.floor(h)) * 60);
    if (dias > 0) return sinal + dias + "d " + horas + "h";
    if (horas > 0) return sinal + horas + "h " + (min < 10 ? "0" : "") + min + "m";
    return sinal + min + "m";
  }

  /* ---------------------------------------------------------------- datas */
  function parseD(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  function daysBetween(a, b) {
    a = parseD(a); b = parseD(b);
    if (!a || !b) return null;
    return (b - a) / 86400000;
  }
  function hoursBetween(a, b) {
    a = parseD(a); b = parseD(b);
    if (!a || !b) return null;
    return (b - a) / 3600000;
  }
  /* SEMPRE local, nunca toISOString (13.2) */
  function dayKey(d) {
    d = parseD(d) || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function monthKey(d) {
    d = parseD(d);
    if (!d) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function monthLabel(key) {
    if (!key) return "—";
    const p = String(key).split("-");
    return MESES_PT_CURTO[+p[1] - 1] + "/" + p[0].slice(2);
  }
  function monthLabelFull(key) {
    if (!key) return "—";
    const p = String(key).split("-");
    return MESES_PT_FULL[+p[1] - 1] + " de " + p[0];
  }
  function daysInMonth(key) {
    const p = String(key).split("-");
    return new Date(+p[0], +p[1], 0).getDate();
  }
  function nowKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function prevMonthKey(key) {
    const p = String(key).split("-");
    const d = new Date(+p[0], +p[1] - 2, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function availableMonths() {
    const s = new Set();
    DATA.forEach(function (r) { if (r.mesRef) s.add(r.mesRef); });
    return Array.from(s).sort();
  }
  function fmtData(s) {
    const d = parseD(s);
    if (!d) return "—";
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  function fmtDataHora(s) {
    const d = parseD(s);
    if (!d) return "—";
    return fmtData(s) + " " + String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }

  /* -------------------------------------------------------------- filtros */
  /* f = {meses:Set, de:"AAAA-MM-DD", ate:"AAAA-MM-DD",
          clientes:Set, motoristas:Set, placas:Set, rotas:Set,
          segs:Set, grupos:Set}                                            */
  function applyEntityFilters(rows, f) {
    f = f || {};
    const has = function (s) { return s && s.size > 0; };
    if (!has(f.clientes) && !has(f.motoristas) && !has(f.placas) &&
        !has(f.rotas) && !has(f.segs) && !has(f.grupos)) return rows;
    return rows.filter(function (r) {
      if (has(f.clientes) && !f.clientes.has(r.cliente)) return false;
      if (has(f.motoristas) && !f.motoristas.has(r.motorista)) return false;
      if (has(f.placas) && !f.placas.has(r.placa)) return false;
      if (has(f.rotas) && !f.rotas.has(r.rota)) return false;
      if (has(f.segs) && !f.segs.has(r.seg)) return false;
      if (has(f.grupos) && !f.grupos.has(r.grupo)) return false;
      return true;
    });
  }

  /* Range de data tem prioridade sobre o Set de meses. */
  function applyPeriodFilter(rows, f) {
    f = f || {};
    if (f.de || f.ate) {
      const de = f.de || "0000-00-00", ate = f.ate || "9999-99-99";
      return rows.filter(function (r) {
        const d = r.dtEmissao || r.dtCargaI || r.dtSol;
        if (!d) return false;
        const k = String(d).slice(0, 10);
        return k >= de && k <= ate;
      });
    }
    if (f.meses && f.meses.size > 0) {
      return rows.filter(function (r) { return r.mesRef && f.meses.has(r.mesRef); });
    }
    return rows;
  }

  function filterAll(f) { return applyEntityFilters(applyPeriodFilter(DATA, f), f); }

  /* Ignora periodo (tempo real): so entidades. */
  function operational(f) { return applyEntityFilters(VIAGENS, f); }

  /* ----------------------------------------------------------- agregacoes */
  function sumBy(rows, keyFn, valFn) {
    valFn = valFn || function (r) { return r.frete; };
    const m = new Map();
    rows.forEach(function (r) {
      const k = keyFn(r) || "—";
      m.set(k, (m.get(k) || 0) + (Number(valFn(r)) || 0));
    });
    return m;
  }
  function countBy(rows, keyFn) {
    const m = new Map();
    rows.forEach(function (r) {
      const k = keyFn(r) || "—";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }
  /* FOOTGUN: sempre remove o fallback "—" antes de plotar (13.1). */
  function topN(map, n, asc) {
    const m = new Map(map);
    m.delete("—");
    m.delete("");
    const arr = Array.from(m.entries());
    arr.sort(function (a, b) { return asc ? a[1] - b[1] : b[1] - a[1]; });
    return arr.slice(0, n || 10);
  }
  function totalFaturamento(rows) {
    return rows.reduce(function (s, r) { return s + (Number(r.frete) || 0); }, 0);
  }
  function totalFretePeso(rows) {
    return rows.reduce(function (s, r) { return s + (Number(r.fretePeso) || 0); }, 0);
  }
  function totalKm(rows) {
    return rows.reduce(function (s, r) {
      return s + (Number(r.kmVazio) || 0) + (Number(r.kmCarreg) || 0);
    }, 0);
  }
  function totalKmCarregado(rows) {
    return rows.reduce(function (s, r) { return s + (Number(r.kmCarreg) || 0); }, 0);
  }
  function totalKmVazio(rows) {
    return rows.reduce(function (s, r) { return s + (Number(r.kmVazio) || 0); }, 0);
  }
  function contarViagens(rows) {
    /* Ponta Grossa vem agregado por dia+placa: um registro representa
       qtdCargas viagens do shuttle. */
    const s = new Set();
    let extras = 0;
    rows.forEach(function (r) {
      if (r.qtdCargas > 1) { extras += r.qtdCargas - 1; }
      if (r.id) s.add(r.id);
    });
    return s.size + extras;
  }
  function statusCounts(rows) {
    const c = { em_transito: 0, nao_iniciado: 0, concluido: 0 };
    rows.forEach(function (r) { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }
  function distinct(rows, keyFn) {
    const s = new Set();
    rows.forEach(function (r) { const k = keyFn(r); if (k) s.add(k); });
    return Array.from(s).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }
  function distinctClientes() { return distinct(DATA, function (r) { return r.cliente; }); }
  function distinctMotoristas() { return distinct(DATA, function (r) { return r.motorista; }); }
  function distinctPlacas() { return distinct(DATA, function (r) { return r.placa; }); }
  function distinctRotas() { return distinct(DATA, function (r) { return r.rota; }); }
  function distinctSegmentos() { return distinct(DATA, function (r) { return r.seg; }); }

  /* ----------------------------------------------------- meta e projecao */
  function dailySeries(rows, mes) {
    const n = daysInMonth(mes);
    const serie = new Array(n).fill(0);
    rows.forEach(function (r) {
      const d = parseD(r.dtEmissao || r.dtCargaI);
      if (!d) return;
      if (monthKey(d) !== mes) return;
      serie[d.getDate() - 1] += (Number(r.frete) || 0);
    });
    return serie;
  }
  function projectMonth(rows, mes) {
    const totalDays = daysInMonth(mes);
    const hoje = new Date();
    const isCurrent = (monthKey(hoje) === mes);
    const elapsed = isCurrent ? hoje.getDate() : totalDays;
    const total = rows.reduce(function (s, r) {
      return s + (r.mesRef === mes ? (Number(r.frete) || 0) : 0);
    }, 0);
    const dailyAvg = elapsed > 0 ? total / elapsed : 0;
    return {
      total: total, dailyAvg: dailyAvg, projected: dailyAvg * totalDays,
      elapsed: elapsed, totalDays: totalDays, isCurrent: isCurrent
    };
  }
  /* --------------------------------------------------- meta por segmento --
     Ate 31/08 existia UMA meta do mes, digitada a mao. O gestor pediu quatro,
     uma por operacao, e escolheu o modelo "global = soma das quatro": a meta
     do mes deixa de ser digitada e passa a ser a soma, entao total e partes
     nunca discordam. Cada segmento tem sua propria sugestao automatica (o mes
     fechado anterior DAQUELE segmento x 1,05), e o que o gestor digita fica
     guardado por mes e por segmento. */
  const SEGMENTOS_META = ["BENS DE CONSUMO", "LATAS", "AUTOPROPULSOR", "PRANCHA"];
  const ROTULO_SEG_META = {
    "BENS DE CONSUMO": "Bens de Consumo",
    "LATAS": "Latas",
    "AUTOPROPULSOR": "Autopropulsor / Rodando",
    "PRANCHA": "Pranchas"
  };

  function chaveMetaSeg(mes, seg) { return "otd_meta_seg_" + seg + "_" + mes; }

  function suggestGoalSeg(mes, seg) {
    const meses = availableMonths();
    const anterior = meses.filter(function (m) { return m < mes; }).pop();
    if (!anterior) return 0;
    const tot = DATA.reduce(function (s, r) {
      return s + (r.mesRef === anterior && r.seg === seg ? (Number(r.frete) || 0) : 0);
    }, 0);
    return Math.round(tot * 1.05 / 1000) * 1000;
  }
  /* true quando o valor veio do gestor, e nao da sugestao - a tela avisa qual
     e qual, senao ninguem sabe se o numero foi decidido ou calculado */
  function goalSegDefinida(mes, seg) {
    try {
      const v = localStorage.getItem(chaveMetaSeg(mes, seg));
      return v !== null && v !== "";
    } catch (e) { return false; }
  }
  function getGoalSeg(mes, seg) {
    try {
      const v = localStorage.getItem(chaveMetaSeg(mes, seg));
      if (v !== null && v !== "") return Number(v);
    } catch (e) { /* modo kiosk sem storage */ }
    return suggestGoalSeg(mes, seg);
  }
  function setGoalSeg(mes, seg, valor) {
    try {
      if (valor === null || valor === "") localStorage.removeItem(chaveMetaSeg(mes, seg));
      else localStorage.setItem(chaveMetaSeg(mes, seg), String(valor));
    } catch (e) { }
  }

  function getGoal(mes) {
    /* o hook do pipeline (META_FIXA_TEMPORARIA) continua mandando no total */
    if (META.metaFixaTemporaria && META.metaFixaTemporaria[mes]) {
      return Number(META.metaFixaTemporaria[mes]);
    }
    return SEGMENTOS_META.reduce(function (s, seg) {
      return s + getGoalSeg(mes, seg);
    }, 0);
  }
  /* Mantida para nao quebrar chamada antiga: distribuir um total pelos quatro
     seria inventar rateio, entao ela nao faz nada e avisa no console. */
  function setGoal(mes, valor) {
    console.warn("setGoal: a meta do mes agora e a soma das quatro por " +
                 "segmento - use setGoalSeg(mes, segmento, valor).");
  }
  function suggestGoal(mes) {
    const meses = availableMonths();
    const anterior = meses.filter(function (m) { return m < mes; }).pop();
    if (!anterior) return 0;
    const tot = DATA.reduce(function (s, r) {
      return s + (r.mesRef === anterior ? (Number(r.frete) || 0) : 0);
    }, 0);
    return Math.round(tot * 1.05 / 1000) * 1000;
  }

  /* --------------------------------------------------------------- texto */
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shortName(s, max) {
    s = String(s || "");
    max = max || 26;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }
  function clienteShort(s) {
    s = String(s || "");
    const i = s.indexOf(" - ");
    return i > 0 ? s.slice(0, i) : s;
  }
  function corPct(v, bom, medio) {          /* OTP/OTD: verde >=90, amarelo >=75 */
    if (v === null || v === undefined) return "b-amber";
    if (v >= bom) return "b-green";
    if (v >= medio) return "b-amber";
    return "b-red";
  }
  function corVazio(v) {                     /* verde <=25, amarelo <=40, senao vermelho */
    if (v === null || v === undefined) return "b-amber";
    if (v <= 25) return "b-green";
    if (v <= 40) return "b-amber";
    return "b-red";
  }
  function corSeveridade(sev) {
    return sev === "critico" ? "b-red" : (sev === "atencao" ? "b-amber" : "b-grey");
  }
  function rotuloSeveridade(sev) {
    return sev === "critico" ? "Crítico" : (sev === "atencao" ? "Atenção" : "Leve");
  }

  /* ------------------------------------------------------ config Chart.js */
  /* -----------------------------------------------------------------------
     PLUGIN GLOBAL DE RÓTULOS DE VALOR
     Escreve o número em cima/dentro de cada barra, ponto e fatia, para nao
     precisar "adivinhar" o valor pelo eixo. Registrado globalmente: vale para
     TODOS os graficos. Para desligar num grafico: options.plugins.valores=false
     Config por grafico: options.plugins.valores = {
        formato: "brl" | "brlCheio" | "num" | "pct" | "compacto",
        cor: "#F6F4F0", fonte: 12, minPct: 3.5, sufixo: ""
     }
     ----------------------------------------------------------------------- */
  function textoValor(v, formato) {
    if (formato === "brl") return "R$ " + fmtCompacto(v);
    if (formato === "brlCheio") return fmtBRL(v);
    if (formato === "pct") return fmtPct(v, 1);
    if (formato === "num") return fmtNum(v, 0);
    return fmtCompacto(v);
  }

  const pluginValores = {
    id: "valores",
    afterDatasetsDraw: function (chart) {
      const plugins = chart.options.plugins || {};
      if (plugins.valores === false) return;
      const conf = plugins.valores || {};
      const formato = conf.formato || "compacto";
      const minPct = conf.minPct === undefined ? 4 : conf.minPct;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      if (!area) return;

      /* eixos empilhados: so o ultimo dataset desenha, e desenha o total */
      const escalas = chart.options.scales || {};
      const empilhado = !!((escalas.x && escalas.x.stacked) || (escalas.y && escalas.y.stacked));
      const nDs = chart.data.datasets.length;

      ctx.save();
      chart.data.datasets.forEach(function (ds, di) {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        const tipo = meta.type || chart.config.type;
        if (empilhado && tipo === "bar" && di !== nDs - 1) return;
        /* limita a quais datasets recebem rotulo (evita poluir grafico de 3 linhas) */
        if (conf.somenteDataset !== undefined) {
          const alvo = conf.somenteDataset;
          const ok = Array.isArray(alvo) ? alvo.indexOf(di) >= 0 : alvo === di;
          if (!ok) return;
        }

        const pontos = meta.data || [];
        /* fonte encolhe e o prefixo "R$" cai quando ha muitos elementos */
        const denso = pontos.length > 16;
        const base = conf.fonte || (pontos.length > 24 ? 9.5 : pontos.length > 14 ? 10.5 : 12);
        ctx.font = "700 " + base + "px -apple-system,'Segoe UI',Roboto,Arial,sans-serif";
        const fmtUsado = (denso && formato === "brl") ? "compacto" : formato;

        const soma = (ds.data || []).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);

        pontos.forEach(function (el, i) {
          let v = ds.data[i];
          if (v === null || v === undefined) return;
          if (typeof v === "object") v = v.y !== undefined ? v.y : v.x;
          v = Number(v);
          if (!isFinite(v) || v === 0) return;

          /* soma da pilha quando empilhado */
          if (empilhado && tipo === "bar") {
            v = 0;
            chart.data.datasets.forEach(function (d2, k) {
              if (chart.getDatasetMeta(k).hidden) return;
              const x = Number(d2.data[i]);
              if (isFinite(x)) v += x;
            });
            if (v === 0) return;
          }

          const txt = textoValor(v, fmtUsado) + (conf.sufixo || "");

          /* ---------- rosca / pizza ---------- */
          if (tipo === "doughnut" || tipo === "pie") {
            const pct = soma ? 100 * v / soma : 0;
            if (pct < minPct) return;
            const p = el.getCenterPoint();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 0;
            ctx.fillStyle = conf.corRosca || "#17100a";
            ctx.font = "800 " + (base + 1) + "px -apple-system,'Segoe UI',Roboto,Arial,sans-serif";
            ctx.fillText(txt, p.x, p.y - 9);
            ctx.font = "700 " + (base - 1) + "px -apple-system,'Segoe UI',Roboto,Arial,sans-serif";
            ctx.fillText(fmtPct(pct, 0), p.x, p.y + 9);
            return;
          }

          /* ---------- barra horizontal ---------- */
          if (tipo === "bar" && chart.options.indexAxis === "y") {
            const largura = ctx.measureText(txt).width;
            const cabeFora = el.x + largura + 12 < area.right;
            ctx.textBaseline = "middle";
            if (cabeFora) {
              ctx.textAlign = "left";
              ctx.fillStyle = conf.cor || "#F6F4F0";
              ctx.fillText(txt, el.x + 7, el.y);
            } else {
              ctx.textAlign = "right";
              ctx.fillStyle = "#120e0a";
              ctx.fillText(txt, el.x - 7, el.y);
            }
            return;
          }

          /* ---------- barra vertical / linha ---------- */
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const largura = ctx.measureText(txt).width;
          const vaoDisponivel = (area.right - area.left) / Math.max(1, pontos.length);
          /* escalona em duas alturas quando os rotulos nao cabem lado a lado */
          const escalona = largura > vaoDisponivel - 3;
          const desloca = (escalona && (i % 2 === 1)) ? base + 4 : 0;
          const y = Math.max(area.top + 11, el.y - 7 - desloca);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(6,6,5,.75)";
          ctx.strokeText(txt, el.x, y);
          ctx.fillStyle = conf.cor || "#F6F4F0";
          ctx.fillText(txt, el.x, y);
        });
      });
      ctx.restore();
    }
  };

  function setupChart() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#ABA69C";
    Chart.defaults.font.family = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.borderColor = "rgba(255,255,255,.06)";
    Chart.defaults.maintainAspectRatio = false;   /* 13.3 */
    Chart.defaults.animation.duration = 650;
    /* espaco para o rotulo nao ser cortado no topo */
    Chart.defaults.layout = Chart.defaults.layout || {};
    Chart.defaults.layout.padding = { top: 22, right: 10 };
    Chart.register(pluginValores);
  }

  /* Eixo de categorias das barras horizontais: autoSkip:false (13.3) */
  function eixoCategoriasY() {
    return { ticks: { color: "#d8d4cc", font: { size: 13 }, autoSkip: false },
             grid: { display: false } };
  }

  /* -----------------------------------------------------------------------
     CONTADOR DE CARGAS (tempo real, ignora periodo)
     ----------------------------------------------------------------------- */
  function contadorCargas(f) {
    const v = operational(f);
    const dia = (ENTREGAS && ENTREGAS.dia) || dayKey(new Date());
    /* O data.js só carrega a janela operacional de viagens (as concluídas
       antigas ficam fora). Os totais da base COMPLETA vêm do META. */
    const semFiltro = !f || !(f.grupos && f.grupos.size) &&
                            !(f.segs && f.segs.size);
    const c = {
      total: v.length,
      totalBase: (semFiltro && META.totalViagens) ? META.totalViagens : v.length,
      concluidasBase: (semFiltro && META.viagensConcluidasBase) || 0,
      emTransito: 0, aguardando: 0, concluidas: 0,
      emViagem: 0, emDescarga: 0, destinado: 0, finalizadasDia: 0,
      dia: dia
    };
    v.forEach(function (x) {
      if (x.status === "em_transito") c.emTransito++;
      else if (x.status === "nao_iniciado") c.aguardando++;
      else c.concluidas++;
      const se = x.statusEntrega;
      if (se === "em_viagem") c.emViagem++;
      else if (se === "em_descarga") c.emDescarga++;
      else if (se === "destinado") c.destinado++;
      else if (se === "finalizada" && String(x.dtDescT || "").slice(0, 10) === dia) c.finalizadasDia++;
    });
    return c;
  }

  /* -----------------------------------------------------------------------
     INSIGHTS AUTOMÁTICOS
     Regras determinísticas sobre os dados do período — sem chute, sempre
     acompanhadas do número que originou a leitura.
     Devolve [{nivel, icone, titulo, texto, valor}] ordenado por severidade.
     nivel: "critico" | "atencao" | "info" | "positivo"
     ----------------------------------------------------------------------- */
  const PESO_NIVEL = { critico: 0, atencao: 1, info: 2, positivo: 3 };

  function gerarInsights(rows, opts) {
    opts = opts || {};
    const out = [];
    const total = totalFaturamento(rows);
    const mes = opts.mes || null;
    const metaVeic = Number(opts.metaVeiculo) || 0;

    function add(nivel, icone, titulo, valor, texto) {
      out.push({ nivel: nivel, icone: icone, titulo: titulo, valor: valor, texto: texto });
    }

    /* ---- 1. concentração de cliente ---- */
    const porCliente = topN(sumBy(rows, function (r) { return r.cliente; }), 3);
    if (porCliente.length && total > 0) {
      const pct = 100 * porCliente[0][1] / total;
      if (pct >= 30) {
        add(pct >= 45 ? "critico" : "atencao", "🎯", "Concentração de receita",
          fmtPct(pct, 1) + " em " + porCliente[0][0],
          "Um único cliente responde por " + fmtPct(pct, 1) + " do faturamento (" +
          fmtBRL(porCliente[0][1]) + "). Perder esse contrato derruba o mês.");
      }
    }

    /* ---- 2. OMS: OTP / OTD abaixo do aceitável ---- */
    /* opts.gruposOms limita a leitura aos grupos da operação (telão por time) */
    const filtraGrupo = function (g) {
      return !opts.gruposOms || opts.gruposOms.indexOf(g) >= 0;
    };
    if (OMS && OMS.painel) {
      Object.keys(OMS.painel.grupos).filter(filtraGrupo).forEach(function (g) {
        const d = OMS.painel.grupos[g];
        const nome = g === "BENS DE CO" ? "Bens de Consumo" : "Latas";
        if (d.otpPct !== null && d.otpTotal > 0 && d.otpPct < 90) {
          add(d.otpPct < 75 ? "critico" : "atencao", "📦", "OTP fora da meta · " + nome,
            fmtPct(d.otpPct), d.otpAtrasadas + " de " + d.otpTotal +
            " coletas saíram atrasadas. Meta é 90%.");
        }
        if (d.otdPct !== null && d.otdTotal > 0 && d.otdPct < 90) {
          add(d.otdPct < 75 ? "critico" : "atencao", "🏁", "OTD fora da meta · " + nome,
            fmtPct(d.otdPct), d.otdAtrasadas + " de " + d.otdTotal +
            " entregas chegaram atrasadas. Meta é 90%.");
        }
        if (d.vazioMedia !== null && d.vazioMedia > 40) {
          add(d.vazioMedia >= 50 ? "critico" : "atencao", "🅿️", "KM vazio alto · " + nome,
            fmtPct(d.vazioMedia), "Média de " + d.vazioN + " romaneios. Cada ponto de vazio " +
            "é combustível rodando sem receita.");
        }
        if (d.otpPct === 100 && d.otpTotal >= 5) {
          add("positivo", "✅", "OTP impecável · " + nome, "100%",
            "As " + d.otpTotal + " coletas do dia saíram no prazo.");
        }
        if (d.otdPct === 100 && d.otdTotal >= 5) {
          add("positivo", "✅", "OTD impecável · " + nome, "100%",
            "As " + d.otdTotal + " entregas do dia chegaram no prazo.");
        }
      });
      const crit = (OMS.painel.ofensoresVazio || []).filter(function (o) {
        return o.sev === "critico" && filtraGrupo(o.grupo);
      });
      if (crit.length) {
        add("critico", "⛽", "Cargas críticas de KM vazio", fmtNum(crit.length) + " cargas",
          "Pior caso: romaneio " + crit[0].romaneio + " com " + fmtPct(crit[0].pct) +
          " de vazio (" + crit[0].rotaVazio + ").");
      }
    }

    /* ---- 3. meta e projeção do mês ---- */
    if (mes) {
      const p = projectMonth(rows, mes);
      const meta = getGoal(mes);
      if (meta > 0 && p.isCurrent) {
        const pct = 100 * p.projected / meta;
        if (pct < 90) {
          add(pct < 75 ? "critico" : "atencao", "📉", "Projeção abaixo da meta",
            fmtPct(pct, 0) + " da meta",
            "No ritmo atual (" + fmtBRL(p.dailyAvg) + "/dia) o mês fecha em " +
            fmtBRL(p.projected) + ", contra meta de " + fmtBRL(meta) + ".");
        } else if (pct >= 100) {
          add("positivo", "🚀", "Projeção acima da meta", fmtPct(pct, 0) + " da meta",
            "Ritmo de " + fmtBRL(p.dailyAvg) + "/dia projeta " + fmtBRL(p.projected) + ".");
        }
      }
    }

    /* ---- 4. veículos longe da meta ---- */
    if (metaVeic > 0) {
      const porPlaca = sumBy(rows.filter(function (r) { return !r.otd; }),
                             function (r) { return r.placa; });
      porPlaca.delete("—");
      let abaixo = 0, acima = 0;
      porPlaca.forEach(function (v) { if (v >= metaVeic) acima++; else abaixo++; });
      const n = abaixo + acima;
      if (n > 0) {
        const pctAcima = 100 * acima / n;
        add(pctAcima < 30 ? "atencao" : "info", "🚛", "Frota × meta por placa",
          acima + " de " + n + " bateram",
          fmtPct(pctAcima, 0) + " da frota atingiu a meta de " + fmtBRL(metaVeic) +
          " no período. " + abaixo + " placas ainda abaixo.");
      }
    }

    /* ---- 4b. CRT emitido e ainda sem romaneio ----------------------------
       A operacao emite o CRT ANTES de vincular a carga (confirmado pelo gestor
       em 31/08), entao esses documentos nao sao erro: o faturamento ja conta o
       valor cheio. O que falta e o vinculo operacional - romaneio, KM, placa -
       e enquanto ele nao vem a carga fica invisivel nas telas de operacao.
       Por isso o aviso e "info", nunca critico. */
    const orfaos = rows.filter(function (r) { return r.crtOrfao; });
    if (orfaos.length) {
      const vlr = orfaos.reduce(function (s2, r) {
        return s2 + (Number(r.frete) || 0);
      }, 0);
      add("info", "🔗", "CRT aguardando vínculo",
        fmtNum(orfaos.length) + " CRT",
        fmtNum(orfaos.length) + " CRT já emitidos ainda não foram vinculados a um " +
        "romaneio (" + fmtBRL(vlr) + "). O faturamento já conta esse valor; falta " +
        "amarrar a carga para a viagem aparecer na operação.");
    }

    /* ---- 5. qualidade de emissão de CT-e ---- */
    const docs = DOCS.filter(function (d) {
      if (mes && d.mesRef !== mes) return false;
      /* respeita o segmento da operação (telão por time) */
      if (opts.segs && opts.segs.length && opts.segs.indexOf(d.seg) < 0) return false;
      return true;
    });
    if (docs.length > 20) {
      const porEmi = new Map();
      docs.forEach(function (d) {
        let a = porEmi.get(d.emitente);
        if (!a) { a = { t: 0, e: 0 }; porEmi.set(d.emitente, a); }
        a.t++;
        if (d.situacao === "Cancelada" || d.situacao === "Substituída") a.e++;
      });
      let pior = null;
      porEmi.forEach(function (a, k) {
        if (a.t < 10) return;
        const taxa = 100 * a.e / a.t;
        if (!pior || taxa > pior.taxa) pior = { emi: k, taxa: taxa, t: a.t, e: a.e };
      });
      if (pior && pior.taxa >= 10) {
        add(pior.taxa >= 25 ? "critico" : "atencao", "📄", "Retrabalho na emissão",
          fmtPct(pior.taxa, 1) + " · " + pior.emi,
          pior.e + " de " + pior.t + " documentos emitidos por " + pior.emi +
          " foram cancelados ou substituídos.");
      }
    }

    /* ---- 6. rota mais deficitária em vazio ---- */
    const porRota = new Map();
    rows.forEach(function (r) {
      const k = r.rota;
      if (!k || k === "—") return;
      let a = porRota.get(k);
      if (!a) { a = { v: 0, c: 0, n: 0, frete: 0 }; porRota.set(k, a); }
      a.v += Number(r.kmVazio) || 0; a.c += Number(r.kmCarreg) || 0;
      a.n++; a.frete += Number(r.frete) || 0;
    });
    let piorRota = null;
    porRota.forEach(function (a, k) {
      if (a.n < 5 || (a.v + a.c) <= 0) return;
      const pct = 100 * a.v / (a.v + a.c);
      if (!piorRota || pct > piorRota.pct) piorRota = { rota: k, pct: pct, n: a.n };
    });
    if (piorRota && piorRota.pct > 45) {
      add(piorRota.pct >= 55 ? "critico" : "atencao", "🛣️", "Rota com mais KM vazio",
        fmtPct(piorRota.pct, 1), piorRota.rota + " · " + piorRota.n +
        " viagens no período. Vale procurar carga de retorno.");
    }

    /* ---- 7. cargas paradas aguardando início ---- */
    const c = contadorCargas(opts.filtro || {});
    if (c.aguardando > 0 && c.total > 0) {
      const pct = 100 * c.aguardando / c.totalBase;
      if (pct > 3) {
        add(pct > 6 ? "critico" : "atencao", "⏳", "Fila de cargas sem iniciar",
          fmtNum(c.aguardando) + " cargas",
          fmtPct(pct, 1) + " dos " + fmtNum(c.totalBase) +
          " romaneios da base está com carga aberta e sem carregamento iniciado.");
      }
    }

    /* ---- 8. sugestão de ganho rápido ---- */
    if (piorRota && porCliente.length) {
      add("info", "💡", "Sugestão", "Retorno na rota mais vazia",
        "Fechar retorno em " + shortName(piorRota.rota, 34) + " reduz o vazio médio " +
        "e melhora o R$/km — hoje em " +
        (totalKm(rows) ? fmtBRLcents(total / totalKm(rows)) : "—") + ".");
    }

    out.sort(function (a, b) { return PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]; });
    return out;
  }

  /* ------------------------------------------------------ filtro por URL */
  function filtroDaUrl() {
    const p = new URLSearchParams(location.search);
    const f = {};
    const seg = p.get("seg");
    const grupo = p.get("grupo");
    if (seg) f.segs = new Set(seg.split(",").map(function (s) { return s.trim().toUpperCase(); }));
    if (grupo) f.grupos = new Set(grupo.split(",").map(function (s) { return s.trim().toUpperCase(); }));
    f.titulo = p.get("titulo") || null;
    return f;
  }


  /* =======================================================================
     AGREGADOS REPOM - logica compartilhada pela aba do dashboard e pelo
     telao dedicado. Uma fonte de verdade so: se a regra muda, muda aqui.
     ======================================================================= */
  REPOM.itens.forEach(function (r) {
    r.rota = (r.carreg || "—") + " → " + (r.destino || "—");
    r.aberto = /^aberto/i.test(r.sit || "");
    r.margem = (r.receita || 0) - (r.pago || 0);
    r.mes = (r.dtEmi || "").slice(0, 7) || null;
  });

  /* Faixas de idade do contrato em aberto - cores do design system da Torre */
  const REPOM_FAIXAS = [
    { rot: "0 a 10 dias", min: 0, max: 10, cor: "#4ADE80" },
    { rot: "11 a 20 dias", min: 11, max: 20, cor: "#2DD4BF" },
    { rot: "21 a 30 dias", min: 21, max: 30, cor: "#FFC145" },
    { rot: "31 a 60 dias", min: 31, max: 60, cor: "#F0800E" },
    { rot: "mais de 60 dias", min: 61, max: 1e9, cor: "#F1553F" }
  ];

  /* dias corridos desde a emissao do contrato ate hoje */
  function repomDiasEmAberto(r, hoje) {
    const d = daysBetween(r.dtEmi, hoje || new Date());
    return d === null ? null : Math.floor(d);
  }

  function repomFaixaIdade(dias) {
    if (dias === null) return null;
    for (let i = 0; i < REPOM_FAIXAS.length; i++) {
      if (dias >= REPOM_FAIXAS[i].min && dias <= REPOM_FAIXAS[i].max) return REPOM_FAIXAS[i];
    }
    return REPOM_FAIXAS[REPOM_FAIXAS.length - 1];
  }

  /* Filtro unico da aba: multi-selecao em 5 campos + periodo por Data emissao */
  function repomFiltrar(f) {
    f = f || {};
    const de = f.de || null, ate = f.ate || null;
    return REPOM.itens.filter(function (r) {
      if (f.props && f.props.size && !f.props.has(r.prop)) return false;
      if (f.mots && f.mots.size && !f.mots.has(r.motorista)) return false;
      if (f.placas && f.placas.size && !f.placas.has(r.placa)) return false;
      if (f.sts && f.sts.size && !f.sts.has(r.st)) return false;
      if (f.unis && f.unis.size && !f.unis.has(r.unidade)) return false;
      if (f.sits && f.sits.size && !f.sits.has(r.sit)) return false;
      if (de && (!r.dtEmi || r.dtEmi < de)) return false;
      if (ate && (!r.dtEmi || r.dtEmi > ate)) return false;
      return true;
    });
  }

  /* Agrega por proprietario / motorista / placa / rota / cliente / mes. */
  function repomAgrupar(rows, campo) {
    const m = new Map();
    rows.forEach(function (r) {
      const k = r[campo] || "—";
      let g = m.get(k);
      if (!g) {
        g = { chave: k, receita: 0, pago: 0, margem: 0, cargas: 0,
              saldo: 0, abertos: 0, km: 0 };
        m.set(k, g);
      }
      g.receita += r.receita || 0;
      g.pago += r.pago || 0;
      g.margem += r.margem || 0;
      g.km += r.km || 0;
      g.cargas += 1;
      if (r.aberto) { g.saldo += r.saldo || 0; g.abertos += 1; }
    });
    const saida = Array.from(m.values());
    saida.forEach(function (g) {
      g.ticket = g.cargas ? g.pago / g.cargas : 0;
      g.pctMargem = g.receita ? (g.margem / g.receita) * 100 : 0;
      g.rkm = g.km ? g.pago / g.km : 0;
    });
    saida.sort(function (a, b) { return b.pago - a.pago; });
    return saida;
  }

  /* Calendario de pagamento: soma do saldo por data de corte prevista. */
  function repomPrevisao(rows) {
    const m = new Map();
    rows.forEach(function (r) {
      if (!r.aberto || !r.dtPrev) return;
      let g = m.get(r.dtPrev);
      if (!g) { g = { data: r.dtPrev, qtd: 0, valor: 0, itens: [] }; m.set(r.dtPrev, g); }
      g.qtd += 1; g.valor += r.saldo || 0; g.itens.push(r);
    });
    return Array.from(m.values()).sort(function (a, b) {
      return a.data < b.data ? -1 : 1;
    });
  }

  /* Saldo aberto SEM data de quitacao: nao da para prever, fica em lista propria. */
  function repomAguardando(rows) {
    const m = new Map();
    rows.forEach(function (r) {
      if (!r.aberto || r.dtPrev) return;
      const k = r.st || "Sem status";
      let g = m.get(k);
      if (!g) { g = { status: k, qtd: 0, valor: 0, itens: [] }; m.set(k, g); }
      g.qtd += 1; g.valor += r.saldo || 0; g.itens.push(r);
    });
    return Array.from(m.values()).sort(function (a, b) { return b.valor - a.valor; });
  }

  /* Distribuicao do saldo parado por idade do contrato (gargalo da quitacao). */
  function repomIdade(rows, hoje) {
    const faixas = REPOM_FAIXAS.map(function (f) {
      return { rot: f.rot, cor: f.cor, qtd: 0, valor: 0 };
    });
    rows.forEach(function (r) {
      if (!r.aberto) return;
      const dias = repomDiasEmAberto(r, hoje);
      if (dias === null) return;
      for (let i = 0; i < REPOM_FAIXAS.length; i++) {
        if (dias >= REPOM_FAIXAS[i].min && dias <= REPOM_FAIXAS[i].max) {
          faixas[i].qtd += 1; faixas[i].valor += r.saldo || 0; break;
        }
      }
    });
    return faixas;
  }

  /* Totais de um recorte - usados nos cards da aba e do telao. */
  function repomTotais(rows, hoje) {
    const t = { cargas: rows.length, receita: 0, pago: 0, margem: 0,
                saldo: 0, abertos: 0, pagos: 0, km: 0, comPrevisao: 0,
                semPrevisao: 0, maisVelho: null };
    rows.forEach(function (r) {
      t.receita += r.receita || 0;
      t.pago += r.pago || 0;
      t.margem += r.margem || 0;
      t.km += r.km || 0;
      if (r.aberto) {
        t.abertos += 1; t.saldo += r.saldo || 0;
        if (r.dtPrev) t.comPrevisao += 1; else t.semPrevisao += 1;
        const d = repomDiasEmAberto(r, hoje);
        if (d !== null && (t.maisVelho === null || d > t.maisVelho)) t.maisVelho = d;
      } else { t.pagos += 1; }
    });
    t.ticket = t.cargas ? t.pago / t.cargas : 0;
    t.pctMargem = t.receita ? (t.margem / t.receita) * 100 : 0;
    t.pctPago = t.cargas ? (t.pagos / t.cargas) * 100 : 0;
    t.repasse = t.receita ? (t.pago / t.receita) * 100 : 0;
    return t;
  }

  /* -------------------------------------------------------------------- */
  /* MOVIMENTO: o que foi emitido hoje / na semana / no mes.               */
  /* A data de referencia e a EMISSAO da carta frete (dtEmi) - e o momento */
  /* em que o adiantamento e gerado, que e o que a operacao acompanha.     */
  /* -------------------------------------------------------------------- */
  function repomMovimento(rows, hoje) {
    const ref = hoje || dayKey(new Date());
    const d = new Date(ref + "T12:00:00");
    /* semana comeca na SEGUNDA (padrao da operacao) */
    const diaSem = (d.getDay() + 6) % 7;
    const iniSemana = dayKey(new Date(d.getTime() - diaSem * 86400000));
    const iniMes = ref.slice(0, 8) + "01";

    function vazio() { return { qtd: 0, adiant: 0, pago: 0, saldo: 0, receita: 0 }; }
    const mov = { hoje: vazio(), semana: vazio(), mes: vazio(),
                  iniSemana: iniSemana, iniMes: iniMes, ref: ref };
    const porDia = new Map();

    rows.forEach(function (r) {
      const e = r.dtEmi;
      if (!e) return;
      function soma(a) {
        a.qtd += 1; a.adiant += r.adiant || 0; a.pago += r.pago || 0;
        a.saldo += r.saldo || 0; a.receita += r.receita || 0;
      }
      if (e >= iniMes && e <= ref) {
        soma(mov.mes);
        let g = porDia.get(e);
        if (!g) { g = { data: e, qtd: 0, adiant: 0 }; porDia.set(e, g); }
        g.qtd += 1; g.adiant += r.adiant || 0;
      }
      if (e >= iniSemana && e <= ref) soma(mov.semana);
      if (e === ref) soma(mov.hoje);
    });

    mov.dias = Array.from(porDia.values()).sort(function (a, b) {
      return a.data < b.data ? -1 : 1;
    });
    /* media so dos dias que TIVERAM movimento - fim de semana nao derruba */
    mov.diasComMovimento = mov.dias.length;
    mov.mediaDia = mov.diasComMovimento ? mov.mes.adiant / mov.diasComMovimento : 0;
    mov.mediaCargasDia = mov.diasComMovimento ? mov.mes.qtd / mov.diasComMovimento : 0;
    return mov;
  }

  /* -------------------------------------------------------------------- */
  /* INSIGHTS do REPOM - leituras deterministicas, cada uma acompanhada do */
  /* numero que a originou. Mesmas regras na aba e no telao. Sem chute.    */
  /* -------------------------------------------------------------------- */
  function repomInsights(rows, hoje) {
    const ref = hoje || dayKey(new Date());
    const t = repomTotais(rows, ref);
    const prev = repomPrevisao(rows);
    const mov = repomMovimento(rows, ref);
    const faixas = repomIdade(rows, ref);
    const out = [];
    function add(sev, titulo, texto, valor) {
      out.push({ sev: sev, titulo: titulo, texto: texto, valor: valor || "" });
    }

    /* 1. cortes ja vencidos - dinheiro que deveria ter saido */
    const venc = prev.filter(function (p) { return p.data < ref; });
    const vq = venc.reduce(function (a, p) { return a + p.qtd; }, 0);
    const vv = venc.reduce(function (a, p) { return a + p.valor; }, 0);
    if (vq) {
      add("critico", "Saldo com corte vencido",
        vq + " contrato" + (vq === 1 ? "" : "s") + " com data de pagamento já " +
        "passada. O mais antigo venceu em " + fmtData(venc[0].data) + ".",
        fmtBRL(vv));
    } else {
      add("positivo", "Nenhum corte vencido",
        "Todo saldo com previsão está dentro do prazo.", "OK");
    }

    /* 2. proximo corte - quanto precisa estar em caixa */
    const futuro = prev.filter(function (p) { return p.data >= ref; });
    if (futuro.length) {
      const p = futuro[0];
      add("atencao", "Próximo corte: " + fmtData(p.data),
        p.qtd + " contratos a pagar nesse corte. Somando os vencidos, o caixa " +
        "precisa cobrir " + fmtBRL(p.valor + vv) + ".", fmtBRL(p.valor));
    }

    /* 3. saldo sem previsao - o contrato nem foi quitado ainda */
    if (t.semPrevisao) {
      const ag = repomAguardando(rows);
      const vAg = ag.reduce(function (a, g) { return a + g.valor; }, 0);
      add(t.semPrevisao > t.comPrevisao ? "critico" : "atencao",
        "Saldo travado antes da quitação",
        t.semPrevisao + " contratos com saldo aberto ainda sem data de quitação. " +
        "Sem quitar, não entram em nenhum corte. Principal: " +
        (ag[0] ? ag[0].status + " (" + ag[0].qtd + ")" : "—") + ".",
        fmtBRL(vAg));
    }

    /* 4. envelhecimento: saldo parado ha mais de 60 dias */
    const velho = faixas[faixas.length - 1];
    if (velho && velho.qtd) {
      const pct = t.saldo ? (velho.valor / t.saldo) * 100 : 0;
      add(pct >= 20 ? "critico" : "atencao", "Saldo parado há mais de 60 dias",
        velho.qtd + " contratos representam " + fmtPct(pct, 1) +
        " de todo o saldo em aberto.", fmtBRL(velho.valor));
    }

    /* 5. ritmo de emissao - hoje contra a media do mes */
    if (mov.diasComMovimento >= 3) {
      const dif = mov.mediaDia
        ? ((mov.hoje.adiant - mov.mediaDia) / mov.mediaDia) * 100 : 0;
      const caiu = dif < -25, subiu = dif > 25;
      add(caiu ? "atencao" : (subiu ? "info" : "positivo"),
        "Adiantamento de hoje x média do mês",
        "Hoje saíram " + fmtNum(mov.hoje.qtd) + " cartas frete. A média do mês é " +
        fmtNum(Math.round(mov.mediaCargasDia)) + " por dia com movimento (" +
        fmtBRL(mov.mediaDia) + " de adiantamento) — " +
        (caiu ? "hoje está abaixo" : (subiu ? "hoje está acima" : "em linha")) +
        " (" + (dif >= 0 ? "+" : "") + fmtPct(dif, 0) + ").",
        fmtBRL(mov.hoje.adiant));
    }

    /* 6. concentracao do saldo num unico proprietario */
    const porProp = repomAgrupar(rows.filter(function (r) { return r.aberto; }), "prop");
    if (porProp.length && t.saldo) {
      const p = porProp[0];
      const pct = (p.valor / t.saldo) * 100;
      if (pct >= 15) {
        add(pct >= 40 ? "critico" : "atencao", "Saldo concentrado num proprietário",
          shortName(p.chave, 38) + " responde por " + fmtPct(pct, 1) +
          " do saldo em aberto, em " + p.qtd + " contratos.", fmtBRL(p.valor));
      }
    }

    /* 7. margem do repasse */
    if (t.receita) {
      add(t.pctMargem < 30 ? "atencao" : "positivo", "Margem sobre o repasse",
        "A Torre faturou " + fmtBRL(t.receita) + " nessas cargas e repassou " +
        fmtPct(t.repasse, 1) + " ao agregado.", fmtPct(t.pctMargem, 1));
    }

    /* 8. movimento do mes - leitura de acompanhamento */
    add("info", "Movimento do mês",
      fmtNum(mov.mes.qtd) + " cartas frete emitidas em " + mov.diasComMovimento +
      " dias com movimento, " + fmtBRL(mov.mes.pago) + " pagos ao agregado.",
      fmtBRL(mov.mes.adiant));

    const ordem = { critico: 0, atencao: 1, info: 2, positivo: 3 };
    return out.sort(function (a, b) { return ordem[a.sev] - ordem[b.sev]; });
  }

  /* -------------------------------------------------------------------- */
  /* PAINEL DE MONITORAMENTO                                              */
  /* Foto AO VIVO da frota. Toda a regra ja veio resolvida do pipeline     */
  /* (generate_data.py, secao 5-B) - aqui e so leitura e formatacao, para  */
  /* a aba e o telao NUNCA divergirem um do outro.                         */
  /* -------------------------------------------------------------------- */
  const MONITOR_STATUS = [
    { id: "vazio",     rot: "Vazio",     ic: "\u26AA", cor: "#F1553F" },
    { id: "destinado", rot: "Destinado", ic: "\u{1F4CD}", cor: "#B18CFF" },
    { id: "carga",     rot: "Em carga",  ic: "\u{1F4E6}", cor: "#FFC145" },
    { id: "viagem",    rot: "Em viagem", ic: "\u{1F69B}", cor: "#4FA3E3" },
    { id: "descarga",  rot: "Em descarga", ic: "\u{1F3ED}", cor: "#2DD4BF" }
  ];

  /* "Pranchas e Rodando" e uma operacao so no telao, como na Torre. */
  const MONITOR_OPERACOES = {
    bens:     { rot: "Bens de Consumo",     segs: ["BENS DE CONSUMO"] },
    latas:    { rot: "Latas",               segs: ["LATAS"] },
    pranchas: { rot: "Pranchas & Rodando",  segs: ["PRANCHA", "AUTOPROPULSOR"] }
  };

  function monitorTem() {
    return !!(MONITOR && MONITOR.contador &&
              Object.keys(MONITOR.contador).length);
  }

  /* Soma o contador de varios segmentos (uma operacao do telao). */
  function monitorContador(segs) {
    const t = { total: 0, finalizadas: 0 };
    MONITOR_STATUS.forEach(function (s) { t[s.id] = 0; });
    if (!monitorTem()) return t;
    (segs && segs.length ? segs : Object.keys(MONITOR.contador))
      .forEach(function (seg) {
        const c = MONITOR.contador[seg];
        if (!c) return;
        MONITOR_STATUS.forEach(function (s) { t[s.id] += c[s.id] || 0; });
        t.total += c.total || 0;
        t.finalizadas += c.finalizadas || 0;
      });
    return t;
  }

  /* Uma lista de acao (vazios, retidos, pernoite...) filtrada por segmento. */
  function monitorLista(nome, segs) {
    if (!MONITOR || !MONITOR[nome]) return [];
    const lista = MONITOR[nome];
    if (!segs || !segs.length) return lista.slice();
    const set = new Set(segs);
    return lista.filter(function (r) { return set.has(r.seg); });
  }

  function monitorMapa(segs) {
    if (!MONITOR || !MONITOR.mapa) return [];
    if (!segs || !segs.length) return MONITOR.mapa.slice();
    const set = new Set(segs);
    return MONITOR.mapa.map(function (g) {
      let qtd = 0;
      Object.keys(g.porSeg || {}).forEach(function (s) {
        if (set.has(s)) qtd += g.porSeg[s];
      });
      return qtd ? Object.assign({}, g, { qtd: qtd }) : null;
    }).filter(Boolean).sort(function (a, b) { return b.qtd - a.qtd; });
  }

  /* O que o MAPA usa: uma entrada por regiao (estado do Brasil ou ponto no
     exterior). Nao depende da tabela de coordenadas para o Brasil - a UF vem
     preenchida sempre -, e por isso conta TODOS os ativos, nao so os que a
     tabela de cidades conhecia. */
  function monitorMapaUF(segs) {
    const base = (MONITOR && MONITOR.mapaUF) || [];
    if (!segs || !segs.length) return base.slice();
    const set = new Set(segs);
    return base.map(function (g) {
      let qtd = 0;
      Object.keys(g.porSeg || {}).forEach(function (s) {
        if (set.has(s)) qtd += g.porSeg[s];
      });
      return qtd ? Object.assign({}, g, { qtd: qtd }) : null;
    }).filter(Boolean).sort(function (a, b) { return b.qtd - a.qtd; });
  }

  /* 5.28 -> "5h17". Valor nulo vira travessao, nunca "0h00". */
  function fmtHM(h) {
    if (h === null || h === undefined || isNaN(h)) return "\u2014";
    const t = Math.max(0, Number(h));
    const hh = Math.floor(t);
    const mm = Math.round((t - hh) * 60);
    return hh + "h" + String(mm === 60 ? 0 : mm).padStart(2, "0");
  }

  /* Cor pelo quanto o tempo passou do limite - mesma escala do resto. */
  function monitorCorTempo(h, limite) {
    if (h === null || h === undefined) return "#6E6A62";
    if (h >= limite * 2) return "#F1553F";
    if (h >= limite * 1.4) return "#FFC145";
    return "#4FA3E3";
  }

  /* Limites vem do pipeline - a aba, o telao e o Excel usam o MESMO numero. */
  function LIM() {
    return (MONITOR && MONITOR.limites) ||
           { retido: 5, pernoite: 11, semPosicao: 12 };
  }

  function monitorInsights(segs) {
    const out = [];
    function add(sev, titulo, texto, valor) {
      out.push({ sev: sev, titulo: titulo, texto: texto, valor: valor });
    }
    const g = monitorContador(segs);
    const vaz = monitorLista("vazios", segs);
    const ret = monitorLista("retidos", segs);
    const per = monitorLista("pernoite", segs);
    const doc = monitorLista("semDocumento", segs);
    const pos = monitorLista("semPosicao", segs);
    const mot = monitorLista("semMotorista", segs);

    if (doc.length) {
      add("critico", "Documento pendente em viagem",
        doc.length + " carga" + (doc.length === 1 ? "" : "s") + " rodando sem " +
        "CT-e ou MDF-e emitido. Internacional e Ponta Grossa já saíram da conta — " +
        "estes são pendências reais.", doc.length);
    } else {
      add("positivo", "Documentação em dia",
        "Nenhuma carga em viagem sem CT-e ou MDF-e.", "OK");
    }
    if (ret.length) {
      const pior = ret[0];
      add(ret.length >= 5 ? "critico" : "atencao", "Retidos em carga/descarga",
        ret.length + " veículos acima de " + LIM().retido + "h. O mais antigo é o " +
        pior.placa + ", em " + pior.cidade + "/" + pior.uf + " há " +
        fmtHM(pior.hEvento) + ".", ret.length);
    }
    if (vaz.length) {
      const pct = g.total ? (vaz.length / g.total) * 100 : 0;
      add(pct >= 15 ? "atencao" : "info", "Frota vazia esperando destino",
        vaz.length + " de " + g.total + " veículos ativos (" + fmtPct(pct, 1) +
        ") estão sem carga.", vaz.length);
    }
    if (per.length) {
      add("atencao", "Parados em viagem",
        per.length + " veículo" + (per.length === 1 ? "" : "s") + " parado" +
        (per.length === 1 ? "" : "s") + " há mais de " + LIM().pernoite +
        "h em rota. Confirmar se é pernoite programado.", per.length);
    }
    if (pos.length) {
      const sem = pos.filter(function (r) { return r.semRastreio; }).length;
      add(sem ? "critico" : "atencao", "Rastreio",
        pos.length + " veículos sem posicionar há mais de " + LIM().semPosicao + "h" +
        (sem ? ", sendo " + sem + " sem rastreio nenhum" : "") + ".", pos.length);
    }
    if (mot.length) {
      add("atencao", "Veículo parado por falta de motorista",
        mot.length + " veículo" + (mot.length === 1 ? "" : "s") +
        " sem motorista designado. Depende de contratação.", mot.length);
    }
    add("info", "Frota ativa agora",
      g.total + " veículos operando: " + g.viagem + " em viagem, " +
      g.destinado + " destinados, " + (g.carga + g.descarga) +
      " em pátio de cliente e " + g.vazio + " vazios.", g.total);

    const ordem = { critico: 0, atencao: 1, info: 2, positivo: 3 };
    return out.sort(function (a, b) { return ordem[a.sev] - ordem[b.sev]; });
  }

  /* Valores distintos para montar os multi-select, ja ordenados. */
  function repomOpcoes(campo) {
    const s = new Set();
    REPOM.itens.forEach(function (r) { if (r[campo]) s.add(r[campo]); });
    return Array.from(s).sort(function (a, b) {
      return String(a).localeCompare(String(b), "pt-BR");
    });
  }

  return {
    DATA: DATA, VIAGENS: VIAGENS, DOCS: DOCS, OMS: OMS, ENTREGAS: ENTREGAS,
    ATRASOS: ATRASOS, REPOM: REPOM, MONITOR: MONITOR, META: META,
    REPOM_FAIXAS: REPOM_FAIXAS,
    repomFiltrar: repomFiltrar, repomAgrupar: repomAgrupar,
    repomPrevisao: repomPrevisao, repomAguardando: repomAguardando,
    repomIdade: repomIdade, repomTotais: repomTotais,
    repomOpcoes: repomOpcoes, repomDiasEmAberto: repomDiasEmAberto,
    repomFaixaIdade: repomFaixaIdade,
    repomMovimento: repomMovimento, repomInsights: repomInsights,
    MONITOR_STATUS: MONITOR_STATUS, MONITOR_OPERACOES: MONITOR_OPERACOES,
    monitorTem: monitorTem, monitorContador: monitorContador,
    monitorLista: monitorLista, monitorMapa: monitorMapa,
    monitorMapaUF: monitorMapaUF,
    fmtHM: fmtHM, monitorCorTempo: monitorCorTempo,
    monitorInsights: monitorInsights,
    PALETTE: PALETTE, MESES_PT_FULL: MESES_PT_FULL, MESES_PT_CURTO: MESES_PT_CURTO,
    DIAS_PT_FULL: DIAS_PT_FULL, GRUPO_SEG: GRUPO_SEG,
    fmtBRL: fmtBRL, fmtBRLcents: fmtBRLcents, fmtNum: fmtNum, fmtKm: fmtKm,
    fmtPct: fmtPct, fmtCompacto: fmtCompacto, fmtHoras: fmtHoras,
    fmtData: fmtData, fmtDataHora: fmtDataHora,
    parseD: parseD, daysBetween: daysBetween, hoursBetween: hoursBetween,
    dayKey: dayKey, monthKey: monthKey, monthLabel: monthLabel,
    monthLabelFull: monthLabelFull, daysInMonth: daysInMonth, nowKey: nowKey,
    prevMonthKey: prevMonthKey, availableMonths: availableMonths,
    applyEntityFilters: applyEntityFilters, applyPeriodFilter: applyPeriodFilter,
    filterAll: filterAll, operational: operational,
    sumBy: sumBy, countBy: countBy, topN: topN,
    totalFaturamento: totalFaturamento, totalFretePeso: totalFretePeso,
    totalKm: totalKm, totalKmCarregado: totalKmCarregado, totalKmVazio: totalKmVazio,
    contarViagens: contarViagens, statusCounts: statusCounts,
    distinctClientes: distinctClientes, distinctMotoristas: distinctMotoristas,
    distinctPlacas: distinctPlacas, distinctRotas: distinctRotas,
    distinctSegmentos: distinctSegmentos,
    dailySeries: dailySeries, projectMonth: projectMonth,
    getGoal: getGoal, setGoal: setGoal, suggestGoal: suggestGoal,
    SEGMENTOS_META: SEGMENTOS_META, ROTULO_SEG_META: ROTULO_SEG_META,
    getGoalSeg: getGoalSeg, setGoalSeg: setGoalSeg,
    suggestGoalSeg: suggestGoalSeg, goalSegDefinida: goalSegDefinida,
    escapeHtml: escapeHtml, shortName: shortName, clienteShort: clienteShort,
    corPct: corPct, corVazio: corVazio, corSeveridade: corSeveridade,
    rotuloSeveridade: rotuloSeveridade,
    setupChart: setupChart, eixoCategoriasY: eixoCategoriasY,
    pluginValores: pluginValores, textoValor: textoValor,
    contadorCargas: contadorCargas, gerarInsights: gerarInsights,
    filtroDaUrl: filtroDaUrl
  };
})();
