const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * bundle_laws.js
 * Utility to generate bundled laws from the source data folder.
 * This ensures that bundled laws in assets/ match the source data 
 * and have unique, consistent IDs, preventing data duplication.
 */

const DATA_DIR = path.join(__dirname, '../data');
const ASSETS_DIR = path.join(__dirname, '../assets/bundled_laws');
const INDEX_FILE = path.join(ASSETS_DIR, 'laws_index.json');

// Helper to generate content hash consistent with seedDatabase.js if needed
function generateHash(lawData) {
    const articles = (lawData.content && lawData.content.articles) || [];
    const content = articles.map(a => `${a.type}|${a.number || ''}|${a.text || ''}`).join('\n');
    // Using a pattern similar to what we saw in the index
    const date = lawData.date || new Date().toISOString().split('T')[0];
    return `${lawData.title}_${articles.length}_${date}_v6_bundled`;
}

function bundleLaws() {
    console.log('🚀 Starting law bundling process...');

    if (!fs.existsSync(INDEX_FILE)) {
        console.error('❌ Error: laws_index.json not found in assets/bundled_laws/');
        return;
    }

    const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const bundledLaws = [];

    // We process only the laws present in the index as requested by the user
    for (const lawMeta of indexData.laws) {
        const lawId = lawMeta.id;
        console.log(`\n📄 Processing: ${lawId}...`);

        // Look for the source file
        let sourcePath = path.join(DATA_DIR, `${lawId}_full.json`);
        if (!fs.existsSync(sourcePath)) {
            // Try alternative names
            sourcePath = path.join(DATA_DIR, `${lawId.replace(/-/g, '_')}_full.json`);
            if (!fs.existsSync(sourcePath)) {
                sourcePath = path.join(DATA_DIR, `${lawId}.json`);
                if (!fs.existsSync(sourcePath)) {
                    console.warn(`   ⚠️ Warning: Source file for ${lawId} not found in data/. Skipping.`);
                    // Keep the old entry in the index if it was already there? 
                    // No, let's keep track of what we actually bundled.
                    continue;
                }
            }
        }

        try {
            const rawSource = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
            // Source can be an array of one law or a single law object
            const lawData = Array.isArray(rawSource) ? rawSource[0] : rawSource;

            const articles = (lawData.content && lawData.content.articles) || [];
            
            // Transform to bundled format
            const bundledItems = articles.map((item, index) => {
                const type = item.type || 'article';
                return {
                    id: `${type}_${index}`, // Fixed pattern: article_0, header_1, etc.
                    law_id: lawId,
                    index: index,
                    number: item.number || null,
                    text: item.text || '',
                    type: type,
                    law_category: lawData.category || lawId,
                    last_updated: new Date().toISOString(),
                    title: item.title || (type === 'article' ? `Artículo ${item.number}` : null)
                };
            });

            const bundledFileContent = {
                metadata: {
                    id: lawId,
                    title: lawData.title,
                    category: lawData.category || lawId,
                    parent_category: lawData.parent_category || 'leyes',
                    searchable_text: null,
                    hash: generateHash(lawData),
                    item_count: bundledItems.length,
                    is_large_law: bundledItems.length > 500,
                    last_updated: new Date().toISOString(),
                    schema_version: "v6_bundled",
                    fts: lawMeta.fts || null,
                    type: lawData.type || "Ley",
                    date: lawData.date || "",
                    description: lawData.description || `Extraído de ${lawId}`
                },
                items: bundledItems
            };

            // Write the bundled file
            const outputPath = path.join(ASSETS_DIR, `${lawId}.json`);
            fs.writeFileSync(outputPath, JSON.stringify(bundledFileContent, null, 2));
            console.log(`   ✅ Generated: ${lawId}.json (${bundledItems.length} items)`);

            // Update index entry
            bundledLaws.push(bundledFileContent.metadata);

        } catch (err) {
            console.error(`   ❌ Error processing ${lawId}:`, err.message);
        }
    }

    // Update index file
    const newIndex = {
        version: "1.1.0",
        lastUpdated: new Date().toISOString(),
        lawCount: bundledLaws.length,
        laws: bundledLaws
    };

    fs.writeFileSync(INDEX_FILE, JSON.stringify(newIndex, null, 2));
    console.log('\n✨ Bundling complete! assets/bundled_laws/laws_index.json updated.');
    console.log(`📊 Total laws bundled: ${bundledLaws.length}`);
}

bundleLaws();
