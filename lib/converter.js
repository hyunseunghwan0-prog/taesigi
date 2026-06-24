const { parseFile, parseDocx } = require('./parser');
const { parseFullText, extractTitle } = require('./textParser');
const { generateDocx } = require('./docxGenerator');
const fs = require('fs');
const path = require('path');

async function convertDocx(templateFile, inputFiles) {
  const allLines = [];
  const allImages = [];

  for (const f of inputFiles) {
    const result = await parseFile(f.path, f.originalname);
    console.log(`[인풋] ${f.originalname} | 라인: ${result.lines.length} | 이미지: ${result.images.length}`);

    // Remap image indices to global index
    for (const line of result.lines) {
      if (line.startsWith('IMAGE:')) {
        const localIdx = parseInt(line.slice(6));
        const globalIdx = allImages.length;
        allImages.push(result.images[localIdx]);
        allLines.push(`IMAGE:${globalIdx}`);
      } else {
        allLines.push(line);
      }
    }
    allLines.push(''); // separator between files
  }

  const fullText = allLines.join('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'debug_extracted.txt'), fullText, 'utf-8');

  const reportTitle = extractTitle(fullText);
  console.log('[제목]', reportTitle);

  const blocks = parseFullText(fullText);
  console.log(`[블록] 총 ${blocks.length}개 | heading:${blocks.filter(b=>b.type==='heading').length} | table:${blocks.filter(b=>b.type==='table').length} | image:${blocks.filter(b=>b.type==='image').length} | body:${blocks.filter(b=>b.type==='body').length}`);

  const outputPath = await generateDocx(blocks, templateFile.path, reportTitle, allImages);
  return outputPath;
}

module.exports = { convertDocx };
