// Categorías de leyes (nombres simples para Firebase)
export const LAW_CATEGORIES = {
    CONSTITUCION: 'constitucion',
    CODIGOS: 'codigos', // Categoría padre solo para UI
    CODIGO_CIVIL: 'codigo_civil',
    CODIGO_PENAL: 'codigo_penal',
    CODIGO_COMERCIO: 'codigo_comercio',
    CODIGO_PROCEDIMIENTO_CIVIL: 'codigo_procedimiento_civil',
    CODIGO_ORGANICO_PROCESAL_PENAL: 'codigo_organico_procesal_penal',
    CODIGO_ORGANICO_TRIBUTARIO: 'codigo_organico_tributario',
    CODIGO_ORGANICO_JUSTICIA_MILITAR: 'codigo_organico_justicia_militar',
    TSJ: 'tsj',
    GACETA: 'gaceta',
};

// Nombres legibles de categorías
export const CATEGORY_NAMES = {
    [LAW_CATEGORIES.CONSTITUCION]: 'Constitución',
    [LAW_CATEGORIES.CODIGOS]: 'Códigos',
    [LAW_CATEGORIES.CODIGO_CIVIL]: 'Código Civil',
    [LAW_CATEGORIES.CODIGO_PENAL]: 'Código Penal',
    [LAW_CATEGORIES.CODIGO_COMERCIO]: 'Código de Comercio',
    [LAW_CATEGORIES.CODIGO_PROCEDIMIENTO_CIVIL]: 'Código de Procedimiento Civil',
    [LAW_CATEGORIES.CODIGO_ORGANICO_PROCESAL_PENAL]: 'Código Orgánico Procesal Penal',
    [LAW_CATEGORIES.CODIGO_ORGANICO_TRIBUTARIO]: 'Código Orgánico Tributario',
    [LAW_CATEGORIES.CODIGO_ORGANICO_JUSTICIA_MILITAR]: 'Código Orgánico de Justicia Militar',
    [LAW_CATEGORIES.TSJ]: 'Sentencias TSJ',
    [LAW_CATEGORIES.GACETA]: 'Gaceta Oficial',
};

// Colores del tema
export const COLORS = {
    primary: '#1E3A8A', // Azul oscuro (colores de Venezuela)
    secondary: '#FCD34D', // Amarillo
    accent: '#EF4444', // Rojo
    background: '#F9FAFB',
    surface: '#FFFFFF',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
};

// Tipos de documentos
export const DOCUMENT_TYPES = {
    LEY_BASE: 'ley_base',
    LEY_ORGANICA: 'ley_organica',
    SENTENCIA: 'sentencia',
    DECRETO: 'decreto',
    RESOLUCION: 'resolucion',
};

