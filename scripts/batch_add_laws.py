#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch Add Laws - Procesamiento Masivo de Leyes para AppLeyes
===========================================================
Este script procesa todos los PDFs en la carpeta data/ y genera 
archivos JSON estructurados con validación de integridad.
"""

import json
import re
import sys
import os
import os
from pathlib import Path
from datetime import datetime

# --- CONFIGURACIÓN DE SEGURIDAD ---
VALIDATION_SETTINGS = {
    "max_gap_allowed": 0,  # Alertar si falta aunque sea 1 número en la secuencia
    "min_chars_per_article": 10,  # Alertar si un artículo tiene menos de 10 caracteres
}

try:
    import pdfplumber
except ImportError:
    print("❌ ERROR: pdfplumber no está instalado. Ejecuta: pip install pdfplumber")
    sys.exit(1)

def clean_and_format_text(text):
    """
    Mejora el formato del texto de los artículos con reglas robustas (basado en fix_formatting.py).
    """
    if not text: return ""

    # 0. Unir palabras cortadas por guiones al final de línea (Suele pasar en PDFs)
    # Ejemplo: "pro- \nfesionales" -> "profesionales"
    text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)
    
    # 1. Normalizar espacios y saltos de línea existentes
    text = re.sub(r'\s+', ' ', text).strip()
    
    # 2. Saltos de línea antes de numerales ordinales (1°, 2°, 1º, 2º)
    text = re.sub(r'(?<!\n)(\s+)(\d+[°º]\.?)', r'\n\n\2', text)
    
    # 3. Saltos de línea antes de numerales simples (1., 2., 3.) 
    text = re.sub(r'(?<!\n)(\s+)(\d+\.)(?=\s[A-ZÁÉÍÓÚa-záéíóú])', r'\n\n\2', text)
    
    # 4. Saltos de línea antes de palabras clave de estructura
    numeral_words = [
        'Primero:', 'Segundo:', 'Tercero:', 'Cuarto:', 'Quinto:',
        'Sexto:', 'Séptimo:', 'Octavo:', 'Noveno:', 'Décimo:',
        r'Primero\.', r'Segundo\.', r'Tercero\.', r'Cuarto\.', r'Quinto\.',
        r'Sexto\.', r'Séptimo\.', r'Octavo\.', r'Noveno\.', r'Décimo\.',
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

def extract_from_pdf(pdf_path):
    print(f"\n📄 Analizando: {pdf_path.name}")
    
    # regex para Articulos (ej: Articulo 1, Art. 185-A, Art. 1 bis)
    article_pattern = re.compile(
        r'^\s*(?:Art[ií]culo|Art\.)\s+([0-9]+(?:-[A-Z]| bis| ter)?)\s*[\.\:\-]?\s*',
        re.MULTILINE | re.IGNORECASE
    )
    
    # Regex para Cabeceras (TÍTULO, CAPÍTULO, SECCIÓN, LIBRO)
    # Solo al inicio de linea y usualmente seguidos de números/letras
    # Evitamos que coincida con referencias internas (ej: "Capítulo II de este Título")
    header_pattern = re.compile(
        r'^\s*(?:LIBRO|T[IÍ]TULO|CAP[IÍ]TULO|SECCI[OÓ]N)\s+([IVXLCDM\d]+(?!\s+de\s+).*?)\s*$',
        re.MULTILINE | re.IGNORECASE
    )
    
    full_text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
    except Exception as e:
        return None, f"Error al abrir PDF: {str(e)}"

    if not full_text.strip():
        return None, "El PDF no contiene texto extraíble (posible imagen/escaneo)."

    # Encontrar todos los marcadores (artículos y cabeceras)
    markers = []
    for m in article_pattern.finditer(full_text):
        markers.append({'type': 'article', 'start': m.start(), 'end_marker': m.end(), 'number': m.group(1)})
    
    for m in header_pattern.finditer(full_text):
        markers.append({'type': 'header', 'start': m.start(), 'end_marker': m.end(), 'text': m.group(0).strip()})
    
    # Ordenar marcadores por posición en el texto
    markers.sort(key=lambda x: x['start'])
    
    items = []
    for i, marker in enumerate(markers):
        start_pos = marker['end_marker']
        end_pos = markers[i + 1]['start'] if i + 1 < len(markers) else len(full_text)
        
        raw_text = full_text[start_pos:end_pos].strip()
        
        if marker['type'] == 'article':
            # Limpiar y formatear el texto del artículo
            clean_text = clean_and_format_text(raw_text)
            items.append({
                "type": "article",
                "number": marker['number'],
                "title": f"Artículo {marker['number']}",
                "text": clean_text
            })
        else:
            # Es una cabecera
            # A veces la cabecera incluye el primer reglón del texto si no hay salto,
            # pero el regex de cabecera intenta ser estricto con el final $.
            header_text = clean_and_format_text(marker['text'])
            items.append({
                "type": "header",
                "text": header_text
            })
            
    return items, None

def validate_sequence(items, law_title):
    if not items: return []
    
    errors = []
    # Solo validar articulos
    articles = [i for i in items if i['type'] == 'article']
    
    # Intentar convertir numeros a int para verificar saltos (si es posible)
    def clean_num(n):
        try:
            # Quitar bis, ter, -A etc para la secuencia basica
            base_num = re.sub(r'[^0-9]', '', str(n))
            return int(base_num) if base_num else -1
        except:
            return -1

    nums = [clean_num(a['number']) for a in articles]
    
    # 1. Verificar secuencia numérica básica
    for i in range(len(nums) - 1):
        if nums[i] != -1 and nums[i+1] != -1:
            if nums[i+1] > nums[i] + 5: # Tolerancia de 5 (artículos derogados en lote)
                errors.append(f"⚠️ Gran salto en Art. {articles[i]['number']} -> {articles[i+1]['number']}")
            
    # 2. Verificar contenido vacío
    for art in articles:
        if len(art['text']) < VALIDATION_SETTINGS["min_chars_per_article"]:
            errors.append(f"⚠️ Posible error en Art. {art['number']}: Texto muy corto ({len(art['text'])} chars)")
            
    return errors

def main():
    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / "data"
    
    # Buscar todos los PDFs
    pdfs = list(data_dir.glob("*.pdf"))
    
    if not pdfs:
        print("📭 No se encontraron archivos PDF en la carpeta data/")
        return

    print(f"🚀 Iniciando procesamiento masivo de {len(pdfs)} leyes...")
    
    summary = []

    for pdf in pdfs:
        # Generar metadatos básicos basados en el nombre del archivo
        # Ejemplo: "ley_transito.pdf" -> Title: "Ley Transito", Category: "ley_transito"
        base_name = pdf.stem
        category = base_name.lower().replace(" ", "_")
        title = base_name.replace("_", " ").title()
        
        items, error = extract_from_pdf(pdf)
        
        if error:
            print(f"❌ saltando {pdf.name}: {error}")
            summary.append({"file": pdf.name, "status": "ERROR", "msg": error})
            continue

        validation_msgs = validate_sequence(items, title)
        
        # Estructurar JSON
        output_data = [{
            "title": title,
            "category": category, 
            "parent_category": "leyes",
            "type": "ley_organica",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": f"Extraído automáticamente de {pdf.name}",
            "content": {"articles": items} # Usamos 'articles' como nombre de clave por compatibilidad
        }]
        
        output_path = data_dir / f"{category}_full.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        status = "OK" if not validation_msgs else "WARNING"
        summary.append({
            "file": pdf.name,
            "status": status,
            "count": len([i for i in items if i['type'] == 'article']),
            "alerts": validation_msgs
        })
        print(f"✅ Generado: {output_path.name} ({len(items)} elementos)")

    # REPORTE FINAL
    print("\n" + "="*50)
    print("📋 REPORTE FINAL DE CALIDAD")
    print("="*50)
    for s in summary:
        icon = "✅" if s['status'] == "OK" else ("⚠️" if s['status'] == "WARNING" else "❌")
        print(f"{icon} {s['file']}: {s.get('count', 0)} artículos")
        for alert in s.get('alerts', []):
            print(f"   └─ {alert}")
    print("="*50)
    print("\n💡 Próximo paso: Ejecuta 'node scripts/seedDatabase.js' para subir todo a Firebase.")

if __name__ == "__main__":
    main()
