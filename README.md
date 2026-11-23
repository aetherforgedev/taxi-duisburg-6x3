# Taxi-Duisburg 6x3

Deutschsprachige Fahrer-PWA für Safari auf dem iPhone. Die App erzeugt und verarbeitet lokale Testaufträge. Der Fahrer-Code **5803** wählt das hinterlegte Profil von Justin Danes aus. Eine echte Taxizentrale oder Serveranmeldung ist nicht angebunden.

## Lokal starten

Node.js 22 oder neuer verwenden.

```sh
npm ci
npm run check
npm test
npm run build
npm run preview
```

Der Inhalt von `dist/` kann auf einem statischen HTTPS-Host liegen. `localhost` erlaubt für lokale Tests Standortzugriff und Service Worker. Für ein iPhone im gleichen WLAN braucht der Host HTTPS mit einem vom Gerät anerkannten Zertifikat. Die GPS-Simulation erscheint ausschließlich bei `npm run dev`.

Bei laufender Produktionsvorschau führt `npm run test:browser` den Fahrerablauf in Microsoft Edge mit 390 × 844 CSS-Pixeln und einer testseitigen GPS-Position durch. Der Browser lässt sich über `TAXI_BROWSER_CHANNEL` wählen. Der Test prüft auch den Offline-Neustart und legt Screenshots unter `.work/` ab.

## Auf dem iPhone installieren

1. Die Pages-Adresse in Safari öffnen und beim ersten Aufruf online bleiben.
2. Auf **Teilen** tippen und **Zum Home-Bildschirm** wählen. Falls angezeigt, **Als Web-App öffnen** aktivieren und **Hinzufügen** tippen.
3. Die App vom Home-Bildschirm starten, **5803** eingeben und **Fahrtbetrieb starten** wählen. Safari den Standortzugriff erlauben.
4. Für Testaufträge mit Zeitfilter unter **Menü › Navigation** Online-Routing freigeben. Unter **Menü › Aufträge** lässt sich der Filter für lokale Angebote ohne Routing abschalten. Ohne Straßenroute zeigt die App keine vorgetäuschte Anfahrtszeit.

Ein optionales Fahrerfoto wird aus `public/fahrerbilder/fahrer.png` geladen. Es wird durch die Git-Regeln nicht versehentlich veröffentlicht. Für einen öffentlichen Hosting-Build mit Foto muss die Datei bewusst in den Hosting-Quellbestand übernommen werden.

## GitHub Pages

Der Workflow prüft TypeScript, führt Vitest aus, baut Vite und veröffentlicht `dist/` bei Push auf `main`. Er erwartet in **Settings › Pages › Source** die Einstellung **GitHub Actions**. Relative Assets, Hash-Routing und der Service-Worker-Scope unterstützen die Projekt-URL unter einem Unterpfad.

## Daten und Systemgrenzen

- Alle 87 Sektorzeilen und alle 102 Abholeinträge aus den Quellen sind im lokalen Katalog enthalten. Jeder nutzbare Geopunkt verweist auf seine OpenStreetMap-Quelle. Einträge mit fehlender oder mehrdeutiger Lage bleiben im Katalog und werden von Einbuchung beziehungsweise Auftragsgenerator ausgeschlossen. Details zur Aufbereitung stehen in [Standortdaten](docs/standorte.md).
- Leaflet zeigt reguläre [OpenStreetMap-Kacheln](https://operations.osmfoundation.org/policies/tiles/). Routing nutzt bei Freigabe [FOSSGIS/OSRM](https://routing.openstreetmap.de/about.html) oder einen konfigurierten HTTPS-OSRM-Endpunkt. Der öffentliche Dienst ist für einzelne Tests gedacht. Für regelmäßigen betrieblichen Einsatz ist ein eigener oder dafür freigegebener Endpunkt vorgesehen. Google Maps ist als externe Navigation verfügbar.
- Der Service Worker lädt nach dem ersten Online-Aufruf Oberfläche, Kataloge und gebündelte Assets in den Cache. IndexedDB hält Einstellungen, Sitzung, Aufträge und Fahrten lokal. Neue Kartenkacheln und Straßenrouten benötigen eine Verbindung. Auf iOS können GPS-Updates bei gesperrtem Display oder im Hintergrund aussetzen.
- Bei der Fahrpreisanzeige stammen Grundbetrag, Tag-/Nacht-Wegschritt, Zeitschritt und Tierzuschlag aus der [Taxen-Tarifverordnung der Stadt Duisburg, Fassung ab 01.09.2025](https://www.duisburg.de/rathaus/rathausundpolitik/ortsrecht/S32.08-Taxen-Tarifverordnung-ab-01.09.2025.pdf). Die GPS-Messung schätzt den Fahrpreis und markiert Messlücken. Diese Anzeige ist nicht geeicht und kein gesetzlich zugelassener Ersatz für einen vorgeschriebenen Taxameter. Festpreisvereinbarung, Belege und steuerliche Aufzeichnungen sind nicht Teil der App.
- Beim Routing sendet der Browser Start und Ziel an den konfigurierten Dienst. Die Kartenansicht lädt bei Verbindung die sichtbaren Kacheln. Es gibt keine Analyse- oder Trackingintegration. Der Fahrercode und die mitgelieferten Profildaten sind in einer öffentlichen Pages-Veröffentlichung öffentlich einsehbar. Ein exportiertes Backup kann lokale Fahrtdaten einschließlich Abhol- und Zielpunkten enthalten.
