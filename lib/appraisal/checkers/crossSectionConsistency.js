/**
 * 섹션 간 수치 일치 검토
 * 의견서에 기재된 주요 수치(면적·단가·감정평가액)가
 * 괄호감정표·요항표·명세표에서도 동일하게 기재되어 있는지 확인합니다.
 */

const name = '섹션 간 수치 일치';
const description = '의견서의 면적·단가·감정평가액이 괄호감정표·요항표·명세표와 일치하는지 검토합니다.';

// 추출할 항목 정의
const FIELDS = [
  {
    label: '대지면적',
    regexes: [
      /대지\s*면적\s*[:：]?\s*([\d,]+\.?\d*)\s*㎡?/g,
      /토지\s*면적\s*[:：]?\s*([\d,]+\.?\d*)\s*㎡?/g,
    ],
  },
  {
    label: '건물면적',
    regexes: [
      /건물\s*면적\s*[:：]?\s*([\d,]+\.?\d*)\s*㎡?/g,
      /연\s*면적\s*[:：]?\s*([\d,]+\.?\d*)\s*㎡?/g,
    ],
  },
  {
    label: '감정평가액',
    regexes: [
      /감정\s*평가\s*액\s*[:：\(]?\s*([\d,]+)\s*원?/g,
      /평가\s*금액\s*[:：]?\s*([\d,]+)\s*원?/g,
    ],
  },
  {
    label: '단가',
    regexes: [
      /단\s*가\s*[:：]?\s*([\d,]+)\s*(?:원\/㎡|원)?/g,
    ],
  },
  {
    label: '기준시점',
    regexes: [
      /기준\s*시점\s*[:：]?\s*(\d{4}[\.\-년]\s*\d{1,2}[\.\-월]\s*\d{1,2}일?)/g,
    ],
  },
];

const COMPARE_SECTIONS = ['괄호감정표', '요항표', '명세표'];

function normalize(val) {
  return val.replace(/\s/g, '').replace(/,/g, '');
}

function extractFromText(text, field) {
  const values = new Set();
  for (const regex of field.regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      values.add(normalize(match[1]));
    }
  }
  return values;
}

function check(pages) {
  const findings = [];

  // 섹션별 텍스트 합산
  const sectionTexts = {};
  for (const page of pages) {
    if (!sectionTexts[page.section]) sectionTexts[page.section] = '';
    sectionTexts[page.section] += '\n' + page.text;
  }

  const opinionText = sectionTexts['의견서'] || '';
  if (!opinionText.trim()) return findings;

  for (const field of FIELDS) {
    const opinionVals = extractFromText(opinionText, field);
    if (opinionVals.size === 0) continue;

    for (const targetSection of COMPARE_SECTIONS) {
      const targetText = sectionTexts[targetSection] || '';
      if (!targetText.trim()) continue;

      const targetVals = extractFromText(targetText, field);
      if (targetVals.size === 0) continue;

      // 교집합이 없으면 불일치
      const shared = [...opinionVals].filter(v => targetVals.has(v));
      if (shared.length === 0) {
        findings.push({
          checker: name,
          severity: 'error',
          location: `[의견서 ↔ ${targetSection}]`,
          message: `[${field.label}] 수치 불일치 — 의견서: ${[...opinionVals].join(', ')} / ${targetSection}: ${[...targetVals].join(', ')}`,
          context: null,
        });
      }
    }
  }

  return findings;
}

module.exports = { name, description, check };
