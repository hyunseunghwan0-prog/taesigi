const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const reviewBtn = document.getElementById('reviewBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const resultsEl = document.getElementById('results');
const summaryBar = document.getElementById('summaryBar');
const checkerResults = document.getElementById('checkerResults');
const errorBox = document.getElementById('errorBox');
const missedPanel = document.getElementById('missedPanel');
const analyzePanel = document.getElementById('analyzePanel');
const analyzeBtn = document.getElementById('analyzeBtn');

let selectedFile = null;
let currentFileName = '';

// ── 파일 선택 ──────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

function setFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) { showError('PDF 파일만 업로드 가능합니다.'); return; }
  selectedFile = file;
  currentFileName = file.name;
  fileName.textContent = `선택됨: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  reviewBtn.disabled = false;
  clearError();
  resultsEl.classList.remove('visible');
  missedPanel.style.display = 'none';
}

// ── 검토 시작 ───────────────────────────────────────────────
reviewBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  reviewBtn.disabled = true;
  clearError();
  resultsEl.classList.remove('visible');
  missedPanel.style.display = 'none';
  analyzePanel.style.display = 'none';
  showProgress('PDF 업로드 중...', 20);

  const formData = new FormData();
  formData.append('pdf', selectedFile);

  try {
    showProgress('텍스트 추출 중...', 50);
    const res = await fetch('/api/appraisal/review', { method: 'POST', body: formData });
    showProgress('검토 항목 분석 중...', 80);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');
    showProgress('완료', 100);
    setTimeout(() => {
      progressWrap.classList.remove('visible');
      renderResults(data);
    }, 400);
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

  const sectionsHtml = summary.detectedSections?.length
    ? `<div style="font-size:0.82rem;color:#666;margin-bottom:8px">감지된 섹션: ${summary.detectedSections.join(' → ')}</div>` : '';
  const okMsg = summary.errorCount === 0 && summary.warningCount === 0
    ? `<span class="badge ok">✅ 오류·경고 없음</span>` : '';

  summaryBar.innerHTML = `
    ${sectionsHtml}
    <span class="badge total">총 ${summary.pages}페이지</span>
    <span class="badge total">검토 결과 ${summary.totalFindings}건</span>
    ${summary.errorCount > 0 ? `<span class="badge error">오류 ${summary.errorCount}건</span>` : ''}
    ${summary.warningCount > 0 ? `<span class="badge warning">경고 ${summary.warningCount}건</span>` : ''}
    ${okMsg}
  `;

  checkerResults.innerHTML = results.map(r => {
    const cards = r.findings.length === 0
      ? `<div class="no-findings">✅ 이상 발견되지 않았습니다.</div>`
      : r.findings.map((f, fi) => {
          const fid = `f_${r.checker}_${fi}`.replace(/\s/g, '_');
          return `
          <div class="finding-card ${f.severity}" id="${fid}">
            <div class="finding-header">
              <span class="severity-tag ${f.severity}">${severityLabel(f.severity)}</span>
              ${f.location ? `<span class="page-tag">${escHtml(f.location)}</span>` : ''}
            </div>
            <div class="finding-message">${escHtml(f.message)}</div>
            ${f.context ? `<div class="finding-context">${escHtml(f.context)}</div>` : ''}
            <div class="feedback-row">
              <span style="font-size:0.78rem;color:#aaa;">이 결과가:</span>
              <button class="fb-btn" onclick="sendFeedback('correct','${escAttr(r.checker)}','${fid}',${JSON.stringify(f).replace(/'/g,"\\'")})" title="정확한 탐지">👍 맞음</button>
              <button class="fb-btn" onclick="sendFeedback('false_positive','${escAttr(r.checker)}','${fid}',${JSON.stringify(f).replace(/'/g,"\\'")})" title="오탐지">👎 오탐지</button>
            </div>
            <div id="${fid}_sent" class="fb-sent"></div>
          </div>`;
        }).join('');

    return `
      <div class="checker-section">
        <div class="checker-title">${escHtml(r.checker)}<span class="count">${r.findings.length}건</span></div>
        ${r.description ? `<p style="font-size:0.83rem;color:#666;margin-bottom:10px">${escHtml(r.description)}</p>` : ''}
        ${r.error ? `<div class="error-box">체커 오류: ${escHtml(r.error)}</div>` : cards}
      </div>`;
  }).join('');

  resultsEl.classList.add('visible');

  // 검토 완료 후 놓친 케이스 패널 + 분석 패널 표시
  missedPanel.style.display = 'block';
  loadAnalyzePanel();
}

// ── 피드백 전송 ─────────────────────────────────────────────
async function sendFeedback(type, checker, fid, finding) {
  const sentEl = document.getElementById(fid + '_sent');
  try {
    await fetch('/api/appraisal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, checker, finding, fileName: currentFileName, context: finding.context }),
    });
    const card = document.getElementById(fid);
    if (card) {
      card.querySelectorAll('.fb-btn').forEach(b => {
        b.classList.remove('active-correct', 'active-fp');
      });
      const btn = card.querySelector(`button[onclick*="'${type}'"]`);
      if (btn) btn.classList.add(type === 'correct' ? 'active-correct' : 'active-fp');
    }
    if (sentEl) sentEl.textContent = type === 'correct' ? '✓ 저장됨' : '✓ 오탐지로 저장됨';
    loadAnalyzePanel();
  } catch (e) {
    if (sentEl) sentEl.textContent = '저장 실패';
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
    sentEl.textContent = '✓ 저장됨';
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
      `누적 피드백: 전체 <b>${stats.total}</b>건 (놓친 케이스 <b>${stats.byType.missed || 0}</b>건, 오탐지 <b>${stats.byType.false_positive || 0}</b>건, 정확 <b>${stats.byType.correct || 0}</b>건)`;
    analyzeBtn.disabled = actionable === 0;
    analyzeBtn.textContent = actionable > 0
      ? `AI 패턴 분석 요청 (${actionable}건 분석)` : 'AI 패턴 분석 (피드백 없음)';
    analyzePanel.style.display = 'block';
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

    // 마크다운 코드블록 제거 후 일반 텍스트 표시
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
function showError(msg) { errorBox.innerHTML = `<div class="error-box">⚠️ ${msg}</div>`; }
function clearError() { errorBox.innerHTML = ''; }
function severityLabel(s) { return { error: '오류', warning: '경고', info: '참고' }[s] || s; }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return String(str).replace(/'/g, "\\'"); }
