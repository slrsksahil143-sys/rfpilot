import shutil
import uuid
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import (
    BASE_DIR, DATA_DIR, KNOWLEDGE_DIR, UPLOADS_DIR, EXPORTS_DIR,
    Settings, load_settings, save_settings
)
from app.knowledge_base import KnowledgeBase
from app.file_handlers import (
    extract_text_from_file, parse_rfp_excel, parse_rfp_csv,
    parse_rfp_docx, export_filled_excel, export_filled_docx
)
from app.agent import RFPAgent

app = FastAPI(
    title="RFPilot API",
    description="Autonomous Enterprise RFP & Security Questionnaire Completion Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

kb = KnowledgeBase()
settings = load_settings()
agent = RFPAgent(kb, settings)

# Mount static files
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# In-memory session tracking for active RFP project
ACTIVE_RFPS: Dict[str, Dict[str, Any]] = {}

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>RFPilot backend is running. Frontend static files pending.</h1>")

@app.get("/style.css")
async def serve_css():
    css_file = STATIC_DIR / "style.css"
    if css_file.exists():
        return FileResponse(css_file, media_type="text/css")
    return HTMLResponse("", status_code=404)

@app.get("/app.js")
async def serve_js():
    js_file = STATIC_DIR / "app.js"
    if js_file.exists():
        return FileResponse(js_file, media_type="application/javascript")
    return HTMLResponse("", status_code=404)

# ----------------- KNOWLEDGE BASE ENDPOINTS -----------------

@app.post("/api/knowledge/upload")
async def upload_knowledge_files(files: List[UploadFile] = File(...)):
    uploaded_info = []
    for file in files:
        safe_name = f"{uuid.uuid4().hex[:6]}_{file.filename}"
        dest_path = KNOWLEDGE_DIR / safe_name
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Extract text & index
        text = extract_text_from_file(dest_path)
        chunks_added = kb.add_document(file.filename, text)
        uploaded_info.append({
            "filename": file.filename,
            "size_bytes": dest_path.stat().st_size,
            "chunks_indexed": chunks_added
        })
    return {"status": "success", "files": uploaded_info, "total_chunks": kb.doc_count}

@app.get("/api/knowledge/sources")
async def get_knowledge_sources():
    return {
        "sources": kb.list_sources(),
        "total_documents": len(kb.list_sources()),
        "total_chunks": kb.doc_count
    }

@app.delete("/api/knowledge/clear")
async def clear_knowledge():
    kb.clear()
    for item in KNOWLEDGE_DIR.glob("*"):
        if item.is_file() and item.name != "knowledge_index.json":
            try:
                item.unlink()
            except Exception:
                pass
    return {"status": "success", "message": "Knowledge base cleared."}

# ----------------- RFP WORKFLOW ENDPOINTS -----------------

@app.post("/api/rfp/upload")
async def upload_rfp_file(file: UploadFile = File(...)):
    project_id = str(uuid.uuid4())
    safe_name = f"{project_id}_{file.filename}"
    upload_path = UPLOADS_DIR / safe_name
    
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = upload_path.suffix.lower()
    if ext in [".xlsx", ".xls"]:
        questions = parse_rfp_excel(upload_path)
    elif ext == ".csv":
        questions = parse_rfp_csv(upload_path)
    elif ext == ".docx":
        questions = parse_rfp_docx(upload_path)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .xlsx, .csv, or .docx")

    if not questions:
        raise HTTPException(status_code=400, detail="Could not detect questions in file. Please ensure standard tabular format.")

    ACTIVE_RFPS[project_id] = {
        "project_id": project_id,
        "filename": file.filename,
        "file_path": str(upload_path),
        "questions": questions,
        "results": []
    }

    return {
        "project_id": project_id,
        "filename": file.filename,
        "total_questions": len(questions),
        "preview": questions[:5]
    }

class ProcessRFPRequest(BaseModel):
    project_id: str

@app.post("/api/rfp/process")
async def process_rfp_all(req: ProcessRFPRequest):
    if req.project_id not in ACTIVE_RFPS:
        raise HTTPException(status_code=404, detail="RFP project not found")
        
    project = ACTIVE_RFPS[req.project_id]
    questions = project["questions"]
    results = []

    for q in questions:
        res = await agent.answer_question(q["question"], section=q.get("section", ""))
        item = {
            "id": q.get("id"),
            "section": q.get("section"),
            "sheet": q.get("sheet", "Sheet1"),
            "row_index": q.get("row_index", 2),
            "question": q.get("question"),
            "answer": res["answer"],
            "confidence": res["confidence"],
            "sources": res["sources"]
        }
        results.append(item)

    project["results"] = results
    return {
        "status": "completed",
        "project_id": req.project_id,
        "total_processed": len(results),
        "results": results
    }

class SingleQuestionRequest(BaseModel):
    question: str
    section: Optional[str] = ""

@app.post("/api/rfp/answer-single")
async def answer_single(req: SingleQuestionRequest):
    res = await agent.answer_question(req.question, section=req.section or "")
    return res

class ExportRequest(BaseModel):
    project_id: str
    items: Optional[List[Dict[str, Any]]] = None

@app.post("/api/rfp/export")
async def export_rfp(req: ExportRequest):
    if req.project_id not in ACTIVE_RFPS:
        raise HTTPException(status_code=404, detail="RFP project not found")
        
    project = ACTIVE_RFPS[req.project_id]
    items = req.items if req.items is not None else project.get("results", [])
    
    orig_path = Path(project["file_path"])
    export_filename = f"Answered_{orig_path.name}"
    export_path = EXPORTS_DIR / export_filename
    
    if orig_path.suffix.lower() in [".xlsx", ".xls"]:
        export_filled_excel(orig_path, items, export_path)
    elif orig_path.suffix.lower() == ".docx":
        export_filled_docx(orig_path, items, export_path)
    else:
        # Default to Excel export
        export_path = export_path.with_suffix(".xlsx")
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Answered RFP"
        ws.append(["ID", "Section", "Question", "Answer", "Confidence", "Sources"])
        for it in items:
            ws.append([it.get("id"), it.get("section"), it.get("question"), it.get("answer"), it.get("confidence"), it.get("sources")])
        wb.save(export_path)

    return FileResponse(
        path=str(export_path),
        filename=export_filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

# ----------------- SETTINGS & CONFIG -----------------

@app.get("/api/settings")
async def get_settings():
    curr = load_settings()
    masked = curr.model_copy()
    if masked.groq_api_key:
        masked.groq_api_key = masked.groq_api_key[:6] + "..." + masked.groq_api_key[-4:]
    if masked.gemini_api_key:
        masked.gemini_api_key = masked.gemini_api_key[:6] + "..." + masked.gemini_api_key[-4:]
    if masked.openai_api_key:
        masked.openai_api_key = masked.openai_api_key[:6] + "..." + masked.openai_api_key[-4:]
    return masked

@app.post("/api/settings")
async def update_settings(new_settings: Settings):
    global settings, agent
    save_settings(new_settings)
    settings = new_settings
    agent = RFPAgent(kb, settings)
    return {"status": "success", "message": "Settings updated successfully"}

# ----------------- 1-CLICK SAMPLE DEMO LOAD -----------------

SAMPLE_WHITE_PAPER = """ACME CLOUD ENTERPRISE SECURITY & ARCHITECTURE WHITEPAPER

1. DATA ENCRYPTION & KEY MANAGEMENT
All customer data in transit is encrypted using TLS 1.3 with AES-256-GCM cipher suites. Data at rest is encrypted using FIPS 140-2 validated AES-256 encryption. Encryption keys are managed through AWS KMS with automated 90-day key rotation and hardware security module (HSM) backing. Customers can optionally bring their own keys (BYOK).

2. SOC2 & COMPLIANCE CERTIFICATIONS
Acme Cloud maintains annual SOC 2 Type II compliance reports covering Security, Availability, and Confidentiality trust principles. Audits are performed independently by Schellman & Company. We are fully compliant with GDPR, HIPAA (BAA available for Enterprise tier), and ISO 27001:2022 standards.

3. ACCESS CONTROL & AUTHENTICATION
Our platform enforces Role-Based Access Control (RBAC) and Least Privilege principles. Enterprise plans include SAML 2.0 and OIDC single sign-on (SSO) with Okta, Azure AD, PingIdentity, and Google Workspace. Multi-Factor Authentication (MFA) via TOTP or WebAuthn/FIDO2 hardware keys is mandatory for all administrative access.

4. BACKUP, DISASTER RECOVERY & SLA
Data backups are executed continuously with point-in-time recovery (PITR) for the past 35 days, replicated across three separate AWS availability zones. Our Disaster Recovery SLA guarantees a Recovery Point Objective (RPO) of < 15 minutes and a Recovery Time Objective (RTO) of < 1 hour. We guarantee a 99.95% monthly uptime SLA.

5. PENETRATION TESTING & VULNERABILITY MANAGEMENT
Independent third-party penetration tests are conducted biannually. Continuous automated vulnerability scanning of container images and dependencies occurs daily using Snyk and Wiz. Critical vulnerabilities must be patched within 24 hours under our remediation SLA.

6. API RATE LIMITS & WEBHOOKS
Enterprise REST APIs support 1,200 requests per minute with scalable burst allowances. Webhooks support idempotent deliveries with HMAC-SHA256 signature verification and exponential backoff retry.
"""

@app.post("/api/sample/load")
async def load_sample_dataset():
    # 1. Add sample whitepaper to KB
    kb.add_document("Acme_Security_Whitepaper_2026.txt", SAMPLE_WHITE_PAPER)
    
    # 2. Create sample RFP questions
    sample_questions = [
        {"id": "SEC-01", "section": "Encryption", "question": "What encryption standards are used for customer data at rest and in transit?", "sheet": "Security & Architecture", "row_index": 2},
        {"id": "SEC-02", "section": "Compliance", "question": "Do you hold a current SOC 2 Type II certification and ISO 27001 compliance?", "sheet": "Security & Architecture", "row_index": 3},
        {"id": "SEC-03", "section": "Authentication", "question": "Does the solution support SAML 2.0 SSO and mandatory Multi-Factor Authentication?", "sheet": "Security & Architecture", "row_index": 4},
        {"id": "SEC-04", "section": "Disaster Recovery", "question": "What are your guaranteed RTO, RPO, and monthly uptime SLAs?", "sheet": "Security & Architecture", "row_index": 5},
        {"id": "SEC-05", "section": "Security Audits", "question": "How often are third-party penetration tests conducted and critical vulnerabilities patched?", "sheet": "Security & Architecture", "row_index": 6},
        {"id": "SEC-06", "section": "Integrations", "question": "What is the REST API rate limit and does it support webhook HMAC signature verification?", "sheet": "Security & Architecture", "row_index": 7},
    ]

    project_id = "sample-demo-project"
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Security & Architecture"
    ws.append(["Item ID", "Section", "Question / Requirement"])
    for sq in sample_questions:
        ws.append([sq["id"], sq["section"], sq["question"]])
    
    sample_file_path = UPLOADS_DIR / "sample_vendor_questionnaire.xlsx"
    wb.save(sample_file_path)

    ACTIVE_RFPS[project_id] = {
        "project_id": project_id,
        "filename": "sample_vendor_questionnaire.xlsx",
        "file_path": str(sample_file_path),
        "questions": sample_questions,
        "results": []
    }

    return {
        "status": "success",
        "message": "Sample Acme security whitepaper indexed and 6-question vendor questionnaire loaded!",
        "project_id": project_id,
        "questions": sample_questions,
        "kb_sources": kb.list_sources()
    }
