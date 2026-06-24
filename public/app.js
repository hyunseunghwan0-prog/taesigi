let selectedSampleId = null;
let customTemplateFile = null;
const inputFiles = [];


async function selectSample(id) {
  selectedSampleId = id;
  customTemplateFile = null;

  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`card-${id}`)?.classList.add('selected');
  document.getElementById('customTemplateCard')?.classList.remove('selected');

  document.getElementById('templateZone').style.display = 'none';
  document.getElementById('templateFilePreview').innerHTML = '';

  // Load and show preview
  const panel = document.getElementById('templatePreviewPanel');
  const content = document.getElementById('previewContent');
  const title = document.getElementById('previewTitle');

  panel.style.display = 'block';
  content.textContent = '미리보기 불러오는 중...';
  const sample = window._samples?.find(s => s.id === id);
  title.textContent = sample?.name || id;

  try {
    const res = await fetch(`/api/templates/${id}/preview`);
    const data = await res.json();
    content.textContent = data.preview || '내용 없음';
  } catch {
    content.textContent = '미리보기를 불러올 수 없습니다.';
  }

  updateBtn();
}

function closePreview() {
  document.getElementById('templatePreviewPanel').style.display = 'none';
}

function selectCustom() {
  selectedSampleId = null;
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('customTemplateCard')?.classList.add('selected');
  document.getElementById('templateZone').style.display = 'block';
  updateBtn();
}

// Custom template card click
document.getElementById('customTemplateCard').addEventListener('click', selectCustom);

// Drop zone: template
setupDropZone('templateZone', 'templateInput', (files) => {
  const file = files[0];
  if (!file) return;
  if (!file.name.endsWith('.docx')) { alert('DOCX 파일만 업로드 가능합니다.'); return; }
  customTemplateFile = file;
  selectedSampleId = null;

  const zone = document.getElementById('templateZone');
  zone.classList.add('has-file');
  document.getElementById('templateFilePreview').innerHTML = `
    <div class="file-chip template-chip">
      📄 ${file.name}
      <span class="remove" onclick="removeCustomTemplate()">×</span>
    </div>`;
  updateBtn();
});

function removeCustomTemplate() {
  customTemplateFile = null;
  document.getElementById('templateZone').classList.remove('has-file');
  document.getElementById('templateFilePreview').innerHTML = '';
  updateBtn();
}

// Drop zone: inputs
setupDropZone('inputZone', 'inputsInput', (files) => {
  for (const file of files) {
    if (inputFiles.length >= 5) { alert('최대 5개까지 업로드 가능합니다.'); break; }
    if (!inputFiles.find(f => f.name === file.name)) inputFiles.push(file);
  }
  renderInputPreview();
  updateBtn();
});

function renderInputPreview() {
  document.getElementById('inputPreview').innerHTML = inputFiles.map((f, i) => `
    <div class="file-chip input-chip">
      📎 ${f.name}
      <span class="remove" onclick="removeInput(${i})">×</span>
    </div>`).join('');
}

function removeInput(i) {
  inputFiles.splice(i, 1);
  renderInputPreview();
  updateBtn();
}

function updateBtn() {
  const hasTemplate = selectedSampleId || customTemplateFile;
  document.getElementById('convertBtn').disabled = !(hasTemplate && inputFiles.length > 0);
}

function setupDropZone(zoneId, inputId, onFiles) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { onFiles(Array.from(input.files)); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); onFiles(Array.from(e.dataTransfer.files)); });
}

// Form submit
document.getElementById('convertForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  document.getElementById('convertForm').style.display = 'none';
  document.getElementById('errorArea').style.display = 'none';
  document.getElementById('progressArea').style.display = 'block';
  setStep('step-parse', 'active');

  const formData = new FormData();

  if (customTemplateFile) {
    formData.append('template', customTemplateFile);
  } else {
    formData.append('sampleTemplateId', selectedSampleId);
  }
  inputFiles.forEach(f => formData.append('inputs', f));

  const t1 = setTimeout(() => { setStep('step-parse', 'done'); setStep('step-ai', 'active'); }, 4000);
  const t2 = setTimeout(() => { setStep('step-ai', 'done'); setStep('step-gen', 'active'); }, 25000);

  try {
    const res = await fetch('/api/convert', { method: 'POST', body: formData });
    clearTimeout(t1); clearTimeout(t2);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '서버 오류가 발생했습니다.');
    }

    setStep('step-parse', 'done'); setStep('step-ai', 'done'); setStep('step-gen', 'done');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'output.docx'; a.click();
    URL.revokeObjectURL(url);

    setTimeout(resetForm, 1500);
  } catch (err) {
    clearTimeout(t1); clearTimeout(t2);
    document.getElementById('progressArea').style.display = 'none';
    document.getElementById('errorArea').style.display = 'block';
    document.getElementById('errorMsg').textContent = err.message;
  }
});

function setStep(id, state) {
  const el = document.getElementById(id);
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

function resetForm() {
  document.getElementById('convertForm').style.display = 'block';
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('errorArea').style.display = 'none';
  ['step-parse', 'step-ai', 'step-gen'].forEach(id => setStep(id, null));
}

// Init
loadSamples();

async function loadSamples() {
  const res = await fetch('/api/templates');
  const samples = await res.json();
  window._samples = samples;

  const container = document.getElementById('templateOptions');
  const icons = ['📊', '🏗️'];
  container.innerHTML = samples.map((s, i) => `
    <label class="template-card" id="card-${s.id}" onclick="selectSample('${s.id}')">
      <input type="radio" name="templateChoice" value="${s.id}">
      <div class="card-icon">${icons[i] || '📄'}</div>
      <div class="card-body">
        <div class="card-title">${s.name}</div>
        <div class="card-desc">${s.desc}</div>
      </div>
    </label>
  `).join('');
}
