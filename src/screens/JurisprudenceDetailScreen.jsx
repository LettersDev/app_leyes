import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme, IconButton, Text } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const JurisprudenceDetailScreen = ({ route, navigation }) => {
    const { url, title } = route.params;
    const [loading, setLoading] = useState(true);
    const theme = useTheme();

    // Script para limpiar la interfaz del TSJ (ocultar cabeceras, pies de página y menús)
    const injectedData = `
        (function() {
            var style = document.createElement('style');
            style.innerHTML = ' \
                #banner, #footer, #navigation, .portal-add-content, \
                .portlet-topper, .lfr-message, #p_p_id_56_INSTANCE_C808K7b2myu1_, \
                header, footer, nav, aside { display: none !important; } \
                body, .portlet-content, .portlet-boundary { background: white !important; padding: 10px !important; } \
                * { font-family: sans-serif !important; } \
            ';
            document.head.appendChild(style);
        })();
    `;

    return (
        <View style={styles.container}>
            <WebView
                source={{ uri: url }}
                injectedJavaScript={injectedData}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={() => (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color={COLORS.primary} size="large" />
                        <Text style={styles.loadingText}>Preparando lectura nativa...</Text>
                    </View>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    webview: {
        flex: 1,
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: {
        marginTop: 15,
        color: '#666',
    }
});

export default JurisprudenceDetailScreen;
