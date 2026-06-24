const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic();

const CHECKERS_DIR = path.join(__dirname, 'checkers');

function loadExistingCheckers() {
  return fs.readdirSync(CHECKERS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => ({
      name: f,
      code: fs.readFileSync(path.join(CHECKERS_DIR, f), 'utf8'),
    }));
}

/**
 * 누적된 피드백을 Claude API에 보내 새 체커 패턴 제안을 받습니다.
 * @param {object[]} feedbackList
 * @returns {Promise<{ suggestions: string, proposedCode: string | null }>}
 */
async function analyzeFeedback(feedbackList) {
  const checkers = loadExistingCheckers();

  const checkerSummary = checkers.map(c =>
    `=== ${c.name} ===\n${c.code.slice(0, 800)}...`
  ).join('\n\n');

  const feedbackSummary = feedbackList.map((f, i) => {
    const lines = [
      `[${i + 1}] 유형: ${typeLabel(f.type)}`,
      `    체커: ${f.checker || '없음(놓친 케이스)'}`,
      `    설명: ${f.description || '(없음)'}`,
    ];
    if (f.context) lines.push(`    원문: ${f.context.slice(0, 200)}`);
    if (f.finding) lines.push(`    finding: ${f.finding.message || ''}`);
    return lines.join('\n');
  }).join('\n\n');

  const prompt = `당신은 감정평가서 자동 검토 프로그램의 체커 모듈 개발자입니다.

## 현재 체커 코드 (요약)
${checkerSummary}

## 사용자 피드백 (${feedbackList.length}건)
${feedbackSummary}

## 요청
위 피드백을 분석하여:

1. **패턴 분석**: 놓친 케이스들의 공통 패턴이 무엇인지 설명
2. **개선 방안**: 기존 체커 수정 또는 새 체커 추가 중 어떤 게 나은지
3. **코드 제안**: 가장 임팩트 있는 수정/신규 체커 코드를 실제로 작성
   - 반드시 Node.js CommonJS 형식
   - \`{ name, description, check(pages) }\` 인터페이스 준수
   - pages는 \`{ section: string, pageNum: number, text: string }[]\` 배열
   - finding 형식: \`{ checker, severity, location, message, context }\`

코드 블록은 \`\`\`js ... \`\`\` 형식으로 작성해주세요.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;

  // 코드 블록 추출
  const codeMatch = text.match(/```(?:js|javascript)\n([\s\S]+?)```/);
  const proposedCode = codeMatch ? codeMatch[1] : null;

  return { suggestions: text, proposedCode };
}

function typeLabel(type) {
  return { missed: '놓친 케이스', false_positive: '오탐지', correct: '정확한 탐지' }[type] || type;
}

module.exports = { analyzeFeedback };
