/* =========================================================
   TORRE DE CONTROLE LOGISTICA — OTD LOGISTICS
   common.js — utilidades compartilhadas (index.html + tv.html)
   Depende de data.js ter sido carregado antes (window.OTD_DATA / OTD_META)
   ========================================================= */

const OTD = (function () {
  const DATA = window.OTD_DATA || [];
  const META = window.OTD_META || {};

  const PALETTE = ["#F0800E", "#2DD4BF", "#4FA3E3", "#FFC145", "#B18CFF", "#4ADE80", "#F1553F", "#FF7AB6", "#C4650A", "#9AA5B1"];

  const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_PT_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const DIAS_PT_FULL = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];

  function fmtBRL(v) {
    v = v || 0;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  function fmtBRLcents(v) {
    v = v || 0;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  }
  function fmtNum(v, dec) {
    dec = dec || 0;
    return (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtKm(v) {
    return fmtNum(v, 0) + " km";
  }
  function fmtPct(v, dec) {
    dec = dec == null ? 1 : dec;
    return fmtNum(v, dec) + "%";
  }

  function parseD(s) {
    return s ? new Date(s) : null;
  }
  function daysBetween(a, b) {
    return Math.floor((b - a) / 86400000);
  }
  function hoursBetween(a, b) {
    return (b - a) / 3600000;
  }

  function monthKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return MESES_PT[m - 1] + "/" + String(y).slice(2);
  }
  function monthLabelFull(key) {
    const [y, m] = key.split("-").map(Number);
    return MESES_PT_FULL[m - 1] + " de " + y;
  }
  function daysInMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  // lista de meses presentes na base (ordenado)
  function availableMonths() {
    const set = new Set();
    DATA.forEach((r) => r.mesRef && set.add(r.mesRef));
    return Array.from(set).sort();
  }

  function nowKey() {
    return monthKey(new Date());
  }

  // -------- filtragem --------
  // filters: { months: Set|null, dateFrom, dateTo, clientes:Set, motoristas:Set, placas:Set, rotas:Set }
  function applyEntityFilters(rows, f) {
    return rows.filter((r) => {
      if (f.clientes && f.clientes.size && !f.clientes.has(r.cliente || "—")) return false;
      if (f.motoristas && f.motoristas.size && !f.motoristas.has(r.motorista || "—")) return false;
      if (f.placas && f.placas.size && !f.placas.has(r.placa || "—")) return false;
      if (f.rotas && f.rotas.size && !f.rotas.has(r.rota || "—")) return false;
      return true;
    });
  }

  function applyPeriodFilter(rows, f) {
    return rows.filter((r) => {
      if (f.dateFrom || f.dateTo) {
        const ref = r.dtCargaI || r.dtSol;
        if (!ref) return false;
        const d = new Date(ref);
        if (f.dateFrom && d < new Date(f.dateFrom + "T00:00:00")) return false;
        if (f.dateTo && d > new Date(f.dateTo + "T23:59:59")) return false;
        return true;
      }
      if (f.months && f.months.size) {
        return r.mesRef && f.months.has(r.mesRef);
      }
      return true;
    });
  }

  function filterAll(f) {
    return applyPeriodFilter(applyEntityFilters(DATA, f), f);
  }

  // -------- agregacoes --------
  function sumBy(rows, keyFn, valFn) {
    const map = new Map();
    rows.forEach((r) => {
      const k = keyFn(r) || "—";
      valFn = valFn || ((x) => x.frete || 0);
      map.set(k, (map.get(k) || 0) + valFn(r));
    });
    return map;
  }
  function countBy(rows, keyFn) {
    const map = new Map();
    rows.forEach((r) => {
      const k = keyFn(r) || "—";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }
  function topN(map, n, desc = true) {
    const arr = Array.from(map.entries());
    arr.sort((a, b) => (desc ? b[1] - a[1] : a[1] - b[1]));
    return arr.slice(0, n);
  }

  function totalFaturamento(rows) {
    return rows.reduce((s, r) => s + (r.frete || 0), 0);
  }
  function totalFretePeso(rows) {
    return rows.reduce((s, r) => s + (r.fretePeso || 0), 0);
  }
  function totalKm(rows) {
    return rows.reduce((s, r) => s + (r.kmVazio || 0) + (r.kmCarreg || 0), 0);
  }

  function statusCounts(rows) {
    const c = { concluido: 0, em_transito: 0, nao_iniciado: 0 };
    rows.forEach((r) => c[r.status] != null && c[r.status]++);
    return c;
  }

  // viagens "em tempo real" — nao dependem do filtro de periodo
  function operational(f) {
    const base = applyEntityFilters(DATA, f || {});
    return {
      emTransito: base.filter((r) => r.status === "em_transito"),
      naoIniciado: base.filter((r) => r.status === "nao_iniciado"),
    };
  }

  function distinctPlacas(rows) {
    return new Set(rows.map((r) => r.placa).filter(Boolean));
  }
  function distinctMotoristas(rows) {
    return new Set(rows.map((r) => r.motorista).filter(Boolean));
  }
  function distinctClientes(rows) {
    return new Set(rows.map((r) => r.cliente).filter(Boolean));
  }
  function distinctRotas(rows) {
    return new Set(rows.map((r) => r.rota).filter(Boolean));
  }

  // projecao linear simples: (faturamento acumulado / dias decorridos) * dias no mes
  function projectMonth(rows, monthKeyStr) {
    const totalDays = daysInMonth(monthKeyStr);
    const today = new Date();
    const isCurrent = monthKeyStr === nowKey();
    const elapsed = isCurrent ? today.getDate() : totalDays;
    const total = totalFaturamento(rows);
    const dailyAvg = elapsed > 0 ? total / elapsed : 0;
    const projected = dailyAvg * totalDays;
    return { total, dailyAvg, projected, elapsed, totalDays, isCurrent };
  }

  function dailySeries(rows, monthKeyStr) {
    const totalDays = daysInMonth(monthKeyStr);
    const arr = new Array(totalDays).fill(0);
    rows.forEach((r) => {
      const ref = r.dtCargaI || r.dtSol;
      if (!ref) return;
      const d = new Date(ref);
      if (monthKey(d) !== monthKeyStr) return;
      arr[d.getDate() - 1] += r.frete || 0;
    });
    return arr;
  }

  function goalStorageKey(monthKeyStr) {
    return "otd_meta_" + monthKeyStr;
  }
  function getGoal(monthKeyStr, fallback) {
    const v = localStorage.getItem(goalStorageKey(monthKeyStr));
    return v ? parseFloat(v) : fallback;
  }
  function setGoal(monthKeyStr, value) {
    localStorage.setItem(goalStorageKey(monthKeyStr), String(value));
  }

  // meta fixa temporaria (solicitado pelo usuario em 18/08/2026) — ajustar quando definirem meta oficial
  const META_FIXA_TEMPORARIA = 3000000;

  // sugestao de meta: media dos ultimos meses fechados * 1.05, ou total do mes anterior
  function suggestGoal(monthKeyStr) {
    if (META_FIXA_TEMPORARIA) return META_FIXA_TEMPORARIA;
    const months = availableMonths().filter((m) => m < monthKeyStr);
    if (!months.length) return totalFaturamento(DATA.filter((r) => r.mesRef === monthKeyStr)) || 50000;
    const last = months[months.length - 1];
    const lastTotal = totalFaturamento(DATA.filter((r) => r.mesRef === last));
    return Math.round((lastTotal * 1.05) / 1000) * 1000 || 50000;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function shortName(s, max) {
    if (!s) return "—";
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function clienteShort(s) {
    if (!s) return "—";
    // remove sufixo " - Cidade - UF" pra caber melhor nos graficos
    return s.split(" - ")[0].trim();
  }

  return {
    DATA, META, PALETTE, MESES_PT, MESES_PT_FULL, DIAS_PT_FULL,
    fmtBRL, fmtBRLcents, fmtNum, fmtKm, fmtPct,
    parseD, daysBetween, hoursBetween,
    monthKey, monthLabel, monthLabelFull, daysInMonth, availableMonths, nowKey,
    applyEntityFilters, applyPeriodFilter, filterAll,
    sumBy, countBy, topN, totalFaturamento, totalFretePeso, totalKm, statusCounts,
    operational, distinctPlacas, distinctMotoristas, distinctClientes, distinctRotas,
    projectMonth, dailySeries, getGoal, setGoal, suggestGoal,
    escapeHtml, shortName, clienteShort,
  };
})();
