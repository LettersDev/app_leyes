const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Script para convertir PDFs a JSON automáticamente
 * 
 * Uso:
 * 1. Coloca el PDF en la carpeta data/
 * 2. Corre: node scripts/convertPdfToJson.js nombre_del_archivo.pdf
 * 3. Se generará: data/nombre_del_archivo_full.json
 */

function convertPdfToJson(pdfFileName) {
    const dataDir = path.join(__dirname, '../data');
    const pdfPath = path.join(dataDir, pdfFileName);

    // Verificar que el PDF exista
    if (!fs.existsSync(pdfPath)) {
        console.error(`❌ Error: No se encontró el archivo ${pdfFileName} en data/`);
        console.log(`\n📁 Asegúrate de que el PDF esté en: ${dataDir}`);
        process.exit(1);
    }

    console.log(`\n📄 Procesando: ${pdfFileName}`);
    console.log('⏳ Esto puede tomar varios minutos...\n');

    // El script de Python para extracción
    const pythonScript = path.join(__dirname, 'add_new_law.py');

    if (!fs.existsSync(pythonScript)) {
        console.error(`❌ Error: No se encontró add_new_law.py`);
        console.log(`\nCrea primero el script de extracción en: ${pythonScript}`);
        process.exit(1);
    }

    // Ejecutar script de Python
    const command = `python "${pythonScript}" "${pdfPath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error ejecutando script:`, error.message);
            console.error(stderr);
            process.exit(1);
        }

        console.log(stdout);

        // Verificar que se creó el JSON
        const baseName = path.basename(pdfFileName, '.pdf');
        const jsonPath = path.join(dataDir, `${baseName}_full.json`);

        if (fs.existsSync(jsonPath)) {
            console.log(`\n✅ Conversión exitosa!`);
            console.log(`📁 Archivo creado: ${baseName}_full.json`);
            console.log(`\n🚀 Para subir a Firebase, corre:`);
            console.log(`   node scripts/seedDatabase.js`);
        } else {
            console.error(`\n⚠️  No se generó el archivo JSON esperado`);
        }
    });
}

// Obtener el nombre del archivo desde argumentos
const pdfFileName = process.argv[2];

if (!pdfFileName) {
    console.log('\n📖 Uso: node scripts/convertPdfToJson.js <nombre_archivo.pdf>');
    console.log('\nEjemplo:');
    console.log('  node scripts/convertPdfToJson.js codigo_trabajo.pdf\n');
    process.exit(1);
}

convertPdfToJson(pdfFileName);
