# TUTORIAL: GESTIÓN DE LEYES Y SCRIPTS

Este documento explica cómo usar las herramientas en la carpeta `scripts/` para procesar nuevas leyes, desde tener un PDF hasta subirlo a la App.

## 📋 Prerrequisitos

Necesitas tener **Python** instalado y las siguientes librerías:

```bash
pip install firebase-admin pdfplumber
```

---

## 1️⃣ PASO 1: Convertir PDF a JSON

Si tienes el archivo en PDF (ej. `ley_transito.pdf`), usa este script para extraer el texto automáticamente.

1.  Coloca tu archivo PDF en la carpeta `data/`.
2.  Ejecuta el script de conversión masiva (procesará todos los PDFs de la carpeta):

```bash
python scripts/batch_add_laws.py
```

**¿Qué hace este script?**
*   Lee todos los PDFs de `data/`.
*   Extrae artículos y encabezados.
*   Limpia el texto (arregla saltos de línea y guiones).
*   Genera un archivo JSON para cada ley (ej. `ley_transito_full.json`).

---

## 2️⃣ PASO 2: Verificar y Clasificar (¡IMPORTANTE!)

Antes de subir, abre el archivo JSON generado (en `data/`) y verifica:

1.  **Categorías**: Asegúrate de que `parent_category` sea correcto.
    *   `codigos` (Para códigos como Civil, Penal)
    *   `leyes_organicas` (Para leyes orgánicas)
    *   `leyes` (Para leyes ordinarias)
    *(Ver `GUIA_FORMATO_JSON.txt` para más detalles)*

2.  **Integridad**: Revisa rápidamente que el texto se vea bien y no falten artículos.

---

## 3️⃣ PASO 3: Subir a Firebase

Una vez que tengas tu JSON listo y verificado, súbelo a la base de datos.

### Opción A: Subida Inteligente (Recomendada)
Usa el script `seedDatabase.js`. Este script es más avanzado: **solo sube lo que ha cambiado**. Si ya subiste una ley y no la has modificado, la saltará para ahorrar tiempo y datos.

```bash
# Subir todo (solo lo nuevo/modificado)
node scripts/seedDatabase.js

# Subir un archivo específico
node scripts/seedDatabase.js tu_archivo_full.json
```

### Opción B: Forzar Subida (Python)
Si prefieres usar el script de Python (que sobrescribe todo siempre):

```bash
# Subir un archivo
python scripts/upload_laws.py --file data/tuley_full.json

# Subir todo (sobrescribe todo)
python scripts/upload_laws.py --all
```

---

## 💡 Resumen de Comandos

| Acción | Comando |
| :--- | :--- |
| **Convertir PDFs** | `python scripts/batch_add_laws.py` |
| **Subir (Inteligente)** | `node scripts/seedDatabase.js` |
| **Subir (Forzado)** | `python scripts/upload_laws.py --all` |
