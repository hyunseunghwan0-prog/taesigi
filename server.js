require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { convertDocx } = require('./lib/converter');
const { extractPdf } = require('./lib/appraisal/pdfExtractor');
const { extractDocx } = require('./lib/appraisal/docxExtractor');
const { runAllCheckers } = require('./lib/appraisal/index');
const { parsePublicRecord } = require('./lib/appraisal/publicRecordParser');
const publicRecordChecker = require('./lib/appraisal/checkers/publicRecordChecker');
const feedbackStore = require('./lib/appraisal/feedbackStore');
const { analyzeFeedback } = require('./lib/appraisal/patternAnalyzer');
const { initDb } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

const TEMPLATES_DIR = path.join(__dirname, 'templates');

const SAMPLE_TEMPLATES = [
  {
    id: 'sample1',
    name: '상환가능성 검토보고서',
    desc: '담보물 원리금 상환가능성 검토 (골프장·부동산펀드)',
    file: 'sample1_상환가능성검토.docx',
  },
  {
    id: 'sample2',
    name: '사업성 검토보고서',
    desc: '부동산 개발사업 사업성 검토 (코리빙·주거시설)',
    file: 'sample2_사업성검토.docx',
  },
];

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.static('public'));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// List available sample templates
app.get('/api/templates', (req, res) => {
  res.json(SAMPLE_TEMPLATES.map(({ id, name, desc }) => ({ id, name, desc })));
});

// Preview template content (first ~800 chars of text)
app.get('/api/templates/:id/preview', async (req, res) => {
  const sample = SAMPLE_TEMPLATES.find(s => s.id === req.params.id);
  if (!sample) return res.status(404).json({ error: '없음' });
  try {
    const { parseDocx } = require('./lib/parser');
    const filePath = path.join(TEMPLATES_DIR, sample.file);
    const text = await parseDocx(filePath);
    // Extract section headers and first lines for preview
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const preview = lines.slice(0, 40).join('\n');
    res.json({ preview });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Main conversion endpoint
app.post('/api/convert', upload.fields([
  { name: 'template', maxCount: 1 },
  { name: 'inputs', maxCount: 5 },
]), async (req, res) => {
  const uploadedTemplate = req.files?.template?.[0];
  const inputFiles = req.files?.inputs || [];
  const sampleId = req.body?.sampleTemplateId;

  // Determine template source
  let templateFilePath = null;
  let templateOriginalName = null;
  let isBuiltin = false;

  if (uploadedTemplate) {
    templateFilePath = uploadedTemplate.path;
    templateOriginalName = uploadedTemplate.originalname;
  } else if (sampleId) {
    const sample = SAMPLE_TEMPLATES.find(s => s.id === sampleId);
    if (!sample) return res.status(400).json({ error: '샘플 템플릿을 찾을 수 없습니다.' });
    templateFilePath = path.join(TEMPLATES_DIR, sample.file);
    templateOriginalName = sample.file;
    isBuiltin = true;
  } else {
    return res.status(400).json({ error: '참고 양식 파일을 선택하거나 업로드해주세요.' });
  }

  if (inputFiles.length === 0) {
    return res.status(400).json({ error: '인풋 데이터 파일을 최소 1개 업로드해주세요.' });
  }

  try {
    const templateFileObj = { path: templateFilePath, originalname: templateOriginalName };
    const outputPath = await convertDocx(templateFileObj, inputFiles);
    res.download(outputPath, 'output.docx', () => {
      try { fs.unlinkSync(outputPath); } catch {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '변환 중 오류가 발생했습니다.' });
  } finally {
    if (!isBuiltin && uploadedTemplate) {
      try { fs.unlinkSync(uploadedTemplate.path); } catch {}
    }
    inputFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {}; });
  }
});

// 감정평가서 검토 엔드포인트
const appraisalUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok = name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc');
    ok ? cb(null, true) : cb(new Error('PDF 또는 Word(docx) 파일만 업로드 가능합니다.'));
  },
});

app.post('/api/appraisal/review', appraisalUpload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'gongbu', maxCount: 10 },
]), async (req, res) => {
  const pdfFile = req.files?.pdf?.[0];
  if (!pdfFile) return res.status(400).json({ error: 'PDF 파일을 업로드해주세요.' });

  const gongbuFiles = req.files?.gongbu || [];

  try {
    const isDocx = pdfFile.originalname.toLowerCase().endsWith('.docx') || pdfFile.originalname.toLowerCase().endsWith('.doc');
    const { pages } = isDocx ? await extractDocx(pdfFile.path) : await extractPdf(pdfFile.path);
    const { results, detectedSections } = await runAllCheckers(pages);

    // 공부서류 처리
    let publicRecords = [];
    let publicRecordResult = null;
    if (gongbuFiles.length > 0) {
      for (const gf of gongbuFiles) {
        try {
          const { pages: gPages } = await extractPdf(gf.path);
          const text = gPages.map(p => p.text).join('\n');
          const parsed = parsePublicRecord(text);
          publicRecords.push(parsed);
        } catch (e) {
          console.error('공부서류 파싱 오류:', e.message);
        }
      }
      const gongbuFindings = publicRecordChecker.check(pages, publicRecords);
      publicRecordResult = {
        checker: publicRecordChecker.name,
        description: publicRecordChecker.description,
        findings: gongbuFindings,
        detectedDocs: publicRecords.map(r => r.label),
      };
    }

    const allResults = publicRecordResult ? [...results, publicRecordResult] : results;
    const allFindings = allResults.flatMap(r => r.findings);

    res.json({
      summary: {
        pages: pages.length,
        totalFindings: allFindings.length,
        errorCount: allFindings.filter(f => f.severity === 'error').length,
        warningCount: allFindings.filter(f => f.severity === 'warning').length,
        detectedSections,
        gongbuDocs: publicRecords.map(r => r.label),
      },
      results: allResults,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '검토 중 오류가 발생했습니다.' });
  } finally {
    try { fs.unlinkSync(pdfFile.path); } catch {}
    gongbuFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
  }
});

// 피드백 저장
app.post('/api/appraisal/feedback', async (req, res) => {
  try {
    const { type, checker, description, context, finding, fileName } = req.body;
    if (!type) return res.status(400).json({ error: 'type 필드가 필요합니다.' });
    const record = await feedbackStore.save({ type, checker, description, context, finding, fileName });
    const stats = await feedbackStore.getStats();
    res.json({ ok: true, id: record.id, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 피드백 목록 + 통계
app.get('/api/appraisal/feedback', async (req, res) => {
  try {
    const [all, stats] = await Promise.all([feedbackStore.loadAll(), feedbackStore.getStats()]);
    res.json({ stats, items: all.slice(0, 50) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Claude 패턴 분석 요청
app.post('/api/appraisal/analyze', async (req, res) => {
  try {
    const all = await feedbackStore.loadAll();
    if (all.length === 0) return res.status(400).json({ error: '피드백이 없습니다.' });
    const targets = all.filter(f => f.type !== 'correct');
    if (targets.length === 0) return res.status(400).json({ error: '분석할 피드백(놓친/오탐지)이 없습니다.' });
    const result = await analyzeFeedback(targets);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB 초기화 실패:', err.message);
    // DB 없이도 서버는 뜨도록 (로컬 개발 환경)
    app.listen(PORT, () => console.log(`Server running (no DB) at http://localhost:${PORT}`));
  });
