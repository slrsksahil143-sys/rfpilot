import httpx
import re
from typing import Dict, Any, List, Optional
from app.config import Settings
from app.knowledge_base import KnowledgeBase

SYSTEM_PROMPT = """You are RFPilot, an expert B2B RFP (Request for Proposal) and Enterprise Security Questionnaire response agent.
Your mission is to provide accurate, professional, compliant, and concise answers to enterprise customer questionnaires based strictly on the provided company knowledge base.

Guidelines:
1. Speak in the first person on behalf of the company ("We provide...", "Our platform encrypts...", "Yes, we support...").
2. Be direct, authoritative, and clear.
3. If the knowledge base explicitly supports the requirement, state "Yes" or confirm compliance, and concisely explain the control or capability.
4. If the knowledge base does not mention the capability or mentions that it is not supported, politely and transparently state the limitation or that this feature is on our future roadmap.
5. Keep responses concise (typically 1-3 sentences) suitable for an Excel cell.
"""

def heuristic_synthesizer(question: str, context_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not context_chunks:
        return {
            "answer": "Information regarding this requirement is currently under review by our compliance and architecture team. Please contact your account representative for specific documentation.",
            "confidence": "Low",
            "sources": "None"
        }

    top_chunk = context_chunks[0]
    score = top_chunk.get("score", 0.0)
    top_text = top_chunk.get("text", "")
    source_name = top_chunk.get("source", "Knowledge Base")

    # Clean text to extract most relevant sentence
    sentences = [s.strip() for s in re.split(r'[.\n]+', top_text) if len(s.strip()) > 15]
    
    q_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', question.lower()))
    best_sentences = []
    
    for s in sentences:
        s_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', s.lower()))
        overlap = len(q_words.intersection(s_words))
        if overlap > 0:
            best_sentences.append((overlap, s))
            
    best_sentences.sort(key=lambda x: x[0], reverse=True)
    
    if best_sentences:
        chosen = " ".join([s[1] for s in best_sentences[:2]])
        answer = f"Yes. {chosen}."
    else:
        answer = f"Yes. As outlined in our documentation, {top_text[:200]}..."
        
    confidence = "High" if score >= 4.0 else ("Medium" if score >= 2.0 else "Low")
    all_sources = list({c.get("source", "") for c in context_chunks if c.get("source")})
    
    return {
        "answer": answer,
        "confidence": confidence,
        "sources": ", ".join(all_sources) or source_name
    }

class RFPAgent:
    def __init__(self, kb: KnowledgeBase, settings: Settings):
        self.kb = kb
        self.settings = settings

    async def answer_question(self, question: str, section: str = "") -> Dict[str, Any]:
        # 1. Retrieve relevant context
        search_query = f"{section} {question}".strip()
        context_chunks = self.kb.search(search_query, top_k=3)
        
        if not context_chunks:
            return {
                "answer": "This requirement is not explicitly documented in our current knowledge repository. Please request additional documentation.",
                "confidence": "Low",
                "sources": "None"
            }

        context_text = "\n---\n".join([f"Source [{c['source']}]: {c['text']}" for c in context_chunks])
        user_prompt = f"""KNOWLEDGE BASE CONTEXT:
{context_text}

QUESTION / REQUIREMENT:
{question}

Provide the official company response:"""

        # 2. Try configured LLM Provider
        provider = self.settings.provider.lower()

        # A: Groq API (High Speed Free Tier)
        if provider == "groq" and self.settings.groq_api_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.settings.groq_api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": self.settings.groq_model,
                            "messages": [
                                {"role": "system", "content": SYSTEM_PROMPT},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.2,
                            "max_tokens": 200
                        }
                    )
                    if resp.status_code == 200:
                        ans_text = resp.json()["choices"][0]["message"]["content"].strip()
                        sources = ", ".join(list({c['source'] for c in context_chunks}))
                        top_score = context_chunks[0]["score"]
                        confidence = "High" if top_score >= 3.0 else ("Medium" if top_score >= 1.5 else "Low")
                        return {"answer": ans_text, "confidence": confidence, "sources": sources}
            except Exception as e:
                print(f"Groq API error: {e}")

        # B: Google Gemini API (Free Tier)
        elif provider == "gemini" and self.settings.gemini_api_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.settings.gemini_model}:generateContent?key={self.settings.gemini_api_key}"
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json={
                            "contents": [{"parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_prompt}"}]}],
                            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 200}
                        }
                    )
                    if resp.status_code == 200:
                        ans_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                        sources = ", ".join(list({c['source'] for c in context_chunks}))
                        top_score = context_chunks[0]["score"]
                        confidence = "High" if top_score >= 3.0 else ("Medium" if top_score >= 1.5 else "Low")
                        return {"answer": ans_text, "confidence": confidence, "sources": sources}
            except Exception as e:
                print(f"Gemini API error: {e}")

        # C: Local Ollama (Free Offline)
        elif provider == "ollama":
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{self.settings.ollama_url}/api/chat",
                        json={
                            "model": self.settings.ollama_model,
                            "messages": [
                                {"role": "system", "content": SYSTEM_PROMPT},
                                {"role": "user", "content": user_prompt}
                            ],
                            "stream": False
                        }
                    )
                    if resp.status_code == 200:
                        ans_text = resp.json()["message"]["content"].strip()
                        sources = ", ".join(list({c['source'] for c in context_chunks}))
                        top_score = context_chunks[0]["score"]
                        confidence = "High" if top_score >= 3.0 else ("Medium" if top_score >= 1.5 else "Low")
                        return {"answer": ans_text, "confidence": confidence, "sources": sources}
            except Exception as e:
                print(f"Ollama local error: {e}")

        # D: Intelligent Built-in Semantic Synthesizer Fallback
        return heuristic_synthesizer(question, context_chunks)
