# Guía de Subida Manual de Leyes a AppLeyes

Esta guía explica el proceso paso a paso para agregar una nueva ley al sistema de AppLeyes manualmente.

## 1. Preparación del archivo JSON

Cada ley debe estar en un archivo JSON siguiendo el formato estándar del proyecto. Asegúrate de que el archivo termine en `_full.json` (ejemplo: `mi_nueva_ley_full.json`).

### Estructura requerida:
```json
[
  {
    "id": "mi_nueva_ley",
    "title": "Ley de Ejemplo",
    "category": "leyes",
    "parent_category": "leyes",
    "type": "Ley Ordinaria",
    "date": "2024-01-24",
    "metadata": {
      "gacetaNumber": "6.XXX",
      "articlesCount": 10
    },
    "content": {
      "articles": [
        {
          "type": "header",
          "content": "TÍTULO I: DISPOSICIONES GENERALES"
        },
        {
          "type": "article",
          "number": "1",
          "title": "Objeto",
          "content": "El contenido del artículo va aquí..."
        }
      ]
    }
  }
]
```

> [!IMPORTANT]
> - **category**: Debe ser `leyes` para ordinarias o `leyes_organicas` para orgánicas.
> - **parent_category**: Úsalo para agrupar bajo una categoría principal si es necesario.

## 2. Guardar el archivo
Coloca tu archivo JSON en la carpeta: `c:\Users\Luis Rodriguez\Desktop\AppLeyes\data\`

## 3. Ejecutar el Script de Subida

Abre una terminal en la raíz del proyecto y ejecuta el siguiente comando para subir solo tu archivo:

```powershell
python scripts/upload_laws.py --file data/mi_nueva_ley_full.json
```

O si deseas subir todos los archivos nuevos en la carpeta `data`:

```powershell
python scripts/upload_laws.py --all
```

## 4. Requisitos Previos
- Tener instalado Python.
- Haber instalado las dependencias necesarias: `pip install firebase-admin google-cloud-firestore`.
- Tener el archivo `serviceAccountKey.json` en la carpeta `scripts/`.

## 5. Verificación
Una vez que el script termine (verás un mensaje de "✅ Finished"), abre la aplicación AppLeyes en tu dispositivo o emulador.
- Navega a la sección **Leyes y Normativas**.
- Selecciona la subcategoría correspondiente (**Leyes Ordinarias** o **Leyes Orgánicas**).
- Tu nueva ley debería aparecer en la lista.

---

> [!TIP]
> Si la ley es muy extensa, el script la subirá en lotes (batches) automáticamente para no sobrecargar Firestore.

## 6. Nota sobre Cambios en el Código (JSX)
**No es necesario realizar ningún cambio adicional en el código fuente (JSX) para agregar nuevas leyes.** 

El sistema ha sido actualizado con un "motor" inteligente que:
1. Detecta automáticamente si una ley pertenece a la categoría `leyes` o `leyes_organicas` basándose en los datos que subas.
2. Muestra las leyes en su sección correspondiente sin intervención manual.

Solo asegúrate de que el campo `category` y `parent_category` en tu JSON coincidan con lo indicado en el **Paso 1**.
