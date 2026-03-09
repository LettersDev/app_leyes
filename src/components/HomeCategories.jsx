import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Surface, IconButton, Badge } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../utils/constants';

const HomeCategories = ({ categories, updatedCategories, onCategoryPress }) => {
    return (
        <View style={styles.categoriesContainer}>
            <Text style={styles.sectionTitle}>Categorías</Text>

            {categories.map((category) => (
                <TouchableOpacity
                    key={category.id}
                    onPress={() => onCategoryPress(category)}
                    activeOpacity={0.8}
                >
                    <Surface elevation={1} style={styles.categoryCard}>
                        <View style={styles.cardContent}>
                            <LinearGradient
                                colors={[category.color, category.color + 'CC']}
                                style={styles.iconContainer}
                            >
                                <IconButton
                                    icon={category.icon}
                                    size={28}
                                    iconColor="#fff"
                                    style={{ margin: 0 }}
                                />
                                {updatedCategories.includes(category.id) && (
                                    <Badge
                                        visible={true}
                                        size={12}
                                        style={styles.categoryBadge}
                                    />
                                )}
                            </LinearGradient>
                            <View style={styles.categoryInfo}>
                                <Text style={styles.categoryTitle}>{category.name}</Text>
                                <Text style={styles.categoryDescription} numberOfLines={1}>
                                    {category.description}
                                </Text>
                            </View>
                            <IconButton icon="chevron-right" size={20} iconColor={COLORS.textSecondary} />
                        </View>
                    </Surface>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    categoriesContainer: {
        padding: 20,
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 16,
        letterSpacing: 0.5,
    },
    categoryCard: {
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    iconContainer: {
        borderRadius: 12,
        marginRight: 15,
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryInfo: {
        flex: 1,
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
        marginBottom: 2,
    },
    categoryDescription: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    categoryBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: '#fff',
    },
});

export default HomeCategories;
