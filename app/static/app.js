document.addEventListener('DOMContentLoaded', function() {
    if (typeof cytoscape('core', 'popperRef') === 'undefined') {
        cytoscape.use(cytoscapePopper);
    }

    const INFO_API_URL = '/api/connection-info';
    const QUERIES_API_URL = '/api/queries';
function setActiveQueryKey(key){ const i=document.getElementById('current-query-key'); if(i){ i.value = key || ''; } }

    const SEARCH_API_URL_TEMPLATE = '/api/search/{query_name}';
    const NEIGHBORS_API_URL_TEMPLATE = '/api/nodes/{node_id}/neighbors';
    const NODE_PROPERTIES_API_URL_TEMPLATE = '/api/nodes/{node_id}/properties';
    const EDGE_PROPERTIES_API_URL_TEMPLATE = '/api/edges/{edge_id}/properties';

    let currentQuery = {};

    // --- Element References ---
    const cyContainer = document.getElementById('cy');
    const loader = document.getElementById('loader');
    const propertiesPanel = document.getElementById('properties-panel');
    const propertiesTitle = document.getElementById('properties-title');
    const zoomSlider = document.getElementById('zoom-slider');
    const edgeLengthSlider = document.getElementById('edge-length-slider');
    const nodeSpacingSlider = document.getElementById('node-spacing-slider');
    const queryTitle = document.getElementById('query-title');
    const textSearchInput = document.getElementById('text-search-input');
    const limitInput = document.getElementById('limit-input');
    const searchButton = document.getElementById('search-button');
    const legendContent = document.getElementById('legend-content');
    const dataTable = document.getElementById('data-table');
    const summaryTotals = document.getElementById('summary-totals');
    const timescaleSlider = document.getElementById('timescale-slider');
    const timescaleLabel = document.getElementById('timescale-label');
    const downloadCsvButton = document.getElementById('download-csv-button'); 
    
    // --- Fullscreen Elements ---
    const fullscreenButton = document.getElementById('fullscreen-button');
    const exitFullscreenButton = document.getElementById('exit-fullscreen-button');
    const header = document.querySelector('.header');
    const footer = document.querySelector('.footer');
    const mainContent = document.querySelector('.main-content');
    const leftNav = document.querySelector('.left-nav');
    const rightPanel = document.querySelector('.right-panel');
    const centerHeader = document.querySelector('.center-header');
    const centerSection = document.querySelector('.center-section');
    const dataTableContainer = document.querySelector('.data-table-container');

    // This will be populated by the query set's color map
    let labelColorMap = {}; 
    const defaultColor = '#999'; // Fallback color

    function getColorForLabel(label) {
        return labelColorMap[label] || defaultColor;
    }

    function getReadableTextColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#000000' : '#ffffff';
    }
    
    // --- Data Table Population ---
    function populateDataTable(records, keys) {
        // Clear old header and body
        const oldThead = dataTable.querySelector('thead');
        if (oldThead) oldThead.remove();
        const oldTbody = dataTable.querySelector('tbody');
        const newTbody = oldTbody.cloneNode(false); // Create new empty tbody
        oldTbody.parentNode.replaceChild(newTbody, oldTbody);
        
        summaryTotals.innerHTML = '';
    
        if (!records || records.length === 0) {
            downloadCsvButton.style.display = 'none'; // Hide download button if no data
            return;
        }
        
        downloadCsvButton.style.display = 'block'; // Show download button

        // --- Summary Calculation ---
        let summaryHTML = `<span class="summary-item"><strong>Records:</strong> ${records.length}</span>`;
        const amountTotals = {};
    
        records.forEach(record => {
            keys.forEach(key => {
                const cellData = record[key];
                if (key.toLowerCase().includes('amount') && typeof cellData === 'number') {
                    amountTotals['Total Amount'] = (amountTotals['Total Amount'] || 0) + cellData;
                }
                if (key.toLowerCase().includes('count') && typeof cellData === 'number') {
                    amountTotals['Total Count'] = (amountTotals['Total Count'] || 0) + cellData;
                }
            });
        });
    
        for (const [key, total] of Object.entries(amountTotals)) {
             const formattedTotal = key.includes('Amount') 
                ? total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                : total.toLocaleString('en-US');
            summaryHTML += `<span class="summary-item"><strong>${key}:</strong> ${formattedTotal}</span>`;
        }
        summaryTotals.innerHTML = summaryHTML;
    
        // --- Simple Table Builder ---
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        keys.forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        dataTable.prepend(thead);

        records.forEach(record => {
            const row = document.createElement('tr');
            keys.forEach(key => {
                const td = document.createElement('td');
                td.textContent = formatPropertyValue(key, record[key]);
                row.appendChild(td);
            });
            newTbody.appendChild(row);
        });
    }

    // --- Download CSV Function ---
    function downloadTableAsCSV() {
        const table = document.getElementById('data-table');
        let csv = [];

        // 1. Get Headers
        const headers = [];
        table.querySelectorAll('thead th').forEach(th => headers.push(`"${th.textContent}"`));
        csv.push(headers.join(','));

        // 2. Get Rows
        table.querySelectorAll('tbody tr').forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach(td => {
                // Escape quotes by replacing them with double-quotes
                const text = td.textContent.replace(/"/g, '""');
                rowData.push(`"${text}"`);
            });
            csv.push(rowData.join(','));
        });

        // 3. Create and Download Blob
        const csvContent = "data:text/csv;charset=utf-8," + csv.join('\n');
        const encodedUri = encodeURI(csvContent);
        
        // --- Create Dynamic Filename ---
        let baseName = (currentQuery.display_name || 'Export').replace(/\s+/g, '');
        const searchText = textSearchInput.value.replace(/\s+/g, '');
        if (searchText) {
            baseName += '-' + searchText;
        }
        const fileName = baseName + '.csv';
        // --- End Dynamic Filename ---

        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', fileName); // <-- Use the new dynamic filename
        document.body.appendChild(link);
        
        link.click(); // This will download the data
        
        document.body.removeChild(link);
    }
    
    // --- Layout Definitions ---
    const layouts = {
        cola: {
            name: 'cola',
            animate: true,
            refresh: 1,
            maxSimulationTime: 20000,
            ungrabifyWhileSimulating: false,
            fit: false,
            padding: 50,
            nodeDimensionsIncludeLabels: false,
            ready: function(){},
            stop: function(){},
            randomize: false,
            avoidOverlap: true,
            handleDisconnected: true,
            convergenceThreshold: 0.01,
            nodeSpacing: (node) => 20,
            centerGraph: true,
            edgeLength: 150
        },
        fcose: {
            name: 'fcose',
            quality: "default",
            randomize: true,
            animate: false,
            animationDuration: 1000,
            fit: false,
            padding: 30,
            nodeDimensionsIncludeLabels: false,
            uniformNodeDimensions: false,
            packComponents: true,
            step: "all",
            nodeSeparation: 75,
            nodeRepulsion: node => 20000,
            idealEdgeLength: edge => 200,
            edgeElasticity: edge => 0.55,
            nestingFactor: 0.1,
            numIter: 2500,
            tile: true,
            tilingPaddingVertical: 10,
            tilingPaddingHorizontal: 10,
            gravity: 0.25,
            gravityRangeCompound: 1.5,
            gravityCompound: 1.0,
            gravityRange: 3.8,
            initialEnergyOnIncremental: 0.3,
            ready: () => {},
            stop: () => {}
        },
        concentric: {
            name: 'concentric',
            fit: false,
            padding: 30,
            startAngle: 3 / 2 * Math.PI,
            clockwise: true,
            equidistant: false,
            minNodeSpacing: 10,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: false,
            spacingFactor: undefined,
            concentric: function( node ){
                return node.degree();
            },
            levelWidth: function( nodes ){
                return nodes.maxDegree() / 4;
            },
            animate: false
        },
        circle: {
            name: 'circle',
            fit: true,
            padding: 30,
            radius: undefined,
            startAngle: 3/2 * Math.PI,
            clockwise: true,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: false,
        },
        breadthfirst: {
            name: 'dagre',
            fit: true,
            direction: 'rightward',  
            directed: true,
            padding: 10,
            circle: false,
            grid: true,
            spacingFactor: 1,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: false,
            maximal: false,
            animate: true,
            animationDuration: 500,
            transform: function (node, position) {
                return {
                    x: position.y,
                    y: position.x
                };
            }
        }
    };
    
    // --- Cytoscape Initialization ---
    const cy = cytoscape({
        container: cyContainer,
        style: [
            { 
                selector: 'node', 
                style: { 
                    'background-color': (ele) => getColorForLabel(ele.data('label')), 
                    'label': (ele) => ele.data(currentQuery.caption_property) || ele.data('name'),
                    'width': (ele) => ele.data('relative_size') ? 8 + ele.data('relative_size') * 20 : 13,
                    'height': (ele) => ele.data('relative_size') ? 8 + ele.data('relative_size') * 20 : 13,
                    'text-opacity': 0, 'color': '#333', 'font-size': '12px', 
                    'border-width': 0 // Default: no border
                } 
            },
            // --- NEW STYLE for Start Node (Client) ---
            {
                selector: 'node[label = "Client"]',
                style: {
                    'border-width': 4,
                    'border-color': '#ffffff' // Thick white border
                }
            },
            // --- NEW STYLE for End Node (Prospect) ---
            {
                selector: 'node[label = "Prospect"]',
                style: {
                    'background-color': '#ffffff', // White fill
                    'border-width': 4,
                    // Use the node's assigned color for the border
                    'border-color': (ele) => getColorForLabel(ele.data('label')) 
                }
            },
            { selector: 'node.labels-visible', style: { 'text-opacity': 1 } },
            { 
                selector: 'edge', 
                style: { 
                    'width': (ele) => ele.data('weight') ? Math.min(Math.max(ele.data('weight'), 1), 10) : 1,
                    'target-arrow-shape': 'triangle', 'curve-style': 'straight',
                    'line-color': '#ccc', 'target-arrow-color': '#ccc',
                    'label': '', // --- REMOVED EDGE LABEL ---
                    'text-opacity': 0, 'font-size': '10px', 'color': '#555'
                } 
            },
            { selector: 'edge.labels-visible', style: { 'text-opacity': 1 } },
            { selector: '.selected', style: { 'border-width': 4, 'border-color': '#f1c40f' } },
            {
                selector: ':parent',
                style: {
                    'background-opacity': 0.333, 'background-color': '#e0e0e0',
                    'border-color': '#a0a0a0', 'border-width': 1, 'font-size': 16,
                    'color': '#555', 'text-valign': 'top', 'text-halign': 'center',
                    'padding': '15px', 'label': 'data(id)'
                }
            }
        ]
    });
    
    const showLoader = () => loader.style.display = 'flex';
    const hideLoader = () => loader.style.display = 'none';

    zoomSlider.addEventListener('input', (e) => cy.zoom(parseFloat(e.target.value)));
    
    function reRunLayout() {
        // Find the checked radio button's value
        const layoutName = document.querySelector('input[name="graph-layout"]:checked').value;
        const edgeLength = parseInt(edgeLengthSlider.value);
        const nodeSpacing = parseInt(nodeSpacingSlider.value);

        const options = Object.assign({}, layouts[layoutName], {
            idealEdgeLength: edgeLength,
            edgeLength: edgeLength,
            nodeSeparation: nodeSpacing,
            nodeSpacing: nodeSpacing,
            minNodeSpacing: nodeSpacing
        });
        cy.layout(options).run();
    }
    
    // Add event listeners to the radio buttons
    document.querySelectorAll('input[name="graph-layout"]').forEach(radio => {
        radio.addEventListener('change', reRunLayout);
    });
    
    edgeLengthSlider.addEventListener('change', reRunLayout);
    nodeSpacingSlider.addEventListener('change', reRunLayout);
    
    function updateLegend() {
        legendContent.innerHTML = '';
        const displayedLabels = new Set();
        cy.nodes().forEach(node => {
            const label = node.data('label');
            if (label && !displayedLabels.has(label)) {
                displayedLabels.add(label);
                const color = getColorForLabel(label);
                const legendItem = document.createElement('div');
                legendItem.classList.add('legend-item');
                legendItem.innerHTML = `<div class="legend-color-box" style="background-color: ${color};"></div><span>${label}</span>`;
                legendContent.appendChild(legendItem);
            }
        });
    }

    function calculateRelativeSizes() {
        const sizeProperty = currentQuery.mapping?.node_size;
        if (!sizeProperty) {
            cy.nodes().forEach(node => node.data('relative_size', 0.5));
            return;
        }

        const maxSizes = {};
        cy.nodes().forEach(node => {
            const label = node.data('label');
            const size = node.data('size') || 0;
            if (!maxSizes[label] || size > maxSizes[label]) {
                maxSizes[label] = size;
            }
        });

        cy.nodes().forEach(node => {
            const label = node.data('label');
            const size = node.data('size') || 0;
            const maxSize = maxSizes[label];
            if (maxSize > 0) {
                node.data('relative_size', size / maxSize);
            } else {
                node.data('relative_size', 0.5);
            }
        });
    }

    async function fetchDataAndRender(url, isDrillDown = false) {
        showLoader();
        cyContainer.style.opacity = 0.5;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            // data payload is: { "graph": ..., "table": ... }
            
            const addedElements = cy.add(data.graph);
            updateLegend();
    
            // Only update the table on the *initial search*, not on graph drill-down
            if (!isDrillDown) {
                populateDataTable(data.table.records, data.table.keys);
            }
    
            return addedElements;
        } catch (error) {
            console.error("Failed to fetch graph data:", error);
            if (!isDrillDown) {
                populateDataTable([], []);
            }
            return cy.collection();
        } finally {
            hideLoader();
            cyContainer.style.opacity = 1;
        }
    }

    timescaleSlider.addEventListener('input', () => {
        const months = parseInt(timescaleSlider.value);
        timescaleLabel.textContent = `Last ${months} month(s)`;
    });

    async function loadGraph(query) {
        currentQuery = query;
        labelColorMap = query.colors || {}; // Load the static color map
        try { setActiveQueryKey(query.name); } catch(e) {}
        cy.elements().remove();
        propertiesTitle.textContent = "Properties";
        propertiesPanel.innerHTML = `<p>Click a node or edge to see its properties.</p>`;
        
        const limit = limitInput.value;
        const textSearch = textSearchInput.value;
        const months = parseInt(timescaleSlider.value);

        let searchUrl = SEARCH_API_URL_TEMPLATE.replace('{query_name}', query.name) + `?limit=${limit}&months=${months}`;
        if (textSearch) {
            searchUrl += `&text_search=${encodeURIComponent(textSearch)}`;
        }
        
        await fetchDataAndRender(searchUrl, false); 
        calculateRelativeSizes();
        handleZoom();
        reRunLayout();
        
        document.querySelectorAll('#query-list li').forEach(li => {
            if (li.dataset.queryName === query.name) {
                li.classList.add('active');
                queryTitle.textContent = li.firstChild.textContent.trim();
            } else {
                li.classList.remove('active');
            }
        });
    }

    searchButton.addEventListener('click', () => { if (currentQuery.name) loadGraph(currentQuery); });
    textSearchInput.addEventListener('keyup', (event) => { if (event.key === 'Enter') searchButton.click(); });
    downloadCsvButton.addEventListener('click', downloadTableAsCSV);

    async function populateNav() {
        const response = await fetch(QUERIES_API_URL);
        const queries = await response.json();
        const queryList = document.getElementById('query-list');
        
        if (!queries || queries.length === 0) {
            queryTitle.textContent = "No queries configured.";
            hideLoader();
            return;
        }

        queries.forEach(query => {
            const listItem = document.createElement('li');
            listItem.dataset.queryName = query.name;
            listItem.innerHTML = ` ${query.display_name} <div class="nav-item-desc">${query.description}</div> `;
            listItem.addEventListener('click', () => {
                textSearchInput.value = "";
                loadGraph(query);
            });
            queryList.appendChild(listItem);
        });
        
        // Auto-load the first query
        await loadGraph(queries[0]);
    }

    function formatPropertyValue(key, value) {
        if (value === null || value === undefined) return 'N/A';
    
        if (key && key.toLowerCase().includes('amount') && typeof value === 'number') {
            return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        }
    
        if (typeof value === 'number') {
            return value.toLocaleString('en-US');
        }
    
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            try {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
            } catch (e) {
                return value;
            }
        }
    
        return value;
    }
    

    async function showElementProperties(element) {
        const props = await fetchElementProperties(element);
        
        propertiesTitle.style.backgroundColor = 'transparent';
        propertiesTitle.style.color = '#003366';
        propertiesTitle.className = '';
    
        if (!props) {
            propertiesTitle.textContent = "Properties";
            propertiesPanel.innerHTML = `<p>Error loading properties.</p>`;
            return;
        }
    
        const isNode = element.isNode();
        const nodeType = element.data('label');
        const titleText = isNode 
            ? (props[currentQuery.caption_property] || props.name || nodeType) 
            : (element.data('label') || "Edge Properties");
    
        propertiesTitle.textContent = titleText;
    
        if (isNode && nodeType) {
            const color = getColorForLabel(nodeType);
            propertiesTitle.style.backgroundColor = color;
            propertiesTitle.style.color = getReadableTextColor(color);
            propertiesTitle.className = 'properties-title-styled';
        }
    
        let html = '<ul>';
        for (const [key, value] of Object.entries(props)) {
            // Don't show redundant info
            if (key === 'display_name' || key === 'original_element_id') continue; 
            html += `<li><strong>${key}:</strong> ${formatPropertyValue(key, value)}</li>`;
        }
        html += '</ul>';
        propertiesPanel.innerHTML = html;
    }
    
    let tapTimeout;
    cy.on('tap', 'node, edge', function(evt) {
        const element = evt.target;
        cy.elements().removeClass('selected');
        element.addClass('selected');
        if(element.isNode()) {
            clearTimeout(tapTimeout);
            // Use a short timeout to distinguish single-tap from double-tap
            tapTimeout = setTimeout(() => showElementProperties(element), 200);
        } else {
            showElementProperties(element);
        }
    });

    // --- Node Double-Tap Handler (Expand/Collapse) ---
    cy.on('dbltap', 'node', async function(evt) {
        clearTimeout(tapTimeout); // Cancel the single-tap action
        const node = evt.target;

        // 1. Check if the node is already expanded.
        const isExpanded = node.data('_expanded');

        if (isExpanded) {
            // --- COLLAPSE LOGIC ---
            
            // 1. Remove descendants from graph
            //    node.successors() gets all outgoing edges and their target nodes, recursively.
            const descendants = node.successors();
            cy.remove(descendants);
            
            // 2. Mark this node as collapsed
            node.data('_expanded', false);

        } else {
            // --- EXPAND LOGIC (REBUILT) ---
            
            const nodeId = node.id(); // This is the synthetic ID (e.g., "rel_node")
            const nodeType = node.data('label');
            
            // --- Build history DYNAMICALLY from predecessors ---
            const pathHistory = {};
            
            // *** THE FIX: Use .predecessors() not .ancestors() ***
            // .predecessors() finds graph-theory parents by traversing edges.
            // .ancestors() is for compound nodes (nodes inside nodes).
            const predecessors = node.predecessors('node'); 
            
            predecessors.forEach(predecessor => {
                const label = predecessor.data('label');
                // Use the real_id (original_element_id) for the query
                const real_id = predecessor.data('original_element_id') || predecessor.id(); 
                if (label && real_id) {
                    pathHistory[label] = { real_id: real_id };
                }
            });
            // --- End dynamic history build ---

            // Build history params string from the dynamic path
            const historyParams = Object.entries(pathHistory)
                .map(([type, nodeInfo]) => `${encodeURIComponent(type)}_node_id=${encodeURIComponent(nodeInfo.real_id)}`)
                .join('&');

            const months = parseInt(timescaleSlider.value);
            
            // Call the API using the SYNTHETIC ID (nodeId) in the URL
            // The backend will parse this nodeId to get the "real_node_id" for the $node_id param
            let neighborsUrl = NEIGHBORS_API_URL_TEMPLATE.replace('{node_id}', nodeId) 
                + `?limit=10&node_type=${nodeType}&query_key=${encodeURIComponent(document.getElementById('current-query-key')?.value || '')}&months=${months}`;
            
            if (historyParams) {
                neighborsUrl += `&${historyParams}`;
            }
            
            // Fetch and add the new elements
            const addedElements = await fetchDataAndRender(neighborsUrl, true);
            
            // Only mark as expanded if we actually added something
            if (addedElements.length > 0) {
                node.data('_expanded', true); // Mark as expanded
            }

            calculateRelativeSizes();
            reRunLayout(); 
            handleZoom();
        }
    });

    async function fetchElementProperties(element) {
        // Use the original_element_id if it exists, otherwise fall back to the element's ID
        const isNode = element.isNode();
        const id = isNode ? (element.data('original_element_id') || element.id()) : element.id();
        
        const url = isNode ? NODE_PROPERTIES_API_URL_TEMPLATE.replace('{node_id}', id) : EDGE_PROPERTIES_API_URL_TEMPLATE.replace('{edge_id}', id);
        
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch properties for tooltip:", error);
            return null;
        }
    }

    function makeTooltip(element) {
        const ref = element.popperRef();
        const dummyDomEle = document.createElement('div');
        const tip = tippy(dummyDomEle, {
            getReferenceClientRect: ref.getBoundingClientRect,
            trigger: 'manual',
            content: () => {
                const content = document.createElement('div');
                const caption = element.data(currentQuery.caption_property) || element.data('name') || element.data('label');
                content.innerHTML = `<b>${caption}</b><p>Loading properties...</p>`;
                return content;
            },
            onShow: async (instance) => {
                const props = await fetchElementProperties(element);
                const caption = element.data(currentQuery.caption_property) || element.data('name') || element.data('label');
                let content = `<b>${caption}</b>`;
                if (props) {
                    content += '<hr style="margin: 2px 0;"><ul>';
                    for (const [key, value] of Object.entries(props)) {
                        if (key === 'display_name' || key === 'original_element_id') continue;
                        content += `<li style="font-size: 0.8em;"><strong>${key}:</strong> ${formatPropertyValue(key, value)}</li>`;
                    }
                    content += '</ul>';
                } else {
                    content += '<p>No properties found.</p>';
                }
                instance.setContent(content);
            },
            arrow: true,
            placement: 'bottom',
            hideOnClick: false,
            allowHTML: true,
            theme: 'translucent'
        });
        return tip;
    }
    
    cy.on('mouseover', 'node, edge', (evt) => {
        const element = evt.target;
        element.data('tooltip', makeTooltip(element));
        element.data('tooltip').show();
    });
    cy.on('mouseout', 'node, edge', (evt) => {
        const tooltip = evt.target.data('tooltip');
        if(tooltip) {
            tooltip.destroy();
            evt.target.removeData('tooltip');
        }
    });

    // --- Drag Behavior ---
    let draggedParent = null;
    let dragOffsets = {};

    cy.on('grab', 'node', function(evt) {
        draggedParent = evt.target;
        const parentPos = draggedParent.position();
        
        draggedParent.neighborhood('node').forEach(function(neighbor) {
            const neighborPos = neighbor.position();
            dragOffsets[neighbor.id()] = {
                x: neighborPos.x - parentPos.x,
                y: neighborPos.y - parentPos.y
            };
        });
    });

    cy.on('drag', 'node', function(evt) {
        if (draggedParent && draggedParent === evt.target) {
            const parentPos = draggedParent.position();
            
            draggedParent.neighborhood('node').forEach(function(neighbor) {
                const offset = dragOffsets[neighbor.id()];
                if (offset) {
                    const newPos = {
                        x: parentPos.x + offset.x,
                        y: parentPos.y + offset.y
                    };
                    neighbor.position(newPos);
                }
            });
        }
    });

    cy.on('free', 'node', function(evt) {
        if (draggedParent && draggedParent === evt.target) {
            draggedParent = null;
            dragOffsets = {};
        }
    });

    // --- Dynamic Label Visibility ---
    const labelThreshold = 1.2;
    const baseNodeFontSize = 12;
    const baseEdgeFontSize = 10;
    const minFontSize = 4;
    
    function handleZoom() {
        const zoom = cy.zoom();
        if (zoom > labelThreshold) {
            cy.elements().addClass('labels-visible');
        } else {
            cy.elements().removeClass('labels-visible');
        }
        cy.nodes().style('font-size', Math.max(minFontSize, baseNodeFontSize / zoom));
        cy.edges().style('font-size', Math.max(minFontSize, baseEdgeFontSize / zoom));
    }
    cy.on('zoom pan', handleZoom);
    
    async function updateHeaderInfo() {
        const response = await fetch(INFO_API_URL);
        const info = await response.json();
        document.getElementById('db-info-span').innerHTML = ` <span>User: ${info.user_name}</span> | <span>Database: ${info.database_name}</span> `;
    }

    // --- Fullscreen Toggle Logic (Simplified + setTimeout) ---
    fullscreenButton.addEventListener('click', () => {
        // Hide all panels
        header.style.display = 'none';
        footer.style.display = 'none';
        leftNav.style.display = 'none';
        rightPanel.style.display = 'none';
        centerHeader.style.display = 'none';
        dataTableContainer.style.display = 'none';
        
        // Expand main content
        mainContent.style.top = '0';
        mainContent.style.bottom = '0';
        centerSection.style.height = '100%';
        //centerSection.style.width = '100%'; // <-- Explicitly set width
        cyContainer.style.height = '100%';
        
        // Toggle buttons
        fullscreenButton.style.display = 'none';
        exitFullscreenButton.style.display = 'block';
        
        // Queue the resize to happen *after* the browser repaints the layout
        setTimeout(() => {
            cy.resize();
            cy.fit(); // Fit the graph to the new, larger view
            handleZoom();
        }, 0);
    });

    exitFullscreenButton.addEventListener('click', () => {
        // Show all panels
        header.style.display = 'flex';
        footer.style.display = 'flex';
        leftNav.style.display = 'block';
        rightPanel.style.display = 'flex';
        centerHeader.style.display = 'flex';
        dataTableContainer.style.display = 'flex';
        
        // Restore main content
        mainContent.style.top = '50px';
        mainContent.style.bottom = '25px';
        centerSection.style.height = ''; // Let CSS take over
        centerSection.style.width = '1px'; // <-- YOUR FIX (using 'auto' to reset)
        cyContainer.style.height = '65%'; // Restore original height
        
        // Toggle buttons
        fullscreenButton.style.display = 'block';
        exitFullscreenButton.style.display = 'none';
        
        // Queue the resize to happen *after* the browser repaints the layout
        setTimeout(() => {
            cy.resize();
            //handleZoom(); // Restore original zoom/pan
        }, 0);
    });

    async function startApp() {
        showLoader();
        await updateHeaderInfo();
        await populateNav();
    }
    
    startApp();
});