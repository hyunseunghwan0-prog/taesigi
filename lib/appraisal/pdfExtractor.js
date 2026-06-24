const pdfParse = require('pdf-parse');
const fs = require('fs');

/**
 * PDF 파일에서 페이지별 텍스트를 반환합니다.
 * pdf-parse(pdf.js 기반)로 말풍선/텍스트박스 포함 추출하되,
 * textContent.items의 x/y 좌표로 행·열 구조를 재구성합니다.
 */
async function extractPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pages = [];

  await pdfParse(buffer, {
    pagerender(pageData) {
      return pageData.getTextContent({ normalizeWhitespace: false }).then(tc => {
        const text = buildPageText(tc.items);
        pages.push(text);
        return text;
      });
    },
  });

  if (pages.length === 0) {
    // pagerender가 동작 안 한 환경 대비
    const data = await pdfParse(buffer);
    data.text.split(/\f/).forEach(c => pages.push(c));
  }

  return { pages, fullText: pages.join('\n\n') };
}

/**
 * textContent.items → 좌표 기반 행/열 재구성
 * - y 좌표가 가까운 item끼리 같은 행으로 묶음
 * - x 간격이 크면 탭으로 열 구분
 */
function buildPageText(items) {
  if (!items || items.length === 0) return '';

  // transform[5] = y, transform[4] = x
  const withPos = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      x: it.transform[4],
      y: it.transform[5],
      text: it.str,
      width: it.width || 0,
    }));

  if (withPos.length === 0) return '';

  // y 내림차순 정렬 (PDF 좌표는 아래가 0)
  withPos.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  let currentRow = [];
  let prevY = null;

  for (const item of withPos) {
    if (prevY === null || Math.abs(item.y - prevY) > 4) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      prevY = item.y;
    } else {
      currentRow.push(item);
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows.map(row => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let prevRight = null;
    for (const item of row) {
      if (prevRight !== null) {
        const gap = item.x - prevRight;
        if (gap > 20) line += '\t';
        else if (gap > 6) line += '  ';
        else if (gap > 0) line += ' ';
      }
      line += item.text;
      prevRight = item.x + item.width;
    }
    return line;
  }).join('\n');
}

module.exports = { extractPdf };
