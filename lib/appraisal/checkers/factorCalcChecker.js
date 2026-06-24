/**
 * 개별요인비교치 검산 + 우열세 멘트 일치 검토
 *
 * 실제 한글 PDF 추출 형태:
 *   "1 A 1.00 1.00 1.00 1.03 1.00 1.00 1.030"
 *   "본건은 비교표준지 대비 획지조건(각지 등)에서 우세합니다."
 *
 * 검사 항목:
 *   ① 가로×접근×환경×획지×행정적×기타 = 개별요인비교치
 *   ② 우세/열세 텍스트와 요인치(>1 or <1) 일치 여부
 */

const name = '개별요인비교치 검산';
const description = '6개 요인의 곱셈 검산 및 우세/열세 멘트와 요인치 일치 여부를 확인합니다.';

const FACTOR_NAMES = ['가로', '접근', '환경', '획지', '행정적', '기타'];
const CONDITION_LABELS = {
  '가로':   ['가로조건'],
  '접근':   ['접근조건'],
  '환경':   ['환경조건'],
  '획지':   ['획지조건'],
  '행정적': ['행정적조건'],
  '기타':   ['기타조건'],
};

// 공백 포함 7개 소수 패턴: (번호) (기호) f1 f2 f3 f4 f5 f6 결과
// 예: "1 A 1.00 1.00 1.00 1.03 1.00 1.00 1.030"
const ROW_RE = /\d+\s+[^\s\d]\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;

// 우열세 멘트에서 조건명+우열세 추출
function extractSentiments(text) {
  const sentiments = {};
  // "조건명에서 우세/열세" 패턴을 찾아 우열세 할당
  for (const [key, labels] of Object.entries(CONDITION_LABELS)) {
    for (const label of labels) {
      // label 뒤 60자 이내 우세/열세
      const re = new RegExp(label + '[^.。]{0,60}?(우세|열세)', 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        sentiments[key] = m[1] === '우세' ? 'superior' : 'inferior';
      }
    }
  }
  return sentiments;
}

function check(pages) {
  const findings = [];

  const opPages = pages.filter(p => p.section === '의견서');
  if (opPages.length === 0) return findings;

  // 의견서 전체 텍스트 (공백 정규화)
  const fullText = opPages.map(p => p.text).join('\n');

  // 개별요인 비교치 산정 섹션만 추출
  const sectionIdx = fullText.search(/개별요인\s*비교치\s*산정/);
  if (sectionIdx === -1) return findings;

  // 섹션 시작부터 다음 큰 섹션 전까지
  const nextSection = fullText.search(/그\s*밖의\s*요인\s*보정|거래사례비교법에\s*의한\s*시산가액|공시지가기준법에\s*의한\s*시산가액/);
  const workText = fullText.slice(sectionIdx, nextSection > sectionIdx ? nextSection : sectionIdx + 3000);

  ROW_RE.lastIndex = 0;
  let m;
  while ((m = ROW_RE.exec(workText)) !== null) {
    const factors = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
    const stated = parseFloat(m[7]);

    const product = factors.reduce((acc, v) => acc * v, 1);
    const diff = Math.abs(product - stated);

    const location = '[의견서]';
    const context = m[0].trim();

    // ① 곱셈 검산
    if (diff > 0.0005) {
      findings.push({
        checker: name,
        severity: 'error',
        location,
        message: `개별요인비교치 계산 불일치: ${factors.join(' × ')} = ${product.toFixed(4)} → 기재값 ${stated}`,
        context,
      });
    }

    // ② 우열세 멘트 검사
    // 이 행 뒤 200자 이내에서 멘트 탐색
    const afterMatch = workText.slice(m.index + m[0].length, m.index + m[0].length + 250);
    const sentiments = extractSentiments(afterMatch);

    FACTOR_NAMES.forEach((fname, idx) => {
      const val = factors[idx];
      const sentiment = sentiments[fname];
      if (!sentiment) return;

      const isSuperior = val > 1.0005;
      const isInferior = val < 0.9995;

      if (sentiment === 'superior' && isInferior) {
        findings.push({
          checker: name,
          severity: 'error',
          location,
          message: `${fname}조건: 텍스트 "우세" ↔ 요인치 ${val} (1 미만, 열세여야 함)`,
          context: afterMatch.slice(0, 100).trim(),
        });
      } else if (sentiment === 'inferior' && isSuperior) {
        findings.push({
          checker: name,
          severity: 'error',
          location,
          message: `${fname}조건: 텍스트 "열세" ↔ 요인치 ${val} (1 초과, 우세여야 함)`,
          context: afterMatch.slice(0, 100).trim(),
        });
      }
    });
  }

  return findings;
}

module.exports = { name, description, check };
