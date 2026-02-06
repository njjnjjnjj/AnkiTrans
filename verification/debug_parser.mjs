import fs from 'fs';
import path from 'path';
import { parseHtmlWithRegex, buildCardFields } from '../lib/dictionary.js';

const htmlPath = path.resolve('applications - 搜索 词典.html');
console.log(`Reading HTML from: ${htmlPath}`);

try {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    console.log('HTML read successfully. Length:', html.length);

    // Debug: Print context around 'in_tip'
    const index = html.indexOf('in_tip');
    if (index !== -1) {
        console.log('Uncovered "in_tip" at index:', index);
        console.log('Context:', html.substring(index - 50, index + 150));
    } else {
        console.log('WARNING: "in_tip" not found in HTML file!');
    }

    console.log('--- Parsing HTML ---');
    const result = parseHtmlWithRegex(html, 'applications');

    console.log('--- Parse Result ---');
    console.log('Inflection:', result.inflection);

    if (result.inflection) {
        console.log('✅ Inflection detected correctly.');
    } else {
        console.error('❌ Inflection detection failed!');
    }

} catch (err) {
    console.error('Error:', err);
}
