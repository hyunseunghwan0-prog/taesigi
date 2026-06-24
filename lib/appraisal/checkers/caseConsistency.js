/**
 * 사례 일치 검토
 * 의견서에 사용된 비교사례(기호·단가)가 위치도에도 동일하게 표시되어 있는지 확인합니다.
 */

const name = '사례 일치 검토';
const description = '의견서의 사례 기호·단가가 위치도와 일치하는지, 사례 수가 동일한지 검토합니다.';

// 사례 기호: ①②③... 또는 사례1, 사례2... 또는 비교사례1
const CASE_SYMBOL_RE = /([①②③④⑤⑥⑦⑧⑨⑩]|사\s*례\s*[\d①②③④⑤]|비교\s*사\s*례\s*\d)/g;

// 사례 기호 뒤에 오는 단가 패턴  예) ① 300,000원/㎡  또는  ① 단가: 300,000
const CASE_UNIT_RE = /([①②③④⑤⑥⑦⑧⑨⑩]|사\s*례\s*\d|비교\s*사\s*례\s*\d)[^\n]{0,60}?([\d,]{4,})\s*원\s*\/?\s*㎡/g;

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

  // 위치도 텍스트가 너무 짧으면 이미지 기반 PDF — 텍스트 비교 불가
  if (mapText.replace(/\s/g, '').length < 100) {
    findings.push({
      checker: name,
      severity: 'info',
      location: '[위치도]',
      message: '위치도가 이미지 형식이거나 텍스트 추출 불가 — 사례 기호 자동 비교를 건너뜁니다.',
      context: null,
    });
    return findings;
  }

  // 1. 사례 수 일치 여부
  const opinionSymbols = extractCaseSymbols(opinionText);
  const mapSymbols = extractCaseSymbols(mapText);

  const onlyInOpinion = [...opinionSymbols].filter(s => !mapSymbols.has(s));
  const onlyInMap = [...mapSymbols].filter(s => !opinionSymbols.has(s));

  if (onlyInOpinion.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례 기호 불일치 — 의견서에만 있음: ${onlyInOpinion.join(', ')}`,
      context: null,
    });
  }
  if (onlyInMap.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례 기호 불일치 — 위치도에만 있음: ${onlyInMap.join(', ')}`,
      context: null,
    });
  }

  // 2. 공통 사례의 단가 일치 여부
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
        context: null,
      });
    }
  }

  // 3. 사례 수 경고 (의견서에 사례 자체가 없는 경우)
  if (opinionSymbols.size === 0) {
    findings.push({
      checker: name,
      severity: 'info',
      location: '[의견서]',
      message: '사례 기호(①②③ 또는 사례1,2,3)를 감지하지 못했습니다. 수동 확인이 필요합니다.',
      context: null,
    });
  }

  return findings;
}

module.exports = { name, description, check };
