import { supabase } from '../config/supabase';

export const GacetaService = {
    fetchGacetas: async (filters = {}) => {
        const { selectedYear, lastNumero, searchQuery, pageSize = 25 } = filters;

        try {
            let q = supabase.from('gacetas').select('*');

            const term = searchQuery?.trim();
            const isTextSearch = term && isNaN(parseInt(term));

            if (isTextSearch) {
                q = q.textSearch('fts', term, {
                    config: 'spanish',
                    type: 'websearch'
                });
            } else if (term && !isNaN(parseInt(term))) {
                q = q.eq('numero', parseInt(term));
            } else {
                if (selectedYear && selectedYear !== 'Todos') {
                    q = q.eq('ano', parseInt(selectedYear));
                }
                if (lastNumero) {
                    q = q.lt('numero', lastNumero);
                }
                q = q.order('numero', { ascending: false }).limit(pageSize);
            }

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
