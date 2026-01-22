# Guía Paso a Paso: Cómo Agregar una Nueva Ley a AppLeyes

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:
- Python 3.x
- pdfplumber: `pip install pdfplumber`
- Node.js (para subir a Firebase)
- Acceso a Firebase (archivo serviceAccountKey.json)

---

## 🚀 Pasos para Agregar una Nueva Ley

### PASO 1: Preparar el PDF

1. **Coloca el PDF** en la carpeta `data/`
   - Ejemplo: `data/ley_organica_trabajo.pdf`

2. **Verifica el PDF**
   - Asegúrate de que el PDF tenga texto seleccionable (no sea una imagen)
   - Verifica que los artículos tengan el formato: "Artículo 1", "Artículo 2", etc.

---

### PASO 2: Configurar el Script

1. **Abre el archivo** `scripts/add_new_law.py`

2. **Edita la sección LAW_CONFIG** (líneas 25-40):

```python
LAW_CONFIG = {
    # Nombre del archivo PDF
    "pdf_filename": "ley_organica_trabajo.pdf",
    
    # Información de la ley
    "title": "Ley Orgánica del Trabajo",
    "category": "ley_organica_trabajo",
    "type": "ley_organica",
    "date": "2012-05-07",
    "description": "Regula las relaciones laborales en Venezuela",
    
    # Configuración de extracción
    "start_article": 1,
    "end_article": None,  # None = extraer todos
    "expected_articles": 500,  # Número total esperado
}
```

3. **Guarda el archivo**

---

### PASO 3: Ejecutar el Script de Extracción

1. **Abre la terminal** en la carpeta del proyecto

2. **Ejecuta el script**:
   ```bash
   python scripts/add_new_law.py
   ```

3. **Revisa la salida**:
   - El script mostrará el progreso de extracción
   - Verificará la calidad de los datos
   - Generará un archivo JSON en `data/`

4. **Confirma cuando se te pregunte**:
   ```
   ¿Continuar con la extracción? (s/n): s
   ```

---

### PASO 4: Verificar el Archivo Generado

1. **Abre el archivo JSON generado**:
   - Ubicación: `data/ley_organica_trabajo_full.json`

2. **Verifica que**:
   - Los artículos se extrajeron correctamente
   - El formato del texto es legible
   - No hay artículos duplicados o faltantes

3. **Si hay problemas**:
   - Ajusta `start_article` y `end_article` en LAW_CONFIG
   - Vuelve a ejecutar el script

---

### PASO 5: Actualizar el Script de Firebase

1. **Abre** `scripts/seedDatabase.js`

2. **Agrega tu archivo** a la lista de archivos (línea 103):

```javascript
const files = [
    path.join(__dirname, '../data/constitucion_full.json'),
    path.join(__dirname, '../data/codigo_civil_full.json'),
    // ... otros archivos ...
    path.join(__dirname, '../data/ley_organica_trabajo_full.json'), // ← AGREGAR AQUÍ
];
```

3. **Guarda el archivo**

---

### PASO 6: Subir a Firebase

1. **Ejecuta el script de subida**:
   ```bash
   node scripts/seedDatabase.js
   ```

2. **Espera a que termine**:
   - El script mostrará el progreso
   - Puede tardar varios minutos dependiendo del tamaño

3. **Verifica la salida**:
   ```
   ✅ Ley Orgánica del Trabajo completado.
   ```

---

### PASO 7: Actualizar la Aplicación

#### 7.1 Actualizar Constantes

1. **Abre** `src/utils/constants.js`

2. **Agrega la nueva categoría**:

```javascript
export const LAW_CATEGORIES = {
    // ... categorías existentes ...
    LEY_ORGANICA_TRABAJO: 'ley_organica_trabajo', // ← AGREGAR
};

export const CATEGORY_NAMES = {
    // ... nombres existentes ...
    [LAW_CATEGORIES.LEY_ORGANICA_TRABAJO]: 'Ley Orgánica del Trabajo', // ← AGREGAR
};
```

#### 7.2 Actualizar la Pantalla Principal (Opcional)

Si quieres que aparezca en la pantalla principal:

1. **Abre** `src/screens/HomeScreen.jsx`

2. **Agrega la categoría** al array de categorías:

```javascript
{
    id: LAW_CATEGORIES.LEY_ORGANICA_TRABAJO,
    name: CATEGORY_NAMES[LAW_CATEGORIES.LEY_ORGANICA_TRABAJO],
    icon: 'briefcase-account',
    description: 'Regula las relaciones laborales',
    color: '#8B5CF6',
    navigateTo: 'LawsList',
}
```

#### 7.3 O Agregar a la Lista de Códigos

Si es un código, agrégalo a `src/screens/CodesListScreen.jsx`:

```javascript
{
    id: LAW_CATEGORIES.LEY_ORGANICA_TRABAJO,
    name: CATEGORY_NAMES[LAW_CATEGORIES.LEY_ORGANICA_TRABAJO],
    icon: 'briefcase-account',
    description: 'Regula las relaciones laborales',
    color: '#8B5CF6',
    articles: '500 artículos',
}
```

---

### PASO 8: Probar la Aplicación

1. **Reinicia la app** (si está corriendo):
   - Detén el servidor: `Ctrl + C`
   - Inicia de nuevo: `npx expo start --tunnel`

2. **Prueba en la app**:
   - Navega a la nueva categoría
   - Verifica que los artículos se muestren correctamente
   - Prueba la búsqueda

---

## 🎯 Resumen Rápido

```bash
# 1. Colocar PDF en data/
# 2. Editar scripts/add_new_law.py (LAW_CONFIG)
# 3. Ejecutar extracción
python scripts/add_new_law.py

# 4. Actualizar seedDatabase.js
# 5. Subir a Firebase
node scripts/seedDatabase.js

# 6. Actualizar constantes en src/utils/constants.js
# 7. Actualizar pantallas (HomeScreen.jsx o CodesListScreen.jsx)
# 8. Reiniciar app y probar
```

---

## ⚠️ Solución de Problemas

### Error: "pdfplumber no está instalado"
```bash
pip install pdfplumber
```

### Error: "No se encontró el archivo PDF"
- Verifica que el PDF esté en la carpeta `data/`
- Verifica que el nombre en LAW_CONFIG coincida exactamente

### Error: "No se encontraron artículos"
- Verifica que el PDF tenga texto seleccionable
- Abre el PDF y verifica el formato de los artículos
- Puede que necesites ajustar el patrón regex en el script

### Artículos faltantes o duplicados
- Revisa el análisis que muestra el script
- Ajusta `start_article` y `end_article` si es necesario
- Algunos artículos pueden estar derogados (es normal)

### Error al subir a Firebase
- Verifica que `serviceAccountKey.json` esté en `scripts/`
- Verifica tu conexión a internet
- Verifica que el nombre de categoría no tenga caracteres especiales

---

## 📝 Notas Importantes

1. **Nombres de categoría**: Usa solo letras minúsculas, números y guiones bajos
   - ✅ Correcto: `ley_organica_trabajo`
   - ❌ Incorrecto: `Ley Orgánica del Trabajo`

2. **Fechas**: Usa formato ISO (YYYY-MM-DD)
   - ✅ Correcto: `2012-05-07`
   - ❌ Incorrecto: `07/05/2012`

3. **Tipos de documento**: Usa uno de estos valores:
   - `ley_base`
   - `ley_organica`
   - `decreto`
   - `resolucion`

4. **Backup**: Siempre haz backup de Firebase antes de subir datos nuevos

---

## 🆘 ¿Necesitas Ayuda?

Si encuentras problemas:
1. Revisa los mensajes de error del script
2. Verifica que seguiste todos los pasos
3. Consulta la documentación de Firebase
4. Revisa los archivos JSON generados manualmente
