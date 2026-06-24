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
/**
 * @param {object[]} pages - 섹션 할당된 페이지 배열
 * @param {object} [opts]
 * @param {function} [opts.onProgress] - ({ label, pct, checkerResult? }) 스트리밍 콜백
 * @param {object[]} [opts.publicRecords] - 공부서류 파싱 결과
 */
async function runAllCheckers(pages, opts = {}) {
  const { onProgress, publicRecords } = opts;
  const checkers = loadCheckers();

  const annotatedPages = assignSections(pages);
  const detectedSections = [...new Set(annotatedPages.map(p => p.section))];

  const emit = onProgress || (() => {});
  const results = [];
  const total = checkers.length;

  // 체커를 순차 실행 → 하나씩 결과 스트리밍
  for (let i = 0; i < total; i++) {
    const checker = checkers[i];
    const pct = Math.round(20 + (i / total) * 70);
    emit({ label: `${checker.name} 검토 중...`, pct });

    let result;
    try {
      // publicRecordChecker는 두 번째 인자로 publicRecords를 받음
      const findings = checker.name === '공부서류 대조'
        ? await Promise.resolve(checker.check(annotatedPages, publicRecords || []))
        : await Promise.resolve(checker.check(annotatedPages));
      result = { checker: checker.name, description: checker.description, findings };
    } catch (err) {
      result = { checker: checker.name, description: checker.description, findings: [], error: err.message };
    }

    results.push(result);
    emit({ label: `${checker.name} 완료`, pct: pct + Math.round(70 / total), checkerResult: result });
  }

  return { results, detectedSections };
}

module.exports = { runAllCheckers };
