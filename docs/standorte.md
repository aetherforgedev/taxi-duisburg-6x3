# Standortkatalog und Quellen

Die Importstruktur erhält die Nummerierung, Schreibweise und Standortbeschreibung der 87 Sektorzeilen aus der bereitgestellten Standortliste. Nummern, die in der Quelle fehlen, werden nicht ergänzt. Bedarfshalteplätze ohne Ortsangabe behalten einen leeren Standort. Der Abholkatalog enthält alle sieben Geschäfte und 95 Straßen.

Koordinaten stammen aus OpenStreetMap. © OpenStreetMap-Mitwirkende, [Open Database License](https://www.openstreetmap.org/copyright). Der mitgelieferte Positionskatalog steht unter der ODbL. OSM-Objektlinks stehen direkt neben jedem nutzbaren Punkt. Grundlage sind die im November 2026 abgerufenen Daten aus der [OSM API](https://wiki.openstreetmap.org/wiki/API_v0.6) und dem [Geofabrik-Auszug Regierungsbezirk Düsseldorf](https://download.geofabrik.de/europe/germany/nordrhein-westfalen/duesseldorf-regbez.html).

- Hausnummern werden über die kartierte Adresse abgeglichen. Ein Katalogeintrag für ein Geschäft benennt den Eingang oder das Gelände nur, wenn die Quelle diese Zuordnung stützt.
- Straßen ohne Hausnummer nutzen einen vorhandenen Straßenknoten im Suchgebiet. Die App kennzeichnet diesen als Straßenabschnitt und ergänzt keine Hausnummer.
- Bei Kreuzungen verwendet der Import die gemeinsamen Knoten zweier benannter OSM-Straßen. Mehrere weit auseinanderliegende Treffer erfordern manuelle Prüfung.
- Bei einer Standortbeschreibung, die nur eine lange Straße nennt, wird ohne zuordenbaren Taxistand kein Geofence eingerichtet. Ergänzungen erfolgen über `src/verified.json` mit OSM-Beleg und werden bei der nächsten Veröffentlichung ausgeliefert. Leere Punkte stehen im jeweiligen Katalog als Prüffälle.
- Sektor 22 verwendet den kartierten Taxistand am Hauptbahnhof auf der Westseite. Auf der Ostseite ist ein weiterer, separat kartierter Stand vorhanden. Die Vorlage führt dafür keine eigene Sektornummer.
- Die Sektoren 36 und 38 verwenden die kartierten Adressflächen der Eissporthalle beziehungsweise der Sana-Klinik. Die exakte Haltekante ist dort nicht separat kartiert. Beim REWE-Eintrag liegt der Abholpunkt auf der kartierten Parkfläche neben dem Markt und dem Imbiss.

Die Originaldateien und Rohdaten sind nicht Teil des Repositories. Zur Aufbereitung dienen `scripts/source-data.py`, `scripts/osm-tiles.py` und `scripts/osm-region.py`. Die Anwendung geocodiert nicht beim Start.
