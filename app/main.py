# app/main.py
import logging
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from . import db, repository
from .config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)
app = FastAPI()

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    db.get_driver()

@app.on_event("shutdown")
def shutdown_event():
    db.close_driver()

def get_repo():
    return repository.GraphRepository(db.get_driver())

@app.get("/", include_in_schema=False)
def serve_frontend(request: Request):
    """Serves the main index.html file."""
    return templates.TemplateResponse("index.html", {"request": request})

# --- API Endpoints ---

@app.get("/api/connection-info", summary="Get current connection info")
def get_connection_info():
    return {
        "user_name": settings.neo4j_user,
        "database_name": settings.neo4j_database
    }

@app.get("/api/queries", summary="Get the list of available, enabled queries")
def get_available_queries(repo: repository.GraphRepository = Depends(get_repo)):
    try:
        return repo.get_available_queries()
    except Exception:
        logger.error("An error occurred while fetching available queries.", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@app.get("/api/search/{query_set_name}", summary="Search the graph using a named query set")
def search_graph_data(
    query_set_name: str,
    request: Request,
    months: int = 1,
    repo: repository.GraphRepository = Depends(get_repo)
):
    try:
        params = dict(request.query_params)
        params["months"] = months
        
        # 1. Execute the graph query
        graph_result = repo.execute_query(query_set_name, "primary", params)
        
        # 2. Get and execute the separate table query
        table_query_string = repo.query_sets.get(query_set_name, {}).get("table_query")
        table_result = repo.execute_table_query(table_query_string, params)

        # 3. Return a combined payload
        return {
            "graph": graph_result["graph"],
            "table": table_result
        }
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception:
        logger.error("An error occurred in the search graph endpoint.", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@app.get("/api/nodes/{node_id}/neighbors", summary="Get neighbors of a specific node")
def get_node_neighbors(
    node_id: str,
    node_type: str, # node_type is now a required parameter
    request: Request,
    query_key: str | None = None,
    repo: repository.GraphRepository = Depends(get_repo)
):
    """
    Executes the 'neighbors' query from the 'default_graph' query set,
    selecting the appropriate query based on the node's type (label).
    
    NOTE: This only returns graph data. The static table is NOT updated on drill-down.
    """
    try:
        params = dict(request.query_params)
        params["node_id"] = node_id
        params["node_type"] = node_type
        if query_key:
            params["query_key"] = query_key
        query_set = (query_key or dict(request.query_params).get("query_key") or "default_graph")
        
        # Neighbor query only returns graph data, so we call execute_query
        graph_result = repo.execute_query(query_set, "neighbors", params)
        
        # Return a payload compatible with the frontend
        return {
            "graph": graph_result["graph"],
            "table": { # Return an empty table, as the static table doesn't change
                "records": [],
                "keys": []
            }
        }
    except Exception:
        logger.error(f"An error occurred while fetching neighbors for node {node_id}.", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@app.get("/api/nodes/{node_id}/properties", summary="Get properties of a specific node")
def get_node_properties(
    node_id: str,
    repo: repository.GraphRepository = Depends(get_repo)
):
    try:
        properties = repo.get_node_properties(node_id)
        if properties is None:
            raise HTTPException(status_code=404, detail="Node not found or has no properties.")
        return properties
    except Exception as e:
        if not isinstance(e, HTTPException):
            logger.error(f"An error occurred while fetching properties for node {node_id}.", exc_info=True)
            raise HTTPException(status_code=500, detail="An internal server error occurred.")
        raise e

@app.get("/api/edges/{edge_id}/properties", summary="Get properties of a specific edge")
def get_edge_properties(
    edge_id: str,
    repo: repository.GraphRepository = Depends(get_repo)
):
    try:
        properties = repo.get_edge_properties(edge_id)
        if properties is None:
            raise HTTPException(status_code=404, detail="Edge not found or has no properties.")
        return properties
    except Exception as e:
        if not isinstance(e, HTTPException):
            logger.error(f"An error occurred while fetching properties for edge {edge_id}.", exc_info=True)
            raise HTTPException(status_code=500, detail="An internal server error occurred.")
        raise e