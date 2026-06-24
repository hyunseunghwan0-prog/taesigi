/**
 * 사례 일치 검토
 * 의견서에 사용된 비교사례(기호·단가)가 위치도에도 동일하게 표시되어 있는지 확인합니다.
 */

const name = '사례 일치 검토';
const description = '의견서의 사례 기호·단가가 위치도와 일치하는지, 사례 수가 동일한지 검토합니다.';

// 사례 기호: ①~⑩(원문자), ㉠~㉩(괄호형), 사례N, 비교사례N, 사-N 등
const CASE_SYMBOL_RE = /([①②③④⑤⑥⑦⑧⑨⑩]|[㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩]|[ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ]|사\s*례\s*[-\s]?\s*\d+|비교\s*사\s*례\s*\d+|비교\s*\d+|사\s*-\s*\d+)/g;

// 사례 기호 뒤에 오는 단가 패턴
const CASE_UNIT_RE = /([①②③④⑤⑥⑦⑧⑨⑩]|[㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩]|사\s*례\s*[-\s]?\s*\d+|비교\s*사\s*례\s*\d+)[^\n]{0,80}?([\d,]{4,})\s*원\s*\/?\s*㎡/g;

function normalize(val) {
  return val.replace(/\s/g, '');
}

function extractCaseSymbols(text) {
  const symbols = new Set();
  CASE_SYMBOL_RE.lastIndex = 0;
  let match;
  while ((match = CASE_SYMBOL_RE.exec(text)) !== null) {
    symbols.add(normalize(match[1]));
  }
  return symbols;
}

function extractCaseUnits(text) {
  // { 기호 → Set<단가문자열> }
  const map = {};
  CASE_UNIT_RE.lastIndex = 0;
  let match;
  while ((match = CASE_UNIT_RE.exec(text)) !== null) {
    const symbol = normalize(match[1]);
    const price = match[2].replace(/,/g, '');
    if (!map[symbol]) map[symbol] = new Set();
    map[symbol].add(price);
  }
  return map;
}

function check(pages) {
  const findings = [];

  const sectionTexts = {};
  for (const page of pages) {
    if (!sectionTexts[page.section]) sectionTexts[page.section] = '';
    sectionTexts[page.section] += '\n' + page.text;
  }

  const opinionText = sectionTexts['의견서'] || '';
  const mapText = sectionTexts['위치도'] || '';

  if (!opinionText.trim()) return findings;

  const opinionSymbols = extractCaseSymbols(opinionText);

  // 의견서에 사례기호가 아예 없으면 조용히 종료
  if (opinionSymbols.size === 0) return findings;

  // 위치도 텍스트가 없거나 짧으면 → 이미지 기반, 비교 불가
  const mapTextLen = mapText.replace(/\s/g, '').length;
  if (mapTextLen < 100) {
    findings.push({
      checker: name,
      severity: 'info',
      location: '[위치도]',
      message: `위치도가 이미지 형식 — 사례기호(${[...opinionSymbols].join(', ')}) 자동 대조 불가. 수동 확인 필요.`,
    });
    return findings;
  }

  const mapSymbols = extractCaseSymbols(mapText);

  // 위치도에 텍스트는 있지만 사례기호가 없는 경우
  if (mapSymbols.size === 0) {
    // 위치도 앞 300자를 context에 노출 → 어떤 텍스트가 추출됐는지 확인용
    const preview = mapText.replace(/\s+/g, ' ').trim().slice(0, 300);
    findings.push({
      checker: name,
      severity: 'info',
      location: '[위치도]',
      message: `위치도에서 사례기호를 읽지 못했습니다 (의견서 기호: ${[...opinionSymbols].join(', ')}) — 수동 확인 필요.`,
      context: preview ? `위치도 추출 텍스트(앞부분): ${preview}` : '(추출된 텍스트 없음)',
    });
    return findings;
  }

  // 양쪽에서 기호를 읽었을 때만 불일치 비교 (error)
  const onlyInOpinion = [...opinionSymbols].filter(s => !mapSymbols.has(s));
  const onlyInMap = [...mapSymbols].filter(s => !opinionSymbols.has(s));

  if (onlyInOpinion.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례기호 불일치 — 의견서에만 있음: ${onlyInOpinion.join(', ')} (위치도에 없음)`,
    });
  }
  if (onlyInMap.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례기호 불일치 — 위치도에만 있음: ${onlyInMap.join(', ')} (의견서에 없음)`,
    });
  }

  // 공통 사례 단가 일치 여부
  const opinionUnits = extractCaseUnits(opinionText);
  const mapUnits = extractCaseUnits(mapText);
  const commonSymbols = [...opinionSymbols].filter(s => mapSymbols.has(s));

  for (const symbol of commonSymbols) {
    const oPrices = opinionUnits[symbol];
    const mPrices = mapUnits[symbol];
    if (!oPrices || !mPrices) continue;
    const shared = [...oPrices].filter(p => mPrices.has(p));
    if (shared.length === 0) {
      findings.push({
        checker: name,
        severity: 'error',
        location: '[의견서 ↔ 위치도]',
        message: `사례 ${symbol} 단가 불일치 — 의견서: ${[...oPrices].map(p => Number(p).toLocaleString()).join('/')}원/㎡ / 위치도: ${[...mPrices].map(p => Number(p).toLocaleString()).join('/')}원/㎡`,
      });
    }
  }

  return findings;
}

module.exports = { name, description, check };
