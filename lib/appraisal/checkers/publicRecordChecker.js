'use strict';

const name = '공부서류 대조';
const description = '토지대장·건축물대장·등기·토이계와 감정평가서 수치 비교';

// 숫자 비교 허용 오차 (1㎡ 이하 or 0.1%)
function areaMatch(a, b) {
  if (a == null || b == null) return true;
  const diff = Math.abs(a - b);
  return diff <= 1 || diff / Math.max(a, b) < 0.001;
}

function compress(t) { return String(t).replace(/\s+/g, ''); }

// 감정서 텍스트에서 핵심 수치 추출
function extractAppraisalFields(pages) {
  const fullText = pages.map(p => p.text).join('\n');

  // 대지면적
  const landArea = fullText.match(/대\s*지\s*면\s*적\s*[:\s]*([\d,]+\.?\d*)\s*㎡/);
  // 건물면적/연면적
  const bldgArea = fullText.match(/연\s*면\s*적\s*[:\s]*([\d,]+\.?\d*)\s*㎡/) ||
                   fullText.match(/건\s*물\s*면\s*적\s*[:\s]*([\d,]+\.?\d*)\s*㎡/);
  // 소유자
  const owner = fullText.match(/소\s*유\s*자\s*[:\s]*([^\n,（(]+)/);
  // 용도지역
  const zone = fullText.match(/용\s*도\s*지\s*역\s*[:\s]*([^\n,）)]+)/);
  // 지목
  const jimok = fullText.match(/지\s*목\s*[:\s]*([가-힣]+)/);
  // 사용승인일
  const approval = fullText.match(/사\s*용\s*승\s*인\s*일\s*[:\s]*([\d.년월일-]+)/);

  return {
    대지면적: landArea ? parseFloat(landArea[1].replace(/,/g, '')) : null,
    건물면적: bldgArea ? parseFloat(bldgArea[1].replace(/,/g, '')) : null,
    소유자: owner ? owner[1].trim().slice(0, 30) : null,
    용도지역: zone ? zone[1].trim().slice(0, 30) : null,
    지목: jimok ? jimok[1].trim() : null,
    사용승인일: approval ? approval[1].trim().slice(0, 15) : null,
  };
}

function check(pages, publicRecords) {
  const findings = [];
  if (!publicRecords || publicRecords.length === 0) return findings;

  const appraisal = extractAppraisalFields(pages);

  // 대장류와 등기 면적 불일치 체크 (대장 우선)
  const daejangTypes = ['tojidaejang', 'geonchukdaejang', 'jiphapdaejang'];
  const daejangDocs = publicRecords.filter(r => daejangTypes.includes(r.type));
  const deunggiDocs = publicRecords.filter(r => r.type === 'deunggi');

  // 면적 비교: 대장 vs 등기
  daejangDocs.forEach(daejang => {
    const daejangArea = daejang.면적 || daejang.연면적 || daejang.전유면적;
    const deunggi = deunggiDocs[0];
    if (daejangArea && deunggi?.면적 && !areaMatch(daejangArea, deunggi.면적)) {
      findings.push({
        checker: name,
        severity: 'info',
        location: `[${daejang.label} ↔ 등기부등본]`,
        message: `대장 면적(${daejangArea}㎡)과 등기 면적(${deunggi.면적}㎡)이 다릅니다. 대장 수치가 우선합니다.`,
      });
    }
  });

  // 대지면적: 감정서 vs 토지대장
  const tojidaejang = publicRecords.find(r => r.type === 'tojidaejang');
  if (tojidaejang?.면적 && appraisal.대지면적) {
    if (!areaMatch(tojidaejang.면적, appraisal.대지면적)) {
      findings.push({
        checker: name,
        severity: 'error',
        location: '[의견서 ↔ 토지대장]',
        message: `대지면적 불일치: 감정서 ${appraisal.대지면적}㎡ / 토지대장 ${tojidaejang.면적}㎡ (차이 ${Math.abs(appraisal.대지면적 - tojidaejang.면적).toFixed(1)}㎡)`,
      });
    } else {
      findings.push({
        checker: name,
        severity: 'info',
        location: '[의견서 ↔ 토지대장]',
        message: `대지면적 일치: ${tojidaejang.면적}㎡`,
      });
    }
  }

  // 건물면적: 감정서 vs 건축물대장/집합건물대장
  const bldgDaejang = publicRecords.find(r => r.type === 'geonchukdaejang' || r.type === 'jiphapdaejang');
  const bldgAreaDaejang = bldgDaejang?.연면적 || bldgDaejang?.전유면적;
  if (bldgAreaDaejang && appraisal.건물면적) {
    if (!areaMatch(bldgAreaDaejang, appraisal.건물면적)) {
      findings.push({
        checker: name,
        severity: 'error',
        location: `[의견서 ↔ ${bldgDaejang.label}]`,
        message: `건물면적 불일치: 감정서 ${appraisal.건물면적}㎡ / 대장 ${bldgAreaDaejang}㎡ (차이 ${Math.abs(appraisal.건물면적 - bldgAreaDaejang).toFixed(1)}㎡)`,
      });
    } else {
      findings.push({
        checker: name,
        severity: 'info',
        location: `[의견서 ↔ ${bldgDaejang.label}]`,
        message: `건물면적 일치: ${bldgAreaDaejang}㎡`,
      });
    }
  }

  // 용도지역: 감정서 vs 토이계
  const toigye = publicRecords.find(r => r.type === 'toigye');
  if (toigye?.용도지역 && appraisal.용도지역) {
    const toigyeZone = compress(toigye.용도지역);
    const apprZone = compress(appraisal.용도지역);
    if (!toigyeZone.includes(apprZone) && !apprZone.includes(toigyeZone)) {
      findings.push({
        checker: name,
        severity: 'error',
        location: '[의견서 ↔ 토지이용계획확인서]',
        message: `용도지역 불일치: 감정서 "${appraisal.용도지역}" / 토이계 "${toigye.용도지역}"`,
      });
    } else {
      findings.push({
        checker: name,
        severity: 'info',
        location: '[의견서 ↔ 토지이용계획확인서]',
        message: `용도지역 일치: ${toigye.용도지역}`,
      });
    }
  }

  // 지목: 감정서 vs 토지대장
  if (tojidaejang?.지목 && appraisal.지목) {
    if (compress(tojidaejang.지목) !== compress(appraisal.지목)) {
      findings.push({
        checker: name,
        severity: 'warning',
        location: '[의견서 ↔ 토지대장]',
        message: `지목 불일치: 감정서 "${appraisal.지목}" / 토지대장 "${tojidaejang.지목}"`,
      });
    }
  }

  // 소유자: 감정서 vs 등기
  if (deunggiDocs[0]?.소유자 && appraisal.소유자) {
    const a = compress(deunggiDocs[0].소유자).slice(0, 6);
    const b = compress(appraisal.소유자).slice(0, 6);
    if (a && b && !a.includes(b) && !b.includes(a)) {
      findings.push({
        checker: name,
        severity: 'warning',
        location: '[의견서 ↔ 등기부등본]',
        message: `소유자 불일치: 감정서 "${appraisal.소유자}" / 등기 "${deunggiDocs[0].소유자}"`,
      });
    }
  }

  // 등기 권리관계 알림
  if (deunggiDocs[0]?.권리관계?.length > 0) {
    findings.push({
      checker: name,
      severity: 'info',
      location: '[등기부등본]',
      message: `을구 권리관계 확인: ${deunggiDocs[0].권리관계.join(', ')} 설정되어 있음`,
    });
  }

  // 사용승인일: 감정서 vs 대장
  if (bldgDaejang?.사용승인일 && appraisal.사용승인일) {
    const a = compress(bldgDaejang.사용승인일).replace(/[년월일]/g, '.').replace(/\.+/g, '.');
    const b = compress(appraisal.사용승인일).replace(/[년월일]/g, '.').replace(/\.+/g, '.');
    if (a !== b && !a.startsWith(b.slice(0, 6)) && !b.startsWith(a.slice(0, 6))) {
      findings.push({
        checker: name,
        severity: 'warning',
        location: `[의견서 ↔ ${bldgDaejang.label}]`,
        message: `사용승인일 불일치: 감정서 "${appraisal.사용승인일}" / 대장 "${bldgDaejang.사용승인일}"`,
      });
    }
  }

  return findings;
}

module.exports = { name, description, check };
