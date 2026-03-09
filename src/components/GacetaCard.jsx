import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Title, Paragraph, IconButton, Text } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const GacetaCard = ({ item, isFavorite, onToggleFavorite, onPress, cleanTitle }) => (
    <Card style={styles.card} onPress={() => onPress(item)}>
        <Card.Content>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <Title style={styles.cardTitle}>{cleanTitle(item.titulo)}</Title>
                    <Paragraph style={styles.cardSubtitle}>{item.subtitulo}</Paragraph>
                </View>
                <IconButton
                    icon={isFavorite ? "star" : "star-outline"}
                    iconColor={isFavorite ? "#FFD700" : COLORS.textSecondary}
                    size={24}
                    onPress={() => onToggleFavorite(item)}
                />
            </View>
            <View style={styles.chipsRow}>
                <Text style={styles.dateText}>{item.fecha}</Text>
                {item.tipo && (
                    <View style={[styles.badge, item.tipo.includes('Extra') ? styles.badgeExtra : styles.badgeOrd]}>
                        <Text style={styles.badgeText}>{item.tipo}</Text>
                    </View>
                )}
            </View>
        </Card.Content>
    </Card>
);

const styles = StyleSheet.create({
    card: {
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: '#fff',
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerLeft: {
        flex: 1,
        marginRight: 8,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
        lineHeight: 22,
    },
    cardSubtitle: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    chipsRow: {
        flexDirection: 'row',
        marginTop: 12,
        alignItems: 'center',
    },
    dateText: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginRight: 10,
        fontFamily: 'monospace'
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeOrd: {
        backgroundColor: '#DBEAFE',
    },
    badgeExtra: {
        backgroundColor: '#FEE2E2',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#1E40AF',
    },
});

export default React.memo(GacetaCard);
