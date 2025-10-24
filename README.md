-----

# Knowledge Graph Explorer

This is a web application for visualizing and exploring graph data from a Neo4j database. It's built with a Python FastAPI backend and a JavaScript frontend that uses the Cytoscape.js library.

-----

## Features

  * **Dynamic UI**: A three-pane layout with a list of relationship maps, a central graph visualization, and a side panel for properties and controls.
  * **Interactive Graph**: Visualize the graph using the Cola layout. Single-click nodes/edges to view properties, and double-click nodes to expand their neighbors.
  * **Configurable Queries**: Define graph views in an external `queries.yaml` file.
  * **Graph Controls**: Adjust layout parameters like zoom, edge length, and node spacing in real-time.

-----

## Setup and Installation

Follow these steps to get the application running locally.

### 1\. Clone the Repository

First, clone the project from GitHub to your local machine:

```bash
git clone <your-repository-url>
cd knowledge-graph-explorer
```

### 2\. Create and Activate a Python Virtual Environment

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

### 3\. Install Dependencies

Install all the required Python packages from the `requirements.txt` file:

```bash
pip install -r requirements.txt
```

### 4\. Configure Environment Variables

The application requires a connection to a Neo4j database.

1.  In the project root directory, create a new file named `.env`.
2.  Copy the contents of the example below into your new `.env` file and update the values to match your Neo4j database credentials.

<!-- end list -->

```ini
# .env
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="your_secret_password"
NEO4J_DATABASE="neo4j"
```

-----

## How to Run

With your virtual environment activated and the `.env` file configured, start the FastAPI server from the `backend` directory:

```bash
uvicorn app.main:app --reload
```

The server will start, and you can access the application by navigating to **`http://127.0.0.1:8000`** in your web browser.

-----

## Sample Data Setup (Client 360 View)

To test the `client_360_view` query, you'll need to load the sample aggregated data into your Neo4j instance. This query is designed to work on a "leaf-node" aggregation model, where each "fact" node (`:AggTx`) is pre-aggregated and linked to all its dimensions.

### 1\. Sample Data

The `client_360_view` query is designed to aggregate this data live. The `monthId` column is used by the "Time Range" slider in the UI.

| Client | DepProduct | Flow | Channel | PayProduct | FI | Prospect | totalAmount | txCount | monthId |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Client A | CA | Sent | OLBB | Wire | Chase | Prospect X | 10,000 | 5 | 2025-10 |
| Client A | CA | Sent | OLBB | Wire | Wells Fargo | Prospect Y | 5,000 | 2 | 2025-10 |
| Client A | CA | Sent | OLBB | EFT | Chase | Prospect X | 3,000 | 3 | 2025-09 |
| Client A | CA | Received | ABM | Cheque | Chase | Prospect X | 2,000 | 1 | 2025-09 |
| Client A | BPRA | Sent | OLBB | Wire | Chase | Prospect Y | 8,000 | 4 | 2025-08 |
| Client B | CA | Sent | ABM | EFT | Wells Fargo | Prospect Z | 4,000 | 2 | 2025-10 |

### 2\. Neo4j Cypher Load Script

Run the following Cypher query in your Neo4j browser to create the dimension nodes and the aggregated `:AggTx` fact nodes.

```cypher
// Start by clearing any old test data
MATCH (n:AggTx) DETACH DELETE n;
MATCH (n:Client) DETACH DELETE n;
MATCH (n:Prospect) DETACH DELETE n;
MATCH (n:DepositProduct) DETACH DELETE n;
MATCH (n:Flow) DETACH DELETE n;
MATCH (n:Channel) DETACH DELETE n;
MATCH (n:PaymentProduct) DETACH DELETE n;
MATCH (n:FinancialInstitution) DETACH DELETE n;

// Create Dimension Nodes
MERGE (:Client {clientId: 'ClientA', name: 'Client A'});
MERGE (:Client {clientId: 'ClientB', name: 'Client B'});
MERGE (:DepositProduct {name: 'CA'});
MERGE (:DepositProduct {name: 'BPRA'});
MERGE (:Flow {direction: 'Sent'});
MERGE (:Flow {direction: 'Received'});
MERGE (:Channel {name: 'OLBB'});
MERGE (:Channel {name: 'ABM'});
MERGE (:PaymentProduct {name: 'Wire'});
MERGE (:PaymentProduct {name: 'EFT'});
MERGE (:PaymentProduct {name: 'Cheque'});
MERGE (:FinancialInstitution {name: 'Chase'});
MERGE (:FinancialInstitution {name: 'Wells Fargo'});
MERGE (:Prospect {prospectId: 'ProspectX', name: 'Prospect X'});
MERGE (:Prospect {prospectId: 'ProspectY', name: 'Prospect Y'});
MERGE (:Prospect {prospectId: 'ProspectZ', name: 'Prospect Z'});

// --- Create Aggregation Fact Nodes (with monthId) ---

// Row 1: Client A, CA, Sent, OLBB, Wire, Chase, Prospect X, 10000, 5, 2025-10
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 10000, txCount: 5, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 2: Client A, CA, Sent, OLBB, Wire, Wells Fargo, Prospect Y, 5000, 2, 2025-10
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Wells Fargo'}), (p:Prospect {prospectId: 'ProspectY'})
CREATE (agg:AggTx {totalAmount: 5000, txCount: 2, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 3: Client A, CA, Sent, OLBB, EFT, Chase, Prospect X, 3000, 3, 2025-09
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'EFT'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 3000, txCount: 3, monthId: '2025-09'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 4: Client A, CA, Received, ABM, Cheque, Chase, Prospect X, 2000, 1, 2025-09
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'ABM'}), (pp:PaymentProduct {name: 'Cheque'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 2000, txCount: 1, monthId: '2025-09'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 5: Client A, BPRA, Sent, OLBB, Wire, Chase, Prospect Y, 8000, 4, 2025-08
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'BPRA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectY'})
CREATE (agg:AggTx {totalAmount: 8000, txCount: 4, monthId: '2025-08'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 6: Client B, CA, Sent, ABM, EFT, Wells Fargo, Prospect Z, 4000, 2, 2025-10
MATCH (c:Client {clientId: 'ClientB'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'ABM'}), (pp:PaymentProduct {name: 'EFT'}), (fi:FinancialInstitution {name: 'Wells Fargo'}), (p:Prospect {prospectId: 'ProspectZ'})
CREATE (agg:AggTx {totalAmount: 4000, txCount: 2, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);
```