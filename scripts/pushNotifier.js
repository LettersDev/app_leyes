const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PushNotifier = {
    /**
     * Envía una notificación a todos los usuarios registrados
     * @param {string} title Título de la notificación
     * @param {string} body Cuerpo del mensaje
     * @param {object} data Datos adicionales (opcional)
     */
    notifyAll: async (title, body, data = {}) => {
        try {
            console.log(`\n🔔 Generando notificación: "${title}"`);

            // 1. Obtener todos los tokens de Supabase
            const { data: tokensData, error } = await supabase
                .from('push_tokens')
                .select('token');

            if (error) throw error;
            if (!tokensData || tokensData.length === 0) {
                console.log('   ⚠️ No hay dispositivos registrados para notificar.');
                return;
            }

            const tokens = tokensData.map(t => t.token);

            // 2. Preparar mensajes para la API de Expo
            // Expo permite hasta 100 mensajes por chunk
            const messages = tokens.map(token => ({
                to: token,
                sound: 'default',
                title: title,
                body: body,
                data: data,
            }));

            // 3. Enviar a Expo
            const response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });

            console.log(`   ✅ Notificación enviada a ${tokens.length} dispositivos.`);
            // console.log('   Response:', JSON.stringify(response.data));

        } catch (error) {
            console.error('   ❌ Error enviando notificaciones:', error.response?.data || error.message);
        }
    }
};

module.exports = PushNotifier;
