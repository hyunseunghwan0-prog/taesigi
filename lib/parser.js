const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function sanitize(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uD800-\uDFFF]/g, '');
}

async function parseFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.docx' || ext === '.doc') return parseDocxFull(filePath);
  if (ext === '.pdf') return parsePdfWithLayout(filePath);
  if (ext === '.txt') return { lines: sanitize(fs.readFileSync(filePath, 'utf-8')).split('\n'), images: [] };
  throw new Error(`지원하지 않는 파일 형식: ${ext}`);
}

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return sanitize(result.value);
}

// ── DOCX full extraction (text + tables + images) ──────────────────────────
async function parseDocxFull(filePath) {
  const zip = new AdmZip(filePath);
  const xml = zip.readAsText('word/document.xml');
  const lines = [];
  const images = [];

  // Regex to match top-level tables and paragraphs (non-nested only at top level)
  const blockRe = /(<w:tbl\b[\s\S]*?<\/w:tbl>)|(<w:p\b[\s\S]*?<\/w:p>)/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    if (m[1]) {
      // Table
      const tbl = m[1];
      const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
      let rm;
      while ((rm = rowRe.exec(tbl)) !== null) {
        const cellRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
        const cells = [];
        let cm;
        while ((cm = cellRe.exec(rm[0])) !== null) {
          cells.push(xmlText(cm[0]).trim());
        }
        if (cells.some(c => c)) lines.push('TABLE_ROW:' + cells.join('\t'));
      }
    } else if (m[2]) {
      // Check for image
      const imgRe = /r:embed="([^"]+)"/g;
      let im;
      while ((im = imgRe.exec(m[2])) !== null) {
        const rId = im[1];
        // Resolve rId → file from relationships
        const imgData = resolveImage(zip, rId);
        if (imgData) {
          lines.push(`IMAGE:${images.length}`);
          images.push(imgData);
        }
      }
      const txt = xmlText(m[2]).trim();
      if (txt) lines.push(txt);
    }
  }
  return { lines, images };
}

function xmlText(xml) {
  const parts = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  return sanitize(parts.join(''));
}

function resolveImage(zip, rId) {
  try {
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    const re = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`);
    const m = relsXml.match(re);
    if (!m) return null;
    const target = m[1].replace(/^\//, '');
    const filePath = target.startsWith('word/') ? target : 'word/' + target;
    const entry = zip.getEntry(filePath);
    if (!entry) return null;
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const data = entry.getData();
    return { data, ext, filePath };
  } catch { return null; }
}

// ── PDF extraction: simple flat text, no column detection ─────────────────
async function parsePdfWithLayout(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const lines = sanitize(data.text).split('\n');
  return { lines, images: [] };
}

module.exports = { parseFile, parseDocx };
