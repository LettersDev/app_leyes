require('dotenv').config();

async function listModels() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(JSON.stringify(data.models.filter(m => m.supportedGenerationMethods.includes('embedContent')), null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

listModels();
