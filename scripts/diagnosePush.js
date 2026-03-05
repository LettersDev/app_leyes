/**
 * Script de diagnóstico de notificaciones push.
 * Muestra el estado real de cada token y los errores de entrega de Expo.
 * Usar: node scripts/diagnosePush.js
 */
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
    console.log('\n🔍 === DIAGNÓSTICO DE PUSH NOTIFICATIONS ===\n');

    // 1. Ver todos los tokens en Supabase
    console.log('📋 Paso 1: Leyendo tokens de Supabase...');
    const { data: tokensData, error } = await supabase.from('push_tokens').select('*');

    if (error) {
        console.error('❌ Error leyendo Supabase:', error.message);
        return;
    }

    if (!tokensData || tokensData.length === 0) {
        console.log('⚠️  La tabla push_tokens está VACÍA. Nadie tiene token registrado.');
        return;
    }

    console.log(`✅ Total tokens en Supabase: ${tokensData.length}`);
    tokensData.forEach((t, i) => {
        const fecha = t.created_at ? new Date(t.created_at).toLocaleString('es-VE') : 'sin fecha';
        console.log(`   ${i + 1}. [${t.platform}] ${t.token} — registrado: ${fecha}`);
    });

    // 2. Enviar notificación de prueba y verificar cada ticket
    console.log('\n📤 Paso 2: Enviando prueba a Expo y verificando entrega...');
    const messages = tokensData.map(t => ({
        to: t.token,
        sound: 'default',
        title: '🔍 Diagnóstico',
        body: 'Test de diagnóstico — si ves esto, las notificaciones funcionan.',
        channelId: 'tuley-default',
    }));

    let response;
    try {
        response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
    } catch (e) {
        console.error('❌ Error llamando a Expo API:', e.response?.data || e.message);
        return;
    }

    const receipts = Array.isArray(response.data?.data) ? response.data.data : [response.data?.data];

    console.log('\n📊 Resultado por token:');
    receipts.forEach((receipt, i) => {
        const token = tokensData[i]?.token || 'desconocido';
        const short = token.substring(0, 50) + '...';
        if (receipt?.status === 'ok') {
            console.log(`   ✅ Token ${i + 1}: OK — id=${receipt.id}`);
        } else {
            console.log(`   ❌ Token ${i + 1}: ERROR`);
            console.log(`      Token: ${short}`);
            console.log(`      Mensaje: ${receipt?.message}`);
            console.log(`      Detalle: ${JSON.stringify(receipt?.details)}`);
        }
    });

    // 3. Verificar tickets de entrega (si hay IDs)
    const ticketIds = receipts.filter(r => r?.status === 'ok' && r?.id).map(r => r.id);
    if (ticketIds.length > 0) {
        console.log('\n⏳ Paso 3: Verificando receipts de entrega (esperar 3s)...');
        await new Promise(r => setTimeout(r, 3000));

        try {
            const receiptResponse = await axios.post('https://exp.host/--/api/v2/push/getReceipts', {
                ids: ticketIds
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const deliveryReceipts = receiptResponse.data?.data || {};
            console.log('\n📬 Estado de entrega final:');
            Object.entries(deliveryReceipts).forEach(([id, receipt]) => {
                if (receipt.status === 'ok') {
                    console.log(`   ✅ ${id}: Entregado correctamente`);
                } else {
                    console.log(`   ❌ ${id}: FALLO en entrega`);
                    console.log(`      Error: ${receipt.message}`);
                    console.log(`      Detalle: ${JSON.stringify(receipt.details)}`);
                }
            });
        } catch (e) {
            console.log('   ⚠️  No se pudieron verificar receipts:', e.message);
        }
    }

    console.log('\n✨ Diagnóstico completado.\n');
}

diagnose().catch(console.error);
