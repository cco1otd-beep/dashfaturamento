/* ===========================================================================
   MAPA DA AMERICA DO SUL - OTD LOGISTICS
   mapa_sa.js - contorno do continente, divisas e pinos de caminhao.

   Por que SVG desenhado a mao e nao uma biblioteca de mapa: o telao roda num
   Raspberry sem internet garantida, e qualquer mapa de tiles (Leaflet, Google)
   depende de rede. E uma silhueta SIMPLIFICADA - precisa ser reconhecivel a 3
   metros, nao ser cartografia.

   Duas coisas resolvidas na 2a versao, pedidas depois de ver na parede:
     1. DIVISAS - so o contorno externo nao dava referencia nenhuma; agora tem
        fronteira dos paises vizinhos e divisa dos estados onde a frota opera;
     2. ROTULOS COM LINHA DE CHAMADA - no Sudeste as cidades ficam a poucos
        pixels uma da outra e os nomes se cobriam. Agora o rotulo e empurrado
        para uma coluna lateral livre e ligado ao pino por uma linha fina.

   Projecao equirretangular (lat/lon direto para x/y).
   =========================================================================== */
(function (global) {
  "use strict";

  const LON0 = -82, LON1 = -33, LAT0 = -41, LAT1 = 13;

  /* Silhueta da AMERICA DO SUL, sentido horario a partir do noroeste. */
  const CONTORNO = [
    [-79.0, 8.9], [-77.4, 7.9], [-77.9, 5.8], [-79.0, 2.2],
    [-80.9, -0.9], [-80.4, -3.4], [-81.3, -4.7], [-79.4, -7.7],
    [-77.0, -11.9], [-75.2, -14.9], [-72.5, -17.3], [-70.9, -19.5],
    [-70.3, -23.6], [-70.8, -27.0], [-71.6, -30.3], [-72.9, -35.6],
    [-73.6, -39.5], [-73.0, -41.0],
    [-62.0, -41.0], [-62.4, -38.8], [-57.5, -38.0], [-56.6, -36.4],
    [-53.4, -33.7], [-51.1, -30.1], [-48.6, -26.9], [-48.6, -25.4],
    [-45.0, -23.8], [-41.9, -22.9], [-39.7, -19.6], [-38.9, -16.4],
    [-37.1, -11.3], [-35.2, -8.2], [-34.8, -6.9], [-36.4, -5.1],
    [-38.5, -3.7], [-41.8, -2.8], [-44.3, -2.5], [-47.5, -0.6],
    [-50.0, 0.2], [-51.1, 3.9], [-52.6, 5.0], [-54.4, 5.9],
    [-56.5, 5.9], [-58.1, 6.8], [-60.0, 8.6], [-61.9, 10.7],
    [-64.5, 10.2], [-66.5, 10.6], [-68.4, 11.2], [-70.2, 12.2],
    [-71.6, 12.5], [-72.9, 11.7], [-74.9, 11.1], [-76.3, 8.9],
    [-77.4, 8.6], [-79.0, 8.9]
  ];

  /* Fronteira do BRASIL - a divisa que mais importa aqui. */
  const BRASIL = [
    [-57.6, -30.2], [-53.4, -33.7], [-51.1, -30.1], [-48.6, -26.9],
    [-48.6, -25.4], [-45.0, -23.8], [-41.9, -22.9], [-39.7, -19.6],
    [-38.9, -16.4], [-37.1, -11.3], [-35.2, -8.2], [-34.8, -6.9],
    [-36.4, -5.1], [-38.5, -3.7], [-41.8, -2.8], [-44.3, -2.5],
    [-47.5, -0.6], [-50.0, 0.2], [-51.1, 3.9], [-52.6, 5.0],
    [-54.4, 5.9], [-56.5, 5.9], [-58.1, 6.8], [-59.8, 5.2],
    [-60.7, 4.6], [-62.1, 4.1], [-63.4, 3.9], [-64.5, 2.2],
    [-65.5, 1.0], [-67.3, 2.0], [-69.8, 1.1], [-69.5, -1.0],
    [-70.0, -4.4], [-72.9, -7.1], [-73.8, -9.5], [-70.5, -11.0],
    [-65.3, -11.0], [-64.4, -13.5], [-60.4, -16.3], [-58.2, -19.8],
    [-57.8, -22.0], [-55.0, -24.0], [-54.3, -25.6], [-54.6, -27.5],
    [-56.0, -28.9], [-57.6, -30.2]
  ];

  /* Fronteiras dos vizinhos, como linhas abertas (nao poligonos fechados).
     So o traco necessario para o olho reconhecer o pais. */
  const FRONTEIRAS = [
    /* Chile x Argentina (cordilheira) */
    [[-70.0, -18.3], [-68.5, -22.0], [-69.0, -27.0], [-70.0, -31.0],
     [-70.4, -35.0], [-71.2, -39.0], [-71.8, -41.0]],
    /* Bolivia: norte, leste e sul */
    [[-69.6, -10.9], [-65.3, -11.0], [-64.4, -13.5], [-60.4, -16.3],
     [-58.2, -19.8], [-57.8, -22.0], [-62.8, -22.0], [-66.3, -22.0],
     [-68.5, -22.0]],
    /* Bolivia x Peru/Chile (oeste) */
    [[-69.6, -10.9], [-69.0, -14.0], [-69.5, -17.5], [-70.0, -18.3]],
    /* Paraguai */
    [[-57.8, -22.0], [-55.0, -24.0], [-54.3, -25.6], [-54.6, -27.5],
     [-58.2, -27.3], [-58.6, -25.0], [-57.8, -22.0]],
    /* Uruguai */
    [[-57.6, -30.2], [-53.4, -33.7], [-55.0, -34.9], [-58.4, -33.9],
     [-58.0, -32.0], [-57.6, -30.2]],
    /* Peru x Equador/Colombia */
    [[-80.4, -3.4], [-77.5, -2.5], [-75.0, -1.0], [-72.9, -2.2],
     [-70.0, -4.4]]
  ];

  /* Divisas dos estados brasileiros. Traco grosseiro de proposito: o objetivo
     e situar "isso e Sao Paulo, isso e Minas", nao medir area. */
  const ESTADOS = [
    /* PR x SC */
    [[-54.2, -26.0], [-51.5, -26.2], [-49.5, -26.2], [-48.6, -25.9]],
    /* SC x RS */
    [[-53.8, -27.2], [-51.5, -28.4], [-49.7, -29.3]],
    /* PR x SP */
    [[-53.9, -23.0], [-51.0, -23.3], [-48.5, -23.9], [-46.5, -24.2]],
    /* SP x MG */
    [[-53.1, -20.1], [-50.0, -20.2], [-47.0, -20.5], [-44.5, -22.0],
     [-44.0, -22.6]],
    /* MG x GO/MS */
    [[-53.1, -20.1], [-51.0, -18.0], [-49.5, -18.5], [-47.5, -18.0],
     [-46.0, -16.0]],
    /* GO x MS/MT */
    [[-53.2, -18.0], [-51.5, -17.5], [-50.0, -16.0], [-48.0, -13.5]],
    /* MS x MT */
    [[-58.2, -17.9], [-55.0, -17.9], [-52.5, -18.0]],
    /* MG x BA/ES */
    [[-46.0, -16.0], [-43.0, -14.5], [-40.0, -15.5], [-40.9, -18.0],
     [-41.9, -20.8]],
    /* MG x RJ e RJ x SP */
    [[-44.0, -22.6], [-42.5, -22.0], [-41.0, -21.5]],
    [[-44.7, -23.4], [-44.0, -22.6]],
    /* ES */
    [[-41.9, -20.8], [-40.9, -18.0]],
    /* BA x GO/TO */
    [[-46.0, -16.0], [-46.4, -12.5], [-45.9, -10.0], [-43.5, -9.5]],
    /* TO x MA/PI */
    [[-48.0, -13.5], [-48.2, -9.0], [-47.5, -6.0], [-46.5, -5.5]],
    /* MT x PA/AM */
    [[-58.2, -17.9], [-58.4, -13.0], [-60.0, -12.0], [-60.4, -16.3]],
    [[-58.4, -13.0], [-55.0, -12.0], [-51.5, -12.0], [-50.5, -13.5]],
    /* PE/CE/RN - nordeste, so para o contorno nao ficar vazio */
    [[-41.0, -8.5], [-38.0, -8.2], [-35.5, -8.5]],
    [[-41.0, -4.5], [-38.5, -4.0], [-36.5, -5.2]]
  ];

  function projetar(lon, lat, w, h) {
    return [
      ((lon - LON0) / (LON1 - LON0)) * w,
      ((LAT1 - lat) / (LAT1 - LAT0)) * h
    ];
  }

  function traco(pontos, w, h, fechar) {
    return pontos.map(function (p, i) {
      const xy = projetar(p[0], p[1], w, h);
      return (i ? "L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
    }).join(" ") + (fechar ? " Z" : "");
  }

  function raio(qtd, maxQtd) {
    const base = 14;
    if (!maxQtd || maxQtd <= 1) return base;
    return base + 12 * Math.sqrt(Math.min(qtd, maxQtd) / maxQtd);
  }

  /**
   * Coloca os rotulos numa COLUNA lateral, sem sobrepor, e devolve para cada
   * um a posicao final. O pino fica onde a geografia manda; so o texto se
   * afasta - e a linha de chamada mantem a ligacao visivel.
   */
  function posicionarRotulos(itens, w, h) {
    const ALTURA = 21;                 /* espaco vertical minimo entre rotulos */
    const dir = [], esq = [];
    itens.forEach(function (it) {
      (it.x > w * 0.52 ? dir : esq).push(it);
    });

    function acomodar(lista, x, ancora) {
      lista.sort(function (a, b) { return a.y - b.y; });
      let ultimo = -Infinity;
      lista.forEach(function (it) {
        let y = Math.max(it.y, ultimo + ALTURA);
        y = Math.min(y, h - 8);
        ultimo = y;
        it.rx = x;
        it.ry = y;
        it.ancora = ancora;
      });
      /* se estourou embaixo, sobe o bloco inteiro mantendo o espacamento */
      const excesso = ultimo - (h - 8);
      if (excesso > 0) lista.forEach(function (it) { it.ry -= excesso; });
    }

    acomodar(dir, w - 6, "end");
    acomodar(esq, 6, "start");
    return itens;
  }

  /**
   * desenhar(pontos, opcoes) -> string com o <svg> pronto.
   * pontos: [{cidade, uf, lat, lon, qtd, porStatus}]
   */
  /* Duas paletas. O tema CLARO e o padrao no telao: sobre fundo preto as
     divisas de estado somem (foi o defeito da 1a versao) - no claro elas
     aparecem em cinza-escuro, como num mapa de papel. */
  const TEMAS = {
    claro: {
      fundo: "#EFEAE1", mar: "#DCD5C8", terra: "#F7F4EE", brasil: "#FFFDF9",
      contorno: "#8A8072", fronteira: "#6E6558", estado: "#B3A895",
      pino: "#F0800E", pinoBorda: "#7A3D00", pinoTexto: "#FFFFFF",
      rotulo: "#2A241D", halo: "#F7F4EE", chamada: "#8A8072"
    },
    escuro: {
      fundo: "none", mar: "#141110", terra: "#1b1613", brasil: "#221b16",
      contorno: "#4a4238", fronteira: "#5a5148", estado: "#3a332b",
      pino: "#F0800E", pinoBorda: "#1a1105", pinoTexto: "#1a1105",
      rotulo: "#F6F4F0", halo: "#0b0a09", chamada: "#5a5148"
    }
  };

  function desenhar(pontos, opcoes) {
    opcoes = opcoes || {};
    const w = opcoes.largura || 900;
    const h = opcoes.altura || 1000;
    const esc = opcoes.escape || function (s) { return s; };
    const maxRot = opcoes.maxRotulos || 8;
    const T = TEMAS[opcoes.tema === "escuro" ? "escuro" : "claro"];
    const maxQtd = pontos.reduce(function (a, p) { return Math.max(a, p.qtd); }, 0);

    const out = [];
    out.push('<svg viewBox="0 0 ' + w + " " + h + '" ' +
      'preserveAspectRatio="xMidYMid meet" class="mapa-sa">');
    out.push('<defs><marker id="setaMapa" viewBox="0 0 10 10" refX="9" refY="5" ' +
      'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + T.chamada + '"/></marker></defs>');

    if (T.fundo !== "none") {
      out.push('<rect x="0" y="0" width="' + w + '" height="' + h +
        '" rx="14" fill="' + T.mar + '"/>');
    }

    /* --- geografia --- */
    out.push('<path d="' + traco(CONTORNO, w, h, true) + '" ' +
      'fill="' + T.terra + '" stroke="' + T.contorno + '" stroke-width="2.2"/>');
    out.push('<path d="' + traco(BRASIL, w, h, true) + '" ' +
      'fill="' + T.brasil + '" stroke="' + T.contorno + '" stroke-width="2"/>');
    FRONTEIRAS.forEach(function (f) {
      out.push('<path d="' + traco(f, w, h, false) + '" fill="none" ' +
        'stroke="' + T.fronteira + '" stroke-width="1.4" stroke-dasharray="6 4"/>');
    });
    ESTADOS.forEach(function (e) {
      out.push('<path d="' + traco(e, w, h, false) + '" fill="none" ' +
        'stroke="' + T.estado + '" stroke-width="1.1"/>');
    });

    /* --- prepara os pinos --- */
    const itens = pontos.map(function (p) {
      const xy = projetar(p.lon, p.lat, w, h);
      return { p: p, x: xy[0], y: xy[1], r: raio(p.qtd, maxQtd) };
    });

    /* rotulo so nos maiores; a lista ao lado do mapa nomeia todas as cidades */
    const rotulados = itens.slice()
      .sort(function (a, b) { return b.p.qtd - a.p.qtd; })
      .slice(0, maxRot);
    posicionarRotulos(rotulados, w, h);

    /* --- linhas de chamada primeiro, para ficarem ATRAS dos pinos --- */
    rotulados.forEach(function (it) {
      const alvoX = it.ancora === "end" ? it.rx - 4 : it.rx + 4;
      out.push('<path d="M' + it.x.toFixed(1) + " " + it.y.toFixed(1) +
        " L" + alvoX.toFixed(1) + " " + (it.ry - 4).toFixed(1) +
        '" fill="none" stroke="' + T.chamada + '" stroke-width="1.2" ' +
        'marker-end="url(#setaMapa)"/>');
    });

    /* --- pinos: menores primeiro, maior por cima --- */
    itens.slice().sort(function (a, b) { return a.p.qtd - b.p.qtd; })
      .forEach(function (it) {
        const fonte = Math.max(13, it.r * 0.95);
        out.push('<circle cx="' + it.x.toFixed(1) + '" cy="' + it.y.toFixed(1) +
          '" r="' + (it.r + 4).toFixed(1) + '" fill="rgba(240,128,14,.22)"/>');
        out.push('<circle cx="' + it.x.toFixed(1) + '" cy="' + it.y.toFixed(1) +
          '" r="' + it.r.toFixed(1) + '" fill="' + T.pino + '" ' +
          'stroke="' + T.pinoBorda + '" stroke-width="2"/>');
        out.push('<text x="' + it.x.toFixed(1) + '" y="' +
          (it.y + fonte * 0.35).toFixed(1) + '" text-anchor="middle" ' +
          'font-size="' + fonte.toFixed(0) + '" font-weight="800" ' +
          'fill="' + T.pinoTexto + '">' + it.p.qtd + "</text>");
      });

    /* --- rotulos por ultimo, sempre legiveis --- */
    rotulados.forEach(function (it) {
      out.push('<text x="' + it.rx.toFixed(1) + '" y="' + it.ry.toFixed(1) +
        '" text-anchor="' + it.ancora + '" font-size="16" font-weight="800" ' +
        'fill="' + T.rotulo + '" stroke="' + T.halo + '" stroke-width="4" ' +
        'paint-order="stroke">' + esc(it.p.cidade) + "/" + esc(it.p.uf) +
        ' <tspan fill="#C4650A">' + it.p.qtd + "</tspan></text>");
    });

    out.push("</svg>");
    return out.join("");
  }

  global.OTD_MAPA = { desenhar: desenhar, projetar: projetar };
})(window);
