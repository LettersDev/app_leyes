import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { COLORS } from '../utils/constants';

const JurisprudenceDetailScreen = ({ route }) => {
    const { url, title } = route.params;
    return (
        <View style={styles.container}>
            <View style={styles.iconWrap}>
                <Text style={styles.icon}>{String.fromCodePoint(0x2696)}</Text>
            </View>
            <Text style={styles.titleText} numberOfLines={3}>
                {title || 'Sentencia del TSJ'}
            </Text>
            <Text style={styles.bodyText}>
                El servidor del TSJ no esta disponible en este momento.
                Puedes leer la sentencia directamente desde tu navegador.
            </Text>
            <Pressable
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
                onPress={() => Linking.openURL(url)}
            >
                <Text style={styles.btnText}>Abrir en el navegador</Text>
            </Pressable>
            <Text style={styles.urlText} numberOfLines={2}>{url}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', padding: 32 },
    iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    icon: { fontSize: 38 },
    titleText: { fontSize: 16, fontWeight: '700', color: COLORS.primary, textAlign: 'center', marginBottom: 16, lineHeight: 22 },
    bodyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 21, marginBottom: 28 },
    btn: { backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginBottom: 16 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    urlText: { fontSize: 10, color: '#CBD5E1', textAlign: 'center', paddingHorizontal: 10 },
});

export default JurisprudenceDetailScreen;