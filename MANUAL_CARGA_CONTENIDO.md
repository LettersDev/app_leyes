# Manual de Mantenimiento y Carga de Contenido - AppLeyes

Este documento explica cómo agregar nuevo contenido a las diferentes secciones de la aplicación.

---

## 1. Agregar una LEY (Ordinaria u Orgánica)
**¿Requiere cambiar el código (JSX)?** NO.
El sistema las detecta automáticamente desde la base de datos.

### Pasos:
1. **Crear JSON**: Crea un archivo `nombre_de_la_ley_full.json` en la carpeta `data/`.
   - Si es **Ordinaria**: `parent_category: "leyes"`
   - Si es **Orgánica**: `parent_category: "leyes_organicas"`
2. **Subir a Firebase**:
   ```powershell
   python scripts/upload_laws.py --file data/nombre_de_la_ley_full.json
   ```
3. **Verificar**: Abre el app y entra en "Leyes y Normativas".

---

## 2. Agregar un CÓDIGO (Ej. Código de Tránsito)
**¿Requiere cambiar el código (JSX)?** SÍ.
Los códigos aparecen como tarjetas fijas con iconos y colores específicos.

### Pasos:
1. **Definir Constante**: En `src/utils/constants.js`, agrega el ID y el nombre:
   ```javascript
   // 1. En LAW_CATEGORIES:
   CODIGO_TRANSITO: 'codigo_transito',
   
   // 2. En CATEGORY_NAMES:
   [LAW_CATEGORIES.CODIGO_TRANSITO]: 'Código de Tránsito',
   ```
2. **Preparar y Subir JSON**: Crea `codigo_transito_full.json` con `category: "codigo_transito"` y súbelo:
   ```powershell
   python scripts/upload_laws.py --file data/codigo_transito_full.json
   ```
3. **Modificar Componente JSX**: Abre `src/screens/CodesListScreen.jsx` y agrega el nuevo código al array `codes`:
   ```javascript
   {
       id: LAW_CATEGORIES.CODIGO_TRANSITO,
       name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_TRANSITO],
       icon: 'car', // Icono de Material Community Icons
       description: 'Regula el tránsito y transporte terrestre',
       color: '#3B82F6', // Color de la tarjeta
       articles: 'XXX artículos',
   },
   ```

---

## 3. Agregar una SENTENCIA (Jurisprudencia)
**¿Requiere cambiar el código (JSX)?** NO.

### Pasos:
1. Las sentencias se manejan generalmente mediante el scraper automático (`scripts/download_tsj.py` o similar).
2. Si tienes un JSON manual de sentencias, se suben a la colección `jurisprudence` en Firebase.
3. El componente `JurisprudenceScreen.jsx` las cargará automáticamente por fecha.

---

## Resumen de Comandos Útiles

| Acción | Comando |
| :--- | :--- |
| **Subir 1 solo archivo** | `python scripts/upload_laws.py --file data/archivo_full.json` |
| **Subir TODO lo nuevo** | `python scripts/upload_laws.py --all` |
| **Limpiar cache Expo** | `npx expo start --clear` |

---

## Consejos Pro:
- **Iconos**: Puedes buscar nombres de iconos en [Material Design Icons](https://pictogrammers.com/library/mdi/).
- **Colores**: Usa códigos hexadecimales (Ej: `#DC2626` para rojo, `#059669` para verde).
- **ID de Categoría**: Siempre usa minúsculas y guiones bajos (Ej: `codigo_civil`, no `Codigo Civil`).
