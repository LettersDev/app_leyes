import json
import re
import os
from pathlib import Path

# Configuración: Directorio de datos
DATA_DIR = Path(__file__).parent.parent / "data"

def clean_text_content(text):
    """
    Aplica las mismas reglas de limpieza que batch_add_laws.py.
    """
    if not text: return ""

    # --- LIMPIEZA AGRESIVA DE ARTEFACTOS DE PDF ---
    
    # 1. Eliminar URLs largas (http/https)
    text = re.sub(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+[^\s]*', '', text)
    
    # 2. Eliminar Timestamps típicos de impresión (ej: "18/07/2014 2:35 PM")
    text = re.sub(r'\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM|am|pm)', '', text)
    
    # 3. Eliminar frases de generadores de PDF
    text = re.sub(r'Documento sin título', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Page \d+ of \d+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Página \d+ de \d+', '', text, flags=re.IGNORECASE)

    # 4. Eliminar pies de página recurrentes (Adaptar según se vean más patrones)
    text = re.sub(r'\d+\s+Normas de Orden Público', '', text, flags=re.IGNORECASE)
    
    # 5. Normalizar espacios (eliminar los espacios dobles que quedaron tras borrar URLs)
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Restaurar saltos de linea básicos si se perdieron por el strip masivo, 
    # aunque aquí asumimos que el texto ya venía formateado y solo queremos limpiar basura.
    # Si el texto original tenía saltos \n, el regex \s+ los convirtió en espacio.
    # Para ser seguros con datos existentes, mejor NO colapsar todo a una línea si ya estaba bien formateado.
    # Pero como el problema reportado es basura insertada, probablemente el formato ya esté sucio.
    
    # Re-aplicar reglas de formato para asegurar consistencia
    text = re.sub(r'(?<!\n)(\s+)(\d+[°º]\.?)', r'\n\n\2', text)
    text = re.sub(r'(?<!\n)(\s+)(\d+\.)(?=\s[A-ZÁÉÍÓÚ])', r'\n\n\2', text)
    
    numeral_words = [
        'Primero:', 'Segundo:', 'Tercero:', 'Cuarto:', 'Quinto:',
        'Parágrafo Primero', 'Parágrafo Segundo', 'Parágrafo Tercero', 'Parágrafo Único'
    ]
    for word in numeral_words:
        pattern = rf'(?<!\n)(\s+)({word})'
        text = re.sub(pattern, r'\n\n\2', text, flags=re.IGNORECASE)

    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()

def process_file(file_path):
    print(f"🔄 Procesando: {file_path.name}")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified_count = 0
        
        # Iterar sobre las leyes (usualmente es una lista de 1 objeto ley)
        for law in data:
            if 'content' in law and 'articles' in law['content']:
                for article in law['content']['articles']:
                    original_text = article.get('text', '')
                    if not original_text: continue
                    
                    cleaned_text = clean_text_content(original_text)
                    
                    if original_text != cleaned_text:
                        article['text'] = cleaned_text
                        modified_count += 1
        
        if modified_count > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"✅ Guardado. {modified_count} artículos limpiados.")
        else:
            print("✨ Sin cambios necesarios.")
            
    except Exception as e:
        print(f"❌ Error procesando {file_path.name}: {e}")

def main():
    if not DATA_DIR.exists():
        print(f"❌ No se encuentra el directorio data: {DATA_DIR}")
        return

    json_files = list(DATA_DIR.glob("*.json"))
    print(f"🔍 Encontrados {len(json_files)} archivos JSON de leyes.")
    
    for json_file in json_files:
        process_file(json_file)

    print("\n🏁 Limpieza completada.")

if __name__ == "__main__":
    main()
