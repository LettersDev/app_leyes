#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch Add Laws - Procesamiento Masivo de Leyes para AppLeyes
===========================================================
Este script procesa todos los PDFs en la carpeta data/ y genera 
archivos JSON estructurados con validacion de integridad.
"""

import json
import re
import sys
import os
from pathlib import Path
from datetime import datetime

# --- CONFIGURACION DE SEGURIDAD ---
VALIDATION_SETTINGS = {
    "max_gap_allowed": 0,  # Alertar si falta aunque sea 1 numero en la secuencia
    "min_chars_per_article": 10,  # Alertar si un articulo tiene menos de 10 caracteres
}

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber no esta instalado. Ejecuta: pip install pdfplumber")
    sys.exit(1)



def identify_dynamic_artifacts(pdf_path):
    """
    Identifica líneas que se repiten con frecuencia en el PDF (cabeceras/pies).
    """
    line_counts = {}
    total_pages = 0
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    for line in text.split('\n'):
                        line = line.strip()
                        if len(line) > 10:
                            line_counts[line] = line_counts.get(line, 0) + 1
    except:
        pass

    threshold = max(2, total_pages * 0.3)
    artifacts = [line for line, count in line_counts.items() if count >= threshold]
    return artifacts


def table_to_text(table):
    """
    Convierte una tabla en una representación de texto legible.
    """
    if not table: return ""
    output = "\n\n[TABLA]\n"
    # Filtrar filas vacías
    valid_rows = [row for row in table if any(row)]
    if not valid_rows: return ""
    
    for row in valid_rows:
        clean_row = [str(cell).replace('\n', ' ').strip() if cell else "" for cell in row]
        output += "| " + " | ".join(clean_row) + " |\n"
    output += "[FIN TABLA]\n\n"
    return output


def clean_full_text(full_text, dynamic_artifacts=None):
    """
    Limpieza profunda del texto completo.
    """
    if not full_text: return full_text

    if dynamic_artifacts:
        for artifact in dynamic_artifacts:
            pattern = re.escape(artifact).replace(r'\ ', r'\s+')
            full_text = re.sub(rf'(?m)^\s*{pattern}\s*$', '', full_text)

    # Marcadores de pagina fijos
    full_text = re.sub(r'\bPage\s+\d+\s*of\s*\d+\b', '', full_text, flags=re.IGNORECASE)
    full_text = re.sub(r'\bPagina\s+\d+\s*de\s*\d+\b', '', full_text, flags=re.IGNORECASE)
    full_text = re.sub(r'\bP[aá]gina\s+\d+\s*de\s*\d+\b', '', full_text, flags=re.IGNORECASE)

    # URLs
    full_text = re.sub(r'https?://\S+', '', full_text)

    # Timestamps
    full_text = re.sub(r'\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM|am|pm)', '', full_text)
    full_text = re.sub(r'(?m)^\s*\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\s*$', '', full_text)

    full_text = re.sub(r'\n{3,}', '\n\n', full_text)
    return full_text



def clean_and_format_text(text):
    """
    Formateo final del texto del articulo.
    Preservamos saltos de línea para mantener estructura de listas y tablas no detectadas.
    """
    if not text: return ""

    # Unir palabras cortadas por guion al final de linea
    text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)

    # Normalizar espacios horizontales pero MANTENER saltos de línea
    # (reemplazamos múltiples espacios por uno solo, pero dejamos los \n)
    text = re.sub(r'[ \t\f\r]+', ' ', text)
    
    # 4. Limpiar espacios en blanco al inicio/final de cada línea
    text = '\n'.join(line.strip() for line in text.split('\n'))

    # 5. Unir líneas rotas (Smart Join) - Evita romper tablas
    def _do_smart_join(t):
        # Une si la línea no termina en puntuación fuerte y la siguiente empieza en minúscula
        return re.sub(r'([^\.\:\;\?\!¡¿\n])\n\s*([a-zñáéíóú])', r'\1 \2', t)

    if "[TABLA]" in text:
        parts = re.split(r'(\[TABLA\].*?\[FIN TABLA\])', text, flags=re.DOTALL)
        for i in range(len(parts)):
            if not parts[i].startswith("[TABLA]"):
                parts[i] = _do_smart_join(parts[i])
        text = "".join(parts)
    else:
        text = _do_smart_join(text)

    # Eliminar exceso de saltos de línea (máximo 2 seguidos)
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Restaurar saltos de estructura (si no estaban ya)
    text = re.sub(r'(?<!\n)(\s+)(\d+[°º]\.?)', r'\n\n\2', text)
    text = re.sub(r'(?<!\n)(\s+)(\d+\.)(?=\s[A-Z\xc1\xc9\xcd\xd3\xda])', r'\n\n\2', text)


    # Eliminamos frases numerales duplicadas que suelen quedar al final
    numeral_words = [
        'Primero:', 'Segundo:', 'Tercero:', 'Cuarto:', 'Quinto:',
        'Sexto:', 'S[eé]ptimo:', 'Octavo:', 'Noveno:', 'D[eé]cimo:',
        r'P[aá]rrafo Segundo', 'Par[aá]grafo [Ú|U]nico', 'Par[aá]grafo:',
    ]
    for word in numeral_words:
        text = re.sub(rf'(?<!\n)(\s+)({word})', r'\n\n\2', text, flags=re.IGNORECASE)

    # 7. Limpiar artefactos comunes de PDFs (como los de la constitucion)
    # Manejamos acentos opcionales y variaciones de espacios/mayúsculas
    text = re.sub(r'(?i)CONSTITUCI[OÓ]N DE LA REP[UÚ]BLICA BOLIVARIANA DE VENEZUELA', '', text)
    text = re.sub(r'(?i)Gaceta Oficial N° [\d\.]+', '', text)
    text = re.sub(r'(?i)\bPage\s+\d+\s*of\s*\d+\b', '', text)
    text = re.sub(r'(?i)\bPagina\s+\d+\s*de\s*\d+\b', '', text)
    text = re.sub(r'(?i)\bP[aá]gina\s+\d+\s*de\s*\d+\b', '', text)
    text = re.sub(r'https?://\S+', '', text)
    
    # Eliminar espacios dobles que quedan tras quitar los artefactos
    text = re.sub(r' +', ' ', text)

    return text.strip()





def extract_from_pdf(pdf_path):
    print(f"\n Analizando: {pdf_path.name}")
    
    dynamic_artifacts = identify_dynamic_artifacts(pdf_path)
    
    # Regex ultra-robusta para Articulos
    article_re = re.compile(
        r'(?:Art[ií]culo|Art\.)[\s\n]+(?:[^0-9]{0,250}?[\s\n]+)?([0-9]+(?:-[A-Z]| bis| ter|°|º|º:)?)\s*[:\.\-]?\s*',
        re.IGNORECASE | re.DOTALL
    )
    
    header_re = re.compile(
        r'^\s*(?:LIBRO|T[IÍ]TULO|CAP[IÍ]TULO|SECCI[OÓ]N)\s+([IVXLCDM\d]+(?!\s+de\s+).*?)\s*$',
        re.MULTILINE | re.IGNORECASE
    )
    
    full_text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:


                # 1. Encontrar tablas (Volvemos a estrategia estándar pero con tolerancia)
                found_tables = page.find_tables({
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                })
                
                # Filtrar tablas falsas positivas (tablas que parecen ser texto normal)
                # Si una tabla tiene demasiadas celdas cortas o vacías en una sola columna, suele ser texto.
                real_tables = []
                for t in found_tables:
                    rows = t.extract()
                    if len(rows) > 1 and len(rows[0]) > 1: # Al menos 2x2
                        real_tables.append(t)
                found_tables = real_tables
                
                # 2. Función para filtrar texto que NO esté en tablas
                def is_not_in_table(obj):
                    if obj.get("object_type") != "char": return True
                    for t in found_tables:
                        # Un pequeño margen de error para los bboxes
                        if (obj['x0'] >= t.bbox[0] - 1 and obj['x1'] <= t.bbox[2] + 1 and
                            obj['top'] >= t.bbox[1] - 1 and obj['bottom'] <= t.bbox[3] + 1):
                            return False
                    return True

                # 3. Extraer el texto "limpio" (sin las tablas)
                clean_page = page.filter(is_not_in_table)
                text_outside = clean_page.extract_text(layout=True, x_tolerance=2, y_tolerance=2) or ""
                
                # 4. Combinar inteligentemente
                # Como layout=True puede ser caótico si quitamos bloques, vamos a una estrategia simple:
                # El texto de la tabla se anexa. Para leyes, las tablas suelen estar entre párrafos.
                # Si hay tablas, las agregamos al final del texto de la página por ahora para no romper el regex de artículos
                # que suele estar al inicio de un bloque.
                

                raw_text = text_outside
                if found_tables:
                    for t in found_tables:
                        table_data = t.extract()
                        # Si alguna celda es demasiado larga, probablemente no sea una tabla real sino texto
                        is_likely_text = any(len(str(cell)) > 150 for row in table_data for cell in row if cell)
                        if not is_likely_text:
                            raw_text += "\n" + table_to_text(table_data)
                        else:
                            # Si era texto, no lo perdimos porque 'text_outside' lo excluyó.
                            # PERO queremos recuperarlo si el filtro lo sacó injustamente.
                            # Por ahora, confiamos en que 'filter' es preciso.
                            pass
                
                if raw_text:
                    full_text += raw_text + "\n"
                    
    except Exception as e:
        return None, f"Error al abrir PDF: {str(e)}"

    full_text = clean_full_text(full_text, dynamic_artifacts)

    raw_markers = []
    for m in article_re.finditer(full_text):
        # Limpieza agresiva del numero (quitar :, -, ., espacios)
        num_str = re.sub(r'[:\.\-\s]', '', m.group(1)).strip()
        try:
            base_num = int(re.sub(r'[^0-9]', '', num_str))
        except:
            base_num = -1
        raw_markers.append({'type': 'article', 'start': m.start(), 'end_marker': m.end(), 'number': num_str, 'base_num': base_num})

    filtered_markers = []
    last_num = 0
    for m in raw_markers:
        is_ref = False
        if m['base_num'] != -1 and m['base_num'] < last_num:
            is_ref = True
        if m['start'] > 2:
            prev = full_text[m['start']-2:m['start']]
            if re.search(r'[a-z,]\s', prev):
                if m['base_num'] != last_num + 1:
                    is_ref = True
        if not is_ref:
            filtered_markers.append(m)
            if m['base_num'] != -1: last_num = m['base_num']

    for m in header_re.finditer(full_text):
        filtered_markers.append({'type': 'header', 'start': m.start(), 'end_marker': m.end(), 'text': m.group(0).strip()})
    
    filtered_markers.sort(key=lambda x: x['start'])
    
    items = []
    for i, marker in enumerate(filtered_markers):
        start_pos = marker['end_marker']
        end_pos = filtered_markers[i + 1]['start'] if i + 1 < len(filtered_markers) else len(full_text)
        content = full_text[start_pos:end_pos].strip()
        
        if marker['type'] == 'article':
            items.append({
                "type": "article",
                "number": marker['number'],
                "title": f"Art\u00edculo {marker['number']}",
                "text": clean_and_format_text(content)
            })
        else:
            items.append({"type": "header", "text": marker['text']})
            
    return items, None


def validate_sequence(items, law_title):
    if not items: return []
    errors = []
    articles = [i for i in items if i['type'] == 'article']
    
    def clean_num(n):
        try:
            return int(re.sub(r'[^0-9]', '', str(n)))
        except:
            return -1

    nums = [clean_num(a['number']) for a in articles]
    for i in range(len(nums) - 1):
        if nums[i] != -1 and nums[i+1] != -1:
            if nums[i+1] > nums[i] + 20: 
                errors.append(f"Gran salto en Art. {articles[i]['number']} -> {articles[i+1]['number']}")
            
    for art in articles:
        # No alertar si es un articulo derogado (texto muy corto pero es correcto)
        if "DEROGADO" in art['text'].upper() or "DEROGADA" in art['text'].upper():
            continue
        if len(art['text']) < 10: # Reducido a 10 por mayor ruido en OCR
            errors.append(f"Posible error en Art. {art['number']}: Texto muy corto")
            
    return errors


def main():

    script_dir = Path(__file__).parent
    data_dir = (script_dir.parent / "data").resolve()
    
    pdfs = list(data_dir.glob("*.pdf"))
    print(f"DEBUG: data_dir: {data_dir}")
    print(f"DEBUG: PDFs encontrados: {len(pdfs)}")
    
    if not pdfs:
        print("No se encontraron archivos PDF en la carpeta data/")
        return

    print(f"Iniciando procesamiento masivo de {len(pdfs)} leyes...")
    
    summary = []

    for pdf in pdfs:
        base_name = pdf.stem
        category = base_name.lower().replace(" ", "_")
        title = base_name.replace("_", " ").title()
        
        items, error = extract_from_pdf(pdf)
        
        if error:
            print(f"ERROR: saltando {pdf.name}: {error}")
            summary.append({"file": pdf.name, "status": "ERROR", "msg": error})
            continue

        validation_msgs = validate_sequence(items, title)
        
        output_data = [{
            "title": title,
            "category": category,
            "parent_category": "leyes",
            "type": "ley_organica",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": f"Extra\u00eddo autom\u00e1ticamente de {pdf.name}",
            "content": {"articles": items}
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
        print(f"Generado: {output_path.name} ({len(items)} elementos)")

    # REPORTE FINAL
    print("\n" + "="*50)
    print("REPORTE FINAL DE CALIDAD")
    print("="*50)
    for s in summary:
        icon = "OK" if s['status'] == "OK" else ("WARNING" if s['status'] == "WARNING" else "ERROR")
        print(f"[{icon}] {s['file']}: {s.get('count', 0)} articulos")
        for alert in s.get('alerts', []):
            print(f"   -- {alert}")
    print("="*50)
    print("\nProximo paso: Ejecuta 'node scripts/seedDatabase.js' para subir todo a Supabase.")


if __name__ == "__main__":
    main()
