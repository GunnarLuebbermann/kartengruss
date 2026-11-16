# Kartengruß

Generative Postkarten aus OpenStreetMap-Daten. Ort suchen, Stil wählen, als druckfertiges PNG speichern.

Aus den Straßen, Flüssen, Parks und Häusern eines Ortes entsteht ein abstraktes Bild:

| Stil | Idee |
|---|---|
| **Linien** | klassischer Stadtplan, reduziert auf Linien und Flächen |
| **Leuchten** | Straßen glühen auf dunklem Grund, Farbe nach Entfernung zur Mitte |
| **Punkte** | jedes Haus ein Punkt, Farben folgen einem Rauschfeld; Wasser als Punktraster |
| **Bauhaus** | Häuser als farbige Flächen in Primärfarben, dazu eine große Kreisform |
| **Ausrichtung** | Straßen eingefärbt nach Himmelsrichtung, mit Windrose der Straßenrichtungen |

Dazu: 7 Farbpaletten, Formate (Postkarte quer/hoch, Quadrat, Poster A4), Rechteck- oder Kreisausschnitt,
Titelzeile oder Poststempel mit Datum und Koordinaten. „Neu würfeln“ variiert Farben und Formen.

**Fantasieort erfinden** erzeugt eine ausgedachte Stadt mit Fluss, Straßenrastern, Parks und Häusern.
Das funktioniert ohne Internet und ist auf der Karte als erfunden gekennzeichnet.

## Benutzen

Einfach `index.html` über einen Webserver öffnen, z. B.:

```sh
python3 -m http.server
```

Ein Push auf `main` veröffentlicht die Seite über GitHub Pages
(Pages-Quelle in den Repo-Einstellungen auf „GitHub Actions“ stellen).

Export: 1748 × 1240 px für Postkarten (A6 mit 300 dpi), 2480 × 3508 px für A4.

## Aufbau

```
index.html   Oberfläche und Gestaltung
app.js       Bedienung, Zustand, Export
osm.js       Ortssuche (Nominatim), Kartendaten (Overpass), Umrechnung in Meter
render.js    Kunststile, Paletten, Titelzeile, Poststempel
fantasie.js  Generator für erfundene Orte, Zufallsgenerator mit Startwert
```

Kein Build-Schritt, keine Abhängigkeiten.

## Daten

Kartendaten © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), verfügbar unter der ODbL.
Die Quellenangabe wird auf jede Karte gedruckt. Ortssuche über Nominatim (eine Anfrage pro Suche,
keine automatische Vervollständigung, gemäß Nutzungsrichtlinie).
