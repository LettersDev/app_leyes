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
import { Portal, Dialog, TextInput } from 'react-native-paper';

// Tamaño optimizado para leyes grandes
const PAGE_SIZE = 50;

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
            setError('Error al cargar la ley. Por favor, intenta de nuevo.');
            console.error(err);
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
        searchTimeout.current = setTimeout(() => handleSearch(query), 500);
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

    const jumpToContext = async (index) => {
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

            // Actualizar historial con el nuevo índice
            HistoryManager.updateVisitIndex(lawId, index);
        } catch (err) {
            console.error('Error al saltar al contexto:', err);
        } finally {
            setLoading(false);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setIsSearching(false);
        setSearchResults([]);
        setSearchTargetNum(null);
    };

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
        const message = `Te comparto la ${law.title} desde AppLeyes.`;
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

    const openNoteDialog = (item) => {
        const articleId = `${lawId}-${item.id || item.index}`;
        setEditingNote({
            id: articleId,
            text: notes[articleId]?.text || '',
            title: item.title || `Artículo ${item.number}`
        });
        setNoteDialogVisible(true);
    };

    const saveNote = async () => {
        await NotesManager.saveNote(editingNote.id, editingNote.text);
        setNoteDialogVisible(false);
        loadNotes();
    };

    const renderHeader = () => (
        <View>
            <Card style={styles.headerCard}>
                <Card.Content>
                    <View style={styles.titleRow}>
                        <Title style={styles.title}>{law.title}</Title>
                        {law.isLargeLaw && (
                            <Badge style={styles.largeLawBadge} size={20}>Ley Extensa</Badge>
                        )}
                    </View>
                    {law.itemCount && (
                        <Paragraph style={styles.itemCount}>{law.itemCount} artículos</Paragraph>
                    )}
                    {law.date && <Paragraph style={styles.date}>Fecha: {formatDate(law.date)}</Paragraph>}
                    {law.metadata?.gacetaNumber && (
                        <Paragraph style={styles.metadata}>Gaceta Oficial N° {law.metadata.gacetaNumber}</Paragraph>
                    )}
                    <View style={styles.actionButtons}>
                        {localUri ? (
                            <Button mode="contained" onPress={handleOpenFile} icon="file-pdf-box" style={styles.downloadButton} buttonColor={COLORS.secondary} textColor={COLORS.text}>
                                Abrir PDF Offline
                            </Button>
                        ) : law.metadata?.pdfUrl ? (
                            <Button mode="contained" onPress={handleDownload} loading={downloading} disabled={downloading} icon="download" style={styles.downloadButton} buttonColor={COLORS.secondary} textColor={COLORS.text}>
                                Descargar PDF
                            </Button>
                        ) : null}

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
                        <IconButton
                            icon={isOfflineAvailable ? "cloud-check" : "cloud-download-outline"}
                            iconColor={isOfflineAvailable ? COLORS.secondary : "#fff"}
                            size={24}
                            onPress={isOfflineAvailable ? handleRemoveOffline : handleDownloadContent}
                            loading={isDownloadingContent}
                            disabled={isDownloadingContent}
                        />
                        <IconButton
                            icon="format-size"
                            iconColor="#fff"
                            size={24}
                            onPress={() => setSettingsVisible(true)}
                        />
                    </View>
                </Card.Content>
            </Card>
        </View>
    );

    const renderItem = ({ item, index }) => {
        if (item.type === 'header') {
            return (
                <View style={styles.headerContainer}>
                    <Text style={styles.chapterHeader}>{item.text}</Text>
                    <Divider style={styles.headerDivider} />
                </View>
            );
        }

        const isExactMatch = searchTargetNum && item.number === searchTargetNum;
        const dataList = isSearching ? searchResults : items;

        const Content = (
            <View style={[
                styles.articleContainer,
                isExactMatch && styles.exactMatchContainer,
                isSearching && styles.clickableArticle
            ]}>
                <View style={styles.articleHeaderRow}>
                    <View style={styles.titleBadgeRow}>
                        <Title
                            selectable={true}
                            style={[
                                styles.articleTitle,
                                isExactMatch && styles.exactMatchTitle,
                                { fontSize: fontSize + 2, fontFamily: fontFamily === 'Serif' ? 'serif' : 'System' }
                            ]}
                        >
                            {highlightText(item.title || `Artículo ${item.number}`, searchQuery)}
                        </Title>
                        {isExactMatch && <Badge style={styles.matchBadge}>Encontrado</Badge>}
                    </View>
                    <View style={styles.articleActions}>
                        <IconButton
                            icon={notes[`${lawId}-${item.id || item.index}`] ? "note-text" : "pencil-outline"}
                            iconColor={notes[`${lawId}-${item.id || item.index}`] ? COLORS.secondary : COLORS.primary}
                            size={20}
                            style={styles.smallIconButton}
                            onPress={() => openNoteDialog(item)}
                        />
                        <IconButton
                            icon={favoriteIds.has(`${lawId}-${item.id || item.index}`) ? "star" : "star-outline"}
                            iconColor={favoriteIds.has(`${lawId}-${item.id || item.index}`) ? "#FFD700" : COLORS.primary}
                            size={20}
                            style={styles.smallIconButton}
                            onPress={() => toggleFavoriteArticle(item)}
                        />
                        <IconButton
                            icon="share-variant"
                            iconColor={COLORS.primary}
                            size={20}
                            style={styles.smallIconButton}
                            onPress={() => handleShareArticle(item)}
                        />
                        {isSearching && (
                            <Text style={styles.tapToSeeMore}>Toca para ver todo</Text>
                        )}
                    </View>
                </View>
                <Text
                    selectable={true}
                    style={[
                        styles.articleText,
                        { fontSize, fontFamily: fontFamily === 'Serif' ? 'serif' : 'System' }
                    ]}
                >
                    {highlightText(item.text, searchQuery)}
                </Text>
                {notes[`${lawId}-${item.id || item.index}`] && (
                    <View style={styles.noteContent}>
                        <Text style={styles.noteTextLabel}>Mi nota:</Text>
                        <Text style={styles.noteTextContent}>{notes[`${lawId}-${item.id || item.index}`].text}</Text>
                    </View>
                )}
                {index < dataList.length - 1 && dataList[index + 1]?.type !== 'header' && (
                    <Divider style={styles.divider} />
                )}
            </View>
        );

        if (isSearching) {
            return (
                <TouchableOpacity onPress={() => jumpToContext(item.index)} activeOpacity={0.7}>
                    {Content}
                </TouchableOpacity>
            );
        }

        return Content;
    };

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
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error || 'Ley no encontrada'}</Text>
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
    container: { flex: 1, backgroundColor: COLORS.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: COLORS.background },
    headerCard: { margin: 16, backgroundColor: COLORS.primary, borderRadius: 12, elevation: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
    date: { fontSize: 14, color: '#E5E7EB', marginBottom: 4 },
    metadata: { fontSize: 14, color: COLORS.secondary, fontWeight: '600', marginTop: 4 },
    contentContainer: { paddingHorizontal: 16, paddingBottom: 24 },
    articleContainer: { marginBottom: 20, padding: 8, borderRadius: 8 },
    clickableArticle: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
    exactMatchContainer: { backgroundColor: '#F0F9FF', borderLeftWidth: 4, borderLeftColor: COLORS.primary, borderColor: COLORS.primary },
    articleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    titleBadgeRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    articleTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, flexShrink: 1 },
    exactMatchTitle: { color: COLORS.primary },
    matchBadge: { backgroundColor: COLORS.primary, color: '#fff', marginLeft: 8 },
    tapToSeeMore: { fontSize: 10, color: COLORS.secondary, fontStyle: 'italic' },
    articleText: { fontSize: 15, color: COLORS.text, lineHeight: 24, textAlign: 'justify' },
    divider: { marginTop: 16, backgroundColor: COLORS.border },
    actionButtons: { marginTop: 16, flexDirection: 'row', justifyContent: 'center' },
    downloadButton: { borderRadius: 8, paddingHorizontal: 16 },
    loadingText: { marginTop: 12, fontSize: 16, color: COLORS.textSecondary },
    errorText: { fontSize: 16, color: COLORS.error, textAlign: 'center' },
    headerContainer: { marginTop: 24, marginBottom: 16 },
    chapterHeader: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    headerDivider: { height: 2, backgroundColor: COLORS.secondary, borderRadius: 2 },
    searchBarSticky: { margin: 16, backgroundColor: COLORS.surface, elevation: 4, borderRadius: 8, height: 50 },
    searchResultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    resultsText: { fontSize: 14, color: COLORS.primary, fontWeight: 'bold' },
    clearSearchText: { color: COLORS.primary, fontWeight: '600' },
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
});

export default LawDetailScreen;
