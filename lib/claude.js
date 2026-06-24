const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function extractSections(templateText) {
  const lines = templateText.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  for (const line of lines) {
    if (/^[Ⅰ-Ⅹ][\.\s]/.test(line) || /^\d+\.\s+[가-힣]/.test(line)) {
      sections.push(line.slice(0, 60));
    }
  }
  return [...new Set(sections)].slice(0, 12);
}

async function mapSections(templateText, inputText) {
  const sections = extractSections(templateText);
  if (sections.length === 0) return { '본문': inputText };

  const sectionList = sections.map((s, i) => `SECTION_${i + 1}: ${s}`).join('\n');
  const inputChunk = inputText.slice(0, 12000);

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a Korean document classifier.
Rules:
- Output ONLY the section markers and content, nothing else.
- Do NOT modify the input text. Copy relevant parts verbatim.
- If no matching content, write "[해당 내용 없음]".
- For table-like data (key-value pairs, lists with numbers), format as markdown table: |구분|내용|\\n|---|---|
- Use EXACTLY this format:

===SECTION_1===
content here
===SECTION_2===
content here`,
      },
      {
        role: 'user',
        content: `Map the input text to these sections. Copy relevant text verbatim, do not generate new content.

SECTIONS:
${sectionList}

INPUT TEXT:
${inputChunk}

Respond with the section markers and mapped content only:`,
      },
    ],
    max_tokens: 5000,
    temperature: 0.1,
  });

  const raw = response.choices[0].message.content || '';

  // Parse ===SECTION_N=== delimiters
  const result = {};
  const regex = /===SECTION_(\d+)===\n?([\s\S]*?)(?====SECTION_\d+===|$)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const idx = parseInt(match[1]) - 1;
    const content = match[2].trim();
    if (sections[idx]) {
      result[sections[idx]] = content || '[해당 내용 없음]';
    }
  }

  // Fallback if parsing failed
  if (Object.keys(result).length === 0) {
    sections.forEach(s => { result[s] = '[해당 내용 없음]'; });
    result['본문'] = inputText.slice(0, 8000);
  }

  return result;
}

module.exports = { mapSections, extractSections };
