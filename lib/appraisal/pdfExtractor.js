const pdfParse = require('pdf-parse');
const fs = require('fs');

/**
 * PDF 파일에서 페이지별 텍스트 배열을 반환합니다.
 * @param {string} filePath
 * @returns {Promise<{ pages: string[], fullText: string }>}
 */
async function extractPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pages = [];

  const data = await pdfParse(buffer, {
    pagerender: function (pageData) {
      return pageData.getTextContent().then(function (textContent) {
        const text = textContent.items.map(item => item.str).join(' ');
        pages.push(text);
        return text;
      });
    },
  });

  // pagerender가 동작하지 않는 환경 대비: 전체 텍스트를 페이지 구분자로 분리
  if (pages.length === 0) {
    const chunks = data.text.split(/\f/);
    chunks.forEach(c => pages.push(c));
  }

  return { pages, fullText: data.text };
}

module.exports = { extractPdf };
