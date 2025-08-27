// backend/app/static/app.js
document.addEventListener('DOMContentLoaded', function() {
    if (typeof cytoscape('core', 'popperRef') === 'undefined') {
        cytoscape.use(cytoscapePopper);
    }

    const INFO_API_URL = '/api/connection-info';
    const QUERIES_API_URL = '/api/queries';
    const SEARCH_API_URL_TEMPLATE = '/api/search/{query_name}';
    const NEIGHBORS_API_URL_TEMPLATE = '/api/nodes/{node_id}/neighbors';
    const NODE_PROPERTIES_API_URL_TEMPLATE = '/api/nodes/{node_id}/properties';
    const EDGE_PROPERTIES_API_URL_TEMPLATE = '/api/edges/{edge_id}/properties';

    let currentQueryName = null;

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
    const graphLayoutSelect = document.getElementById('graph-layout-select');

    const colorPalette = ['#5B8FF9', '#61DDAA', '#65789B', '#F6BD16', '#7262FD', '#78D3F8', '#9661BC', '#F6903D', '#008685', '#F08BB4'];
    const labelColorMap = {};
    let colorIndex = 0;
    function getColorForLabel(label) {
        if (!labelColorMap[label]) {
            labelColorMap[label] = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
        }
        return labelColorMap[label];
    }

    const cy = cytoscape({
        container: cyContainer,
        style: [
            { selector: 'node', style: { 'background-color': (ele) => getColorForLabel(ele.data('label')), 'label': 'data(name)', 'text-opacity': 0, 'color': '#fff', 'text-outline-color': '#333', 'text-outline-width': 2, 'font-size': '12px', 'border-width': 0 } },
            { selector: 'node.labels-visible', style: { 'text-opacity': 1 } },
            { selector: 'edge', style: { 'width': 1, 'target-arrow-shape': 'triangle', 'curve-style': 'unbundled-bezier', 'control-point-distances': '20', 'control-point-weights': '0.5', 'label': 'data(label)', 'text-opacity': 0, 'font-size': '10px', 'color': '#555', 'line-color': '#ccc', 'target-arrow-color': '#ccc', } },
            { selector: 'edge.labels-visible', style: { 'text-opacity': 1 } },
            { selector: '.selected', style: { 'border-width': 4, 'border-color': '#f1c40f' } }
        ]
    });
    
    const showLoader = () => loader.style.display = 'flex';
    const hideLoader = () => loader.style.display = 'none';

    zoomSlider.addEventListener('input', (e) => cy.zoom(parseFloat(e.target.value)));
    cy.on('zoom', () => zoomSlider.value = cy.zoom());
    
    function reRunLayout() {
        const layoutName = graphLayoutSelect.value;
        const options = {
            name: layoutName,
            animate: true,
            padding: 30,
            fit: true,
            // Add layout-specific options from sliders
            edgeLength: parseInt(edgeLengthSlider.value),
            nodeSpacing: parseInt(nodeSpacingSlider.value),
            nodeRepulsion: 400000, // Cose option
            spacingFactor: 1.5 // Breadthfirst option
        };
        cy.layout(options).run();
    }
    // Re-run layout when any control changes
    graphLayoutSelect.addEventListener('change', reRunLayout);
    edgeLengthSlider.addEventListener('change', reRunLayout);
    nodeSpacingSlider.addEventListener('change', reRunLayout);

    async function fetchDataAndRender(url) {
        showLoader();
        cyContainer.style.opacity = 0.5;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return cy.add(data);
        } catch (error) {
            console.error("Failed to fetch graph data:", error);
            return cy.collection();
        } finally {
            hideLoader();
            cyContainer.style.opacity = 1;
        }
    }

    async function loadGraph(queryName) {
        currentQueryName = queryName;
        cy.elements().remove();
        propertiesTitle.textContent = "Properties";
        propertiesPanel.innerHTML = `<p>Click a node or edge to see its properties.</p>`;
        
        const limit = limitInput.value;
        const textSearch = textSearchInput.value;

        let searchUrl = SEARCH_API_URL_TEMPLATE.replace('{query_name}', queryName) + `?limit=${limit}`;
        if (textSearch) {
            searchUrl += `&text_search=${encodeURIComponent(textSearch)}`;
        }
        
        await fetchDataAndRender(searchUrl);
        reRunLayout();
        handleZoom();
        
        document.querySelectorAll('#query-list li').forEach(li => {
            if (li.dataset.queryName === queryName) {
                li.classList.add('active');
                queryTitle.textContent = li.firstChild.textContent.trim();
            } else {
                li.classList.remove('active');
            }
        });
    }

    searchButton.addEventListener('click', () => { if (currentQueryName) loadGraph(currentQueryName); });
    textSearchInput.addEventListener('keyup', (event) => { if (event.key === 'Enter') searchButton.click(); });

    async function populateNav() {
        const response = await fetch(QUERIES_API_URL);
        const queries = await response.json();
        const queryList = document.getElementById('query-list');
        queries.forEach(query => {
            const listItem = document.createElement('li');
            listItem.dataset.queryName = query.name;
            listItem.innerHTML = ` ${query.display_name} <div class="nav-item-desc">${query.description}</div> `;
            listItem.addEventListener('click', () => {
                textSearchInput.value = "";
                loadGraph(query.name);
            });
            queryList.appendChild(listItem);
        });
        if (queries.length > 0) {
            await loadGraph(queries[0].name);
        } else {
            hideLoader();
        }
    }

    async function showElementProperties(element) {
        const props = await fetchElementProperties(element);
        if(!props) {
            propertiesTitle.textContent = "Properties";
            propertiesPanel.innerHTML = `<p>Error loading properties.</p>`;
            return;
        }
        
        propertiesTitle.textContent = element.isNode() ? (props.name || "Node Properties") : (element.data('label') || "Edge Properties");
        let html = '<ul>';
        for (const [key, value] of Object.entries(props)) {
            html += `<li><strong>${key}:</strong> ${value}</li>`;
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
            tapTimeout = setTimeout(() => showElementProperties(element), 200);
        } else {
            showElementProperties(element);
        }
    });

    // SIMPLIFIED: Double-click just fetches neighbors but doesn't run a special layout
    cy.on('dbltap', 'node', async function(evt) {
        clearTimeout(tapTimeout);
        const node = evt.target;
        const nodeId = node.id();
        const neighborsUrl = NEIGHBORS_API_URL_TEMPLATE.replace('{node_id}', nodeId) + '?limit=15';
        await fetchDataAndRender(neighborsUrl);
        // After adding nodes, re-run the currently selected main layout
        reRunLayout();
    });

    async function fetchElementProperties(element) {
        const id = element.id();
        const isNode = element.isNode();
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
                content.innerHTML = `<b>${element.data('name') || element.data('label')}</b><p>Loading properties...</p>`;
                return content;
            },
            onShow: async (instance) => {
                const props = await fetchElementProperties(element);
                let content = `<b>${element.data('name') || element.data('label')}</b>`;
                if (props) {
                    content += '<hr style="margin: 2px 0;"><ul>';
                    for (const [key, value] of Object.entries(props)) {
                        content += `<li style="font-size: 0.8em;"><strong>${key}:</strong> ${value}</li>`;
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

    const labelThreshold = 1.2;
    function handleZoom() {
        if (cy.zoom() > labelThreshold) cy.elements().addClass('labels-visible');
        else cy.elements().removeClass('labels-visible');
    }
    cy.on('zoom pan', handleZoom);
    
    async function updateHeaderInfo() {
        const response = await fetch(INFO_API_URL);
        const info = await response.json();
        document.getElementById('db-info-span').innerHTML = ` <span>User: ${info.user_name}</span> | <span>Database: ${info.database_name}</span> `;
    }

    async function startApp() {
        showLoader();
        await updateHeaderInfo();
        await populateNav();
    }
    
    startApp();
});