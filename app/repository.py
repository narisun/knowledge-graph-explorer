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
        Returns a list of all enabled queries with their metadata,
        including the caption property and table display config.
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
                    "table_display": details.get("table_display", {})
                })
        return available_queries

    def get_node_properties(self, node_id: str) -> dict | None:
        """
        Fetches all properties for a single node given its element ID.
        """
        query = "MATCH (n) WHERE elementId(n) = $node_id RETURN n"
        params = {"node_id": node_id}
        try:
            with self.driver.session() as session:
                result = session.run(query, params)
                record = result.single()
            if record and len(record) > 0:
                node = record[0]
                if hasattr(node, 'labels'):
                    return dict(node.items())
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

    def execute_query(self, query_set_name: str, query_type: str, params: dict) -> dict:
        """
        Selects and executes a pre-defined Cypher query and returns both
        graph-formatted and raw record data.
        """
        query_set = self.query_sets.get(query_set_name, {})
        if not query_set.get("enabled", False):
            raise PermissionError(f"Query set '{query_set_name}' is disabled or does not exist.")
        
        mapping = query_set.get("mapping", {})
        caption_property = query_set.get("caption_property", "name")

        if query_type == "neighbors":
            node_type = params.get("node_type")
            neighbor_queries = query_set.get("neighbors", {})
            query = neighbor_queries.get(node_type, neighbor_queries.get("_default"))
            if not query:
                raise ValueError(f"No suitable neighbor query found for node type '{node_type}'.")
        elif query_type == "chart":
            query = query_set.get("chart")
            if not query:
                raise ValueError(f"Chart query not found in query set '{query_set_name}'.")
        else: # For 'primary' queries
            query = query_set.get(query_type)
            if not query:
                 raise ValueError(f"Query type '{query_type}' not found in query set '{query_set_name}'.")
        
        params.setdefault("limit", 10)
        params.setdefault("text_search", None)

        logger.info(f"Final Cypher Query:\n{query.strip()}")
        logger.info(f"Parameters: {params}")
        
        with self.driver.session() as session:
            result = session.run(query, params)
            records = list(result)
            keys = result.keys()
            
        logger.info(f"Query returned {len(records)} records.")

        if query_type == "chart":
            return self._format_chart_data(records)
        
        return {
            "graph": self._nodes_to_cytoscape_format(records, mapping, caption_property),
            "records": self._records_to_json_serializable(records),
            "keys": keys
        }

    def _format_chart_data(self, records: list[Record]) -> dict:
        labels = [str(record["date"]) for record in records]
        total_amount = [record["total_amount"] for record in records]
        transaction_volume = [record["transaction_volume"] for record in records]
        return {
            "labels": labels,
            "datasets": {
                "total_amount": total_amount,
                "transaction_volume": transaction_volume
            }
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

    def _nodes_to_cytoscape_format(self, records: list[Record], mapping: dict, caption_property: str) -> list[dict]:
        nodes, edges, parent_nodes = {}, {}, set()
        
        node_size_prop = mapping.get("node_size")
        node_community_prop = mapping.get("node_community")
        edge_weight_prop = mapping.get("edge_weight")

        for record in records:
            for _, value in record.items():
                if value is None: continue
                if hasattr(value, 'labels'): # It's a Node
                    node_id = value.element_id
                    if node_id not in nodes:
                        node_label = list(value.labels)[0] if value.labels else "Node"
                        caption = value.get(caption_property, node_label)
                        node_data = {
                            "id": node_id,
                            "label": node_label,
                            "name": caption
                        }

                        if node_size_prop and value.get(node_size_prop) is not None:
                            node_data["size"] = value.get(node_size_prop)
                        if node_community_prop and value.get(node_community_prop) is not None:
                            community_id = str(value.get(node_community_prop))
                            node_data["parent"] = community_id
                            parent_nodes.add(community_id)
                        nodes[node_id] = {"data": node_data}

                elif hasattr(value, 'start_node'): # It's a Relationship
                    edge_id = value.element_id
                    if edge_id not in edges:
                        edge_data = { "id": edge_id, "source": value.start_node.element_id, "target": value.end_node.element_id, "label": type(value).__name__ }
                        if edge_weight_prop and value.get(edge_weight_prop) is not None:
                            edge_data["weight"] = value.get(edge_weight_prop)
                        edges[edge_id] = {"data": edge_data}
        
        compound_nodes = [{"data": {"id": pid}} for pid in parent_nodes]
        return list(nodes.values()) + list(edges.values()) + compound_nodes