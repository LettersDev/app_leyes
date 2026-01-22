#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Automatizado para Agregar Nuevas Leyes
==============================================
Este script extrae, formatea y prepara una nueva ley desde un PDF
para ser subida a Firebase.

Uso:
    python scripts/add_new_law.py

Luego sigue las instrucciones en pantalla.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    print("❌ ERROR: pdfplumber no está instalado.")
    print("   Ejecuta: pip install pdfplumber")
    sys.exit(1)


# ============================================================================
# CONFIGURACIÓN - EDITA AQUÍ PARA AGREGAR UNA NUEVA LEY
# ============================================================================

LAW_CONFIG = {
    # Nombre del archivo PDF (debe estar en la carpeta data/)
    "pdf_filename": "nueva_ley.pdf",
    
    # Información de la ley
    "title": "Nombre Completo de la Ley",
    "category": "categoria_ley",  # Ejemplo: ley_organica_trabajo, ley_tierras, etc.
    "type": "ley_organica",  # Opciones: ley_base, ley_organica, decreto, resolucion
    "date": "2024-01-01",  # Fecha de publicación (YYYY-MM-DD)
    "description": "Descripción breve de la ley",
    
    # Configuración de extracción
    "start_article": 1,  # Primer artículo a extraer
    "end_article": None,  # Último artículo (None = hasta el final)
    "expected_articles": None,  # Número esperado de artículos (None = desconocido)
}

# ============================================================================
# FUNCIONES DE EXTRACCIÓN
# ============================================================================

def extract_articles_from_pdf(pdf_path, start_article=1, end_article=None):
    """
    Extrae artículos de un PDF
    """
    print(f"\n📄 Abriendo PDF: {pdf_path.name}")
    
    articles = []
    article_pattern = re.compile(
        r'^\s*Art[ií]culo\s+(\d+(?:[\.\s]\d+)*)[\.\:\-]?\s*',
        re.MULTILINE | re.IGNORECASE
    )
    
    full_text = ""
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"   Total de páginas: {len(pdf.pages)}")
        
        for page_num, page in enumerate(pdf.pages, 1):
            if page_num % 10 == 0:
                print(f"   Procesando página {page_num}...")
            text = page.extract_text()
            if text:
                full_text += text + "\n"
    
    print(f"✓ Texto extraído: {len(full_text)} caracteres")
    
    # Encontrar todos los artículos
    matches = list(article_pattern.finditer(full_text))
    print(f"✓ Artículos encontrados: {len(matches)}")
    
    for i, match in enumerate(matches):
        article_num_str = match.group(1).strip()
        article_num = int(article_num_str.split('.')[0])
        
        # Filtrar por rango
        if article_num < start_article:
            continue
        if end_article and article_num > end_article:
            break
        
        # Extraer texto del artículo
        start_pos = match.end()
        end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        article_text = full_text[start_pos:end_pos].strip()
        
        # Limpiar texto
        article_text = re.sub(r'\s+', ' ', article_text)
        article_text = re.sub(r'\s*\n\s*', ' ', article_text)
        
        articles.append({
            "type": "article",
            "number": article_num,
            "title": f"Artículo {article_num}",
            "text": article_text
        })
    
    return articles


def format_article_text(text):
    """
    Formatea el texto de un artículo para mejor legibilidad
    """
    # 1. Normalizar espacios y saltos de línea existentes
    text = re.sub(r'\s+', ' ', text).strip()
    
    # 2. Saltos de línea antes de numerales ordinales (1°, 2°, 1º, 2º)
    text = re.sub(r'(?<!\n)(\s+)(\d+[°º]\.?)', r'\n\n\2', text)
    
    # 3. Saltos de línea antes de numerales simples (1., 2., 3.) 
    # Solo si están seguidos de un espacio y precedidos de un espacio (evita fechas o referencias)
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
        pattern = rf'(?<!\n)(\s+)({word})'
        text = re.sub(pattern, r'\n\n\2', text, flags=re.IGNORECASE)
    
    # 5. Limpiar múltiples espacios y saltos de línea
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()


def analyze_extraction(articles, expected_total=None):
    """
    Analiza la calidad de la extracción
    """
    print("\n" + "="*70)
    print("ANÁLISIS DE EXTRACCIÓN")
    print("="*70)
    
    article_nums = [art['number'] for art in articles]
    
    print(f"Total de artículos extraídos: {len(articles)}")
    print(f"Rango: Artículo {min(article_nums)} - {max(article_nums)}")
    
    # Verificar artículos faltantes
    if expected_total:
        expected = set(range(1, expected_total + 1))
        found = set(article_nums)
        missing = sorted(expected - found)
        
        if missing:
            print(f"\n⚠️ Artículos faltantes: {len(missing)}")
            if len(missing) <= 20:
                print(f"   {missing}")
        else:
            print("\n✅ Extracción completa - No hay artículos faltantes")
    
    # Verificar duplicados
    duplicates = [num for num in article_nums if article_nums.count(num) > 1]
    if duplicates:
        print(f"\n⚠️ Artículos duplicados: {set(duplicates)}")
    else:
        print("✅ No hay artículos duplicados")
    
    print("="*70)


def create_structured_json(articles, law_config):
    """
    Crea el JSON estructurado final
    """
    # Formatear artículos
    formatted_articles = []
    for article in articles:
        formatted_article = article.copy()
        formatted_article['text'] = format_article_text(article['text'])
        formatted_articles.append(formatted_article)
    
    # Crear estructura
    structured = [{
        "title": law_config["title"],
        "category": law_config["category"],
        "type": law_config["type"],
        "date": law_config["date"],
        "description": law_config["description"],
        "content": {
            "articles": formatted_articles
        }
    }]
    
    return structured


# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """
    Función principal del script
    """
    print("="*70)
    print("SCRIPT AUTOMATIZADO PARA AGREGAR NUEVAS LEYES")
    print("="*70)
    
    # Directorios
    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / "data"
    pdf_path = data_dir / LAW_CONFIG["pdf_filename"]
    
    # Verificar que existe el PDF
    if not pdf_path.exists():
        print(f"\n❌ ERROR: No se encontró el archivo PDF")
        print(f"   Buscado en: {pdf_path}")
        print(f"\n📝 Instrucciones:")
        print(f"   1. Coloca tu PDF en la carpeta: {data_dir}")
        print(f"   2. Edita LAW_CONFIG en este script con el nombre correcto")
        sys.exit(1)
    
    print(f"\n✓ PDF encontrado: {pdf_path.name}")
    print(f"\nConfiguración:")
    print(f"  Título: {LAW_CONFIG['title']}")
    print(f"  Categoría: {LAW_CONFIG['category']}")
    print(f"  Tipo: {LAW_CONFIG['type']}")
    print(f"  Fecha: {LAW_CONFIG['date']}")
    
    # Confirmar
    print("\n" + "="*70)
    response = input("¿Continuar con la extracción? (s/n): ")
    if response.lower() != 's':
        print("Operación cancelada.")
        sys.exit(0)
    
    # PASO 1: Extraer artículos
    print("\n" + "="*70)
    print("PASO 1: EXTRACCIÓN DE ARTÍCULOS")
    print("="*70)
    
    articles = extract_articles_from_pdf(
        pdf_path,
        start_article=LAW_CONFIG["start_article"],
        end_article=LAW_CONFIG["end_article"]
    )
    
    if not articles:
        print("\n❌ ERROR: No se encontraron artículos en el PDF")
        sys.exit(1)
    
    # PASO 2: Analizar extracción
    print("\n" + "="*70)
    print("PASO 2: ANÁLISIS DE CALIDAD")
    print("="*70)
    
    analyze_extraction(articles, LAW_CONFIG["expected_articles"])
    
    # PASO 3: Crear JSON estructurado
    print("\n" + "="*70)
    print("PASO 3: CREACIÓN DE JSON ESTRUCTURADO")
    print("="*70)
    
    structured_data = create_structured_json(articles, LAW_CONFIG)
    
    # Guardar archivo
    output_filename = f"{LAW_CONFIG['category']}_full.json"
    output_path = data_dir / output_filename
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(structured_data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ JSON guardado en: {output_path}")
    print(f"  Tamaño: {output_path.stat().st_size / 1024:.1f} KB")
    
    # PASO 4: Instrucciones finales
    print("\n" + "="*70)
    print("✅ EXTRACCIÓN COMPLETADA")
    print("="*70)
    print(f"\nArchivo generado: {output_filename}")
    print(f"Total de artículos: {len(articles)}")
    print("\n📝 PRÓXIMOS PASOS:")
    print(f"   1. Revisa el archivo: {output_path}")
    print(f"   2. Edita scripts/seedDatabase.js y agrega:")
    print(f"      path.join(__dirname, '../data/{output_filename}'),")
    print(f"   3. Ejecuta: node scripts/seedDatabase.js")
    print(f"   4. Actualiza la app para incluir la nueva categoría")
    print("="*70)


if __name__ == "__main__":
    main()
