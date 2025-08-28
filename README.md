# Knowledge Graph Explorer

This is a web application for visualizing and exploring graph data from a Neo4j database. It's built with a Python FastAPI backend and a JavaScript frontend that uses the Cytoscape.js library.



---

## Features

* **Dynamic UI**: A three-pane layout with a list of relationship maps, a central graph visualization, and a side panel for properties and controls.
* **Interactive Graph**: Visualize the graph using the Cola layout. Single-click nodes/edges to view properties, and double-click nodes to expand their neighbors.
* **Configurable Queries**: Define graph views in an external `queries.yaml` file.
* **Graph Controls**: Adjust layout parameters like zoom, edge length, and node spacing in real-time.

---

## Setup and Installation

Follow these steps to get the application running locally.

### 1. Clone the Repository

First, clone the project from GitHub to your local machine:
```bash
git clone <your-repository-url>
cd knowledge-graph-explorer
```

### 2. Create and Activate a Python Virtual Environment

It's highly recommended to use a virtual environment to manage project dependencies.

**On Windows:**
```bash
python -m venv venv
.\venv\Scripts\activate
```

**On macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

Install all the required Python packages from the `requirements.txt` file:
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

The application requires a connection to a Neo4j database.

1.  In the project root directory, create a new file named `.env`.
2.  Copy the contents of the example below into your new `.env` file and update the values to match your Neo4j database credentials.

```ini
# .env
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="your_secret_password"
NEO4J_DATABASE="neo4j"
```

---

## How to Run

With your virtual environment activated and the `.env` file configured, start the FastAPI server from the `backend` directory:

```bash
uvicorn app.main:app --reload
```
The server will start, and you can access the application by navigating to **`http://127.0.0.1:8000`** in your web browser.