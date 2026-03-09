import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
    isFavorite
}) => {
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
            result.push(text.substring(lastIndex, match.index));
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
                    {highlightText(item.title || `Artículo ${item.number}`, searchQuery)}
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

            <Text
                selectable={true}
                style={[
                    styles.articleText,
                    {
                        fontSize,
                        fontFamily: fontFamily === 'Serif' ? 'serif' : 'System',
                        marginTop: 10,
                        lineHeight: fontSize * 1.6
                    }
                ]}
            >
                {highlightText(item.text, searchQuery)}
            </Text>

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
            <TouchableOpacity onPress={() => onJumpToContext(item.index)} activeOpacity={0.7}>
                {Content}
            </TouchableOpacity>
        );
    }

    return Content;
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
});

export default LawArticle;
