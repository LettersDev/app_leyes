import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';
import QuizService from '../services/quizService';

const QuizHistoryScreen = ({ navigation }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoading(true);
        const data = await QuizService.fetchQuizHistory();
        setHistory(data);
        setLoading(false);
    };

    const formatDate = (dateStr) => {
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-VE', options);
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DailyQuiz', { quizId: item.id, date: item.date })}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
                <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{item.law_category || 'General'}</Text>
                </View>
            </View>
            <Text style={styles.cardQuestion} numberOfLines={2}>
                {item.question}
            </Text>
            <View style={styles.cardFooter}>
                <Text style={styles.lawTitle}>{item.law_title}</Text>
                <IconButton icon="chevron-right" size={20} iconColor={COLORS.primary} style={styles.footerIcon} />
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Recuperando registros históricos...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <IconButton 
                    icon="arrow-left" 
                    onPress={() => navigation.goBack()} 
                    iconColor={COLORS.text}
                />
                <Text style={styles.headerTitle}>Historial de Quizzes</Text>
            </View>

            <FlatList
                data={history}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No se han encontrado registros anteriores.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: 14 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
        marginLeft: 4,
    },
    listContent: { padding: 16 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardDate: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
    },
    categoryBadge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    categoryText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#475569',
    },
    cardQuestion: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.text,
        lineHeight: 22,
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 10,
    },
    lawTitle: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '500',
        flex: 1,
    },
    footerIcon: { margin: 0 },
    emptyContainer: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: COLORS.textSecondary, fontSize: 15 },
});

export default QuizHistoryScreen;
