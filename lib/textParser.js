const SKIP_PATTERNS = [
  /^-\s*\d+\s*-$/,
  /^\d+$/,
  /^\.{5,}/,
  /^={5,}/,
  /^Executive\s+Summary$/i,
  /^Contents$/i,
  /^목\s*차$/,
];

function detectPageHeaders(lines) {
  const freq = {};
  for (const l of lines) {
    const t = l.trim();
    if (t.length > 5 && t.length < 100) freq[t] = (freq[t] || 0) + 1;
  }
  const threshold = Math.max(3, Math.floor(lines.length / 40));
  return new Set(Object.entries(freq).filter(([, c]) => c >= threshold).map(([t]) => t));
}

function shouldSkip(t, pageHeaderSet) {
  if (!t || /^[\s　]+$/.test(t)) return true;
  if (SKIP_PATTERNS.some(p => p.test(t))) return true;
  if (pageHeaderSet.has(t)) return true;
  return false;
}

// Returns { styleId, isToc } or null for body text
function classifyLine(t) {
  // TOC line: has long dot sequences ····
  if (/[·]{4,}/.test(t) || /\.{6,}/.test(t)) {
    return { styleId: '111', isToc: true };
  }

  // 큰 제목: ❚ ■ ▶ 특수기호로 시작, 또는 Ⅰ. Ⅱ. 로마 숫자
  if (/^[❚❙▣■▶▷◆●★☆◎]\s/.test(t)) return { styleId: 'af' };
  if (/^[Ⅰ-Ⅹ]\s*[\.．]?\s/.test(t)) return { styleId: 'af' };
  if (/^제\s*\d+\s*[장절편]/.test(t) && t.length < 40) return { styleId: 'af' };

  // 01 02 ... (두 자리 숫자 섹션 - 목차용 H1)
  if (/^0\d\s+[가-힣A-Za-z]/.test(t) && t.length < 60) return { styleId: 'af' };

  // 1. 2. 3. (한 자리 + 점 + 공백 + 내용)
  if (/^\d{1,2}\.\s+[가-힣A-Za-z]/.test(t) && !/^\d+\.\d+/.test(t) && t.length < 80) {
    return { styleId: '11' };
  }

  // 1.1. 1.2. 소제목
  if (/^\d+\.\d+\.\s+[가-힣A-Za-z]/.test(t) && t.length < 80) {
    return { styleId: '110' };
  }

  // I. II. III. (라틴 로마자)
  if (/^(I{1,3}V?|V?I{0,3}X?)\.\s+\S/.test(t) && /^[A-Z]/.test(t) && t.length < 80) {
    return { styleId: '11' };
  }

  // 본문 (가나다, 숫자, 일반 텍스트 모두 body)
  return null;
}

function parseFullText(text) {
  const raw = text.split('\n');
  const pageHeaderSet = detectPageHeaders(raw);
  const blocks = [];
  let lastType = null;

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const t = line.trim();

    // TABLE_ROW: from DOCX XML extraction
    if (t.startsWith('TABLE_ROW:')) {
      const cells = t.slice('TABLE_ROW:'.length).split('\t');
      const rows = [cells];
      while (i + 1 < raw.length && raw[i + 1].trim().startsWith('TABLE_ROW:')) {
        i++;
        rows.push(raw[i].trim().slice('TABLE_ROW:'.length).split('\t'));
      }
      if (rows[0].length >= 2) {
        blocks.push({ type: 'table', rows });
      } else {
        rows.forEach(r => blocks.push({ type: 'body', text: r.join(' ') }));
      }
      lastType = 'table';
      continue;
    }

    // IMAGE
    if (t.startsWith('IMAGE:')) {
      blocks.push({ type: 'image', idx: parseInt(t.slice(6)) });
      lastType = 'image';
      continue;
    }

    if (shouldSkip(t, pageHeaderSet)) {
      if (lastType && lastType !== 'empty') {
        blocks.push({ type: 'empty' });
        lastType = 'empty';
      }
      continue;
    }

    const cls = classifyLine(t);
    if (cls) {
      blocks.push({ type: 'heading', styleId: cls.styleId, text: t });
      lastType = 'heading';
    } else {
      if (!t) {
        if (lastType && lastType !== 'empty') {
          blocks.push({ type: 'empty' });
          lastType = 'empty';
        }
      } else {
        blocks.push({ type: 'body', text: t });
        lastType = 'body';
      }
    }
  }

  while (blocks.length && blocks[blocks.length - 1].type === 'empty') blocks.pop();
  return blocks;
}

function extractTitle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('TABLE_ROW:') && !l.startsWith('IMAGE:'));
  for (const line of lines.slice(0, 60)) {
    if (line.length < 8 || /^\d+$/.test(line)) continue;
    if (/[가-힣]/.test(line) && line.length >= 10 && line.length <= 80) {
      if (/^\d{4}[-\.년]/.test(line)) continue;
      return line;
    }
  }
  return '검토보고서';
}

module.exports = { parseFullText, extractTitle };
