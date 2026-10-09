import React, { useState, useRef, useEffect, useCallback } from 'react';
import Spinner from '../components/Spinner';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    FlatList
} from 'react-native';
import { Divider } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import { COLORS } from '../utils/constants';
import AIService from '../services/aiService';
import ReviewService from '../services/reviewService';
import AIHistoryManager from '../utils/aiHistoryManager';

// Optimizacion de tokens: maximos intercambios en contexto y chars de historial
const MAX_HISTORY_EXCHANGES = 3;
const MAX_HISTORY_CHARS = 600;

const UserBubble = ({ text }) => (
    <View style={styles.userBubbleRow}>
        <View style={styles.userBubble}>
            <Text style={styles.userBubbleText}>{text}</Text>
        </View>
    </View>
);

function getProviderLabel(provider) {
    if (!provider) return '';
    if (provider.startsWith('groq/')) {
        const model = provider.replace('groq/', '');
        if (model.includes('70b')) return 'Llama 3.3 70B';
        if (model.includes('8b')) return 'Llama 3.1 8B';
        if (model.includes('gpt-oss-20b')) return 'GPT-OSS 20B';
        return model;
    }
    if (provider === 'gemini') return 'Gemini';
    return provider;
}

const AiBubble = ({ message, onNavigate }) => (
    <View style={styles.aiBubbleRow}>
        <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>⚖️</Text>
        </View>
        <View style={styles.aiBubbleContent}>
            <View style={[styles.aiBubble, message.error && styles.aiBubbleError]}>
                {message.error ? (
                    <Text style={styles.aiBubbleErrorText}>{message.error}</Text>
                ) : (
                    <Markdown style={markdownStyles}>{message.content}</Markdown>
                )}
            </View>
            {!message.error && message.provider && (
                <Text style={styles.providerLabel}>{getProviderLabel(message.provider)}</Text>
            )}
            {!message.error && message.references && message.references.length > 0 && (
                <View style={styles.refsContainer}>
                    <Text style={styles.refsTitle}>ARTICULOS RELACIONADOS</Text>
                    {message.references.map((ref) => (
                        <Pressable
                            key={`ref-${ref.law_id}-${ref.index ?? ref.id ?? String(ref.number)}`}
                            style={({ pressed }) => [styles.refItem, pressed && { opacity: 0.7 }]}
                            onPress={() => onNavigate(ref)}
                        >
                            <View style={styles.refHeader}>
                                <Text style={styles.refLaw} numberOfLines={1}>{ref.law_title}</Text>
                                <Text style={styles.refArt}>Art. {ref.number}</Text>
                            </View>
                            <Text style={styles.refText} numberOfLines={2}>{ref.text}</Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </View>
    </View>
);

const TypingIndicator = () => (
    <View style={styles.aiBubbleRow}>
        <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>⚖️</Text>
        </View>
        <View style={[styles.aiBubble, styles.typingBubble]}>
            <Spinner size={18} color={COLORS.primary} />
            <Text style={styles.typingText}>Analizando...</Text>
        </View>
    </View>
);

const AIConsultScreen = ({ navigation }) => {
    const [chatMessages, setChatMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [pastHistory, setPastHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const flatListRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { loadPastHistory(); }, []);

    const loadPastHistory = async () => {
        const h = await AIHistoryManager.getHistory();
        setPastHistory(h);
    };

    // Construye historial optimizado: solo ultimos N intercambios, respuestas truncadas
    const buildApiHistory = useCallback(() => {
        const validMessages = chatMessages.filter(m => !m.error);
        const maxMessages = MAX_HISTORY_EXCHANGES * 2;
        const recent = validMessages.slice(-maxMessages);
        return recent.map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.role === 'assistant' && msg.content?.length > MAX_HISTORY_CHARS
                ? msg.content.substring(0, MAX_HISTORY_CHARS) + '...'
                : msg.content
        }));
    }, [chatMessages]);

    const handleSend = async () => {
        const trimmed = inputText.trim();
        if (!trimmed || loading) return;
        const userMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
        setChatMessages(prev => [...prev, userMsg]);
        setInputText('');
        setLoading(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        try {
            const apiHistory = buildApiHistory();
            const data = await AIService.consultCase(trimmed, apiHistory);
            const aiMsg = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: data.error ? null : data.answer,
                references: data.references || [],
                provider: data.provider,
                error: data.error || null
            };
            setChatMessages(prev => [...prev, aiMsg]);
            if (chatMessages.length === 0) {
                const newHistory = await AIHistoryManager.saveConsult(trimmed, data);
                setPastHistory(newHistory);
            }
            ReviewService.recordInteraction();
        } catch (error) {
            setChatMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                role: 'assistant',
                content: null,
                error: 'Error al procesar la consulta. Intente de nuevo.',
                references: []
            }]);
        } finally {
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
        }
    };

    const handleNewChat = () => { setChatMessages([]); setInputText(''); setShowHistory(false); };

    const handleNavigateToArticle = useCallback((ref) => {
        navigation.navigate('LawDetail', { lawId: ref.law_id, jumpToIndex: ref.index, initialItemNumber: ref.number });
    }, [navigation]);

    const renderMessage = useCallback(({ item }) => {
        if (item.role === 'user') return <UserBubble text={item.content} />;
        return <AiBubble message={item} onNavigate={handleNavigateToArticle} />;
    }, [handleNavigateToArticle]);

    const isFirstMessage = chatMessages.length === 0;
    const exchangeCount = Math.ceil(chatMessages.length / 2);
    const TIPS = [
        '¿Cuales son mis Derechos Labores?',
        '¿Me pueden despedir sin causa?',
        '¿Como me puedo divorciar?',
    ];

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
        >
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle}>Consulta Legal IA</Text>
                    {!isFirstMessage && (
                        <Text style={styles.headerSub}>
                            {exchangeCount} intercambios · contexto: ultimos {Math.min(exchangeCount, MAX_HISTORY_EXCHANGES)}
                        </Text>
                    )}
                </View>
                <View style={styles.headerActions}>
                    {pastHistory.length > 0 && (
                        <Pressable
                            onPress={() => setShowHistory(!showHistory)}
                            style={[styles.headerBtn, showHistory && styles.headerBtnActive]}
                        >
                            <Text style={styles.headerBtnText}>🕐</Text>
                        </Pressable>
                    )}
                    {!isFirstMessage && (
                        <Pressable onPress={handleNewChat} style={[styles.headerBtn, styles.newChatBtn]}>
                            <Text style={styles.newChatBtnText}>+ Nueva</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {showHistory && (
                <View style={styles.historyPanel}>
                    <Text style={styles.historyPanelTitle}>CONSULTAS RECIENTES</Text>
                    {pastHistory.map((h) => (
                        <Pressable
                            key={h.id}
                            style={styles.historyPanelItem}
                            onPress={() => { handleNewChat(); setInputText(h.query); setShowHistory(false); }}
                        >
                            <Text style={styles.historyPanelText} numberOfLines={1}>{h.query}</Text>
                            <Text style={styles.historyPanelDate}>
                                {h.date ? new Date(h.date).toLocaleDateString('es-VE') : ''}
                            </Text>
                        </Pressable>
                    ))}
                    <Divider style={{ marginTop: 8 }} />
                </View>
            )}

            {isFirstMessage ? (
                <View style={styles.welcomeContainer}>
                    <View style={styles.welcomeIconBg}>
                        <Text style={styles.welcomeEmoji}>⚖️</Text>
                    </View>
                    <Text style={styles.welcomeTitle}>Asistente Legal</Text>
                    <Text style={styles.welcomeSubtitle}>
                        Describe tu situacion y te ayudare con base en la legislacion venezolana.
                        Puedes hacer preguntas de seguimiento para profundizar.
                    </Text>
                    <View style={styles.welcomeTips}>
                        {TIPS.map(tip => (
                            <Pressable key={tip} style={styles.tipChip} onPress={() => setInputText(tip)}>
                                <Text style={styles.tipChipText}>{tip}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={chatMessages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.chatContent}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    ListFooterComponent={loading ? <TypingIndicator /> : null}
                />
            )}

            <View style={styles.inputContainer}>
                <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={isFirstMessage ? 'Describe tu situacion legal...' : 'Pregunta de seguimiento...'}
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={inputText}
                    onChangeText={setInputText}
                    maxLength={500}
                    textAlignVertical="top"
                    cursorColor={COLORS.primary}
                />
                <Pressable
                    style={({ pressed }) => [
                        styles.sendBtn,
                        (!inputText.trim() || loading) && styles.sendBtnDisabled,
                        pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || loading}
                >
                    <Text style={styles.sendBtnText}>➤</Text>
                </Pressable>
            </View>

            <Text style={styles.disclaimer}>
                La IA puede cometer errores. Verifica siempre con un abogado profesional.
            </Text>
        </KeyboardAvoidingView>
    );
};

const markdownStyles = {
    body: { fontSize: 15, color: '#1E293B', lineHeight: 24 },
    heading1: { fontSize: 17, fontWeight: 'bold', color: COLORS.primary, marginTop: 10, marginBottom: 4 },
    heading2: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary, marginTop: 8, marginBottom: 4 },
    strong: { fontWeight: '700', color: '#0F172A' },
    em: { fontStyle: 'italic', color: '#475569' },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    bullet_list_icon: { color: COLORS.accent, fontWeight: 'bold' },
    // Tablas: sin bordes ni fondos, se ven como texto plano en movil
    table: { marginVertical: 4 },
    thead: {},
    th: { fontSize: 14, fontWeight: 'bold', color: '#0F172A', paddingVertical: 2, paddingRight: 8 },
    td: { fontSize: 14, color: '#1E293B', paddingVertical: 2, paddingRight: 8 },
    tr: { flexDirection: 'row', flexWrap: 'wrap' },
    blockquote: { backgroundColor: '#EFF6FF', borderLeftWidth: 3, borderLeftColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4 },
    code_inline: { backgroundColor: '#F1F5F9', color: '#0F172A', fontFamily: 'monospace', fontSize: 13, paddingHorizontal: 4, borderRadius: 4 },
    hr: { backgroundColor: '#E2E8F0', height: 1, marginVertical: 10 }
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    headerLeft: { flex: 1 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
    headerSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerBtn: { padding: 8, borderRadius: 10, backgroundColor: '#F1F5F9' },
    headerBtnActive: { backgroundColor: COLORS.primary + '20' },
    headerBtnText: { fontSize: 16 },
    newChatBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12 },
    newChatBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    historyPanel: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    historyPanelTitle: { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1.5, marginBottom: 8 },
    historyPanelItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    historyPanelText: { fontSize: 13, color: '#1E293B', flex: 1, marginRight: 10 },
    historyPanelDate: { fontSize: 11, color: '#94A3B8' },
    welcomeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 20 },
    welcomeIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    welcomeEmoji: { fontSize: 38 },
    welcomeTitle: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginBottom: 10, textAlign: 'center' },
    welcomeSubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    welcomeTips: { width: '100%', gap: 8 },
    tipChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
    tipChipText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
    chatContent: { padding: 16, paddingBottom: 8 },
    userBubbleRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
    userBubble: { backgroundColor: COLORS.primary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '80%' },
    userBubbleText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    aiBubbleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, maxWidth: '92%' },
    aiAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 2 },
    aiAvatarText: { fontSize: 16 },
    aiBubbleContent: { flex: 1 },
    aiBubble: { backgroundColor: '#fff', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    aiBubbleError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
    aiBubbleErrorText: { fontSize: 14, color: '#DC2626', lineHeight: 21 },
    typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    typingText: { fontSize: 13, color: '#94A3B8' },
    providerLabel: { fontSize: 10, color: '#94A3B8', marginTop: 5, marginLeft: 4 },
    refsContainer: { marginTop: 10 },
    refsTitle: { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1.5, marginBottom: 8 },
    refItem: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' },
    refHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    refLaw: { color: COLORS.primary, fontSize: 11, fontWeight: '700', flex: 1, marginRight: 8 },
    refArt: { color: COLORS.accent, fontSize: 11, fontWeight: 'bold' },
    refText: { color: '#64748B', fontSize: 12, lineHeight: 17 },
    inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 8, paddingBottom: Platform.OS === 'ios' ? 20 : 12 },
    input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1E293B', maxHeight: 120 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { backgroundColor: '#CBD5E1' },
    sendBtnText: { color: '#fff', fontSize: 18 },
    disclaimer: { textAlign: 'center', fontSize: 10, color: '#94A3B8', paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 8 : 10, backgroundColor: '#fff' }
});

export default AIConsultScreen;
