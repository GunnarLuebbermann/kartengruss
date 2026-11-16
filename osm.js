// Kartengruß: Ortssuche (Nominatim) und Kartendaten (Overpass) aus OpenStreetMap.
// Alle Koordinaten werden in Meter relativ zum Mittelpunkt umgerechnet (x nach Osten, y nach Süden).
(function () {
  const KG = (window.KG = window.KG || {});

  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  const HAEUSER_MIT_FORM = 1000; // Gebäude bis zu diesem Radius mit Umriss, darüber nur als Punkt

  KG.suche = async function (q) {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=de&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Ortssuche fehlgeschlagen (${r.status})`);
    const j = await r.json();
    return j.map((e) => ({
      name: e.name || e.display_name.split(",")[0],
      label: e.display_name,
      lat: +e.lat,
      lon: +e.lon,
    }));
  };

  KG.ortsname = async function (lat, lon) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=14&accept-language=de&lat=${lat}&lon=${lon}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return "Mein Ort";
    const j = await r.json();
    const a = j.address || {};
    return a.suburb || a.city_district || a.village || a.town || a.city || j.name || "Mein Ort";
  };

  function abfrage(lat, lon, r) {
    const a = `(around:${r},${lat},${lon})`;
    const rb = Math.min(r, HAEUSER_MIT_FORM);
    const b = `(around:${rb},${lat},${lon})`;
    return `[out:json][timeout:90];
(
  way["highway"]${a};
  way["waterway"~"^(river|stream|canal|riverbank)$"]${a};
  way["natural"="water"]${a};
  way["landuse"~"^(reservoir|basin)$"]${a};
  relation["natural"="water"]${a};
  relation["waterway"="riverbank"]${a};
  way["railway"~"^(rail|light_rail|subway|tram)$"]${a};
  way["leisure"~"^(park|garden|pitch)$"]${a};
  way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|allotments)$"]${a};
  way["natural"~"^(wood|scrub|heath)$"]${a};
);
out geom qt;
way["building"]${b};
out geom qt;
${r > rb ? `(way["building"]${a}; - way["building"]${b};);\nout center qt;` : ""}`;
  }

  KG.ladeOrt = async function (lat, lon, radius, signal) {
    const body = "data=" + encodeURIComponent(abfrage(lat, lon, radius));
    let letzterFehler;
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, {
          method: "POST",
          body,
          signal,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        if (r.status === 429 || r.status === 504) {
          letzterFehler = new Error("Der Kartenserver ist gerade ausgelastet. Versuch es gleich noch einmal oder wähle einen kleineren Ausschnitt.");
          continue;
        }
        if (!r.ok) throw new Error(`Kartenserver antwortet mit Fehler ${r.status}`);
        return KG.wandle(await r.json(), lat, lon, radius);
      } catch (e) {
        if (e.name === "AbortError") throw e;
        letzterFehler = e;
      }
    }
    throw letzterFehler;
  };

  // Straßenklassen: 0 Autobahn … 7 Fußweg, -1 = ignorieren
  function strassenklasse(h) {
    h = h.replace(/_link$/, "");
    const k = {
      motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4,
      residential: 5, unclassified: 5, living_street: 5, road: 5,
      service: 6, track: 6, pedestrian: 6,
      footway: 7, path: 7, cycleway: 7, steps: 7, bridleway: 7,
    }[h];
    return k === undefined ? -1 : k;
  }

  const gleich = (a, b) => a.lat === b.lat && a.lon === b.lon;

  // Setzt Teilstücke (Wege einer Multipolygon-Relation) zu Ringen zusammen.
  function ringe(teile) {
    const rest = teile.map((t) => t.slice());
    const out = [];
    while (rest.length) {
      let cur = rest.pop();
      for (let schutz = 0; !gleich(cur[0], cur[cur.length - 1]) && schutz < 5000; schutz++) {
        let gefunden = false;
        for (let i = 0; i < rest.length; i++) {
          const s = rest[i], ende = cur[cur.length - 1];
          if (gleich(ende, s[0])) cur = cur.concat(s.slice(1));
          else if (gleich(ende, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
          else if (gleich(cur[0], s[s.length - 1])) cur = s.concat(cur.slice(1));
          else if (gleich(cur[0], s[0])) cur = s.slice().reverse().concat(cur.slice(1));
          else continue;
          rest.splice(i, 1);
          gefunden = true;
          break;
        }
        if (!gefunden) break;
      }
      out.push(cur);
    }
    return out;
  }

  function flaeche(p) {
    let a = 0;
    for (let i = 0, n = p.length; i < n; i += 2) {
      const j = (i + 2) % n;
      a += p[i] * p[j + 1] - p[j] * p[i + 1];
    }
    return Math.abs(a / 2);
  }

  function schwerpunkt(p) {
    let x = 0, y = 0;
    const n = p.length / 2;
    for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; }
    return [x / n, y / n];
  }

  // Wandelt eine Overpass-Antwort in das Datenmodell der Zeichenfunktionen um.
  KG.wandle = function (json, lat0, lon0, radius) {
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
    const P = (g) => {
      const a = new Float32Array(g.length * 2);
      for (let i = 0; i < g.length; i++) {
        a[2 * i] = (g[i].lon - lon0) * kx;
        a[2 * i + 1] = -(g[i].lat - lat0) * ky;
      }
      return a;
    };
    const d = { radius, roads: [], water: [], waterways: [], rails: [], green: [], buildings: [] };

    for (const el of json.elements || []) {
      const t = el.tags || {};
      if (el.type === "way" && el.center && t.building) {
        const p = P([el.center]);
        d.buildings.push({ p: null, x: p[0], y: p[1], a: 120 });
        continue;
      }
      if (el.type === "way" && el.geometry) {
        const g = el.geometry.filter(Boolean);
        if (g.length < 2) continue;
        const zu = gleich(g[0], g[g.length - 1]);
        if (t.building) {
          if (!zu) continue;
          const p = P(g), [x, y] = schwerpunkt(p);
          d.buildings.push({ p, x, y, a: flaeche(p) });
        } else if (t.highway) {
          const k = strassenklasse(t.highway);
          if (k >= 0 && t.area !== "yes") d.roads.push({ c: k, p: P(g) });
        } else if (t.waterway === "riverbank" || t.natural === "water" || t.landuse === "reservoir" || t.landuse === "basin") {
          if (zu) d.water.push([P(g)]);
        } else if (t.waterway) {
          d.waterways.push({ w: { river: 16, canal: 10, stream: 3 }[t.waterway] || 3, p: P(g) });
        } else if (t.railway) {
          d.rails.push(P(g));
        } else if (zu) {
          d.green.push([P(g)]);
        }
      } else if (el.type === "relation" && el.members) {
        const teile = el.members.filter((m) => m.type === "way" && m.geometry).map((m) => m.geometry.filter(Boolean));
        const rs = ringe(teile).filter((r) => r.length > 3 && gleich(r[0], r[r.length - 1]));
        if (rs.length) d.water.push(rs.map(P));
      }
    }
    return d;
  };
})();
