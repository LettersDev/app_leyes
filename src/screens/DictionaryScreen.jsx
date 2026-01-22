import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Searchbar, List, Divider, Card } from 'react-native-paper';
import { COLORS } from '../utils/constants';
import dictionaryData from '../data/legal_dictionary.json';

const DictionaryScreen = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredTerms, setFilteredTerms] = useState(dictionaryData);

    useEffect(() => {
        const filtered = dictionaryData.filter(item =>
            item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.definition.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredTerms(filtered);
    }, [searchQuery]);

    const renderItem = ({ item }) => (
        <Card style={styles.card}>
            <Card.Content>
                <Text style={styles.term}>{item.term}</Text>
                <Text style={styles.definition}>{item.definition}</Text>
            </Card.Content>
        </Card>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Buscar término jurídico..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.searchBar}
                    iconColor={COLORS.primary}
                />
            </View>

            <FlatList
                data={filteredTerms}
                keyExtractor={(item) => item.term}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No se encontraron términos.</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    searchContainer: {
        padding: 16,
        backgroundColor: COLORS.primary,
    },
    searchBar: {
        borderRadius: 8,
        elevation: 4,
    },
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 8,
        elevation: 2,
    },
    term: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 8,
    },
    definition: {
        fontSize: 15,
        color: COLORS.text,
        lineHeight: 22,
        textAlign: 'justify',
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.textSecondary,
    }
});

export default DictionaryScreen;
