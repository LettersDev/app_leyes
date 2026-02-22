require('dotenv').config();
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchWithRetry(url, options = {}, retries = 2, backoff = 3000) {
    try {
        if (!options.headers) options.headers = {};
        options.headers['Accept-Encoding'] = 'identity';
        const response = await axios.get(url, { ...options, responseType: 'arraybuffer' });

        const decoder = new TextDecoder('windows-1252');
        response.data = decoder.decode(response.data);

        return response;
    } catch (err) {
        if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.response?.status >= 500)) {
            console.log(`      ⚠️ Error de red. Reintentando... (${retries} restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
}

async function scrapeExtraordinariasStandalone(startNum = 6750, endNum = 7200) {
    console.log(`\n🚀 INICIANDO SCRAPER DEDICADO DE EXTRAORDINARIAS (RANGO: ${startNum} - ${endNum})`);
    console.log(`----------------------------------------------------------------------`);

    for (let num = startNum; num <= endNum; num++) {
        const displayNum = num.toString().replace(/(\d)(\d{3})$/, '$1.$2');
        const id = `gaceta-E${num}`;

        // Forzamos actualización para corregir metadatos (años, codificación, etc)
        // No saltamos ningún registro en este modo de reparación

        // Configuramos los intentos: carpetas y formatos de número
        const attempts = [
            { folder: 'gaceta', display: displayNum },      // Ej: 6.809 en ordinaria
            { folder: 'gaceta', display: num.toString() },  // Ej: 6809 en ordinaria (sin punto)
            { folder: 'gaceta_ext', display: displayNum },  // Ej: 6.809 en extraordinaria
            { folder: 'gaceta_ext', display: num.toString() } // Ej: 6809 en extraordinaria
        ];

        let foundInRange = false;

        for (const attempt of attempts) {
            const url = `http://historico.tsj.gob.ve/${attempt.folder}/blanco.asp?nrogaceta=${attempt.display}`;

            try {
                const res = await fetchWithRetry(url, {
                    httpsAgent: agent,
                    timeout: 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                }, 1, 2000);

                // Si detectamos el error de "Caracter no Válido", pasamos al siguiente intento
                if (res.data.includes('Caracter no V') || res.data.includes('Error')) {
                    continue;
                }

                const $ = cheerio.load(res.data);

                // --- LÓGICA DE EXTRACCIÓN MEJORADA ---
                let sumario = $('p.sumario').text().trim();
                let fechaTexto = $('p.fecha').text().trim();

                // Si el sumario es "SUMARIO" o está vacío, recolectamos todos los <p>
                if (!sumario || sumario.toLowerCase() === 'sumario') {
                    const allText = [];
                    $('body p').each((i, el) => {
                        const txt = $(el).text().trim();
                        // Ignoramos la palabra "SUMARIO" y el número de gaceta
                        if (txt && txt.toLowerCase() !== 'sumario' && !txt.includes(`N°:${num}`)) {
                            allText.push(txt);
                        }
                    });
                    sumario = allText.join('\n').substring(0, 3000);
                }

                if (sumario && sumario.length > 10) {
                    const cleanSumario = sumario.replace(/\s+/g, ' ');

                    // Lógica de detección de año refinada
                    let year = 2024; // Default más seguro para este rango

                    // 1. Buscar en el texto (sumario y fechaTexto)
                    const textYearMatch = (fechaTexto + sumario).match(/202[4-6]/);
                    if (textYearMatch) {
                        year = parseInt(textYearMatch[0]);
                    } else {
                        // 2. Buscar en los enlaces PDF (ej: "/julio/1272024/...")
                        $('a[href*="202"]').each((i, el) => {
                            const href = $(el).attr('href');
                            const hrefMatch = href.match(/202[4-6]/);
                            if (hrefMatch) {
                                year = parseInt(hrefMatch[0]);
                                return false; // break
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
                        subtitulo: `Gaceta Extraordinaria N° ${displayNum}`,
                        sumario: cleanSumario,
                        tipo: 'Extraordinaria',
                        timestamp: new Date(year, 0, 1).toISOString()
                    };

                    const { error } = await supabase.from('gacetas').upsert(row);
                    if (!error) {
                        console.log(`\n✨ ¡ENCONTRADA! Gaceta ${displayNum} (${year}) en [${attempt.folder}]`);
                        foundInRange = true;
                        break;
                    }
                }
            } catch (e) {
                // Siguiente intento...
            }
        }

        if (!foundInRange) {
            process.stdout.write('.'); // . = No encontrada en ninguna carpeta
        }

        // Delay para no saturar al TSJ
        if (num % 5 === 0) await new Promise(r => setTimeout(r, 800));
    }

    console.log(`\n\n✅ PROCESO FINALIZADO.`);
}

// CLI Arguments
const args = process.argv.slice(2);
const startArg = args.find(arg => arg.startsWith('--start='));
const endArg = args.find(arg => arg.startsWith('--end='));

const startNum = startArg ? parseInt(startArg.split('=')[1]) : 6750;
const endNum = endArg ? parseInt(endArg.split('=')[1]) : 7200;

scrapeExtraordinariasStandalone(startNum, endNum);
