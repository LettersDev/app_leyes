import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Card, Title, Paragraph, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES, GRADIENTS } from '../utils/constants';

const LawsCategorySelectorScreen = ({ navigation }) => {
    const selectorCategories = [
        {
            id: LAW_CATEGORIES.LEYES,
            name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES],
            icon: 'file-document-outline',
            description: 'Leyes generales y normativas nacionales',
            color: '#3B82F6',
        },
        {
            id: LAW_CATEGORIES.LEYES_ORGANICAS,
            name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES_ORGANICAS],
            icon: 'shield-check-outline',
            description: 'Leyes que organizan los poderes públicos',
            color: '#8B5CF6',
        },
    ];

    const handlePress = (cat) => {
        navigation.navigate('LawsList', {
            category: cat.id,
            categoryName: cat.name,
        });
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Leyes y Reglamentos</Text>
                <Text style={styles.headerSubtitle}>Selecciona el tipo de normativa que deseas consultar</Text>
            </View>

            <View style={styles.cardsContainer}>
                {selectorCategories.map((cat) => (
                    <TouchableOpacity
                        key={cat.id}
                        onPress={() => handlePress(cat)}
                        activeOpacity={0.9}
                    >
                        <Card style={styles.card}>
                            <Card.Content style={styles.cardContent}>
                                <LinearGradient
                                    colors={[cat.color, cat.color + 'AA']}
                                    style={styles.iconContainer}
                                >
                                    <IconButton icon={cat.icon} size={32} iconColor="#fff" />
                                </LinearGradient>
                                <View style={styles.textContainer}>
                                    <Title style={styles.title}>{cat.name}</Title>
                                    <Paragraph style={styles.description}>{cat.description}</Paragraph>
                                </View>
                                <IconButton icon="chevron-right" size={24} iconColor={COLORS.textSecondary} />
                            </Card.Content>
                        </Card>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.infoBox}>
                <IconButton icon="information-outline" size={20} iconColor={COLORS.primary} style={{ margin: 0 }} />
                <Text style={styles.infoText}>
                    Las leyes orgánicas tienen una jerarquía superior a las leyes ordinarias según la Constitución.
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        padding: 24,
        backgroundColor: COLORS.primary,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#CBD5E1',
        lineHeight: 20,
    },
    cardsContainer: {
        padding: 16,
        marginTop: 8,
    },
    card: {
        marginBottom: 16,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    iconContainer: {
        borderRadius: 16,
        width: 64,
        height: 64,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
    },
    description: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    infoBox: {
        flexDirection: 'row',
        padding: 20,
        margin: 20,
        backgroundColor: COLORS.primary + '10',
        borderRadius: 12,
        alignItems: 'center',
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: COLORS.primary,
        fontStyle: 'italic',
        lineHeight: 18,
    },
});

export default LawsCategorySelectorScreen;
