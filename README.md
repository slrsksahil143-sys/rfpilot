---
title: RFPilot - B2B RFP Agent
emoji: 🚀
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 RFPilot — Autonomous B2B RFP & Security Questionnaire Agent

**RFPilot** is an AI agent platform that enables B2B companies, SaaS startups, and vendors to complete 50-to-150 question RFPs (Requests for Proposal) and Vendor Security Questionnaires (SOC2, ISO 27001, GDPR, IT Architecture) in minutes instead of weeks.

---

## 💡 The Problem & Business Opportunity
* Enterprise deals routinely require a 100+ question vendor security spreadsheet.
* B2B companies pay **$75,000 – $110,000/year** for full-time proposal managers or **$5,000 – $15,000 per RFP** to consultants.
* **Our Solution:** The client uploads their company security whitepapers/docs once. Whenever they get an RFP spreadsheet from a buyer, RFPilot reads every question, formulates verified first-person company answers, cites exact evidence, and exports the filled Excel/Word file.

---

## ⚡ Quick Start (Local Machine)

1. **Activate the virtual environment:**
   ```bash
   .venv\Scripts\activate
   ```

2. **Run the server:**
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```

3. **Open in browser:**
   ```
   http://localhost:8000
   ```
   * Click **"⚡ 1-Click Demo"** to instantly test the agent with a pre-configured enterprise security whitepaper and a 6-question vendor spreadsheet!

---

## ☁️ How to Run 24/7 in the Cloud for $0 (Zero Laptop Keeping Open)

You **never** need to leave your laptop on. You can host this 24/7 for free using **Hugging Face Spaces**:

1. Go to [Hugging Face Spaces](https://huggingface.co/spaces) (Free account).
2. Click **Create new Space**.
3. Choose **Docker** as the Space SDK.
4. Set visibility to **Public** (or Private).
5. Push this repository or upload the files.
6. Under **Settings > Variables & Secrets**, add your free Groq API key:
   - `GROQ_API_KEY`: `your_free_groq_api_key`
7. ✨ Your website is now live 24/7 on `https://your-username-rfpilot.hf.space` at **$0 cost**!

---

## 💰 Monetization & Sales Playbook

### Pricing Strategy
* **Starter / Pay-As-You-Go:** **$49 per completed RFP file** (Zero risk for client to try).
* **Growth:** **$199 / month** (Up to 5 completed RFPs + unlimited knowledge doc updates).
* **Enterprise:** **$499 / month** (Unlimited RFPs + Custom API Integration + Team seats).

### Who to Sell to
1. **B2B SaaS Founders & Sales Directors** on LinkedIn (search for "Head of Sales", "VP Revenue", "Security Officer").
2. **Sales Engineers & Solutions Architects** who complain about wasting weekends filling Excel questionnaires.

---

## 🛠️ Tech Stack
* **Backend:** FastAPI, Uvicorn, Python 3.11+
* **Document Parsing & Generation:** `openpyxl` (Excel), `python-docx` (Word), `python-multipart`
* **Knowledge Retrieval:** In-memory BM25 + Semantic Term Matcher with source chunk attribution
* **LLM Engine:** Multi-provider support (Groq Cloud Free, Google Gemini Free, Local Ollama, OpenAI)
* **Frontend:** Modern Tailwind CSS + Vanilla JS (Zero build-step required, blazing fast)
