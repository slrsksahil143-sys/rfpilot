import os
import re
import math
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from app.config import KNOWLEDGE_DIR

INDEX_FILE = KNOWLEDGE_DIR / "knowledge_index.json"

def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def tokenize(text: str) -> List[str]:
    words = re.findall(r'\b[a-zA-Z0-9_\-]{2,}\b', text.lower())
    # remove very common stop words
    stopwords = {
        "the", "and", "is", "in", "to", "of", "for", "with", "a", "an", "on", "at",
        "by", "this", "that", "it", "from", "be", "are", "or", "as", "was", "we", "our"
    }
    return [w for w in words if w not in stopwords]

class KnowledgeBase:
    def __init__(self):
        self.documents: List[Dict[str, Any]] = []
        self.doc_count: int = 0
        self.vocab_df: Dict[str, int] = {}
        self.load_index()

    def chunk_text(self, text: str, source_name: str, chunk_size: int = 120, overlap: int = 25) -> List[Dict[str, Any]]:
        # Split into paragraphs or sentences
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        chunks = []
        current_words = []
        current_source_info = source_name

        for p in paragraphs:
            words = p.split()
            if not words:
                continue
            if len(current_words) + len(words) <= chunk_size:
                current_words.extend(words)
            else:
                chunk_str = " ".join(current_words)
                chunks.append({
                    "id": f"{source_name}_{len(chunks)}",
                    "source": source_name,
                    "text": chunk_str,
                    "tokens": tokenize(chunk_str)
                })
                # Keep overlap
                current_words = current_words[-overlap:] + words

        if current_words:
            chunk_str = " ".join(current_words)
            chunks.append({
                "id": f"{source_name}_{len(chunks)}",
                "source": source_name,
                "text": chunk_str,
                "tokens": tokenize(chunk_str)
            })
        return chunks

    def add_document(self, filename: str, content: str) -> int:
        # Remove existing chunks for this file if re-uploaded
        self.documents = [doc for doc in self.documents if doc.get("source") != filename]
        
        new_chunks = self.chunk_text(content, filename)
        self.documents.extend(new_chunks)
        self.rebuild_df()
        self.save_index()
        return len(new_chunks)

    def rebuild_df(self):
        self.doc_count = len(self.documents)
        self.vocab_df = {}
        for doc in self.documents:
            unique_tokens = set(doc.get("tokens", []))
            for token in unique_tokens:
                self.vocab_df[token] = self.vocab_df.get(token, 0) + 1

    def search(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        if not self.documents:
            return []
            
        q_tokens = tokenize(query)
        if not q_tokens:
            return self.documents[:top_k]

        scores = []
        n = max(1, self.doc_count)

        for doc in self.documents:
            score = 0.0
            doc_tokens = doc.get("tokens", [])
            doc_len = len(doc_tokens) or 1
            tf_dict = {}
            for t in doc_tokens:
                tf_dict[t] = tf_dict.get(t, 0) + 1

            for qt in q_tokens:
                tf = tf_dict.get(qt, 0)
                if tf > 0:
                    df = self.vocab_df.get(qt, 1)
                    idf = math.log((n - df + 0.5) / (df + 0.5) + 1.0)
                    # BM25-like scoring
                    score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (doc_len / 100.0))))

            # Exact phrase match boost
            q_clean = query.lower().strip()
            if len(q_clean) > 4 and q_clean in doc.get("text", "").lower():
                score += 5.0

            if score > 0:
                scores.append((score, doc))

        scores.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, doc in scores[:top_k]:
            results.append({
                "score": round(score, 3),
                "source": doc["source"],
                "text": doc["text"]
            })
        return results

    def list_sources(self) -> List[Dict[str, Any]]:
        sources: Dict[str, int] = {}
        for doc in self.documents:
            src = doc.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1
        return [{"filename": k, "chunks": v} for k, v in sources.items()]

    def clear(self):
        self.documents = []
        self.doc_count = 0
        self.vocab_df = {}
        self.save_index()

    def save_index(self):
        with open(INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "doc_count": self.doc_count,
                "vocab_df": self.vocab_df,
                "documents": self.documents
            }, f)

    def load_index(self):
        if INDEX_FILE.exists():
            try:
                with open(INDEX_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.doc_count = data.get("doc_count", 0)
                    self.vocab_df = data.get("vocab_df", {})
                    self.documents = data.get("documents", [])
            except Exception:
                self.documents = []
