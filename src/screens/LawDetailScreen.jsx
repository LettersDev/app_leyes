import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { Card, Title, Paragraph, Divider, Button, Searchbar, Badge } from 'react-native-paper';
import { getLawById, getLawItems, getLawItemByNumber, searchLawItemsByText, getLawItemsAround } from '../services/lawService';
import { COLORS } from '../utils/constants';
import { downloadFile, openFile, checkIfFileExists } from '../utils/fileUtils';
import { IconButton } from 'react-native-paper';
import FavoritesManager from '../utils/favoritesManager';
import { downloadLawContent } from '../services/lawService';
import OfflineService from '../services/offlineService';
import { useSettings } from '../context/SettingsContext';
import ReadingSettingsModal from '../components/ReadingSettingsModal';
import HistoryManager from '../utils/historyManager';
import NotesManager from '../utils/notesManager';
import { Portal, Dialog, TextInput, Surface } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS } from '../utils/constants';

// Tamaño optimizado para leyes grandes
const PAGE_SIZE = 50;

const LawArticle = React.memo(({
    item,
    index,
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

const LawDetailScreen = ({ route }) => {
    const { lawId } = route.params;
    const [law, setLaw] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [lastIndex, setLastIndex] = useState(-1);
    const [error, setError] = useState(null);
    const [localUri, setLocalUri] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [favoriteIds, setFavoriteIds] = useState(new Set());
    const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);
    const [isDownloadingContent, setIsDownloadingContent] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const { fontSize, fontFamily } = useSettings();

    // Estados de búsqueda
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchTargetNum, setSearchTargetNum] = useState(null);
    const searchTimeout = useRef(null);
    const flatListRef = useRef(null);

    // Notas
    const [notes, setNotes] = useState({});
    const [noteDialogVisible, setNoteDialogVisible] = useState(false);
    const [editingNote, setEditingNote] = useState({ id: '', text: '', title: '' });

    useEffect(() => {
        loadInitialData();
        loadFavoriteStatus();
        loadNotes();
        checkOfflineStatus();
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
        };
    }, [lawId]);

    const loadNotes = async () => {
        const allNotes = await NotesManager.getNotes();
        setNotes(allNotes);
    };

    const checkOfflineStatus = async () => {
        const offline = await OfflineService.isLawOffline(lawId);
        setIsOfflineAvailable(offline);
    };

    const loadFavoriteStatus = async () => {
        const favs = await FavoritesManager.getFavorites();
        const ids = new Set(favs.map(f => f.id));
        setFavoriteIds(ids);
    };

    const loadInitialData = async () => {
        try {
            setLoading(true);
            setError(null);

            const metaData = await getLawById(lawId);
            setLaw(metaData);

            // Determinar el índice de salto (de parámetros o de favoritos/historial)
            const jumpToIndex = route.params?.jumpToIndex;

            // Registrar visita en el historial si es nueva (si no viene de un jumpToIndex explícito)
            // o simplemente asegurar que exista. addVisit ya maneja preservar el index si existe.
            HistoryManager.addVisit({
                id: lawId,
                type: 'law',
                title: metaData.title,
                subtitle: `${metaData.itemCount || 0} artículos`,
                data: { lawId },
                lastArticleIndex: jumpToIndex || 0
            });

            let initialItems;
            if (jumpToIndex !== undefined && jumpToIndex !== null && jumpToIndex > 0) {
                // Cargar items alrededor del índice de salto
                initialItems = await getLawItems(lawId, jumpToIndex - 1, PAGE_SIZE);
            } else {
                initialItems = await getLawItems(lawId, -1, PAGE_SIZE);
            }

            setItems(initialItems);

            if (initialItems.length < PAGE_SIZE) {
                setHasMore(false);
            } else {
                setLastIndex(initialItems[initialItems.length - 1].index);
            }

            const uri = await checkIfFileExists(lawId);
            setLocalUri(uri);
        } catch (err) {
            if (err.message === 'OFFLINE_ERROR') {
                setError('OFFLINE_ERROR');
            } else {
                setError('Error al cargar la ley. Por favor, intenta de nuevo.');
                console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadMoreItems = async () => {
        if (loadingMore || !hasMore) return;

        try {
            setLoadingMore(true);
            const nextItems = await getLawItems(lawId, lastIndex, PAGE_SIZE);

            if (nextItems.length === 0) {
                setHasMore(false);
            } else {
                setItems(prev => [...prev, ...nextItems]);
                setLastIndex(nextItems[nextItems.length - 1].index);
                if (nextItems.length < PAGE_SIZE) setHasMore(false);
            }
        } catch (err) {
            console.error('Error al cargar más artículos:', err);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleDownload = async () => {
        if (!law.metadata?.pdfUrl) {
            Alert.alert('No disponible', 'Esta ley aún no tiene un PDF asociado.');
            return;
        }

        setDownloading(true);
        const uri = await downloadFile(law.metadata.pdfUrl, lawId);
        if (uri) setLocalUri(uri);
        setDownloading(false);
    };

    const handleOpenFile = async () => {
        if (localUri) await openFile(localUri);
    };

    const onChangeSearch = query => {
        setSearchQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        const trimmed = query.trim();
        // Permitir búsqueda automática si:
        // 1. Son 3 o más caracteres
        // 2. Es un número (posible artículo)
        const isNumeric = /^\d+$/.test(trimmed);

        if (trimmed.length >= 3 || isNumeric) {
            searchTimeout.current = setTimeout(() => handleSearch(query), 500);
        } else if (trimmed.length === 0) {
            handleSearch('');
        }
    };

    const handleSearch = async (query = searchQuery) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            setIsSearching(false);
            setSearchResults([]);
            setSearchTargetNum(null);
            return;
        }

        try {
            setSearching(true);
            setIsSearching(true);

            const numMatch = trimmedQuery.match(/\d+/);
            if (numMatch && trimmedQuery.length < 10) {
                const targetNum = parseInt(numMatch[0]);
                setSearchTargetNum(targetNum);

                const rawResults = await getLawItemsAround(lawId, targetNum, 1);
                const sortedResults = [...rawResults].sort((a, b) => {
                    if (a.number === targetNum) return -1;
                    if (b.number === targetNum) return 1;
                    return (a.number || 0) - (b.number || 0);
                });

                setSearchResults(sortedResults);
            } else {
                setSearchTargetNum(null);
                const results = await searchLawItemsByText(lawId, trimmedQuery);
                setSearchResults(results);
            }
        } catch (err) {
            console.error('Error en búsqueda:', err);
        } finally {
            setSearching(false);
        }
    };

    const jumpToContext = useCallback(async (index) => {
        try {
            setLoading(true);
            setIsSearching(false);
            setSearchQuery('');
            setSearchTargetNum(null);

            const contextItems = await getLawItems(lawId, index - 1, PAGE_SIZE);
            setItems(contextItems);

            if (contextItems.length < PAGE_SIZE) {
                setHasMore(false);
            } else {
                setLastIndex(contextItems[contextItems.length - 1].index);
                setHasMore(true);
            }

            HistoryManager.updateVisitIndex(lawId, index);
        } catch (err) {
            console.error('Error al saltar al contexto:', err);
        } finally {
            setLoading(false);
        }
    }, [lawId]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setIsSearching(false);
        setSearchResults([]);
        setSearchTargetNum(null);
    }, []);

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0 && !isSearching) {
            const firstVisibleItem = viewableItems[0].item;
            if (firstVisibleItem && firstVisibleItem.index !== undefined) {
                // Actualizar historial silenciosamente mientras hace scroll
                HistoryManager.updateVisitIndex(lawId, firstVisibleItem.index);
            }
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    }).current;

    // Note: highlightText function is defined in LawArticle component - removed duplicate

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const toggleFavoriteArticle = async (item) => {
        const favItem = {
            id: `${lawId}-${item.id || item.index}`,
            type: 'law_article',
            title: `${item.title || `Artículo ${item.number}`} - ${law.title}`,
            subtitle: item.text.substring(0, 100) + '...',
            data: { lawId, itemIndex: item.index, articleNumber: item.number }
        };
        const isAdded = await FavoritesManager.toggleFavorite(favItem);
        loadFavoriteStatus();
    };

    const toggleFavoriteLaw = async () => {
        const favItem = {
            id: lawId,
            type: 'law',
            title: law.title,
            subtitle: `${law.itemCount} artículos`,
            data: { lawId }
        };
        await FavoritesManager.toggleFavorite(favItem);
        loadFavoriteStatus();
    };

    const handleShareArticle = (item) => {
        const message = `${item.title || `Artículo ${item.number}`} de la ${law.title}:\n\n"${item.text}"`;
        FavoritesManager.shareContent(item.title || 'Artículo de Ley', message);
    };

    const handleShareLaw = () => {
        const message = `Te comparto la ${law.title} desde TuLey.`;
        FavoritesManager.shareContent(law.title, message);
    };

    const handleDownloadContent = async () => {
        setIsDownloadingContent(true);
        const success = await downloadLawContent(lawId);
        if (success) {
            setIsOfflineAvailable(true);
            Alert.alert('Éxito', 'Contenido descargado para lectura offline.');
        }
        setIsDownloadingContent(false);
    };

    const handleRemoveOffline = async () => {
        Alert.alert(
            'Eliminar descarga',
            '¿Deseas eliminar esta ley del almacenamiento local?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await OfflineService.deleteLaw(lawId);
                        setIsOfflineAvailable(false);
                    }
                }
            ]
        );
    };

    const openNoteDialog = useCallback((item) => {
        const articleId = `${lawId}-${item.id || item.index}`;
        setEditingNote({
            id: articleId,
            text: notes[articleId]?.text || '',
            title: item.title || `Artículo ${item.number}`
        });
        setNoteDialogVisible(true);
    }, [lawId, notes]);

    const saveNote = async () => {
        await NotesManager.saveNote(editingNote.id, editingNote.text);
        setNoteDialogVisible(false);
        loadNotes();
    };

    const renderHeader = () => (
        <View>
            <LinearGradient
                colors={GRADIENTS.legal}
                style={styles.headerFlat}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <View style={styles.badgeRow}>
                    <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>{law.type?.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                </View>
                <Title style={styles.titleFlat}>{law.title}</Title>
                <View style={styles.headerInfoFlat}>
                    {law.itemCount && (
                        <Text style={styles.itemCountFlat}>{law.itemCount} artículos</Text>
                    )}
                    {law.date && <Text style={styles.dateFlat}> • {formatDate(law.date)}</Text>}
                </View>
                <View style={styles.actionButtonsFlat}>
                    <IconButton
                        icon={favoriteIds.has(lawId) ? "star" : "star-outline"}
                        iconColor={favoriteIds.has(lawId) ? "#FFD700" : "#fff"}
                        size={24}
                        onPress={toggleFavoriteLaw}
                    />
                    <IconButton
                        icon="share-variant"
                        iconColor="#fff"
                        size={24}
                        onPress={handleShareLaw}
                    />
                    <View style={!isOfflineAvailable ? styles.downloadHighlight : null}>
                        <IconButton
                            icon={isOfflineAvailable ? "check-circle" : "download"}
                            iconColor={isOfflineAvailable ? "#4ADE80" : (isDownloadingContent ? "#94A3B8" : "#fff")}
                            size={24}
                            onPress={isOfflineAvailable ? handleRemoveOffline : handleDownloadContent}
                            disabled={isDownloadingContent}
                        />
                    </View>
                    <IconButton
                        icon="format-size"
                        iconColor="#fff"
                        size={24}
                        onPress={() => setSettingsVisible(true)}
                    />
                </View>
            </LinearGradient>

            {!isOfflineAvailable && !isSearching && (
                <Surface style={styles.offlineBanner} elevation={1}>
                    <IconButton icon="information" iconColor={COLORS.accent} size={20} style={{ margin: 0 }} />
                    <View style={{ flex: 1, marginLeft: 5 }}>
                        <Text style={styles.offlineBannerText}>
                            Esta ley no está descargada. <Text style={{ fontWeight: 'bold' }}>Presiona el botón de descarga</Text> para acceder sin internet en el futuro.
                        </Text>
                    </View>
                </Surface>
            )}
        </View>
    );

    const renderItem = useCallback(({ item, index }) => {
        const articleId = `${lawId}-${item.id || item.index}`;
        return (
            <LawArticle
                item={item}
                index={index}
                fontSize={fontSize}
                fontFamily={fontFamily}
                searchQuery={searchQuery}
                isSearching={isSearching}
                isExactMatch={searchTargetNum && item.number === searchTargetNum}
                onOpenNote={openNoteDialog}
                onToggleFavorite={toggleFavoriteArticle}
                onShare={handleShareArticle}
                onJumpToContext={jumpToContext}
                hasNote={!!notes[articleId]}
                noteText={notes[articleId]?.text}
                isFavorite={favoriteIds.has(articleId)}
            />
        );
    }, [lawId, fontSize, fontFamily, searchQuery, isSearching, searchTargetNum, openNoteDialog, toggleFavoriteArticle, handleShareArticle, jumpToContext, notes, favoriteIds]);

    const renderFooter = () => {
        if (!loadingMore) return <View style={{ height: 40 }} />;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingMoreText}>Cargando más artículos...</Text>
            </View>
        );
    };

    if (loading && !isSearching) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando ley...</Text>
            </View>
        );
    }

    if (error || !law) {
        if (error === 'OFFLINE_ERROR') {
            return (
                <View style={[styles.centerContainer, { paddingHorizontal: 40 }]}>
                    <IconButton icon="wifi-off" size={60} iconColor={COLORS.textSecondary} />
                    <Title style={{ textAlign: 'center', marginBottom: 10 }}>Sin Conexión</Title>
                    <Paragraph style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 20 }}>
                        Esta ley no ha sido descargada para uso sin internet. Conéctate a una red para leerla o descargarla.
                    </Paragraph>
                    <Button
                        mode="contained"
                        onPress={() => loadInitialData()}
                        style={{ borderRadius: 20 }}
                    >
                        Reintentar
                    </Button>
                </View>
            );
        }

        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error || 'Ley no encontrada'}</Text>
                <Button onPress={() => loadInitialData()} style={{ marginTop: 10 }}>Reintentar</Button>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Searchbar
                placeholder="Ej: 1400 o 'herencia'..."
                onChangeText={onChangeSearch}
                onIconPress={() => handleSearch()}
                onSubmitEditing={() => handleSearch()}
                value={searchQuery}
                style={styles.searchBarSticky}
                onClearIconPress={clearSearch}
                iconColor={COLORS.primary}
                loading={searching}
            />

            {isSearching && (
                <View style={styles.searchResultsHeader}>
                    {searching ? (
                        <Text style={styles.resultsText}>Buscando...</Text>
                    ) : (
                        <Text style={styles.resultsText}>
                            {searchTargetNum ? `Resultado para Art. ${searchTargetNum}` : `${searchResults.length} resultados encontrados`}
                        </Text>
                    )}
                    <TouchableOpacity onPress={clearSearch}>
                        <Text style={styles.clearSearchText}>Ver todo</Text>
                    </TouchableOpacity>
                </View>
            )}

            <FlatList
                ref={flatListRef}
                data={isSearching ? searchResults : items}
                renderItem={renderItem}
                keyExtractor={(item, index) => `item-${index}-${item.id}`}
                ListHeaderComponent={isSearching ? null : renderHeader}
                ListFooterComponent={isSearching ? null : renderFooter}
                onEndReached={isSearching ? null : loadMoreItems}
                onEndReachedThreshold={0.5}
                contentContainerStyle={styles.contentContainer}
                initialNumToRender={15}
                maxToRenderPerBatch={30}
                windowSize={10}
                removeClippedSubviews={true}
                keyboardShouldPersistTaps="handled"
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
            />

            <ReadingSettingsModal
                visible={settingsVisible}
                onDismiss={() => setSettingsVisible(false)}
            />

            <Portal>
                <Dialog visible={noteDialogVisible} onDismiss={() => setNoteDialogVisible(false)} style={styles.noteDialog}>
                    <Dialog.Title style={styles.noteDialogTitle}>Nota personal: {editingNote.title}</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="Escribe tu anotación aquí..."
                            value={editingNote.text}
                            onChangeText={text => setEditingNote(prev => ({ ...prev, text }))}
                            multiline
                            numberOfLines={5}
                            mode="outlined"
                            style={styles.noteInput}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setNoteDialogVisible(false)}>Cancelar</Button>
                        <Button onPress={saveNote} mode="contained">Guardar</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: COLORS.background },
    headerFlat: {
        paddingTop: 40,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: 10,
    },
    badgeRow: { alignItems: 'center', marginBottom: 12 },
    premiumBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 15,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    premiumBadgeText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 10,
        letterSpacing: 1,
    },
    typeBadge: {
        backgroundColor: COLORS.secondary,
        color: COLORS.text,
        paddingHorizontal: 12,
        height: 24,
        borderRadius: 12,
        fontWeight: 'bold',
        fontSize: 10,
    },
    titleFlat: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
    headerInfoFlat: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
    itemCountFlat: { fontSize: 13, color: '#CBD5E1' },
    dateFlat: { fontSize: 13, color: '#CBD5E1' },
    actionButtonsFlat: { flexDirection: 'row', justifyContent: 'center' },
    headerDividerFlat: { height: 1, backgroundColor: COLORS.border, marginTop: 10 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'left' },
    date: { fontSize: 14, color: '#E5E7EB', marginBottom: 4, textAlign: 'left' },
    metadata: { fontSize: 14, color: COLORS.secondary, fontWeight: '600', marginTop: 4, textAlign: 'left' },
    contentContainer: { paddingHorizontal: 20, paddingVertical: 20 },
    articleCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
    },
    clickableCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    exactMatchCard: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: COLORS.accent
    },
    articleHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 5
    },
    articleActions: { flexDirection: 'row', alignItems: 'center' },
    articleTitleBold: {
        fontWeight: 'bold',
        color: COLORS.primary,
        flex: 1,
        paddingRight: 15, // Más espacio para que el título no toque los botones
    },
    articleText: {
        color: '#334155',
        textAlign: 'left', // Cambiado de justify a left para evitar el bug de recorte en Android
        lineHeight: 22,    // Mejorar legibilidad con alineación a la izquierda
        paddingHorizontal: 4,
    },
    divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 15 },
    headerContainer: {
        marginTop: 30,
        marginBottom: 20,
        paddingHorizontal: 10
    },
    chapterHeader: {
        fontSize: 20,
        fontWeight: '900',
        color: COLORS.primary,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 8
    },
    headerUnderline: {
        height: 3,
        width: 50,
        backgroundColor: COLORS.accent,
        borderRadius: 2
    },
    searchBarSticky: {
        margin: 16,
        backgroundColor: '#fff',
        elevation: 8,
        borderRadius: 15,
        height: 55,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    searchResultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
    resultsText: { fontSize: 15, color: COLORS.accent, fontWeight: 'bold' },
    clearSearchText: { color: COLORS.primary, fontWeight: 'bold' },
    footerLoader: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
    loadingMoreText: { marginTop: 8, fontSize: 14, color: COLORS.textSecondary },
    highlight: { backgroundColor: '#FFD700', fontWeight: 'bold', color: '#000' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    largeLawBadge: { backgroundColor: COLORS.secondary, color: COLORS.text },
    itemCount: { fontSize: 13, color: '#E5E7EB', fontWeight: '500', marginTop: 4 },
    articleActions: { flexDirection: 'row', alignItems: 'center' },
    smallIconButton: { margin: 0, padding: 0 },
    noteDialog: { backgroundColor: '#fff', borderRadius: 12 },
    noteDialogTitle: { color: COLORS.primary, fontSize: 16 },
    noteInput: { backgroundColor: '#fff' },
    noteContent: {
        marginTop: 10,
        padding: 10,
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#D97706',
    },
    noteTextLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#D97706',
        marginBottom: 2,
    },
    noteTextContent: {
        fontSize: 14,
        color: '#92400E',
        fontStyle: 'italic',
    },
    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        padding: 12,
        margin: 15,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    offlineBannerText: {
        fontSize: 13,
        color: '#92400E',
        lineHeight: 18,
    },
    downloadHighlight: {
        backgroundColor: 'rgba(217, 119, 6, 0.3)',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#F59E0B',
    },
});

export default LawDetailScreen;
