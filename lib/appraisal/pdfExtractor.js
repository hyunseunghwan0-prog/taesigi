const { PdfReader } = require('pdfreader');
const fs = require('fs');

/**
 * PDF 파일에서 페이지별 텍스트를 반환합니다.
 * pdfreader로 각 텍스트 아이템의 x/y 좌표를 읽어
 * y좌표 기준으로 행을 묶고 x좌표로 열 순서를 재구성합니다.
 * → 표 구조가 살아있는 텍스트 추출
 */
function extractPdf(filePath) {
  return new Promise((resolve, reject) => {
    const buffer = fs.readFileSync(filePath);
    const pageMap = {}; // pageNum → [{x, y, text}]

    let currentPage = 1;

    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) return reject(err);

      if (!item) {
        // 파싱 완료
        const pageNums = Object.keys(pageMap).map(Number).sort((a, b) => a - b);
        const pages = pageNums.map(n => buildPageText(pageMap[n]));
        const fullText = pages.join('\n\n');
        return resolve({ pages, fullText });
      }

      if (item.page) {
        currentPage = item.page;
        if (!pageMap[currentPage]) pageMap[currentPage] = [];
      }

      if (item.text) {
        if (!pageMap[currentPage]) pageMap[currentPage] = [];
        pageMap[currentPage].push({ x: item.x, y: item.y, text: item.text });
      }
    });
  });
}

/**
 * 좌표 목록 → 행/열 구조로 재구성한 텍스트
 * y 좌표가 0.3 이내인 아이템들을 같은 행으로 묶음
 * x 간격이 클 때 탭/공백으로 열 구분 표현
 */
function buildPageText(items) {
  if (!items || items.length === 0) return '';

  // y 기준 정렬
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows = [];
  let currentRow = [];
  let prevY = null;

  for (const item of sorted) {
    if (prevY === null || Math.abs(item.y - prevY) > 0.3) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      prevY = item.y;
    } else {
      currentRow.push(item);
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows.map(row => {
    const sortedRow = [...row].sort((a, b) => a.x - b.x);
    let line = '';
    let prevX = null;
    for (const item of sortedRow) {
      if (prevX !== null) {
        const gap = item.x - prevX;
        // x 간격이 2 이상이면 열 구분 공백 삽입
        if (gap > 5) line += '\t';
        else if (gap > 2) line += '  ';
        else if (gap > 0.5) line += ' ';
      }
      line += item.text;
      prevX = item.x + (item.text.length * 0.5); // 대략적인 텍스트 폭
    }
    return line;
  }).join('\n');
}

module.exports = { extractPdf };
