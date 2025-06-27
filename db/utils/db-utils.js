// Console-Utils für bessere Ausgabe - mit Fallback
let customConsole;
try {
    customConsole = require('../../utils/console-utils');
} catch (error) {
    customConsole = {
        success: (msg, ...args) => console.log('[OK]', msg, ...args),
        error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
        warning: (msg, ...args) => console.warn('[WARN]', msg, ...args),
        info: (msg, ...args) => console.log('[INFO]', msg, ...args),
        database: (msg, ...args) => console.log('[DB]', msg, ...args),
        log: (level, msg, ...args) => console.log(`[${level.toUpperCase()}]`, msg, ...args)
    };
}

/**
 * Database Utility Functions
 * Handles timestamp normalization, caching, formatting, and other utility functions
 */
class DatabaseUtils {
    constructor() {
        // Duplikat-Cache für bessere Performance
        this.duplicateCache = new Map();
        this.cacheCleanupInterval = null;

        // Pending-Scans Synchronisation
        this.pendingScans = new Map();

        // Cache-Cleanup alle 5 Minuten
        this.startCacheCleanup();
    }

    // ===== CACHE MANAGEMENT =====
    startCacheCleanup() {
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupDuplicateCache();
        }, 5 * 60 * 1000); // 5 Minuten
    }

    cleanupDuplicateCache() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden

        let cleanedCount = 0;
        for (const [key, timestamp] of this.duplicateCache.entries()) {
            if (now - timestamp > maxAge) {
                this.duplicateCache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[CLEAN] Duplikat-Cache bereinigt: ${cleanedCount} Einträge entfernt`);
        }
    }

    clearDuplicateCache() {
        const oldSize = this.duplicateCache.size;
        this.duplicateCache.clear();
        console.log(`[CLEAN] Duplikat-Cache geleert: ${oldSize} Einträge entfernt`);
    }

    getDuplicateCacheStats() {
        return {
            size: this.duplicateCache.size,
            pendingScans: this.pendingScans.size,
            oldestEntry: this.duplicateCache.size > 0 ? Math.min(...this.duplicateCache.values()) : null,
            newestEntry: this.duplicateCache.size > 0 ? Math.max(...this.duplicateCache.values()) : null
        };
    }

    // ===== ZEITSTEMPEL-NORMALISIERUNG =====
    normalizeTimestamp(timestamp) {
        try {
            if (!timestamp) {
                console.warn('[WARN] Leerer Zeitstempel für Normalisierung');
                return new Date().toISOString();
            }

            let date;

            if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'string') {
                // SQL Server DateTime strings richtig parsen
                if (timestamp.includes('T')) {
                    // ISO-Format
                    date = new Date(timestamp);
                } else {
                    // SQL Server Format: "2024-06-24 13:01:30.000"
                    const isoString = timestamp.replace(' ', 'T');
                    date = new Date(isoString);
                }
            } else {
                // Fallback für andere Typen
                date = new Date(timestamp);
            }

            // Validierung
            if (isNaN(date.getTime())) {
                console.warn('[WARN] Ungültiger Zeitstempel für Normalisierung:', timestamp);
                return new Date().toISOString();
            }

            // ISO-String zurückgeben für konsistente Verarbeitung
            return date.toISOString();

        } catch (error) {
            customConsole.error('Fehler bei Zeitstempel-Normalisierung:', error, timestamp);
            return new Date().toISOString();
        }
    }

    formatSQLDateTime(date) {
        try {
            if (!(date instanceof Date)) {
                date = new Date(date);
            }

            if (isNaN(date.getTime())) {
                throw new Error('Ungültiges Datum');
            }

            // Formatiert JavaScript Date für SQL Server (ISO-Format ohne T)
            return date.toISOString().slice(0, 19).replace('T', ' ');
        } catch (error) {
            customConsole.error('Fehler bei SQL-DateTime-Formatierung:', error);
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    parseSQLDateTime(sqlDateTime) {
        try {
            return this.normalizeTimestamp(sqlDateTime);
        } catch (error) {
            customConsole.error('Fehler beim Parsen des SQL-DateTime:', error);
            return new Date().toISOString();
        }
    }

    // ===== FORMATIERUNGSHILFEN =====
    formatRelativeTime(timestamp) {
        try {
            const now = new Date();
            const date = new Date(timestamp);
            const diffMs = now.getTime() - date.getTime();

            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffSeconds < 60) return `vor ${diffSeconds} Sekunde${diffSeconds !== 1 ? 'n' : ''}`;
            if (diffMinutes < 60) return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? 'n' : ''}`;
            if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
            if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;

            return new Date(date).toLocaleDateString('de-DE');
        } catch (error) {
            return 'Unbekannt';
        }
    }

    formatSessionDuration(totalSeconds) {
        if (!totalSeconds || totalSeconds < 0) return '0s';

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // ===== QR-CODE DEKODIERUNG BASIEREND AUF DECODER.PY =====
    /**
     * Dekodiert QR-Code Daten basierend auf der Python decoder.py Logik
     * @param {string} data - Rohe QR-Code Daten
     * @returns {Object} - Dekodierte Informationen
     */
    parseQRCodeData(data) {
        const result = {
            auftrags_nr: "",
            paket_nr: "",
            kunden_name: "",
            original_data: data
        };

        if (!data || typeof data !== 'string') {
            return result;
        }

        try {
            // Spezielles durch ^ getrenntes Format (hat höchste Priorität)
            if (data.includes('^')) {
                const parts = data.split('^');

                // Wir benötigen mindestens 4 Teile für Auftragsnummer und Paketnummer
                if (parts.length >= 4) {
                    // Auftragsnummer ist im zweiten Feld (Index 1)
                    result.auftrags_nr = parts[1] || "";

                    // Paketnummer ist im vierten Feld (Index 3)
                    result.paket_nr = parts[3] || "";

                    // Falls verfügbar, Kundennummer oder ID im dritten Feld (Index 2)
                    if (parts.length > 2 && parts[2]) {
                        result.kunden_name = `Kunden-ID: ${parts[2]}`;
                    }

                    // Bei diesem Format die weiteren Prüfungen überspringen
                    return result;
                }
            }

            // Versuch, die Auftragsnummer zu extrahieren
            // Basierend auf den Beispielbildern, Muster "NL-XXXXXXX" oder ähnlich
            const auftragsNrMatch = data.match(/[A-Z]{2}-\d+/);
            if (auftragsNrMatch) {
                result.auftrags_nr = auftragsNrMatch[0];
            }

            // Versuch, die Paketnummer zu extrahieren
            // Langer numerischer Code, wie in den Beispielbildern
            const paketNrMatch = data.match(/\d{10,}/);
            if (paketNrMatch) {
                result.paket_nr = paketNrMatch[0];
            }

            // Versuch, den Kundennamen zu extrahieren
            // Dies ist schwieriger und hängt vom Format der QR-Code-Daten ab
            if (data.includes("KUNDENNAME:")) {
                const parts = data.split("KUNDENNAME:");
                if (parts.length > 1) {
                    let kundenName = parts[1].trim();
                    // Bis zum nächsten Schlüsselwort oder Ende nehmen
                    const endMarkers = ["PAKET-NR", "AUFTRAG", "\n"];
                    for (const marker of endMarkers) {
                        if (kundenName.includes(marker)) {
                            kundenName = kundenName.split(marker)[0].trim();
                            break;
                        }
                    }
                    result.kunden_name = kundenName;
                }
            }

            // Zusätzliche Suche für andere Formate
            // Nach "Referenz: XXX" oder ähnlichen Patterns suchen
            if (!result.auftrags_nr) {
                const referenzMatch = data.match(/Referenz:\s+([A-Z0-9-]+)/);
                if (referenzMatch) {
                    result.auftrags_nr = referenzMatch[1];
                }
            }

            // Nach "Tracking: XXX" oder ähnlichen Patterns suchen
            if (!result.paket_nr) {
                const trackingMatch = data.match(/Tracking:\s+(\d+)/);
                if (trackingMatch) {
                    result.paket_nr = trackingMatch[1];
                }
            }

            return result;

        } catch (error) {
            console.error('Fehler beim Dekodieren der QR-Code Daten:', error);
            return result;
        }
    }

    // ===== PAYLOADJSON PARSE-METHODEN =====
    parsePayloadJson(payloadJson) {
        if (!payloadJson) return null;

        try {
            // Falls payloadJson ein String ist, parse es
            let parsed;
            if (typeof payloadJson === 'string') {
                parsed = JSON.parse(payloadJson);
            } else {
                parsed = payloadJson;
            }

            // Spezielle Behandlung für dekodierte QR-Codes
            if (parsed.type === 'decoded_qr') {
                return {
                    ...parsed,
                    display: this.createDecodedQRDisplay(parsed.decoded),
                    summary: this.createQRSummary(parsed.decoded)
                };
            }

            // Zusätzliche Verarbeitung je nach Type
            switch (parsed.type) {
                case 'star_separated':
                    return {
                        ...parsed,
                        fields: {
                            field1: parsed.parts?.[0] || null,
                            field2: parsed.parts?.[1] || null,
                            field3: parsed.parts?.[2] || null,
                            field4: parsed.parts?.[3] || null,
                            field5: parsed.parts?.[4] || null,
                            field6: parsed.parts?.[5] || null
                        },
                        display: `${parsed.parts?.slice(0, 3).join(' • ')}...` || parsed.raw
                    };

                case 'alphanumeric':
                    // Erweiterte Behandlung für Caret-getrennte Codes (erkannt als alphanumeric)
                    if (parsed.code && parsed.code.includes('^')) {
                        const parts = parsed.code.split('^');
                        return {
                            ...parsed,
                            type: 'caret_separated',
                            parts: parts,
                            fields: {
                                field1: parts[0] || null,
                                field2: parts[1] || null,
                                field3: parts[2] || null,
                                field4: parts[3] || null,
                                field5: parts[4] || null,
                                field6: parts[5] || null
                            },
                            display: `${parts.slice(0, 3).join(' • ')}...`,
                            parts_count: parts.length
                        };
                    }
                    return {
                        ...parsed,
                        display: parsed.code,
                        formatted: parsed.code.replace(/(\w{4})/g, '$1 ').trim()
                    };

                case 'barcode':
                    return {
                        ...parsed,
                        display: `Barcode: ${parsed.code}`,
                        formatted: parsed.code.replace(/(\d{4})/g, '$1 ').trim()
                    };

                case 'url':
                    return {
                        ...parsed,
                        display: `🔗 ${parsed.url}`,
                        domain: parsed.url.match(/https?:\/\/([^\/]+)/)?.[1]
                    };

                case 'text':
                    return {
                        ...parsed,
                        display: parsed.content?.length > 50
                            ? parsed.content.substring(0, 50) + '...'
                            : parsed.content
                    };

                default:
                    return { ...parsed, display: parsed.raw || 'Unknown format' };
            }
        } catch (error) {
            console.warn('Fehler beim Parsen der PayloadJson:', error);

            // Fallback: Versuche direkt aus RawPayload zu dekodieren
            if (typeof payloadJson === 'string' && !payloadJson.startsWith('{')) {
                // Es ist wahrscheinlich ein RawPayload String
                const decodedData = this.parseQRCodeData(payloadJson);
                return {
                    type: 'decoded_qr_fallback',
                    raw: payloadJson,
                    decoded: decodedData,
                    display: this.createDecodedQRDisplay(decodedData),
                    summary: this.createQRSummary(decodedData)
                };
            }

            return { type: 'error', raw: payloadJson, display: 'Parse Error' };
        }
    }

    /**
     * Erstellt eine benutzerfreundliche Anzeige für dekodierte QR-Codes
     * @param {Object} decoded - Dekodierte QR-Code Daten
     * @returns {string} - Formatierte Anzeige
     */
    createDecodedQRDisplay(decoded) {
        if (!decoded) return 'Keine dekodierten Daten';

        const parts = [];

        if (decoded.auftrags_nr) {
            parts.push(`Auftrag: ${decoded.auftrags_nr}`);
        }

        if (decoded.paket_nr) {
            parts.push(`Paket: ${decoded.paket_nr}`);
        }

        if (decoded.kunden_name) {
            parts.push(`${decoded.kunden_name}`);
        }

        return parts.length > 0 ? parts.join(' • ') : 'Unstrukturierte Daten';
    }

    /**
     * Erstellt eine Zusammenfassung für dekodierte QR-Codes
     * @param {Object} decoded - Dekodierte QR-Code Daten
     * @returns {Object} - Zusammenfassung
     */
    createQRSummary(decoded) {
        if (!decoded) return { type: 'empty', message: 'Keine Daten' };

        const hasAuftrag = !!decoded.auftrags_nr;
        const hasPaket = !!decoded.paket_nr;
        const hasKunde = !!decoded.kunden_name;

        if (hasAuftrag && hasPaket) {
            return {
                type: 'complete',
                message: 'Vollständige Paketinformationen',
                icon: '📦',
                color: 'success'
            };
        } else if (hasAuftrag || hasPaket) {
            return {
                type: 'partial',
                message: 'Teilweise Paketinformationen',
                icon: '📋',
                color: 'warning'
            };
        } else {
            return {
                type: 'minimal',
                message: 'Minimale Informationen',
                icon: '📄',
                color: 'info'
            };
        }
    }

    /**
     * Extrahiert dekodierte Daten aus PayloadJson oder direkt aus RawPayload
     * @param {string} payloadJson - JSON Payload (kann auch null/undefined sein)
     * @param {string} rawPayload - Raw QR-Code Payload als Fallback
     * @returns {Object|null} - Dekodierte Daten oder null
     */
    extractDecodedData(payloadJson, rawPayload = null) {
        try {
            // Versuche zuerst PayloadJson zu parsen
            if (payloadJson) {
                let parsed;
                if (typeof payloadJson === 'string') {
                    parsed = JSON.parse(payloadJson);
                } else {
                    parsed = payloadJson;
                }

                if (parsed.type === 'decoded_qr' && parsed.decoded) {
                    return parsed.decoded;
                }
            }

            // Fallback: Dekodiere direkt aus RawPayload
            if (rawPayload) {
                return this.parseQRCodeData(rawPayload);
            }

            return null;
        } catch (error) {
            // Bei Parsing-Fehlern: Fallback auf RawPayload
            if (rawPayload) {
                return this.parseQRCodeData(rawPayload);
            }
            return null;
        }
    }

    // ===== QR-CODE FORMAT-ERKENNUNG =====
    getQRCodeFormat(payloadJson, rawPayload = null) {
        try {
            let parsed = null;

            // Versuche PayloadJson zu parsen
            if (payloadJson) {
                if (typeof payloadJson === 'string') {
                    parsed = JSON.parse(payloadJson);
                } else {
                    parsed = payloadJson;
                }
            }

            // Spezielle Behandlung für dekodierte QR-Codes
            if (parsed && parsed.type === 'decoded_qr') {
                const { decoded } = parsed;
                const hasAuftrag = decoded?.auftrags_nr;
                const hasPaket = decoded?.paket_nr;
                const hasKunde = decoded?.kunden_name;

                if (hasAuftrag && hasPaket) {
                    return {
                        icon: '📦',
                        name: 'Vollständig',
                        color: 'green',
                        description: 'Auftrag + Paket'
                    };
                } else if (hasAuftrag || hasPaket) {
                    return {
                        icon: '📋',
                        name: 'Teilweise',
                        color: 'orange',
                        description: hasAuftrag ? 'Nur Auftrag' : 'Nur Paket'
                    };
                } else {
                    return {
                        icon: '📄',
                        name: 'Minimal',
                        color: 'blue',
                        description: hasKunde ? 'Nur Kunde' : 'Unstrukturiert'
                    };
                }
            }

            // Fallback: Analysiere RawPayload direkt
            if (rawPayload) {
                if (rawPayload.includes('^')) {
                    return {
                        icon: '🔸',
                        name: 'Caret-Format',
                        color: 'blue',
                        description: 'Paket-/Auftragsdaten'
                    };
                }

                if (/[A-Z]{2}-\d+/.test(rawPayload)) {
                    return {
                        icon: '📋',
                        name: 'Auftragscode',
                        color: 'blue',
                        description: 'Auftragsnummer erkannt'
                    };
                }

                if (/\d{10,}/.test(rawPayload)) {
                    return {
                        icon: '📦',
                        name: 'Paketcode',
                        color: 'green',
                        description: 'Paketnummer erkannt'
                    };
                }
            }

            // Standard-Formate wenn PayloadJson verfügbar ist
            if (parsed) {
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

    // ===== CLEANUP =====
    cleanup() {
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = null;
        }
    }
}

module.exports = DatabaseUtils;