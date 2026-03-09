import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { COLORS } from '../utils/constants';

// URLs de la app en las tiendas. Reemplaza con los links reales cuando estén disponibles.
const STORE_URL = Platform.OS === 'ios'
    ? 'https://apps.apple.com/app/tuley/id000000000' // <- Reemplazar con ID real de App Store
    : 'https://play.google.com/store/apps/details?id=com.lettersdev.tuley';

/**
 * @param {boolean}  visible        - Controla si el modal está visible
 * @param {string}   currentVersion - Versión instalada actualmente
 * @param {string}   latestVersion  - Versión más reciente disponible
 * @param {function} onDismiss      - Callback al presionar "Más tarde"
 */
export default function UpdateModal({ visible, currentVersion, latestVersion, onDismiss }) {
    const { width } = useWindowDimensions();
    const handleUpdate = async () => {
        try {
            const supported = await Linking.canOpenURL(STORE_URL);
            if (supported) {
                await Linking.openURL(STORE_URL);
            }
        } catch (err) {
            console.error('UpdateModal: No se pudo abrir la tienda:', err);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { width: Math.min(width - 48, 380) }]}>
                    {/* Icono decorativo */}
                    <View style={styles.iconContainer}>
                        <Text style={styles.iconEmoji}>⚖️</Text>
                    </View>

                    {/* Badge de novedad */}
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>NUEVA VERSIÓN</Text>
                    </View>

                    {/* Título */}
                    <Text style={styles.title}>Actualización disponible</Text>

                    {/* Descripción */}
                    <Text style={styles.description}>
                        Hay una nueva versión de <Text style={styles.appName}>TuLey</Text> con mejoras y novedades para ti.
                    </Text>

                    {/* Versiones */}
                    <View style={styles.versionsRow}>
                        <View style={styles.versionBox}>
                            <Text style={styles.versionLabel}>Actual</Text>
                            <Text style={styles.versionValue}>{currentVersion}</Text>
                        </View>
                        <View style={styles.versionArrow}>
                            <Text style={styles.versionArrowText}>→</Text>
                        </View>
                        <View style={[styles.versionBox, styles.versionBoxNew]}>
                            <Text style={[styles.versionLabel, styles.versionLabelNew]}>Nueva</Text>
                            <Text style={[styles.versionValue, styles.versionValueNew]}>{latestVersion}</Text>
                        </View>
                    </View>

                    {/* Botón principal */}
                    <TouchableOpacity style={styles.updateButton} onPress={handleUpdate} activeOpacity={0.85}>
                        <Text style={styles.updateButtonText}>Actualizar ahora</Text>
                    </TouchableOpacity>

                    {/* Botón secundario */}
                    <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.7}>
                        <Text style={styles.dismissButtonText}>Más tarde</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        boxShadow: '0px 20px 25px -5px rgba(0, 0, 0, 0.1)',
    },

    // Icono
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconEmoji: {
        fontSize: 34,
    },

    // Badge
    badge: {
        backgroundColor: COLORS.accent,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: 14,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },

    // Texto principal
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.text,
        textAlign: 'center',
        marginBottom: 10,
    },
    description: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 22,
    },
    appName: {
        color: COLORS.accent,
        fontWeight: '700',
    },

    // Versiones
    versionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        backgroundColor: COLORS.background,
        borderRadius: 12,
        padding: 14,
        width: '100%',
        justifyContent: 'center',
        gap: 12,
    },
    versionBox: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: COLORS.border,
        minWidth: 80,
    },
    versionBoxNew: {
        backgroundColor: COLORS.primary,
    },
    versionLabel: {
        fontSize: 10,
        color: COLORS.textSecondary,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 3,
    },
    versionLabelNew: {
        color: 'rgba(255,255,255,0.6)',
    },
    versionValue: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.text,
    },
    versionValueNew: {
        color: '#FFFFFF',
    },
    versionArrow: {
        paddingHorizontal: 4,
    },
    versionArrowText: {
        fontSize: 20,
        color: COLORS.accent,
        fontWeight: '700',
    },

    // Botones
    updateButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 14,
        paddingVertical: 15,
        width: '100%',
        alignItems: 'center',
        marginBottom: 10,
        boxShadow: '0px 10px 15px -3px rgba(15, 23, 42, 0.1)',
    },
    updateButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    dismissButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
    },
    dismissButtonText: {
        color: COLORS.textSecondary,
        fontSize: 14,
        fontWeight: '500',
    },
});
