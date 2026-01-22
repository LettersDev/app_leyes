# 📖 Guía de Gestión de Leyes (Producción)

Esta carpeta contiene las herramientas definitivas para gestionar tu base de datos de leyes en el nuevo proyecto de Firebase (`appley-3f0fb`).

---

## 🚀 Flujo de Trabajo para Nuevas Leyes

Sigue este orden para añadir leyes sin errores:

### 1. **Preparar el PDF**
Copia el archivo PDF de la ley dentro de la carpeta `data/`.

### 2. **Convertir PDF a JSON**
Ejecuta el script de conversión (usa el motor de Python `add_new_law.py` internamente):
```bash
node scripts/convertPdfToJson.js nombre_del_archivo.pdf
```
*Esto generará un archivo `*_full.json` en la carpeta `data/`.*

### 3. **Limpiar Formato (Opcional pero Recomendado)**
Si quieres que los artículos tengan saltos de línea perfectos y párrafos limpios:
```bash
python scripts/fix_formatting.py
```
*Este comando limpiará automáticamente todos los archivos JSON de la carpeta `data/`.*

### 4. **Subir a Firebase**
Usa el script de carga inteligente (Subida vía Web para evitar bloqueos de red):
```bash
node scripts/seedDatabase.js
```

---

## 🛠️ Descripción de Scripts Conservados

| Archivo | Función |
| :--- | :--- |
| **`seedDatabase.js`** | Sube las leyes a Firestore. **Solo sube lo nuevo o modificado** (usa hashes). |
| **`convertPdfToJson.js`** | Bridge de Node.js que llama a Python para extraer texto de PDFs. |
| **`add_new_law.py`** | El motor de extracción (Python). Necesita `pdfplumber` (`pip install pdfplumber`). |
| **`fix_formatting.py`** | Ajusta el texto para que se vea bien en la App (párrafos, numerales). |

---

## ⚙️ Configuración Actual
- **Proyecto:** `appley-3f0fb`
- **Método de carga:** SDK Web (REST/WebSockets) para máxima compatibilidad.
- **Formato:** Colección `laws` con subcolección `items` e índices automáticos.
