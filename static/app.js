// RFPilot Frontend Logic - Dual Mode (FastAPI Backend + Standalone Static Cloud Fallback)

let currentProjectId = null;
let currentQuestions = [];
let processedResults = [];
let isStaticMode = false;

// Client-side in-memory knowledge store (used when running statically on Hugging Face Spaces / GitHub Pages)
const CLIENT_KB = {
  sources: [
    { filename: "Acme_Security_Whitepaper_2026.txt", chunks: 6 }
  ],
  documents: [
    {
      title: "1. DATA ENCRYPTION & KEY MANAGEMENT",
      content: "All customer data in transit is encrypted using TLS 1.3 with AES-256-GCM cipher suites. Data at rest is encrypted using FIPS 140-2 validated AES-256 encryption. Encryption keys are managed through AWS KMS with automated 90-day key rotation and hardware security module (HSM) backing. Customers can optionally bring their own keys (BYOK)."
    },
    {
      title: "2. SOC2 & COMPLIANCE CERTIFICATIONS",
      content: "Acme Cloud maintains annual SOC 2 Type II compliance reports covering Security, Availability, and Confidentiality trust principles. Audits are performed independently by Schellman & Company. We are fully compliant with GDPR, HIPAA (BAA available for Enterprise tier), and ISO 27001:2022 standards."
    },
    {
      title: "3. ACCESS CONTROL & AUTHENTICATION",
      content: "Our platform enforces Role-Based Access Control (RBAC) and Least Privilege principles. Enterprise plans include SAML 2.0 and OIDC single sign-on (SSO) with Okta, Azure AD, PingIdentity, and Google Workspace. Multi-Factor Authentication (MFA) via TOTP or WebAuthn/FIDO2 hardware keys is mandatory for all administrative access."
    },
    {
      title: "4. BACKUP, DISASTER RECOVERY & SLA",
      content: "Data backups are executed continuously with point-in-time recovery (PITR) for the past 35 days, replicated across three separate AWS availability zones. Our Disaster Recovery SLA guarantees a Recovery Point Objective (RPO) of < 15 minutes and a Recovery Time Objective (RTO) of < 1 hour. We guarantee a 99.95% monthly uptime SLA."
    },
    {
      title: "5. PENETRATION TESTING & VULNERABILITY MANAGEMENT",
      content: "Independent third-party penetration tests are conducted biannually. Continuous automated vulnerability scanning of container images and dependencies occurs daily using Snyk and Wiz. Critical vulnerabilities must be patched within 24 hours under our remediation SLA."
    },
    {
      title: "6. API RATE LIMITS & WEBHOOKS",
      content: "Enterprise REST APIs support 1,200 requests per minute with scalable burst allowances. Webhooks support idempotent deliveries with HMAC-SHA256 signature verification and exponential backoff retry."
    }
  ]
};

const SAMPLE_DEMO_QUESTIONS = [
  { id: "SEC-01", section: "Encryption", question: "What encryption standards are used for customer data at rest and in transit?" },
  { id: "SEC-02", section: "Compliance", question: "Do you hold a current SOC 2 Type II certification and ISO 27001 compliance?" },
  { id: "SEC-03", section: "Authentication", question: "Does the solution support SAML 2.0 SSO and mandatory Multi-Factor Authentication?" },
  { id: "SEC-04", section: "Disaster Recovery", question: "What are your guaranteed RTO, RPO, and monthly uptime SLAs?" },
  { id: "SEC-05", section: "Security Audits", question: "How often are third-party penetration tests conducted and critical vulnerabilities patched?" },
  { id: "SEC-06", section: "Integrations", question: "What is the REST API rate limit and does it support webhook HMAC signature verification?" }
];

document.addEventListener("DOMContentLoaded", async () => {
  await detectModeAndInit();
  loadSettingsUI();
});

async function detectModeAndInit() {
  try {
    const res = await fetch("/api/knowledge/sources", { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      isStaticMode = false;
      await loadKnowledgeSources();
      return;
    }
  } catch (e) {
    // API not available, running on static host (Hugging Face Static Space, Vercel, or GitHub Pages)
  }
  isStaticMode = true;
  document.getElementById("active-provider-pill").textContent = "Cloud Static Mode: 24/7 Autonomous Browser Engine";
  renderStaticKnowledgeSources();
}

// Tab switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.remove('text-white', 'bg-indigo-600', 'shadow');
    el.classList.add('text-slate-400');
  });

  const selectedPane = document.getElementById(`tab-${tabId}`);
  const selectedBtn = document.getElementById(`tab-btn-${tabId}`);
  if (selectedPane && selectedBtn) {
    selectedPane.classList.add('active');
    selectedBtn.classList.remove('text-slate-400');
    selectedBtn.classList.add('text-white', 'bg-indigo-600', 'shadow');
  }
}

// ----------------- KNOWLEDGE BASE -----------------

function renderStaticKnowledgeSources() {
  const listEl = document.getElementById("kb-list");
  if (!CLIENT_KB.sources || CLIENT_KB.sources.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No documents uploaded yet.</div>`;
    return;
  }
  listEl.innerHTML = CLIENT_KB.sources.map(s => `
    <div class="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
      <div class="flex items-center space-x-3">
        <i class="fa-solid fa-file-lines text-indigo-400"></i>
        <span class="font-medium text-slate-200">${s.filename}</span>
      </div>
      <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-mono">
        ${s.chunks} chunks (active)
      </span>
    </div>
  `).join("");
}

async function loadKnowledgeSources() {
  if (isStaticMode) {
    renderStaticKnowledgeSources();
    return;
  }
  try {
    const res = await fetch("/api/knowledge/sources");
    const data = await res.json();
    const listEl = document.getElementById("kb-list");

    if (!data.sources || data.sources.length === 0) {
      listEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No documents uploaded yet.</div>`;
      return;
    }

    listEl.innerHTML = data.sources.map(s => `
      <div class="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-file-lines text-indigo-400"></i>
          <span class="font-medium text-slate-200">${s.filename}</span>
        </div>
        <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-mono">
          ${s.chunks} chunks
        </span>
      </div>
    `).join("");
  } catch (err) {
    isStaticMode = true;
    renderStaticKnowledgeSources();
  }
}

async function handleKbUpload(files) {
  if (!files || files.length === 0) return;

  if (isStaticMode) {
    for (let f of files) {
      const text = await f.text();
      const chunks = text.split(/\n\s*\n/).filter(c => c.trim().length > 30);
      chunks.forEach((chunk, i) => {
        CLIENT_KB.documents.push({
          title: `${f.name} - Section ${i+1}`,
          content: chunk.trim()
        });
      });
      CLIENT_KB.sources.push({ filename: f.name, chunks: chunks.length || 1 });
    }
    renderStaticKnowledgeSources();
    alert(`Added ${files.length} document(s) to in-memory knowledge store!`);
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  try {
    const res = await fetch("/api/knowledge/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Indexed ${data.files.length} document(s) successfully! Total chunks: ${data.total_chunks}`);
      loadKnowledgeSources();
    } else {
      alert(data.detail || "Upload failed");
    }
  } catch (err) {
    alert("Error uploading documents: " + err.message);
  }
}

async function clearKnowledgeBase() {
  if (!confirm("Are you sure you want to clear all indexed knowledge documents?")) return;
  if (isStaticMode) {
    CLIENT_KB.sources = [];
    CLIENT_KB.documents = [];
    renderStaticKnowledgeSources();
    alert("Knowledge base cleared.");
    return;
  }
  try {
    const res = await fetch("/api/knowledge/clear", { method: "DELETE" });
    if (res.ok) {
      loadKnowledgeSources();
      alert("Knowledge base cleared.");
    }
  } catch (err) {
    alert("Error clearing knowledge base");
  }
}

async function testKnowledgeQuery() {
  const query = document.getElementById("kb-test-input").value.trim();
  if (!query) return;

  const resultContainer = document.getElementById("kb-test-result");
  const answerEl = document.getElementById("kb-test-answer");
  const sourcesEl = document.getElementById("kb-test-sources");

  answerEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>Analyzing knowledge base...`;
  resultContainer.classList.remove("hidden");

  if (isStaticMode) {
    const res = await synthesizeAnswerClientSide(query);
    answerEl.textContent = res.answer;
    sourcesEl.textContent = `Confidence: ${res.confidence} | Evidence: ${res.sources}`;
    return;
  }

  try {
    const res = await fetch("/api/rfp/answer-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query })
    });
    const data = await res.json();
    answerEl.textContent = data.answer;
    sourcesEl.textContent = `Confidence: ${data.confidence} | Evidence: ${data.sources}`;
  } catch (err) {
    const fallback = await synthesizeAnswerClientSide(query);
    answerEl.textContent = fallback.answer;
    sourcesEl.textContent = `Confidence: ${fallback.confidence} | Evidence: ${fallback.sources}`;
  }
}

// ----------------- RFP WORKFLOW -----------------

async function handleRfpUpload(file) {
  if (!file) return;

  if (isStaticMode && typeof XLSX !== 'undefined') {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      const parsedQuestions = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const qText = row[2] || row[1] || row[0];
        if (qText && String(qText).length > 5) {
          parsedQuestions.push({
            id: `Q-${i}`,
            section: row[1] ? String(row[1]) : "General",
            question: String(qText)
          });
        }
      }

      currentProjectId = "client_uploaded_project";
      currentQuestions = parsedQuestions;
      document.getElementById("active-filename").textContent = file.name;
      document.getElementById("active-count").textContent = parsedQuestions.length;
      document.getElementById("project-container").classList.remove("hidden");
      document.getElementById("btn-export-file").classList.add("hidden");
      renderQuestions(parsedQuestions);
      return;
    } catch (e) {
      console.warn("Client XLSX parse fallback:", e);
    }
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/rfp/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      currentProjectId = data.project_id;
      currentQuestions = data.preview;
      document.getElementById("active-filename").textContent = data.filename;
      document.getElementById("active-count").textContent = data.total_questions;
      document.getElementById("project-container").classList.remove("hidden");
      document.getElementById("btn-export-file").classList.add("hidden");
      renderQuestions(data.preview);
    } else {
      alert(data.detail || "Failed to parse RFP file");
    }
  } catch (err) {
    alert("Error uploading RFP file: " + err.message);
  }
}

async function loadSampleDemo() {
  if (isStaticMode) {
    currentProjectId = "sample-static-demo";
    currentQuestions = JSON.parse(JSON.stringify(SAMPLE_DEMO_QUESTIONS));
    document.getElementById("active-filename").textContent = "sample_vendor_questionnaire.xlsx";
    document.getElementById("active-count").textContent = currentQuestions.length;
    document.getElementById("project-container").classList.remove("hidden");
    document.getElementById("btn-export-file").classList.add("hidden");
    renderQuestions(currentQuestions);
    renderStaticKnowledgeSources();
    switchTab('filler');
    return;
  }

  try {
    const res = await fetch("/api/sample/load", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      currentProjectId = data.project_id;
      currentQuestions = data.questions;

      document.getElementById("active-filename").textContent = "sample_vendor_questionnaire.xlsx";
      document.getElementById("active-count").textContent = data.questions.length;
      document.getElementById("project-container").classList.remove("hidden");
      document.getElementById("btn-export-file").classList.add("hidden");

      renderQuestions(data.questions);
      loadKnowledgeSources();
      switchTab('filler');
    }
  } catch (err) {
    isStaticMode = true;
    loadSampleDemo();
  }
}

function renderQuestions(items) {
  const tbody = document.getElementById("questions-tbody");
  tbody.innerHTML = items.map((item, idx) => `
    <tr class="hover:bg-slate-800/40 transition" id="row-${item.id || idx}">
      <td class="py-3 px-4 font-mono text-[11px] text-slate-400">${item.id || idx + 1}</td>
      <td class="py-3 px-4 text-slate-300 font-medium">${item.section || 'General'}</td>
      <td class="py-3 px-4 text-white">${item.question}</td>
      <td class="py-3 px-4 text-slate-400 italic" id="ans-${item.id || idx}">
        ${item.answer ? `<span class="text-slate-200 not-italic">${item.answer}</span>` : '<span class="text-slate-500">Pending AI analysis...</span>'}
      </td>
      <td class="py-3 px-4 text-center" id="conf-${item.id || idx}">
        ${renderConfidenceBadge(item.confidence)}
      </td>
      <td class="py-3 px-4 text-center">
        <button onclick="reAnswerItem('${item.id || idx}', '${escapeQuotes(item.question)}', '${escapeQuotes(item.section || '')}')" class="text-indigo-400 hover:text-indigo-300 text-xs" title="Regenerate">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

function renderConfidenceBadge(conf) {
  if (!conf) return `<span class="text-slate-600">-</span>`;
  if (conf === "High") {
    return `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">High</span>`;
  } else if (conf === "Medium") {
    return `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">Medium</span>`;
  } else {
    return `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-semibold">Review</span>`;
  }
}

async function processAllQuestions() {
  if (!currentProjectId || !currentQuestions || currentQuestions.length === 0) {
    alert("Please upload an RFP or load the demo first!");
    return;
  }

  const progContainer = document.getElementById("progress-container");
  const progBar = document.getElementById("progress-bar");
  const progText = document.getElementById("progress-text");
  const btnProcess = document.getElementById("btn-process-all");

  progContainer.classList.remove("hidden");
  btnProcess.disabled = true;
  btnProcess.classList.add("opacity-50", "cursor-not-allowed");

  if (isStaticMode) {
    processedResults = [];
    for (let i = 0; i < currentQuestions.length; i++) {
      const q = currentQuestions[i];
      const p = Math.round(((i + 1) / currentQuestions.length) * 100);
      progBar.style.width = p + "%";
      progText.textContent = p + "%";

      const res = await synthesizeAnswerClientSide(q.question, q.section);
      processedResults.push({
        id: q.id,
        section: q.section,
        question: q.question,
        answer: res.answer,
        confidence: res.confidence,
        sources: res.sources
      });
      // Update row immediately
      const ansCell = document.getElementById(`ans-${q.id || i}`);
      const confCell = document.getElementById(`conf-${q.id || i}`);
      if (ansCell) ansCell.innerHTML = `<span class="text-slate-200 not-italic">${res.answer}</span>`;
      if (confCell) confCell.innerHTML = renderConfidenceBadge(res.confidence);
    }

    document.getElementById("btn-export-file").classList.remove("hidden");
    setTimeout(() => progContainer.classList.add("hidden"), 800);
    btnProcess.disabled = false;
    btnProcess.classList.remove("opacity-50", "cursor-not-allowed");
    return;
  }

  // Backend mode
  let p = 15;
  progBar.style.width = p + "%";
  progText.textContent = p + "%";
  const timer = setInterval(() => {
    if (p < 85) {
      p += 10;
      progBar.style.width = p + "%";
      progText.textContent = p + "%";
    }
  }, 250);

  try {
    const res = await fetch("/api/rfp/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: currentProjectId })
    });
    const data = await res.json();
    clearInterval(timer);

    progBar.style.width = "100%";
    progText.textContent = "100%";

    if (res.ok) {
      processedResults = data.results;
      renderQuestions(data.results);
      document.getElementById("btn-export-file").classList.remove("hidden");
      setTimeout(() => progContainer.classList.add("hidden"), 1000);
    } else {
      alert(data.detail || "Processing failed");
    }
  } catch (err) {
    clearInterval(timer);
    alert("Error processing RFP: " + err.message);
  } finally {
    btnProcess.disabled = false;
    btnProcess.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

async function reAnswerItem(rowId, question, section) {
  const ansCell = document.getElementById(`ans-${rowId}`);
  const confCell = document.getElementById(`conf-${rowId}`);
  if (ansCell) ansCell.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>Regenerating...`;

  if (isStaticMode) {
    const res = await synthesizeAnswerClientSide(question, section);
    if (ansCell) ansCell.innerHTML = `<span class="text-slate-200">${res.answer}</span>`;
    if (confCell) confCell.innerHTML = renderConfidenceBadge(res.confidence);
    return;
  }

  try {
    const res = await fetch("/api/rfp/answer-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, section })
    });
    const data = await res.json();
    if (ansCell) ansCell.innerHTML = `<span class="text-slate-200">${data.answer}</span>`;
    if (confCell) confCell.innerHTML = renderConfidenceBadge(data.confidence);
  } catch (err) {
    const res = await synthesizeAnswerClientSide(question, section);
    if (ansCell) ansCell.innerHTML = `<span class="text-slate-200">${res.answer}</span>`;
    if (confCell) confCell.innerHTML = renderConfidenceBadge(res.confidence);
  }
}

async function exportFilledRFP() {
  if (!currentProjectId) return;

  // Use SheetJS client-side export if in static mode or fallback
  if (isStaticMode || typeof XLSX !== 'undefined') {
    try {
      const exportData = [
        ["Item ID", "Section", "Question / Requirement", "RFPilot Verified Answer", "Confidence", "Evidence & Citations"]
      ];
      const itemsToExport = processedResults.length > 0 ? processedResults : currentQuestions;
      itemsToExport.forEach(it => {
        exportData.push([
          it.id || "",
          it.section || "",
          it.question || "",
          it.answer || "",
          it.confidence || "",
          it.sources || ""
        ]);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, "Completed Security RFP");
      const filename = `Answered_${document.getElementById("active-filename").textContent || "RFP.xlsx"}`;
      XLSX.writeFile(wb, filename);
      return;
    } catch (e) {
      console.warn("SheetJS export fallback:", e);
    }
  }

  try {
    const res = await fetch("/api/rfp/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: currentProjectId, items: processedResults })
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Answered_${document.getElementById("active-filename").textContent}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      alert("Failed to export file");
    }
  } catch (err) {
    alert("Export error: " + err.message);
  }
}

// ----------------- CLIENT-SIDE AI AGENT SYNTHESIZER -----------------

async function synthesizeAnswerClientSide(question, section = "") {
  const qLower = question.toLowerCase();
  const tokens = qLower.split(/[\W_]+/).filter(w => w.length > 2);

  // Score documents
  let bestDoc = null;
  let bestScore = -1;

  for (let doc of CLIENT_KB.documents) {
    let score = 0;
    const docLower = (doc.title + " " + doc.content).toLowerCase();
    tokens.forEach(t => {
      if (docLower.includes(t)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  // Check if user has configured Groq key in localStorage
  const savedGroqKey = localStorage.getItem("rfpilot_groq_key");
  if (savedGroqKey && savedGroqKey.startsWith("gsk_")) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${savedGroqKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are the RFPilot Security & Compliance Officer. Formulate a compliant, professional first-person company answer using the provided context."
            },
            {
              role: "user",
              content: `Context:\n${bestDoc ? bestDoc.content : ""}\n\nQuestion: ${question}\n\nProvide the response directly.`
            }
          ],
          temperature: 0.2,
          max_tokens: 300
        })
      });
      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData.choices[0].message.content.trim();
        return {
          answer: text,
          confidence: "High",
          sources: bestDoc ? bestDoc.title : "Groq Llama 3.3"
        };
      }
    } catch (e) {
      console.warn("Groq client call error, falling back to synthesizer:", e);
    }
  }

  // Built-in Synthesizer
  if (!bestDoc || bestScore < 1) {
    return {
      answer: "We are currently evaluating this specific requirement in our architectural roadmap. Further documentation is available upon request.",
      confidence: "Review",
      sources: "Roadmap Evaluation"
    };
  }

  const sentences = bestDoc.content.split(". ").map(s => s.trim());
  let matchingSentences = sentences.filter(s => {
    const sLower = s.toLowerCase();
    return tokens.some(t => sLower.includes(t));
  });

  if (matchingSentences.length === 0) matchingSentences = sentences.slice(0, 2);
  let synthesized = matchingSentences.join(". ");
  if (!synthesized.endsWith(".")) synthesized += ".";

  const confidence = bestScore >= 3 ? "High" : "Medium";
  return {
    answer: `Yes, ${synthesized.charAt(0).toLowerCase() + synthesized.slice(1)}`,
    confidence: confidence,
    sources: bestDoc.title
  };
}

// ----------------- SETTINGS -----------------

function loadSettingsUI() {
  const groqKey = localStorage.getItem("rfpilot_groq_key");
  const geminiKey = localStorage.getItem("rfpilot_gemini_key");
  if (groqKey) document.getElementById("settings-groq-key").value = groqKey;
  if (geminiKey) document.getElementById("settings-gemini-key").value = geminiKey;
}

function saveSettings(e) {
  e.preventDefault();
  const groqKey = document.getElementById("settings-groq-key").value.trim();
  const geminiKey = document.getElementById("settings-gemini-key").value.trim();
  if (groqKey) localStorage.setItem("rfpilot_groq_key", groqKey);
  if (geminiKey) localStorage.setItem("rfpilot_gemini_key", geminiKey);
  alert("Settings saved successfully in your browser!");
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
