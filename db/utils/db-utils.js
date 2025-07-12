/**
 * Database Utilities für Qualitätskontrolle RFID QR Scanner
 * QR-Code-Dekodierung und Datenverarbeitung
 */

class DatabaseUtils {
    constructor() {
        // QR-Code Format Cache
        this.formatCache = new Map();

        // Cleanup-Timer für Cache
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupCache();
        }, 300000); // Alle 5 Minuten
    }

    // ===== QR-CODE DEKODIERUNG =====

    /**
     * Hauptfunktion für QR-Code-Dekodierung
     */
    decodeQRCode(rawData) {
        try {
            if (!rawData || typeof rawData !== 'string') {
                throw new Error('Ungültige QR-Code-Daten');
            }

            const trimmedData = rawData.trim();

            // Cache prüfen
            if (this.formatCache.has(trimmedData)) {
                return this.formatCache.get(trimmedData);
            }

            // Verschiedene Formate testen
            let decoded = null;

            // 1. Star-separated Format (Shirtful-Standard)
            decoded = this.tryStarSeparatedFormat(trimmedData);
            if (decoded.success) {
                this.formatCache.set(trimmedData, decoded);
                return decoded;
            }

            // 2. Caret-separated Format
            decoded = this.tryCaretSeparatedFormat(trimmedData);
            if (decoded.success) {
                this.formatCache.set(trimmedData, decoded);
                return decoded;
            }

            // 3. URL Format
            decoded = this.tryURLFormat(trimmedData);
            if (decoded.success) {
                this.formatCache.set(trimmedData, decoded);
                return decoded;
            }

            // 4. Barcode Format (numerisch)
            decoded = this.tryBarcodeFormat(trimmedData);
            if (decoded.success) {
                this.formatCache.set(trimmedData, decoded);
                return decoded;
            }

            // 5. Alphanumerisch
            decoded = this.tryAlphanumericFormat(trimmedData);
            if (decoded.success) {
                this.formatCache.set(trimmedData, decoded);
                return decoded;
            }

            // 6. Fallback: Raw-Text
            decoded = this.createRawFormat(trimmedData);
            this.formatCache.set(trimmedData, decoded);
            return decoded;

        } catch (error) {
            return {
                success: false,
                error: error.message,
                raw: rawData,
                fields: [],
                summary: 'Dekodierung fehlgeschlagen',
                type: 'error'
            };
        }
    }

    // ===== FORMAT-SPEZIFISCHE DEKODIERUNG =====

    /**
     * Star-separated Format: *Auftrag*Paket*Kunde*
     */
    tryStarSeparatedFormat(data) {
        try {
            if (!data.includes('*') || data.length < 3) {
                return { success: false };
            }

            const parts = data.split('*').filter(part => part.trim().length > 0);

            if (parts.length < 2) {
                return { success: false };
            }

            const fields = [];
            let auftrags_nr = null;
            let paket_nr = null;
            let kunden_name = null;

            // Erste 3 Teile als Standard-Felder interpretieren
            if (parts[0] && parts[0].trim()) {
                auftrags_nr = parts[0].trim();
                fields.push({
                    label: 'Auftrag',
                    value: auftrags_nr,
                    type: 'auftrag',
                    icon: '📋'
                });
            }

            if (parts[1] && parts[1].trim()) {
                paket_nr = parts[1].trim();
                fields.push({
                    label: 'Paket',
                    value: paket_nr,
                    type: 'paket',
                    icon: '📦'
                });
            }

            if (parts[2] && parts[2].trim()) {
                kunden_name = parts[2].trim();
                fields.push({
                    label: 'Kunde',
                    value: kunden_name,
                    type: 'kunde',
                    icon: '👤'
                });
            }

            // Zusätzliche Felder
            for (let i = 3; i < parts.length; i++) {
                if (parts[i] && parts[i].trim()) {
                    fields.push({
                        label: `Feld ${i+1}`,
                        value: parts[i].trim(),
                        type: 'additional',
                        icon: '📄'
                    });
                }
            }

            return this.createDecodedResult({
                auftrags_nr,
                paket_nr,
                kunden_name,
                format_type: 'star_separated'
            }, fields, 'star_separated');

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Caret-separated Format: ^Auftrag^Paket^Kunde^
     */
    tryCaretSeparatedFormat(data) {
        try {
            if (!data.includes('^') || data.length < 3) {
                return { success: false };
            }

            const parts = data.split('^').filter(part => part.trim().length > 0);

            if (parts.length < 2) {
                return { success: false };
            }

            const fields = [];
            let auftrags_nr = null;
            let paket_nr = null;
            let kunden_name = null;

            if (parts[0] && parts[0].trim()) {
                auftrags_nr = parts[0].trim();
                fields.push({
                    label: 'Auftrag',
                    value: auftrags_nr,
                    type: 'auftrag',
                    icon: '📋'
                });
            }

            if (parts[1] && parts[1].trim()) {
                paket_nr = parts[1].trim();
                fields.push({
                    label: 'Paket',
                    value: paket_nr,
                    type: 'paket',
                    icon: '📦'
                });
            }

            if (parts[2] && parts[2].trim()) {
                kunden_name = parts[2].trim();
                fields.push({
                    label: 'Kunde',
                    value: kunden_name,
                    type: 'kunde',
                    icon: '👤'
                });
            }

            return this.createDecodedResult({
                auftrags_nr,
                paket_nr,
                kunden_name,
                format_type: 'caret_separated'
            }, fields, 'caret_separated');

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * URL Format erkennen und dekodieren
     */
    tryURLFormat(data) {
        try {
            const urlRegex = /^https?:\/\//i;
            if (!urlRegex.test(data)) {
                return { success: false };
            }

            const url = new URL(data);
            const fields = [];

            // Domain als Hauptinfo
            fields.push({
                label: 'Domain',
                value: url.hostname,
                type: 'domain',
                icon: '🌐'
            });

            // URL-Parameter extrahieren
            const params = url.searchParams;
            for (const [key, value] of params.entries()) {
                fields.push({
                    label: key,
                    value: value,
                    type: 'url_param',
                    icon: '🔗'
                });
            }

            // Pfad-Segmente
            const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
            pathSegments.forEach((segment, index) => {
                fields.push({
                    label: `Pfad ${index + 1}`,
                    value: segment,
                    type: 'path_segment',
                    icon: '📁'
                });
            });

            return {
                success: true,
                type: 'url',
                fields: fields,
                summary: `URL: ${url.hostname}`,
                icon: '🔗',
                title: 'Web-Link',
                quality: 'url',
                raw: data
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Barcode Format (rein numerisch)
     */
    tryBarcodeFormat(data) {
        try {
            // Nur Zahlen und evtl. Bindestriche/Leerzeichen erlaubt
            const cleanData = data.replace(/[\s\-]/g, '');

            if (!/^\d+$/.test(cleanData) || cleanData.length < 4) {
                return { success: false };
            }

            const fields = [{
                label: 'Barcode',
                value: cleanData,
                type: 'barcode',
                icon: '🔢'
            }];

            // Spezielle Barcode-Formate erkennen
            if (cleanData.length === 13) {
                fields.push({
                    label: 'Format',
                    value: 'EAN-13',
                    type: 'barcode_format',
                    icon: '📊'
                });
            } else if (cleanData.length === 8) {
                fields.push({
                    label: 'Format',
                    value: 'EAN-8',
                    type: 'barcode_format',
                    icon: '📊'
                });
            } else if (cleanData.length === 12) {
                fields.push({
                    label: 'Format',
                    value: 'UPC',
                    type: 'barcode_format',
                    icon: '📊'
                });
            }

            return {
                success: true,
                type: 'barcode',
                fields: fields,
                summary: `Barcode: ${cleanData}`,
                icon: '🔢',
                title: 'Numerischer Code',
                quality: 'barcode',
                raw: data
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Alphanumerisches Format
     */
    tryAlphanumericFormat(data) {
        try {
            const alphanumericRegex = /^[A-Za-z0-9\-_]+$/;

            if (!alphanumericRegex.test(data) || data.length < 3) {
                return { success: false };
            }

            const fields = [{
                label: 'Code',
                value: data,
                type: 'alphanumeric',
                icon: '🔤'
            }];

            // Muster erkennen
            if (/^[A-Z]{2,3}\d{4,}$/.test(data)) {
                fields.push({
                    label: 'Muster',
                    value: 'Prefix + Nummer',
                    type: 'pattern',
                    icon: '🎯'
                });
            }

            return {
                success: true,
                type: 'alphanumeric',
                fields: fields,
                summary: `Code: ${data}`,
                icon: '🔤',
                title: 'Alphanumerischer Code',
                quality: 'alphanumeric',
                raw: data
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Raw-Format als Fallback
     */
    createRawFormat(data) {
        const fields = [{
            label: 'Rohdaten',
            value: data.substring(0, 100), // Auf 100 Zeichen begrenzen
            type: 'raw',
            icon: '📄'
        }];

        // Längen-Info
        if (data.length > 100) {
            fields.push({
                label: 'Länge',
                value: `${data.length} Zeichen (gekürzt)`,
                type: 'info',
                icon: 'ℹ️'
            });
        } else {
            fields.push({
                label: 'Länge',
                value: `${data.length} Zeichen`,
                type: 'info',
                icon: 'ℹ️'
            });
        }

        return {
            success: true,
            type: 'text',
            fields: fields,
            summary: `Text: ${data.substring(0, 30)}${data.length > 30 ? '...' : ''}`,
            icon: '📝',
            title: 'Freitext',
            quality: 'minimal',
            raw: data
        };
    }

    // ===== HELPER METHODS =====

    /**
     * Erstellt standardisiertes Dekodierung-Resultat
     */
    createDecodedResult(decoded, fields, formatType) {
        const { auftrags_nr, paket_nr, kunden_name } = decoded;

        // Icon und Titel basierend auf verfügbaren Daten
        let icon = '📄';
        let title = 'Paketdaten';
        let quality = 'minimal';

        if (auftrags_nr && paket_nr) {
            icon = '📦';
            title = 'Vollständige Paketinformationen';
            quality = 'complete';
        } else if (auftrags_nr || paket_nr) {
            icon = '📋';
            title = 'Teilweise Paketinformationen';
            quality = 'partial';
        } else if (kunden_name) {
            icon = '👤';
            title = 'Kundeninformationen';
            quality = 'customer';
        }

        // Zusammenfassung erstellen
        const parts = [];
        if (auftrags_nr) parts.push(`Auftrag: ${auftrags_nr}`);
        if (paket_nr) parts.push(`Paket: ${paket_nr}`);
        if (kunden_name) parts.push(kunden_name);

        const summary = parts.length > 0 ?
            parts.join(' | ') :
            'Strukturierte Daten';

        return {
            success: true,
            type: formatType,
            fields: fields,
            summary: summary,
            icon: icon,
            title: title,
            quality: quality,
            raw: decoded.original || '',
            decoded: {
                auftrags_nr,
                paket_nr,
                kunden_name,
                format_type: formatType
            }
        };
    }

    /**
     * Gibt Formatinfo für UI zurück
     */
    getFormatInfo(parsed) {
        try {
            if (parsed && parsed.type) {
                const formats = {
                    'star_separated': {
                        icon: '⭐',
                        name: 'Stern-Format',
                        color: 'blue',
                        description: 'Paket-/Auftragsdaten'
                    },
                    'caret_separated': {
                        icon: '🔸',
                        name: 'Caret-Format',
                        color: 'blue',
                        description: 'Paket-/Auftragsdaten'
                    },
                    'barcode': {
                        icon: '🔢',
                        name: 'Barcode',
                        color: 'green',
                        description: 'Numerischer Code'
                    },
                    'url': {
                        icon: '🔗',
                        name: 'URL',
                        color: 'purple',
                        description: 'Web-Link'
                    },
                    'alphanumeric': {
                        icon: '🔤',
                        name: 'Alpha-Code',
                        color: 'orange',
                        description: 'Buchstaben + Zahlen'
                    },
                    'text': {
                        icon: '📝',
                        name: 'Text',
                        color: 'gray',
                        description: 'Freitext'
                    }
                };

                return formats[parsed.type] || {
                    icon: '❓',
                    name: 'Unbekannt',
                    color: 'red',
                    description: 'Unbekanntes Format'
                };
            }

            // Default Fallback
            return {
                icon: '📄',
                name: 'Standard',
                color: 'gray',
                description: 'QR-Code Daten'
            };
        } catch (error) {
            return {
                icon: '❌',
                name: 'Fehler',
                color: 'red',
                description: 'Parse-Fehler'
            };
        }
    }

    // ===== CACHE MANAGEMENT =====

    /**
     * Cache-Cleanup (entfernt alte Einträge)
     */
    cleanupCache() {
        if (this.formatCache.size > 1000) {
            // Cache-Größe begrenzen
            const entries = Array.from(this.formatCache.entries());
            const toKeep = entries.slice(-500); // Letzten 500 behalten

            this.formatCache.clear();
            toKeep.forEach(([key, value]) => {
                this.formatCache.set(key, value);
            });

            console.log(`🧹 QR-Code Format-Cache bereinigt. Größe: ${this.formatCache.size}`);
        }
    }

    /**
     * Cache-Statistiken
     */
    getCacheStats() {
        return {
            size: this.formatCache.size,
            maxSize: 1000,
            hitRate: this.cacheHits / Math.max(1, this.cacheMisses + this.cacheHits),
            entries: Array.from(this.formatCache.keys()).slice(0, 10) // Erste 10 Keys
        };
    }

    // ===== CLEANUP =====
    cleanup() {
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = null;
        }

        this.formatCache.clear();
        console.log('✅ DatabaseUtils cleanup abgeschlossen');
    }
}

module.exports = DatabaseUtils;