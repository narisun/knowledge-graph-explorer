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

## Understanding the Application

### How the Graph Model Works

This application is designed to visualize pre-aggregated data. The sample `client_360_view` query uses a "leaf-node" aggregation model, which is a common pattern for high-performance dashboards.

  * **Fact Node (`:AggTx`)**: This is the central node. Each `:AggTx` node represents a "fact," or a pre-aggregated summary of transactions. It holds the measures, like `totalAmount` and `txCount`.
  * **Dimension Nodes (`:Client`, `:Prospect`, etc.)**: These are the "dimensions." Each fact node is linked to all of its corresponding dimensions.

This model is very fast for querying because all the complex joins and aggregations are already done. When you ask, "What is the total for Client A sent via Wire?" the query simply finds the `:AggTx` nodes that are connected to *both* the `:Client {name: 'Client A'}` and `:PaymentProduct {name: 'Wire'}` nodes and sums their `totalAmount`.

### How `queries.yaml` Works

The `queries.yaml` file defines everything the frontend can query. Each top-level key (e.g., `client_360_view`) is a "Query Set."

Here is a breakdown of its main properties:

  * **`display_name` / `description`**: These are shown in the left-hand navigation menu.
  * **`caption_property`**: This tells the graph which property to use as the node's display name (e.g., `display_name`).
  * **`mapping`**: This maps data properties to visual properties.
      * `node_size: "totalAmount"` tells Cytoscape to make nodes with a higher `totalAmount` larger.
      * `edge_weight: "txCount"` tells Cytoscape to make edges with a higher `txCount` thicker.
  * **`table_query`**: This Cypher query is executed **only** to populate the flat data table at the bottom of the page. It is not used for the graph visualization. It receives parameters like `$months`, `$limit`, and `$text_search`.
  * **`primary`**: This Cypher query is executed when the query set is first loaded (or when "Search" is clicked). It defines the "root" nodes of the graph. For example, it might return all `:Client` nodes.
  * **`neighbors`**: This is the most important section for drill-down. It is a dictionary where each **key** matches the **Neo4j Label** of a node you double-click.
      * When you double-click a node with the label `:Flow`, the application runs the Cypher query from the `Flow:` key.
      * The `_default:` key is a fallback used if a specific key (like `:Client`) is not defined.
      * These queries receive the `$node_id` of the clicked node and all historical node IDs (e.g., `$Client_node_id`, `$DepositProduct_node_id`) to correctly filter the drill-down path.

-----

## Full Sample Data Setup (Client 360 View)

This sample data includes all 20 rows of test data to fully populate the `client_360_view` query and test its corner cases (e.g., time range, fan-in/fan-out).

### 1\. Full Sample Data

| Client | DepProduct | Flow | Channel | PayProduct | FI | Prospect | totalAmount | txCount | monthId |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Client A | CA | Sent | OLBB | Wire | Chase | Prospect X | 10,000 | 5 | 2025-10 |
| Client A | CA | Sent | OLBB | Wire | Wells Fargo | Prospect Y | 5,000 | 2 | 2025-10 |
| Client A | CA | Sent | OLBB | EFT | Chase | Prospect X | 3,000 | 3 | 2025-09 |
| Client A | CA | Received | ABM | Cheque | Chase | Prospect X | 2,000 | 1 | 2025-09 |
| Client A | BPRA | Sent | OLBB | Wire | Chase | Prospect Y | 8,000 | 4 | 2025-08 |
| Client B | CA | Sent | ABM | EFT | Wells Fargo | Prospect Z | 4,000 | 2 | 2025-10 |
| Client B | CA | Received | Mobile | Cheque | BMO | Prospect X | 12,000 | 10 | 2025-10 |
| Client B | GIC | Received | OLBB | ACH | RBC | Prospect Z | 88,000 | 1 | 2025-10 |
| Client C | SA | Sent | OLBB | ACH | Chase | Prospect Z | 250,000 | 20 | 2025-10 |
| Client C | SA | Received | Mobile | ACH | BMO | Prospect A | 50,000 | 5 | 2025-09 |
| Client C | CA | Sent | Mobile | ACH | Chase | Prospect A | 72,000 | 15 | 2025-10 |
| Client C | CA | Sent | OLBB | ACH | Chase | Prospect A | 120,000 | 22 | 2025-08 |
| Client C | SA | Received | ABM | Cheque | BMO | Prospect Z | 6,500 | 2 | 2025-07 |
| Client D | SA | Sent | Mobile | Wire | Citi | Prospect B | 1,200,000 | 150 | 2025-10 |
| Client D | SA | Received | OLBB | ACH | Citi | Prospect A | 750,000 | 80 | 2025-10 |
| Client A | CA | Sent | OLBB | Wire | Chase | Prospect X | 15,000 | 8 | 2025-07 |
| Client A | BPRA | Sent | ABM | EFT | Wells Fargo | Prospect Y | 500 | 1 | 2025-06 |
| Client A | CA | Sent | Mobile | ACH | Wells Fargo | Prospect X | 4,200 | 12 | 2025-09 |
| Client A | BPRA | Sent | OLBB | Wire | Chase | Prospect Y | 300 | 1 | 2024-05 |
| Client E | SA | Sent | OLBB | Wire | Citi | Prospect X | 1,000,000 | 1 | 2025-10 |

### 2\. Consolidated Neo4j Cypher Load Script

Run the following Cypher query in your Neo4j browser to clear old data and create all 20 test records and their dimension nodes.

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

// --- Create ALL Dimension Nodes ---
MERGE (:Client {clientId: 'ClientA', name: 'Client A'});
MERGE (:Client {clientId: 'ClientB', name: 'Client B'});
MERGE (:Client {clientId: 'ClientC', name: 'Client C'});
MERGE (:Client {clientId: 'ClientD', name: 'Client D'});
MERGE (:Client {clientId: 'ClientE', name: 'Client E'});

MERGE (:DepositProduct {name: 'CA'});
MERGE (:DepositProduct {name: 'BPRA'});
MERGE (:DepositProduct {name: 'SA'});
MERGE (:DepositProduct {name: 'GIC'});

MERGE (:Flow {direction: 'Sent'});
MERGE (:Flow {direction: 'Received'});

MERGE (:Channel {name: 'OLBB'});
MERGE (:Channel {name: 'ABM'});
MERGE (:Channel {name: 'Mobile'});

MERGE (:PaymentProduct {name: 'Wire'});
MERGE (:PaymentProduct {name: 'EFT'});
MERGE (:PaymentProduct {name: 'Cheque'});
MERGE (:PaymentProduct {name: 'ACH'});

MERGE (:FinancialInstitution {name: 'Chase'});
MERGE (:FinancialInstitution {name: 'Wells Fargo'});
MERGE (:FinancialInstitution {name: 'BMO'});
MERGE (:FinancialInstitution {name: 'Citi'});
MERGE (:FinancialInstitution {name: 'RBC'});

MERGE (:Prospect {prospectId: 'ProspectX', name: 'Prospect X'});
MERGE (:Prospect {prospectId: 'ProspectY', name: 'Prospect Y'});
MERGE (:Prospect {prospectId: 'ProspectZ', name: 'Prospect Z'});
MERGE (:Prospect {prospectId: 'ProspectA', name: 'Prospect A'});
MERGE (:Prospect {prospectId: 'ProspectB', name: 'Prospect B'});

// --- Create ALL 20 Aggregation Fact Nodes ---

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

// Row 7: Client B, CA, Received, Mobile, Cheque, BMO, Prospect X
MATCH (c:Client {clientId: 'ClientB'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'Mobile'}), (pp:PaymentProduct {name: 'Cheque'}), (fi:FinancialInstitution {name: 'BMO'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 12000, txCount: 10, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 8: Client B, GIC, Received, OLBB, ACH, RBC, Prospect Z
MATCH (c:Client {clientId: 'ClientB'}), (dp:DepositProduct {name: 'GIC'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'RBC'}), (p:Prospect {prospectId: 'ProspectZ'})
CREATE (agg:AggTx {totalAmount: 88000, txCount: 1, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 9: Client C, SA, Sent, OLBB, ACH, Chase, Prospect Z
MATCH (c:Client {clientId: 'ClientC'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectZ'})
CREATE (agg:AggTx {totalAmount: 250000, txCount: 20, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 10: Client C, SA, Received, Mobile, ACH, BMO, Prospect A
MATCH (c:Client {clientId: 'ClientC'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'Mobile'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'BMO'}), (p:Prospect {prospectId: 'ProspectA'})
CREATE (agg:AggTx {totalAmount: 50000, txCount: 5, monthId: '2025-09'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 11: Client C, CA, Sent, Mobile, ACH, Chase, Prospect A
MATCH (c:Client {clientId: 'ClientC'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'Mobile'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectA'})
CREATE (agg:AggTx {totalAmount: 72000, txCount: 15, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 12: Client C, CA, Sent, OLBB, ACH, Chase, Prospect A
MATCH (c:Client {clientId: 'ClientC'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectA'})
CREATE (agg:AggTx {totalAmount: 120000, txCount: 22, monthId: '2025-08'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 13: Client C, SA, Received, ABM, Cheque, BMO, Prospect Z
MATCH (c:Client {clientId: 'ClientC'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'ABM'}), (pp:PaymentProduct {name: 'Cheque'}), (fi:FinancialInstitution {name: 'BMO'}), (p:Prospect {prospectId: 'ProspectZ'})
CREATE (agg:AggTx {totalAmount: 6500, txCount: 2, monthId: '2025-07'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 14: Client D, SA, Sent, Mobile, Wire, Citi, Prospect B
MATCH (c:Client {clientId: 'ClientD'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'Mobile'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Citi'}), (p:Prospect {prospectId: 'ProspectB'})
CREATE (agg:AggTx {totalAmount: 1200000, txCount: 150, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 15: Client D, SA, Received, OLBB, ACH, Citi, Prospect A
MATCH (c:Client {clientId: 'ClientD'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Received'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'Citi'}), (p:Prospect {prospectId: 'ProspectA'})
CREATE (agg:AggTx {totalAmount: 750000, txCount: 80, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 16: Client A, CA, Sent, OLBB, Wire, Chase, Prospect X
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 15000, txCount: 8, monthId: '2025-07'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 17: Client A, BPRA, Sent, ABM, EFT, Wells Fargo, Prospect Y
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'BPRA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'ABM'}), (pp:PaymentProduct {name: 'EFT'}), (fi:FinancialInstitution {name: 'Wells Fargo'}), (p:Prospect {prospectId: 'ProspectY'})
CREATE (agg:AggTx {totalAmount: 500, txCount: 1, monthId: '2025-06'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 18: Client A, CA, Sent, Mobile, ACH, Wells Fargo, Prospect X
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'CA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'Mobile'}), (pp:PaymentProduct {name: 'ACH'}), (fi:FinancialInstitution {name: 'Wells Fargo'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 4200, txCount: 12, monthId: '2025-09'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 19: Client E, SA, Sent, OLBB, Wire, Citi, Prospect X
MATCH (c:Client {clientId: 'ClientE'}), (dp:DepositProduct {name: 'SA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Citi'}), (p:Prospect {prospectId: 'ProspectX'})
CREATE (agg:AggTx {totalAmount: 1000000, txCount: 1, monthId: '2025-10'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);

// Row 20: Client A, BPRA, Sent, OLBB, Wire, Chase, Prospect Y
MATCH (c:Client {clientId: 'ClientA'}), (dp:DepositProduct {name: 'BPRA'}), (f:Flow {direction: 'Sent'}), (ch:Channel {name: 'OLBB'}), (pp:PaymentProduct {name: 'Wire'}), (fi:FinancialInstitution {name: 'Chase'}), (p:Prospect {prospectId: 'ProspectY'})
CREATE (agg:AggTx {totalAmount: 300, txCount: 1, monthId: '2024-05'})
CREATE (agg)-[:FOR_CLIENT]->(c), (agg)-[:FOR_DEPOSIT_PRODUCT]->(dp), (agg)-[:FOR_FLOW]->(f), (agg)-[:FOR_CHANNEL]->(ch), (agg)-[:FOR_PAYMENT_PRODUCT]->(pp), (agg)-[:FOR_FI]->(fi), (agg)-[:FOR_PROSPECT]->(p);
```