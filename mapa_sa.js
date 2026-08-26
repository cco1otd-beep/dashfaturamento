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

  /* A geometria vem do mapa_geo.js (costa GSHHS + fronteiras e divisas
     estaduais WDB), gerado por gerar_mapa_geo.py. A 1a e a 2a versao usavam
     poligonos tracados a mao e ficavam com cara de esquema, nao de mapa. */
  function GEO() { return global.OTD_GEO || { costa: [], paises: [], estados: [] }; }

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

    /* --- geografia real --- */
    const geo = GEO();
    /* a costa vem como poligonos fechados: preenche a terra de uma vez */
    const terra = geo.costa.map(function (c) { return traco(c, w, h, true); }).join(" ");
    if (terra) {
      out.push('<path d="' + terra + '" fill="' + T.terra + '" ' +
        'stroke="' + T.contorno + '" stroke-width="1.4" fill-rule="evenodd"/>');
    }
    geo.estados.forEach(function (e) {
      out.push('<path d="' + traco(e, w, h, false) + '" fill="none" ' +
        'stroke="' + T.estado + '" stroke-width="0.9"/>');
    });
    geo.paises.forEach(function (f) {
      out.push('<path d="' + traco(f, w, h, false) + '" fill="none" ' +
        'stroke="' + T.fronteira + '" stroke-width="1.5"/>');
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
