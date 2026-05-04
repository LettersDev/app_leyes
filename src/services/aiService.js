import { supabase } from '../config/supabase';

const AIService = {
    /**
     * Interpreta un artículo legal específico
     */
    interpretArticle: async (articleTitle, articleText) => {
        try {
            const { data, error } = await supabase.functions.invoke('interpret-article', {
                body: { articleTitle, articleText }
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('[AIService] Error interpretando artículo:', error);
            throw error;
        }
    },

    /**
     * Realiza una consulta legal basada en un caso (RAG)
     */
    consultCase: async (query) => {
        try {
            const { data, error } = await supabase.functions.invoke('assistant-consult', {
                body: { query }
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('[AIService] Error consultando caso:', error);
            throw error;
        }
    }
};

export default AIService;
