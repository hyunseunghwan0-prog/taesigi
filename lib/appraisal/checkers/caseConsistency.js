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
    const key = page.section;
    if (!sectionTexts[key]) sectionTexts[key] = '';
    sectionTexts[key] += '\n' + page.text;
  }

  const opinionText = sectionTexts['의견서'] || '';
  // 위치도 + 상세위치도 모두 합산
  const mapText = (sectionTexts['위치도'] || '') + '\n' + (sectionTexts['상세위치도'] || '');

  if (!opinionText.trim()) return findings;

  const opinionSymbols = extractCaseSymbols(opinionText);
  if (opinionSymbols.size === 0) return findings;

  // 위치도에서 추출한 말풍선 텍스트를 그대로 보여줌 + 기호 자동 대조 시도
  const mapSymbols = extractCaseSymbols(mapText);
  const mapPreview = mapText.replace(/\s+/g, ' ').trim().slice(0, 600);

  if (mapSymbols.size === 0) {
    // 자동 대조 불가 — 추출된 텍스트 전체를 펼쳐서 수동 확인
    findings.push({
      checker: name,
      severity: 'info',
      location: '[의견서 ↔ 위치도]',
      message: `의견서 사례기호: ${[...opinionSymbols].join(', ')} — 위치도 자동 대조 불가, 수동 확인 필요`,
      context: mapPreview
        ? `위치도 추출 텍스트 ▼\n${mapPreview}`
        : '위치도에서 텍스트를 추출하지 못했습니다 (이미지 형식)',
    });
    return findings;
  }

  // 자동 대조 가능한 경우
  const onlyInOpinion = [...opinionSymbols].filter(s => !mapSymbols.has(s));
  const onlyInMap    = [...mapSymbols].filter(s => !opinionSymbols.has(s));

  if (onlyInOpinion.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례기호 불일치 — 의견서에만 있음: ${onlyInOpinion.join(', ')}`,
      context: mapPreview ? `위치도 추출 텍스트 ▼\n${mapPreview}` : undefined,
    });
  }
  if (onlyInMap.length > 0) {
    findings.push({
      checker: name,
      severity: 'error',
      location: '[의견서 ↔ 위치도]',
      message: `사례기호 불일치 — 위치도에만 있음: ${onlyInMap.join(', ')}`,
    });
  }
  if (onlyInOpinion.length === 0 && onlyInMap.length === 0) {
    // 일치 — 단가 비교
    const opinionUnits = extractCaseUnits(opinionText);
    const mapUnits     = extractCaseUnits(mapText);
    for (const symbol of opinionSymbols) {
      const oP = opinionUnits[symbol];
      const mP = mapUnits[symbol];
      if (!oP || !mP) continue;
      if (![...oP].some(p => mP.has(p))) {
        findings.push({
          checker: name,
          severity: 'error',
          location: '[의견서 ↔ 위치도]',
          message: `사례 ${symbol} 단가 불일치 — 의견서: ${[...oP].map(p => Number(p).toLocaleString()).join('/')}원/㎡ / 위치도: ${[...mP].map(p => Number(p).toLocaleString()).join('/')}원/㎡`,
        });
      }
    }
  }

  return findings;
}

module.exports = { name, description, check };
