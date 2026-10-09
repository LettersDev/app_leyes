import React, { useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Surface, Avatar, IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const HomeHistory = ({ history, onHistoryPress, onRemoveHistory }) => {
    const renderHistoryItem = useCallback(({ item }) => (
        <View style={styles.historyCardContainer}>
            <Pressable 
                onPress={() => onHistoryPress(item)} 
                style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}
            >
                <Surface elevation={2} style={styles.historyCard}>
                    <View style={styles.historyContent}>
                        <Avatar.Icon
                            size={40}
                            icon={item.type === 'juris' ? 'gavel' : 'book-outline'}
                            style={{ backgroundColor: item.type === 'juris' ? COLORS.error : COLORS.accent }}
                        />
                        <View style={styles.historyInfo}>
                            <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.historySubtitle} numberOfLines={1}>
                                {item.type === 'law' && item.lastArticleIndex > 0
                                    ? `Art. ${item.lastArticleIndex} · ${item.subtitle}`
                                    : item.subtitle}
                            </Text>
                        </View>
                    </View>
                </Surface>
            </Pressable>
            <IconButton
                icon="close-circle"
                size={20}
                iconColor="#EF4444"
                style={styles.removeHistoryButton}
                onPress={() => onRemoveHistory(item.id)}
            />
        </View>
    ), [onHistoryPress, onRemoveHistory]);

    if (history.length === 0) return null;

    return (
        <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Continuar leyendo</Text>
            <FlatList
                horizontal
                data={history}
                keyExtractor={(item, index) => `hist-${item.id}-${index}`}
                showsHorizontalScrollIndicator={false}
                renderItem={renderHistoryItem}
                contentContainerStyle={styles.historyList}
                nestedScrollEnabled={true}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    historySection: {
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 16,
        paddingHorizontal: 20,
        letterSpacing: 0.5,
    },
    historyList: {
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    historyCardContainer: {
        width: 240,
        marginRight: 15,
        paddingTop: 10,
    },
    historyCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    historyContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
    },
    historyInfo: {
        marginLeft: 12,
        flex: 1,
    },
    historyTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    historySubtitle: {
        fontSize: 11,
        color: COLORS.textSecondary,
    },
    removeHistoryButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        margin: 0,
    },
});

export default HomeHistory;
