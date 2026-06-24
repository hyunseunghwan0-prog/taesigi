const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const dropZoneGongbu = document.getElementById('dropZoneGongbu');
const fileInputGongbu = document.getElementById('fileInputGongbu');
const fileNameGongbu = document.getElementById('fileNameGongbu');
const reviewBtn = document.getElementById('reviewBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const resultsEl = document.getElementById('results');
const summaryBar = document.getElementById('summaryBar');
const sectionResults = document.getElementById('sectionResults');
const errorBox = document.getElementById('errorBox');
const feedbackZone = document.getElementById('feedbackZone');
const analyzeBtn = document.getElementById('analyzeBtn');

let selectedFile = null;
let selectedGongbuFiles = [];
let currentFileName = '';

// 섹션 표시 순서
const SECTION_ORDER = ['표지', '괄호감정표', '담보가치총괄표', '의견서', '요항표', '명세표', '위치도', '사진', '기타'];

// ── 감정평가서 파일 선택 ───────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

function setFile(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx') && !name.endsWith('.doc')) {
    showError('PDF 또는 Word(.docx) 파일만 업로드 가능합니다.'); return;
  }
  selectedFile = file;
  currentFileName = file.name;
  fileName.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  reviewBtn.disabled = false;
  clearError();
  resultsEl.classList.remove('visible');
  feedbackZone.style.display = 'none';
}

// ── 공부서류 파일 선택 ─────────────────────────────────────────
dropZoneGongbu.addEventListener('click', () => fileInputGongbu.click());
dropZoneGongbu.addEventListener('dragover', e => { e.preventDefault(); dropZoneGongbu.classList.add('drag-over'); });
dropZoneGongbu.addEventListener('dragleave', () => dropZoneGongbu.classList.remove('drag-over'));
dropZoneGongbu.addEventListener('drop', e => {
  e.preventDefault(); dropZoneGongbu.classList.remove('drag-over');
  setGongbuFiles(Array.from(e.dataTransfer.files));
});
fileInputGongbu.addEventListener('change', () => {
  setGongbuFiles(Array.from(fileInputGongbu.files));
});

function setGongbuFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) return;
  selectedGongbuFiles = pdfs;
  fileNameGongbu.textContent = pdfs.map(f => f.name).join(', ');
}

// ── 검토 시작 ───────────────────────────────────────────────
reviewBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  reviewBtn.disabled = true;
  clearError();
  resultsEl.classList.remove('visible');
  feedbackZone.style.display = 'none';
  showProgress('PDF 업로드 중...', 20);

  const formData = new FormData();
  formData.append('pdf', selectedFile);
  selectedGongbuFiles.forEach(f => formData.append('gongbu', f));

  const PROGRESS_STEPS = [
    [20,  'PDF 텍스트 추출 중...'],
    [35,  '괄호감정표 검토 중...'],
    [50,  '의견서 계산 검산 중...'],
    [62,  '개별요인비교치 검증 중...'],
    [74,  '요항표 · 명세표 교차 확인 중...'],
    [85,  '위치도 사례 일치 확인 중...'],
    [93,  '결과 정리 중...'],
  ];
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    if (stepIdx < PROGRESS_STEPS.length) {
      const [pct, label] = PROGRESS_STEPS[stepIdx++];
      showProgress(label, pct);
    }
  }, 900);

  try {
    const res = await fetch('/api/appraisal/review', { method: 'POST', body: formData });
    clearInterval(stepTimer);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');
    showProgress('검토 완료!', 100);
    setTimeout(() => {
      progressWrap.classList.remove('visible');
      renderResults(data);
    }, 400);
  } catch (err) {
    clearInterval(stepTimer);
    progressWrap.classList.remove('visible');
    showError(err.message);
  } finally {
    reviewBtn.disabled = false;
  }
});

// ── 결과 렌더링 ─────────────────────────────────────────────
function renderResults(data) {
  const { summary, results } = data;

  // 전체 요약 뱃지
  const okMsg = summary.errorCount === 0 && summary.warningCount === 0
    ? `<span class="badge ok">✅ 이상 없음</span>` : '';
  const gongbuBadge = summary.gongbuDocs?.length
    ? `<span class="badge gongbu">📑 공부: ${summary.gongbuDocs.join(' · ')}</span>` : '';
  summaryBar.innerHTML = `
    <span class="badge total">총 ${summary.pages}페이지</span>
    ${summary.errorCount > 0 ? `<span class="badge error">오류 ${summary.errorCount}건</span>` : ''}
    ${summary.warningCount > 0 ? `<span class="badge warning">경고 ${summary.warningCount}건</span>` : ''}
    ${okMsg}
    ${gongbuBadge}
  `;

  // findings를 섹션별로 그룹화
  const allFindings = results.flatMap(r =>
    r.findings.map(f => ({ ...f, checker: r.checker }))
  );
  const sectionMap = groupBySection(allFindings, summary.detectedSections || []);

  // 섹션 순서대로 렌더
  const orderedSections = [
    ...SECTION_ORDER.filter(s => sectionMap[s]),
    ...Object.keys(sectionMap).filter(s => !SECTION_ORDER.includes(s)),
  ];

  sectionResults.innerHTML = orderedSections.map((secName, idx) => {
    const items = sectionMap[secName];
    const errCnt = items.filter(f => f.severity === 'error').length;
    const warnCnt = items.filter(f => f.severity === 'warning').length;
    const infoCnt = items.filter(f => f.severity === 'info').length;

    let pillClass = 'ok', pillText = '이상없음';
    if (errCnt > 0) { pillClass = 'error'; pillText = `오류 ${errCnt}건`; }
    else if (warnCnt > 0) { pillClass = 'warning'; pillText = `경고 ${warnCnt}건`; }
    else if (infoCnt > 0) { pillClass = 'info'; pillText = `확인필요 ${infoCnt}건`; }

    const findingsHtml = items.length === 0 ? '' : items.map((f, fi) => {
      const fid = `f_${secName}_${fi}`;
      return `
        <div class="finding-item ${f.severity}" id="${fid}">
          <div class="finding-header">
            <span class="severity-tag ${f.severity}">${severityLabel(f.severity)}</span>
            ${f.location ? `<span class="page-tag">${escHtml(f.location)}</span>` : ''}
          </div>
          <div class="finding-message">${escHtml(f.message)}</div>
          ${f.context ? `<div class="finding-context">${escHtml(f.context)}</div>` : ''}
          <div class="feedback-row">
            <span class="fb-label">태식이 평가:</span>
            <button class="fb-btn fb-good" onclick="onCorrect('${escAttr(f.checker)}','${fid}',${JSON.stringify(f).replace(/'/g,"\\'")})">🦴 개껌!</button>
            <button class="fb-btn fb-bad" onclick="onFalsePositive('${fid}')">🗞️ 신문지!</button>
            <span id="${fid}_sent" class="fb-sent"></span>
          </div>
          <div class="fp-form" id="${fid}_fp" style="display:none;">
            <div class="fp-form-inner">
              <span class="fp-dog">🐶💦</span>
              <div style="flex:1;">
                <div class="fp-title">태식이가 왜 틀렸나요?</div>
                <textarea class="fp-textarea" id="${fid}_reason" placeholder="예) 해당 페이지는 비교사례가 아니라 대상물건 설명입니다"></textarea>
                <button class="fp-send" onclick="sendFalsePositive('${escAttr(f.checker)}','${fid}',${JSON.stringify(f).replace(/'/g,"\\'")})">훈육 완료 →</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    // 이상없음 섹션은 기본 닫힘, 오류/경고는 기본 열림
    const openClass = (errCnt > 0 || warnCnt > 0) ? 'open' : '';

    return `
      <div class="section-block ${openClass}" id="sec_${idx}">
        <div class="section-header" onclick="toggleSection('sec_${idx}')">
          <div class="section-left">
            <span class="section-name">${escHtml(secName)}</span>
          </div>
          <div class="section-status">
            <span class="status-pill ${pillClass}">${pillText}</span>
            <span class="chevron">▼</span>
          </div>
        </div>
        <div class="section-body">
          ${items.length === 0
            ? '<div style="padding:10px 0;font-size:0.88rem;color:#888;">감지된 항목이 없습니다.</div>'
            : findingsHtml}
        </div>
      </div>`;
  }).join('');

  resultsEl.classList.add('visible');
  feedbackZone.style.display = 'block';
  loadAnalyzePanel();
}

// ── 섹션 그룹화 ─────────────────────────────────────────────
function groupBySection(findings, detectedSections) {
  const map = {};

  // 감지된 섹션은 빈 배열로 초기화 (이상없음 표시용)
  detectedSections.forEach(s => { if (!map[s]) map[s] = []; });

  findings.forEach(f => {
    const loc = f.location || '';
    let sec = '기타';

    for (const s of SECTION_ORDER) {
      if (loc.includes(s)) { sec = s; break; }
    }
    // 의견서↔명세표 같은 교차 항목은 의견서로 분류
    if (loc.includes('↔')) {
      for (const s of SECTION_ORDER) {
        if (loc.includes(s)) { sec = s; break; }
      }
    }

    if (!map[sec]) map[sec] = [];
    map[sec].push(f);
  });

  return map;
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── 개껌 (정확한 탐지) ──────────────────────────────────────
async function onCorrect(checker, fid, finding) {
  const sentEl = document.getElementById(fid + '_sent');
  const fpForm = document.getElementById(fid + '_fp');
  if (fpForm) fpForm.style.display = 'none';
  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'correct', checker, finding, fileName: currentFileName }),
    });
    document.getElementById(fid)?.querySelectorAll('.fb-btn').forEach(b => b.classList.remove('active-correct','active-fp'));
    document.getElementById(fid)?.querySelector('.fb-good')?.classList.add('active-correct');
    if (sentEl) sentEl.textContent = '🦴 냠냠 감사합니다!';
    loadAnalyzePanel();
  } catch { if (sentEl) sentEl.textContent = '저장 실패'; }
}

// ── 신문지 (오탐지) - 이유 입력창 토글 ──────────────────────
function onFalsePositive(fid) {
  const fpForm = document.getElementById(fid + '_fp');
  if (!fpForm) return;
  fpForm.style.display = fpForm.style.display === 'none' ? 'block' : 'none';
}

// ── 신문지 이유 입력 후 전송 ────────────────────────────────
async function sendFalsePositive(checker, fid, finding) {
  const sentEl = document.getElementById(fid + '_sent');
  const reason = document.getElementById(fid + '_reason')?.value.trim() || '';
  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'false_positive', checker, finding, description: reason, fileName: currentFileName }),
    });
    document.getElementById(fid + '_fp').style.display = 'none';
    document.getElementById(fid)?.querySelectorAll('.fb-btn').forEach(b => b.classList.remove('active-correct','active-fp'));
    document.getElementById(fid)?.querySelector('.fb-bad')?.classList.add('active-fp');
    if (sentEl) sentEl.textContent = '🗞️ 태식이가 반성합니다...';
    loadAnalyzePanel();
  } catch { if (sentEl) sentEl.textContent = '저장 실패'; }
}

// ── 놓친 케이스 저장 ────────────────────────────────────────
async function submitMissed() {
  const desc = document.getElementById('missedDesc').value.trim();
  const sentEl = document.getElementById('missedSent');
  if (!desc) { sentEl.textContent = '내용을 입력해주세요.'; return; }
  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'missed', description: desc, fileName: currentFileName }),
    });
    document.getElementById('missedDesc').value = '';
    sentEl.textContent = '✓ 저장됐습니다. 감사합니다!';
    setTimeout(() => { sentEl.textContent = ''; }, 3000);
    loadAnalyzePanel();
  } catch (e) {
    sentEl.textContent = '저장 실패';
  }
}

// ── 분석 패널 로드 ──────────────────────────────────────────
async function loadAnalyzePanel() {
  try {
    const res = await fetch('/api/appraisal/feedback');
    const data = await res.json();
    const { stats } = data;
    const actionable = (stats.byType.missed || 0) + (stats.byType.false_positive || 0);
    document.getElementById('feedbackStats').innerHTML =
      `누적 피드백: 전체 <b>${stats.total}</b>건 (놓친 케이스 <b>${stats.byType.missed || 0}</b>, 오탐지 <b>${stats.byType.false_positive || 0}</b>, 정확 <b>${stats.byType.correct || 0}</b>)`;
    analyzeBtn.disabled = actionable === 0;
    analyzeBtn.textContent = actionable > 0
      ? `AI 패턴 분석 (${actionable}건)` : 'AI 패턴 분석 (피드백 없음)';
  } catch {}
}

// ── AI 분석 요청 ────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '분석 중...';
  const resultEl = document.getElementById('analyzeResult');
  const textEl = document.getElementById('analyzeText');
  const codeEl = document.getElementById('codeProposal');
  resultEl.style.display = 'none';

  try {
    const res = await fetch('/api/appraisal/analyze', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const withoutCode = data.suggestions.replace(/```[\s\S]*?```/g, '[코드 블록 아래 참조]');
    textEl.textContent = withoutCode;
    resultEl.style.display = 'block';
    if (data.proposedCode) {
      document.getElementById('proposedCode').textContent = data.proposedCode;
      codeEl.style.display = 'block';
    } else {
      codeEl.style.display = 'none';
    }
  } catch (err) {
    textEl.textContent = '오류: ' + err.message;
    resultEl.style.display = 'block';
  } finally {
    loadAnalyzePanel();
  }
});

function copyCode() {
  const code = document.getElementById('proposedCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = '복사'; }, 2000);
  });
}

// ── 유틸 ────────────────────────────────────────────────────
function showProgress(label, pct) {
  progressWrap.classList.add('visible');
  progressBar.style.width = pct + '%';
  progressLabel.textContent = label;
}
function showError(msg) { errorBox.innerHTML = `<div class="error-box">⚠️ ${escHtml(msg)}</div>`; }
function clearError() { errorBox.innerHTML = ''; }
function severityLabel(s) { return { error: '오류', warning: '경고', info: '확인필요' }[s] || s; }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return String(str).replace(/'/g, "\\'"); }
