// Kartengruß: erzeugt erfundene Orte im selben Datenmodell wie echte OSM-Daten.
(function () {
  const KG = (window.KG = window.KG || {});

  // Kleiner, schneller Zufallsgenerator mit Startwert (mulberry32)
  KG.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const VOR = ["", "", "", "Neu-", "Alt-", "Groß-", "Klein-", "Bad "];
  const STAMM = ["Kranich", "Möwen", "Birken", "Eschen", "Lerchen", "Bernstein", "Sand", "Mühlen", "Fischer", "Reet", "Dünen", "Weiden", "Ottern", "Holunder"];
  const ENDE = ["feld", "hafen", "au", "burg", "dorf", "stedt", "wik", "ufer", "hagen", "brück", "siel", "heide"];

  KG.fantasieName = function (seed) {
    const r = KG.rng(seed ^ 0x5bd1e995);
    const pick = (l) => l[Math.floor(r() * l.length)];
    return pick(VOR) + pick(STAMM) + pick(ENDE);
  };

  KG.fantasie = function (seed, R) {
    const r = KG.rng(seed);
    const zw = (a, b) => a + r() * (b - a);
    const d = { radius: R, fantasie: true, roads: [], water: [], waterways: [], rails: [], green: [], buildings: [] };

    // Fluss: geschwungene Mittellinie quer durchs Bild
    const fw = zw(0, Math.PI), ux = Math.cos(fw), uy = Math.sin(fw), nx = -uy, ny = ux;
    const versatz = zw(-0.35, 0.35) * R, hb = zw(28, 70);
    const A1 = zw(0.08, 0.2) * R, f1 = zw(1.2, 2.6) / R, p1 = zw(0, 6.3);
    const A2 = zw(0.02, 0.06) * R, f2 = zw(4, 8) / R, p2 = zw(0, 6.3);
    const mitte = [];
    for (let t = -1.4 * R; t <= 1.4 * R; t += 15) {
      const o = versatz + A1 * Math.sin(t * f1 + p1) + A2 * Math.sin(t * f2 + p2);
      mitte.push([ux * t + nx * o, uy * t + ny * o]);
    }
    const links = [], rechts = [];
    for (const [x, y] of mitte) {
      links.push(x + nx * hb, y + ny * hb);
      rechts.unshift(x - nx * hb, y - ny * hb);
    }
    d.water.push([new Float32Array(links.concat(rechts))]);
    const flussAbstand = (x, y) => {
      let m = Infinity;
      for (let i = 0; i < mitte.length; i += 2) {
        const dx = mitte[i][0] - x, dy = mitte[i][1] - y, q = dx * dx + dy * dy;
        if (q < m) m = q;
      }
      return Math.sqrt(m);
    };
    const imWasser = (x, y, rand = 6) => flussAbstand(x, y) < hb + rand;

    // Parks: unregelmäßige Flecken
    const parks = [];
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const rr = zw(60, 170) * (R / 1000) ** 0.5;
      let px, py, versuch = 0;
      do { px = zw(-0.8, 0.8) * R; py = zw(-0.8, 0.8) * R; } while (imWasser(px, py, rr + 20) && ++versuch < 30);
      if (versuch >= 30) continue;
      const pts = [], ph = zw(0, 6.3);
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        const q = rr * (1 + 0.22 * Math.sin(3 * a + ph) + 0.1 * Math.sin(5 * a));
        pts.push(px + Math.cos(a) * q, py + Math.sin(a) * q);
      }
      d.green.push([new Float32Array(pts)]);
      parks.push([px, py, rr]);
    }
    const imPark = (x, y) => parks.some(([px, py, rr]) => (x - px) ** 2 + (y - py) ** 2 < (rr * 0.95) ** 2);

    // Ausfallstraßen
    const radial = [];
    const nr = 5 + Math.floor(r() * 4), start = zw(0, 6.3);
    for (let i = 0; i < nr; i++) {
      let a = start + (i / nr) * Math.PI * 2 + zw(-0.2, 0.2);
      let x = zw(-30, 30), y = zw(-30, 30);
      const pts = [x, y];
      for (let s = 0; s < (1.45 * R) / 40; s++) {
        a += zw(-0.08, 0.08);
        x += Math.cos(a) * 40;
        y += Math.sin(a) * 40;
        pts.push(x, y);
      }
      d.roads.push({ c: i < 3 ? 2 : 3, p: new Float32Array(pts) });
      radial.push(a);
    }
    // Ringstraßen
    for (const [f, k] of [[0.33, 3], [0.72, 2]]) {
      const pts = [], ph = zw(0, 6.3), rr = f * R;
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const q = rr * (1 + 0.07 * Math.sin(3 * a + ph));
        pts.push(Math.cos(a) * q, Math.sin(a) * q);
      }
      d.roads.push({ c: k, p: new Float32Array(pts) });
    }

    // Viertel mit eigenem Straßenraster
    const belegt = new Set();
    const nv = Math.round(10 + 16 * (R / 1000) ** 2);
    const viertel = [];
    for (let v = 0; v < nv; v++) {
      const L = zw(140, 300) * (R / 1000) ** 0.3;
      let cx, cy, versuch = 0, frei;
      do {
        const a = zw(0, 6.3), q = Math.sqrt(r()) * R;
        cx = Math.cos(a) * q; cy = Math.sin(a) * q;
        frei = !imWasser(cx, cy, 40) && viertel.every(([x, y, l]) => Math.hypot(x - cx, y - cy) > (l + L) * 0.8);
      } while (!frei && ++versuch < 40);
      if (!frei) continue;
      viertel.push([cx, cy, L]);
      const th = r() < 0.5 ? radial[Math.floor(r() * radial.length)] : zw(0, Math.PI);
      const ax = Math.cos(th), ay = Math.sin(th), bx = -ay, by = ax;
      const sp = zw(55, 95), k = Math.floor(L / sp);
      const strasse = (ox, oy, dx, dy, klasse) => {
        let seg = [];
        const fertig = () => {
          if (seg.length >= 6) d.roads.push({ c: klasse, p: new Float32Array(seg) });
          seg = [];
        };
        for (let t = -L; t <= L; t += 10) {
          const x = ox + dx * t, y = oy + dy * t;
          if (!imWasser(x, y, 8) && x * x + y * y < (1.15 * R) ** 2) seg.push(x, y);
          else fertig();
        }
        fertig();
      };
      for (let i = -k; i <= k; i++) {
        strasse(cx + bx * i * sp, cy + by * i * sp, ax, ay, i % 4 === 0 ? 4 : 5);
        strasse(cx + ax * i * sp, cy + ay * i * sp, bx, by, 5);
      }
      // Häuserblöcke
      for (let i = -k; i < k; i++) {
        for (let j = -k; j < k; j++) {
          const mx = cx + ax * (i + 0.5) * sp + bx * (j + 0.5) * sp;
          const my = cy + ay * (i + 0.5) * sp + by * (j + 0.5) * sp;
          const innen = sp / 2 - 9;
          const reihen = r() < 0.5 ? 2 : 3;
          for (let a = 0; a < reihen; a++) {
            for (let b = 0; b < 2; b++) {
              const bw = (2 * innen) / reihen - 3, bt = innen - 2 - zw(0, 8);
              const hx = mx + ax * (-innen + (a + 0.5) * (2 * innen) / reihen) + bx * (b ? 1 : -1) * (innen - bt / 2);
              const hy = my + ay * (-innen + (a + 0.5) * (2 * innen) / reihen) + by * (b ? 1 : -1) * (innen - bt / 2);
              if (hx * hx + hy * hy > R * R * 1.2 || imWasser(hx, hy, 14) || imPark(hx, hy)) continue;
              const key = Math.round(hx / 12) + "," + Math.round(hy / 12);
              if (belegt.has(key) || r() < 0.08) continue;
              belegt.add(key);
              const ex = (ax * bw) / 2, ey = (ay * bw) / 2, fx = (bx * bt) / 2, fy = (by * bt) / 2;
              d.buildings.push({
                p: new Float32Array([hx - ex - fx, hy - ey - fy, hx + ex - fx, hy + ey - fy, hx + ex + fx, hy + ey + fy, hx - ex + fx, hy - ey + fy]),
                x: hx, y: hy, a: bw * bt,
              });
            }
          }
        }
      }
    }

    // Wege durch die Parks
    for (const [px, py, rr] of parks) {
      const pts = [], a0 = zw(0, 6.3);
      for (let t = -1; t <= 1; t += 0.1) pts.push(px + Math.cos(a0) * rr * t + Math.sin(t * 3) * rr * 0.2, py + Math.sin(a0) * rr * t);
      d.roads.push({ c: 7, p: new Float32Array(pts) });
    }

    // Bahnstrecke
    const ba = zw(0, Math.PI), bk = zw(-0.3, 0.3) * R, pts = [];
    for (let t = -1.4 * R; t <= 1.4 * R; t += 30) {
      const o = bk + Math.sin(t / R) * R * 0.15;
      pts.push(Math.cos(ba) * t - Math.sin(ba) * o, Math.sin(ba) * t + Math.cos(ba) * o);
    }
    d.rails.push(new Float32Array(pts));
    return d;
  };
})();
