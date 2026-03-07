const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ──────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100;
// Espera entre el envío y la consulta de receipts (Expo recomienda ≥ 15 min en producción.
// Aquí lo dejamos en 5s para tareas de limpieza inmediata en scripts manuales).
const RECEIPT_WAIT_MS = 5000;

const EXPO_HEADERS = {
    'Accept': 'application/json',
    'Accept-encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
};

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Divide un array en chunks de tamaño máximo dado.
 */
const _chunk = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

/**
 * Envía mensajes push a Expo en chunks de 100.
 * Devuelve un mapa ticketId -> token para poder correlacionar receipts.
 * @param {Array<{to: string, ...}>} messages
 * @returns {Promise<Map<string, string>>} ticketId -> token
 */
const _sendMessages = async (messages) => {
    const ticketToToken = new Map();

    for (const chunk of _chunk(messages, CHUNK_SIZE)) {
        try {
            const response = await axios.post(EXPO_PUSH_URL, chunk, { headers: EXPO_HEADERS });
            const tickets = Array.isArray(response.data?.data) ? response.data.data : [response.data.data];

            tickets.forEach((ticket, idx) => {
                if (ticket?.id) {
                    ticketToToken.set(ticket.id, chunk[idx].to);
                } else if (ticket?.status === 'error') {
                    console.warn(`   ⚠️  Error inmediato en ticket ${idx}: ${ticket.message} (${ticket.details?.error})`);
                }
            });
        } catch (err) {
            console.error('   ❌ Error enviando chunk:', err.response?.data || err.message);
        }
    }

    return ticketToToken;
};

/**
 * Consulta los receipts finales de Expo y devuelve los tokens que deben eliminarse.
 * Un token debe eliminarse cuando el receipt tiene error: 'DeviceNotRegistered'.
 * @param {Map<string, string>} ticketToToken
 * @returns {Promise<string[]>} lista de tokens inválidos
 */
const _collectInvalidTokens = async (ticketToToken) => {
    if (ticketToToken.size === 0) return [];

    const ticketIds = [...ticketToToken.keys()];
    const invalidTokens = [];

    for (const chunk of _chunk(ticketIds, CHUNK_SIZE)) {
        try {
            const response = await axios.post(
                EXPO_RECEIPTS_URL,
                { ids: chunk },
                { headers: EXPO_HEADERS }
            );
            const receipts = response.data?.data ?? {};

            for (const [ticketId, receipt] of Object.entries(receipts)) {
                if (receipt?.status === 'error') {
                    const errorType = receipt.details?.error;
                    const token = ticketToToken.get(ticketId);
                    console.warn(`   ⚠️  Receipt error para ticket ${ticketId}: ${errorType}`);

                    if (errorType === 'DeviceNotRegistered' && token) {
                        invalidTokens.push(token);
                    }
                }
            }
        } catch (err) {
            console.error('   ❌ Error consultando receipts:', err.response?.data || err.message);
        }
    }

    return invalidTokens;
};

/**
 * Elimina tokens inválidos de Supabase.
 * @param {string[]} tokens
 */
const _removeInvalidTokens = async (tokens) => {
    if (tokens.length === 0) return;

    console.log(`\n🗑️  Eliminando ${tokens.length} token(s) inválido(s) de Supabase...`);
    const { error } = await supabase
        .from('push_tokens')
        .delete()
        .in('token', tokens);

    if (error) {
        console.error('   ❌ Error eliminando tokens:', error.message);
    } else {
        console.log(`   ✅ ${tokens.length} token(s) eliminado(s).`);
    }
};

// ──────────────────────────────────────────────────────────────
// API Pública
// ──────────────────────────────────────────────────────────────

const PushNotifier = {
    /**
     * Envía una notificación a todos los dispositivos registrados.
     * Opcionalmente limpia tokens inválidos consultando los receipts de Expo.
     *
     * @param {string} title   Título de la notificación
     * @param {string} body    Cuerpo del mensaje
     * @param {object} data    Datos adicionales (opcional)
     * @param {object} options
     * @param {boolean} options.cleanInvalidTokens  (default: true) Consultar receipts y eliminar tokens inválidos
     */
    notifyAll: async (title, body, data = {}, { cleanInvalidTokens = true } = {}) => {
        try {
            console.log(`\n🔔 Enviando notificación: "${title}"`);

            // 1. Obtener todos los tokens de Supabase
            const { data: tokensData, error } = await supabase
                .from('push_tokens')
                .select('token');

            if (error) throw error;
            if (!tokensData || tokensData.length === 0) {
                console.log('   ⚠️  No hay dispositivos registrados.');
                return;
            }

            // 2. Deduplicar tokens
            const uniqueTokens = [...new Set(tokensData.map(t => t.token))];
            console.log(`   📱 ${uniqueTokens.length} dispositivo(s) único(s).`);

            // 3. Preparar mensajes
            const messages = uniqueTokens.map(token => ({
                to: token,
                sound: 'default',
                title,
                body,
                data,
                channelId: 'tuley-default',
            }));

            // 4. Enviar y recolectar ticketIds
            const ticketToToken = await _sendMessages(messages);
            console.log(`   ✅ Notificación enviada a ${uniqueTokens.length} dispositivo(s). Tickets: ${ticketToToken.size}`);

            // 5. (Opcional) Consultar receipts y limpiar tokens inválidos
            if (cleanInvalidTokens && ticketToToken.size > 0) {
                console.log(`\n⏳ Esperando ${RECEIPT_WAIT_MS / 1000}s antes de consultar receipts...`);
                await new Promise(resolve => setTimeout(resolve, RECEIPT_WAIT_MS));

                const invalidTokens = await _collectInvalidTokens(ticketToToken);
                await _removeInvalidTokens(invalidTokens);
            }

        } catch (error) {
            console.error('   ❌ Error en notifyAll:', error.response?.data || error.message);
        }
    },
};

module.exports = PushNotifier;
