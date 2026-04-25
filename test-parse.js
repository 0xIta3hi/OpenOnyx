const rawText = `We need to produce a JSON object with key "insight" and a one sentence max 20 words capturing core insight of the note. The note is about career development: current role, skills, goals, action items. Core insight: focus on building full-stack expertise while expanding into Python/ML, system design, leadership, and learning Rust/cloud/K8s to progress toward senior/tech lead roles. Must be <=20 words. Let's craft: "Deepen full-stack skills, add Python/ML and cloud/K8s expertise, then pursue leadership and senior/architect roles." Count words: Deepen(1) full-stack2 skills,3 add4 Python/ML5 and6 cloud/K8s7 expertise`;

function parseInsight(rawText) {
  let text = rawText;
  
  // 1. Try to parse JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed.insight === "string") text = parsed.insight;
    } catch { /* ignore */ }
  }

  // 2. Quotes fallback
  if (text === rawText) {
    const quotes = [...text.matchAll(/"([^"]+)"/g)];
    const validQuotes = quotes.filter(q => q[1].length > 15 && q[1].toLowerCase() !== "insight");
    if (validQuotes.length > 0) text = validQuotes[validQuotes.length - 1][1];
  }

  // 3. Markers fallback
  if (text === rawText && text.length > 100) {
    const markers = [/(?:Let's craft:|Let's write:|Insight:|Core insight:|Output:)/i];
    for (const regex of markers) {
      const parts = text.split(regex);
      if (parts.length > 1) {
        let candidate = parts[parts.length - 1].trim();
        candidate = candidate.replace(/Count words:[\s\S]*$/i, "").trim();
        candidate = candidate.replace(/^"|"$/g, "").trim();
        if (candidate.length > 10) {
          text = candidate;
          break;
        }
      }
    }
  }

  return text;
}

console.log("RESULT:", parseInsight(rawText));
