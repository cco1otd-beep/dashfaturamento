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
  const META = (window.OTD_META || {});

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
  function getGoal(mes) {
    if (META.metaFixaTemporaria && META.metaFixaTemporaria[mes]) {
      return Number(META.metaFixaTemporaria[mes]);
    }
    try {
      const v = localStorage.getItem("otd_meta_" + mes);
      if (v !== null && v !== "") return Number(v);
    } catch (e) { /* modo kiosk sem storage */ }
    return suggestGoal(mes);
  }
  function setGoal(mes, valor) {
    try { localStorage.setItem("otd_meta_" + mes, String(valor)); } catch (e) { }
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

  return {
    DATA: DATA, VIAGENS: VIAGENS, DOCS: DOCS, OMS: OMS, ENTREGAS: ENTREGAS, META: META,
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
    escapeHtml: escapeHtml, shortName: shortName, clienteShort: clienteShort,
    corPct: corPct, corVazio: corVazio, corSeveridade: corSeveridade,
    rotuloSeveridade: rotuloSeveridade,
    setupChart: setupChart, eixoCategoriasY: eixoCategoriasY,
    pluginValores: pluginValores, textoValor: textoValor,
    contadorCargas: contadorCargas, gerarInsights: gerarInsights,
    filtroDaUrl: filtroDaUrl
  };
})();
