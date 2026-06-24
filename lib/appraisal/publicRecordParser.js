'use strict';

// 공부서류 텍스트에서 문서 종류 감지 및 핵심 필드 추출

function compress(t) { return t.replace(/\s+/g, ''); }

function detectDocType(text) {
  const c = compress(text);
  if (c.includes('토지이용계획확인서') || c.includes('토지이용규제기본법') || c.includes('지역지구등지정여부')) return 'toigye';
  if ((c.includes('집합건물') || c.includes('전유부분')) && (c.includes('대장') || c.includes('건축물'))) return 'jiphapdaejang';
  if (c.includes('건축물대장') || c.includes('일반건축물대장') || c.includes('총괄표제부')) return 'geonchukdaejang';
  if (c.includes('토지대장') && !c.includes('등기')) return 'tojidaejang';
  if (c.includes('등기부등본') || c.includes('등기사항전부증명서') || (c.includes('갑구') && c.includes('을구'))) return 'deunggi';
  if (c.includes('지적도')) return 'jijeokdo';
  return 'unknown';
}

const DOC_TYPE_LABEL = {
  toigye: '토지이용계획확인서',
  jiphapdaejang: '집합건물대장',
  geonchukdaejang: '건축물대장',
  tojidaejang: '토지대장',
  deunggi: '등기부등본',
  jijeokdo: '지적도',
  unknown: '알 수 없는 문서',
};

// ── 숫자 추출 유틸 ─────────────────────────────────────────────
function extractNum(str) {
  if (!str) return null;
  const m = str.replace(/,/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// ── 토지대장 파싱 ───────────────────────────────────────────────
function parseTojidaejang(text) {
  const result = { type: 'tojidaejang', 소재지: null, 지목: null, 면적: null, 소유자: null };

  const area = text.match(/면\s*적[^\d]*([\d,]+\.?\d*)\s*㎡/);
  if (area) result.면적 = extractNum(area[1]);

  const jimok = text.match(/지\s*목\s+([가-힣]+)/);
  if (jimok) result.지목 = jimok[1].trim();

  const addr = text.match(/소\s*재\s*지\s+([^\n]+)/);
  if (addr) result.소재지 = addr[1].trim().slice(0, 60);

  const owner = text.match(/성\s*명\s*\(?\s*명\s*칭\s*\)?\s+([^\n]+)/);
  if (owner) result.소유자 = owner[1].trim().slice(0, 30);

  return result;
}

// ── 건축물대장 파싱 ─────────────────────────────────────────────
function parseGeonchukdaejang(text) {
  const result = { type: 'geonchukdaejang', 소재지: null, 주용도: null, 사용승인일: null, 연면적: null, 소유자: null };

  const yondo = text.match(/주\s*용\s*도\s+([^\n]+)/);
  if (yondo) result.주용도 = yondo[1].trim().slice(0, 20);

  const approval = text.match(/사\s*용\s*승\s*인\s*일\s+([\d.년월일\s-]+)/);
  if (approval) result.사용승인일 = approval[1].trim().replace(/\s+/g, '').slice(0, 15);

  // 연면적: 합계 행
  const totalArea = text.match(/연\s*면\s*적[^\d]*([\d,]+\.?\d*)\s*㎡/);
  if (totalArea) result.연면적 = extractNum(totalArea[1]);

  const addr = text.match(/소\s*재\s*지\s+([^\n]+)/);
  if (addr) result.소재지 = addr[1].trim().slice(0, 60);

  const owner = text.match(/성\s*명\s*\(?\s*명\s*칭\s*\)?\s+([^\n]+)/);
  if (owner) result.소유자 = owner[1].trim().slice(0, 30);

  return result;
}

// ── 집합건물대장 파싱 ───────────────────────────────────────────
function parseJiphapdaejang(text) {
  const result = { type: 'jiphapdaejang', 소재지: null, 주용도: null, 사용승인일: null, 전유면적: null, 소유자: null };

  const yondo = text.match(/주\s*용\s*도\s+([^\n]+)/);
  if (yondo) result.주용도 = yondo[1].trim().slice(0, 20);

  const approval = text.match(/사\s*용\s*승\s*인\s*일\s+([\d.년월일\s-]+)/);
  if (approval) result.사용승인일 = approval[1].trim().replace(/\s+/g, '').slice(0, 15);

  const junyuArea = text.match(/전\s*유\s*부\s*분[^㎡]*([\d,]+\.?\d*)\s*㎡/);
  if (junyuArea) result.전유면적 = extractNum(junyuArea[1]);

  const addr = text.match(/소\s*재\s*지\s+([^\n]+)/);
  if (addr) result.소재지 = addr[1].trim().slice(0, 60);

  const owner = text.match(/성\s*명\s*\(?\s*명\s*칭\s*\)?\s+([^\n]+)/);
  if (owner) result.소유자 = owner[1].trim().slice(0, 30);

  return result;
}

// ── 등기부등본 파싱 ─────────────────────────────────────────────
function parseDeunggi(text) {
  const result = { type: 'deunggi', 소재지: null, 소유자: null, 면적: null, 대지권: null, 권리관계: [] };

  // 소유자 (갑구 최신 소유권이전)
  const ownerMatches = [...text.matchAll(/소\s*유\s*권\s*이\s*전[^\n]*\n[^\n]*등\s*기\s*원\s*인[^\n]*\n[^\n]*소\s*유\s*자\s+([^\n]+)/g)];
  if (ownerMatches.length > 0) {
    result.소유자 = ownerMatches[ownerMatches.length - 1][1].trim().slice(0, 30);
  } else {
    const ownerSimple = text.match(/소\s*유\s*자\s+([^\n가-힣]{0,3}[가-힣]+[^\n]{0,20})/);
    if (ownerSimple) result.소유자 = ownerSimple[1].trim().slice(0, 30);
  }

  // 면적
  const area = text.match(/면\s*적\s+([\d,]+\.?\d*)\s*㎡/);
  if (area) result.면적 = extractNum(area[1]);

  // 대지권 (집합건물)
  const daejikwon = text.match(/대\s*지\s*권\s*비\s*율[^\d]*([\d/]+)/);
  if (daejikwon) result.대지권 = daejikwon[1].trim();

  // 을구 권리관계
  if (/근\s*저\s*당/.test(text)) result.권리관계.push('근저당');
  if (/가\s*압\s*류/.test(text)) result.권리관계.push('가압류');
  if (/가\s*처\s*분/.test(text)) result.권리관계.push('가처분');
  if (/전\s*세\s*권/.test(text)) result.권리관계.push('전세권');

  return result;
}

// ── 토지이용계획확인서 파싱 ─────────────────────────────────────
function parseToigye(text) {
  const result = { type: 'toigye', 소재지: null, 용도지역: null, 용도지구: null, 기타제한: [] };

  const addr = text.match(/소\s*재\s*지\s+([^\n]+)/);
  if (addr) result.소재지 = addr[1].trim().slice(0, 60);

  // 용도지역
  const zones = [];
  const zonePatterns = [
    /제\s*[1-3]\s*종\s*[일반전용]\s*주거지역/g,
    /준\s*주거지역/g, /상업지역/g, /공업지역/g,
    /녹지지역/g, /관리지역/g, /농림지역/g,
    /자연환경보전지역/g,
    /[가-힣]+지역/g,
  ];
  for (const pat of zonePatterns) {
    for (const m of text.matchAll(pat)) {
      const z = m[0].replace(/\s+/g, '');
      if (!zones.includes(z) && z.length < 15) zones.push(z);
    }
    if (zones.length >= 3) break;
  }
  if (zones.length > 0) result.용도지역 = zones.slice(0, 3).join(', ');

  // 용도지구
  const jigu = text.match(/용\s*도\s*지\s*구\s+([^\n]+)/);
  if (jigu) result.용도지구 = jigu[1].trim().slice(0, 40);

  return result;
}

// ── 메인 파서 ───────────────────────────────────────────────────
function parsePublicRecord(text) {
  const docType = detectDocType(text);
  let parsed;
  switch (docType) {
    case 'tojidaejang':      parsed = parseTojidaejang(text); break;
    case 'geonchukdaejang':  parsed = parseGeonchukdaejang(text); break;
    case 'jiphapdaejang':    parsed = parseJiphapdaejang(text); break;
    case 'deunggi':          parsed = parseDeunggi(text); break;
    case 'toigye':           parsed = parseToigye(text); break;
    default:                 parsed = { type: docType };
  }
  parsed.label = DOC_TYPE_LABEL[docType] || docType;
  return parsed;
}

module.exports = { parsePublicRecord, DOC_TYPE_LABEL };
