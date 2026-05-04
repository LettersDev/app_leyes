import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../utils/constants';
import AIService from '../services/aiService';

const AIConsultScreen = ({ navigation }) => {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const scrollViewRef = useRef();

    const handleConsult = async () => {
        if (!query.trim() || loading) return;
        setLoading(true);
        setResult(null);
        try {
            const data = await AIService.consultCase(query);
            setResult(data);
        } catch (error) {
            alert('Error en la consulta. Intente de nuevo más tarde.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView 
                ref={scrollViewRef}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.tag}>SISTEMA DE ASISTENCIA</Text>
                    <Text style={styles.title}>Consulta Legal Inteligente</Text>
                    <Text style={styles.subtitle}>
                        Describa su situación con sus propias palabras. Buscaremos la base legal en nuestra base de datos.
                    </Text>
                </View>

                <View style={styles.inputCard}>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej: Me quieren desalojar sin previo aviso, ¿qué puedo hacer?"
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={4}
                        value={query}
                        onChangeText={setQuery}
                        maxLength={500}
                    />
                    <View style={styles.inputFooter}>
                        <Text style={styles.charCount}>{query.length}/500</Text>
                        <TouchableOpacity 
                            style={[styles.button, (!query.trim() || loading) && styles.buttonDisabled]} 
                            onPress={handleConsult}
                            disabled={!query.trim() || loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.buttonText}>ANALIZAR CASO</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {result && (
                    <View style={styles.resultContainer}>
                        <View style={styles.resultHeader}>
                            <Text style={[styles.resultTag, result.error && { color: COLORS.error }]}>
                                {result.error ? 'ERROR EN CONSULTA' : 'ANÁLISIS GENERADO'}
                            </Text>
                        </View>
                        <View style={[styles.resultCard, result.error && { borderLeftColor: COLORS.error }]}>
                            <Text style={styles.answerText}>
                                {result.error || result.answer}
                            </Text>
                        </View>

                        {!result.error && result.references && result.references.length > 0 && (
                            <View style={styles.refsContainer}>
                                <Text style={styles.refsTitle}>REFERENCIAS UTILIZADAS</Text>
                                {result.references.map((ref, idx) => (
                                    <TouchableOpacity 
                                        key={idx} 
                                        style={styles.refItem}
                                        onPress={() => navigation.navigate('LawDetail', { lawId: ref.law_id, jumpToIndex: ref.index })}
                                    >
                                        <Text style={styles.refNumber}>{ref.law_title} - ARTÍCULO {ref.number}</Text>
                                        <Text style={styles.refText} numberOfLines={2}>{ref.text}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                        
                        <Text style={styles.disclaimer}>
                            Este análisis es generado por IA basado en la legislación vigente cargada en la app. No sustituye la asesoría de un abogado colegiado.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { padding: 24, paddingBottom: 60 },
    header: { marginBottom: 30, marginTop: 10 },
    tag: { color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
    title: { color: COLORS.primary, fontSize: 28, fontWeight: 'bold', marginBottom: 12 },
    subtitle: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 },
    inputCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    input: {
        fontSize: 16,
        color: COLORS.text,
        textAlignVertical: 'top',
        minHeight: 120,
    },
    inputFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 15,
    },
    charCount: { color: '#94A3B8', fontSize: 12 },
    button: {
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    resultContainer: { marginTop: 40 },
    resultHeader: { marginBottom: 15 },
    resultTag: { color: COLORS.success, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
    resultCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.success,
        elevation: 2,
    },
    answerText: { fontSize: 16, color: COLORS.text, lineHeight: 26 },
    refsContainer: { marginTop: 30 },
    refsTitle: { color: COLORS.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 15 },
    refItem: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    refNumber: { color: COLORS.accent, fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
    refText: { color: COLORS.textSecondary, fontSize: 13 },
    disclaimer: {
        marginTop: 30,
        textAlign: 'center',
        fontSize: 11,
        color: '#94A3B8',
        fontStyle: 'italic',
        lineHeight: 16,
    },
});

export default AIConsultScreen;
