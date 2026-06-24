const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const fileName      = document.getElementById('fileName');
const dropZoneGongbu = document.getElementById('dropZoneGongbu');
const fileInputGongbu = document.getElementById('fileInputGongbu');
const reviewBtn     = document.getElementById('reviewBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const resultsEl     = document.getElementById('results');
const summaryBar    = document.getElementById('summaryBar');
const sectionResults = document.getElementById('sectionResults');
const errorBox      = document.getElementById('errorBox');
const feedbackZone  = document.getElementById('feedbackZone');
const gongbuFileList = document.getElementById('gongbuFileList');

let selectedFile = null;
let selectedGongbuFiles = [];
let currentFileName = '';

// finding 객체 저장소: data-fid로 참조 (onclick에 JSON 넣으면 따옴표 충돌)
const _findings = {};
let _fid = 0;

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
dropZoneGongbu.addEventListener('click', () => fileInputGongbu.click());
dropZoneGongbu.addEventListener('dragover', e => { e.preventDefault(); dropZoneGongbu.classList.add('drag-over'); });
dropZoneGongbu.addEventListener('dragleave', () => dropZoneGongbu.classList.remove('drag-over'));
dropZoneGongbu.addEventListener('drop', e => {
  e.preventDefault(); dropZoneGongbu.classList.remove('drag-over');
  addGongbuFiles(Array.from(e.dataTransfer.files));
});
fileInputGongbu.addEventListener('change', () => {
  addGongbuFiles(Array.from(fileInputGongbu.files));
  fileInputGongbu.value = '';
});

function addGongbuFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  pdfs.forEach(f => {
    if (!selectedGongbuFiles.find(x => x.name === f.name)) selectedGongbuFiles.push(f);
  });
  renderGongbuList();
}

function removeGongbuFile(name) {
  selectedGongbuFiles = selectedGongbuFiles.filter(f => f.name !== name);
  renderGongbuList();
}

function renderGongbuList() {
  if (selectedGongbuFiles.length === 0) { gongbuFileList.innerHTML = ''; return; }
  gongbuFileList.innerHTML = selectedGongbuFiles.map(f => `
    <div class="gongbu-file-item">
      <span class="gongbu-file-name">📄 ${escHtml(f.name)}</span>
      <button class="gongbu-remove" data-action="remove-gongbu" data-name="${escAttr(f.name)}">✕</button>
    </div>
  `).join('');
}

gongbuFileList.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="remove-gongbu"]');
  if (btn) removeGongbuFile(btn.dataset.name);
});

// ── 검토 시작 ────────────────────────────────────────────────
reviewBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  reviewBtn.disabled = true;
  clearError();
  resultsEl.classList.remove('visible');
  feedbackZone.style.display = 'none';
  showProgress('PDF 업로드 중...', 5);

  const formData = new FormData();
  formData.append('pdf', selectedFile);
  selectedGongbuFiles.forEach(f => formData.append('gongbu', f));

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
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop();

      let evt = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          evt = line.slice(7).trim();
        } else if (line.startsWith('data: ') && evt) {
          try {
            const data = JSON.parse(line.slice(6));
            if (evt === 'progress')       showProgress(data.label, data.pct);
            else if (evt === 'checkerResult') streamResults.push(data);
            else if (evt === 'done')      summary = data.summary;
            else if (evt === 'error')     throw new Error(data.message);
          } catch (e) { if (e.message !== 'Unexpected token') throw e; }
          evt = null;
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
  Object.keys(_findings).forEach(k => delete _findings[k]);
  _fid = 0;

  const { summary, results } = data;

  const okMsg = summary.errorCount === 0 && summary.warningCount === 0
    ? `<span class="badge ok">✅ 이상 없음</span>` : '';
  const gongbuBadge = summary.gongbuDocs?.length
    ? `<span class="badge gongbu">📑 공부: ${summary.gongbuDocs.join(' · ')}</span>` : '';
  summaryBar.innerHTML = `
    <span class="badge total">총 ${summary.pages}페이지</span>
    ${summary.errorCount  > 0 ? `<span class="badge error">오류 ${summary.errorCount}건</span>` : ''}
    ${summary.warningCount > 0 ? `<span class="badge warning">경고 ${summary.warningCount}건</span>` : ''}
    ${okMsg}${gongbuBadge}
  `;

  const allFindings = results.flatMap(r => r.findings.map(f => ({ ...f, checker: r.checker })));
  const sectionMap  = groupBySection(allFindings, summary.detectedSections || []);
  const ordered     = [
    ...SECTION_ORDER.filter(s => sectionMap[s]),
    ...Object.keys(sectionMap).filter(s => !SECTION_ORDER.includes(s)),
  ];

  sectionResults.innerHTML = ordered.map((secName, idx) => {
    const items    = sectionMap[secName];
    const errCnt   = items.filter(f => f.severity === 'error').length;
    const warnCnt  = items.filter(f => f.severity === 'warning').length;
    const infoCnt  = items.filter(f => f.severity === 'info').length;

    let pillClass = 'ok', pillText = '이상없음';
    if (errCnt > 0)       { pillClass = 'error';   pillText = `오류 ${errCnt}건`; }
    else if (warnCnt > 0) { pillClass = 'warning'; pillText = `경고 ${warnCnt}건`; }
    else if (infoCnt > 0) { pillClass = 'info';    pillText = `확인필요 ${infoCnt}건`; }

    const findingsHtml = items.map(f => {
      const fid = `f${_fid++}`;
      _findings[fid] = f;
      return `
        <div class="finding-item ${f.severity}" id="${fid}">
          <div class="finding-header">
            <span class="severity-tag ${f.severity}">${severityLabel(f.severity)}</span>
            ${f.location ? `<span class="page-tag">${escHtml(f.location)}</span>` : ''}
          </div>
          <div class="finding-message">${escHtml(f.message)}</div>
          ${f.context ? `<div class="finding-context">${escHtml(f.context)}</div>` : ''}
          <div class="feedback-row">
            <img src="taesigi_logo.png" class="fb-dog-icon" alt="" />
            <button class="fb-btn fb-good" data-action="correct" data-fid="${fid}">잘했어 태식아 🦴</button>
            <button class="fb-btn fb-bad"  data-action="fp-toggle" data-fid="${fid}">분발해 태식아 🗞️</button>
            <span class="fb-sent" id="${fid}_sent"></span>
          </div>
          <div class="fp-form" id="${fid}_fp" style="display:none;">
            <div class="fp-form-inner">
              <img src="taesigi_logo.png" class="fp-dog-img" alt="태식이" />
              <div style="flex:1;">
                <div class="fp-title">어디가 틀렸나요?</div>
                <textarea class="fp-textarea" id="${fid}_reason" placeholder="예) 해당 페이지는 비교사례가 아니라 대상물건 설명입니다"></textarea>
                <button class="fp-send" data-action="fp-send" data-fid="${fid}">훈육 완료 →</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    const openClass = (errCnt > 0 || warnCnt > 0) ? 'open' : '';
    return `
      <div class="section-block ${openClass}" id="sec_${idx}">
        <div class="section-header" data-action="toggle-section" data-target="sec_${idx}">
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
            ? '<div class="no-findings">감지된 항목이 없습니다.</div>'
            : findingsHtml}
        </div>
      </div>`;
  }).join('');

  resultsEl.classList.add('visible');
  feedbackZone.style.display = 'block';
}

// ── 이벤트 위임: sectionResults 전체 ─────────────────────────
sectionResults.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const fid    = btn.dataset.fid;

  if (action === 'toggle-section') {
    document.getElementById(btn.dataset.target)?.classList.toggle('open');

  } else if (action === 'correct') {
    const finding = _findings[fid];
    if (!finding) return;
    const sentEl  = document.getElementById(fid + '_sent');
    const goodBtn = btn;
    const badBtn  = document.querySelector(`#${fid} [data-action="fp-toggle"]`);
    const fpForm  = document.getElementById(fid + '_fp');
    if (fpForm) fpForm.style.display = 'none';
    goodBtn.disabled = true; goodBtn.textContent = '저장 중...';
    try {
      await fetch('/api/appraisal/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'correct', checker: finding.checker, finding, fileName: currentFileName }),
      });
      goodBtn.textContent = '✓ 잘했어 태식아 🦴';
      goodBtn.classList.add('active-correct');
      if (badBtn) badBtn.style.display = 'none';
      if (sentEl) { sentEl.textContent = '태식이가 고마워해요!'; sentEl.className = 'fb-sent fb-sent-ok'; }
    } catch {
      goodBtn.disabled = false; goodBtn.textContent = '잘했어 태식아 🦴';
      if (sentEl) { sentEl.textContent = '저장 실패 — 다시 눌러주세요'; sentEl.className = 'fb-sent fb-sent-err'; }
    }

  } else if (action === 'fp-toggle') {
    const fpForm = document.getElementById(fid + '_fp');
    if (!fpForm) return;
    const opening = fpForm.style.display === 'none';
    fpForm.style.display = opening ? 'block' : 'none';
    if (opening) setTimeout(() => document.getElementById(fid + '_reason')?.focus(), 50);

  } else if (action === 'fp-send') {
    const finding = _findings[fid];
    if (!finding) return;
    const sentEl  = document.getElementById(fid + '_sent');
    const reason  = document.getElementById(fid + '_reason')?.value.trim() || '';
    btn.disabled = true; btn.textContent = '저장 중...';
    try {
      await fetch('/api/appraisal/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'false_positive', checker: finding.checker, finding, description: reason, fileName: currentFileName }),
      });
      document.getElementById(fid + '_fp').style.display = 'none';
      const badBtn  = document.querySelector(`#${fid} [data-action="fp-toggle"]`);
      const goodBtn = document.querySelector(`#${fid} [data-action="correct"]`);
      if (badBtn)  { badBtn.textContent = '✓ 분발해 태식아 🗞️'; badBtn.classList.add('active-fp'); badBtn.disabled = true; }
      if (goodBtn) goodBtn.style.display = 'none';
      if (sentEl)  { sentEl.textContent = '접수됐어요. 태식이가 분발할게요!'; sentEl.className = 'fb-sent fb-sent-ok'; }
    } catch {
      btn.disabled = false; btn.textContent = '훈육 완료 →';
      if (sentEl) { sentEl.textContent = '저장 실패 — 다시 눌러주세요'; sentEl.className = 'fb-sent fb-sent-err'; }
    }
  }
});

// ── 놓친 케이스 저장 ────────────────────────────────────────
async function submitMissed() {
  const desc   = document.getElementById('missedDesc').value.trim();
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
  } catch {
    sentEl.textContent = '저장 실패';
  }
}

// ── 섹션 그룹화 ─────────────────────────────────────────────
function groupBySection(findings, detectedSections) {
  const map = {};
  detectedSections.forEach(s => { if (!map[s]) map[s] = []; });
  findings.forEach(f => {
    const loc = f.location || '';
    let sec = '기타';
    for (const s of SECTION_ORDER) {
      if (loc.includes(s)) { sec = s; break; }
    }
    if (!map[sec]) map[sec] = [];
    map[sec].push(f);
  });
  return map;
}

// ── 유틸 ────────────────────────────────────────────────────
function showProgress(label, pct) {
  progressWrap.classList.add('visible');
  progressBar.style.width = pct + '%';
  progressLabel.textContent = label;
}
function showError(msg) { errorBox.innerHTML = `<div class="error-box">⚠️ ${escHtml(msg)}</div>`; }
function clearError()   { errorBox.innerHTML = ''; }
function severityLabel(s) { return { error: '오류', warning: '경고', info: '확인필요' }[s] || s; }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
