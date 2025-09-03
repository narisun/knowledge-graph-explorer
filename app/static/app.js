// app/static/app.js
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

    let currentQuery = {};

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
    const legendContent = document.getElementById('legend-content');

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
            { 
                selector: 'node', 
                style: { 
                    'background-color': (ele) => getColorForLabel(ele.data('label')), 
                    'label': (ele) => ele.data(currentQuery.caption_property) || ele.data('name'),
                    // --- UPDATED: Node sizes reduced by ~50% ---
                    'width': (ele) => ele.data('relative_size') ? 8 + ele.data('relative_size') * 20 : 13,
                    'height': (ele) => ele.data('relative_size') ? 8 + ele.data('relative_size') * 20 : 13,
                    'text-opacity': 0, 'color': '#333', 'font-size': '10px', 'border-width': 0 
                } 
            },
            { selector: 'node.labels-visible', style: { 'text-opacity': 1 } },
            { 
                selector: 'edge', 
                style: { 
                    'width': (ele) => ele.data('weight') ? Math.min(Math.max(ele.data('weight'), 1), 10) : 1,
                    'target-arrow-shape': 'triangle', 'curve-style': 'unbundled-bezier',
                    'line-color': '#ccc', 'target-arrow-color': '#ccc', 'label': 'data(label)',
                    'text-opacity': 0, 'font-size': '9px', 'color': '#555'
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
    cy.on('zoom', () => zoomSlider.value = cy.zoom());
    
    function reRunLayout() {
        const layoutName = graphLayoutSelect.value;
        const options = {
            name: layoutName,
            animate: true,
            padding: 50,
            fit: true,
            idealEdgeLength: parseInt(edgeLengthSlider.value),
            edgeLength: parseInt(edgeLengthSlider.value),
            nodeSeparation: parseInt(nodeSpacingSlider.value),
            nodeSpacing: parseInt(nodeSpacingSlider.value),
            spacingFactor: 1.5,
            nodeOverlap: 20,
            nodeRepulsion: 400000
        };
        cy.layout(options).run();
    }
    graphLayoutSelect.addEventListener('change', reRunLayout);
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

    async function fetchDataAndRender(url) {
        showLoader();
        cyContainer.style.opacity = 0.5;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const addedElements = cy.add(data);
            updateLegend();
            return addedElements;
        } catch (error) {
            console.error("Failed to fetch graph data:", error);
            return cy.collection();
        } finally {
            hideLoader();
            cyContainer.style.opacity = 1;
        }
    }

    async function loadGraph(query) {
        currentQuery = query;
        cy.elements().remove();
        propertiesTitle.textContent = "Properties";
        propertiesPanel.innerHTML = `<p>Click a node or edge to see its properties.</p>`;
        
        const limit = limitInput.value;
        const textSearch = textSearchInput.value;

        let searchUrl = SEARCH_API_URL_TEMPLATE.replace('{query_name}', query.name) + `?limit=${limit}`;
        if (textSearch) {
            searchUrl += `&text_search=${encodeURIComponent(textSearch)}`;
        }
        
        await fetchDataAndRender(searchUrl);
        calculateRelativeSizes();
        
        const layout = cy.layout({name: graphLayoutSelect.value, fit: true, padding: 50});
        layout.one('layoutstop', handleZoom);
        layout.run();
        
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
                loadGraph(query);
            });
            queryList.appendChild(listItem);
        });
        if (queries.length > 0) {
            await loadGraph(queries[0]);
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
        
        propertiesTitle.textContent = element.isNode() ? (props[currentQuery.caption_property] || props.name || "Node Properties") : (element.data('label') || "Edge Properties");
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

    

async function locallyLayoutNewNeighbors(centerNode, addedElements) {
  const newNodes = addedElements.filter('node');
  if (newNodes.empty()) return;

  const others = cy.nodes().difference(newNodes);
  others.lock();
  try {
    const cpos = centerNode.position();
    newNodes.positions(() => ({ x: cpos.x, y: cpos.y }));

    const spacing = parseInt(nodeSpacingSlider.value) || 30;
    const minSep  = Math.max(24, spacing);
    const maxPush = 10;
    const angleStep = Math.PI / 18; // 10° adjustments

    // Viewport-aware ring radius
    const ext = cy.extent();
    const margin = 30;
    const rView = 0.9 * Math.min(
      Math.max(10, cpos.x - ext.x1 - margin),
      Math.max(10, ext.x2 - cpos.x - margin),
      Math.max(10, cpos.y - ext.y1 - margin),
      Math.max(10, ext.y2 - cpos.y - margin)
    );
    const baseR = Math.max(Math.min(rView, spacing * 3 + 60), minSep + 40); // clamp to keep in view

    // Direction away from density (graph center -> node)
    const bb = cy.nodes().boundingBox();
    const graphCenter = { x: (bb.x1 + bb.x2)/2, y: (bb.y1 + bb.y2)/2 };
    let dir = { x: cpos.x - graphCenter.x, y: cpos.y - graphCenter.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    dir = { x: dir.x/len, y: dir.y/len };
    const centerAngle = Math.atan2(dir.y, dir.x);

    // Build a snapshot of existing positions for min-distance checks
    const existingPositions = [];
    others.forEach(o => existingPositions.push(o.position()));
    function nearestDist(pos){
      let min = Infinity;
      for (const p of existingPositions) {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < min) min = d;
      }
      return min;
    }

    // Distribute on a local arc; adjust angles first (not radius) to avoid overlap,
    // then allow a small radius growth but never past rView.
    const newNs = []; newNodes.forEach(n => newNs.push(n));
    const count = newNs.length;
    const spread = Math.min(Math.PI * 0.85, Math.max(0.6, (count - 1) * 0.22));
    const rMax = Math.max(minSep + 40, rView);

    for (let i = 0; i < count; i++) {
      const t = (count === 1) ? 0.5 : (i / (count - 1));
      let angle = centerAngle - spread/2 + spread * t;
      let r = baseR;
      let finalPos = null;

      // Try small angular adjustments first to stay near the node and inside viewport
      let k = 0;
      while (k < 12 && !finalPos) {
        const tryAngle = angle + ((k % 2 === 0 ? 1 : -1) * Math.ceil(k/2)) * angleStep;
        const pos = { x: cpos.x + Math.cos(tryAngle) * r, y: cpos.y + Math.sin(tryAngle) * r };
        const inView = (pos.x > ext.x1 + margin && pos.x < ext.x2 - margin &&
                        pos.y > ext.y1 + margin && pos.y < ext.y2 - margin);
        if (inView && nearestDist(pos) >= minSep) finalPos = pos;
        k++;
      }

      // If still no spot, gently increase radius but keep under rMax (viewport bound)
      let tries = 0;
      while (!finalPos && tries < maxPush && r < rMax) {
        r += Math.max(20, spacing * 0.6);
        const pos = { x: cpos.x + Math.cos(angle) * r, y: cpos.y + Math.sin(angle) * r };
        const inView = (pos.x > ext.x1 + margin && pos.x < ext.x2 - margin &&
                        pos.y > ext.y1 + margin && pos.y < ext.y2 - margin);
        if (inView && nearestDist(pos) >= minSep) finalPos = pos;
        tries++;
      }

      // Fallback: clamp to viewport edge toward the chosen direction (still keeps things visible)
      if (!finalPos) {
        const clampR = Math.max(10, rView - margin);
        finalPos = { x: cpos.x + Math.cos(angle) * clampR, y: cpos.y + Math.sin(angle) * clampR };
      }

      await newNs[i].animate({ position: finalPos }, { duration: 220, queue: false }).promise();
    }
  } finally {
    cy.nodes().unlock();
  }
}


cy.on('dbltap', 'node', async function(evt) {
        clearTimeout(tapTimeout);
        const node = evt.target;
        const nodeId = node.id();
        const nodeType = node.data('label');
        const neighborsUrl = NEIGHBORS_API_URL_TEMPLATE.replace('{node_id}', nodeId) + `?limit=15&node_type=${nodeType}`;
        const added = await fetchDataAndRender(neighborsUrl);
        calculateRelativeSizes();
        await locallyLayoutNewNeighbors(node, added);
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
        if (cy.zoom() > labelThreshold) {
            cy.elements().addClass('labels-visible');
        } else {
            cy.elements().removeClass('labels-visible');
        }
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