const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

function sanitize(str) {
  return String(str || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uD800-\uDFFF]/g, '');
}
function esc(str) {
  return sanitize(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Template paragraph styles
const STYLES = {
  h1: 'af', h2: '11', h3: '3', h4: '14',
  body: '14', empty: '14',
  tableHeader: 'a0', tableCell: 'a4', tableBody: 'a0',
};

function headingPara(styleId, text) {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function bodyPara(text, bold = false) {
  const b = bold ? '<w:b/>' : '';
  if (!text || !text.trim()) {
    return `<w:p><w:pPr><w:pStyle w:val="${STYLES.body}"/></w:pPr></w:p>`;
  }
  return `<w:p><w:pPr><w:pStyle w:val="${STYLES.body}"/></w:pPr>` +
    `<w:r><w:rPr>${b}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function tableXml(rows) {
  if (!rows || rows.length === 0) return '';
  const colCount = Math.max(...rows.map(r => r.length));
  if (colCount === 0) return '';

  const colWidths = colCount === 2 ? [2800, 6200]
    : colCount === 3 ? [2200, 4600, 2200]
    : colCount === 4 ? [2000, 2800, 2400, 1800]
    : Array(colCount).fill(Math.floor(9000 / colCount));
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  const bSm = `w:val="single" w:sz="4" w:space="0" w:color="808080"`;
  const bLg = `w:val="single" w:sz="12" w:space="0" w:color="808080"`;

  const makeCell = (cell, ci, isHdr) => {
    const w = colWidths[ci] ?? colWidths[colWidths.length - 1];
    const fill = isHdr ? '1F3864' : (ci === 0 ? 'F2F4F8' : 'FFFFFF');
    const txtColor = isHdr ? 'FFFFFF' : '000000';
    const bold = (isHdr || ci === 0) ? '<w:b/>' : '';
    const jc = ci === 0 ? 'center' : 'left';
    return `<w:tc>` +
      `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
      `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` +
      `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/>` +
      `<w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>` +
      `</w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>` +
      `<w:r><w:rPr>${bold}<w:color w:val="${txtColor}"/>` +
      `<w:sz w:val="18"/><w:szCs w:val="18"/>` +
      `<w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/></w:rPr>` +
      `<w:t xml:space="preserve">${esc(cell)}</w:t></w:r></w:p></w:tc>`;
  };

  const makeRow = (row, isHdr) => {
    const cells = Array.from({ length: colCount }, (_, ci) =>
      makeCell(row[ci] ?? '', ci, isHdr)
    ).join('');
    return `<w:tr><w:trPr><w:trHeight w:val="420"/>${isHdr ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`;
  };

  const tblRows = rows.map((r, i) => makeRow(r, i === 0)).join('');
  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');

  return `<w:tbl>` +
    `<w:tblPr><w:tblStyle w:val="a6"/>` +
    `<w:tblW w:w="${totalW}" w:type="dxa"/>` +
    `<w:tblBorders>` +
    `<w:top ${bLg}/><w:left ${bLg}/><w:bottom ${bSm}/><w:right ${bSm}/>` +
    `<w:insideH ${bSm}/><w:insideV ${bSm}/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${tblRows}</w:tbl>` +
    `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>`;
}

function imagePlaceholderXml(idx) {
  return bodyPara(`[ 이미지 ${idx + 1} - 수동 삽입 필요 ]`, false);
}

function imageXml(imgData, rId) {
  if (!imgData || !imgData.data) return imagePlaceholderXml(0);
  const w = 5400000; const h = 3600000; // 6cm × 4cm in EMU
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr/><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${w}" cy="${h}"/>` +
    `<wp:docPr id="1" name="Image"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="img"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`;
}

function buildBodyXml(blocks, images, zip) {
  // Add images to ZIP and collect relationship IDs
  const imgRels = [];
  if (images && images.length > 0) {
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    const existingIds = (relsXml.match(/Id="([^"]+)"/g) || []).map(m => m.slice(4, -1));
    const maxId = Math.max(0, ...existingIds.map(id => parseInt(id.replace('rId', '')) || 0));

    let relsNew = relsXml.replace('</Relationships>', '');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img) { imgRels.push(null); continue; }
      const rId = `rId${maxId + i + 1}`;
      const mediaPath = `word/media/img_inserted_${i}.${img.ext}`;
      zip.addFile(mediaPath, img.data);
      const mime = img.ext === 'png' ? 'image/png' : img.ext === 'jpg' || img.ext === 'jpeg' ? 'image/jpeg' : `image/${img.ext}`;
      relsNew += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img_inserted_${i}.${img.ext}"/>`;
      imgRels.push(rId);

      // Add content type if needed
      try {
        let ct = zip.readAsText('[Content_Types].xml');
        if (!ct.includes(`Extension="${img.ext}"`)) {
          ct = ct.replace('</Types>', `<Default Extension="${img.ext}" ContentType="${mime}"/></Types>`);
          zip.updateFile('[Content_Types].xml', Buffer.from(ct, 'utf-8'));
        }
      } catch {}
    }
    relsNew += '</Relationships>';
    zip.updateFile('word/_rels/document.xml.rels', Buffer.from(relsNew, 'utf-8'));
  }

  return blocks.map(b => {
    switch (b.type) {
      case 'heading':
        if (b.styleId === '14_bold') return bodyPara(b.text, true);
        return headingPara(b.styleId, b.text);
      case 'table':
        return tableXml(b.rows);
      case 'image': {
        const rId = imgRels[b.idx];
        const imgData = images ? images[b.idx] : null;
        return rId && imgData ? imageXml(imgData, rId) : imagePlaceholderXml(b.idx);
      }
      case 'empty':
        return bodyPara('');
      case 'body':
        return bodyPara(b.text);
      default:
        return '';
    }
  }).join('');
}

function extractSectPr(xml, bodyStart, bodyEnd) {
  const body = xml.slice(bodyStart, bodyEnd);
  const idx = body.lastIndexOf('<w:sectPr');
  return idx === -1 ? '' : body.slice(idx);
}

function updateHeaderTitle(zip, title) {
  const f = 'word/header2.xml';
  if (!zip.getEntry(f)) return;
  let xml = zip.readAsText(f);
  const parts = title.length > 35
    ? [title.slice(0, Math.ceil(title.length / 2)), title.slice(Math.ceil(title.length / 2))]
    : [title, '검토보고서'];
  let pi = 0;
  xml = xml.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (match, open, content, close) => {
    if (!content.trim()) return match;
    return pi < parts.length ? `${open}${esc(parts[pi++])}${close}` : `${open}${close}`;
  });
  zip.updateFile(f, Buffer.from(xml, 'utf-8'));
}

async function generateDocx(blocks, templatePath, reportTitle, images) {
  const zip = new AdmZip(templatePath);
  const docXml = zip.readAsText('word/document.xml');

  const bodyStart = docXml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd = docXml.lastIndexOf('</w:body>');
  const sectPr = extractSectPr(docXml, bodyStart, bodyEnd);

  const bodyXml = buildBodyXml(blocks, images || [], zip) + sectPr;
  const newDocXml = docXml.slice(0, bodyStart) + bodyXml + docXml.slice(bodyEnd);

  zip.updateFile('word/document.xml', Buffer.from(newDocXml, 'utf-8'));
  if (reportTitle) updateHeaderTitle(zip, reportTitle);

  const tmpPath = path.join(os.tmpdir(), `report_${Date.now()}.docx`);
  zip.writeZip(tmpPath);
  return tmpPath;
}

module.exports = { generateDocx };
