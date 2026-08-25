/* ===========================================================================
   MAPA DA AMERICA DO SUL - OTD LOGISTICS
   mapa_sa.js - desenha o contorno do continente e os pinos de caminhao.

   Por que SVG desenhado a mao e nao uma biblioteca de mapa: o telao roda num
   Raspberry sem internet garantida, e qualquer mapa de tiles (Leaflet, Google)
   depende de rede. O contorno abaixo e uma silhueta SIMPLIFICADA, boa o
   suficiente para responder "onde esta a frota" a 3 metros de distancia - nao
   e cartografia. O Brasil vem com mais detalhe porque e onde a frota opera.

   Projecao equirretangular simples (lat/lon direto para x/y). Nessa latitude a
   distorcao e pequena e o codigo fica legivel.
   =========================================================================== */
(function (global) {
  "use strict";

  /* Janela: America do Sul ate o norte da Patagonia. Cortar abaixo de -40
     tira so deserto onde a frota nunca vai, e faz o cluster do Sudeste
     ocupar um terco a mais da tela. */
  const LON0 = -82, LON1 = -33, LAT0 = -41, LAT1 = 13;

  /* Silhueta da AMERICA DO SUL (lon,lat), no sentido horario a partir do
     extremo noroeste. E uma simplificacao de proposito - o telao precisa de
     uma forma reconhecivel a 3 metros, nao de cartografia. */
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

  /* BRASIL por dentro, para dar referencia de fronteira. */
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

  function projetar(lon, lat, w, h) {
    return [
      ((lon - LON0) / (LON1 - LON0)) * w,
      ((LAT1 - lat) / (LAT1 - LAT0)) * h
    ];
  }

  function caminho(pontos, w, h) {
    return pontos.map(function (p, i) {
      const xy = projetar(p[0], p[1], w, h);
      return (i ? "L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
    }).join(" ") + " Z";
  }

  /* Raio do pino cresce com a quantidade, mas com teto - senao um ponto com
     30 caminhoes cobre metade do mapa. */
  function raio(qtd, maxQtd) {
    const base = 15;
    if (!maxQtd || maxQtd <= 1) return base;
    return base + 13 * Math.sqrt(Math.min(qtd, maxQtd) / maxQtd);
  }

  /**
   * desenhar(pontos, opcoes) -> string com o <svg> pronto.
   * pontos: [{cidade, uf, lat, lon, qtd, porStatus}]
   */
  function desenhar(pontos, opcoes) {
    opcoes = opcoes || {};
    const w = opcoes.largura || 900;
    const h = opcoes.altura || 1000;
    const esc = opcoes.escape || function (s) { return s; };
    const maxQtd = pontos.reduce(function (a, p) { return Math.max(a, p.qtd); }, 0);

    const partes = [];
    partes.push('<svg viewBox="0 0 ' + w + " " + h + '" ' +
      'preserveAspectRatio="xMidYMid meet" class="mapa-sa">');
    partes.push('<path d="' + caminho(CONTORNO, w, h) + '" ' +
      'fill="#141110" stroke="#2b2620" stroke-width="2"/>');
    partes.push('<path d="' + caminho(BRASIL, w, h) + '" ' +
      'fill="#1b1613" stroke="#3a332b" stroke-width="1.5"/>');

    /* quais pinos ganham rotulo no desenho: so os maiores. A lista ao lado do
       mapa nomeia TODAS as cidades, entao rotulo demais aqui so vira borrao. */
    const comRotulo = new Set(
      pontos.slice().sort(function (a, b) { return b.qtd - a.qtd; })
        .slice(0, opcoes.maxRotulos || 5)
        .map(function (p) { return p.cidade + "|" + p.uf; }));
    let alterna = 0;

    /* pinos: os menores primeiro, para o maior ficar por cima e legivel */
    pontos.slice().sort(function (a, b) { return a.qtd - b.qtd; })
      .forEach(function (p) {
        const xy = projetar(p.lon, p.lat, w, h);
        const r = raio(p.qtd, maxQtd);
        const fonte = Math.max(13, r * 0.95);
        partes.push('<g class="pino">');
        partes.push('<circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) +
          '" r="' + (r + 4).toFixed(1) + '" fill="rgba(240,128,14,.18)"/>');
        partes.push('<circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) +
          '" r="' + r.toFixed(1) + '" fill="#F0800E" stroke="#1a1105" stroke-width="2"/>');
        partes.push('<text x="' + xy[0].toFixed(1) + '" y="' +
          (xy[1] + fonte * 0.35).toFixed(1) + '" text-anchor="middle" ' +
          'font-size="' + fonte.toFixed(0) + '" font-weight="800" fill="#1a1105">' +
          p.qtd + "</text>");
        /* rotulo so nos maiores: no telao, texto miudo sobreposto e pior que
           texto nenhum - a lista ao lado ja nomeia todas as cidades */
        if (comRotulo.has(p.cidade + "|" + p.uf)) {
          /* alterna acima/abaixo: no Sudeste as cidades ficam a poucos pixels
             uma da outra e os rotulos se cobriam */
          const acima = (alterna++ % 2) === 0;
          partes.push('<text x="' + xy[0].toFixed(1) + '" y="' +
            (acima ? xy[1] - r - 9 : xy[1] + r + 19).toFixed(1) +
            '" text-anchor="middle" font-size="15" font-weight="800" ' +
            'fill="#F6F4F0" stroke="#0b0a09" stroke-width="3" ' +
            'paint-order="stroke">' + esc(p.cidade) + "/" + esc(p.uf) + "</text>");
        }
        partes.push("</g>");
      });

    partes.push("</svg>");
    return partes.join("");
  }

  global.OTD_MAPA = { desenhar: desenhar, projetar: projetar };
})(window);
