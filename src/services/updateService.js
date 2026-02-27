/**
 * updateService.js
 * Compara la versión local de la app con la última versión publicada en Supabase.
 * Si hay una versión más reciente disponible, retorna hasUpdate: true.
 */
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Compara dos strings de versión semántica (ej: "1.2.3" vs "1.3.0")
 * @returns {boolean} true si remoteVersion es mayor que localVersion
 */
function isNewerVersion(localVersion, remoteVersion) {
    if (!localVersion || !remoteVersion) return false;

    const local = localVersion.split('.').map(Number);
    const remote = remoteVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(local.length, remote.length); i++) {
        const l = local[i] ?? 0;
        const r = remote[i] ?? 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

/**
 * Verifica si hay una nueva versión disponible en Supabase.
 * @returns {{ hasUpdate: boolean, latestVersion: string, currentVersion: string }}
 */
export async function checkForUpdate() {
    try {
        const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

        const { data, error } = await supabase
            .from('app_metadata')
            .select('latest_app_version')
            .eq('id', 'singleton')
            .single();

        if (error || !data?.latest_app_version) {
            console.log('updateService: No se pudo obtener latest_app_version:', error?.message);
            return { hasUpdate: false, latestVersion: null, currentVersion };
        }

        const latestVersion = data.latest_app_version;
        const hasUpdate = isNewerVersion(currentVersion, latestVersion);

        console.log(`updateService: local=${currentVersion}, remoto=${latestVersion}, hasUpdate=${hasUpdate}`);
        return { hasUpdate, latestVersion, currentVersion };
    } catch (err) {
        console.error('updateService: Error inesperado:', err);
        return { hasUpdate: false, latestVersion: null, currentVersion: '0.0.0' };
    }
}
