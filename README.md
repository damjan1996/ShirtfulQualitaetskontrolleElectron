# RFID QR Wareneingang - Electron Version

🚀 **Moderne Desktop-Anwendung** für RFID-basierte Zeiterfassung und QR-Code Wareneingang

Schlanke aber vollständige Electron-Implementierung der bewährten Python-Lösung mit modernder Web-UI und nativer Desktop-Integration.

## ✨ Features

### 🏷️ RFID-Integration
- **Automatische Tag-Erkennung** über HID-kompatible RFID-Reader
- **Intelligente Filterung** verhindert Fehlscans und Duplikate
- **Ein-/Ausloggen** durch erneutes Scannen des gleichen Tags
- **Multi-User Support** - mehrere Benutzer können gleichzeitig arbeiten

### 📸 QR-Code Scanner
- **Browser-basiert** mit WebRTC und getUserMedia API
- **Live-Video-Preview** mit Scan-Overlay und Zielhilfen
- **Automatische Erkennung** mit jsQR Library
- **Flexible Zuordnung** - Last Login, Round-Robin oder manuell

### 💾 Direkte SQL Server Integration
- **Connection Pooling** für optimale Performance
- **Automatische Reconnection** bei Verbindungsfehlern
- **Transaction Support** für Datenkonsistenz
- **Health Checks** und Diagnose-Tools

### 🎨 Moderne Desktop-UI
- **Responsive Design** mit CSS Grid und Flexbox
- **Dark/Light Theme** automatisch basierend auf System-Einstellungen
- **Live-Updates** aller Benutzer-Sessions und Scan-Aktivitäten
- **Notification System** für Status-Feedback
- **Native Window Controls** (Minimize, Close)

## 🛠️ Technologie-Stack

| Komponente | Technologie | Zweck |
|------------|-------------|--------|
| **Desktop Framework** | Electron 27+ | Native Desktop App mit Web-Technologien |
| **Backend** | Node.js 16+ | Server-seitige Logik und Hardware-Integration |
| **Frontend** | Vanilla JS + HTML5 | Moderne Web-UI ohne Framework-Overhead |
| **Styling** | CSS3 + Custom Properties | Responsives Design mit Theme-Support |
| **Datenbank** | Microsoft SQL Server | Direkte Integration mit mssql Package |
| **RFID** | node-hid | HID-Gerät Integration für RFID-Reader |
| **QR-Scanner** | jsQR + WebRTC | Browser-basierte QR-Code Erkennung |
| **IPC** | Electron IPC + contextBridge | Sichere Main ↔ Renderer Kommunikation |

## 📦 Installation

### Voraussetzungen

**Software:**
- Node.js 16.0 oder höher
- Microsoft ODBC Driver 18 for SQL Server
- Windows 10/11 (empfohlen) oder macOS/Linux

**Hardware:**
- USB RFID-Reader (HID-Modus)
- Webcam für QR-Code Scanning
- Netzwerk-Zugriff auf SQL Server

### 1. Projekt Setup

```bash
# Repository klonen oder Dateien entpacken
cd C:\Users\damja\WebstormProjects\Shirtful\Wareneingang\rfid-qr-app

# Dependencies installieren
npm install

# Electron spezifische Tools
npm install --save-dev electron electron-builder
```

### 2. Konfiguration

```bash
# Umgebungs-Konfiguration kopieren
copy .env.example .env

# .env bearbeiten und anpassen:
# - MSSQL_SERVER, MSSQL_USER, MSSQL_PASSWORD
# - QR_DEFAULT_ASSIGNMENT_MODE
# - UI-Einstellungen
```

**Beispiel .env:**
```env
MSSQL_SERVER=116.202.224.248
MSSQL_DATABASE=RdScanner
MSSQL_USER=sa
MSSQL_PASSWORD=YourSecretPassword

QR_DEFAULT_ASSIGNMENT_MODE=last_login
RFID_MIN_SCAN_INTERVAL=1000
UI_WINDOW_WIDTH=1200
UI_WINDOW_HEIGHT=800
```

### 3. Datenbank Setup

Stellen Sie sicher, dass die SQL Server Datenbank mit den erforderlichen Tabellen existiert:

- `ScannBenutzer` - Benutzer mit RFID-Tags
- `Sessions` - Aktive und historische Arbeitssessions
- `QrScans` - Erfasste QR-Code Daten

### 4. RFID-Reader Setup

Ihr RFID-Reader muss als **HID-Tastatur** konfiguriert sein:

1. Reader an USB anschließen
2. Als Tastatur-Device erkennen lassen
3. Test in Texteditor - Tags sollten als Text + Enter ausgegeben werden
4. Keine zusätzlichen Treiber erforderlich

## 🚀 Anwendung starten

### Development Mode
```bash
npm run dev
# oder
npm start
```

### Production Mode
```bash
npm run build
npm start
```

### Portable Executable erstellen
```bash
npm run build-win
# Ausgabe in dist/ Ordner
```

## 📱 Bedienung

### 🔑 Benutzer-Anmeldung
1. **RFID-Tag scannen** → Benutzer wird automatisch angemeldet
2. **Session-Timer startet** und wird live in der UI angezeigt
3. **Mehrere Benutzer** können gleichzeitig angemeldet sein
4. **Erneuter Tag-Scan** → Benutzer wird abgemeldet

### 📸 QR-Code Erfassung
1. **"Scanner starten"** klicken → Kamera-Zugriff erlauben
2. **QR-Code vor Kamera halten** → Automatische Erkennung
3. **Zuordnung** erfolgt je nach Modus:
    - **Last Login**: An zuletzt angemeldeten Benutzer
    - **Round-Robin**: Automatisch reihum an alle Benutzer
    - **Manual**: Dialog zur manuellen Benutzer-Auswahl

### 👥 Multi-User Workflow
```
Benutzer A: RFID scannen → Anmelden → QR-Codes werden automatisch zugeordnet
Benutzer B: RFID scannen → Anmelden → Round-Robin Verteilung aktiv
Benutzer C: RFID scannen → Anmelden → Jeder QR-Code geht an nächsten Benutzer
```

## ⚙️ Konfiguration

### QR-Zuordnungsmodi

| Modus | Beschreibung | Ideal für |
|-------|--------------|-----------|
| `last_login` | Alle QR-Codes an zuletzt angemeldeten Benutzer | Einzelarbeitsplatz |
| `round_robin` | Automatische Verteilung reihum | Teamarbeit mit gleichmäßiger Verteilung |
| `manual` | Dialog-Auswahl bei jedem QR-Code | Spezifische Zuordnungen erforderlich |

### Wichtige Einstellungen

```env
# Performance Tuning
RFID_MIN_SCAN_INTERVAL=1000      # Mindestabstand RFID-Scans (ms)
QR_GLOBAL_COOLDOWN=300           # QR-Duplikat Verhinderung (s)
UI_UPDATE_INTERVAL=1000          # UI-Refresh Rate (ms)

# Multi-User Optimierung  
QR_CROSS_USER_CHECK=true         # Duplikat-Check zwischen Benutzern
QR_SESSION_COOLDOWN=3600         # Session-spezifisches Cooldown (s)

# UI-Anpassung
UI_THEME=default                 # default, dark, light
UI_SHOW_DEBUG=false              # Debug-Informationen anzeigen
```

### Datenbank-Optimierung

```env
# Connection Pool
MSSQL_POOL_MAX=10               # Maximum Verbindungen
MSSQL_POOL_MIN=0                # Minimum Verbindungen
MSSQL_POOL_IDLE_TIMEOUT=30000   # Idle Timeout (ms)

# Timeouts
MSSQL_REQUEST_TIMEOUT=30000     # Query Timeout (ms)
MSSQL_CONNECTION_TIMEOUT=15000  # Verbindungs-Timeout (ms)
```

## 🔧 Troubleshooting

### RFID-Reader Probleme

❌ **Reader wird nicht erkannt**
```bash
# Prüfen Sie:
1. USB-Verbindung
2. HID-Modus aktiviert
3. Windows erkennt als Tastatur-Device
4. Test in Notepad - Tags sollten sichtbar sein
```

✅ **Lösung:**
- RFID-Reader auf HID-Keyboard-Modus umstellen
- `RFID_MIN_SCAN_INTERVAL` reduzieren (500ms)
- Reader-Dokumentation für Konfiguration prüfen

### Kamera-Probleme

❌ **QR-Scanner startet nicht**
```bash
# Häufige Ursachen:
1. Kamera-Berechtigung verweigert
2. Kamera von anderer App verwendet
3. Browser-Sicherheitsrichtlinien
```

✅ **Lösung:**
- Kamera-Berechtigung in Browser/System erlauben
- Andere Apps schließen die Kamera verwenden
- HTTPS verwenden (für getUserMedia erforderlich in Production)

### Datenbank-Verbindung

❌ **Connection failed**
```bash
# Prüfen Sie:
1. Server erreichbar: ping 116.202.224.248
2. Port offen: telnet 116.202.224.248 1433  
3. Firewall-Einstellungen
4. SQL Server Authentication aktiviert
```

✅ **Lösung:**
```env
# Versuchen Sie:
MSSQL_TRUST_CERT=true
MSSQL_ENCRYPT=false
MSSQL_CONNECTION_TIMEOUT=30000
```

### Performance-Probleme

❌ **Langsame UI oder hohe CPU-Last**

✅ **Optimierung:**
```env
UI_UPDATE_INTERVAL=2000          # Weniger häufige Updates
QR_GLOBAL_COOLDOWN=600          # Längeres Cooldown
MSSQL_POOL_MAX=5                # Kleinerer Connection Pool
APP_DEBUG=false                 # Debug-Modus deaktivieren
```

## 📊 Monitoring & Logs

### Built-in Monitoring

Die Anwendung bietet Live-Monitoring über die UI:

- **System Status** - Datenbank und RFID-Verbindung
- **Aktive Benutzer** - Live-Timer und Scan-Counts
- **Scanner Status** - Kamera-Zustand und letzte Aktivität
- **Recent Scans** - Letzte 20 QR-Codes mit Benutzer-Zuordnung

### Logs

```
logs/
├── main.log              # Hauptanwendung
├── database.log          # SQL Server Operationen  
├── rfid.log              # RFID-Events
└── renderer.log          # Frontend-Events
```

### Health Check API

Interne Diagnose-Funktionen über IPC:

```javascript
// Verfügbar in Renderer Process
await window.electronAPI.db.healthCheck();
// Returns: { connected, connectionTime, serverInfo, stats }
```

## 🔄 Updates & Deployment

### Development Updates
```bash
# Dependencies aktualisieren
npm update

# Electron Version updaten
npm install electron@latest --save-dev

# Security Audit
npm audit fix
```

### Production Deployment

```bash
# Optimized Build
npm run build-win

# Installer erstellen
# Ausgabe: dist/RFID QR Wareneingang Setup.exe

# Silent Installation
"RFID QR Wareneingang Setup.exe" /S

# Update bestehende Installation
# Installer überschreibt automatisch
```

### Auto-Update (Optional)

Für automatische Updates kann electron-updater integriert werden:

```bash
npm install electron-updater --save
```

## 🔒 Sicherheit

### Datenbank-Sicherheit
- ✅ Prepared Statements gegen SQL Injection
- ✅ Connection Pooling mit Timeouts
- ✅ Verschlüsselte Verbindungen (TLS/SSL)
- ✅ Minimale Benutzerrechte in SQL Server

### Anwendungs-Sicherheit
- ✅ Content Security Policy (CSP)
- ✅ Context Isolation für Renderer Process
- ✅ Keine Node.js Integration im Frontend
- ✅ Secure IPC mit contextBridge

### Empfohlene Härtung

```env
# Production Security
NODE_ENV=production
APP_DEBUG=false
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=false
```

## 📄 Lizenz & Support

**Proprietär** - Nur für den internen Gebrauch bei Shirtful

**Support:**
1. **System-Test**: Integrierte Diagnose in der Anwendung
2. **Logs prüfen**: `logs/` Verzeichnis für detaillierte Fehleranalyse
3. **Health Check**: Database → Health Check im Menü
4. **Hardware-Test**: RFID und Kamera über UI testen

---

## 🆚 Python vs. Electron Comparison

| Feature | Python Version | **Electron Version** |
|---------|----------------|---------------------|
| **Startup Zeit** | ~3-5 Sekunden | ~1-2 Sekunden |
| **Memory Usage** | ~50-80 MB | ~80-120 MB |
| **UI Framework** | Tkinter | Modern Web UI |
| **Cross-Platform** | Windows/Linux | Windows/macOS/Linux |
| **Updates** | Manual | Auto-Update ready |
| **Development** | Python + Tkinter | JavaScript + HTML/CSS |
| **Distribution** | .exe + Python Runtime | Single .exe |
| **Performance** | Native | V8 Engine |

**Electron Vorteile:**
- ✅ Modernere, ansprechendere UI
- ✅ Einfachere Anpassung und Styling
- ✅ Cross-Platform ohne Änderungen
- ✅ Bessere Developer Experience
- ✅ Auto-Update Infrastruktur

**Python Vorteile:**
- ✅ Geringerer Memory-Footprint
- ✅ Direkte Hardware-Integration
- ✅ Bewährte Stabilität
- ✅ Keine Browser-Dependencies

---

🎉 **Die Electron-Version kombiniert die bewährte Funktionalität der Python-Lösung mit einer modernen, benutzerfreundlichen Desktop-Oberfläche!**