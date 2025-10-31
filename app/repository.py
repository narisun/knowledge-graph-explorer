# app/repository.py
import logging
import yaml
from neo4j import Driver, Record
from neo4j.spatial import Point
from neo4j.time import Date, Time, DateTime, Duration
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
                    "description": details.get("description", ""),
                    "caption_property": details.get("caption_property", "name"),
                    "mapping": details.get("mapping", {}),
                    "colors": details.get("colors", {}), # Pass the color map
                    "table_query": details.get("table_query")
                })
        return available_queries

    def get_node_properties(self, node_id: str) -> dict | None:
        """
        Fetches all properties for a single node given its element ID.
        It can handle synthetic IDs (e.g., "relId_nodeId") by parsing them.
        """
        # Handle synthetic IDs by splitting on '_' and taking the last part
        real_node_id = node_id.split('_')[-1]
        
        query = "MATCH (n) WHERE elementId(n) = $node_id RETURN n"
        params = {"node_id": real_node_id}
        try:
            with self.driver.session() as session:
                result = session.run(query, params)
                record = result.single()
            if record and len(record) > 0:
                node = record[0]
                if hasattr(node, 'labels'):
                    # Return properties, AND the real ID
                    props = dict(node.items())
                    props["original_element_id"] = real_node_id
                    return props
            return None
        except Exception:
            logger.error(f"An exception occurred fetching properties for node {node_id} (real: {real_node_id})", exc_info=True)
            return None

    def get_edge_properties(self, edge_id: str) -> dict | None:
        """
        Fetches all properties for a single relationship given its element ID.
        """
        query = "MATCH ()-[r]-() WHERE elementId(r) = $edge_id RETURN properties(r) LIMIT 1"
        params = {"edge_id": edge_id}
        try:
            with self.driver.session() as session:
                result = session.run(query, params)
                record = result.peek()
            if record and len(record) > 0:
                props = record[0]
                if isinstance(props, dict):
                    return props
            return None
        except Exception:
            logger.error(f"An exception occurred fetching properties for edge {edge_id}", exc_info=True)
            return None

    def execute_table_query(self, query: str, params: dict) -> dict:
        """
        Executes a pre-defined Cypher query (for table data) and
        returns raw record data.
        """
        if not query:
            logger.warning("No table query provided, returning empty table.")
            return {"records": [], "keys": []}
            
        logger.info(f"Final Table Query:\n{query.strip()}")
        logger.info(f"Parameters: {params}")
        
        with self.driver.session() as session:
            result = session.run(query, params)
            records = list(result)
            keys = result.keys()
            
        logger.info(f"Table query returned {len(records)} records.")
        
        return {
            "records": self._records_to_json_serializable(records),
            "keys": keys
        }

    def execute_query(self, query_set_name: str, query_type: str, params: dict) -> dict:
        """
        Selects and executes a pre-defined Cypher query (for graph data)
        and returns both graph-formatted and raw record data.
        """
        query_set = self.query_sets.get(query_set_name, {})
        if not query_set.get("enabled", False):
            raise PermissionError(f"Query set '{query_set_name}' is disabled or does not exist.")
        
        mapping = query_set.get("mapping", {})
        caption_property = query_set.get("caption_property", "name")
        
        # This will store the full synthetic ID (e.g., "edgeId_nodeId") passed from the frontend
        clicked_synthetic_id = None 

        if query_type == "neighbors":
            if "node_id" in params:
                # This is the ID of the clicked node in Cytoscape
                clicked_synthetic_id = params["node_id"] 
                # Get real ID for the Cypher query
                real_node_id = clicked_synthetic_id.split('_')[-1] 
                
                # Overwrite params for the Cypher query
                params["node_id"] = real_node_id 
                
            node_type = params.get("node_type")
            neighbor_queries = query_set.get("neighbors", {})
            query = neighbor_queries.get(node_type, neighbor_queries.get("_default"))
            if not query:
                raise ValueError(f"No suitable neighbor query found for node type '{node_type}'.")
        else: # For 'primary' queries
            query = query_set.get(query_type)
            if not query:
                 raise ValueError(f"Query type '{query_type}' not found in query set '{query_set_name}'.")
        
        params.setdefault("limit", 10)
        params.setdefault("text_search", None)

        logger.info(f"Final Graph Query:\n{query.strip()}")
        logger.info(f"Parameters: {params}")
        
        with self.driver.session() as session:
            result = session.run(query, params)
            records = list(result)
            keys = result.keys()
            
        logger.info(f"Graph query returned {len(records)} records.")
        
        return {
            "graph": self._nodes_to_cytoscape_format(records, mapping, caption_property, query_type, clicked_synthetic_id),
            "records": self._records_to_json_serializable(records), 
            "keys": keys
        }

    def _records_to_json_serializable(self, records: list[Record]) -> list[dict]:
        """
        Converts a list of Neo4j Records into a JSON-serializable format,
        handling complex types like Nodes and Relationships.
        """
        def serialize_value(value):
            if isinstance(value, (Date, Time, DateTime, Duration)):
                return str(value)
            if isinstance(value, Point):
                return {"srid": value.srid, "x": value.x, "y": value.y, "z": value.z}
            if hasattr(value, 'labels'):  # It's a Node
                return {
                    "_type": "node",
                    "_labels": list(value.labels),
                    "properties": dict(value.items())
                }
            if hasattr(value, 'start_node'):  # It's a Relationship
                return {
                    "_type": "relationship",
                    "_relation_type": type(value).__name__,
                    "properties": dict(value.items())
                }
            if isinstance(value, dict):
                return {k: serialize_value(v) for k, v in value.items()}
            return value

        return [
            {key: serialize_value(record[key]) for key in record.keys()}
            for record in records
        ]

    def _nodes_to_cytoscape_format(self, records: list[Record], mapping: dict, caption_property: str, query_type: str, clicked_synthetic_id: str | None = None) -> list[dict]:
        nodes, edges, parent_nodes = {}, {}, set()
        
        node_size_prop = mapping.get("node_size")
        node_community_prop = mapping.get("node_community")
        edge_weight_prop = mapping.get("edge_weight")

        is_neighbor_query = (query_type == "neighbors")

        for record in records:
            record_rel = None
            record_nodes = []

            # Find all relationships and nodes in the current record
            for _, value in record.items():
                if value is None: continue
                if hasattr(value, 'start_node'):
                    record_rel = value
                elif hasattr(value, 'labels'):
                    record_nodes.append(value)
            
            # --- Primary Query (e.g., initial search) ---
            if not is_neighbor_query:
                for node in record_nodes:
                    node_id = node.element_id
                    if node_id not in nodes:
                        node_label = list(node.labels)[0] if node.labels else "Node"
                        caption = node.get(caption_property, node.get("name", node_label))
                        node_data = {
                            "id": node_id,
                            "label": node_label,
                            "name": caption,
                            "original_element_id": node.element_id # Store for consistency
                        }
                        if node_size_prop and node.get(node_size_prop) is not None:
                            node_data["size"] = node.get(node_size_prop)
                        if node_community_prop and node.get(node_community_prop) is not None:
                            community_id = str(node.get(node_community_prop))
                            node_data["parent"] = community_id
                            parent_nodes.add(community_id)
                        nodes[node_id] = {"data": node_data}
            
            # --- Neighbor Query (drill-down) ---
            elif record_rel:
                edge_id = record_rel.element_id
                
                # The parent_id *must* be the ID of the node that was clicked in Cytoscape
                parent_id = clicked_synthetic_id

                # Find the child node (the one that is NOT the parent)
                child_node = next((n for n in record_nodes if n.element_id == record_rel.end_node.element_id), None)
                
                if child_node:
                    # Create a NEW, UNIQUE ID for the child node to force a "tree" structure
                    # This prevents collisions if the same child node is reached via different paths
                    unique_child_id = f"{edge_id}_{child_node.element_id}"
                    
                    if unique_child_id not in nodes:
                        node_label = list(child_node.labels)[0] if child_node.labels else "Node"
                        caption = child_node.get(caption_property, child_node.get("name", node_label))
                        node_data = {
                            "id": unique_child_id, # <-- The synthetic ID
                            "label": node_label,
                            "name": caption,
                            "original_element_id": child_node.element_id # Store real ID
                        }
                        if node_size_prop and child_node.get(node_size_prop) is not None:
                            node_data["size"] = child_node.get(node_size_prop)
                        
                        nodes[unique_child_id] = {"data": node_data}

                    # Add the NEW EDGE
                    if edge_id not in edges:
                        edge_data = { 
                            "id": edge_id, 
                            "source": parent_id, # <-- Parent's synthetic ID
                            "target": unique_child_id, # <-- Child's synthetic ID
                            "label": type(record_rel).__name__ 
                        }
                        if edge_weight_prop and record_rel.get(edge_weight_prop) is not None:
                            edge_data["weight"] = record_rel.get(edge_weight_prop)
                        edges[edge_id] = {"data": edge_data}

        compound_nodes = [{"data": {"id": pid}} for pid in parent_nodes]
        return list(nodes.values()) + list(edges.values()) + compound_nodes