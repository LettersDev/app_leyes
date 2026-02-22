const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const agent = new https.Agent({ rejectUnauthorized: false });

// ─── SCRAPING DIRECTO DE GACETAS (FALLBACK PARA 2024-2026 / MODO SMART) ───────────────
async function scrapeDirectoPorRango(startNum, endNum, esExtraordinaria, stopOnGap = false) {
    const tipoLabel = esExtraordinaria ? 'Extraordinaria' : 'Ordinaria';
    console.log(`🔎 Buscando gacetas ${tipoLabel} modernas: ${startNum} - ${endNum}`);

    let consecutiveGaps = 0;
    const MAX_GAPS = 10;

    for (let num = startNum; num <= endNum; num++) {
        if (stopOnGap && consecutiveGaps >= MAX_GAPS) {
            console.log(`\n🛑 Se alcanzaron ${MAX_GAPS} huecos seguidos. Asumiendo que no hay más ${tipoLabel} por ahora.`);
            break;
        }

        const displayNum = num.toString().replace(/(\d)(\d{3})$/, '$1.$2');
        const id = esExtraordinaria ? `gaceta-E${num}` : `gaceta-${num}`;

        // Verificamos si ya existe para ahorrar tiempo
        const { data: exists } = await supabase.from('gacetas').select('id').eq('id', id).maybeSingle();
        if (exists) {
            process.stdout.write('s');
            consecutiveGaps = 0;
            continue;
        }

        const folders = esExtraordinaria ? ['gaceta', 'gaceta_ext'] : ['gaceta'];
        const formats = [displayNum, num.toString()];

        let foundInRange = false;

        for (const folder of folders) {
            for (const fmt of formats) {
                const url = `http://historico.tsj.gob.ve/${folder}/blanco.asp?nrogaceta=${fmt}`;

                try {
                    const res = await fetchWithRetry(url, {
                        httpsAgent: agent,
                        timeout: 10000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    }, 1, 2500);

                    if (res.data.includes('Caracter no V') || res.data.includes('Error')) continue;

                    const $ = cheerio.load(res.data);
                    let sumario = $('p.sumario').text().trim();
                    let fechaTexto = $('p.fecha').text().trim();

                    if (!sumario || sumario.toLowerCase() === 'sumario') {
                        const allText = [];
                        $('body p').each((i, el) => {
                            const txt = $(el).text().trim();
                            if (txt && txt.toLowerCase() !== 'sumario' && !txt.includes(`N°:${num}`)) {
                                allText.push(txt);
                            }
                        });
                        sumario = allText.join('\n').substring(0, 3000);
                    }

                    if (sumario && sumario.length > 10) {
                        const cleanSumario = sumario.replace(/\s+/g, ' ');
                        let year = new Date().getFullYear();

                        const textYearMatch = (fechaTexto + sumario).match(/202[4-6]/);
                        if (textYearMatch) {
                            year = parseInt(textYearMatch[0]);
                        } else {
                            $('a[href*="202"]').each((i, el) => {
                                const href = $(el).attr('href');
                                const hrefMatch = href.match(/202[4-6]/);
                                if (hrefMatch) {
                                    year = parseInt(hrefMatch[0]);
                                    return false;
                                }
                            });
                        }

                        const row = {
                            id: id,
                            numero: num,
                            numero_display: displayNum,
                            fecha: fechaTexto || `Año ${year}`,
                            ano: year,
                            url_original: url,
                            titulo: cleanSumario.substring(0, 120) + '...',
                            subtitulo: `Gaceta ${tipoLabel} N° ${displayNum}`,
                            sumario: cleanSumario,
                            tipo: tipoLabel,
                            timestamp: new Date(year, 0, 1).toISOString()
                        };

                        const { error } = await supabase.from('gacetas').upsert(row);
                        if (!error) {
                            console.log(`\n      ✨ ¡Guardada! ${tipoLabel} N° ${displayNum} (usando ${fmt}) en [${folder}]`);
                            foundInRange = true;
                            break;
                        }
                    }
                } catch (e) { }
            }
            if (foundInRange) break;
        }

        if (!foundInRange) {
            process.stdout.write('.');
            consecutiveGaps++;
        } else {
            consecutiveGaps = 0;
        }
    }
}

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 5000) {
    try {
        if (!options.headers) options.headers = {};
        options.headers['Accept-Encoding'] = 'identity';
        const response = await axios.get(url, { ...options, responseType: 'arraybuffer' });
        const decoder = new TextDecoder('windows-1252');
        response.data = decoder.decode(response.data);
        return response;
    } catch (err) {
        const retriableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND'];
        if (retries > 0 && (retriableCodes.includes(err.code) || err.response?.status >= 500)) {
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
}

function isGacetaExtraordinaria(num, displayNum, typeText, summary) {
    const typeLower = (typeText || '').toLowerCase();
    const summaryLower = (summary || '').toLowerCase();
    if (typeLower === 'ordinaria' && num > 20000) return false;
    if (typeLower.includes('extraordinaria')) return true;
    if (summaryLower.includes('extraordinaria')) return true;
    if (displayNum && displayNum.includes('.') && num < 40000) return true;
    if (num > 0 && num < 20000 && !typeLower) return true;
    return false;
}

// ─── LÓGICA PRINCIPAL (RESTABLECIDA) ──────────────────────────────────────────
async function getGacetas() {
    const args = process.argv.slice(2);
    console.log(`\n📜 Iniciando Scraper de Gacetas Oficiales...`);

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
        return;
    }

    // NUEVO MODO SMART (Solicitado por el usuario)
    if (args.includes('--mode=smart')) {
        console.log(`   🧠 Modo: Smart (Incremental)`);

        const { data: lastOrd } = await supabase.from('gacetas').select('numero').eq('tipo', 'Ordinaria').order('numero', { ascending: false }).limit(1).maybeSingle();
        const startOrd = (lastOrd?.numero || 43000) + 1;
        await scrapeDirectoPorRango(startOrd, startOrd + 50, false, true);

        const { data: lastExt } = await supabase.from('gacetas').select('numero').eq('tipo', 'Extraordinaria').order('numero', { ascending: false }).limit(1).maybeSingle();
        const startExt = (lastExt?.numero || 6800) + 1;
        await scrapeDirectoPorRango(startExt, startExt + 50, true, true);
        return;
    }

    // LÓGICA ORIGINAL DE MODOS (MANTENIDA PARA FLEXIBILIDAD)
    const yearArg = args.find(arg => arg.startsWith('--year='));
    const TARGET_YEAR = yearArg ? parseInt(yearArg.split('=')[1]) : null;
    const IS_BACKFILL = args.includes('--mode=backfill');
    const IS_FULL = args.includes('--mode=full');
    const IS_REPAIR = args.includes('--mode=repair');
    const IS_EXTRA_ONLY = args.includes('--mode=extra');

    const MAX_WRITES = (IS_BACKFILL || IS_FULL) ? 2000 : 500;

    try {
        if (!TARGET_YEAR || TARGET_YEAR >= 2024) {
            // Sincronización directa para el hueco 2024-2026
            await scrapeDirectoPorRango(42700, 43500, false);
            await scrapeDirectoPorRango(6750, 7200, true);
        }

        const currentYear = new Date().getFullYear();
        let targetYears = [];

        if (TARGET_YEAR) {
            targetYears = [TARGET_YEAR];
        } else if (IS_BACKFILL) {
            let lastHistoricalYearSynced = 1999;
            const { data: syncData } = await supabase.from('sync_monitor').select('data').eq('id', 'gacetas_sync').maybeSingle();
            if (syncData) lastHistoricalYearSynced = syncData.data?.lastHistoricalYearSynced || 1999;
            const nextYear = lastHistoricalYearSynced + 1;
            targetYears = [currentYear, currentYear - 1];
            if (nextYear < currentYear - 1) targetYears.push(nextYear);
        } else {
            targetYears = [currentYear];
        }

        console.log("   🔍 Obteniendo lista del TSJ...");
        const res = await fetchWithRetry(TSJ_BASE, {
            params: { ...TSJ_PARAMS_BASE, 'server[method]': '/listGaceta' },
            httpsAgent: agent,
            headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
            timeout: 30000
        });

        if (res.data.coleccion && res.data.coleccion.GACETA) {
            const list = res.data.coleccion.GACETA;

            const matchedItems = list.filter(g => {
                if (IS_FULL) return true;
                const rawNum = g.sgacenumero || '';
                const cleanNum = parseInt(rawNum.replace(/[.,\s]/g, ''));
                const summary = g.sgacedescripcion || '';
                const isExtra = isGacetaExtraordinaria(cleanNum, rawNum, g.sgacetipo || '', summary);
                if (IS_EXTRA_ONLY) return isExtra;
                const parts = g.sgacefecha?.split('/') || [];
                const year = parseInt(parts[2]);
                return targetYears.includes(year) || isExtra;
            });

            console.log(`   📋 Gacetas filtradas: ${matchedItems.length}`);

            // Lógica de guardado en lote...
            for (const g of matchedItems.slice(0, MAX_WRITES)) {
                await saveGaceta(g);
                await new Promise(r => setTimeout(r, 200));
            }

            if (IS_BACKFILL && !TARGET_YEAR) {
                const { data: syncData } = await supabase.from('sync_monitor').select('data').eq('id', 'gacetas_sync').maybeSingle();
                const cur = syncData?.data?.lastHistoricalYearSynced || 1999;
                if (cur + 1 < currentYear - 1) {
                    await supabase.from('sync_monitor').upsert({
                        id: 'gacetas_sync',
                        data: { lastHistoricalYearSynced: cur + 1, lastUpdate: new Date().toISOString() },
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }
    } catch (e) {
        console.error(`   ❌ Error fatal: ${e.message}`);
    }
}

async function saveGaceta(g) {
    if (!g.igaceid) return;
    let rawNum = g.sgacenumero || '';
    let num = parseInt(rawNum.replace(/[.,\s]/g, ''));
    let cleanNumStr = rawNum.replace(/[.,\s]/g, '');
    let summary = g.sgacedescripcion || g.sgacesumario || '';

    const isExtra = isGacetaExtraordinaria(num, rawNum, g.sgacetipo || '', summary);
    const type = isExtra ? 'Extraordinaria' : 'Ordinaria';
    const finalId = isExtra ? `gaceta-E${num}` : `gaceta-${num}`;
    const folder = isExtra ? 'gaceta_ext' : 'gaceta';
    const urlGaceta = `http://historico.tsj.gob.ve/${folder}/blanco.asp?nrogaceta=${cleanNumStr}`;

    const parts = (g.sgacefecha || '').split('/');
    if (parts.length !== 3) return;
    const dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);

    const row = {
        id: finalId, numero: num, numero_display: rawNum, fecha: g.sgacefecha,
        ano: parseInt(parts[2]), mes: parseInt(parts[1]), dia: parseInt(parts[0]),
        timestamp: dateObj.toISOString(), url_original: urlGaceta,
        titulo: summary ? `${summary.substring(0, 80)}...` : `Gaceta Oficial N° ${rawNum}`,
        subtitulo: `Gaceta ${type} N° ${rawNum}`,
        sumario: summary, tipo: type
    };

    const { error } = await supabase.from('gacetas').upsert(row);
    if (!error) process.stdout.write('+');
}

const TSJ_BASE = 'http://www.tsj.gob.ve/gaceta-oficial';
const TSJ_PARAMS_BASE = {
    p_p_id: 'receiverGacetaOficial_WAR_NoticiasTsjPorlet612',
    p_p_lifecycle: '2', p_p_state: 'normal', p_p_mode: 'view',
    p_p_cacheability: 'cacheLevelPage', 'server[endpoint]': '/services/WSGacetaOficial.HTTPEndpoint',
};

getGacetas();
