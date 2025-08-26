# app/repository.py
import logging
import yaml
from neo4j import Driver, Record
from .config import settings

logger = logging.getLogger(__name__)

class GraphRepository:
    def __init__(self, driver: Driver):
        self.driver = driver
        self.query_sets = self._load_queries()

    def _load_queries(self) -> dict:
        """Loads Cypher query sets from the specified YAML file."""
        logger.info(f"Loading queries from {settings.queries_file_path}")
        with open(settings.queries_file_path, 'r') as file:
            return yaml.safe_load(file)

    def get_available_queries(self) -> list[dict]:
        """
        Returns a list of all enabled queries with their metadata.
        """
        available_queries = []
        for name, details in self.query_sets.items():
            if details.get("enabled", False):
                available_queries.append({
                    "name": name,
                    "display_name": details.get("display_name", name.replace('_', ' ').title()),
                    "description": details.get("description", "")
                })
        return available_queries

    def get_node_properties(self, node_id: str) -> dict | None:
        """
        Fetches all properties for a single node given its element ID.
        """
        query = "MATCH (n) WHERE elementId(n) = $node_id RETURN n"
        params = {"node_id": node_id}
        
        logger.info(f"Executing properties query with params: {params}")
        try:
            with self.driver.session() as session:
                result = session.run(query, params)
                record = result.single()
            
            if record and len(record) > 0:
                node = record[0]
                if hasattr(node, 'labels'):
                    properties = dict(node.items())
                    logger.info(f"Found properties for node {node_id}")
                    return properties
            
            logger.warning(f"No node record found for node {node_id}")
            return None
        except Exception:
            logger.error(f"An exception occurred fetching properties for node {node_id}", exc_info=True)
            return None

    def get_edge_properties(self, edge_id: str) -> dict | None:
        """
        Fetches all properties for a single relationship given its element ID.
        """
        query = "MATCH ()-[r]-() WHERE elementId(r) = $edge_id RETURN properties(r) LIMIT 1"
        params = {"edge_id": edge_id}
        
        logger.info(f"Executing edge properties query with params: {params}")
        try:
            with self.driver.session() as session:
                result = session.run(query, params)
                record = result.peek()

            # --- FIX: Access the returned properties by position (index 0) ---
            if record and len(record) > 0:
                props = record[0] # Access the first column by index
                
                # Verify that we received a dictionary
                if isinstance(props, dict):
                    logger.info(f"Found properties for edge {edge_id}")
                    return props
            
            logger.warning(f"No properties record found for edge {edge_id}")
            return None
        except Exception:
            logger.error(f"An exception occurred fetching properties for edge {edge_id}", exc_info=True)
            return None

    def execute_query(self, query_set_name: str, query_type: str, params: dict) -> list[dict]:
        """
        Selects and executes a pre-defined Cypher query with the given parameters.
        """
        if query_set_name not in self.query_sets:
            raise ValueError(f"Query set '{query_set_name}' not found.")

        query_set = self.query_sets[query_set_name]
        
        if not query_set.get("enabled", False):
            raise PermissionError(f"Query set '{query_set_name}' is disabled.")
        if query_type not in query_set:
            raise ValueError(f"Query type '{query_type}' not found in query set '{query_set_name}'.")

        query = query_set[query_type]
        
        params.setdefault("limit", 25)
        params.setdefault("text_search", None)

        logger.info(f"Final Cypher Query:\n{query.strip()}")
        logger.info(f"Parameters: {params}")
        
        with self.driver.session() as session:
            result = session.run(query, params)
            records = list(result)
            
        logger.info(f"Query returned {len(records)} records.")
        
        return self._nodes_to_cytoscape_format(records)

    def _nodes_to_cytoscape_format(self, records: list[Record]) -> list[dict]:
        """Robustly formats Neo4j records for Cytoscape.js."""
        nodes, edges = {}, {}
        for record in records:
            for _, value in record.items():
                if value is None: continue
                if hasattr(value, 'labels'): # It's a Node
                    node_id = value.element_id
                    if node_id not in nodes:
                        nodes[node_id] = {"data": {"id": node_id, "label": list(value.labels)[0] if value.labels else "Node", "name": value.get("name", "Unnamed")}}
                elif hasattr(value, 'start_node'): # It's a Relationship
                    edge_id = value.element_id
                    if edge_id not in edges:
                        edges[edge_id] = {"data": {"id": edge_id, "source": value.start_node.element_id, "target": value.end_node.element_id, "label": type(value).__name__}}
                        start_node, end_node = value.start_node, value.end_node
                        if start_node.element_id not in nodes:
                            nodes[start_node.element_id] = {"data": {"id": start_node.element_id, "label": list(start_node.labels)[0] if start_node.labels else "Node", "name": start_node.get("name", "Unnamed")}}
                        if end_node.element_id not in nodes:
                             nodes[end_node.element_id] = {"data": {"id": end_node.element_id, "label": list(end_node.labels)[0] if end_node.labels else "Node", "name": end_node.get("name", "Unnamed")}}
        return list(nodes.values()) + list(edges.values())