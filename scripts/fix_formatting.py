import json
import re
from pathlib import Path

def clean_and_format_text(text):
    """
    Mejora el formato del texto de los artículos con reglas más robustas.
    """
    # 1. Normalizar espacios y saltos de línea existentes
    text = re.sub(r'\s+', ' ', text).strip()
    
    # 2. Saltos de línea antes de numerales ordinales (1°, 2°, 1º, 2º)
    text = re.sub(r'(?<!\n)(\s+)(\d+[°º]\.?)', r'\n\n\2', text)
    
    # 3. NUEVO: Saltos de línea antes de numerales simples (1., 2., 3.) 
    # Solo si están seguidos de un espacio y precedidos de un espacio (evita fechas o referencias)
    # Ejemplo: "materias: 1. Crear" -> "materias:\n\n1. Crear"
    text = re.sub(r'(?<!\n)(\s+)(\d+\.)(?=\s[A-ZÁÉÍÓÚa-záéíóú])', r'\n\n\2', text)
    
    # 4. Saltos de línea antes de palabras clave de estructura
    numeral_words = [
        'Primero:', 'Segundo:', 'Tercero:', 'Cuarto:', 'Quinto:',
        'Sexto:', 'Séptimo:', 'Octavo:', 'Noveno:', 'Décimo:',
        'Primero\.', 'Segundo\.', 'Tercero\.', 'Cuarto\.', 'Quinto\.',
        'Sexto\.', 'Séptimo\.', 'Octavo\.', 'Noveno\.', 'Décimo\.',
        'Parágrafo Primero', 'Parágrafo Segundo', 'Parágrafo Tercero',
        'Parágrafo Único', 'Parágrafo:'
    ]
    
    for word in numeral_words:
        # Usamos regex para asegurar que sea la palabra completa y no parte de otra
        pattern = rf'(?<!\n)(\s+)({word})'
        text = re.sub(pattern, r'\n\n\2', text, flags=re.IGNORECASE)
    
    # 5. Limpiar múltiples espacios y saltos de línea
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()

def process_file(file_path):
    print(f"Procesando: {file_path.name}")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified_count = 0
    
    # La estructura es un array con un objeto que tiene content.articles
    if isinstance(data, list) and len(data) > 0:
        articles = data[0].get('content', {}).get('articles', [])
        for article in articles:
            if 'text' in article:
                original = article['text']
                formatted = clean_and_format_text(original)
                if original != formatted:
                    article['text'] = formatted
                    modified_count += 1
    
    if modified_count > 0:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"   ✅ {modified_count} artículos actualizados.")
    else:
        print("   ⚪ Sin cambios necesarios.")

def main():
    data_dir = Path('data')
    json_files = list(data_dir.glob('*_full.json'))
    
    print(f"Encontrados {len(json_files)} archivos JSON.")
    for json_file in json_files:
        process_file(json_file)
    
    print("\n✨ Formateo completado.")

if __name__ == "__main__":
    main()
