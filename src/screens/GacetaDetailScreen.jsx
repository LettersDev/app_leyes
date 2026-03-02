import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text, Card, Button, Divider, IconButton, Chip, ActivityIndicator } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const TSJ_BASE = 'http://historico.tsj.gob.ve';

const toGoogleViewer = (pdfUrl) => {
    const clean = pdfUrl.split('#')[0];
    const abs = clean.startsWith('http') ? clean : `${TSJ_BASE}/${clean.replace(/^\//, '')}`;
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
};

// Limpia los estilos del TSJ igual que JurisprudenceDetailScreen
const INJECTED_CSS = `
    (function() {
        var style = document.createElement('style');
        style.innerHTML = ' \
            #banner, #footer, #navigation, .portal-add-content, \
            .portlet-topper, .lfr-message, header, footer, nav, aside { display: none !important; } \
            body, .portlet-content, .portlet-boundary { background: white !important; padding: 10px !important; } \
            * { font-family: sans-serif !important; } \
            a[href*=".pdf"], a[href*=".PDF"] { \
                display: block !important; padding: 14px !important; margin: 10px 0 !important; \
                background: #eff6ff !important; border-left: 4px solid #3b82f6 !important; \
                border-radius: 8px !important; color: #1d4ed8 !important; font-weight: bold !important; \
                text-decoration: none !important; \
            } \
        ';
        document.head.appendChild(style);

        // Forzar que todos los links se abran en la misma ventana
        document.querySelectorAll('a').forEach(function(a) { a.target = '_self'; });
    })();
    true;
`;

const GacetaDetailScreen = ({ route }) => {
    const { gaceta } = route.params;
    const webViewRef = useRef(null);

    const folder = gaceta.tipo?.includes('Extra') ? 'gaceta_ext' : 'gaceta';
    const rawNum = (gaceta.numero_display || gaceta.numero?.toString() || '').replace(/\./g, '');
    const baseUrl = gaceta.url_original || `${TSJ_BASE}/${folder}/blanco.asp?nrogaceta=${rawNum}`;
    const isExtra = gaceta.tipo?.includes('Extra');

    const [mode, setMode] = useState('detail'); // 'detail' | 'webview'
    const [webviewSource, setWebviewSource] = useState({ uri: baseUrl });
    const [currentPdfUrl, setCurrentPdfUrl] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    // Ref para leer currentPdfUrl dentro de handleNavigation sin closures stale
    const pdfModeRef = React.useRef(false);

    /**
     * Intercepta enlaces en el WebView:
     * - Si es un PDF → cambia la fuente del WebView al Google Docs Viewer (sin salir de la app)
     * - Si es externo → lo bloquea
     * - Si es TSJ o Google Docs → lo permite
     */
    const handleNavigation = (request) => {
        const url = request.url;
        if (url === 'about:blank') return true;

        // Cuando estamos en el visor de PDF, permitir todo
        // (Google Docs carga recursos de gstatic.com, accounts.google.com, etc.)
        if (pdfModeRef.current) return true;

        if (/\.pdf($|\?|#)/i.test(url)) {
            const cleanPdf = url.split('#')[0];
            const abs = cleanPdf.startsWith('http') ? cleanPdf : `${TSJ_BASE}/${cleanPdf.replace(/^\//, '')}`;
            pdfModeRef.current = true;
            setCurrentPdfUrl(abs);
            setPdfLoading(true);
            setWebviewSource({ uri: toGoogleViewer(url) });
            return false;
        }

        // Permitir TSJ
        if (url.includes('tsj.gob.ve')) return true;

        // Bloquear todo lo demás
        return false;
    };

    // ─── Modo WebView (exactamente como Jurisprudencia) ───────────────────────
    if (mode === 'webview') {
        return (
            <View style={{ flex: 1, backgroundColor: '#fff' }}>
                {/* Barra superior */}
                <View style={styles.bar}>
                    <IconButton icon="arrow-left" iconColor={COLORS.primary} size={22} onPress={() => {
                        if (currentPdfUrl) {
                            pdfModeRef.current = false;
                            setCurrentPdfUrl(null);
                            setPdfLoading(false);
                            setWebviewSource({ uri: baseUrl });
                        } else {
                            setMode('detail');
                        }
                    }} />
                    <Text style={styles.barTitle} numberOfLines={1}>
                        {currentPdfUrl ? '📄 Documento PDF' : `Gaceta N° ${gaceta.numero_display || gaceta.numero}`}
                    </Text>
                    <IconButton icon="open-in-new" iconColor={COLORS.primary} size={22}
                        onPress={() => Linking.openURL(currentPdfUrl || baseUrl)} />
                </View>

                {/* WebView idéntico a JurisprudenceDetailScreen */}
                <WebView
                    ref={webViewRef}
                    source={webviewSource}
                    injectedJavaScript={INJECTED_CSS}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={false}
                    mixedContentMode="always"
                    onShouldStartLoadWithRequest={handleNavigation}
                    onLoadEnd={() => setPdfLoading(false)}
                    originWhitelist={['*']}
                    style={{ flex: 1 }}
                />
                {/* Overlay de carga manual — funciona para cargas iniciales y cambios de source */}
                {pdfLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={COLORS.primary} size="large" />
                        <Text style={{ marginTop: 10, color: '#666', fontWeight: '500' }}>Abriendo documento PDF...</Text>
                        <Text style={{ marginTop: 6, color: '#aaa', fontSize: 12 }}>Esto puede tardar unos segundos</Text>
                    </View>
                )}
            </View>
        );
    }

    // ─── Vista Detalle con Sumario ────────────────────────────────────────────
    const rawSumario = gaceta.sumario || '';

    // Nivel 1: split por salto de línea (datos del scraper nuevo)
    let sumarioLines = rawSumario.split('\n').map(l => l.trim()).filter(l => l.length > 5);

    // Nivel 2: split por doble guión (datos viejos con '-- ')
    if (sumarioLines.length <= 1) {
        sumarioLines = rawSumario.split(/\s*--\s+/).map(l => l.trim()).filter(l => l.length > 8);
    }

    // Nivel 3: split por inicio de nombre institucional (datos sin separador)
    if (sumarioLines.length <= 1) {
        sumarioLines = rawSumario
            .split(/(?=\b(?:Ministerio|Resolución|Decreto|Providencia|Presidencia|Consejo|Asamblea|Fiscalía|Tribunal|Banco Central|Instituto)\b)/)
            .map(l => l.trim())
            .filter(l => l.length > 15);
    }

    // Post-procesamiento: fusionar líneas que son continuación de la anterior.
    // Si el ítem previo NO termina con punto, la siguiente línea es su continuación.
    const merged = [];
    for (const line of sumarioLines) {
        if (merged.length > 0 && !/[.!?]$/.test(merged[merged.length - 1])) {
            merged[merged.length - 1] += ' ' + line;
        } else {
            merged.push(line);
        }
    }
    const finalLines = merged;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Tarjeta de info */}
            <Card style={styles.card}>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Text style={styles.numLabel}>Gaceta N° {gaceta.numero_display || gaceta.numero}</Text>
                        <Chip style={isExtra ? styles.chipExtra : styles.chipOrd} textStyle={{ fontSize: 11 }}>
                            {gaceta.tipo || 'Ordinaria'}
                        </Chip>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Fecha:</Text>
                        <Text style={styles.metaValue}>{gaceta.fecha || '--'}</Text>
                    </View>
                    <Text style={styles.titulo}>{gaceta.titulo}</Text>
                </Card.Content>
                <Card.Actions style={styles.cardActions}>
                    <Button
                        mode="contained"
                        onPress={() => setMode('webview')}
                        buttonColor={COLORS.primary}
                        icon="book-open-variant"
                    >
                        Ver Gaceta
                    </Button>
                </Card.Actions>
            </Card>

            {/* Sumario */}
            {finalLines.length > 0 && (
                <>
                    <Divider style={{ marginVertical: 8 }} />
                    <Text style={styles.sectionLabel}>SUMARIO</Text>
                    {finalLines.map((line, i) => (
                        <View key={i}>
                            <View style={styles.sumarioItem}>
                                <Text style={styles.bullet}>•</Text>
                                <Text style={styles.sumarioLine}>{line}</Text>
                            </View>
                            {i < finalLines.length - 1 && <Divider style={styles.sumarioDivider} />}
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    content: { padding: 12, paddingBottom: 40 },

    bar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb', height: 56,
    },
    barTitle: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1e293b', textAlign: 'center' },

    downloadBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, padding: 8,
    },

    loadingOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', zIndex: 10,
    },

    card: { marginBottom: 12, elevation: 2, backgroundColor: '#fff' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    numLabel: { fontSize: 17, fontWeight: 'bold', color: COLORS.primary },
    chipOrd: { backgroundColor: '#DBEAFE' },
    chipExtra: { backgroundColor: '#FEE2E2' },
    metaRow: { flexDirection: 'row', marginBottom: 4 },
    metaLabel: { fontWeight: 'bold', width: 55, color: '#777', fontSize: 13 },
    metaValue: { flex: 1, color: '#333', fontSize: 13 },
    titulo: { marginTop: 8, fontSize: 14, color: '#444', lineHeight: 20 },
    cardActions: { justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 8 },

    sectionLabel: { fontSize: 11, fontWeight: 'bold', color: '#888', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 4 },
    sumarioItem: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4 },
    sumarioDivider: { marginHorizontal: 4, backgroundColor: '#e5e7eb' },
    bullet: { color: COLORS.primary, marginRight: 8, fontWeight: 'bold', marginTop: 2 },
    sumarioLine: { flex: 1, fontSize: 14, color: COLORS.text || '#333', lineHeight: 22 },
});

export default GacetaDetailScreen;
