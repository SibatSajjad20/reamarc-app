import asyncio
import uuid
import httpx
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, BackgroundTasks

from app.schemas.knowledge import KnowledgeSourceCreate, KnowledgeSourceResponse
from app.schemas.error import ErrorResponse
from app.core.security import get_current_user, require_editor_or_admin
from app.database import get_database
from app.routers.campaigns import invalidate_brand_context_cache
from app.services import rag_service
from app.services.obsidian_service import (
    get_existing_brand_knowledge,
    overwrite_brand_knowledge,
    sync_brand_knowledge_to_obsidian,
)
from app.services.knowledge_synthesis import synthesize_brand_knowledge

logger = logging.getLogger(__name__)

_workspace_synthesis_locks: Dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


async def get_workspace_synthesis_lock(workspace_name: str) -> asyncio.Lock:
    async with _locks_guard:
        if workspace_name not in _workspace_synthesis_locks:
            _workspace_synthesis_locks[workspace_name] = asyncio.Lock()
        return _workspace_synthesis_locks[workspace_name]


async def process_brand_knowledge_synthesis(workspace_name: str, source_name: str, extracted_text: str):
    """
    Background task to execute AI-driven brand knowledge synthesis loop:
    1. Acquires a per-workspace asyncio lock to process uploads sequentially and prevent race conditions.
    2. Reads existing master rulebook from Obsidian vault via get_existing_brand_knowledge.
    3. Merges new document/URL content into the rulebook via synthesize_brand_knowledge.
    4. Overwrites Obsidian vault rulebook via overwrite_brand_knowledge, passing new_source_name.
    """
    lock = await get_workspace_synthesis_lock(workspace_name)
    async with lock:
        try:
            existing_knowledge = get_existing_brand_knowledge(workspace_name)
            synthesized_md = await synthesize_brand_knowledge(
                existing_knowledge=existing_knowledge,
                new_source_name=source_name,
                new_raw_text=extracted_text
            )
            overwrite_brand_knowledge(
                workspace_name=workspace_name,
                synthesized_markdown=synthesized_md,
                new_source_name=source_name
            )
            logger.info(f"✨ AI Brand knowledge synthesis completed for source '{source_name}' in workspace '{workspace_name}'")
        except Exception as e:
            logger.error(f"Failed AI brand knowledge synthesis background task for '{source_name}': {e}")



router = APIRouter(
    prefix="/knowledge",
    tags=["Knowledge Base"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md", ".json", ".csv"}


def normalize_knowledge_source(doc: dict) -> dict:
    doc_type = str(doc.get("type", "pdf")).lower()
    if doc_type == "website":
        doc_type = "url"
    elif doc_type not in ["pdf", "docx", "txt", "md", "url"]:
        doc_type = "pdf"

    return {
        "id": str(doc.get("id", f"ks-{uuid.uuid4().hex[:8]}")),
        "name": str(doc.get("name") or doc.get("title") or "Knowledge Source Document"),
        "type": doc_type,
        "sizeOrTokens": str(doc.get("sizeOrTokens") or "Indexed Vector Chunks"),
        "workspaceId": str(doc.get("workspaceId") or doc.get("workspace_id") or "ws-1"),
        "dateAdded": str(doc.get("dateAdded") or doc.get("lastSynced") or "Just now"),
        "status": doc.get("status") if doc.get("status") in ("indexed", "processing") else "indexed",
    }


@router.get("", response_model=List[KnowledgeSourceResponse])
async def list_knowledge_sources(
    workspace_id: Optional[str] = Query(None, alias="workspaceId"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = {}
    if workspace_id and workspace_id != "all":
        query["$or"] = [{"workspaceId": workspace_id}, {"workspace_id": workspace_id}]
    else:
        if current_user.get("role") != "admin":
            allowed_ws = current_user.get("workspace_ids", [])
            query["$or"] = [
                {"workspaceId": {"$in": allowed_ws}},
                {"workspace_id": {"$in": allowed_ws}},
                {"user_id": current_user["id"]}
            ]

    cursor = db.knowledge_sources.find(query, {"_id": 0, "extracted_text": 0}).skip(skip).limit(limit)
    raw_sources = await cursor.to_list(length=limit)
    return [normalize_knowledge_source(s) for s in raw_sources]


@router.post("/upload", response_model=List[KnowledgeSourceResponse], status_code=status.HTTP_201_CREATED)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    workspace_id: str = Form(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """
    RAG Upload Endpoint: Handles single or batch file uploads (.pdf, .docx, .txt, .md).
    Processes raw text, generates sentence-aware chunks & vector embeddings, and indexes into MongoDB.
    Syncs extracted document knowledge to Obsidian vault as background tasks.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    # Fetch workspace name for Obsidian note file
    workspace_name = "Main Workspace"
    ws = await db.workspaces.find_one({"id": workspace_id})
    if ws and "name" in ws:
        workspace_name = ws["name"]

    processed_sources = []
    loop = asyncio.get_running_loop()

    for file in files:
        filename = file.filename or "document.txt"
        ext = "." + filename.split(".")[-1].lower() if "." in filename else ""

        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format: '{filename}'. Supported formats: .pdf, .docx, .txt, .md"
            )

        contents = await file.read()
        if len(contents) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File '{filename}' exceeds 100MB size limit.")

        # Extract text based on file type
        try:
            if ext == ".pdf":
                extracted_text, count = await loop.run_in_executor(None, rag_service.extract_text_from_pdf, contents)
                doc_type = "pdf"
                stat_suffix = f"{count} pages"
            elif ext in (".docx", ".doc"):
                extracted_text, count = await loop.run_in_executor(None, rag_service.extract_text_from_docx, contents)
                doc_type = "docx"
                stat_suffix = f"{count} sections"
            else:
                extracted_text, count = await loop.run_in_executor(None, rag_service.extract_text_from_txt, contents)
                doc_type = "txt" if ext != ".md" else "md"
                stat_suffix = f"{count} lines"
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse document '{filename}': {str(e)}")

        if not extracted_text.strip():
            raise HTTPException(status_code=422, detail=f"File '{filename}' is empty or contains no readable text.")

        source_id = f"ks-{uuid.uuid4().hex[:8]}"

        # Index document into RAG chunk & embedding collection
        chunk_count = await rag_service.index_document_chunks(
            db=db,
            user_id=current_user["id"],
            workspace_id=workspace_id,
            source_id=source_id,
            source_name=filename,
            source_type=doc_type,
            full_text=extracted_text
        )

        size_kb = max(1, len(contents) // 1024)
        new_source = {
            "id": source_id,
            "name": filename,
            "type": doc_type,
            "extracted_text": extracted_text[:10000],  # preview cache
            "sizeOrTokens": f"{size_kb} KB ({chunk_count} RAG chunks • {stat_suffix})",
            "workspaceId": workspace_id,
            "dateAdded": datetime.now(timezone.utc).isoformat(),
            "status": "indexed",
            "chunkCount": chunk_count,
            "user_id": current_user["id"],
        }

        await db.knowledge_sources.insert_one(new_source.copy())
        processed_sources.append(normalize_knowledge_source(new_source))

        # Queue AI synthesis loop background task to update master rulebook
        background_tasks.add_task(
            process_brand_knowledge_synthesis,
            workspace_name=workspace_name,
            source_name=filename,
            extracted_text=extracted_text
        )

    invalidate_brand_context_cache(current_user["id"], workspace_id)
    return processed_sources


@router.post("/scrape-url", response_model=KnowledgeSourceResponse, status_code=status.HTTP_201_CREATED)
async def scrape_url(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    workspace_id: str = Form(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """RAG URL Endpoint: Scrapes webpage, extracts text, generates embeddings, and indexes chunks."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    clean_url = url.strip()
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = f"https://{clean_url}"

    workspace_name = "Main Workspace"
    ws = await db.workspaces.find_one({"id": workspace_id})
    if ws and "name" in ws:
        workspace_name = ws["name"]

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(clean_url, headers={"User-Agent": "Mozilla/5.0 (compatible; ReamarcBot/1.0)"})
        resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="URL request timed out. Check the URL and try again.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: HTTP {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {str(e)}")

    extracted_text = rag_service.extract_text_from_html(resp.text)
    if not extracted_text.strip():
        raise HTTPException(status_code=422, detail="No readable text content found at this URL.")

    source_id = f"ks-{uuid.uuid4().hex[:8]}"
    domain_name = clean_url.replace("https://", "").replace("http://", "").split("/")[0]

    chunk_count = await rag_service.index_document_chunks(
        db=db,
        user_id=current_user["id"],
        workspace_id=workspace_id,
        source_id=source_id,
        source_name=clean_url,
        source_type="url",
        full_text=extracted_text
    )

    new_source = {
        "id": source_id,
        "name": domain_name or clean_url,
        "type": "url",
        "extracted_text": extracted_text[:10000],
        "sizeOrTokens": f"{chunk_count} RAG vector chunks indexed",
        "workspaceId": workspace_id,
        "dateAdded": datetime.now(timezone.utc).isoformat(),
        "status": "indexed",
        "chunkCount": chunk_count,
        "user_id": current_user["id"],
    }

    await db.knowledge_sources.insert_one(new_source.copy())

    # Queue AI synthesis loop background task to update master rulebook
    background_tasks.add_task(
        process_brand_knowledge_synthesis,
        workspace_name=workspace_name,
        source_name=clean_url,
        extracted_text=extracted_text
    )

    invalidate_brand_context_cache(current_user["id"], workspace_id)
    return normalize_knowledge_source(new_source)



@router.delete("/{source_id}")
async def delete_knowledge_source(
    source_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete knowledge source metadata document AND perform cascaded deletion of all associated RAG chunks."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    if current_user.get("role") == "admin":
        target_query = {"id": source_id}
    else:
        allowed_ws = current_user.get("workspace_ids", [])
        target_query = {
            "id": source_id,
            "$or": [
                {"workspaceId": {"$in": allowed_ws}},
                {"workspace_id": {"$in": allowed_ws}},
                {"user_id": current_user["id"]}
            ]
        }

    target = await db.knowledge_sources.find_one(target_query)
    res = await db.knowledge_sources.delete_one(target_query)

    if res.deleted_count > 0:
        # Delete associated vector chunks
        await db.knowledge_chunks.delete_many({"source_id": source_id})
        if target and target.get("workspaceId"):
            invalidate_brand_context_cache(current_user["id"], target["workspaceId"])
        return {"message": "Knowledge source and associated vector chunks deleted successfully."}

    raise HTTPException(status_code=404, detail="Knowledge source not found or permission denied.")
