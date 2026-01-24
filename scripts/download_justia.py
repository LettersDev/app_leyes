import os
import requests
import time

# --- CONFIGURATION ---
BASE_URL = "https://docs.venezuela.justia.com/federales/leyes-organicas/"
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')

SLUGS = [
    "ley-organica-procesal-del-trabajo",
    "ley-organica-contra-el-trafico-ilicito-y-el-consumo-de-sustancias-estupefacientes-y-psicotropicas",
    "ley-organica-de-aduanas",
    "ley-organica-de-amparo-sobre-derechos-y-garantias-constitucionales",
    "ley-organica-de-apertura-del-mercado-interno-de-la-gasolina-y-otros-combustibles-derivados-de-los-hidrocarburos-para-uso-de-vehiculos-automotores",
    "ley-organica-de-contribuciones-parafiscales-para-el-sector-agricola",
    "ley-organica-de-creacion-del-fondo-de-rescate-de-la-deuda-publica-de-venezuela",
    "ley-organica-de-credito-publico",
    "ley-organica-de-descentralizacion-delimitacion-y-transferencia-de-competencias-del-poder-publico",
    "ley-organica-de-educacion",
    "ley-organica-de-emolumentos-para-altos-funcionarios-y-funcionarias-de-los-estados-y-municipios",
    "ley-organica-de-identificacion",
    "ley-organica-de-justicia-y-paz",
    "ley-organica-de-liquidacion-del-fondo-compensacion-cambiaria",
    "ley-organica-de-ordenacion-urbanistica",
    "ley-organica-de-prevencion-condiciones-y-medio-ambiente-de-trabajo",
    "ley-organica-de-procedimientos-administrativos",
    "ley-organica-de-regimen-municipal",
    "ley-organica-de-regimen-presupuestario",
    "ley-organica-de-salud",
    "ley-organica-de-salvaguarda-del-patrimonio-publico",
    "ley-organica-de-seguridad-de-la-nacion",
    "ley-organica-de-seguridad-y-defensa",
    "ley-organica-de-telecomunicaciones",
    "ley-organica-de-la-academia-nacional-de-medicina",
    "ley-organica-de-la-administracion-central",
    "ley-organica-de-la-administracion-financiera-del-sector-publico",
    "ley-organica-de-la-administracion-publica",
    "ley-organica-de-la-contraloria-general-de-la-republica-y-del-sistema-nacional-de-control-fiscal",
    "ley-organica-de-la-defensoria-del-pueblo",
    "ley-organica-de-la-fuerza-armada-nacional",
    "ley-organica-de-la-hacienda-publica-nacional",
    "ley-organica-de-la-renta-de-salinas",
    "ley-organica-de-las-dependencias-federales",
    "ley-organica-de-las-fuerzas-armadas-nacionales",
    "ley-organica-de-los-consejos-legislativos-de-los-estados",
    "ley-organica-de-los-espacios-acuaticos-e-insulares",
    "ley-organica-de-los-territorios-federales",
    "ley-organica-del-ambiente",
    "ley-organica-del-consejo-de-la-judicatura",
    "ley-organica-del-distrito-federal",
    "ley-organica-del-ministerio-publico",
    "ley-organica-del-poder-ciudadano",
    "ley-organica-del-poder-electoral",
    "ley-organica-del-poder-judicial",
    "ley-organica-del-poder-publico-municipal",
    "ley-organica-del-servicio-consular",
    "ley-organica-del-servicio-diplomatico",
    "ley-organica-del-servicio-electrico",
    "ley-organica-del-sistema-de-seguridad-social",
    "ley-organica-del-sufragio-y-participacion-politica",
    "ley-organica-del-trabajo",
    "ley-organica-del-tribunal-supremo-de-justicia",
    "ley-organica-para-la-ordenacion-del-territorio",
    "ley-organica-para-la-planificacion-y-gestion-de-la-ordenacion-del-territorio",
    "ley-organica-para-la-prestacion-de-los-servicios-de-agua-potable-y-de-saneamiento",
    "ley-organica-para-la-proteccion-del-nino-y-del-adolescente",
    "ley-organica-que-autoriza-al-presidente-de-la-republica-para-dictar-medidas-extraordinarias-en-materia-economica-y-financiera-requeridas-por-el-interes-publico",
    "ley-organica-que-regula-la-enajenacion-de-bienes-del-sector-publico-no-afectos-a-las-industrias-basicas",
    "ley-organica-que-crea-el-territorio-federal-vargas",
    "ley-organica-que-reserva-al-estado-la-industria-y-el-comercio-de-los-hidrocarburos",
    "ley-organica-sobre-estados-de-excepcion",
    "ley-organica-sobre-promocion-de-la-inversion-privada-bajo-el-regimen-de-concesiones",
    "ley-organica-sobre-refugiados-o-refugiadas-y-asilados-o-asiladas",
    "ley-organica-sobre-sustancias-estupefacientes-y-psicotropicas",
    "ley-organica-contra-la-delincuencia-organizada",
    "ley-para-el-pago-del-bono-compensatorio-de-gastos-de-transporte"
]

def download_pdfs():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    })
    
    total = len(SLUGS)
    print(f"🚀 Starting download of {total} PDFs...")
    
    for i, slug in enumerate(SLUGS):
        url = f"{BASE_URL}{slug}.pdf"
        filename = f"{slug}.pdf"
        filepath = os.path.join(DATA_DIR, filename)
        
        if os.path.exists(filepath):
            print(f"⏭️  [{i+1}/{total}] Skipping {filename} (already exists)")
            continue
            
        print(f"⏳ [{i+1}/{total}] Downloading: {filename}...")
        try:
            response = session.get(url, timeout=10)
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                print(f"✅ Saved: {filename}")
            else:
                print(f"❌ Failed: {filename} (HTTP {response.status_code})")
        except Exception as e:
            print(f"❌ Error downloading {filename}: {str(e)}")
            
        # Small delay to be polite to the server
        time.sleep(0.5)

if __name__ == "__main__":
    download_pdfs()
