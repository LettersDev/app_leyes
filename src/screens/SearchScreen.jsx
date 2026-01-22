import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Searchbar, Card, Title, Paragraph, ActivityIndicator } from 'react-native-paper';
import { searchLaws } from '../services/lawService';
import { COLORS } from '../utils/constants';

const SearchScreen = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (query) => {
        setSearchQuery(query);

        if (query.trim().length < 3) {
            setResults([]);
            setSearched(false);
            return;
        }

        try {
            setLoading(true);
            const data = await searchLaws(query);
            setResults(data);
            setSearched(true);
        } catch (error) {
            console.error('Error en búsqueda:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const highlightText = (text, query) => {
        if (!text || !query) return <Text>{text}</Text>;

        const normalize = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normText = normalize(text);
        const normQuery = normalize(query.trim());

        if (!normQuery) return <Text>{text}</Text>;

        let lastIndex = 0;
        const result = [];
        const regex = new RegExp(normQuery, 'gi');
        let match;

        while ((match = regex.exec(normText)) !== null) {
            // Texto antes del match
            result.push(text.substring(lastIndex, match.index));
            // Texto del match (con estilo)
            result.push(
                <Text key={match.index} style={styles.highlight}>
                    {text.substring(match.index, match.index + normQuery.length)}
                </Text>
            );
            lastIndex = match.index + normQuery.length;
        }
        result.push(text.substring(lastIndex));

        return <Text>{result}</Text>;
    };

    const renderResultItem = ({ item }) => (
        <TouchableOpacity
            onPress={() => navigation.navigate('LawDetail', { lawId: item.id })}
        >
            <Card style={styles.resultCard}>
                <Card.Content>
                    <Title style={styles.resultTitle} numberOfLines={2}>
                        {highlightText(item.title, searchQuery)}
                    </Title>

                    {item.searchableText && (
                        <Paragraph style={styles.resultSnippet} numberOfLines={3}>
                            {highlightText(item.searchableText.substring(0, 150), searchQuery)}...
                        </Paragraph>
                    )}
                </Card.Content>
            </Card>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Searchbar
                placeholder="Buscar en leyes..."
                onChangeText={handleSearch}
                value={searchQuery}
                style={styles.searchBar}
                iconColor={COLORS.primary}
                inputStyle={styles.searchInput}
            />

            {loading && (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Buscando...</Text>
                </View>
            )}

            {!loading && searched && results.length === 0 && (
                <View style={styles.centerContainer}>
                    <Text style={styles.emptyText}>
                        No se encontraron resultados para "{searchQuery}"
                    </Text>
                    <Text style={styles.emptySubtext}>
                        Intenta con otros términos de búsqueda
                    </Text>
                </View>
            )}

            {!loading && !searched && (
                <View style={styles.centerContainer}>
                    <Text style={styles.instructionText}>
                        Escribe al menos 3 caracteres para buscar
                    </Text>
                </View>
            )}

            {!loading && results.length > 0 && (
                <FlatList
                    data={results}
                    renderItem={renderResultItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.resultsList}
                    ListHeaderComponent={
                        <Text style={styles.resultsCount}>
                            {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                        </Text>
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    searchBar: {
        margin: 16,
        elevation: 2,
        borderRadius: 12,
    },
    searchInput: {
        fontSize: 16,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    resultsList: {
        padding: 16,
        paddingTop: 0,
    },
    resultsCount: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 12,
        fontWeight: '600',
    },
    resultCard: {
        marginBottom: 12,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        elevation: 2,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.text,
        marginBottom: 8,
    },
    resultSnippet: {
        fontSize: 14,
        color: COLORS.textSecondary,
        lineHeight: 20,
    },
    highlight: {
        backgroundColor: COLORS.secondary,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
    instructionText: {
        fontSize: 16,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
});

export default SearchScreen;
