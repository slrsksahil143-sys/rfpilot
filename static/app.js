// RFPilot Frontend Logic

let currentProjectId = null;
let currentQuestions = [];
let processedResults = [];

document.addEventListener("DOMContentLoaded", () => {
  loadKnowledgeSources();
  loadSettingsUI();
});

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

async function loadKnowledgeSources() {
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
    console.error("Failed to load KB sources:", err);
  }
}

async function handleKbUpload(files) {
  if (!files || files.length === 0) return;
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

  try {
    const res = await fetch("/api/rfp/answer-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonPayload({ question: query })
    });
    const data = await res.json();
    answerEl.textContent = data.answer;
    sourcesEl.textContent = `Confidence: ${data.confidence} | Evidence: ${data.sources}`;
  } catch (err) {
    answerEl.textContent = "Error running query: " + err.message;
  }
}

// ----------------- RFP WORKFLOW -----------------

async function handleRfpUpload(file) {
  if (!file) return;
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
      currentQuestions = data.preview; // wait, let's load all or render
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
    alert("Error loading demo: " + err.message);
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
  if (!currentProjectId) {
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

  // Animate progress bar
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
      body: jsonPayload({ project_id: currentProjectId })
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

  try {
    const res = await fetch("/api/rfp/answer-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonPayload({ question, section })
    });
    const data = await res.json();
    if (ansCell) ansCell.innerHTML = `<span class="text-slate-200">${data.answer}</span>`;
    if (confCell) confCell.innerHTML = renderConfidenceBadge(data.confidence);
  } catch (err) {
    if (ansCell) ansCell.textContent = "Error regenerating";
  }
}

async function exportFilledRFP() {
  if (!currentProjectId) return;
  try {
    const res = await fetch("/api/rfp/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonPayload({ project_id: currentProjectId, items: processedResults })
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

// ----------------- SETTINGS -----------------

async function loadSettingsUI() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.provider) document.getElementById("settings-provider").value = data.provider;
    if (data.ollama_url) document.getElementById("settings-ollama-url").value = data.ollama_url;
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    provider: document.getElementById("settings-provider").value,
    groq_api_key: document.getElementById("settings-groq-key").value.trim(),
    gemini_api_key: document.getElementById("settings-gemini-key").value.trim(),
    ollama_url: document.getElementById("settings-ollama-url").value.trim()
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonPayload(payload)
    });
    if (res.ok) {
      alert("Settings saved successfully!");
      document.getElementById("active-provider-pill").textContent = `Engine: ${payload.provider.toUpperCase()}`;
    }
  } catch (err) {
    alert("Error saving settings: " + err.message);
  }
}

function jsonPayload(obj) {
  return JSON.stringify(obj);
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
