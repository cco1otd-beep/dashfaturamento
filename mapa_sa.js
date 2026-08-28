/* ===========================================================================
   MAPA DA OPERACAO - OTD LOGISTICS
   mapa_sa.js - pinta de laranja o ESTADO (Brasil) ou a PROVINCIA (vizinhos)
   onde a frota esta e escreve dentro dela, em preto, quantos veiculos tem ali.

   Por que SVG desenhado aqui e nao uma biblioteca de mapa: o telao roda num
   Raspberry sem internet garantida, e qualquer mapa de tiles (Leaflet, Google)
   depende de rede. A geometria vem estatica do mapa_geo.js.

   As tres versoes, porque cada uma corrigiu um defeito visto na parede:
     1. silhueta desenhada a mao         -> "ficou futurista, queria desenho real"
     2. costa + divisas reais, com pinos -> os circulos de cidade se cobriam no
                                            Sudeste, e o mapa mostrava a America
                                            do Sul inteira, longe demais
     3. regiao PINTADA + numero em preto, com zoom automatico. Mas os vizinhos
        vinham de uma base grosseira: "ficou horrivel o Mercosul", e 25 carros
        em Jujuy pintavam a Argentina INTEIRA;
     4. (esta) os vizinhos passam a ser PROVINCIAS (Natural Earth admin-1), com
        o mesmo acabamento dos estados do IBGE.

   Projecao equirretangular (lat/lon direto para x/y).
   =========================================================================== */
(function (global) {
  "use strict";

  /* Janela base. Ajustada em 28/08 a pedido do gestor: o recorte anterior
     (lon -70, lat -34,5 a -9,5) cortava Peru e Chile fora da tela, e a
     Argentina aparecia so pela metade - os tres ficavam sem contorno e sem
     nome. Agora a janela abre para o oeste ate o Peru e desce ate o norte da
     Patagonia; em troca corta o Brasil acima do Tocantins, onde a operacao
     praticamente nao tem carga. Se algum veiculo cair fora, a janela se abre
     sozinha (ver janelaDe): preferimos perder o zoom a esconder caminhao. */
  const BASE = { lon0: -78.5, lon1: -34.5, lat0: -39.5, lat1: -7.5 };
  const MARGEM = 1.2;               /* graus de folga ao redor do conteudo */

  /* Mapa de calor: seis faixas de intensidade do laranja (28/08). Do mais
     carregado ao menos carregado. Nao usar menos de 50%: abaixo disso o
     laranja some no bege do mapa e o numero preto perde contraste. */
  const FAIXAS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

  const TEMAS = {
    claro: {
      mar: "#DCD5C8", terra: "#F3EFE7", divisa: "#B3A895", contorno: "#8A8072",
      ativa: "#F0800E", ativaBorda: "#A9540A", numero: "#1A1105",
      sigla: "#3B2A12", chamada: "#8A8072", rotulo: "#2A241D", halo: "#F7F4EE",
      paisLinha: "#141110", paisNome: "#B9B0A2"
    },
    escuro: {
      mar: "#141110", terra: "#1b1613", divisa: "#3a332b", contorno: "#4a4238",
      ativa: "#F0800E", ativaBorda: "#7A3D00", numero: "#1a1105",
      sigla: "#2A1A08", chamada: "#5a5148", rotulo: "#F6F4F0", halo: "#0b0a09",
      paisLinha: "#000000", paisNome: "#4a4238"
    }
  };

  function GEO() {
    return global.OTD_GEO || { regioes: [], costa: [], paises: [] };
  }

  /* ---------------------------------------------------------------------- */
  /* GEOMETRIA                                                              */
  /* ---------------------------------------------------------------------- */
  function dentroDoAnel(anel, lon, lat) {
    let dentro = false;                       /* ray casting classico */
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const xi = anel[i][0], yi = anel[i][1];
      const xj = anel[j][0], yj = anel[j][1];
      if ((yi > lat) !== (yj > lat) &&
          lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        dentro = !dentro;
      }
    }
    return dentro;
  }

  function regiaoNoPonto(regioes, lon, lat, tipo) {
    for (let k = 0; k < regioes.length; k++) {
      const r = regioes[k];
      if (tipo && r.tipo !== tipo) continue;
      for (let a = 0; a < r.aneis.length; a++) {
        if (dentroDoAnel(r.aneis[a], lon, lat)) return r;
      }
    }
    return null;
  }

  function caixaDe(aneis) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    aneis.forEach(function (a) {
      a.forEach(function (p) {
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[1] > y1) y1 = p[1];
      });
    });
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  /* ---------------------------------------------------------------------- */
  /* AGRUPAMENTO: cidade -> estado / pais                                   */
  /* ---------------------------------------------------------------------- */
  /**
   * pontos: [{cidade, uf, lat, lon, qtd}] - o que o pipeline ja entrega.
   * Devolve { porRegiao: {id: qtd}, foraDoMapa: [pontos sem regiao] }.
   */
  function agrupar(pontos, regioes) {
    const porRegiao = {};
    const fora = [];
    const porId = {};
    regioes.forEach(function (r) { porId[r.id] = r; });

    (pontos || []).forEach(function (p) {
      const uf = String(p.uf || "").toUpperCase();
      let r = null;
      if (uf && uf !== "EX" && porId[uf]) {
        r = porId[uf];                       /* estado do Brasil: vem no dado */
      } else if (p.lon != null && p.lat != null) {
        /* carga internacional (UF "EX") ou UF em branco: descobre pelo ponto */
        r = regiaoNoPonto(regioes, p.lon, p.lat, uf === "EX" ? "prov" : null) ||
            regiaoNoPonto(regioes, p.lon, p.lat, null);
      }
      if (!r) { fora.push(p); return; }
      porRegiao[r.id] = (porRegiao[r.id] || 0) + (p.qtd || 0);
    });
    return { porRegiao: porRegiao, foraDoMapa: fora };
  }

  /* ---------------------------------------------------------------------- */
  /* JANELA (o zoom)                                                        */
  /* ---------------------------------------------------------------------- */
  /**
   * Comeca na janela base e SO abre - nunca fecha. Regiao com carro entra
   * INTEIRA: o poligono todo precisa aparecer, senao a mancha laranja fica
   * cortada na borda (foi o que aconteceu quando o mapa pintava o pais inteiro).
   */
  function janelaDe(regioes, porRegiao, foraDoMapa) {
    let lon0 = BASE.lon0, lon1 = BASE.lon1, lat0 = BASE.lat0, lat1 = BASE.lat1;

    regioes.forEach(function (r) {
      if (!porRegiao[r.id]) return;
      const c = caixaDe(r.aneis);
      lon0 = Math.min(lon0, c.x0); lon1 = Math.max(lon1, c.x1);
      lat0 = Math.min(lat0, c.y0); lat1 = Math.max(lat1, c.y1);
    });
    (foraDoMapa || []).forEach(function (p) {
      if (p.lon == null || p.lat == null) return;
      lon0 = Math.min(lon0, p.lon - 1); lon1 = Math.max(lon1, p.lon + 1);
      lat0 = Math.min(lat0, p.lat - 1); lat1 = Math.max(lat1, p.lat + 1);
    });

    return {
      lon0: lon0 - MARGEM, lon1: lon1 + MARGEM,
      lat0: lat0 - MARGEM, lat1: lat1 + MARGEM
    };
  }

  /* ---------------------------------------------------------------------- */
  /* DESENHO                                                                */
  /* ---------------------------------------------------------------------- */
  function desenhar(pontos, opcoes) {
    opcoes = opcoes || {};
    const esc = opcoes.escape || function (s) { return s; };
    const T = TEMAS[opcoes.tema === "escuro" ? "escuro" : "claro"];
    const geo = GEO();
    const regioes = geo.regioes || [];

    const ag = agrupar(pontos, regioes);
    const J = janelaDe(regioes, ag.porRegiao, ag.foraDoMapa);

    /* o viewBox segue a proporcao da janela: sem isso sobram tarjas vazias
       enormes dos lados, que era o defeito da versao anterior */
    const larguraGraus = J.lon1 - J.lon0;
    const alturaGraus = J.lat1 - J.lat0;
    const H = 900;
    const W = Math.round(H * (larguraGraus / alturaGraus));

    function px(lon, lat) {
      return [
        ((lon - J.lon0) / larguraGraus) * W,
        ((J.lat1 - lat) / alturaGraus) * H
      ];
    }
    function caminho(pts, fechar) {
      let d = "";
      for (let i = 0; i < pts.length; i++) {
        const xy = px(pts[i][0], pts[i][1]);
        d += (i ? "L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
      }
      return d + (fechar ? "Z" : "");
    }

    const out = [];
    out.push('<svg viewBox="0 0 ' + W + " " + H + '" ' +
      'preserveAspectRatio="xMidYMid meet" class="mapa-sa">');
    out.push('<rect x="0" y="0" width="' + W + '" height="' + H +
      '" rx="14" fill="' + T.mar + '"/>');

    /* --- silhueta do continente: contexto do que nao e regiao da lista ---- */
    const silhueta = (geo.costa || []).map(function (c) {
      return caminho(c, true);
    }).join(" ");
    if (silhueta) {
      out.push('<path d="' + silhueta + '" fill="' + T.terra +
        '" stroke="' + T.contorno + '" stroke-width="1" fill-rule="evenodd"/>');
    }

    const inativas = [], ativas = [];
    regioes.forEach(function (r) {
      (ag.porRegiao[r.id] ? ativas : inativas).push(r);
    });

    /* --- regioes sem veiculo: fundo neutro, so para dar a divisa ---------- */
    inativas.forEach(function (r) {
      const d = r.aneis.map(function (a) { return caminho(a, true); }).join(" ");
      out.push('<path d="' + d + '" fill="' + T.terra + '" stroke="' +
        T.divisa + '" stroke-width="1" stroke-linejoin="round"/>');
    });

    /* --- nome do pais, cinza claro, ao FUNDO -------------------------------
       Pedido do gestor em 28/08. Vem ANTES das regioes pintadas de proposito:
       assim o laranja e o numero passam por cima e o nome nunca disputa com a
       informacao que importa - ele so preenche o vazio, como marca d'agua. */
    const paises = geo.paises || [];
    paises.forEach(function (pz) {
      const nome = (pz.nome || "").toUpperCase();
      if (!nome) return;
      const c = caixaDe(pz.aneis);
      const a = px(c.x0, c.y1), b2 = px(c.x1, c.y0);
      const largPx = Math.abs(b2[0] - a[0]);
      const xy = px(pz.ponto[0], pz.ponto[1]);
      /* fora da janela visivel: nao adianta escrever, sai cortado na borda */
      if (xy[0] < 40 || xy[0] > W - 40 || xy[1] < 30 || xy[1] > H - 30) return;
      /* a fonte tem de caber DENTRO do pais, senao o nome invade o vizinho -
         0,78 por caractere ja inclui o espacamento entre letras */
      const fonte = Math.min(40, (largPx * 0.8) / (nome.length * 0.78));
      if (fonte < 13) return;                  /* pais espremido: sem nome */
      /* o ponto de ancora nao e o centro horizontal do pais: sem prender o
         texto na caixa, "PARAGUAI" escorregava para dentro do Brasil */
      const meia = (nome.length * fonte * 0.78) / 2;
      const xEsq = Math.min(a[0], b2[0]), xDir = Math.max(a[0], b2[0]);
      const x = Math.max(xEsq + meia, Math.min(xDir - meia, xy[0]));
      out.push('<text x="' + x.toFixed(1) + '" y="' + xy[1].toFixed(1) +
        '" text-anchor="middle" font-size="' + fonte.toFixed(0) + '" ' +
        'font-weight="700" letter-spacing="' + (fonte * 0.16).toFixed(1) +
        '" fill="' + T.paisNome + '" opacity=".62">' + esc(nome) + "</text>");
    });

    /* --- regioes COM veiculo: mapa de calor em 6 faixas --------------------
       Pedido do gestor em 28/08. A intensidade e PROPORCIONAL: a regiao com
       mais carros do segmento fica em 100% e as demais caem por faixa ate 50%.
       Ancorar no maior (e nao no total do segmento) e o que faz a escala usar
       as seis faixas - com 26 carros espalhados por 5 estados, nenhuma regiao
       chega perto do total e o mapa sairia todo na faixa mais clara.
       A borda fica sempre opaca, senao a regiao clara perde o contorno. */
    const maxQtd = ativas.reduce(function (a, r) {
      return Math.max(a, ag.porRegiao[r.id]);
    }, 0);

    function faixaDe(qtd) {
      if (!maxQtd) return FAIXAS[FAIXAS.length - 1];
      const razao = qtd / maxQtd;
      for (let i = 0; i < FAIXAS.length; i++) {
        if (razao > (FAIXAS.length - 1 - i) / FAIXAS.length) return FAIXAS[i];
      }
      return FAIXAS[FAIXAS.length - 1];
    }

    ativas.forEach(function (r) {
      const d = r.aneis.map(function (a) { return caminho(a, true); }).join(" ");
      out.push('<path d="' + d + '" fill="' + T.ativa + '" fill-opacity="' +
        faixaDe(ag.porRegiao[r.id]) + '" stroke="' + T.ativaBorda +
        '" stroke-width="2" stroke-linejoin="round"/>');
    });

    /* --- contorno dos paises: preto e grosso -------------------------------
       Sem ele divisa de estado e fronteira de pais tinham a mesma espessura e
       o mapa virava um amontoado de linhas iguais. Vai por cima das regioes
       pintadas, para a fronteira nao sumir dentro da mancha laranja. */
    paises.forEach(function (pz) {
      const d = pz.aneis.map(function (a) { return caminho(a, true); }).join(" ");
      out.push('<path d="' + d + '" fill="none" stroke="' + T.paisLinha +
        '" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>');
    });

    /* --- numeros ----------------------------------------------------------
       Dentro da regiao quando cabe; num balao na lateral, com linha de
       chamada, quando a regiao e pequena demais (DF, Sergipe, Alagoas). */
    const baloes = [];
    ativas.forEach(function (r) {
      const qtd = ag.porRegiao[r.id];
      const c = caixaDe(r.aneis);
      const cantoA = px(c.x0, c.y1), cantoB = px(c.x1, c.y0);
      const larg = Math.abs(cantoB[0] - cantoA[0]);
      const alt = Math.abs(cantoB[1] - cantoA[1]);
      const p = px(r.ponto[0], r.ponto[1]);
      const texto = String(qtd);
      /* 0,62 por caractere e a largura aproximada da fonte em peso 800 */
      const cabe = larg > texto.length * 0.62 * 34 && alt > 46;

      if (!cabe) { baloes.push({ r: r, qtd: qtd, x: p[0], y: p[1] }); return; }

      const fonte = Math.max(28, Math.min(74, larg * 0.34, alt * 0.5));
      out.push('<text x="' + p[0].toFixed(1) + '" y="' +
        (p[1] + fonte * 0.34).toFixed(1) + '" text-anchor="middle" ' +
        'font-size="' + fonte.toFixed(0) + '" font-weight="800" ' +
        'fill="' + T.numero + '">' + texto + "</text>");
      if (larg > 90 && alt > 90) {
        out.push('<text x="' + p[0].toFixed(1) + '" y="' +
          (p[1] + fonte * 0.34 + fonte * 0.5).toFixed(1) +
          '" text-anchor="middle" font-size="' + (fonte * 0.32).toFixed(0) +
          '" font-weight="800" fill="' + T.sigla + '" opacity=".8">' +
          esc(r.rot || r.id) + "</text>");
      }
    });

    /* baloes empilhados na borda direita, sem se cobrir */
    if (baloes.length) {
      baloes.sort(function (u, v) { return u.y - v.y; });
      const RAIO = 26, PASSO = 62;
      let ultimo = -Infinity;
      baloes.forEach(function (bl) {
        let y = Math.max(bl.y, ultimo + PASSO);
        y = Math.min(y, H - RAIO - 6);
        ultimo = y;
        const x = W - RAIO - 8;
        out.push('<path d="M' + bl.x.toFixed(1) + " " + bl.y.toFixed(1) +
          "L" + (x - RAIO).toFixed(1) + " " + y.toFixed(1) +
          '" stroke="' + T.chamada + '" stroke-width="1.4" fill="none"/>');
        out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
          '" r="' + RAIO + '" fill="' + T.ativa + '" fill-opacity="' +
          faixaDe(bl.qtd) + '" stroke="' + T.ativaBorda + '" stroke-width="2"/>');
        out.push('<text x="' + x.toFixed(1) + '" y="' + (y + 8).toFixed(1) +
          '" text-anchor="middle" font-size="24" font-weight="800" fill="' +
          T.numero + '">' + bl.qtd + "</text>");
        out.push('<text x="' + (x - RAIO - 10).toFixed(1) + '" y="' +
          (y + 7).toFixed(1) + '" text-anchor="end" font-size="20" ' +
          'font-weight="800" fill="' + T.rotulo + '" stroke="' + T.halo +
          '" stroke-width="4" paint-order="stroke">' +
          esc(bl.r.rot || bl.r.id) + "</text>");
      });
    }

    /* --- legenda das faixas ------------------------------------------------
       Sem ela o degrade nao significa nada para quem chega na sala: a pessoa
       ve dois laranjas diferentes e nao sabe se e mais carro ou menos. */
    if (maxQtd) {
      const LARG = 46, ALT = 16;
      const x0 = 16, y0 = H - 48;
      out.push('<rect x="' + (x0 - 8) + '" y="' + (y0 - 22) + '" width="' +
        (FAIXAS.length * LARG + 108) + '" height="60" rx="9" fill="' + T.halo +
        '" fill-opacity=".88" stroke="' + T.divisa + '" stroke-width="1"/>');
      out.push('<text x="' + x0 + '" y="' + (y0 - 5) + '" font-size="13" ' +
        'font-weight="800" fill="' + T.rotulo + '">CONCENTRAÇÃO DA FROTA</text>');
      FAIXAS.forEach(function (f, i) {
        const x = x0 + i * LARG;
        out.push('<rect x="' + x + '" y="' + y0 + '" width="' + (LARG - 4) +
          '" height="' + ALT + '" fill="' + T.ativa + '" fill-opacity="' + f +
          '" stroke="' + T.ativaBorda + '" stroke-width="1"/>');
      });
      out.push('<text x="' + x0 + '" y="' + (y0 + ALT + 13) + '" font-size="12" ' +
        'font-weight="700" fill="' + T.rotulo + '">maior concentração</text>');
      out.push('<text x="' + (x0 + FAIXAS.length * LARG - 4) + '" y="' +
        (y0 + ALT + 13) + '" text-anchor="end" font-size="12" font-weight="700" ' +
        'fill="' + T.rotulo + '">menor</text>');
      out.push('<text x="' + (x0 + FAIXAS.length * LARG + 14) + '" y="' +
        (y0 + ALT - 2) + '" font-size="13" font-weight="800" fill="' +
        T.rotulo + '">pico: ' + maxQtd + "</text>");
    }

    out.push("</svg>");
    return out.join("");
  }

  global.OTD_MAPA = { desenhar: desenhar, agrupar: agrupar };
})(window);
