from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from app.schemas.knowledge import KnowledgeSourceCreate, KnowledgeSourceResponse
from app.core.security import get_current_user
from app.database import get_database
import uuid

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])

INITIAL_KNOWLEDGE_SOURCES: List[dict] = [
  {
    "id": "ks-1",
    "name": "Brand_Voice_Guidelines_2026.pdf",
    "type": "pdf",
    "sizeOrTokens": "2.4 MB",
    "workspaceId": "ws-1",
    "dateAdded": "2 hours ago",
    "status": "indexed"
  },
  {
    "id": "ks-2",
    "name": "https://docs.reamarc.ai/architecture",
    "type": "url",
    "sizeOrTokens": "45k tokens",
    "workspaceId": "ws-2",
    "dateAdded": "Yesterday",
    "status": "indexed"
  },
  {
    "id": "ks-3",
    "name": "Q3_Product_Deck.pdf",
    "type": "pdf",
    "sizeOrTokens": "1.8 MB",
    "workspaceId": "ws-1",
    "dateAdded": "3 days ago",
    "status": "indexed"
  }
]

def normalize_knowledge_source(doc: dict) -> dict:
    """Safely map any existing MongoDB document (legacy or new) to KnowledgeSourceResponse structure."""
    doc_type = doc.get("type", "pdf")
    if doc_type == "website":
        doc_type = "url"
    elif doc_type not in ["pdf", "url"]:
        doc_type = "pdf"

    return {
        "id": str(doc.get("id", f"ks-{uuid.uuid4().hex[:8]}")),
        "name": str(doc.get("name") or doc.get("title") or "Knowledge Source Document"),
        "type": doc_type,
        "sizeOrTokens": str(doc.get("sizeOrTokens") or "1.5 MB"),
        "workspaceId": str(doc.get("workspaceId") or doc.get("workspace_id") or "ws-1"),
        "dateAdded": str(doc.get("dateAdded") or doc.get("lastSynced") or "Just now"),
        "status": "indexed" if "indexed" in str(doc.get("status", "")).lower() else "processing",
    }

@router.get("", response_model=List[KnowledgeSourceResponse])
async def list_knowledge_sources(workspace_id: Optional[str] = None):
    db = get_database()
    if db is not None:
        # Check both workspaceId and workspace_id for legacy compatibility
        query = {}
        if workspace_id:
            query = {"$or": [{"workspaceId": workspace_id}, {"workspace_id": workspace_id}]}
            
        cursor = db.knowledge_sources.find(query, {"_id": 0})
        raw_sources = await cursor.to_list(length=100)
        return [normalize_knowledge_source(s) for s in raw_sources]


    if workspace_id:
        return [s for s in INITIAL_KNOWLEDGE_SOURCES if s["workspaceId"] == workspace_id]
    return INITIAL_KNOWLEDGE_SOURCES

@router.post("", response_model=KnowledgeSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge_source(
    source_in: KnowledgeSourceCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    source_id = f"ks-{uuid.uuid4().hex[:8]}"
    
    new_source = {
        "id": source_id,
        "name": source_in.name,
        "type": source_in.type,
        "sizeOrTokens": source_in.sizeOrTokens,
        "workspaceId": source_in.workspaceId,
        "dateAdded": "Just now",
        "status": "indexed",
        "user_id": current_user["id"],
    }

    
    if db is not None:
        await db.knowledge_sources.insert_one(new_source.copy())
    else:
        INITIAL_KNOWLEDGE_SOURCES.insert(0, new_source)
        
    return new_source

@router.delete("/{source_id}")
async def delete_knowledge_source(
    source_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is not None:
        res = await db.knowledge_sources.delete_one({"id": source_id})
        if res.deleted_count > 0:
            return {"message": "Knowledge source deleted successfully."}
    else:
        for idx, item in enumerate(INITIAL_KNOWLEDGE_SOURCES):
            if item["id"] == source_id:
                INITIAL_KNOWLEDGE_SOURCES.pop(idx)
                return {"message": "Knowledge source deleted successfully."}
                
    raise HTTPException(status_code=404, detail="Knowledge source not found.")
