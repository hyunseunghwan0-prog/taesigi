'use strict';
const mammoth = require('mammoth');
const { assignSections } = require('./sectionDetector');

async function extractDocx(filePath) {
  const { value: fullText } = await mammoth.extractRawText({ path: filePath });

  // DOCX는 페이지 구분이 없으므로 단락 단위로 분할 후 섹션 감지
  // 페이지 나누기(\f) 또는 빈 줄 5개 이상을 페이지 경계로 처리
  const chunks = fullText.split(/\f|\n{5,}/);
  const pages = chunks.map(c => c.trim()).filter(c => c.length > 0);

  // 페이지가 너무 적으면 단락 묶음으로 재분할
  const finalPages = pages.length >= 2 ? pages : splitByParagraphs(fullText);

  const annotated = assignSections(finalPages);
  return { pages: annotated, rawText: fullText };
}

function splitByParagraphs(text) {
  // 문단 단위로 나눠 20문단씩 묶음
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 10);
  const chunks = [];
  for (let i = 0; i < paras.length; i += 20) {
    chunks.push(paras.slice(i, i + 20).join('\n\n'));
  }
  return chunks.length > 0 ? chunks : [text];
}

module.exports = { extractDocx };
