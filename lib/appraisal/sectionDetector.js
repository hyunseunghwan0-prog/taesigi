/**
 * PDF 페이지별 섹션 분류기
 * 각 페이지 앞뒤 텍스트에서 머리말/꼬리말 키워드로 섹션을 식별합니다.
 * 공백이 삽입된 형태(한글 PDF 변환 특성)도 처리합니다.
 */

// 공백을 제거한 압축 텍스트로 비교
function compress(text) {
  return text.replace(/\s+/g, '');
}

const SECTION_KEYWORDS = [
  // 우선순위 높은 것 먼저 (구체적 → 일반적 순)
  { id: '사진',           checks: ['사진용지', '사진  용지', '사  진  용  지'] },
  { id: '위치도',         checks: ['위치도', '위  치  도', '광역위치도', '상세위치도'] },
  { id: '명세표',         checks: ['명세표', '명  세  표', '감정평가명세표'] },
  { id: '요항표',         checks: ['요항표', '요  항  표', '감정평가요항표'] },
  { id: '의견서',         checks: ['산출근거및결정의견', '감정평가의견서', '결정의견', '산출근거'] },
  { id: '담보가치총괄표', checks: ['담보가치총괄표', '담보가치총괄', '담보가치  총괄표', '담  보  가  치  총  괄  표'] },
  { id: '괄호감정표',     checks: ['괄호감정표', '괄호감정', '(감정표)', '(토지)감정평가표', '(건물)감정평가표', '(토지·건물)감정평가표'] },
  { id: '표지',           checks: ['AppraisalReport', '감정평가서'] },
];

function detectSection(pageText) {
  const head = pageText.slice(0, 400);
  const tail = pageText.slice(-400);
  const combined = compress(head + tail);

  for (const { id, checks } of SECTION_KEYWORDS) {
    for (const kw of checks) {
      if (combined.includes(compress(kw))) return id;
    }
  }
  return null;
}

/**
 * 전체 페이지에 섹션을 할당합니다.
 * @param {string[]} pages
 * @returns {{ section: string, pageNum: number, text: string }[]}
 */
function assignSections(pages) {
  const result = [];
  let currentSection = '표지';

  pages.forEach((text, i) => {
    const detected = detectSection(text);
    if (detected) currentSection = detected;
    result.push({ section: currentSection, pageNum: i + 1, text });
  });

  return result;
}

function groupBySection(annotatedPages) {
  const groups = {};
  for (const page of annotatedPages) {
    if (!groups[page.section]) groups[page.section] = [];
    groups[page.section].push({ pageNum: page.pageNum, text: page.text });
  }
  return groups;
}

module.exports = { assignSections, groupBySection };
