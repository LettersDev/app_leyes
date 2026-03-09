import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconButton, Title, Surface } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, COLORS } from '../utils/constants';

const LawDetailHeader = ({
    law,
    isOfflineAvailable,
    isDownloadingContent,
    isSearching,
    favoriteIds,
    lawId,
    toggleFavoriteLaw,
    handleShareLaw,
    handleRemoveOffline,
    handleDownloadContent,
    setSettingsVisible,
    formatDate
}) => {
    return (
        <View>
            <LinearGradient
                colors={GRADIENTS.legal}
                style={styles.headerFlat}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <View style={styles.badgeRow}>
                    <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>{law.type?.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                </View>
                <Title style={styles.titleFlat} numberOfLines={2}>{law.title}</Title>
                <View style={styles.headerInfoFlat}>
                    {law.itemCount && (
                        <Text style={styles.itemCountFlat}>{law.itemCount} artículos</Text>
                    )}
                    {law.date && <Text style={styles.dateFlat}> • {formatDate(law.date)}</Text>}
                </View>
                <View style={styles.actionButtonsFlat}>
                    <IconButton
                        icon={favoriteIds.has(lawId) ? "star" : "star-outline"}
                        iconColor={favoriteIds.has(lawId) ? "#FFD700" : "#fff"}
                        size={24}
                        onPress={toggleFavoriteLaw}
                    />
                    <IconButton
                        icon="share-variant"
                        iconColor="#fff"
                        size={24}
                        onPress={handleShareLaw}
                    />
                    <View style={!isOfflineAvailable ? styles.downloadHighlight : null}>
                        <IconButton
                            icon={isOfflineAvailable ? "check-circle" : "download"}
                            iconColor={isOfflineAvailable ? "#4ADE80" : (isDownloadingContent ? "#94A3B8" : "#fff")}
                            size={24}
                            onPress={isOfflineAvailable ? handleRemoveOffline : handleDownloadContent}
                            disabled={isDownloadingContent}
                        />
                    </View>
                    <IconButton
                        icon="format-size"
                        iconColor="#fff"
                        size={24}
                        onPress={() => setSettingsVisible(true)}
                    />
                </View>
            </LinearGradient>

            {!isOfflineAvailable && !isSearching && (
                <Surface style={styles.offlineBanner} elevation={1}>
                    <IconButton icon="information" iconColor={COLORS.accent} size={20} style={{ margin: 0 }} />
                    <View style={{ flex: 1, marginLeft: 5 }}>
                        <Text style={styles.offlineBannerText}>
                            <Text>Esta ley no está descargada. </Text>
                            <Text style={{ fontWeight: 'bold' }}>Presiona el botón de descarga</Text>
                            <Text> para acceder sin internet en el futuro.</Text>
                        </Text>
                    </View>
                </Surface>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    headerFlat: {
        paddingTop: 40,
        paddingBottom: 30,
        paddingHorizontal: 20,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    },
    badgeRow: { flexDirection: 'row', marginBottom: 10 },
    premiumBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
    },
    premiumBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    titleFlat: { color: '#fff', fontSize: 24, fontWeight: 'bold', lineHeight: 30 },
    headerInfoFlat: { flexDirection: 'row', alignItems: 'center', marginTop: 10, opacity: 0.9 },
    itemCountFlat: { color: '#fff', fontSize: 13, fontWeight: '500' },
    dateFlat: { color: '#fff', fontSize: 13 },
    actionButtonsFlat: { flexDirection: 'row', marginTop: 20, alignItems: 'center' },
    downloadHighlight: {
        backgroundColor: 'rgba(255,215,0,0.2)',
        borderRadius: 20,
    },
    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#FFFBEB',
        marginHorizontal: 15,
        marginTop: -15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    offlineBannerText: { fontSize: 12, color: '#92400E', lineHeight: 18 },
});

export default LawDetailHeader;
