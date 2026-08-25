/* ===========================================================================
   PAINEL DE MONITORAMENTO - OTD LOGISTICS
   tv_monitor.js - modo TV / kiosk DEDICADO ao monitoramento (tv_monitor.html)

   Isolado da Torre e do telao REPOM: nao compartilha estado com tv.js nem com
   tv_repom.js. Uma TV apontada aqui mostra SO a foto ao vivo da frota.

   Formato pedido pelo gestor: a tela e dividida em DUAS COLUNAS, e o par de
   operacoes ALTERNA a cada 5 segundos - primeiro Bens | Latas, depois
   Pranchas & Rodando. Quem faz a alternancia e o mesmo mecanismo de paginacao
   dos outros teloes (registraBloco), para o ritmo ficar igual no predio todo.

   Toda a regra vem do pipeline (generate_data.py, secao 5-B) e e lida pelo
   common.js (OTD.monitor*). Se um numero aqui diverge da aba do dashboard, o
   bug e de layout, nunca de criterio.

   Parametros de URL:
     ?tela=contador|mapa|vazios|retidos|viagem|rastreio|insights
                                   fixa UMA tela (TV dedicada a um assunto)
     ?slide=20                     segundos por tela (padrao 20)
     ?pagina=5                     segundos por alternancia de operacao
     ?reload=10                    minutos ate recarregar sozinho
   =========================================================================== */
(function () {
  "use strict";

  const E = OTD.escapeHtml;
  const P = new URLSearchParams(location.search);

  const SLIDE_SECONDS = Number(P.get("slide")) || 20;
  const PAGE_SECONDS = Number(P.get("pagina")) || 5;
  const RELOAD_MINUTES = Number(P.get("reload")) || 10;

  const M = OTD.MONITOR;
  const LIM = (M && M.limites) || { retido: 5, pernoite: 11, semPosicao: 12 };

  /* Os pares de coluna que alternam a cada 5s. Duas paginas: o gestor pediu
     Bens | Latas juntos, e Pranchas & Rodando alternando com eles. */
  const PAGINAS = [
    [OTD.MONITOR_OPERACOES.bens, OTD.MONITOR_OPERACOES.latas],
    [OTD.MONITOR_OPERACOES.pranchas]
  ];

  /* ======================================================================= */
  /* PAGINACAO (alterna as operacoes a cada PAGE_SECONDS)                    */
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
  /* HELPERS DE MONTAGEM                                                     */
  /* ======================================================================= */
  function colunasHtml(id) {
    return '<div class="tv-mon-colunas" id="' + id + '"></div>';
  }

  /* Registra o bloco que troca as operacoes e delega o conteudo de cada
     coluna para monta(op) - assim toda tela ganha a alternancia de graca. */
  function paginarOperacoes(id, monta) {
    registraBloco(PAGINAS.length, function (p) {
      const el = document.getElementById(id);
      if (!el) return;
      const ops = PAGINAS[p % PAGINAS.length];
      el.className = "tv-mon-colunas" + (ops.length === 1 ? " uma" : "");
      el.innerHTML = ops.map(function (op) {
        return '<div class="tv-mon-col">' +
          '<div class="tv-mon-cab"><span class="nm">' + E(op.rot) + "</span>" +
          '<span class="qt">' + OTD.fmtNum(OTD.monitorContador(op.segs).total) +
          " veículos</span></div>" + monta(op) + "</div>";
      }).join("");
    });
  }

  function vazioHtml(msg) {
    return '<div class="tv-mon-vazio">✅ ' + E(msg) + "</div>";
  }

  /* linha de acao: tempo grande a esquerda, placa e local no meio */
  function linha(r, tempoH, limite, rotulo, detalhe) {
    const cor = OTD.monitorCorTempo(tempoH, limite);
    return '<div class="tv-mon-linha">' +
      '<div class="tempo num" style="color:' + cor + '">' + OTD.fmtHM(tempoH) + "</div>" +
      '<div class="meio"><div class="pl">' + E(r.placa || "—") + "</div>" +
      '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) +
      (rotulo ? ' · <span class="rt">' + E(rotulo) + "</span>" : "") + "</div>" +
      (detalhe ? '<div class="dt">' + detalhe + "</div>" : "") +
      "</div></div>";
  }

  /* ======================================================================= */
  /* TELAS                                                                   */
  /* ======================================================================= */
  const telas = [];

  /* --- 1. Contador de veiculos (agora com VAZIO) ------------------------- */
  telas.push({
    id: "contador",
    titulo: "Situação da Frota Agora",
    html: function () { return colunasHtml("monContador"); },
    after: function () {
      paginarOperacoes("monContador", function (op) {
        const c = OTD.monitorContador(op.segs);
        return '<div class="tv-mon-grid">' +
          OTD.MONITOR_STATUS.map(function (s) {
            return '<div class="tv-mon-card" style="border-color:' + s.cor + '33">' +
              '<div class="ic">' + s.ic + "</div>" +
              '<div class="n num" style="color:' + s.cor + '">' +
              OTD.fmtNum(c[s.id]) + "</div>" +
              '<div class="t">' + E(s.rot) + "</div></div>";
          }).join("") +
          '<div class="tv-mon-card" style="border-color:#4ADE8033">' +
          '<div class="ic">🏁</div><div class="n num" style="color:#4ADE80">' +
          OTD.fmtNum(c.finalizadas) + "</div>" +
          '<div class="t">Finalizadas no dia</div></div>' +
          "</div>";
      });
    }
  });

  /* --- 2. Mapa da frota -------------------------------------------------- */
  telas.push({
    id: "mapa",
    titulo: "Onde Está a Frota",
    html: function () {
      return '<div class="tv-mon-mapa-wrap">' +
        '<div class="tv-mon-mapa" id="monMapa"></div>' +
        '<div class="tv-mon-mapa-lado" id="monMapaLado"></div></div>';
    },
    after: function () {
      registraBloco(PAGINAS.length, function (p) {
        const ops = PAGINAS[p % PAGINAS.length];
        const segs = ops.reduce(function (a, o) { return a.concat(o.segs); }, []);
        const pts = OTD.monitorMapa(segs);
        const el = document.getElementById("monMapa");
        if (el) {
          el.innerHTML = window.OTD_MAPA
            ? OTD_MAPA.desenhar(pts, { largura: 900, altura: 1020, escape: E })
            : vazioHtml("mapa indisponível");
        }
        const lado = document.getElementById("monMapaLado");
        if (!lado) return;
        const rot = ops.map(function (o) { return o.rot; }).join(" + ");
        const semLoc = (M && M.semCoordenada) || [];
        const totalSem = semLoc.reduce(function (a, g) { return a + g.qtd; }, 0);
        lado.innerHTML =
          '<div class="tv-mon-cab"><span class="nm">' + E(rot) + "</span>" +
          '<span class="qt">' + OTD.fmtNum(pts.reduce(function (a, g) {
            return a + g.qtd; }, 0)) + " posicionados</span></div>" +
          '<div class="tv-mon-cidades">' +
          (pts.length ? pts.slice(0, 9).map(function (g) {
            return '<div class="tv-mon-cidade"><span class="q num">' + g.qtd +
              '</span><span class="c">' + E(g.cidade) + "/" + E(g.uf) + "</span></div>";
          }).join("") : vazioHtml("nenhum veículo posicionado")) +
          "</div>" +
          (totalSem ? '<div class="tv-mon-nota">⚠️ ' + OTD.fmtNum(totalSem) +
            " sem localização precisa — o ponto de referência não traz a cidade</div>" : "");
      });
    }
  });

  /* --- 3. Vazios: precisam de destino ------------------------------------ */
  telas.push({
    id: "vazios",
    titulo: "Vazios — Precisam de Destino",
    html: function () { return colunasHtml("monVazios"); },
    after: function () {
      paginarOperacoes("monVazios", function (op) {
        const lista = OTD.monitorLista("vazios", op.segs);
        if (!lista.length) return vazioHtml("Nenhum veículo vazio.");
        return '<div class="tv-mon-lista">' + lista.slice(0, 7).map(function (r) {
          return linha(r, r.hParado, 12, "parado",
            '<span class="ev">evento ' + OTD.fmtHM(r.hEvento) + "</span>");
        }).join("") +
          (lista.length > 7 ? '<div class="tv-mon-mais">+' +
            (lista.length - 7) + " outros</div>" : "") + "</div>";
      });
    }
  });

  /* --- 4. Retidos em carga/descarga acima do limite ---------------------- */
  telas.push({
    id: "retidos",
    titulo: "Retidos em Carga e Descarga — Acionar Cliente",
    html: function () { return colunasHtml("monRetidos"); },
    after: function () {
      paginarOperacoes("monRetidos", function (op) {
        const lista = OTD.monitorLista("retidos", op.segs);
        if (!lista.length) {
          return vazioHtml("Nada retido acima de " + LIM.retido + "h.");
        }
        return '<div class="tv-mon-lista">' + lista.slice(0, 6).map(function (r) {
          const quem = r.status === "Carga" ? r.remetente : r.destinatario;
          return linha(r, r.hEvento, LIM.retido, r.status,
            '<span class="ev">acionar: <b>' +
            E(OTD.shortName(quem || "—", 30)) + "</b></span>");
        }).join("") +
          (lista.length > 6 ? '<div class="tv-mon-mais">+' +
            (lista.length - 6) + " outros</div>" : "") + "</div>";
      });
    }
  });

  /* --- 5. Em viagem: pernoite + documento pendente ----------------------- */
  telas.push({
    id: "viagem",
    titulo: "Em Viagem — Pernoite e Documento Pendente",
    html: function () { return colunasHtml("monViagem"); },
    after: function () {
      paginarOperacoes("monViagem", function (op) {
        const pern = OTD.monitorLista("pernoite", op.segs);
        const doc = OTD.monitorLista("semDocumento", op.segs);
        let h = '<div class="tv-mon-sub">🌙 Parados há mais de ' +
          LIM.pernoite + "h <span>" + pern.length + "</span></div>";
        h += pern.length
          ? '<div class="tv-mon-lista">' + pern.slice(0, 4).map(function (r) {
              return linha(r, r.hParado, LIM.pernoite, "em viagem", "");
            }).join("") + "</div>"
          : vazioHtml("Ninguém parado além do pernoite.");
        h += '<div class="tv-mon-sub">📄 Sem CT-e ou MDF-e <span>' +
          doc.length + "</span></div>";
        h += doc.length
          ? '<div class="tv-mon-lista">' + doc.slice(0, 4).map(function (r) {
              const falta = [r.faltaCte ? "CT-e" : null,
                             r.faltaMdfe ? "MDF-e" : null].filter(Boolean).join(" e ");
              return linha(r, r.hParado, LIM.pernoite, "falta " + falta,
                '<span class="ev">' + E(OTD.shortName(r.destino || "—", 30)) + "</span>");
            }).join("") + "</div>"
          : vazioHtml("Documentação em dia.");
        return h;
      });
    }
  });

  /* --- 6. Rastreio e motorista ------------------------------------------- */
  telas.push({
    id: "rastreio",
    titulo: "Rastreio e Motorista",
    html: function () { return colunasHtml("monRastreio"); },
    after: function () {
      paginarOperacoes("monRastreio", function (op) {
        const sp = OTD.monitorLista("semPosicao", op.segs);
        const sm = OTD.monitorLista("semMotorista", op.segs);
        let h = '<div class="tv-mon-sub">📡 Sem posicionar há mais de ' +
          LIM.semPosicao + "h <span>" + sp.length + "</span></div>";
        h += sp.length
          ? '<div class="tv-mon-lista">' + sp.slice(0, 4).map(function (r) {
              return r.semRastreio
                ? '<div class="tv-mon-linha"><div class="tempo num" ' +
                  'style="color:#F1553F;font-size:23px">sem<br>rastreio</div>' +
                  '<div class="meio"><div class="pl">' + E(r.placa) + "</div>" +
                  '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) + "</div></div></div>"
                : linha(r, r.horas, LIM.semPosicao, "última posição", "");
            }).join("") + "</div>"
          : vazioHtml("Toda a frota posicionando.");
        h += '<div class="tv-mon-sub">👤 Veículo sem motorista <span>' +
          sm.length + "</span></div>";
        h += sm.length
          ? '<div class="tv-mon-lista">' + sm.slice(0, 4).map(function (r) {
              return '<div class="tv-mon-linha"><div class="tempo num" ' +
                'style="color:#FFC145;font-size:26px">RH</div>' +
                '<div class="meio"><div class="pl">' + E(r.placa) + "</div>" +
                '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) +
                " · precisa contratar</div></div></div>";
            }).join("") + "</div>"
          : vazioHtml("Todos os veículos com motorista.");
        return h;
      });
    }
  });

  /* --- 7. Alertas & Insights -------------------------------------------- */
  const ICONE_SEV = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };

  const INSIGHTS = OTD.monitorInsights();


  telas.push({
    id: "insights",
    titulo: "Alertas & Insights",
    html: function () {
      return '<div class="tv-full"><div class="card panel"><div class="phead">' +
        '<span class="ptitle">Leitura automática do monitoramento</span>' +
        '<span class="pcount tv-pag" id="monInsPag"></span></div>' +
        '<div class="tv-repom-insights" id="monIns"></div></div></div>';
    },
    after: function () {
      const POR_PAG = 4;
      const nPag = Math.max(1, Math.ceil(INSIGHTS.length / POR_PAG));
      registraBloco(nPag, function (p) {
        const el = document.getElementById("monIns");
        if (!el) return;
        const fatia = [];
        for (let k = 0; k < POR_PAG && INSIGHTS.length; k++) {
          fatia.push(INSIGHTS[(p * POR_PAG + k) % INSIGHTS.length]);
        }
        el.innerHTML = fatia.map(function (n) {
          return '<div class="tv-repom-ins ' + n.sev + '">' +
            '<div class="ic">' + ICONE_SEV[n.sev] + "</div>" +
            '<div class="txt"><div class="tt">' + E(n.titulo) + "</div>" +
            '<div class="ds">' + E(n.texto) + "</div></div>" +
            '<div class="vl num">' + E(String(n.valor)) + "</div></div>";
        }).join("");
        const pag = document.getElementById("monInsPag");
        if (pag) {
          pag.textContent = INSIGHTS.length + " leituras" +
            (nPag > 1 ? " · " + (p + 1) + "/" + nPag : "");
        }
      });
    }
  });

  /* ======================================================================= */
  /* LOOP                                                                    */
  /* ======================================================================= */
  const fixa = (P.get("tela") || "").toLowerCase();
  const LOOP = (fixa ? telas.filter(function (t) { return t.id === fixa; }) : telas);
  const SLIDES = LOOP.length ? LOOP : telas;

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
    slides[atual].innerHTML = t.html();
    slides.forEach(function (s, k) { s.classList.toggle("on", k === atual); });
    document.querySelectorAll("#tvDots i").forEach(function (d, k) {
      d.classList.toggle("on", k === atual);
    });
    if (t.after) { try { t.after(); } catch (e) { console.error(e); } }

    document.getElementById("tvSub").textContent =
      t.titulo + " · foto de " + (M ? OTD.fmtDataHora(M.geradoEm) : "—");

    const criticos = INSIGHTS.filter(function (n) { return n.sev === "critico"; });
    const selo = document.getElementById("tvSelo");
    if (selo) {
      selo.innerHTML = criticos.length
        ? '<span class="live-tag">⚠ ' + criticos.length + " PONTO" +
          (criticos.length === 1 ? "" : "S") + " CRÍTICO" +
          (criticos.length === 1 ? "" : "S") + "</span>"
        : "";
    }
  }

  function relogio() {
    const d = new Date();
    document.getElementById("tvRelogio").textContent =
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
    document.getElementById("tvData").textContent =
      OTD.DIAS_PT_FULL[d.getDay()] + ", " + d.getDate() + " de " +
      OTD.MESES_PT_FULL[d.getMonth()];
    document.getElementById("tvBase").textContent =
      "Base: " + (M ? OTD.fmtDataHora(M.geradoEm) : "—");
  }

  /* ---- barra de progresso do slide ---- */
  let t0 = Date.now();
  function tick() {
    const pct = Math.min(100, ((Date.now() - t0) / (SLIDE_SECONDS * 1000)) * 100);
    const bar = document.getElementById("tvBar");
    if (bar) bar.style.width = pct + "%";
    requestAnimationFrame(tick);
  }

  function iniciar() {
    if (!OTD.monitorTem()) {
      document.getElementById("tvSlides").innerHTML =
        '<div class="tv-slide on"><div class="tv-full"><div class="card">' +
        '<div style="padding:60px;text-align:center;font-size:24px;color:#ABA69C">' +
        "Sem base de monitoramento.<br><br>" +
        "Coloque o <b>lmonitoramento</b> na pasta de bases e rode o pipeline." +
        "</div></div></div></div>";
      return;
    }
    montar();
    mostrar(0);
    relogio();
    setInterval(relogio, 20000);
    if (SLIDES.length > 1) {
      setInterval(function () { t0 = Date.now(); mostrar(atual + 1); },
                  SLIDE_SECONDS * 1000);
    }
    setInterval(avancaPaginas, PAGE_SECONDS * 1000);
    tick();
    /* recarrega sozinho para pegar data.js novo, sem ninguem tocar no Pi */
    setTimeout(function () { location.reload(); }, RELOAD_MINUTES * 60000);
  }

  window.OTD_TVMON = { mostrar: mostrar, telas: telas };
  iniciar();
})();
