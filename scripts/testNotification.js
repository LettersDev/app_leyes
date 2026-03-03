const PushNotifier = require('./pushNotifier');

async function sendTest(customTitle, customBody) {
    console.log('🚀 Iniciando envío de notificación de prueba...');

    const title = customTitle || '🔔 Prueba de Icono';
    const body = customBody || 'Esta es una notificación de prueba para verificar el nuevo icono.';

    const data = {
        type: 'test',
        url: 'tuley://home'
    };

    try {
        // El script usa el canal 'tuley-default' definido en pushNotifier.js
        await PushNotifier.notifyAll(title, body, data);
        console.log(`\n✨ Proceso de prueba completado.`);
    } catch (error) {
        console.error('\n❌ Error en el script de prueba:', error.message);
    }
}

// Para probar con diferentes parámetros si se desea
const args = process.argv.slice(2);
sendTest(args[0], args[1]);
