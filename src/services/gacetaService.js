import { supabase } from '../config/supabase';

const GacetaService = {
    fetchGacetas: async (filters = {}) => {
        const { selectedYear, selectedType = 'Todos', lastNumero, pageOffset = 0, searchQuery, pageSize = 25 } = filters;

        try {
            let q = supabase.from('gacetas').select('*');



            // Aplicar filtros de navegación si están seleccionados
            if (selectedYear && selectedYear !== 'Todos') {
                q = q.eq('ano', parseInt(selectedYear));
            }

            // Aplicar filtro de tipo si no es 'Todos'
            if (selectedType && selectedType !== 'Todos') {
                if (selectedType === 'Ordinaria') {
                    // Para evitar que 'Ordinaria' incluya 'Extraordinaria', usamos búsqueda exacta
                    q = q.eq('tipo', 'Ordinaria');
                } else {
                    q = q.ilike('tipo', `%${selectedType}%`);
                }
            }

            const term = searchQuery?.trim();
            if (term) {
                // Limpiar puntos para búsqueda numérica (ej: "6.809" -> "6809")
                const cleanTerm = term.replace(/\./g, '');
                const isNumeric = !isNaN(parseInt(cleanTerm)) && /^\d+$/.test(cleanTerm);

                if (isNumeric) {
                    console.log('🔍 Buscando Gaceta por número:', cleanTerm);
                    q = q.or(`numero.eq.${parseInt(cleanTerm)},numero_display.ilike.%${term}%`);
                } else {
                    console.log('🔍 Buscando por texto (ILIKE):', term);
                    q = q.or(`titulo.ilike.%${term}%,sumario.ilike.%${term}%,numero_display.ilike.%${term}%`);
                }
            }

            // Aplicar orden y límite siempre para consistencia
            // Primero por fecha (timestamp) para que Extraordinarias recientes aparezcan arriba
            q = q.order('timestamp', { ascending: false })
                .order('numero', { ascending: false })
                .range(pageOffset, pageOffset + pageSize - 1);

            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        } catch (error) {
            if (error.message && error.message.toLowerCase().includes('network')) {
                throw new Error('OFFLINE_ERROR');
            }
            console.error('Error fetching gacetas in service:', error);
            throw error;
        }
    }
};

export default GacetaService;
