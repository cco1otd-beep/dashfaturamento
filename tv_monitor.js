/* ===========================================================================
   PAINEL DE MONITORAMENTO - OTD LOGISTICS
   tv_monitor.js - modo TV / kiosk DEDICADO ao monitoramento (tv_monitor.html)

   Isolado da Torre e do telao REPOM: nao compartilha estado com tv.js nem com
   tv_repom.js. Uma TV apontada aqui mostra SO a foto ao vivo da frota.

   Formato pedido pelo gestor: desde 10/11/2026 cada operacao tem a sua tela -
   Bens, Latas e Pranchas & Rodando (antes Bens e Latas dividiam duas colunas).
   Sem ?grupo= o telao alterna as tres a cada 8 segundos; quem faz a alternancia
   e o mesmo mecanismo de paginacao dos outros teloes (registraBloco), para o
   ritmo ficar igual no predio todo.

   Toda a regra vem do pipeline (generate_data.py, secao 5-B) e e lida pelo
   common.js (OTD.monitor*). Se um numero aqui diverge da aba do dashboard, o
   bug e de layout, nunca de criterio.

   Parametros de URL:
     ?tela=contador|mapa|vazios|retidos|parados|documentos|rastreio|motorista|insights
                                   fixa UMA tela (TV dedicada a um assunto)
     ?slide=45                     segundos por tela (padrao 45)
     ?pagina=8                     segundos por alternancia de operacao
     ?reload=10                    minutos ate recarregar sozinho
     ?grupo=bens|latas|pranchas    trava UMA operacao. O link antigo bens_latas
                                   continua valendo: alterna Bens e Latas, cada
                                   uma na sua tela (nao mais lado a lado) (TV dedicada a
                                   uma sala/parede so daquele grupo) - sem
                                   isso o telao alterna os dois a cada 8s
                                   (pedido do gestor em 10/09, telao_monitora-
                                   mento_bens_latas.html / _pranchas.html)
   =========================================================================== */
(function () {
  "use strict";

  const E = OTD.escapeHtml;
  const P = new URLSearchParams(location.search);

  /* 45s por tela e 8s por pagina - pedido do gestor em 28/08: com 20s/5s a
     sala nao terminava de ler um card antes de ele virar. */
  const SLIDE_SECONDS = Number(P.get("slide")) || 45;
  const PAGE_SECONDS = Number(P.get("pagina")) || 8;
  const RELOAD_MINUTES = Number(P.get("reload")) || 10;

  const M = OTD.MONITOR;
  const LIM = (M && M.limites) || { retido: 5, pernoite: 11, semPosicao: 12 };

  /* ?grupo= trava a tela em UM dos dois grupos em vez de alternar - pedido do
     gestor em 10/09/2026: duas TVs dedicadas na sala (uma so Bens/Latas,
     outra so Pranchas/Rodando) em vez de uma TV so revezando os dois. Sem o
     parametro, mantem o comportamento original (alterna a cada 8s). */
  const GRUPO = (P.get("grupo") || "").toLowerCase();
  /* 10/11/2026: Bens e Latas deixam de dividir a mesma tela. Cada operacao
     tem a sua (bens, latas, pranchas), igual ao modo TV gerencial (tv.js
     ?op=). Sem ?grupo= o telao alterna as tres, uma por pagina. O valor
     antigo bens_latas continua aceito (mostra as duas lado a lado). */
  const GRUPO_BENS = [OTD.MONITOR_OPERACOES.bens];
  const GRUPO_LATAS = [OTD.MONITOR_OPERACOES.latas];
  const GRUPO_BENS_LATAS = [OTD.MONITOR_OPERACOES.bens, OTD.MONITOR_OPERACOES.latas];
  const GRUPO_PRANCHAS = [OTD.MONITOR_OPERACOES.pranchas];
  const PAGINAS =
    GRUPO === "bens" ? [GRUPO_BENS] :
    GRUPO === "latas" ? [GRUPO_LATAS] :
    GRUPO === "bens_latas" ? [GRUPO_BENS, GRUPO_LATAS] :
    GRUPO === "pranchas" ? [GRUPO_PRANCHAS] :
    [GRUPO_BENS, GRUPO_LATAS, GRUPO_PRANCHAS];

  /* segmentos que ESTA TV mostra: insights, selo de pontos criticos e a decisao
     de pular tela vazia olham so para eles (Torre 2.0). Sem ?grupo= = todos. */
  const SEGS_TV = (function () {
    const out = [];
    PAGINAS.forEach(function (ops) {
      ops.forEach(function (op) {
        op.segs.forEach(function (sg) { if (out.indexOf(sg) < 0) out.push(sg); });
      });
    });
    return out;
  })();

  /* Quantos cartoes cabem: mede a area de slides desta TV. Fixar 5 cortava os
     cartoes em TV 720p/768p (Torre 2.0, 10/11). Descontados: moldura da coluna,
     cabecalho, legenda e o rodape "pagina x/y". 136px = altura natural de um
     cartao completo (status + placa + motorista + local). */
  const ALTURA_SLIDE = (document.getElementById("tvSlides") || {}).clientHeight ||
    Math.max(500, window.innerHeight - 140);
  const AVAIL_LISTA = Math.max(240, ALTURA_SLIDE - 190);
  const CARD_MIN = 136;
  const POR_COLUNA = Math.max(2, Math.floor(AVAIL_LISTA / CARD_MIN));
  const LINHAS_POR_PAGINA = POR_COLUNA * 2;

  /* selo do cabecalho: mostra qual grupo esta travado nesta TV (mesmo padrao
     do tv.js para as operacoes do telao de faturamento) */
  const SELO_GRUPO =
    GRUPO === "bens" ? "📦 BENS DE CONSUMO" :
    GRUPO === "latas" ? "🥫 LATAS" :
    GRUPO === "bens_latas" ? "📦🥫 BENS & LATAS" :
    GRUPO === "pranchas" ? "🚜 PRANCHAS & RODANDO" :
    "🛰️ FROTA AO VIVO";

  /* ======================================================================= */
  /* PAGINACAO (alterna as operacoes a cada PAGE_SECONDS)                    */
  /* ======================================================================= */
  let blocos = [];
  let paginaAtual = 0;
  let telaAtualId = "";
  /* Onde cada tela parou de paginar. Sem isso a lista recomecava do item 1 a
     cada volta do loop e as placas do fim NUNCA apareciam: com 45s de slide e
     8s de pagina cabem ~5 paginas, e a tela de pernoite chega a ter 8. */
  const posicaoDaTela = {};

  function registraBloco(nPag, render) {
    const n = Math.max(1, nPag);
    blocos.push({ nPag: n, render: render });
    render(paginaAtual % n);
  }
  function avancaPaginas() {
    paginaAtual++;
    if (telaAtualId) posicaoDaTela[telaAtualId] = paginaAtual;
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

  /**
   * Registra o bloco que troca as operacoes e delega o conteudo de cada coluna
   * para monta(op, bloco).
   *
   * `bloco` e a pagina DA LISTA daquela coluna. Ate 28/08 a lista era cortada
   * em 7 e o resto virava um "+5 outros" miudo no rodape - o gestor reclamou,
   * com razao: aquelas placas nunca apareciam na parede. Agora a tela tem
   *     PAGINAS.length x (maior numero de paginas de lista)
   * paginas, e elas giram no mesmo ritmo de 8s do resto do telao. A ordem fica
   * Bens|Latas p.1 -> Pranchas p.1 -> Bens|Latas p.2 -> Pranchas p.2 ...
   *
   * `conta(op)` devolve quantos itens a lista daquela operacao tem; sem ela, a
   * tela pagina so entre operacoes, como antes.
   */
  function paginarOperacoes(id, monta, conta, porPagina, opts) {
    let blocosLista = 1;
    if (conta && porPagina) {
      PAGINAS.forEach(function (ops) {
        ops.forEach(function (op) {
          blocosLista = Math.max(blocosLista,
            Math.ceil((conta(op) || 0) / porPagina));
        });
      });
    }
    registraBloco(PAGINAS.length * blocosLista, function (p) {
      const el = document.getElementById(id);
      if (!el) return;
      const ops = PAGINAS[p % PAGINAS.length];
      const bloco = Math.floor(p / PAGINAS.length);
      el.className = "tv-mon-colunas" + (ops.length === 1 ? " uma" : "");
      el.innerHTML = ops.map(function (op) {
        const totalVeic = OTD.monitorContador(op.segs).total;
        let dir = OTD.fmtNum(totalVeic) + " veículos";
        if (conta) {
          const n = conta(op) || 0;
          dir = (n
            ? '<span class="chip on">' + n + " PARA AÇÃO</span>"
            : '<span class="chip ok">✔ EM ORDEM</span>') +
            "de " + OTD.fmtNum(totalVeic) + " veículos";
        }
        return '<div class="tv-mon-col">' + cabecalho(op.rot, dir) +
          monta(op, bloco) + (opts && opts.leg ? LEGENDA : "") + "</div>";
      }).join("");
    });
  }

  /**
   * Monta a lista de uma coluna ja paginada. Devolve os cartoes da pagina e um
   * rodape dizendo em que pedaco da lista estamos - "9-16 de 25" -, para quem
   * olha saber que ainda vem mais e nao achar que a lista acabou.
   */
  function listaPaginada(lista, porPagina, bloco, montaLinha, vazio) {
    if (!lista.length) return vazioHtml(vazio);
    const nPag = Math.max(1, Math.ceil(lista.length / porPagina));
    const pag = ((bloco % nPag) + nPag) % nPag;
    const ini = pag * porPagina;
    const fatia = lista.slice(ini, ini + porPagina);
    /* DUAS colunas: a da direita e a continuacao da esquerda (1..k | k+1..n).
       Passou da capacidade da tela -> vira outra pagina, no mesmo ritmo de 8s. */
    const meio = Math.ceil(fatia.length / 2);
    const cols = fatia.length > 1 ? [fatia.slice(0, meio), fatia.slice(meio)] : [fatia];
    const alt = Math.floor(AVAIL_LISTA / cols[0].length) - 9;   /* altura de cada cartao */
    const cls = alt >= 260 ? " g" : alt >= 175 ? " m" : "";
    return '<div class="tv-mon-lista2">' + cols.map(function (c) {
      return '<div class="tv-mon-lista' + cls + '">' +
        c.map(function (r) {
          return montaLinha(r).replace('<div class="tv-mon-linha',
            '<div style="height:' + alt + 'px" class="tv-mon-linha');
        }).join("") + "</div>";
    }).join("") + "</div>" +
      (nPag > 1
        ? '<div class="tv-mon-mais">' + (ini + 1) + "–" +
          (ini + fatia.length) + " de " + lista.length +
          " · página " + (pag + 1) + "/" + nPag + "</div>"
        : "");
  }

  const LEGENDA = '<div class="tv-mon-leg">Cor do tempo: ' +
    '<i style="color:#FFC145">● acima do limite</i>' +
    '<i style="color:#F0800E">● 1,4× o limite</i>' +
    '<i style="color:#F1553F">● 2× o limite — cobrar agora</i></div>';

  function vazioHtml(msg) {
    return '<div class="tv-mon-vazio">✅ ' + E(msg) + "</div>";
  }

  /* Cartao de acao. O gestor pediu o STATUS como titulo em caixa alta no topo
     - antes ele era um texto amarelo miudo no meio da linha e ninguem lia de
     longe. Embaixo vem placa + cliente, e o local na terceira linha. */
  /* true so quando sobra texto depois de tirar as tags */
  function temTexto(html) {
    return !!String(html || "").replace(/<[^>]*>/g, "").trim();
  }

  const ICONE_LINHA = { crit: "🚨", alto: "⚠️", aten: "⚠️" };

  /* "—/SP" na parede parecia erro: diz o que realmente falta */
  function localTxt(r) {
    const c = r.cidade, u = r.uf;
    const okc = c && c !== "—", oku = u && u !== "—";
    if (okc) return c + (oku ? "/" + u : "");
    return oku ? u + " · cidade não identificada" : "sem localização";
  }

  function linha(r, tempoH, limite, rotulo, detalhe, forca) {
    const sev = forca || OTD.monitorSev(tempoH, limite);
    /* tudo que esta numa lista de acao passou do limite ou precisa de acao:
       o menor nivel e amarelo, nunca azul (que lia como "tranquilo") */
    const cor0 = OTD.monitorCorTempo(tempoH, limite);
    const cor = forca === "crit" ? "#F1553F" : (cor0 === "#4FA3E3" ? "#FFC145" : cor0);
    return '<div class="tv-mon-linha sev-' + sev + '">' +
      '<div class="cab">' +
      '<span class="st"><span class="ic">' + ICONE_LINHA[sev] + "</span>" +
      E((rotulo || r.status || "").toUpperCase()) + "</span>" +
      '<span class="tempo num" style="color:' + cor + '">' +
      OTD.fmtHM(tempoH) + "</span></div>" +
      '<div class="corpo"><span class="pl">' + E(r.placa || "—") + "</span>" +
      (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) + "</span>" : "") +
      "</div>" +
      /* o motorista e quem o time aciona - so com a placa alguem tem que ir
         procurar no sistema para saber para quem ligar (pedido do gestor
         em 02/09) */
      '<div class="mot' + (OTD.monitorSemMotorista(r) ? " vazio" : "") + '">' +
      E(OTD.monitorMotorista(r, 32)) + "</div>" +
      '<div class="lc">' + E(localTxt(r)) +
      /* o detalhe as vezes chega como uma tag vazia (destino em branco) e
         sobrava um "·" solto no fim da linha */
      (temTexto(detalhe) ? " · " + detalhe : "") + "</div></div>";
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
        const a = OTD.monitorAnterior(op.segs);
        function delta(id) {
          if (!a) return "";
          const d = c[id] - a.c[id];
          return '<div class="dl ' + (d > 0 ? "up" : d < 0 ? "dn" : "") + '">' +
            (d === 0 ? "= igual" : (d > 0 ? "▲ +" : "▼ ") + d) +
            " vs " + E(a.rotulo) + "</div>";
        }
        /* utilizacao = produtivos (carga + viagem + descarga) / ativos. E so uma
           leitura da propria foto, sem meta: a definicao fica escrita na tela. */
        function util(x) {
          return x.total ? ((x.carga + x.viagem + x.descarga) / x.total) * 100 : 0;
        }
        const prod = c.carga + c.viagem + c.descarga;
        const pct = function (n) { return c.total ? (n / c.total) * 100 : 0; };
        const uA = a ? util(a.c) : null;
        const dPP = a ? Math.round(util(c) - uA) : null;
        return '<div class="tv-mon-grid">' +
          OTD.MONITOR_STATUS.map(function (s) {
            const alerta = s.id === "vazio" && c.vazio > 0;
            return '<div class="tv-mon-card' + (alerta ? " alerta" : "") +
              '" style="border-color:' + s.cor + '55">' +
              '<div class="t" style="color:' + s.cor + '">' + E(s.rot) + "</div>" +
              '<div class="n num" style="color:' + s.cor + '">' +
              OTD.fmtNum(c[s.id]) + "</div>" + delta(s.id) + "</div>";
          }).join("") +
          '<div class="tv-mon-card" style="border-color:#4ADE8055">' +
          '<div class="t" style="color:#4ADE80">Finalizadas no dia</div>' +
          '<div class="n num" style="color:#4ADE80">' +
          OTD.fmtNum(c.finalizadas) + "</div></div>" +
          "</div>" +
          '<div class="tv-mon-util"><div class="tt">UTILIZAÇÃO DA FROTA' +
          '<b>' + OTD.fmtNum(Math.round(util(c))) + "%</b>produtivos" +
          (a ? '<span>' + (dPP === 0 ? "igual" : (dPP > 0 ? "▲ +" : "▼ ") + dPP + " p.p.") +
               " vs " + E(a.rotulo) + "</span>" : "") + "</div>" +
          '<div class="bar">' +
          '<div style="width:' + pct(prod) + '%;background:#4ADE80"></div>' +
          '<div style="width:' + pct(c.destinado) + '%;background:#B18CFF"></div>' +
          '<div style="width:' + pct(c.vazio) + '%;background:#F1553F"></div></div>' +
          '<div class="lg"><i style="color:#4ADE80">● produtivos (carga + viagem + descarga): ' +
          prod + '</i><i style="color:#B18CFF">● destinados: ' + c.destinado +
          '</i><i style="color:#F1553F">● vazios: ' + c.vazio + "</i></div></div>";
      });
    }
  });

  /* --- 2. Mapa da frota: UMA tela, um segmento por vez -------------------- */
  /* Ate 27/08 os segmentos vinham somados no mesmo desenho e viravam uma nuvem
     de pinos sem dono. A 1a correcao criou quatro telas de mapa; o gestor
     preferiu voltar a UMA tela paginando junto com os demais cards do telao -
     com slide de 45s e pagina de 8s os quatro segmentos passam inteiros dentro
     da mesma tela e o telao nao fica pesado de mapa. */
  const MAPAS_TODAS = [
    { rot: "Bens de Consumo", segs: ["BENS DE CONSUMO"], grupos: ["bens", "bens_latas"] },
    { rot: "Latas",           segs: ["LATAS"],           grupos: ["latas", "bens_latas"] },
    { rot: "Pranchas",        segs: ["PRANCHA"],         grupos: ["pranchas"] },
    { rot: "Rodando",         segs: ["AUTOPROPULSOR"],   grupos: ["pranchas"] }
  ];
  /* mesma trava do ?grupo=: TV dedicada so mostra o mapa do seu proprio par.
     Valor invalido de ?grupo= cai no padrao (mostra os quatro), igual ao
     PAGINAS acima - nunca esvazia a tela por um parametro digitado errado. */
  const MAPAS = (["bens", "latas", "bens_latas", "pranchas"].indexOf(GRUPO) >= 0)
    ? MAPAS_TODAS.filter(function (m) { return m.grupos.indexOf(GRUPO) >= 0; })
    : MAPAS_TODAS;

  telas.push({
    id: "mapa",
    titulo: "Onde Está a Frota",
    curto: "MAPA",
    html: function () {
      return '<div class="tv-mon-mapa-wrap">' +
        '<div class="tv-mon-mapa" id="monMapa"></div>' +
        '<div class="tv-mon-mapa-lado" id="monMapaLado"></div></div>';
    },
    after: function () {
      registraBloco(MAPAS.length, function (p) {
        const mp = MAPAS[p % MAPAS.length];
        /* o DESENHO usa a regiao (nao depende da tabela de coordenadas); a
           lista ao lado continua por cidade, para quem quer o detalhe */
        const regioes = OTD.monitorMapaUF(mp.segs);
        const cidades = OTD.monitorMapa(mp.segs);
        const el = document.getElementById("monMapa");
        if (el) {
          el.innerHTML = window.OTD_MAPA
            ? OTD_MAPA.desenhar(regioes, { escape: E })
            : vazioHtml("mapa indisponível");
        }
        const lado = document.getElementById("monMapaLado");
        if (!lado) return;
        const total = regioes.reduce(function (a, g) { return a + g.qtd; }, 0);
        const naLista = cidades.reduce(function (a, g) { return a + g.qtd; }, 0);
        lado.innerHTML =
          cabecalho(mp.rot, OTD.fmtNum(total) + " no mapa") +
          '<div class="tv-mon-cidades">' +
          (cidades.length ? cidades.slice(0, 8).map(function (g) {
            return '<div class="tv-mon-cidade"><span class="q num">' + g.qtd +
              '</span><span class="c">' + E(g.cidade) + "/" + E(g.uf) + "</span></div>";
          }).join("") : vazioHtml("nenhuma cidade identificada")) +
          "</div>" +
          '<div class="tv-mon-nota">' + (p + 1) + "/" + MAPAS.length + " · " +
          MAPAS.map(function (x) { return x.rot; }).join(" · ") +
          (total > naLista ? "<br>" + OTD.fmtNum(total - naLista) +
            " no mapa sem cidade no cadastro — contam no estado, não na lista"
            : "") +
          "</div>";
      });
    }
  });

  /* --- 2b. Prazo de entrega: vencido ou a vencer (Torre 2.0) -------------- */
  /* Vencido = o MESMO criterio da lista "Cargas em Atraso" (previsao de
     entrega do lcargas) cruzado pelo romaneio. A vencer = "Data na descarga"
     do lmonitoramento dentro das proximas LIM.aVencer horas e sem descarga
     iniciada. */
  function prazoLista(op) {
    return OTD.monitorLista("prazoVencido", op.segs)
      .concat(OTD.monitorLista("aVencer", op.segs));
  }
  function fmtAtraso(h) {
    if (h === null || h === undefined) return "—";
    if (h >= 48) return Math.floor(h / 24) + "d " + Math.round(h % 24) + "h";
    return OTD.fmtHM(h);
  }
  telas.push({
    id: "prazo",
    titulo: "Prazo de Entrega — Avisar o Cliente",
    curto: "PRAZO DE ENTREGA",
    okTxt: { ic: "📅", t: "Prazos de entrega em dia", s: "nenhum vencido nem vencendo" },
    vazia: function () {
      return !OTD.monitorLista("prazoVencido", SEGS_TV).length &&
             !OTD.monitorLista("aVencer", SEGS_TV).length;
    },
    html: function () { return colunasHtml("monPrazo"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monPrazo", function (op, bloco) {
        return listaPaginada(prazoLista(op), POR_PAG, bloco, function (r) {
          const dest = '<span class="ev">→ ' + E(OTD.shortName(r.destinatario || r.destino || "—", 34)) + "</span>";
          if (r.atrasoH !== undefined) {
            /* escalada so visual: vencido ja e laranja; a partir de 12h, vermelho */
            const sev = (r.atrasoH || 0) >= 12 ? "crit" : "alto";
            return '<div class="tv-mon-linha sev-' + sev + '"><div class="cab">' +
              '<span class="st"><span class="ic">🚨</span>PRAZO VENCIDO</span>' +
              '<span class="tempo num" style="color:' + (sev === "crit" ? "#F1553F" : "#F0800E") +
              '">+' + fmtAtraso(r.atrasoH) + "<small>de atraso</small></span></div>" +
              '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
              (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) + "</span>" : "") +
              '</div><div class="mot">' + E(OTD.monitorMotorista(r, 32)) + "</div>" +
              '<div class="lc">' + E(localTxt(r)) + " · " + dest + "</div></div>";
          }
          return '<div class="tv-mon-linha sev-aten"><div class="cab">' +
            '<span class="st"><span class="ic">⏳</span>PRAZO VENCENDO</span>' +
            '<span class="tempo num" style="color:#FFC145">em ' + OTD.fmtHM(r.restaH) + "</span></div>" +
            '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
            (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) + "</span>" : "") +
            '</div><div class="mot">' + E(OTD.monitorMotorista(r, 32)) + "</div>" +
            '<div class="lc">' + E(localTxt(r)) + " · " + dest + "</div></div>";
        }, "Nenhum prazo vencido ou vencendo.");
      }, function (op) { return prazoLista(op).length; }, POR_PAG);
    }
  });

  /* --- 3. Vazios: precisam de destino ------------------------------------ */
  telas.push({
    id: "vazios",
    okTxt: { ic: "🚛", t: "Nenhum veículo vazio", s: "todos com destino" },
    vazia: function () { return !OTD.monitorLista("vazios", SEGS_TV).length; },
    titulo: "Vazios — Precisam de Destino",
    curto: "VAZIOS — DESTINAR",
    html: function () { return colunasHtml("monVazios"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monVazios", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("vazios", op.segs), POR_PAG, bloco,
          function (r) {
            return linha(r, r.hParado, 12, "vazio — sem destino",
              '<span class="ev">sem carga há <b>' + OTD.fmtHM(r.hEvento) + "</b></span>");
          }, "Nenhum veículo vazio.");
      }, function (op) { return OTD.monitorLista("vazios", op.segs).length; },
        POR_PAG, { leg: true });
    }
  });

  /* --- 4. Retidos em carga/descarga acima do limite ---------------------- */
  telas.push({
    id: "retidos",
    okTxt: { ic: "⏱️", t: "Ninguém retido", s: "carga e descarga dentro do limite" },
    vazia: function () { return !OTD.monitorLista("retidos", SEGS_TV).length; },
    titulo: "Retidos em Carga e Descarga — Acionar Cliente",
    curto: "RETIDOS — ACIONAR CLIENTE",
    html: function () { return colunasHtml("monRetidos"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monRetidos", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("retidos", op.segs), POR_PAG, bloco,
          function (r) {
            const quem = r.status === "Carga" ? r.remetente : r.destinatario;
            return linha(r, r.hEvento, LIM.retido,
              (r.status === "Carga" ? "retido no carregamento" : "retido na descarga"),
              '<span class="ev">acionar: <b>' +
              E(OTD.shortName(quem || "—", 30)) + "</b></span>");
          }, "Nada retido acima de " + LIM.retido + "h.");
      }, function (op) { return OTD.monitorLista("retidos", op.segs).length; },
        POR_PAG, { leg: true });
    }
  });

  /* --- 5. Parados em viagem (pernoite) ----------------------------------- */
  telas.push({
    id: "parados",
    okTxt: { ic: "🛣️", t: "Ninguém parado em rota", s: "nenhum acima do limite de pernoite" },
    vazia: function () { return !OTD.monitorLista("pernoite", SEGS_TV).length; },
    titulo: "Parados em Viagem — Verificar Pernoite",
    curto: "PARADOS EM VIAGEM",
    html: function () { return colunasHtml("monParados"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monParados", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("pernoite", op.segs), POR_PAG, bloco,
          function (r) {
            return linha(r, r.hParado, LIM.pernoite,
              r.naMatriz ? "na matriz — conferir" : "parado em rota",
              '<span class="ev">' + E(OTD.shortName(r.destino || "", 34)) + "</span>");
          }, "Ninguém parado além de " + LIM.pernoite + "h.");
      }, function (op) { return OTD.monitorLista("pernoite", op.segs).length; },
        POR_PAG, { leg: true });
    }
  });

  /* --- 6. Documento pendente --------------------------------------------- */
  telas.push({
    id: "documentos",
    okTxt: { ic: "📄", t: "Documentação em dia", s: "CT-e e MDF-e emitidos" },
    vazia: function () { return !OTD.monitorLista("semDocumento", SEGS_TV).length; },
    titulo: "Documento Pendente — Emitir com Urgência",
    curto: "DOCUMENTO PENDENTE",
    html: function () { return colunasHtml("monDocs"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monDocs", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("semDocumento", op.segs), POR_PAG,
          bloco, function (r) {
            const falta = [r.faltaCte ? "CT-e" : null,
                           r.faltaMdfe ? "MDF-e" : null].filter(Boolean).join(" e ");
            return linha(r, r.hParado, LIM.pernoite, "falta " + falta + " — emitir agora",
              '<span class="ev">' + E(OTD.shortName(r.destino || "—", 34)) + "</span>",
              "crit");
          }, "Documentação em dia.");
      }, function (op) { return OTD.monitorLista("semDocumento", op.segs).length; },
        POR_PAG);
    }
  });

  /* --- 7. Sem posicionar -------------------------------------------------- */
  telas.push({
    id: "rastreio",
    okTxt: { ic: "📡", t: "Rastreio em dia", s: "toda a frota posicionando" },
    vazia: function () { return !OTD.monitorLista("semPosicao", SEGS_TV).length; },
    titulo: "Sem Posicionar — Verificar Rastreio",
    curto: "SEM POSICIONAR",
    html: function () { return colunasHtml("monRastreio"); },
    after: function () {
      const POR_PAG = LINHAS_POR_PAGINA;
      paginarOperacoes("monRastreio", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("semPosicao", op.segs), POR_PAG,
          bloco, function (r) {
            if (r.semRastreio) {
              return '<div class="tv-mon-linha sev-crit"><div class="cab">' +
                '<span class="st"><span class="ic">🚨</span>SEM RASTREIO</span>' +
                '<span class="tempo num" style="color:#F1553F">—</span></div>' +
                '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
                (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) +
                 "</span>" : "") + "</div>" +
                '<div class="lc">' + E(localTxt(r)) + "</div></div>";
            }
            return linha(r, r.horas, LIM.semPosicao, "sem posição", "");
          }, "Toda a frota posicionando.");
      }, function (op) { return OTD.monitorLista("semPosicao", op.segs).length; },
        POR_PAG, { leg: true });
    }
  });

  /* --- 8. Sem motorista (RH) ---------------------------------------------- */
  telas.push({
    id: "motorista",
    okTxt: { ic: "🧑‍✈️", t: "Todos com motorista", s: "nenhum veículo parado por falta de motorista" },
    vazia: function () { return !OTD.monitorLista("semMotorista", SEGS_TV).length; },
    titulo: "Veículo sem Motorista — RH Contratar",
    curto: "SEM MOTORISTA",
    html: function () { return colunasHtml("monMot"); },
    after: function () {
      const POR_PAG = 7;
      paginarOperacoes("monMot", function (op, bloco) {
        return listaPaginada(OTD.monitorLista("semMotorista", op.segs), POR_PAG,
          bloco, function (r) {
            return '<div class="tv-mon-linha sev-info"><div class="cab">' +
              '<span class="st"><span class="ic">🧑‍✈️</span>SEM MOTORISTA</span>' +
              '<span class="tempo num" style="color:#B18CFF">RH</span></div>' +
              '<div class="corpo"><span class="pl">' + E(r.placa) + "</span>" +
              (r.cliente ? '<span class="cli">' + E(OTD.shortName(r.cliente, 26)) +
               "</span>" : "") + "</div>" +
              '<div class="lc">' + E(localTxt(r)) +
              " · precisa contratar</div></div>";
          }, "Todos os veículos com motorista.");
      }, function (op) { return OTD.monitorLista("semMotorista", op.segs).length; },
        POR_PAG);
    }
  });

  /* --- 8b. Onde mais se espera: clientes com maior tempo de retencao ------ */
  /* Agrupa os RETIDOS (acima do limite) pelo cliente que o time aciona:
     remetente se esta carregando, destinatario se esta descarregando. */
  function rankingEspera(op) {
    const g = {};
    OTD.monitorLista("retidos", op.segs).forEach(function (r) {
      const quem = OTD.shortName((r.status === "Carga" ? r.remetente : r.destinatario) || "—", 30);
      const x = g[quem] || (g[quem] = { nome: quem, n: 0, soma: 0, max: 0 });
      x.n++; x.soma += r.hEvento || 0; x.max = Math.max(x.max, r.hEvento || 0);
    });
    return Object.keys(g).map(function (k) { return g[k]; })
      .sort(function (a, b) { return b.soma - a.soma; });
  }
  telas.push({
    id: "espera",
    titulo: "Onde Mais Se Espera — Cobrar Estadia",
    curto: "CLIENTES COM MAIOR ESPERA",
    okTxt: { ic: "🏭", t: "Sem espera acima do limite", s: "nenhum cliente retendo veículo" },
    vazia: function () { return !OTD.monitorLista("retidos", SEGS_TV).length; },
    html: function () { return colunasHtml("monEspera"); },
    after: function () {
      paginarOperacoes("monEspera", function (op) {
        const rk = rankingEspera(op).slice(0, 6);
        if (!rk.length) return vazioHtml("Nenhum cliente retendo veículo.");
        const topo = rk[0].soma || 1;
        return '<div class="tv-mon-rank">' + rk.map(function (x, i) {
          const cor = i === 0 ? "#F1553F" : i === 1 ? "#F0800E" : "#FFC145";
          return '<div class="rw"><div class="top"><span class="nm">' + (i + 1) + "º · " +
            E(x.nome) + '</span><span class="vl" style="color:' + cor + '">' +
            OTD.fmtHM(x.soma) + '</span></div><div class="br"><div style="width:' +
            Math.max(4, (x.soma / topo) * 100) + "%;background:" + cor + '"></div></div>' +
            '<div class="sb">' + x.n + " veículo" + (x.n === 1 ? "" : "s") +
            " retido" + (x.n === 1 ? "" : "s") + " · maior espera " +
            OTD.fmtHM(x.max) + " · soma das horas acima do limite de " + LIM.retido + "h</div></div>";
        }).join("") + "</div>";
      });
    }
  });

  /* --- 8c. Itens zerados juntos num painel so (nao gasta 45s cada) -------- */
  function itensEmOrdem() {
    return telas.filter(function (t) { return t.okTxt && t.vazia && t.vazia(); })
      .map(function (t) { return t.okTxt; });
  }
  telas.push({
    id: "ok",
    titulo: "Em Ordem — Nada a Cobrar",
    curto: "EM ORDEM",
    ehPainelOk: true,
    html: function () {
      return '<div class="tv-full"><div class="card panel"><div class="phead">' +
        '<span class="ptitle tv-mon-tl">' + E(TITULO) + "</span>" +
        '<span class="ptitle" style="color:#4ADE80;font-weight:800">✔ sem pendência nesta operação</span></div>' +
        '<div class="tv-mon-okgrid">' + itensEmOrdem().map(function (o) {
          return '<div class="tv-mon-okitem"><div class="ic">' + o.ic + '</div><div class="t">' +
            E(o.t) + '</div><div class="s">' + E(o.s) + "</div></div>";
        }).join("") + "</div></div></div>";
    }
  });

  /* --- 9. Alertas & Insights -------------------------------------------- */
  const ICONE_SEV = { critico: "🚨", atencao: "⚠️", info: "📊", positivo: "✅" };

  const INSIGHTS = OTD.monitorInsights(SEGS_TV);


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
        '<div class="tv-repom-insights tvmon-ins" id="monIns"></div></div></div>';
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
  /* Torre 2.0: tela sem item nao gasta 45s - os zerados vao juntos para a tela
     "Em ordem". Com ?tela= fixa a tela pedida aparece mesmo vazia. */
  const LOOP = fixa
    ? telas.filter(function (t) { return t.id === fixa; })
    : telas.filter(function (t) {
        if (t.ehPainelOk) return itensEmOrdem().length > 0;
        return !(t.vazia && t.vazia());
      });
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

    const slides = document.querySelectorAll(".tv-slide");
    const t = SLIDES[atual];
    /* retoma a paginacao de onde esta tela parou na volta anterior */
    telaAtualId = t.id;
    paginaAtual = posicaoDaTela[t.id] || 0;
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
    const elOp = document.getElementById("tvOp");
    if (elOp) elOp.textContent = SELO_GRUPO;
    if (!OTD.monitorTem()) {
      document.getElementById("tvSlides").innerHTML =
        '<div class="tv-slide on"><div class="tv-full"><div class="card">' +
        '<div style="padding:60px;text-align:center;font-size:24px;color:#ABA69C">' +
        "Sem base de monitoramento.<br><br>" +
        "Coloque o <b>lmonitoramento</b> na pasta de bases e rode o pipeline." +
        "</div></div></div></div>";
      /* 22/10/2026: o telao ficou parado nesta mensagem porque este caminho
         nao agendava o recarregamento (so o caminho normal agendava). Se o
         data.js falhou na carga (publicacao em andamento, rede), tenta de
         novo em 1 minuto em vez de ficar congelado. */
      setTimeout(function () { location.reload(); }, 60000);
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
