const fs = require('fs');
const path = require('path');
const { assignSections } = require('./sectionDetector');

const CHECKERS_DIR = path.join(__dirname, 'checkers');

function loadCheckers() {
  return fs.readdirSync(CHECKERS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => require(path.join(CHECKERS_DIR, f)));
}

/**
 * PDF 페이지 배열을 받아 섹션 감지 후 모든 체커를 실행합니다.
 * @param {string[]} pages - 페이지별 텍스트 배열
 * @returns {Promise<{ checker, description, findings, detectedSections }[]>}
 */
async function runAllCheckers(pages) {
  const checkers = loadCheckers();

  // 페이지별 섹션 할당
  const annotatedPages = assignSections(pages);

  // 감지된 섹션 목록 (UI에 표시용)
  const detectedSections = [...new Set(annotatedPages.map(p => p.section))];

  const results = await Promise.all(
    checkers.map(async (checker) => {
      try {
        const findings = await Promise.resolve(checker.check(annotatedPages));
        return {
          checker: checker.name,
          description: checker.description,
          findings,
        };
      } catch (err) {
        return {
          checker: checker.name,
          description: checker.description,
          findings: [],
          error: err.message,
        };
      }
    })
  );

  return { results, detectedSections };
}

module.exports = { runAllCheckers };
