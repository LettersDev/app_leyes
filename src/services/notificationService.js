import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// ID del canal de Android — debe coincidir con el channelId enviado en las notificaciones
export const NOTIFICATION_CHANNEL_ID = 'tuley-default';

// Configuración de cómo se muestran las notificaciones cuando la app está abierta
// NOTA: shouldShowBanner + shouldShowList es la forma moderna (SDK 53+), no shouldShowAlert
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

// ──────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────

/**
 * Crea el canal de Android con alta prioridad.
 * DEBE ejecutarse ANTES de getExpoPushTokenAsync para garantizar
 * compatibilidad con fabricantes como Xiaomi, OPPO y Vivo.
 */
const _ensureAndroidChannel = async () => {
    if (Platform.OS !== 'android') return;
    try {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
            name: 'TuLey',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#C9A227',
            sound: 'default',
            enableLights: true,
            enableVibrate: true,
            showBadge: false,
        });
    } catch (channelError) {
        console.warn('[NotificationService] Error creando canal Android:', channelError.message);
    }
};

/**
 * Intenta obtener el Expo Push Token con reintentos.
 * Cubre fallos transitorios de FCM (dispositivos recién encendidos, red lenta).
 * @param {string} projectId
 * @param {number} maxAttempts
 */
const _getTokenWithRetry = async (projectId, maxAttempts = 3) => {
    const RETRY_DELAY_MS = 4000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[NotificationService] Obteniendo token (intento ${attempt}/${maxAttempts})...`);
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            const token = tokenData?.data;
            if (token) {
                console.log('[NotificationService] Token obtenido ✓');
                return token;
            }
        } catch (err) {
            console.warn(`[NotificationService] Error en intento ${attempt}:`, err.message);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    console.error('[NotificationService] No se pudo obtener el token tras', maxAttempts, 'intentos.');
    return null;
};

/**
 * Guarda o actualiza el token en Supabase.
 * Usa upsert (INSERT ... ON CONFLICT UPDATE) y actualiza last_seen en cada arranque.
 * @param {string} token
 */
const _saveTokenToSupabase = async (token) => {
    const now = new Date().toISOString();

    try {
        const { error } = await supabase
            .from('push_tokens')
            .upsert(
                {
                    token,
                    platform: Platform.OS,
                    last_seen: now,
                    created_at: now,
                },
                { onConflict: 'token' }
            );

        if (error) {
            console.error('[NotificationService] Error upsert Supabase:', error.message, '| code:', error.code);

            // Fallback: INSERT ignorando conflicto (para entornos donde SELECT no está habilitado)
            if (error.code === '42501' || error.message?.includes('permission')) {
                console.log('[NotificationService] Intentando INSERT como fallback por error de permisos...');
                const { error: insertError } = await supabase
                    .from('push_tokens')
                    .insert({ token, platform: Platform.OS, last_seen: now, created_at: now });

                if (insertError && insertError.code !== '23505') {
                    // 23505 = unique_violation, significa que ya existe → no es un error real
                    console.error('[NotificationService] Fallback INSERT también falló:', insertError.message);
                } else {
                    console.log('[NotificationService] Token guardado vía INSERT fallback ✓');
                }
            }
        } else {
            console.log('[NotificationService] Token guardado/actualizado en Supabase ✓');
        }
    } catch (dbError) {
        console.error('[NotificationService] Excepción en DB:', dbError.message);
    }
};

// ──────────────────────────────────────────────────────────────
// Servicio público
// ──────────────────────────────────────────────────────────────

const NotificationService = {
    /**
     * Flujo principal: solicita permisos, obtiene el token y lo guarda en Supabase.
     *
     * Mejoras vs versión anterior:
     *  1. Canal Android creado ANTES del token (Fix Bug #2)
     *  2. Verifica que es un dispositivo físico (evita error en emuladores)
     *  3. Reintenta getExpoPushTokenAsync hasta 3 veces (Fix Bug #4)
     *  4. Timeout separado: 30s para permisos, 90s para flujo completo (Fix Bug #9)
     *  5. Guarda last_seen en cada arranque (Fix Bug #6)
     */
    registerForPushNotificationsAsync: async () => {
        // Timeout global de 90s para el flujo completo
        const globalTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Push registration global timeout (90s)')), 90000)
        );

        const registrationFlow = (async () => {
            try {
                console.log('[NotificationService] ── Iniciando registro ──');

                // Paso 0: Verificar que es un dispositivo físico (no emulador sin Play Services)
                if (!Device.isDevice) {
                    console.warn('[NotificationService] Emulador detectado. Push notifications no disponibles.');
                    return null;
                }

                // Paso 1: Crear canal de Android PRIMERO (requerido en algunos fabricantes)
                await _ensureAndroidChannel();

                // Paso 2: Verificar y solicitar permisos
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;
                console.log('[NotificationService] Estado de permisos actual:', existingStatus);

                if (existingStatus !== 'granted') {
                    // En Android < 13, los permisos se conceden automáticamente al instalar.
                    // En Android 13+ (API 33), se requiere el diálogo explícito.
                    // Timeout de 30s solo para la respuesta del usuario al diálogo.
                    const permissionResult = await Promise.race([
                        Notifications.requestPermissionsAsync(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout esperando respuesta de permisos (30s)')), 30000)
                        ),
                    ]).catch(err => {
                        console.warn('[NotificationService]', err.message);
                        // Si hubo timeout, intentamos con el estado actual
                        return { status: existingStatus };
                    });

                    finalStatus = permissionResult?.status ?? existingStatus;
                }

                console.log('[NotificationService] Estado de permisos final:', finalStatus);

                if (finalStatus !== 'granted') {
                    // En Android < 13 el permiso puede aparecer como "denied" pero FCM
                    // aún entrega tokens. Continuamos de todas formas.
                    console.warn('[NotificationService] Permiso no concedido explícitamente. Continuando de todos modos...');
                }

                // Paso 3: Obtener projectId de forma robusta
                let projectId = 'f30a380e-3412-4c8b-a0e2-aeccec2c6b1d'; // Fallback hardcoded
                try {
                    projectId =
                        Constants?.expoConfig?.extra?.eas?.projectId ||
                        Constants?.easConfig?.projectId ||
                        Constants?.expoConfig?.projectId ||
                        Constants?.manifest?.extra?.eas?.projectId ||
                        projectId;
                } catch {
                    // Usamos el fallback hardcoded
                }
                console.log('[NotificationService] Project ID:', projectId);

                // Paso 4: Obtener token con reintentos automáticos
                const token = await _getTokenWithRetry(projectId, 3);
                if (!token) return null;

                // Paso 5: Guardar en Supabase (con last_seen)
                await _saveTokenToSupabase(token);

                console.log('[NotificationService] ── Registro completado ✓ ──');
                return token;

            } catch (error) {
                console.error('[NotificationService] Error crítico en registro:', error.message);
                return null;
            }
        })();

        try {
            return await Promise.race([registrationFlow, globalTimeout]);
        } catch (err) {
            console.warn('[NotificationService]', err.message);
            return null;
        }
    },

    /**
     * Listener para cuando llega una notificación con la app abierta
     */
    addListener: (callback) => {
        return Notifications.addNotificationReceivedListener(callback);
    },

    /**
     * Listener para cuando el usuario toca la notificación
     */
    addResponseListener: (callback) => {
        return Notifications.addNotificationResponseReceivedListener(callback);
    },
};

export default NotificationService;
