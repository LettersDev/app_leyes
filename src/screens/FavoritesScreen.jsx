import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { List, Card, Title, Paragraph, IconButton, Text, Chip, Divider } from 'react-native-paper';
import FavoritesManager from '../utils/favoritesManager';
import { COLORS } from '../utils/constants';

const FavoritesScreen = ({ navigation }) => {
    const [favorites, setFavorites] = useState([]);
    const [filter, setFilter] = useState('all');

    useFocusEffect(
        useCallback(() => {
            loadFavorites();
        }, [])
    );

    const loadFavorites = async () => {
        const favs = await FavoritesManager.getFavorites();
        setFavorites(favs);
    };

    const toggleFavorite = async (item) => {
        await FavoritesManager.toggleFavorite(item);
        loadFavorites();
    };

    const renderFilterItem = useCallback(({ item }) => (
        <Chip
            selected={filter === item.id}
            onPress={() => setFilter(item.id)}
            style={styles.filterChip}
        >
            <Text>{item.label}</Text>
        </Chip>
    ), [filter]);

    const getTypeColor = (type) => {
        switch (type) {
            case 'law':
            case 'law_article':
                return COLORS.primary;
            case 'juris':
                return COLORS.secondary;
            case 'gaceta':
                return COLORS.tertiary; // Assuming a tertiary color for gaceta
            default:
                return COLORS.gray;
        }
    };

    const renderItem = useCallback(({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => {
                if (item.type === 'law') {
                    navigation.navigate('LawDetail', { lawId: item.data.lawId });
                } else if (item.type === 'law_article') {
                    navigation.navigate('LawDetail', {
                        lawId: item.data.lawId,
                        jumpToIndex: item.data.itemIndex
                    });
                } else if (item.type === 'gaceta') {
                    navigation.navigate('JurisprudenceDetail', {
                        url: item.data.url_original,
                        title: item.title || 'Gaceta Oficial'
                    });
                } else if (item.type === 'juris') {
                    navigation.navigate('JurisprudenceDetail', {
                        url: item.data.url_original,
                        title: `Sentencia Exp: ${item.data.expediente}`
                    });
                }
            }}
        >
            <Card style={styles.favoriteCard}>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) }]}>
                            <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
                        </View>
                        <IconButton
                            icon="star"
                            iconColor="#FFD700"
                            size={20}
                            style={{ margin: 0 }}
                            onPress={() => toggleFavorite(item)}
                        />
                    </View>
                    <Title style={styles.cardTitle} numberOfLines={2}>{item.title}</Title>
                    <Paragraph style={styles.cardSubtitle} numberOfLines={2}>{item.subtitle}</Paragraph>
                </Card.Content>
            </Card>
        </TouchableOpacity>
    ), [navigation, toggleFavorite]);

    const filteredFavorites = filter === 'all'
        ? favorites
        : favorites.filter(f => f.type === filter || (filter === 'laws' && (f.type === 'law' || f.type === 'law_article')));

    return (
        <View style={styles.container}>
            <View style={styles.filterContainer}>
                <FlatList
                    horizontal
                    data={[
                        { id: 'all', label: 'Todo' },
                        { id: 'laws', label: 'Leyes/Arts' },
                        { id: 'juris', label: 'Jurisprudencia' }
                    ]}
                    renderItem={renderFilterItem}
                    keyExtractor={item => item.id}
                    showsHorizontalScrollIndicator={false}
                />
            </View>

            <FlatList
                data={filteredFavorites}
                renderItem={renderItem}
                keyExtractor={(item, index) => `fav-${item.id}-${index}`}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <IconButton icon="star-outline" size={60} iconColor="#ccc" />
                        <Text style={styles.emptyText}>No tienes favoritos guardados todavía.</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    filterContainer: { padding: 10, backgroundColor: '#fff', boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)' },
    filterChip: { marginRight: 8 },
    list: { padding: 16 },
    title: { fontSize: 16, lineHeight: 22, color: COLORS.primary },
    subtitle: { fontSize: 13, color: '#666' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#999', textAlign: 'center', paddingHorizontal: 40 },
});

export default FavoritesScreen;
