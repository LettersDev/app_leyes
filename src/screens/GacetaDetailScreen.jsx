import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import {
    Text, Card, Button, Divider, ActivityIndicator, IconButton, Chip
} from 'react-native-paper';
import { COLORS } from '../utils/constants';

const TSJ_BASE = 'http://historico.tsj.gob.ve';

/**
 * Convierte cualquier URL de PDF en un visor embebido (Google Docs Viewer).
 * Esto permite ver el PDF dentro del WebView sin que Android lo intente abrir externamente.
 */
const toPdfViewerUrl = (pdfUrl) => {
    const abs = pdfUrl.startsWith('http') ? pdfUrl : `${TSJ_BASE}/${pdfUrl.replace(/^\//, '')}`;
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
};

const GacetaDetailScreen = ({ route }) => {
    const { gaceta } = route.params;
    const webViewRef = useRef(null);

    // URL base de la gaceta (puede ser HTML o PDF directo)
    const folder = gaceta.tipo?.includes('Extra') ? 'gaceta_ext' : 'gaceta';
    const rawNum = (gaceta.numero_display || gaceta.numero?.toString() || '').replace(/\./g, '');
    const baseUrl = gaceta.url_original || `${TSJ_BASE}/${folder}/blanco.asp?nrogaceta=${rawNum}`;

    const isUrlValid = baseUrl && !baseUrl.endsWith('/null') && !baseUrl.includes('/null/');
    const isExtra = gaceta.tipo?.includes('Extra');
    const isPdfDirect = /\.pdf$/i.test(baseUrl);

    // Si la URL ya es un PDF → cargar directamente en el visor. Si es la página HTML → cargar tal cual.
    const initialUrl = isPdfDirect ? toPdfViewerUrl(baseUrl) : baseUrl;

    // Estados
    const [mode, setMode] = useState('detail'); // 'detail' | 'webview'
    const [webLoading, setWebLoading] = useState(true);
    const [currentPdfUrl, setCurrentPdfUrl] = useState(null); // URL del PDF que está viendo
    const [webviewSource, setWebviewSource] = useState({ uri: initialUrl });

    const handleVerGaceta = () => {
        if (!isUrlValid) {
            Alert.alert(
                'Documento No Disponible',
                'El documento de esta Gaceta no está disponible para visualización directa.',
                [{ text: 'OK' }]
            );
            return;
        }
        setWebviewSource({ uri: initialUrl });
        setCurrentPdfUrl(isPdfDirect ? baseUrl : null);
        setMode('webview');
    };

    /**
     * Intercepta la navegación del WebView.
     * Si el usuario hace clic en un enlace .pdf dentro del WebView del TSJ, lo redirigimos
     * a Google Docs Viewer en lugar de dejar que Android lo maneje con el diálogo "Abrir con".
     */
    const handleShouldStartLoad = (request) => {
        const url = request.url;

        // Si el WebView intenta navegar a un PDF → interceptar y cargar el visor
        if (/\.pdf($|\?)/i.test(url) && !url.includes('docs.google.com')) {
            const viewerUrl = toPdfViewerUrl(url);
            setCurrentPdfUrl(url);               // guardamos la URL real del PDF para descarga
            setWebviewSource({ uri: viewerUrl }); // redirigimos al visor
            return false; // cancelamos la navegación original
        }

        // Bloqueamos cualquier enlace que salga del dominio TSJ o Google para evitar salir de la app
        if (url.startsWith('http') && !url.includes('tsj.gob.ve') && !url.includes('docs.google.com')) {
            // Si es un link externo irrelevante, lo ignoramos
            return false;
        }

        return true;
    };

    // Script inyectado para mejorar la apariencia de la página TSJ y resaltar los links de PDF
    const injectedJS = `
        (function() {
            var style = document.createElement('style');
            style.innerHTML = \`
                body { font-family: -apple-system, sans-serif !important; font-size: 15px !important;
                        line-height: 1.7 !important; background: #fff !important; padding: 16px !important; }
                img[src*="logo"], img[src*="banner"], [id*="header"], [id*="footer"],
                [class*="header"], [class*="footer"] { display: none !important; }
                a[href*=".pdf"], a[href*=".PDF"] {
                    display: block !important; padding: 14px 16px !important; margin: 10px 0 !important;
                    background: #eff6ff !important; border-left: 4px solid #3b82f6 !important;
                    border-radius: 8px !important; font-size: 14px !important;
                    text-decoration: none !important; color: #1d4ed8 !important; font-weight: 600 !important;
                }
                a[href*=".pdf"]::before, a[href*=".PDF"]::before {
                    content: "📄 ";
                }
            \`;
            document.head.appendChild(style);
        })();
        true;
    `;

    // ─── Vista WebView ────────────────────────────────────────────────────────
    if (mode === 'webview') {
        return (
            <View style={{ flex: 1, backgroundColor: '#fff' }}>
                {/* Barra superior */}
                <View style={styles.webviewBar}>
                    <IconButton
                        icon="arrow-left"
                        iconColor={COLORS.primary}
                        size={22}
                        onPress={() => {
                            // Si estamos viendo un PDF, volver a la página de la gaceta
                            if (currentPdfUrl && !isPdfDirect) {
                                setCurrentPdfUrl(null);
                                setWebviewSource({ uri: initialUrl });
                            } else {
                                setMode('detail');
                            }
                        }}
                    />
                    <Text style={styles.webviewBarTitle} numberOfLines={1}>
                        {currentPdfUrl ? '📄 PDF de la Gaceta' : `Gaceta N° ${gaceta.numero_display || gaceta.numero}`}
                    </Text>
                    {currentPdfUrl && (
                        <IconButton
                            icon="download"
                            iconColor={COLORS.primary}
                            size={22}
                            onPress={() => {
                                // Mostrar opciones de descarga
                                Alert.alert(
                                    'Descargar PDF',
                                    'El PDF se abrirá para que puedas descargarlo o compartirlo.',
                                    [
                                        { text: 'Cancelar', style: 'cancel' },
                                        {
                                            text: 'Descargar',
                                            onPress: () => {
                                                // Intentamos abrir la URL directa del PDF para descarga
                                                import('react-native').then(({ Linking }) => {
                                                    Linking.openURL(currentPdfUrl);
                                                });
                                            }
                                        }
                                    ]
                                );
                            }}
                        />
                    )}
                </View>

                <WebView
                    ref={webViewRef}
                    source={webviewSource}
                    injectedJavaScript={injectedJS}
                    onLoadStart={() => setWebLoading(true)}
                    onLoadEnd={() => setWebLoading(false)}
                    style={{ flex: 1 }}
                    javaScriptEnabled
                    domStorageEnabled
                    mixedContentMode="always"
                    startInLoadingState={false}
                    onShouldStartLoadWithRequest={handleShouldStartLoad}
                />
                {webLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={COLORS.primary} size="large" />
                        <Text style={{ color: COLORS.textSecondary, marginTop: 10 }}>
                            {currentPdfUrl ? 'Cargando PDF...' : 'Cargando Gaceta...'}
                        </Text>
                    </View>
                )}
            </View>
        );
    }

    // ─── Vista Detalle ────────────────────────────────────────────────────────
    // El sumario usa '-- ' (dos guiones ASCII) como separador entre decretos
    const rawSumario = gaceta.sumario || '';
    const sumarioLines = rawSumario
        .split(/\s*--\s+/)
        .map(l => l.trim())
        .filter(l => l.length > 5);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>

            {/* Tarjeta principal */}
            <Card style={styles.card}>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Text style={styles.numLabel}>
                            Gaceta N° {gaceta.numero_display || gaceta.numero}
                        </Text>
                        <Chip
                            compact
                            textStyle={{ fontSize: 10 }}
                            style={isExtra ? styles.chipExtra : styles.chipOrd}
                        >
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
                    <View style={styles.leftActions}>
                        <IconButton
                            icon="download-outline"
                            iconColor={COLORS.primary}
                            size={24}
                            onPress={handleVerGaceta}
                            tooltip="Descargar"
                        />
                        <IconButton
                            icon="open-in-new"
                            iconColor={COLORS.primary}
                            size={24}
                            onPress={handleVerGaceta}
                            tooltip="Abrir en app"
                        />
                    </View>
                    <Button
                        mode="contained"
                        onPress={handleVerGaceta}
                        buttonColor={COLORS.secondary || COLORS.primary}
                        labelStyle={{ fontSize: 13 }}
                        icon="book-open-variant"
                    >
                        Ver Gaceta
                    </Button>
                </Card.Actions>
            </Card>

            {/* Sumario */}
            {sumarioLines.length > 0 && (
                <>
                    <Divider style={{ marginVertical: 8 }} />
                    <Text style={styles.sectionLabel}>SUMARIO</Text>
                    {sumarioLines.map((line, i) => (
                        <View key={i}>
                            <View style={styles.sumarioItem}>
                                <Text style={styles.bullet}>•</Text>
                                <Text style={styles.sumarioLine}>{line}</Text>
                            </View>
                            {i < sumarioLines.length - 1 && (
                                <Divider style={styles.sumarioDivider} />
                            )}
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

    // WebView bar
    webviewBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        elevation: 2,
        minHeight: 52,
    },
    webviewBarTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.text,
        textAlign: 'center',
    },
    loadingOverlay: {
        position: 'absolute', top: 52, left: 0, right: 0, bottom: 0,
        justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff'
    },

    // Card
    card: { marginBottom: 12, elevation: 2, backgroundColor: '#fff' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    numLabel: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
    chipOrd: { backgroundColor: '#DBEAFE' },
    chipExtra: { backgroundColor: '#FEE2E2' },
    metaRow: { flexDirection: 'row', marginBottom: 4 },
    metaLabel: { fontWeight: 'bold', width: 55, color: '#777', fontSize: 13 },
    metaValue: { flex: 1, color: '#333', fontSize: 13 },
    titulo: { marginTop: 8, fontSize: 14, color: '#444', lineHeight: 20 },
    cardActions: { justifyContent: 'space-between', paddingHorizontal: 8 },
    leftActions: { flexDirection: 'row' },

    // Sumario
    sectionLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 10, paddingHorizontal: 4 },
    sumarioItem: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4 },
    sumarioDivider: { marginHorizontal: 4, backgroundColor: '#e5e7eb' },
    bullet: { color: COLORS.primary, marginRight: 8, fontWeight: 'bold', marginTop: 2 },
    sumarioLine: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 22 },
});

export default GacetaDetailScreen;
