import { collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAt, endAt } from 'firebase/firestore';
import { db } from '../config/firebase';
import OfflineService from './offlineService';

const LAWS_COLLECTION = 'laws';

const normalizeText = (text) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Obtener todas las leyes
 */
export const getAllLaws = async () => {
    try {
        const lawsRef = collection(db, LAWS_COLLECTION);
        const snapshot = await getDocs(lawsRef);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error al obtener leyes:', error);
        throw error;
    }
};

/**
 * Obtener leyes por categoría
 */
export const getLawsByCategory = async (category) => {
    try {
        const lawsRef = collection(db, LAWS_COLLECTION);
        const q = query(lawsRef, where('category', '==', category));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error al obtener leyes por categoría:', error);
        throw error;
    }
};

/**
 * Obtener una ley específica por ID (solo metadatos)
 */
export const getLawById = async (lawId) => {
    try {
        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.metadata) {
            return offlineLaw.metadata;
        }

        const lawRef = doc(db, LAWS_COLLECTION, lawId);
        const snapshot = await getDoc(lawRef);

        if (snapshot.exists()) {
            return {
                id: snapshot.id,
                ...snapshot.data()
            };
        } else {
            throw new Error('Ley no encontrada');
        }
    } catch (error) {
        console.error('Error al obtener ley:', error);
        throw error;
    }
};

/**
 * Obtener los items (artículos/encabezados) de una ley de forma paginada
 */
export const getLawItems = async (lawId, lastIndex = -1, pageSize = 50) => {
    try {
        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            // Filtrar y paginar el array local
            return offlineLaw.items
                .filter(item => item.index > lastIndex)
                .slice(0, pageSize);
        }

        const itemsRef = collection(db, LAWS_COLLECTION, lawId, 'items');
        const q = query(
            itemsRef,
            where('index', '>', lastIndex),
            orderBy('index', 'asc'),
            limit(pageSize)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error al obtener items de la ley:', error);
        throw error;
    }
};

/**
 * Buscar un artículo específico por su número
 */
export const getLawItemByNumber = async (lawId, articleNumber) => {
    try {
        const itemsRef = collection(db, LAWS_COLLECTION, lawId, 'items');
        const q = query(
            itemsRef,
            where('number', '==', parseInt(articleNumber)),
            limit(1)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return {
                id: snapshot.docs[0].id,
                ...snapshot.docs[0].data()
            };
        }
        return null;
    } catch (error) {
        console.error('Error al buscar artículo por número:', error);
        throw error;
    }
};

/**
 * Buscar artículos por texto dentro de una ley específica
 */
export const searchLawItemsByText = async (lawId, searchText) => {
    try {
        let items;
        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            items = offlineLaw.items;
        } else {
            const itemsRef = collection(db, LAWS_COLLECTION, lawId, 'items');
            const snapshot = await getDocs(itemsRef);
            items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        const searchNorm = normalizeText(searchText);
        const results = items
            .filter(item =>
                normalizeText(item.text).includes(searchNorm) ||
                normalizeText(item.title).includes(searchNorm)
            )
            .sort((a, b) => (a.index || 0) - (b.index || 0));

        return results.slice(0, 50);
    } catch (error) {
        console.error('Error en búsqueda interna:', error);
        throw error;
    }
};

/**
 * Obtener artículos vecinos dado un número central
 */
export const getLawItemsAround = async (lawId, articleNumber, windowSize = 2) => {
    try {
        const num = parseInt(articleNumber);

        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            return offlineLaw.items
                .filter(item => item.number >= num - windowSize && item.number <= num + windowSize)
                .sort((a, b) => (a.number || 0) - (b.number || 0));
        }

        const itemsRef = collection(db, LAWS_COLLECTION, lawId, 'items');
        const q = query(
            itemsRef,
            where('number', '>=', num - windowSize),
            where('number', '<=', num + windowSize),
            orderBy('number', 'asc')
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error al obtener artículos vecinos:', error);
        throw error;
    }
};

/**
 * Buscar leyes por texto (Global)
 */
export const searchLaws = async (searchText) => {
    try {
        const allLaws = await getAllLaws();
        const searchNorm = normalizeText(searchText);

        return allLaws.filter(law =>
            normalizeText(law.title).includes(searchNorm) ||
            normalizeText(law.searchableText).includes(searchNorm)
        );
    } catch (error) {
        console.error('Error al buscar leyes:', error);
        throw error;
    }
};

/**
 * Obtener actualizaciones recientes
 */
export const getRecentUpdates = async (limitCount = 10) => {
    try {
        const lawsRef = collection(db, LAWS_COLLECTION);
        const q = query(
            lawsRef,
            orderBy('lastUpdated', 'desc'),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error al obtener actualizaciones recientes:', error);
        throw error;
    }
};

/**
 * Descargar todos los artículos de una ley para uso offline
 */
export const downloadLawContent = async (lawId) => {
    try {
        const metadata = await getLawById(lawId);
        const itemsRef = collection(db, LAWS_COLLECTION, lawId, 'items');
        const q = query(itemsRef, orderBy('index', 'asc'));

        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const fullData = {
            metadata,
            items,
            downloadedAt: new Date().toISOString()
        };

        return await OfflineService.saveLaw(lawId, fullData);
    } catch (error) {
        console.error('Error downloading law content:', error);
        return false;
    }
};
