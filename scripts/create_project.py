#!/usr/bin/env python3
"""
RFID-QR-App Projektstruktur Generator
Erstellt die komplette Ordnerstruktur und leere Dateien für das RFID-QR-Login-Projekt
"""

import os
import sys
from pathlib import Path

def create_project_structure():
    """Erstellt die komplette Projektstruktur für die RFID-QR-App"""

    # Basis-Pfad definieren
    base_path = Path(r"C:\Users\damja\WebstormProjects\Shirtful\Wareneingang")
    project_path = base_path / "rfid-qr-app"

    # Projektstruktur definieren
    directories = [
        "renderer",
        "rfid",
        "db"
    ]

    files = [
        "main.js",
        "preload.js",
        "renderer/index.html",
        "renderer/app.js",
        "renderer/styles.css",
        "rfid/rfid-listener.js",
        "db/db-client.js",
        ".env",
        "package.json",
        "electron-builder.yml"
    ]

    try:
        # Hauptprojektordner erstellen
        print(f"Erstelle Hauptprojektordner: {project_path}")
        project_path.mkdir(parents=True, exist_ok=True)

        # Unterordner erstellen
        print("\nErstelle Unterordner:")
        for directory in directories:
            dir_path = project_path / directory
            dir_path.mkdir(exist_ok=True)
            print(f"  ✓ {directory}/")

        # Dateien erstellen
        print("\nErstelle Dateien:")
        for file_path in files:
            full_file_path = project_path / file_path

            # Stelle sicher, dass das übergeordnete Verzeichnis existiert
            full_file_path.parent.mkdir(parents=True, exist_ok=True)

            # Erstelle leere Datei, falls sie nicht existiert
            if not full_file_path.exists():
                full_file_path.touch()
                print(f"  ✓ {file_path}")
            else:
                print(f"  → {file_path} (bereits vorhanden)")

        # Erfolgreiche Erstellung bestätigen
        print(f"\n✅ Projektstruktur erfolgreich erstellt!")
        print(f"📁 Projektpfad: {project_path}")

        # Übersicht der erstellten Struktur anzeigen
        print("\n📋 Erstellte Projektstruktur:")
        print("rfid-qr-app/")
        print("├── main.js")
        print("├── preload.js")
        print("├── renderer/")
        print("│   ├── index.html")
        print("│   ├── app.js")
        print("│   └── styles.css")
        print("├── rfid/")
        print("│   └── rfid-listener.js")
        print("├── db/")
        print("│   └── db-client.js")
        print("├── .env")
        print("├── package.json")
        print("└── electron-builder.yml")

        # Nächste Schritte anzeigen
        print("\n🚀 Nächste Schritte:")
        print("1. Wechseln Sie in das Projektverzeichnis:")
        print(f"   cd \"{project_path}\"")
        print("2. Initialisieren Sie das npm-Projekt:")
        print("   npm init -y")
        print("3. Installieren Sie die benötigten Dependencies:")
        print("   npm install electron mssql node-hid dotenv")
        print("4. Installieren Sie DevDependencies:")
        print("   npm install --save-dev electron-builder")
        print("5. Konfigurieren Sie die .env-Datei mit Ihren Datenbankeinstellungen")

        return True

    except PermissionError:
        print(f"❌ Fehler: Keine Berechtigung zum Erstellen von Dateien in {base_path}")
        print("Führen Sie das Script als Administrator aus oder wählen Sie einen anderen Pfad.")
        return False

    except FileExistsError as e:
        print(f"❌ Fehler: {e}")
        return False

    except Exception as e:
        print(f"❌ Unerwarteter Fehler: {e}")
        return False

def verify_structure(project_path):
    """Überprüft, ob alle Dateien und Ordner korrekt erstellt wurden"""
    print("\n🔍 Überprüfe erstellte Struktur...")

    expected_items = [
        "main.js",
        "preload.js",
        "renderer",
        "renderer/index.html",
        "renderer/app.js",
        "renderer/styles.css",
        "rfid",
        "rfid/rfid-listener.js",
        "db",
        "db/db-client.js",
        ".env",
        "package.json",
        "electron-builder.yml"
    ]

    all_good = True
    for item in expected_items:
        item_path = project_path / item
        if item_path.exists():
            print(f"  ✓ {item}")
        else:
            print(f"  ❌ {item} - FEHLT!")
            all_good = False

    return all_good

if __name__ == "__main__":
    print("🏗️  RFID-QR-App Projektstruktur Generator")
    print("=" * 50)

    success = create_project_structure()

    if success:
        project_path = Path(r"C:\Users\damja\WebstormProjects\Shirtful\Wareneingang\rfid-qr-app")
        verify_structure(project_path)
        print("\n✅ Setup komplett! Sie können nun mit der Entwicklung beginnen.")
    else:
        print("\n❌ Setup fehlgeschlagen. Bitte überprüfen Sie die Fehlermeldungen oben.")
        sys.exit(1)