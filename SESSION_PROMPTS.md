# Session Prompts

Use these prompts to start separate implementation sessions. Each session must read `README.md`, `PLAN.md`, and `TODO.md` before making changes.

## Session A: Repository And Server

```text
Bitte starte eine Build-Session im Projekt /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Lies zuerst README.md, PLAN.md und TODO.md vollständig. Arbeite dann nur an WP1 und WP2 aus TODO.md.

Ziele dieser Session:
- Git initialisieren, falls noch nicht vorhanden.
- Bun/SvelteKit/Svelte 5/TypeScript Projekt-Skeleton einrichten.
- Biome, Vitest, Three.js, Lucide und Svelte-Checks konfigurieren.
- Bun-nativen WebSocket-Hub bauen.
- /ws/device und /ws/ui implementieren.
- JSON-Protokoll typisieren und validieren.
- Device-State, Heartbeat-/Timeout-Status, Sequenzprüfung, Paketverlust-Schätzung und Broadcast an UI-Clients implementieren.
- Unit-Tests für Protokollvalidierung und Device-State schreiben.

Nicht tun:
- Nicht an firmware/ arbeiten, außer falls eine leere Platzhalterstruktur bereits existiert.
- Keine UI-Features bauen außer minimalem Skeleton, falls SvelteKit es braucht.
- Keine neuen Backend-Frameworks einführen.

Klare Zielmetriken:
- bun run lint erfolgreich.
- bun run check erfolgreich.
- bun run build erfolgreich.
- bun run test erfolgreich.
- Simulierter Device-Stream mit mindestens 50 Nachrichten/Sekunde lokal verarbeitbar.
- Safe Mode wird nach mehr als 3 Sekunden ohne frische Telemetrie gesetzt.

Vor Änderungen git status prüfen. Am Ende einen sinnvollen Commit mit englischer Commit Message erstellen.
```

## Session B: Firmware

```text
Bitte starte eine Build-Session im Projekt /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Lies zuerst README.md, PLAN.md und TODO.md vollständig. Arbeite dann nur an WP3 aus TODO.md.

Ziele dieser Session:
- firmware/ als PlatformIO-Projekt für M5StickC Plus2 einrichten.
- M5Unified, WiFi.h, arduinoWebSockets, ArduinoJson und Preferences verwenden.
- Web Serial Setup mit newline-delimited JSON implementieren.
- SSID, Passwort, Server-URL und Device-ID in Preferences speichern und laden.
- Non-blocking WiFi-Reconnect und WebSocket-Reconnect getrennt behandeln.
- register, heartbeat, imu und orientation Frames senden.
- calibrate, pause, resume, reboot und identify Commands empfangen und ausführen.
- Display-Diagnose für Status, IP, RSSI und Streaming-Zustand anzeigen.

Nicht tun:
- Nicht an Svelte UI oder Server-Dateien arbeiten.
- Keine langen delay()-Blöcke im normalen Loop.
- Keine direkte VR-Steuerung bauen.

Klare Zielmetriken:
- pio run erfolgreich, wenn PlatformIO verfügbar ist.
- M5.update() läuft in jeder Loop-Iteration.
- webSocket.loop() läuft regelmäßig, sobald WebSocket aktiv ist.
- Heartbeat alle 2 Sekunden.
- IMU-Zielintervall 20 ms.
- WiFi/WebSocket verbindet innerhalb von 10 Sekunden nach gespeicherter Config unter normalen lokalen Bedingungen.
- Verbindungsverlust wird innerhalb von 3 Sekunden sichtbar.

Vor Änderungen git status prüfen. Am Ende einen sinnvollen Commit mit englischer Commit Message erstellen.
```

## Session C: Setup And Test UI

```text
Bitte starte eine Build-Session im Projekt /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Lies zuerst README.md, PLAN.md und TODO.md vollständig. Arbeite dann nur an WP4 und WP5 aus TODO.md.

Ziele dieser Session:
- SvelteKit/Svelte 5 UI für Setup und Testoberfläche bauen.
- Web Serial Connect/Disconnect implementieren.
- Formular für SSID, Passwort, Server-URL und Device-ID bauen.
- Configure-JSON als newline-delimited JSON an den Stick senden.
- configureResult anzeigen.
- /ws/ui WebSocket-Client bauen.
- Live Device-Status anzeigen: connected, calibrated, RSSI, heap, battery, packet loss, last message.
- Three.js-Orientation-Visualisierung mit Stick-Modell bauen.
- Control-Buttons für calibrate, pause, resume, identify und reboot bauen.
- Safe Mode bei veralteten oder ungültigen Daten anzeigen.

Design- und Code-Regeln:
- Zentrale Styles in src/app.css.
- Keine Inline-Styles.
- Keine Tailwind Utility Classes im Markup.
- Lucide Icons verwenden, wo passend.
- Three.js nur im Browser/onMount initialisieren.
- Renderer und Event Listener beim Unmount sauber freigeben.

Nicht tun:
- Nicht an firmware/ arbeiten.
- Nicht die Server-Protokollform eigenmächtig ändern; bei Bedarf TODO/PLAN respektieren und kleine Integrationsnotiz hinterlassen.

Klare Zielmetriken:
- bun run lint erfolgreich.
- bun run check erfolgreich.
- bun run build erfolgreich.
- bun run test erfolgreich.
- Setup kann mit angeschlossenem Stick in unter 60 Sekunden abgeschlossen werden.
- UI zeigt Safe Mode innerhalb von 3 Sekunden nach Telemetrieausfall.

Vor Änderungen git status prüfen. Am Ende einen sinnvollen Commit mit englischer Commit Message erstellen.
```

## Integration Session

```text
Bitte starte eine Integration-Session im Projekt /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Lies zuerst README.md, PLAN.md und TODO.md vollständig. Prüfe dann die Ergebnisse von Session A, B und C gegen WP6 und WP7 aus TODO.md.

Ziele dieser Session:
- Server-, Firmware- und UI-Protokollformen end-to-end abgleichen.
- Web Serial Configure-JSON gegen Firmware-Parser prüfen.
- Simulierten WebSocket-Device-Stream durch den Server bis zur UI testen.
- Command-Frames von UI über Server an Device-Verbindung prüfen.
- README mit genauen Start-, Build-, Upload- und Monitor-Kommandos aktualisieren.
- Refactor-Pass für klare Dateigrenzen, Namensgebung und einfache Struktur durchführen.
- Alle verfügbaren Checks ausführen.

Klare Zielmetriken:
- bun run lint erfolgreich.
- bun run check erfolgreich.
- bun run build erfolgreich.
- bun run test erfolgreich.
- pio run erfolgreich oder PlatformIO-Abwesenheit klar dokumentiert.
- Safe Mode nach mehr als 3 Sekunden ohne Telemetrie.
- Stick reconnectet nach Server-Neustart innerhalb von 10 Sekunden, wenn Hardwaretest möglich ist.
- git status ist am Ende sauber oder absichtlich offene Änderungen sind dokumentiert.

Am Ende einen sinnvollen Commit mit englischer Commit Message erstellen.
```

## Supervisor Session

```text
Bitte überwache das Projekt /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter als Supervisor-Session.

Lies README.md, PLAN.md, TODO.md und SESSION_PROMPTS.md. Implementiere keine Feature-Arbeit, außer ich fordere es ausdrücklich an.

Aufgaben:
- Prüfe den Fortschritt gegen TODO.md.
- Lies git status und die jüngsten Commits.
- Identifiziere blockierende Abweichungen zwischen Session A, B, C und Integration.
- Aktualisiere TODO.md nur für Status/Koordination, nicht für Feature-Implementierung.
- Gib mir kurze deutsche Statusberichte mit offenen Risiken, nächstem sinnvollem Schritt und fehlenden Checks.

Klare Zielmetriken:
- Jede Session bleibt in ihrem Write Scope.
- Akzeptanzkriterien aus TODO.md werden sichtbar abgehakt.
- Abweichungen vom PLAN.md werden früh erkannt.
- Keine Feature-Implementierung durch die Supervisor-Session ohne explizite Freigabe.
```
