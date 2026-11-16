// Kartengruß: zeichnet eine Postkarte aus Kartendaten auf ein Canvas.
// Alle Maße hängen von der Kartengröße ab, daher sieht Vorschau und Export gleich aus.
(function () {
  const KG = (window.KG = window.KG || {});

  KG.PALETTEN = {
    fjord:    { name: "Fjord",      paper: "#eef2f1", ink: "#1e2a33", water: "#8db3c8", green: "#bccfb4", nacht: "#0d1620", acc: ["#1f4e79", "#d9822b", "#c8553d", "#2a7f62"] },
    bauhaus:  { name: "Bauhaus",    paper: "#f0ebe0", ink: "#141414", water: "#2b59c3", green: "#cdc6a8", nacht: "#141414", acc: ["#d7263d", "#f4b90d", "#2b59c3", "#141414"] },
    abendrot: { name: "Abendrot",   paper: "#2a1c2e", ink: "#f7d9bd", water: "#3d4b7c", green: "#43354a", nacht: "#1a1020", acc: ["#ff7b54", "#ffb26b", "#ffd56b", "#e84a5f"] },
    neon:     { name: "Neon",       paper: "#0b0f1a", ink: "#cfd8ff", water: "#11335c", green: "#10251d", nacht: "#070a12", acc: ["#4cc9f0", "#f72585", "#b5179e", "#80ffdb"] },
    pastell:  { name: "Pastell",    paper: "#fbf7f3", ink: "#4a4453", water: "#a9d6e5", green: "#d3e8cd", nacht: "#2b2733", acc: ["#f4a6a6", "#f3c87a", "#94bde0", "#b8a1d9"] },
    wald:     { name: "Wald",       paper: "#e8ece3", ink: "#203027", water: "#6d9b8c", green: "#a3b78d", nacht: "#101a14", acc: ["#2f5d50", "#b5651d", "#e0a458", "#7a9e7e"] },
    tinte:    { name: "Tinte",      paper: "#ffffff", ink: "#0a0a0a", water: "#d4d8dc", green: "#eceeea", nacht: "#0a0a0a", acc: ["#0a0a0a", "#3b3b3b", "#7a7a7a", "#b5b5b5"] },
  };

  KG.STILE = {
    linien: "Linien",
    leuchten: "Leuchten",
    punkte: "Punkte",
    bauhaus: "Bauhaus",
    ausrichtung: "Ausrichtung",
  };

  KG.FORMATE = {
    quer:    { name: "Postkarte quer", w: 148, h: 105, px: [1748, 1240] },
    hoch:    { name: "Postkarte hoch", w: 105, h: 148, px: [1240, 1748] },
    quadrat: { name: "Quadrat",        w: 1,   h: 1,   px: [1800, 1800] },
    poster:  { name: "Poster A4",      w: 210, h: 297, px: [2480, 3508] },
  };

  KG.SCHRIFT = { anzeige: '"Bricolage Grotesque", "Avenir Next", system-ui, sans-serif', mono: '"DM Mono", ui-monospace, Menlo, monospace' };

  // Strichstärken je Straßenklasse (Anteil der kurzen Kartenseite)
  const BREITE = [0.0058, 0.005, 0.0044, 0.0036, 0.0029, 0.0019, 0.0012, 0.0008];

  // ---------- Hilfen ----------

  function wertRauschen(seed) {
    const h = (x, y) => {
      let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mische(a, b, t) {
    const x = hexRgb(a), y = hexRgb(b);
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
  }
  function verlauf(farben, t) {
    t = ((t % 1) + 1) % 1;
    const n = farben.length, f = t * n, i = Math.floor(f);
    return mische(farben[i % n], farben[(i + 1) % n], f - i);
  }
  function rgba(h, a) {
    const [r, g, b] = hexRgb(h);
    return `rgba(${r},${g},${b},${a})`;
  }

  function pfad(ctx, p, T, zu) {
    ctx.moveTo(T.cx + p[0] * T.s, T.cy + p[1] * T.s);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(T.cx + p[i] * T.s, T.cy + p[i + 1] * T.s);
    if (zu) ctx.closePath();
  }
  function flaechen(ctx, liste, T, farbe) {
    ctx.beginPath();
    for (const ringe of liste) for (const r of ringe) pfad(ctx, r, T, true);
    ctx.fillStyle = farbe;
    ctx.fill("evenodd");
  }
  function linien(ctx, liste, T, farbe, breite) {
    ctx.beginPath();
    for (const p of liste) pfad(ctx, p, T, false);
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    ctx.stroke();
  }
  function strassen(ctx, d, T, farbeFn, faktor = 1) {
    for (let k = 7; k >= 0; k--) {
      const auswahl = d.roads.filter((r) => r.c === k).map((r) => r.p);
      if (auswahl.length) linien(ctx, auswahl, T, farbeFn(k), BREITE[k] * T.u * faktor);
    }
  }
  function fluesse(ctx, d, T, farbe) {
    for (const w of d.waterways) linien(ctx, [w.p], T, farbe, Math.max(w.w * T.s, T.u * 0.0015));
  }
  function haeuser(ctx, d, T, farbe) {
    ctx.beginPath();
    for (const b of d.buildings) {
      if (b.p) pfad(ctx, b.p, T, true);
      else {
        const r = Math.max(Math.sqrt(b.a) * 0.5 * T.s, 0.5);
        ctx.rect(T.cx + b.x * T.s - r, T.cy + b.y * T.s - r, 2 * r, 2 * r);
      }
    }
    ctx.fillStyle = farbe;
    ctx.fill();
  }

  // Zeichnet Flächen in eine kleine Maske und liefert eine Abfragefunktion (schneller als isPointInPath).
  function maske(liste, T, box) {
    const f = 0.5;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(box.aw * f));
    c.height = Math.max(1, Math.ceil(box.ah * f));
    const x = c.getContext("2d", { willReadFrequently: true });
    x.setTransform(f, 0, 0, f, -box.ax * f, -box.ay * f);
    flaechen(x, liste, T, "#000");
    const px = x.getImageData(0, 0, c.width, c.height).data;
    return (sx, sy) => {
      const i = Math.floor((sx - box.ax) * f), j = Math.floor((sy - box.ay) * f);
      if (i < 0 || j < 0 || i >= c.width || j >= c.height) return false;
      return px[(j * c.width + i) * 4 + 3] > 128;
    };
  }

  // ---------- Stile ----------

  const ZEICHNER = {
    linien(ctx, d, pal, T, R) {
      flaechen(ctx, d.green, T, rgba(pal.green, 0.7));
      flaechen(ctx, d.water, T, pal.water);
      fluesse(ctx, d, T, pal.water);
      haeuser(ctx, d, T, rgba(pal.ink, 0.08));
      ctx.setLineDash([T.u * 0.004, T.u * 0.003]);
      linien(ctx, d.rails, T, rgba(pal.ink, 0.55), T.u * 0.0014);
      ctx.setLineDash([]);
      const akzent = pal.acc[Math.floor(R() * pal.acc.length)];
      strassen(ctx, d, T, (k) => (k <= 2 ? akzent : pal.ink));
    },

    leuchten(ctx, d, pal, T, R, box) {
      ctx.fillStyle = pal.nacht;
      ctx.fillRect(box.ax, box.ay, box.aw, box.ah);
      flaechen(ctx, d.water, T, rgba(pal.water, 0.45));
      fluesse(ctx, d, T, rgba(pal.water, 0.6));
      const versatz = R(), stufen = 14;
      const eimer = Array.from({ length: stufen }, () => []);
      for (const r of d.roads) {
        const mx = r.p[0] + r.p[r.p.length - 2], my = r.p[1] + r.p[r.p.length - 1];
        const t = Math.min(0.999, Math.hypot(mx, my) / 2 / d.radius);
        eimer[Math.floor(t * stufen)].push(r);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      eimer.forEach((liste, i) => {
        if (!liste.length) return;
        const farbe = verlauf(pal.acc, versatz + (i / stufen) * 0.8);
        for (let k = 7; k >= 0; k--) {
          const ps = liste.filter((r) => r.c === k).map((r) => r.p);
          if (!ps.length) continue;
          ctx.globalAlpha = 0.14;
          linien(ctx, ps, T, farbe, BREITE[k] * T.u * 3.2);
          ctx.globalAlpha = 0.95;
          linien(ctx, ps, T, farbe, BREITE[k] * T.u * 0.75);
        }
      });
      ctx.globalAlpha = 0.6;
      linien(ctx, d.rails, T, pal.ink, T.u * 0.001);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },

    punkte(ctx, d, pal, T, R, box, seed) {
      const n = wertRauschen(seed);
      const schritt = T.u * 0.0085;
      // Wasser und Grün als Punktraster
      for (const [liste, farbe, dichte] of [[d.water, pal.water, 1], [d.green, pal.green, 0.55]]) {
        if (!liste.length) continue;
        const drin = maske(liste, T, box);
        ctx.beginPath();
        for (let y = box.ay; y < box.ay + box.ah; y += schritt) {
          for (let x = box.ax; x < box.ax + box.aw; x += schritt) {
            const jx = x + (R() - 0.5) * schritt * 0.6, jy = y + (R() - 0.5) * schritt * 0.6;
            if (R() > dichte || !drin(jx, jy)) continue;
            const r = schritt * (0.22 + R() * 0.14);
            ctx.moveTo(jx + r, jy);
            ctx.arc(jx, jy, r, 0, Math.PI * 2);
          }
        }
        ctx.fillStyle = farbe;
        ctx.fill();
      }
      ctx.globalAlpha = 0.28;
      strassen(ctx, d, T, () => pal.ink, 0.5);
      ctx.globalAlpha = 1;
      // Häuser als farbige Punkte, Farbe folgt einem Rauschfeld
      const pfade = pal.acc.map(() => new Path2D());
      const quellen = d.buildings.length ? d.buildings : d.roads.flatMap((r) => {
        const out = [];
        for (let i = 0; i < r.p.length; i += 6) out.push({ x: r.p[i], y: r.p[i + 1], a: 60 });
        return out;
      });
      for (const b of quellen) {
        const sx = T.cx + b.x * T.s, sy = T.cy + b.y * T.s;
        if (sx < box.ax - 20 || sy < box.ay - 20 || sx > box.ax + box.aw + 20 || sy > box.ay + box.ah + 20) continue;
        const r = Math.max(Math.min(Math.sqrt(b.a) * 0.42 * T.s, T.u * 0.012), T.u * 0.0013);
        const w = n(b.x / 260, b.y / 260) * 1.6 + n(b.x / 60 + 99, b.y / 60) * 0.5;
        const i = Math.floor(w * pal.acc.length) % pal.acc.length;
        pfade[i].moveTo(sx + r, sy);
        pfade[i].arc(sx, sy, r, 0, Math.PI * 2);
      }
      pfade.forEach((p, i) => { ctx.fillStyle = pal.acc[i]; ctx.fill(p); });
    },

    bauhaus(ctx, d, pal, T, R, box) {
      // ein großer Kreis als Hintergrundform
      const kr = Math.min(box.aw, box.ah) * (0.22 + R() * 0.12);
      ctx.beginPath();
      ctx.arc(box.ax + box.aw * (0.25 + R() * 0.5), box.ay + box.ah * (0.25 + R() * 0.5), kr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pal.acc[Math.floor(R() * 3)], 0.9);
      ctx.fill();
      flaechen(ctx, d.green, T, rgba(pal.green, 0.8));
      flaechen(ctx, d.water, T, pal.water);
      fluesse(ctx, d, T, pal.water);
      const farben = [rgba(pal.ink, 0.13), pal.ink, ...pal.acc];
      const gewicht = [0.5, 0.08, 0.12, 0.12, 0.12, 0.06];
      const pfade = farben.map(() => new Path2D());
      for (const b of d.buildings) {
        let z = R(), i = 0;
        while (i < gewicht.length - 1 && (z -= gewicht[i]) > 0) i++;
        const p = pfade[i];
        if (b.p) {
          p.moveTo(T.cx + b.p[0] * T.s, T.cy + b.p[1] * T.s);
          for (let j = 2; j < b.p.length; j += 2) p.lineTo(T.cx + b.p[j] * T.s, T.cy + b.p[j + 1] * T.s);
          p.closePath();
        } else {
          const r = Math.max(Math.sqrt(b.a) * 0.5 * T.s, 0.6);
          p.rect(T.cx + b.x * T.s - r, T.cy + b.y * T.s - r, 2 * r, 2 * r);
        }
      }
      pfade.forEach((p, i) => {
        ctx.fillStyle = farben[i];
        ctx.fill(p);
        ctx.strokeStyle = pal.paper;
        ctx.lineWidth = T.u * 0.0006;
        ctx.stroke(p);
      });
      ctx.lineCap = "butt";
      strassen(ctx, d, T, () => pal.ink, 0.9);
      linien(ctx, d.rails, T, pal.ink, T.u * 0.002);
    },

    ausrichtung(ctx, d, pal, T, R, box) {
      flaechen(ctx, d.water, T, rgba(pal.water, 0.55));
      fluesse(ctx, d, T, rgba(pal.water, 0.7));
      const stufen = 36, versatz = R();
      const eimer = Array.from({ length: stufen }, () => Array.from({ length: 8 }, () => new Path2D()));
      const laenge = new Float64Array(stufen);
      for (const r of d.roads) {
        const p = r.p;
        for (let i = 2; i < p.length; i += 2) {
          const dx = p[i] - p[i - 2], dy = p[i + 1] - p[i - 1], l = Math.hypot(dx, dy);
          if (l < 0.01) continue;
          let w = Math.atan2(dx, -dy); // Richtung, 0 = Nord
          w = ((w % Math.PI) + Math.PI) % Math.PI;
          const b = Math.min(stufen - 1, Math.floor((w / Math.PI) * stufen));
          laenge[b] += l * (r.c <= 5 ? 1 : 0.4);
          const pf = eimer[b][r.c];
          pf.moveTo(T.cx + p[i - 2] * T.s, T.cy + p[i - 1] * T.s);
          pf.lineTo(T.cx + p[i] * T.s, T.cy + p[i + 1] * T.s);
        }
      }
      const farbe = (b) => verlauf(pal.acc, versatz + b / stufen);
      ctx.lineCap = "round";
      for (let k = 7; k >= 0; k--) {
        for (let b = 0; b < stufen; b++) {
          ctx.strokeStyle = farbe(b);
          ctx.lineWidth = BREITE[k] * T.u;
          ctx.stroke(eimer[b][k]);
        }
      }
      T.rose = { laenge, farbe };
    },
  };

  // Windrose: Verteilung der Straßenrichtungen
  function rose(ctx, pal, box, u, info) {
    const rr = Math.min(box.aw, box.ah) * 0.13;
    const cx = box.ax + box.aw - rr * 1.25, cy = box.ay + rr * 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.paper, 0.92);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.ink, 0.35);
    ctx.lineWidth = u * 0.0012;
    ctx.stroke();
    const max = Math.max(...info.laenge) || 1, n = info.laenge.length, sw = Math.PI / n;
    for (let b = 0; b < n; b++) {
      const l = Math.sqrt(info.laenge[b] / max) * rr;
      for (const halb of [0, Math.PI]) {
        const a = b * sw + halb - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, l, a, a + sw * 0.92);
        ctx.closePath();
        ctx.fillStyle = info.farbe(b);
        ctx.fill();
      }
    }
    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${rr * 0.2}px ${KG.SCHRIFT.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("N", cx, cy - rr * 1.14);
  }

  // ---------- Text ----------

  function gesperrt(ctx, text, x, y, abstand, ausrichtung) {
    const breiten = [...text].map((c) => ctx.measureText(c).width);
    const gesamt = breiten.reduce((a, b) => a + b, 0) + abstand * (breiten.length - 1);
    let px = ausrichtung === "right" ? x - gesamt : x;
    ctx.textAlign = "left";
    [...text].forEach((c, i) => { ctx.fillText(c, px, y); px += breiten[i] + abstand; });
  }

  KG.koordinaten = function (ort) {
    if (ort.fantasie) return ["Fantasieort", "Nr. " + ort.seed];
    const f = (v, p, n) => Math.abs(v).toFixed(4).replace(".", ",") + "° " + (v >= 0 ? p : n);
    return [f(ort.lat, "N", "S"), f(ort.lon, "O", "W")];
  };

  function titelband(ctx, o, pal, W, H, m, band, u) {
    const y0 = H - m - band;
    const klein = band * 0.13;
    ctx.fillStyle = rgba(pal.ink, 0.65);
    ctx.font = `600 ${klein}px ${KG.SCHRIFT.mono}`;
    ctx.textBaseline = "alphabetic";
    gesperrt(ctx, o.gruss, m, y0 + band * 0.36, klein * 0.35);
    let gr = band * 0.46;
    ctx.font = `700 ${gr}px ${KG.SCHRIFT.anzeige}`;
    while (ctx.measureText(o.titel).width > (W - 2 * m) * 0.66 && gr > band * 0.18) {
      gr *= 0.94;
      ctx.font = `700 ${gr}px ${KG.SCHRIFT.anzeige}`;
    }
    ctx.fillStyle = pal.ink;
    ctx.textAlign = "left";
    ctx.fillText(o.titel, m - gr * 0.04, y0 + band * 0.36 + gr * 1.02);
    const [a, b] = KG.koordinaten(o.ort);
    const kg = band * 0.12;
    ctx.font = `400 ${kg}px ${KG.SCHRIFT.mono}`;
    ctx.fillStyle = rgba(pal.ink, 0.75);
    ctx.textAlign = "right";
    ctx.fillText(a, W - m, y0 + band * 0.62);
    ctx.fillText(b, W - m, y0 + band * 0.62 + kg * 1.35);
  }

  function bogentext(ctx, text, cx, cy, r, mitte, oben) {
    const zeichen = [...text];
    const br = zeichen.map((c) => ctx.measureText(c).width + ctx.measureText("M").width * 0.12);
    const gesamt = br.reduce((a, b) => a + b, 0) / r;
    let a = mitte - (oben ? 1 : -1) * gesamt / 2;
    zeichen.forEach((c, i) => {
      const w = br[i] / r;
      a += (oben ? 1 : -1) * w / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a + (oben ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillText(c, 0, 0);
      ctx.restore();
      a += (oben ? 1 : -1) * w / 2;
    });
  }

  function stempel(ctx, o, pal, W, m, u, R) {
    const rs = u * 0.12;
    const cx = W - m - rs * 1.15, cy = m + rs * 1.15;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((R() - 0.5) * 0.35);
    ctx.globalAlpha = 0.86;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    // Wellenlinien links vom Stempel
    ctx.lineWidth = u * 0.0026;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      for (let x = -rs * 3.4; x <= -rs * 1.08; x += rs * 0.05) {
        const y = i * rs * 0.24 + Math.sin(x / (rs * 0.22)) * rs * 0.06;
        x === -rs * 3.4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, rs, 0, Math.PI * 2);
    ctx.lineWidth = u * 0.0042;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rs * 0.6, 0, Math.PI * 2);
    ctx.lineWidth = u * 0.0018;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fs = rs * 0.21;
    const name = o.titel.toUpperCase();
    ctx.font = `700 ${fs}px ${KG.SCHRIFT.anzeige}`;
    while (ctx.measureText(name).width > rs * 2.4 && fs > rs * 0.11) {
      fs *= 0.93;
      ctx.font = `700 ${fs}px ${KG.SCHRIFT.anzeige}`;
    }
    bogentext(ctx, name, 0, 0, rs * 0.8, -Math.PI / 2, true);
    ctx.font = `500 ${rs * 0.15}px ${KG.SCHRIFT.mono}`;
    const [a, b] = KG.koordinaten(o.ort);
    bogentext(ctx, o.ort.fantasie ? a.toUpperCase() : a + "  " + b, 0, 0, rs * 0.8, Math.PI / 2, false);
    const h = new Date();
    const datum = [h.getDate(), h.getMonth() + 1, h.getFullYear() % 100].map((v) => String(v).padStart(2, "0")).join(".");
    ctx.font = `600 ${rs * 0.22}px ${KG.SCHRIFT.mono}`;
    ctx.fillText(datum, 0, -rs * 0.06);
    ctx.font = `500 ${rs * 0.14}px ${KG.SCHRIFT.mono}`;
    ctx.fillText(String(h.getHours()).padStart(2, "0") + " Uhr", 0, rs * 0.22);
    ctx.restore();
  }

  // ---------- Hauptfunktion ----------

  KG.zeichne = function (canvas, daten, o) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, u = Math.min(W, H);
    const pal = KG.PALETTEN[o.palette];
    const R = KG.rng(o.seed);
    const m = u * 0.055;
    const band = o.text === "titel" ? u * 0.17 : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, W, H);

    const box = { ax: m, ay: m, aw: W - 2 * m, ah: H - 2 * m - band };
    const kreis = o.form === "kreis";
    const kr = Math.min(box.aw, box.ah) / 2;
    const cx = box.ax + box.aw / 2, cy = box.ay + box.ah / 2;
    const s = (kreis ? kr : Math.hypot(box.aw, box.ah) / 2) / daten.radius;
    const T = { s, cx, cy, u };

    ctx.save();
    ctx.beginPath();
    if (kreis) ctx.arc(cx, cy, kr, 0, Math.PI * 2);
    else ctx.rect(box.ax, box.ay, box.aw, box.ah);
    ctx.clip();
    ZEICHNER[o.stil](ctx, daten, pal, T, R, box, o.seed);
    ctx.restore();

    ctx.lineCap = "round";
    if (kreis) {
      ctx.beginPath();
      ctx.arc(cx, cy, kr, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(pal.ink, 0.5);
      ctx.lineWidth = u * 0.0016;
      ctx.stroke();
    }
    if (T.rose) rose(ctx, pal, box, u, T.rose);
    if (o.text === "titel") titelband(ctx, o, pal, W, H, m, band, u);
    if (o.text === "stempel") stempel(ctx, o, pal, W, m, u, R);

    // Quellenangabe (Pflicht bei OSM-Daten)
    ctx.globalAlpha = 1;
    ctx.font = `400 ${u * 0.014}px ${KG.SCHRIFT.mono}`;
    ctx.fillStyle = rgba(pal.ink, 0.5);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(daten.fantasie ? "erfundener Ort · Kartengruß" : "Kartendaten © OpenStreetMap-Mitwirkende", W - m, H - m * 0.4);
  };
})();
