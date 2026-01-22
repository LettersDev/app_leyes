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

    const handleRemove = async (item) => {
        await FavoritesManager.toggleFavorite(item);
        loadFavorites();
    };

    const handleNavigate = (item) => {
        if (item.type === 'law') {
            navigation.navigate('LawDetail', { lawId: item.data.lawId });
        } else if (item.type === 'law_article') {
            navigation.navigate('LawDetail', { lawId: item.data.lawId, jumpToIndex: item.data.itemIndex });
        } else if (item.type === 'juris') {
            navigation.navigate('JurisprudenceDetail', {
                url: item.data.url_original,
                title: `Sentencia Exp: ${item.data.expediente}`
            });
        }
    };

    const filteredFavorites = filter === 'all'
        ? favorites
        : favorites.filter(f => f.type === filter || (filter === 'laws' && (f.type === 'law' || f.type === 'law_article')));

    const renderItem = ({ item }) => (
        <Card style={styles.card} onPress={() => handleNavigate(item)}>
            <Card.Content>
                <View style={styles.row}>
                    <View style={styles.content}>
                        <View style={styles.tagRow}>
                            <Chip
                                style={[
                                    styles.tag,
                                    { backgroundColor: item.type === 'juris' ? COLORS.secondary : COLORS.primary }
                                ]}
                                textStyle={styles.tagText}
                                compact
                            >
                                {item.type === 'juris' ? 'Jurisprudencia' : 'Ley'}
                            </Chip>
                            <Text style={styles.dateText}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                        </View>
                        <Title style={styles.title} numberOfLines={2}>{item.title}</Title>
                        <Paragraph style={styles.subtitle} numberOfLines={2}>{item.subtitle}</Paragraph>
                    </View>
                    <IconButton
                        icon="delete-outline"
                        iconColor={COLORS.error}
                        onPress={() => handleRemove(item)}
                    />
                </View>
            </Card.Content>
        </Card>
    );

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
                    renderItem={({ item }) => (
                        <Chip
                            selected={filter === item.id}
                            onPress={() => setFilter(item.id)}
                            style={styles.filterChip}
                        >
                            {item.label}
                        </Chip>
                    )}
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
    filterContainer: { padding: 10, backgroundColor: '#fff', elevation: 2 },
    filterChip: { marginRight: 8 },
    list: { padding: 16 },
    card: { marginBottom: 16, backgroundColor: '#fff', borderRadius: 8 },
    row: { flexDirection: 'row', alignItems: 'center' },
    content: { flex: 1 },
    tagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    tag: { height: 24 },
    tagText: { color: '#fff', fontSize: 10 },
    dateText: { fontSize: 10, color: '#999' },
    title: { fontSize: 16, lineHeight: 22, color: COLORS.primary },
    subtitle: { fontSize: 13, color: '#666' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#999', textAlign: 'center', paddingHorizontal: 40 },
});

export default FavoritesScreen;
