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
// finding 객체를 id 기반으로 보관 (onclick 속성에 JSON 넣으면 특수문자 충돌)
const _findings = {};

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

// ── 공부서류 파일 선택 (추가 방식) ────────────────────────────
const gongbuFileList = document.getElementById('gongbuFileList');

dropZoneGongbu.addEventListener('click', () => fileInputGongbu.click());
dropZoneGongbu.addEventListener('dragover', e => { e.preventDefault(); dropZoneGongbu.classList.add('drag-over'); });
dropZoneGongbu.addEventListener('dragleave', () => dropZoneGongbu.classList.remove('drag-over'));
dropZoneGongbu.addEventListener('drop', e => {
  e.preventDefault(); dropZoneGongbu.classList.remove('drag-over');
  addGongbuFiles(Array.from(e.dataTransfer.files));
});
fileInputGongbu.addEventListener('change', () => {
  addGongbuFiles(Array.from(fileInputGongbu.files));
  fileInputGongbu.value = ''; // 같은 파일 재선택 허용
});

function addGongbuFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) return;
  // 중복 파일명 제외하고 추가
  pdfs.forEach(f => {
    if (!selectedGongbuFiles.find(existing => existing.name === f.name)) {
      selectedGongbuFiles.push(f);
    }
  });
  renderGongbuList();
}

function removeGongbuFile(name) {
  selectedGongbuFiles = selectedGongbuFiles.filter(f => f.name !== name);
  renderGongbuList();
}

function renderGongbuList() {
  if (selectedGongbuFiles.length === 0) {
    gongbuFileList.innerHTML = '';
    return;
  }
  gongbuFileList.innerHTML = selectedGongbuFiles.map(f => `
    <div class="gongbu-file-item">
      <span class="gongbu-file-name">📄 ${escHtml(f.name)}</span>
      <button class="gongbu-remove" onclick="removeGongbuFile('${escAttr(f.name)}')">✕</button>
    </div>
  `).join('');
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

  // SSE 스트리밍으로 결과 수신
  const streamResults = [];
  let summary = null;

  try {
    const response = await fetch('/api/appraisal/review', { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || '서버 오류');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    showProgress('서버 연결됨...', 5);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 이벤트 파싱
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 마지막 미완성 줄 보관

      let currentEvent = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              showProgress(data.label, data.pct);
            } else if (currentEvent === 'checkerResult') {
              streamResults.push(data);
            } else if (currentEvent === 'done') {
              summary = data.summary;
            } else if (currentEvent === 'error') {
              throw new Error(data.message);
            }
          } catch (e) {
            if (e.message !== 'Unexpected token') throw e;
          }
          currentEvent = null;
        }
      }
    }

    if (!summary) throw new Error('결과를 받지 못했습니다.');
    showProgress('검토 완료!', 100);
    setTimeout(() => {
      progressWrap.classList.remove('visible');
      renderResults({ summary, results: streamResults });
    }, 300);

  } catch (err) {
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
      const fid = `f_${secName}_${fi}`.replace(/[^a-zA-Z0-9_]/g, '_');
      _findings[fid] = f; // JSON-in-onclick 대신 Map에 보관
      return `
        <div class="finding-item ${f.severity}" id="${fid}">
          <div class="finding-header">
            <span class="severity-tag ${f.severity}">${severityLabel(f.severity)}</span>
            ${f.location ? `<span class="page-tag">${escHtml(f.location)}</span>` : ''}
          </div>
          <div class="finding-message">${escHtml(f.message)}</div>
          ${f.context ? `<div class="finding-context">${escHtml(f.context)}</div>` : ''}
          <div class="feedback-row">
            <span class="fb-label">태식이:</span>
            <button class="fb-btn fb-good" id="${fid}_good" onclick="onCorrect('${fid}')">잘했어 태식아 👍</button>
            <button class="fb-btn fb-bad" id="${fid}_bad" onclick="onFalsePositive('${fid}')">분발해 태식아 💪</button>
            <span id="${fid}_sent" class="fb-sent"></span>
          </div>
          <div class="fp-form" id="${fid}_fp" style="display:none;">
            <div class="fp-form-inner">
              <span class="fp-dog">🐶💦</span>
              <div style="flex:1;">
                <div class="fp-title">태식이가 왜 틀렸나요?</div>
                <textarea class="fp-textarea" id="${fid}_reason" placeholder="예) 해당 페이지는 비교사례가 아니라 대상물건 설명입니다"></textarea>
                <button class="fp-send" id="${fid}_fpbtn" onclick="sendFalsePositive('${fid}')">훈육 완료 →</button>
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

// ── 잘했어 태식아 (정확한 탐지) ─────────────────────────────
async function onCorrect(fid) {
  const finding = _findings[fid];
  if (!finding) return;
  const sentEl = document.getElementById(fid + '_sent');
  const fpForm = document.getElementById(fid + '_fp');
  if (fpForm) fpForm.style.display = 'none';

  const goodBtn = document.getElementById(fid + '_good');
  const badBtn = document.getElementById(fid + '_bad');
  if (goodBtn) { goodBtn.disabled = true; goodBtn.textContent = '저장 중...'; }

  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'correct', checker: finding.checker, finding, fileName: currentFileName }),
    });
    if (goodBtn) { goodBtn.textContent = '✓ 잘했어 태식아 👍'; goodBtn.classList.add('active-correct'); }
    if (badBtn) badBtn.style.display = 'none';
    if (sentEl) { sentEl.textContent = '🦴 태식이가 고마워해요!'; sentEl.className = 'fb-sent fb-sent-ok'; }
    loadAnalyzePanel();
  } catch {
    if (goodBtn) { goodBtn.disabled = false; goodBtn.textContent = '잘했어 태식아 👍'; }
    if (sentEl) { sentEl.textContent = '저장 실패 — 다시 눌러주세요'; sentEl.className = 'fb-sent fb-sent-err'; }
  }
}

// ── 분발해 태식아 (오탐지) - 이유 입력창 토글 ───────────────
function onFalsePositive(fid) {
  const fpForm = document.getElementById(fid + '_fp');
  if (!fpForm) return;
  const isOpen = fpForm.style.display !== 'none';
  fpForm.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // 열릴 때 textarea에 포커스
    const ta = document.getElementById(fid + '_reason');
    if (ta) setTimeout(() => ta.focus(), 50);
  }
}

// ── 오탐지 이유 입력 후 전송 ────────────────────────────────
async function sendFalsePositive(fid) {
  const finding = _findings[fid];
  if (!finding) return;
  const sentEl = document.getElementById(fid + '_sent');
  const sendBtn = document.getElementById(fid + '_fpbtn');
  const reason = document.getElementById(fid + '_reason')?.value.trim() || '';

  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '저장 중...'; }

  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'false_positive', checker: finding.checker, finding, description: reason, fileName: currentFileName }),
    });
    document.getElementById(fid + '_fp').style.display = 'none';
    const badBtn = document.getElementById(fid + '_bad');
    const goodBtn = document.getElementById(fid + '_good');
    if (badBtn) { badBtn.textContent = '✓ 분발해 태식아 💪'; badBtn.classList.add('active-fp'); badBtn.disabled = true; }
    if (goodBtn) goodBtn.style.display = 'none';
    if (sentEl) { sentEl.textContent = '🗞️ 접수됐어요. 태식이가 분발할게요!'; sentEl.className = 'fb-sent fb-sent-ok'; }
    loadAnalyzePanel();
  } catch {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '훈육 완료 →'; }
    if (sentEl) { sentEl.textContent = '저장 실패 — 다시 눌러주세요'; sentEl.className = 'fb-sent fb-sent-err'; }
  }
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
