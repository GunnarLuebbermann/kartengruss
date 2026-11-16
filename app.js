// Kartengruß: Bedienung, Zustand und Export.
(function () {
  const KG = window.KG;
  const $ = (id) => document.getElementById(id);
  const SPEICHER = "kartengruss-v1";

  const RADIEN = { 500: "Kiez", 1000: "Viertel", 1800: "Stadt" };
  const FORMEN = { rechteck: "Rechteck", kreis: "Kreis" };
  const TEXTE = { titel: "Titelzeile", stempel: "Poststempel", aus: "Ohne" };

  const start = Math.floor(Math.random() * 1e6);
  const z = {
    stil: "linien", palette: "fjord", radius: 1000, format: "quer", form: "rechteck", text: "titel",
    gruss: "GRÜSSE AUS", seed: start,
    ort: { fantasie: true, seed: start, name: KG.fantasieName(start) },
    titel: "",
  };
  try { Object.assign(z, JSON.parse(localStorage.getItem(SPEICHER)) || {}); } catch {}
  let daten = null;
  const cache = new Map();
  let laden = null;

  const sichern = () => {
    try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch {}
  };
  const melde = (text, fehler) => {
    $("meldung").textContent = text || "";
    $("meldung").classList.toggle("fehler", !!fehler);
  };

  // ---------- Bedienelemente ----------

  function chips(id, optionen, schluessel, nachher) {
    const el = $(id);
    el.innerHTML = "";
    for (const [wert, label] of Object.entries(optionen)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = label;
      b.dataset.wert = wert;
      b.addEventListener("click", () => {
        z[schluessel] = isNaN(+wert) ? wert : +wert;
        markiere();
        (nachher || zeichne)();
      });
      el.appendChild(b);
    }
  }
  function markiere() {
    for (const [id, k] of [["stil", "stil"], ["radius", "radius"], ["format", "format"], ["form", "form"], ["text", "text"], ["palette", "palette"]])
      for (const b of $(id).children) b.setAttribute("aria-pressed", String(b.dataset.wert === String(z[k])));
  }

  chips("stil", KG.STILE, "stil");
  chips("radius", Object.fromEntries(Object.entries(RADIEN).map(([r, n]) => [r, `${n}<small>${r < 1000 ? r + " m" : (r / 1000).toString().replace(".", ",") + " km"}</small>`])), "radius", ladeDaten);
  chips("format", Object.fromEntries(Object.entries(KG.FORMATE).map(([k, f]) => [k, f.name])), "format");
  chips("form", FORMEN, "form");
  chips("text", TEXTE, "text");

  for (const [k, p] of Object.entries(KG.PALETTEN)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "farbe";
    b.dataset.wert = k;
    b.innerHTML = `<span class="streifen">${[p.paper, p.water, ...p.acc.slice(0, 3)].map((c) => `<i style="background:${c}"></i>`).join("")}</span>${p.name}`;
    b.addEventListener("click", () => { z.palette = k; markiere(); zeichne(); });
    $("palette").appendChild(b);
  }

  $("gruss").value = z.gruss;
  $("gruss").addEventListener("input", (e) => { z.gruss = e.target.value; zeichne(); });
  $("titel").addEventListener("input", (e) => { z.titel = e.target.value; zeichne(); });

  // ---------- Zeichnen ----------

  function optionen() {
    return { ...z, titel: z.titel || z.ort.name, gruss: z.gruss };
  }

  let geplant = 0;
  function zeichne() {
    sichern();
    if (!daten) return;
    cancelAnimationFrame(geplant);
    geplant = requestAnimationFrame(() => {
      const c = $("karte"), f = KG.FORMATE[z.format];
      const breite = Math.min($("rahmen").clientWidth, 900);
      const hoehe = Math.min(breite * (f.h / f.w), window.innerHeight * 0.72);
      const cssW = hoehe * (f.w / f.h), dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.style.width = cssW + "px";
      c.style.height = hoehe + "px";
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(hoehe * dpr);
      KG.zeichne(c, daten, optionen());
      const [a, b] = KG.koordinaten(z.ort);
      $("info").textContent = `${z.ort.name} · ${a} ${z.ort.fantasie ? "" : b} · ${daten.roads.length} Straßen · ${daten.buildings.length} Häuser`;
    });
  }

  async function ladeDaten() {
    if (laden) laden.abort();
    if (z.ort.fantasie) {
      daten = KG.fantasie(z.ort.seed, z.radius);
      melde("");
      zeichne();
      return;
    }
    const key = `${z.ort.lat.toFixed(5)},${z.ort.lon.toFixed(5)},${z.radius}`;
    if (cache.has(key)) {
      daten = cache.get(key);
      melde("");
      return zeichne();
    }
    laden = new AbortController();
    melde(`Lade Kartendaten für ${z.ort.name} …${z.radius > 1000 ? " (großer Ausschnitt, das dauert etwas)" : ""}`);
    try {
      const d = await KG.ladeOrt(z.ort.lat, z.ort.lon, z.radius, laden.signal);
      if (!d.roads.length) throw new Error("An diesem Ort gibt es keine Straßen in OpenStreetMap. Versuch einen größeren Ausschnitt.");
      cache.set(key, d);
      daten = d;
      melde("");
      zeichne();
    } catch (e) {
      if (e.name === "AbortError") return;
      melde(netzFehler(e), true);
    }
  }

  function netzFehler(e) {
    if (e instanceof TypeError) return "Kartendaten konnten nicht geladen werden. Prüfe die Internetverbindung. In eingebetteten Vorschauen sind externe Dienste oft gesperrt, Fantasieorte funktionieren trotzdem.";
    return e.message;
  }

  function waehleOrt(ort) {
    z.ort = ort;
    z.titel = "";
    $("titel").value = "";
    $("titel").placeholder = ort.name;
    $("treffer").innerHTML = "";
    ladeDaten();
  }

  // ---------- Ort finden ----------

  $("suche").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("ortsfeld").value.trim();
    if (!q) return;
    melde("Suche …");
    $("treffer").innerHTML = "";
    try {
      const liste = await KG.suche(q);
      if (!liste.length) return melde(`Nichts gefunden für „${q}“. Versuch es mit Stadt und Stadtteil.`, true);
      melde(liste.length === 1 ? "" : "Welchen Ort meinst du?");
      if (liste.length === 1) return waehleOrt({ ...liste[0], fantasie: false });
      for (const t of liste) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML = `<strong></strong><span></span>`;
        b.querySelector("strong").textContent = t.name;
        b.querySelector("span").textContent = t.label;
        b.addEventListener("click", () => waehleOrt({ ...t, fantasie: false }));
        li.appendChild(b);
        $("treffer").appendChild(li);
      }
    } catch (e) {
      melde(netzFehler(e), true);
    }
  });

  $("standort").addEventListener("click", () => {
    if (!navigator.geolocation) return melde("Dieser Browser kann den Standort nicht bestimmen.", true);
    melde("Bestimme Standort …");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        let name = "Mein Ort";
        try { name = await KG.ortsname(lat, lon); } catch {}
        waehleOrt({ name, label: name, lat, lon, fantasie: false });
      },
      () => melde("Standort nicht verfügbar. Erlaube den Zugriff oder suche den Ort per Namen.", true),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });

  $("fantasie").addEventListener("click", () => {
    const s = Math.floor(Math.random() * 1e6);
    waehleOrt({ fantasie: true, seed: s, name: KG.fantasieName(s) });
  });

  $("wuerfeln").addEventListener("click", () => {
    z.seed = Math.floor(Math.random() * 1e6);
    zeichne();
  });

  // ---------- Export ----------

  let exportUrl = null, exportBlob = null;
  $("speichern").addEventListener("click", async () => {
    if (!daten) return;
    const knopf = $("speichern");
    knopf.disabled = true;
    knopf.textContent = "Wird erstellt …";
    await new Promise((r) => setTimeout(r, 30));
    try {
      const [w, h] = KG.FORMATE[z.format].px;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      KG.zeichne(c, daten, optionen());
      exportBlob = await new Promise((r) => c.toBlob(r, "image/png"));
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(exportBlob);
      const name = "kartengruss-" + (z.titel || z.ort.name).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "") + ".png";
      $("export-bild").src = exportUrl;
      $("herunterladen").href = exportUrl;
      $("herunterladen").download = name;
      const datei = new File([exportBlob], name, { type: "image/png" });
      $("teilen").hidden = !(navigator.canShare && navigator.canShare({ files: [datei] }));
      $("teilen").onclick = () => navigator.share({ files: [datei], title: "Kartengruß" }).catch(() => {});
      $("export-hinweis").textContent = `${w} × ${h} Pixel, druckfertig mit 300 dpi. Am Handy: Bild lange drücken und „Bild sichern“ wählen.`;
      $("export").hidden = false;
    } finally {
      knopf.disabled = false;
      knopf.textContent = "Postkarte speichern";
    }
  });
  $("schliessen").addEventListener("click", () => { $("export").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("export").hidden = true; });

  // ---------- Start ----------

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(zeichne, 120); });
  markiere();
  $("titel").value = z.titel;
  $("titel").placeholder = z.ort.name;
  const schriften = ['700 40px "Bricolage Grotesque"', '400 20px "DM Mono"', '600 20px "DM Mono"', '500 20px "DM Mono"'];
  Promise.race([
    Promise.all(schriften.map((s) => document.fonts.load(s))),
    new Promise((r) => setTimeout(r, 2500)),
  ]).finally(ladeDaten);
  document.fonts.addEventListener?.("loadingdone", zeichne);
})();
