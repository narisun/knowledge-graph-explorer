# backend/app/db.py
import logging
from neo4j import GraphDatabase, Driver
from .config import settings

logger = logging.getLogger(__name__)

_driver: Driver | None = None

def get_driver() -> Driver:
    """
    Returns the singleton Neo4j driver instance, creating it if necessary.
    """
    global _driver
    if _driver is None:
        logger.info(f"Initializing Neo4j driver for database '{settings.neo4j_database}'...")
        try:
            # Add the database parameter to the driver connection
            _driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
                database=settings.neo4j_database
            )
            _driver.verify_connectivity()
            logger.info("Neo4j driver initialized successfully.")
        except Exception as e:
            logger.error("Failed to initialize Neo4j driver.", exc_info=True)
            raise
    return _driver

def close_driver():
    """Closes the Neo4j driver connection."""
    global _driver
    if _driver:
        logger.info("Closing Neo4j driver.")
        _driver.close()
        _driver = None