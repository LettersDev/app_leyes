/**
 * getGacetas.js - Scraper de Gacetas Oficiales de Venezuela (V3.1 - Confirmed Sumario Structure)
 *
 * La página sumario.asp?fecha=DD/MM/YYYY tiene esta estructura:
 *   <p class="numero">N°:43314</p>
 *   <p><a href="febrero/1022026/1022026-7630.pdf#page=1">Decreto Nro. ...</a></p>
 *
 * Estrategia: Visita cada día hábil → encuentra todos los p.numero → extrae el sumario de los <a> siguientes → guarda.
 *
 * Modos:
 *   (sin args)        → últimas 2 semanas
 *   --mode=smart      → últimas 4 semanas (cron diario)
 *   --mode=full       → 2020 a hoy
 *   --year=2025       → solo ese año
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const agent = new https.Agent({ rejectUnauthorized: false });
const PushNotifier = require('./pushNotifier');

let newGacetasCount = 0;

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

const MESES_MAP = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Limpia y mejora el texto del sumario:
 * - Elimina prefijos de navegación ("-- Ir al organismo...")
 * - Extrae solo los textos de las leyes/decretos (links que no son el numero)
 * - Devuelve { titulo, sumario }
 */
function buildTituloYSumario(rawLines, tipo) {
    // Prefijos a ignorar (navegación de la página, no contenido real)
    const IGNORAR = [
        /^--\s*ir al organismo/i,
        /^ir al organismo/i,
        /^se?ñalado en el sumario/i,
        /^sumario$/i,
        /^\s*$/,
        /^imprimir$/i,
        /^leer gaceta/i
    ];

    // Limpiar cada línea
    const lineas = rawLines
        .map(l => l.replace(/--\s*/g, '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '))
        .filter(l => l.length > 4 && !IGNORAR.some(re => re.test(l)));

    // Agrupar: ministerios (cabeceras en MAYÚSCULAS o con estructura de cabecera) vs contenido
    const contenido = lineas.filter(l =>
        !(/^MINISTERIO|^PRESIDENCIA|^ASAMBLEA|^CONSEJO|^BANCO|^INSTITUTO|^CORTE|^TRIBUNAL|^SUPERINTEN/i.test(l))
    );

    const items = contenido.length > 0 ? contenido : lineas;
    const sumario = items.join('\n').substring(0, 4000);
    const titulo = items.slice(0, 3).join(' • ').substring(0, 200);

    return { titulo: titulo || `Gaceta ${tipo}`, sumario };
}

async function fetchHtml(url, timeout = 10000, retries = 2) {
    try {
        const res = await axios.get(url, {
            httpsAgent: agent, timeout, responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' }
        });
        return new TextDecoder('windows-1252').decode(res.data);
    } catch (err) {
        const shouldRetry = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(err.code)
            || (err.response?.status >= 500);
        if (retries > 0 && shouldRetry) {
            await sleep(3000);
            return fetchHtml(url, timeout, retries - 1);
        }
        return null;
    }
}

function fechaToTimestamp(fecha) {
    if (!fecha?.includes('/')) return new Date(2024, 0, 1).toISOString();
    const [d, m, a] = fecha.split('/');
    const dt = new Date(`${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`);
    return isNaN(dt) ? new Date(2024, 0, 1).toISOString() : dt.toISOString();
}

/**
 * Extrae fecha del path del PDF relativo. Ej: "febrero/1022026/1022026-7630.pdf"
 * El número de carpeta es: [dia][mes_en_numero][año] → 1022026 = 10/02/2026
 */
function extractFechaFromPdfPath(pdfHref) {
    const m = pdfHref.match(/\/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\/([0-9]{7,9})\//i);
    if (!m) return null;
    const mes = MESES_MAP[m[1].toLowerCase()] || '01';
    const code = m[2];
    const year = code.slice(-4);
    const day = code.slice(0, -4).padStart(2, '0');
    return `${day}/${mes}/${year}`;
}

// ─── PARSER DE SUMARIO POR FECHA ─────────────────────────────────────────────

/**
 * Visita sumario.asp y extrae los datos de TODAS las gacetas de ese día.
 * Retorna array de objetos: { num, rawNum, tipo, fecha, sumario, pdfLinks }
 */
function parseSumarioPage(html, tipo, fechaFallback) {
    const $ = cheerio.load(html);
    const gacetas = [];

    // Cada gaceta está señalada por un p.numero
    $('p.numero').each((_, numEl) => {
        const numeroText = $(numEl).text().trim();
        const numStr = numeroText.replace(/^N°:\s*/i, '').replace(/[.\s]/g, '');
        const num = parseInt(numStr);
        if (!num || num <= 0) return;
        const rawNum = numStr;

        const pdfLinks = [];
        const linkTexts = []; // Solo texto de los <a>, que contiene el nombre real de la ley/decreto
        let el = $(numEl).next();
        while (el.length && !el.is('p.numero') && !el.is('hr')) {
            // Extraer solo el texto de los links a PDF (eso es el nombre del decreto/ley)
            el.find('a[href*=".pdf"]').each((_, a) => {
                const href = $(a).attr('href') || '';
                const text = $(a).text().trim();
                if (href) pdfLinks.push(href);
                // El texto del link es el nombre real del decreto/ley
                if (text && text.length > 5 && !/^--/.test(text) && !/ir al organismo/i.test(text)) {
                    linkTexts.push(text);
                }
            });
            el = el.next();
        }

        // Extraer fecha del primer link PDF
        let fecha = fechaFallback;
        for (const href of pdfLinks) {
            const f = extractFechaFromPdfPath(href);
            if (f) { fecha = f; break; }
        }

        const { titulo, sumario } = buildTituloYSumario(linkTexts, tipo);
        gacetas.push({ num, rawNum, tipo, fecha, titulo, sumario });
    });

    return gacetas;
}

// ─── GUARDAR EN SUPABASE ──────────────────────────────────────────────────────

async function saveGaceta(info) {
    const { num, rawNum, tipo, fecha, titulo: tituloRaw, sumario } = info;
    const id = tipo === 'Extraordinaria' ? `gaceta-E${num}` : `gaceta-${num}`;
    const displayNum = rawNum.replace(/(\d)(\d{3})$/, '$1.$2');

    const { data: exists } = await supabase.from('gacetas').select('id, titulo').eq('id', id).maybeSingle();
    // Saltar solo si existe Y tiene un título limpio
    const hasBadTitle = exists?.titulo && (
        exists.titulo.startsWith('--') ||
        /ir al organismo/i.test(exists.titulo) ||
        exists.titulo.startsWith('señalado')
    );
    if (exists && !hasBadTitle) { process.stdout.write('s'); return false; }

    const year = parseInt(fecha.split('/')[2]) || new Date().getFullYear();
    const timestamp = fechaToTimestamp(fecha);
    const titulo = tituloRaw || (sumario ? sumario.substring(0, 120) : `Gaceta ${tipo} N° ${displayNum}`);
    const folder = tipo === 'Extraordinaria' ? 'gaceta_ext' : 'gaceta';
    const url_original = `http://historico.tsj.gob.ve/${folder}/blanco.asp?nrogaceta=${rawNum}`;

    const { error } = await supabase.from('gacetas').upsert({
        id, numero: num, numero_display: displayNum,
        fecha, ano: year, timestamp, url_original,
        titulo, subtitulo: `Gaceta ${tipo} N° ${displayNum}`,
        sumario: sumario || titulo, tipo
    });

    if (!error) {
        process.stdout.write('+');
        newGacetasCount++;
        return true;
    } else {
        process.stdout.write('e');
        return false;
    }
}

// ─── SCAN POR FECHA ───────────────────────────────────────────────────────────

async function scanFechas(fechas) {
    let found = 0;
    console.log(`\n📅 Escaneando ${fechas.length} días...`);

    for (const fecha of fechas) {
        const urls = [
            { url: `http://historico.tsj.gob.ve/gaceta/sumario.asp?fecha=${fecha}`, tipo: 'Ordinaria' },
            { url: `http://historico.tsj.gob.ve/gaceta_ext/sumario.asp?fecha=${fecha}`, tipo: 'Extraordinaria' }
        ];

        for (const { url, tipo } of urls) {
            const html = await fetchHtml(url, 8000);
            if (!html || html.includes('no se ha podido') || html.includes('sin resultados')) continue;

            const gacetas = parseSumarioPage(html, tipo, fecha);
            if (gacetas.length > 0) {
                process.stdout.write(`\n  📰 ${fecha} [${tipo[0]}${gacetas.length}] `);
                for (const g of gacetas) {
                    await saveGaceta(g);
                    await sleep(400);
                }
                found += gacetas.length;
            }
        }

        await sleep(200);
    }

    console.log(`\n\n✅ Dias escaneados: ${fechas.length} | Gacetas encontradas: ${found} | Nuevas guardadas: ${newGacetasCount}`);
}

// ─── GENERACIÓN DE FECHAS ─────────────────────────────────────────────────────

function generarFechas(startYear, endYear) {
    const fechas = [];
    const hoy = new Date();
    const inicio = new Date(startYear, 0, 1);
    const fin = new Date(Math.min(endYear, hoy.getFullYear()), hoy.getMonth(), hoy.getDate());
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        fechas.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    return fechas;
}

function generarFechasRecientes(semanas = 4) {
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - semanas * 7);
    return generarFechas(inicio.getFullYear(), hoy.getFullYear())
        .filter(f => {
            const [d, m, a] = f.split('/');
            return new Date(`${a}-${m}-${d}`) >= inicio;
        });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    console.log('\n📜 Scraper Gacetas V3.2 (Modo Diario por Fecha)');
    console.log('=================================================');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Faltan variables de entorno.');
        process.exit(1);
    }

    let fechas;
    let shouldNotify = false;

    if (args.includes('--mode=daily')) {
        // ✅ MODO CRON DIARIO: solo hoy y ayer, igual que jurisprudencia
        const hoy = new Date();
        const ayer = new Date();
        ayer.setDate(hoy.getDate() - 1);

        const fmt = (d) =>
            `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        fechas = [fmt(ayer), fmt(hoy)];
        console.log(`📅 Modo: Daily (${fechas.join(' y ')})\n`);
        shouldNotify = true; // Solo notificamos en modo diario

    } else if (args.includes('--mode=smart')) {
        // 🧠 MODO RECUPERACIÓN: últimas 4 semanas, solo para uso manual
        console.log('🧠 Modo: Smart (últimas 4 semanas) — SIN notificación push\n');
        fechas = generarFechasRecientes(4);
        shouldNotify = false;

    } else if (args.includes('--mode=full')) {
        console.log('🚀 Modo: Full (2020 → hoy) — SIN notificación push\n');
        fechas = generarFechas(2020, new Date().getFullYear());
        shouldNotify = false;

    } else {
        const yearArg = args.find(a => a.startsWith('--year='));
        if (yearArg) {
            const y = parseInt(yearArg.split('=')[1]);
            console.log(`📅 Modo: Año ${y} — SIN notificación push\n`);
            fechas = generarFechas(y, y);
            shouldNotify = false;
        } else {
            // Sin argumento → modo daily por defecto (igual que jurisprudencia)
            const hoy = new Date();
            const ayer = new Date();
            ayer.setDate(hoy.getDate() - 1);
            const fmt = (d) =>
                `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            fechas = [fmt(ayer), fmt(hoy)];
            console.log(`📅 Modo: Daily por defecto (${fechas.join(' y ')})\n`);
            shouldNotify = true;
        }
    }

    await scanFechas(fechas);

    // 🔔 Solo notificar si el modo lo permite Y hay gacetas verdaderamente nuevas
    if (shouldNotify && newGacetasCount > 0) {
        const title = newGacetasCount === 1 ? '📰 Nueva Gaceta Oficial' : '📰 Nuevas Gacetas Oficiales';
        const body = newGacetasCount === 1
            ? 'Se publicó 1 nueva Gaceta Oficial.'
            : `Se publicaron ${newGacetasCount} nuevas Gacetas Oficiales.`;
        await PushNotifier.notifyAll(title, body, { type: 'gacetas', url: 'tuley://gacetas' });
    } else if (shouldNotify && newGacetasCount === 0) {
        console.log('\n📭 Sin gacetas nuevas hoy. No se envía notificación.');
    }

    console.log(`\n🏁 Total gacetas nuevas guardadas: ${newGacetasCount}`);
}

main().catch(err => { console.error('\n❌ Error fatal:', err.message); process.exit(1); });
