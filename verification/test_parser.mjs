import fs from 'fs';
import path from 'path';
import { parseHtmlWithRegex, buildCardFields } from '../lib/dictionary.js';

const htmlPath = path.resolve('applications - 搜索 词典.html');
console.log(`Reading HTML from: ${htmlPath}`);

try {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    console.log('HTML read successfully. Length:', html.length);

    console.log('--- Parsing HTML ---');
    const result = parseHtmlWithRegex(html, 'applications');

    console.log('--- Parse Result ---');
    console.log('Headword:', result.headword);
    console.log('Inflection:', result.inflection);
    console.log('Phonetic US:', result.phoneticUS);
    console.log('Phonetic UK:', result.phoneticUK);
    console.log('Word Forms:', JSON.stringify(result.wordForms));
    console.log('Definitions:', JSON.stringify(result.definitions));
    console.log('Detailed Defs Count:', result.detailedDefs.length);
    if (result.detailedDefs.length > 0) {
        console.log('First Detailed Def Group:', JSON.stringify(result.detailedDefs[0]));
    }
    console.log('Collocations:', JSON.stringify(result.collocations));
    console.log('Synonyms:', result.synonyms.join(', '));
    console.log('Examples Count:', result.examples.length);

    console.log('\n--- Building Card Fields ---');
    const fields = buildCardFields('applications', result);
    console.log('Word Field:', fields.Word);
    console.log('Inflections Field:', fields.Inflections);
    console.log('Translation Field:', fields.Translation);
    console.log('DomainDefs Field Length:', fields.DomainDefs.length);
    console.log('Collocations Field:', fields.Collocations);

    // Initial assertions to verify critical data
    if (result.inflection.includes('plural')) {
        console.log('✅ Inflection detected correctly.');
    } else {
        console.error('❌ Inflection detection failed!');
    }

    if (result.collocations.length > 0) {
        console.log('✅ Collocations detected correctly.');
    } else {
        console.error('❌ Collocations detection failed!');
    }

    if (result.detailedDefs.length > 0) {
        console.log('✅ Detailed definitions detected correctly.');
    } else {
        console.error('❌ Detailed definitions detection failed!');
    }

} catch (err) {
    console.error('Error:', err);
}
