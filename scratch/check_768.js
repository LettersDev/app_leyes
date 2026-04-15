require('dotenv').config();

async function test768() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const model = 'models/text-embedding-004';
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                content: { parts: [{ text: "test dimension" }] },
                taskType: 'RETRIEVAL_DOCUMENT',
                outputDimensionality: 768
            }),
        });

        const data = await response.json();
        if (data.embedding) {
            console.log(`Model ${model} with outputDimensionality 768 returned ${data.embedding.values.length} dims`);
        } else {
            console.log(`Model ${model} failed:`, JSON.stringify(data));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test768();
