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
    CODIGO_ABOGADO: 'codigo_abogado',
    CODIGO_DEONTOLOGIA: 'codigo_deontologia',
    TSJ: 'tsj',
    GACETA: 'gaceta',
    LEYES: 'leyes', // Nueva categoría para leyes generales
    LEYES_ORGANICAS: 'leyes_organicas', // Nueva categoría para leyes orgánicas
    CONVENIOS: 'convenios', // Convenios Internacionales
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
    [LAW_CATEGORIES.CODIGO_ABOGADO]: 'Código de Ética del Abogado',
    [LAW_CATEGORIES.CODIGO_DEONTOLOGIA]: 'Código de Deontología Médica',
    [LAW_CATEGORIES.TSJ]: 'Sentencias TSJ',
    [LAW_CATEGORIES.GACETA]: 'Gaceta Oficial',
    [LAW_CATEGORIES.LEYES]: 'Leyes Ordinarias',
    [LAW_CATEGORIES.LEYES_ORGANICAS]: 'Leyes Orgánicas',
    [LAW_CATEGORIES.CONVENIOS]: 'Convenios Internacionales',
};

// Colores del tema (Premium Palette)
export const COLORS = {
    primary: '#0F172A', // Slate 900 (Fondo muy oscuro/elegante)
    accent: '#B45309', // Amber 700 (Dorado/Legal)
    secondary: '#1E293B', // Slate 800 (Tarjetas)
    premium: '#D97706', // Dorado brillante
    background: '#F8FAFC', // Slate 50
    surface: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B', // Slate 500
    border: '#E2E8F0', // Slate 200
    success: '#059669',
    error: '#DC2626',
};

// Gradientes para efectos visuales
export const GRADIENTS = {
    legal: ['#0F172A', '#1E293B'], // Azul profundo a gris oscuro
    gold: ['#B45309', '#D97706'], // Dorado elegante
    surface: ['#FFFFFF', '#F8FAFC'],
};

// Tipos de documentos
export const DOCUMENT_TYPES = {
    LEY_BASE: 'ley_base',
    LEY_ORGANICA: 'ley_organica',
    SENTENCIA: 'sentencia',
    DECRETO: 'decreto',
    RESOLUCION: 'resolucion',
};

