# 🔍 Qualitätskontrolle RFID QR - Doppel-Scan System

**Moderne Desktop-Anwendung für RFID-basierte Zeiterfassung und QR-Code Qualitätskontrolle mit Doppel-Scan-Logik**

Speziell entwickelt für Qualitätskontrolle bei Shirtful - Fokus auf präzise Karton-Bearbeitung mit Ein- und Ausgang-Scanning.

## ✨ Hauptfeatures

### 🔍 Qualitätskontrolle-System
- **Doppel-Scan-Logik**: Jeder Karton wird zweimal gescannt
    - **1. Scan**: Beginn der Bearbeitung (Eingang)
    - **2. Scan**: Abschluss der Bearbeitung (Ausgang)
    - **3. Scan**: Duplikatfehler - Karton bereits abgeschlossen
- **Automatische Session-Verwaltung**: Session endet nach 2. Scan, neue startet automatisch
- **Präzise Zeiterfassung**: Exakte Bearbeitungszeit pro Karton
- **Duplikat-Schutz**: Verhindert mehrfache Bearbeitung

### 🏷️ RFID-Anmeldung
- **Ein-Klick-Anmeldung** durch RFID-Tag scannen
- **Automatische Zeiterfassung** mit Live-Timer
- **Parallele Sessions** - Mehrere Mitarbeiter können gleichzeitig arbeiten
- **Session-Neustart** durch erneutes Tag-Scannen

### 📸 QR-Code Qualitätskontrolle
- **Live-Kamera-Vorschau** mit optimierter Scan-Oberfläche
- **Automatische QR-Erkennung** ohne manuellen Auslöser
- **Status-Tracking** pro QR-Code (nicht gescannt / in Bearbeitung / abgeschlossen)
- **Visuelles & Audio-Feedback** bei erfolgreichen Scans
- **Comprehensive Historie** mit Bearbeitungszeiten

### 📊 Qualitätskontrolle Dashboard
- **Live-Statistiken**: Gestartete vs. abgeschlossene Kartons
- **Bearbeitungszeiten**: Durchschnittliche und individuelle Zeiten
- **Abschlussrate**: Prozentuale Erfolgsquote
- **Duplikat-Monitoring**: Anzahl fehlerhafter Scan-Versuche
- **Real-Time Updates**: Alle Metriken in Echtzeit

### 🎯 Optimierte Bedienung
- **Doppel-Scan-Workflow** - Intuitiver Ein-/Ausgang-Prozess
- **Multi-User-Interface** - Mehrere Mitarbeiter parallel
- **Große Schaltflächen** für Touch-Bedienung geeignet
- **Klare Status-Anzeigen** für System und Scanner
- **Minimal-Setup** mit automatischer Konfiguration

## 🛠️ Technologie

| Komponente | Lösung | Grund |
|------------|---------|--------|
| **Desktop** | Electron 28+ | Native Desktop-App mit Web-UI |
| **Backend** | Node.js 16+ | RFID/Database-Integration |
| **Frontend** | Vanilla JS/HTML/CSS | Einfach wartbar, keine Framework-Abhängigkeiten |
| **Datenbank** | Microsoft SQL Server | Direkte Integration mit mssql-Package |
| **RFID** | Keyboard-Listener | HID-Tastatur-Emulation (Standard RFID-Reader) |
| **QR-Scanner** | jsQR + WebRTC | Browser-basierte Kamera-Integration |
| **Qualitätskontrolle** | Doppel-Scan-Engine | Spezialisierte Logik für Ein-/Ausgang |

## 🎮 Qualitätskontrolle-Workflow

### Mitarbeiter-Anmeldung
1. **RFID-Tag scannen** → Automatische Anmeldung
2. **Session startet** → Arbeitszeit-Erfassung beginnt
3. **Mitarbeiter auswählen** → In der UI für QR-Scanning aktivieren

### Karton-Bearbeitung (Doppel-Scan)
1. **QR-Scanner aktivieren** → "Scanner starten" klicken
2. **Erster Scan** → Karton vor Kamera halten (Bearbeitung startet)
    - ✅ **Status**: "In Bearbeitung"
    - 📊 **Statistik**: +1 gestarteter Karton
    - ⏱️ **Timer**: Bearbeitungszeit startet
3. **Bearbeitung durchführen** → Qualitätskontrolle des Kartons
4. **Zweiter Scan** → Gleichen Karton erneut scannen (Bearbeitung abgeschlossen)
    - ✅ **Status**: "Abgeschlossen"
    - 📊 **Statistik**: +1 abgeschlossener Karton
    - ⏱️ **Zeit**: Bearbeitungszeit angezeigt
    - 🔄 **Session**: Automatisch beendet und neue gestartet

### Fehlerbehandlung
- **Dritter Scan**: ❌ Duplikatfehler - Karton bereits abgeschlossen
- **Falscher Mitarbeiter**: ⚠️ Warnung - Karton von anderem Mitarbeiter gestartet
- **Zu schnelle Scans**: 🔄 Rate-Limiting verhindert Versehen

### Abmeldung
- **Gleiches RFID-Tag erneut scannen** → Session beenden

## 📋 Voraussetzungen

### Software
- **Windows 10/11** (primäre Zielplattform)
- **Node.js 16+** - [Download](https://nodejs.org/)
- **SQL Server ODBC Driver** - [Download](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

### Hardware
- **RFID-Reader** (HID-Tastatur-Modus)
- **Webcam** für QR-Code-Scanning (idealerweise HD-Auflösung)
- **Netzwerk-Zugriff** auf SQL Server

## 🚀 Installation

### 1. Projekt einrichten
```bash
# Repository klonen oder Dateien entpacken
cd qualitaetskontrolle-rfid-qr

# Dependencies installieren
npm install

# Automatisches Setup
npm run setup
```

### 2. Konfiguration
Das Setup-Script führt Sie durch die Konfiguration:

- **Datenbank-Verbindung** (SQL Server Details)
- **UI-Einstellungen** (Fenstergröße, Theme)
- **Scanner-Optionen** (Cooldown, Audio-Feedback)
- **Qualitätskontrolle-Parameter** (Doppel-Scan-Timing, Session-Restart)

Alternativ: `.env.example` zu `.env` kopieren und manuell anpassen.

### 3. Datenbank vorbereiten
```bash
# Datenbank-Schema erstellen
npm run setup-db

# Testbenutzer anlegen
npm run setup-users

# Verbindung testen
npm run test-db
```

### 4. Hardware einrichten

**RFID-Reader:**
1. An USB anschließen
2. Als HID-Tastatur konfigurieren
3. Test in Notepad: Tag scannen → Text + Enter erscheint

**Webcam:**
1. USB-Webcam anschließen oder integrierte verwenden
2. Kamera-Berechtigung erteilen
3. Optimal: HD-Webcam für bessere QR-Erkennung

## ⚙️ Konfiguration

### Wichtige .env Einstellungen

```env
# Datenbank
MSSQL_SERVER=116.202.224.248
MSSQL_DATABASE=RdScanner
MSSQL_USER=sa
MSSQL_PASSWORD=IhrPasswort

# Qualitätskontrolle-spezifisch
QC_DOUBLE_SCAN_ENABLED=true          # Doppel-Scan-System aktivieren
QC_AUTO_SESSION_RESTART=true         # Automatischer Session-Neustart
QC_SESSION_RESTART_DELAY=500         # Verzögerung zwischen Sessions (ms)
QC_DUPLICATE_ERROR_ON_THIRD=true     # Duplikatfehler bei 3. Scan

# QR-Scanner
QR_SCAN_COOLDOWN=2000                # 2s zwischen Scans
QR_GLOBAL_COOLDOWN=300               # 5 Min zwischen globalen Duplikaten
SCAN_SUCCESS_DURATION=2000           # 2s Erfolgs-Overlay
AUDIO_FEEDBACK=true                  # Audio-Bestätigung

# UI
UI_WINDOW_WIDTH=1400                 # Fensterbreite
UI_WINDOW_HEIGHT=900                 # Fensterhöhe
UI_THEME=auto                        # auto/light/dark

# RFID
RFID_MIN_SCAN_INTERVAL=1000          # 1s zwischen RFID-Scans
RFID_SESSION_RESTART_ENABLED=true    # Session-Restart via RFID
```

### Qualitätskontrolle-Performance

**Hochfrequenz-Betrieb:**
```env
QC_MAX_PARALLEL_SESSIONS=15          # Mehr parallele Sessions
QR_SCAN_COOLDOWN=1000                # Schnellere Scans
QC_SESSION_RESTART_DELAY=250         # Schnellerer Session-Wechsel
QR_RATE_LIMIT_PER_MINUTE=30          # Höheres Rate-Limit
```

**Präzisions-Modus:**
```env
QR_SCAN_COOLDOWN=3000                # Längeres Cooldown
QC_SESSION_RESTART_DELAY=1000        # Mehr Zeit zwischen Sessions
AUDIO_FEEDBACK=true                  # Akustische Bestätigung
SCAN_SUCCESS_DURATION=3000           # Längere Erfolgs-Anzeige
```

## 🔧 Troubleshooting

### Qualitätskontrolle-spezifische Probleme

❌ **"Karton wird als Duplikat erkannt obwohl nur einmal gescannt"**
```bash
1. QR_GLOBAL_COOLDOWN reduzieren (von 300 auf 60)
2. Datenbank-Cache leeren: npm run db:cleanup
3. Session-Historie prüfen: Scan-Historie in UI
4. QR-Code-Format prüfen: Eindeutige Codes verwenden
```

❌ **"Session startet nicht automatisch nach 2. Scan"**
```bash
1. QC_AUTO_SESSION_RESTART=true prüfen
2. QC_SESSION_RESTART_DELAY erhöhen (auf 1000ms)
3. RFID-Tag-Verfügbarkeit prüfen
4. Session-Logs untersuchen: logs/sessions.log
```

❌ **"Dritter Scan zeigt keinen Duplikatfehler"**
```bash
1. QC_DUPLICATE_ERROR_ON_THIRD=true setzen
2. Datenbank-Schema aktualisieren: npm run setup-db
3. Qualitätskontrolle-Modul neu starten
4. QR-Code State-Management prüfen
```

### Standard-Troubleshooting

❌ **"Kein RFID-Reader erkannt"**
```bash
1. USB-Verbindung prüfen
2. Windows erkennt als "HID-Tastatur"?
3. Test in Notepad - erscheint Tag-ID + Enter?
4. Andere RFID-Software schließen
5. Als Administrator starten
```

❌ **"Kamera-Zugriff fehlgeschlagen"**
```bash
1. Kamera-Berechtigung in Windows erlauben
2. Andere Apps schließen (Teams, Skype, etc.)
3. Browser-Cache leeren
4. USB-Kamera an anderen Port anschließen
```

❌ **"Datenbank-Verbindung fehlgeschlagen"**
```bash
1. SQL Server läuft?
2. Netzwerk-Verbindung prüfen
3. Firewall-Regeln prüfen
4. SQL Server Authentication aktiviert?
```

## 📊 Qualitätskontrolle-Datenbankstruktur

### Haupttabellen
- **ScannBenutzer** - Mitarbeiterdaten mit EPC (RFID)
- **Sessions** - Arbeitszeit-Sessions (Start/End) mit automatischem Restart
- **QrScans** - Erfasste QR-Codes mit Scan-Zähler und Status
- **QualityControlStates** - Karton-Status (nicht gescannt/in Bearbeitung/abgeschlossen)

### Qualitätskontrolle-Logik
```sql
-- Erster Scan: Bearbeitung starten
INSERT INTO QrScans (SessionID, RawPayload, ScanType, CapturedTS) 
VALUES (?, ?, 'first_scan', SYSDATETIME())

-- QR-Status auf "in Bearbeitung" setzen
INSERT INTO QualityControlStates (QRCode, Status, FirstScanSession, FirstScanTime)
VALUES (?, 'in_progress', ?, SYSDATETIME())

-- Zweiter Scan: Bearbeitung abschließen
INSERT INTO QrScans (SessionID, RawPayload, ScanType, CapturedTS) 
VALUES (?, ?, 'second_scan', SYSDATETIME())

-- QR-Status auf "abgeschlossen" setzen
UPDATE QualityControlStates 
SET Status = 'completed', SecondScanSession = ?, CompletedTime = SYSDATETIME()
WHERE QRCode = ?

-- Session automatisch beenden
UPDATE Sessions SET EndTS = SYSDATETIME(), Active = 0, EndReason = 'quality_control_complete'
WHERE ID = ?

-- Neue Session automatisch starten
INSERT INTO Sessions (UserID, StartTS, Active, SessionType) 
VALUES (?, SYSDATETIME(), 1, 'Qualitaetskontrolle')
```

### Qualitätskontrolle-Statistiken
```sql
-- Tagesstatistiken abrufen
SELECT 
    COUNT(DISTINCT CASE WHEN Status IN ('in_progress', 'completed') THEN QRCode END) as BoxesStarted,
    COUNT(DISTINCT CASE WHEN Status = 'completed' THEN QRCode END) as BoxesCompleted,
    AVG(CASE WHEN Status = 'completed' THEN DATEDIFF(ms, FirstScanTime, CompletedTime) END) as AvgProcessingTime,
    COUNT(CASE WHEN ScanCount > 2 THEN 1 END) as DuplicateAttempts
FROM QualityControlStates 
WHERE DATE(FirstScanTime) = CURDATE()
```

## 🔄 Updates & Wartung

### Entwicklung
```bash
# Development Mode
npm run dev

# Debug mit Inspector
npm run debug

# Quick-Test der DB-Verbindung
npm run test-quick

# Qualitätskontrolle-spezifische Tests
npm run test:quality-control
```

### Produktions-Build
```bash
# Windows Installer erstellen
npm run build:win

# Ausgabe: dist/Qualitätskontrolle RFID QR Setup.exe
```

### Qualitätskontrolle-Wartung
```bash
# QR-States zurücksetzen (nur Development)
npm run qc:reset-states

# Abgeschlossene Kartons archivieren
npm run qc:archive-completed

# Statistiken neu berechnen
npm run qc:recalc-stats

# Duplikat-Cache leeren
npm run qc:clear-duplicates
```

## 🛡️ Sicherheit

### Produktions-Härtung
```env
NODE_ENV=production
APP_DEBUG=false
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=false
QC_DEV_MODE=false
```

### Datenschutz
- Keine persönlichen Daten in QR-Codes
- RFID-Tags als anonyme IDs
- Lokale Datenverarbeitung (keine Cloud)
- Automatische Session-Bereinigung
- Qualitätskontrolle-Daten anonymisiert

## 📈 Monitoring

### Live-Status
- **System-Status** in Header (grün/rot)
- **Qualitätskontrolle-Dashboard** mit Real-Time-Metriken
- **Session-Dauer** Live-Timer pro Mitarbeiter
- **Karton-Status** (gestartet/in Bearbeitung/abgeschlossen)
- **Duplikat-Monitoring** mit Fehleranzahl

### Logs
```
logs/
├── main.log                    # Hauptanwendung
├── database.log               # SQL-Operationen
├── rfid.log                   # RFID-Events
├── quality-control.log        # Qualitätskontrolle-spezifische Events
└── sessions.log              # Session-Management
```

### Qualitätskontrolle-Metriken
```javascript
// Verfügbar über UI oder IPC
await window.electronAPI.qualityControl.getStats();
// Returns: {
//   totalBoxesStarted, totalBoxesCompleted, 
//   duplicateAttempts, averageProcessingTime,
//   completionRate, activeSessions
// }
```

## 🆚 Unterschiede zur Wareneinlagerung-Version

| Feature | Wareneinlagerung | **Qualitätskontrolle** |
|---------|------------------|----------------------|
| **QR-Scan-Logik** | Einmal-Scan | ✅ Doppel-Scan (Ein-/Ausgang) |
| **Session-Ende** | Manuell/RFID | ✅ Automatisch nach 2. Scan |
| **Session-Neustart** | Manuell | ✅ Automatisch |
| **Karton-Status** | Gescannt/Nicht gescannt | ✅ Nicht gescannt/In Bearbeitung/Abgeschlossen |
| **Duplikat-Handling** | Warnung | ✅ Duplikatfehler bei 3. Scan |
| **Bearbeitungszeit** | Session-Zeit | ✅ Karton-spezifische Zeit |
| **Dashboard** | Basic-Statistiken | ✅ Qualitätskontrolle-Dashboard |
| **Workflow** | Kontinuierlich | ✅ Diskrete Karton-Bearbeitung |

## 🎯 Roadmap

### Phase 1 (Aktuell)
- ✅ Doppel-Scan-System implementiert
- ✅ Automatische Session-Verwaltung
- ✅ Qualitätskontrolle-Dashboard
- ✅ Multi-User-Parallelbetrieb

### Phase 2 (Geplant)
- 📊 Erweiterte Reporting-Features
- 🔄 Auto-Update Funktionalität
- 📱 Mobile Web-Interface für Supervisor
- 🎯 Ziel-basierte Leistungsmetriken

### Phase 3 (Future)
- 🏭 Multi-Station-Qualitätskontrolle
- 📈 Predictive Analytics für Bearbeitungszeiten
- 🔌 API für externe QM-Systeme
- 🤖 KI-basierte Anomalie-Erkennung

## 📞 Support

**Bei Qualitätskontrolle-spezifischen Problemen:**
1. **QC-Logs prüfen**: `logs/quality-control.log`
2. **Dashboard-Status**: Qualitätskontrolle-Metriken in UI
3. **Session-Test**: `npm run test:sessions`
4. **QR-Status prüfen**: `npm run qc:check-states`

**Bei allgemeinen Problemen:**
1. **Logs prüfen**: `logs/` Verzeichnis
2. **Health-Check**: "System-Status" in UI
3. **Quick-Test**: `npm run test-quick`
4. **Vollständiger Test**: `npm test`

**Häufige Qualitätskontrolle-Probleme:**
- Doppel-Scan nicht erkannt → QR-Code-Format prüfen
- Session startet nicht auto → RFID-Verbindung prüfen
- Duplikatfehler falsch → Datenbank-Cache leeren
- Statistiken falsch → Neu berechnen mit `npm run qc:recalc-stats`

---

## 🏭 Shirtful Integration

Diese Anwendung ist speziell für die Qualitätskontrolle bei Shirtful optimiert:

- **Doppel-Scan-Workflow**: Präzise Ein-/Ausgang-Erfassung
- **Robuste Hardware-Integration**: Standard USB-Geräte
- **Zuverlässige Karton-Verfolgung**: Direkte SQL Server Anbindung
- **Intuitive Bedienung**: Optimiert für Qualitätskontrolle-Prozesse

**Perfekt für**: Qualitätskontrolle, Endkontrolle, Karton-Bearbeitung, Multi-User-Stationen

✅ **Produktionsbereit** - Sofort einsetzbar nach Setup!

**Qualitätskontrolle-Features:**
- 🔍 Doppel-Scan-System für präzise Bearbeitung
- ⏱️ Automatische Bearbeitungszeit-Erfassung
- 🔄 Nahtlose Session-Übergänge
- 📊 Real-Time Qualitätskontrolle-Dashboard
- 🚫 Intelligente Duplikat-Erkennung
- 👥 Multi-User-Parallelbetrieb