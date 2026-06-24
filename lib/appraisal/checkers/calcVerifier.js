/**
 * 의견서 계산 검산
 * 의견서 섹션 내 A×B=C, A÷B=C 형태 수식을 파싱하여 계산 오류를 검출합니다.
 */

const name = '의견서 계산 검산';
const description = '의견서 내 단가×면적=평가액 등 수식의 계산 오류를 검출합니다.';

const NUM = '([\\d,]+(?:\\.\\d+)?)';

const PATTERNS = [
  { op: '×', regex: new RegExp(`${NUM}\\s*[×xX\\*]\\s*${NUM}\\s*[=≒≈]\\s*${NUM}`, 'g'), calc: (a, b) => a * b },
  { op: '÷', regex: new RegExp(`${NUM}\\s*[÷/]\\s*${NUM}\\s*[=≒≈]\\s*${NUM}`, 'g'), calc: (a, b) => b !== 0 ? a / b : null },
];

function parse(str) {
  return parseFloat(str.replace(/,/g, ''));
}

function checkPage(text, pageNum, sectionName) {
  const findings = [];

  for (const { op, regex, calc } of PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const a = parse(match[1]);
      const b = parse(match[2]);
      const stated = parse(match[3]);
      if (isNaN(a) || isNaN(b) || isNaN(stated) || stated === 0) continue;

      const expected = calc(a, b);
      if (expected === null) continue;

      const diff = Math.abs(expected - stated);
      const ratio = diff / stated;

      if (ratio > 0.01) {
        findings.push({
          checker: name,
          severity: 'error',
          location: `[${sectionName} p.${pageNum}]`,
          message: `계산 오류: ${match[1]} ${op} ${match[2]} = ${Math.round(expected).toLocaleString()} 이어야 하나 ${match[3]} 으로 기재 (오차 ${Math.round(diff).toLocaleString()})`,
          context: match[0].trim(),
        });
      } else if (ratio > 0.001) {
        findings.push({
          checker: name,
          severity: 'warning',
          location: `[${sectionName} p.${pageNum}]`,
          message: `반올림 차이: ${match[1]} ${op} ${match[2]} ≈ ${Math.round(expected).toLocaleString()} (기재: ${match[3]}, 오차 ${Math.round(diff).toLocaleString()})`,
          context: match[0].trim(),
        });
      }
    }
  }

  return findings;
}

function check(pages, sections) {
  const findings = [];
  // 의견서 섹션만 검사
  const targets = pages.filter(p => p.section === '의견서');
  for (const page of targets) {
    findings.push(...checkPage(page.text, page.pageNum, page.section));
  }
  return findings;
}

module.exports = { name, description, check };
