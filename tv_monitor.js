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
     ?tela=contador|mapa|vazios|retidos|parados|documentos|rastreio|motorista|insights
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

  /* Titulo curto da tela em exibicao. Fica ao lado do nome do segmento, em
     branco - pedido do gestor em 27/08: na parede o titulo do cabecalho e
     pequeno demais, e quem passa na sala nao sabe o que esta olhando. */
  let TITULO = "";

  function cabecalho(rot, direita) {
    return '<div class="tv-mon-cab"><span class="nm">' + E(rot) + "</span>" +
      '<span class="tl">' + E(TITULO) + "</span>" +
      '<span class="qt">' + direita + "</span></div>";
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
          cabecalho(op.rot, OTD.fmtNum(OTD.monitorContador(op.segs).total) +
                    " veículos") +
          monta(op) + "</div>";
      }).join("");
    });
  }

  function vazioHtml(msg) {
    return '<div class="tv-mon-vazio">✅ ' + E(msg) + "</div>";
  }

  /* Cartao de acao. O gestor pediu o STATUS como titulo em caixa alta no topo
     - antes ele era um texto amarelo miudo no meio da linha e ninguem lia de
     longe. Embaixo vem placa + cliente, e o local na terceira linha. */
  function linha(r, tempoH, limite, rotulo, detalhe) {
    const cor = OTD.monitorCorTempo(tempoH, limite);
    return '<div class="tv-mon-linha">' +
      '<div class="cab">' +
      '<span class="st">' + E((rotulo || r.status || "").toUpperCase()) + "</span>" +
      '<span class="tempo num" style="color:' + cor + '">' +
      OTD.fmtHM(tempoH) + "</span></div>" +
      '<div class="corpo"><span class="pl">' + E(r.placa || "—") + "</span>" +
      (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) + "</span>" : "") +
      "</div>" +
      '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) +
      (detalhe ? " · " + detalhe : "") + "</div></div>";
  }

  /* ======================================================================= */
  /* TELAS                                                                   */
  /* ======================================================================= */
  const telas = [];

  /* --- 1. Contador de veiculos (agora com VAZIO) ------------------------- */
  telas.push({
    id: "contador",
    titulo: "Situação da Frota Agora",
    curto: "SITUAÇÃO DA FROTA",
    html: function () { return colunasHtml("monContador"); },
    after: function () {
      paginarOperacoes("monContador", function (op) {
        const c = OTD.monitorContador(op.segs);
        return '<div class="tv-mon-grid">' +
          OTD.MONITOR_STATUS.map(function (s) {
            return '<div class="tv-mon-card" style="border-color:' + s.cor + '55">' +
              '<div class="t" style="color:' + s.cor + '">' + E(s.rot) + "</div>" +
              '<div class="n num" style="color:' + s.cor + '">' +
              OTD.fmtNum(c[s.id]) + "</div></div>";
          }).join("") +
          '<div class="tv-mon-card" style="border-color:#4ADE8055">' +
          '<div class="t" style="color:#4ADE80">Finalizadas no dia</div>' +
          '<div class="n num" style="color:#4ADE80">' +
          OTD.fmtNum(c.finalizadas) + "</div></div>" +
          "</div>";
      });
    }
  });

  /* --- 2. Mapa da frota: UMA tela, um segmento por vez -------------------- */
  /* Ate 27/08 os segmentos vinham somados no mesmo desenho e viravam uma nuvem
     de pinos sem dono. A 1a correcao criou quatro telas de mapa; o gestor
     preferiu voltar a UMA tela paginando de 5 em 5 segundos, como os demais
     cards do telao - com slide de 20s, os quatro segmentos passam inteiros
     dentro da mesma tela e o telao nao fica pesado de mapa. */
  const MAPAS = [
    { rot: "Bens de Consumo", segs: ["BENS DE CONSUMO"] },
    { rot: "Latas",           segs: ["LATAS"] },
    { rot: "Pranchas",        segs: ["PRANCHA"] },
    { rot: "Rodando",         segs: ["AUTOPROPULSOR"] }
  ];

  telas.push({
    id: "mapa",
    titulo: "Onde Está a Frota",
    curto: "LOCALIZAÇÃO",
    html: function () {
      return '<div class="tv-mon-mapa-wrap">' +
        '<div class="tv-mon-mapa" id="monMapa"></div>' +
        '<div class="tv-mon-mapa-lado" id="monMapaLado"></div></div>';
    },
    after: function () {
      registraBloco(MAPAS.length, function (p) {
        const mp = MAPAS[p % MAPAS.length];
        const pts = OTD.monitorMapa(mp.segs);
        const el = document.getElementById("monMapa");
        if (el) {
          el.innerHTML = window.OTD_MAPA
            ? OTD_MAPA.desenhar(pts, { largura: 900, altura: 1020, escape: E })
            : vazioHtml("mapa indisponível");
        }
        const lado = document.getElementById("monMapaLado");
        if (!lado) return;
        const total = pts.reduce(function (a, g) { return a + g.qtd; }, 0);
        const semLoc = (M && M.semCoordenada) || [];
        const totalSem = semLoc.reduce(function (a, g) { return a + g.qtd; }, 0);
        lado.innerHTML =
          cabecalho(mp.rot, OTD.fmtNum(total) + " no mapa") +
          '<div class="tv-mon-cidades">' +
          (pts.length ? pts.slice(0, 9).map(function (g) {
            return '<div class="tv-mon-cidade"><span class="q num">' + g.qtd +
              '</span><span class="c">' + E(g.cidade) + "/" + E(g.uf) + "</span></div>";
          }).join("") : vazioHtml("nenhum veículo posicionado")) +
          "</div>" +
          '<div class="tv-mon-nota">' + (p + 1) + "/" + MAPAS.length + " · " +
          MAPAS.map(function (x) { return x.rot; }).join(" · ") +
          (totalSem ? "<br>⚠️ " + OTD.fmtNum(totalSem) +
            " sem localização precisa — o ponto de referência não traz a cidade" : "") +
          "</div>";
      });
    }
  });

  /* --- 3. Vazios: precisam de destino ------------------------------------ */
  telas.push({
    id: "vazios",
    titulo: "Vazios — Precisam de Destino",
    curto: "VAZIOS — DESTINAR",
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
    curto: "RETIDOS — ACIONAR CLIENTE",
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

  /* --- 5. Parados em viagem (pernoite) ----------------------------------- */
  telas.push({
    id: "parados",
    titulo: "Parados em Viagem — Verificar Pernoite",
    curto: "PARADOS EM VIAGEM",
    html: function () { return colunasHtml("monParados"); },
    after: function () {
      paginarOperacoes("monParados", function (op) {
        const lista = OTD.monitorLista("pernoite", op.segs);
        if (!lista.length) {
          return vazioHtml("Ninguém parado além de " + LIM.pernoite + "h.");
        }
        return '<div class="tv-mon-lista">' + lista.slice(0, 7).map(function (r) {
          return linha(r, r.hParado, LIM.pernoite, "parado em rota",
            '<span class="ev">' + E(OTD.shortName(r.destino || "", 34)) + "</span>");
        }).join("") +
          (lista.length > 7 ? '<div class="tv-mon-mais">+' +
            (lista.length - 7) + " outros</div>" : "") + "</div>";
      });
    }
  });

  /* --- 6. Documento pendente --------------------------------------------- */
  telas.push({
    id: "documentos",
    titulo: "Documento Pendente — Emitir com Urgência",
    curto: "DOCUMENTO PENDENTE",
    html: function () { return colunasHtml("monDocs"); },
    after: function () {
      paginarOperacoes("monDocs", function (op) {
        const lista = OTD.monitorLista("semDocumento", op.segs);
        if (!lista.length) return vazioHtml("Documentação em dia.");
        return '<div class="tv-mon-lista">' + lista.slice(0, 7).map(function (r) {
          const falta = [r.faltaCte ? "CT-e" : null,
                         r.faltaMdfe ? "MDF-e" : null].filter(Boolean).join(" e ");
          return linha(r, r.hParado, LIM.pernoite, "falta " + falta,
            '<span class="ev">' + E(OTD.shortName(r.destino || "—", 34)) + "</span>");
        }).join("") +
          (lista.length > 7 ? '<div class="tv-mon-mais">+' +
            (lista.length - 7) + " outros</div>" : "") + "</div>";
      });
    }
  });

  /* --- 7. Sem posicionar -------------------------------------------------- */
  telas.push({
    id: "rastreio",
    titulo: "Sem Posicionar — Verificar Rastreio",
    curto: "SEM POSICIONAR",
    html: function () { return colunasHtml("monRastreio"); },
    after: function () {
      paginarOperacoes("monRastreio", function (op) {
        const lista = OTD.monitorLista("semPosicao", op.segs);
        if (!lista.length) return vazioHtml("Toda a frota posicionando.");
        return '<div class="tv-mon-lista">' + lista.slice(0, 7).map(function (r) {
          if (r.semRastreio) {
            return '<div class="tv-mon-linha"><div class="cab">' +
              '<span class="st">SEM RASTREIO</span>' +
              '<span class="tempo num" style="color:#F1553F">—</span></div>' +
              '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
              (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) +
               "</span>" : "") + "</div>" +
              '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) + "</div></div>";
          }
          return linha(r, r.horas, LIM.semPosicao, "sem posição", "");
        }).join("") +
          (lista.length > 7 ? '<div class="tv-mon-mais">+' +
            (lista.length - 7) + " outros</div>" : "") + "</div>";
      });
    }
  });

  /* --- 8. Sem motorista (RH) ---------------------------------------------- */
  telas.push({
    id: "motorista",
    titulo: "Veículo sem Motorista — RH Contratar",
    curto: "SEM MOTORISTA",
    html: function () { return colunasHtml("monMot"); },
    after: function () {
      paginarOperacoes("monMot", function (op) {
        const lista = OTD.monitorLista("semMotorista", op.segs);
        if (!lista.length) return vazioHtml("Todos os veículos com motorista.");
        return '<div class="tv-mon-lista">' + lista.slice(0, 7).map(function (r) {
          return '<div class="tv-mon-linha"><div class="cab">' +
            '<span class="st">SEM MOTORISTA</span>' +
            '<span class="tempo num" style="color:#B18CFF">RH</span></div>' +
            '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
            (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) +
             "</span>" : "") + "</div>" +
            '<div class="lc">' + E(r.cidade) + "/" + E(r.uf) +
            " · precisa contratar</div></div>";
        }).join("") + "</div>";
      });
    }
  });

  /* --- 9. Alertas & Insights -------------------------------------------- */
  const ICONE_SEV = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };

  const INSIGHTS = OTD.monitorInsights();


  telas.push({
    id: "insights",
    titulo: "Alertas & Insights",
    curto: "ALERTAS & INSIGHTS",
    html: function () {
      return '<div class="tv-full"><div class="card panel"><div class="phead">' +
        '<span class="ptitle tv-mon-tl">' + E(TITULO) + "</span>" +
        '<span class="ptitle" style="color:#ABA69C;font-weight:700">' +
        "Leitura automática do monitoramento</span>" +
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
    /* antes do html(): os cabecalhos leem TITULO na montagem */
    TITULO = t.curto || t.titulo || "";
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
