import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const LawArticle = React.memo(({
    item,
    fontSize,
    fontFamily,
    searchQuery,
    isSearching,
    isExactMatch,
    onOpenNote,
    onToggleFavorite,
    onShare,
    onJumpToContext,
    hasNote,
    noteText,
    isFavorite,
    onInterpret
}) => {
    // Helper to highlight text - defined inside for access to styles, but logic is used within useMemo
    const highlightText = (text, query) => {
        if (!text || !query) return text;

        const normalize = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normText = normalize(text);
        const normQuery = normalize(query.trim());
        if (!normQuery) return text;

        if (normQuery.length > 2 && !normText.includes(normQuery)) {
            return text;
        }

        let lastIndex = 0;
        const result = [];
        const regex = new RegExp(normQuery, 'gi');
        let match;
        while ((match = regex.exec(normText)) !== null) {
            if (match.index > lastIndex) {
                result.push(text.substring(lastIndex, match.index));
            }
            result.push(
                <Text key={match.index} style={styles.highlight}>
                    {text.substring(match.index, match.index + normQuery.length)}
                </Text>
            );
            lastIndex = match.index + normQuery.length;
        }
        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex));
        }
        return result;
    };

    // Parsea el texto y renderiza [TABLA]...[FIN TABLA] como tablas visuales
    const renderArticleBody = (text, query, textStyle) => {
        if (!text) return null;
        const TABLE_RE = /\[TABLA\]([\s\S]*?)\[FIN TABLA\]/g;
        const segments = [];
        let lastIdx = 0;
        let match;
        let key = 0;

        while ((match = TABLE_RE.exec(text)) !== null) {
            // Texto antes de la tabla
            if (match.index > lastIdx) {
                const before = text.slice(lastIdx, match.index).trim();
                if (before) {
                    segments.push(
                        <Text key={`txt-${key++}`} selectable style={textStyle}>
                            {query ? highlightText(before, query) : before}
                        </Text>
                    );
                }
            }
            // La tabla
            const tableLines = match[1].trim().split('\n').filter(l => l.trim().startsWith('|'));
            const rows = tableLines.map(line =>
                line.split('|').reduce((acc, c) => {
                    const trimmed = c.trim();
                    if (trimmed) acc.push(trimmed);
                    return acc;
                }, [])
            );
            const colCount = Math.max(...rows.map(r => r.length), 1);
            segments.push(
                <ScrollView key={`tbl-${key++}`} horizontal showsHorizontalScrollIndicator={false} style={styles.tableWrapper}>
                    <View style={styles.table}>
                        {rows.map((row, rIdx) => (
                            <View key={rIdx} style={[styles.tableRow, rIdx === 0 && styles.tableHeaderRow]}>
                                {Array.from({ length: colCount }).map((_, cIdx) => (
                                    <View key={cIdx} style={[styles.tableCell, rIdx === 0 && styles.tableHeaderCell]}>
                                        <Text style={[styles.tableCellText, rIdx === 0 && styles.tableHeaderText]}>
                                            {row[cIdx] || ''}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            );
            lastIdx = match.index + match[0].length;
        }

        // Texto después de la última tabla
        const after = text.slice(lastIdx).trim();
        if (after) {
            segments.push(
                <Text key={`txt-${key++}`} selectable style={textStyle}>
                    {query ? highlightText(after, query) : after}
                </Text>
            );
        }

        return segments.length > 0 ? segments : (
            <Text selectable style={textStyle}>
                {query ? highlightText(text, query) : text}
            </Text>
        );
    };

    // Memoize the entire processed body to prevent heavy regex work and layout recalculations
    const processedBody = React.useMemo(() => {
        return renderArticleBody(
            item.text,
            searchQuery || null,
            [
                styles.articleText,
                {
                    fontSize,
                    fontFamily: fontFamily === 'Serif' ? 'serif' : 'System',
                    marginTop: 10,
                    lineHeight: fontSize * 1.6
                }
            ]
        );
    }, [item.text, isSearching, searchQuery, fontSize, fontFamily]);

    // Memoize the title too
    const processedTitle = React.useMemo(() => {
        return highlightText(item.title || `Artículo ${item.number}`, searchQuery);
    }, [item.title, item.number, searchQuery]);

    if (item.type === 'header') {
        return (
            <View style={styles.headerContainer}>
                <Text style={styles.chapterHeader}>{item.text}</Text>
                <View style={styles.headerUnderline} />
            </View>
        );
    }

    const Content = (
        <View style={[
            styles.articleCard,
            isExactMatch && styles.exactMatchCard,
            isSearching && styles.clickableCard
        ]}>
            <View style={styles.articleHeaderRow}>
                <Text
                    selectable={true}
                    style={[
                        styles.articleTitleBold,
                        { fontSize: fontSize + 2, fontFamily: fontFamily === 'Serif' ? 'serif' : 'System' }
                    ]}
                >
                    {processedTitle}
                </Text>

                <View style={styles.articleActions}>
                    <IconButton
                        icon={hasNote ? "note-text" : "pencil-outline"}
                        iconColor={hasNote ? COLORS.accent : COLORS.primary}
                        size={20}
                        style={styles.smallIconButton}
                        onPress={() => onOpenNote(item)}
                    />
                    <IconButton
                        icon={isFavorite ? "star" : "star-outline"}
                        iconColor={isFavorite ? "#FFD700" : COLORS.primary}
                        size={20}
                        style={styles.smallIconButton}
                        onPress={() => onToggleFavorite(item)}
                    />
                    <IconButton
                        icon="share-variant"
                        iconColor={COLORS.primary}
                        size={20}
                        style={styles.smallIconButton}
                        onPress={() => onShare(item)}
                    />
                </View>
            </View>

            {processedBody}

            <View style={styles.articleFooter}>
                <Pressable 
                    style={({ pressed }) => [
                        styles.aiInterpretBtn,
                        pressed && { opacity: 0.7 }
                    ]} 
                    onPress={() => onInterpret(item)}
                >
                    <Text style={styles.aiInterpretText}>INTERPRETAR CON IA</Text>
                </Pressable>
            </View>

            {hasNote && (
                <View style={styles.noteContent}>
                    <Text style={styles.noteTextLabel}>Mi nota:</Text>
                    <Text style={styles.noteTextContent}>{noteText}</Text>
                </View>
            )}
        </View>
    );

    if (isSearching) {
        return (
            <Pressable 
                onPress={() => onJumpToContext(item.index)} 
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
                {Content}
            </Pressable>
        );
    }

    return Content;
}, (prevProps, nextProps) => {
    // Si el usuario está escribiendo pero no ha activado la búsqueda, no re-renderizar
    if (!nextProps.isSearching && prevProps.searchQuery !== nextProps.searchQuery) {
        return true;
    }

    // Comparación profunda de props relevantes
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.index === nextProps.item.index &&
        prevProps.fontSize === nextProps.fontSize &&
        prevProps.fontFamily === nextProps.fontFamily &&
        prevProps.searchQuery === nextProps.searchQuery &&
        prevProps.isSearching === nextProps.isSearching &&
        prevProps.isExactMatch === nextProps.isExactMatch &&
        prevProps.hasNote === nextProps.hasNote &&
        prevProps.isFavorite === nextProps.isFavorite &&
        prevProps.noteText === nextProps.noteText &&
        prevProps.onInterpret === nextProps.onInterpret
    );
});

const styles = StyleSheet.create({
    articleCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.05)',
    },
    exactMatchCard: {
        borderColor: COLORS.accent,
        borderWidth: 2,
        backgroundColor: '#FFFBE6',
    },
    clickableCard: {
        backgroundColor: '#F8FAFC',
    },
    articleHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    articleTitleBold: {
        fontWeight: 'bold',
        color: COLORS.primary,
        flex: 1,
    },
    articleActions: {
        flexDirection: 'row',
    },
    smallIconButton: {
        margin: 0,
    },
    articleText: {
        color: '#334155',
    },
    highlight: {
        backgroundColor: '#FFD700',
        color: '#000',
        fontWeight: 'bold',
    },
    headerContainer: {
        marginTop: 30,
        marginBottom: 20,
        paddingHorizontal: 10,
    },
    chapterHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.secondary,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    headerUnderline: {
        height: 3,
        width: 60,
        backgroundColor: COLORS.secondary,
        alignSelf: 'center',
        marginTop: 8,
        borderRadius: 2,
    },
    noteContent: {
        marginTop: 15,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    noteTextLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.accent,
        marginBottom: 4,
    },
    noteTextContent: {
        fontSize: 14,
        color: '#475569',
        fontStyle: 'italic',
    },
    // --- Estilos de tabla ---
    tableWrapper: {
        marginVertical: 12,
        borderRadius: 8,
    },
    table: {
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 8,
        overflow: 'hidden',
        minWidth: '100%',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        backgroundColor: '#fff',
    },
    tableHeaderRow: {
        backgroundColor: COLORS.primary,
    },
    tableCell: {
        minWidth: 100,
        maxWidth: 220,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRightWidth: 1,
        borderRightColor: '#E2E8F0',
        justifyContent: 'center',
    },
    tableHeaderCell: {
        borderRightColor: 'rgba(255,255,255,0.3)',
    },
    tableCellText: {
        fontSize: 13,
        color: '#334155',
        flexWrap: 'wrap',
    },
    tableHeaderText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    articleFooter: {
        marginTop: 15,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    aiInterpretBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    aiInterpretText: {
        color: COLORS.accent,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
});

export default LawArticle;
