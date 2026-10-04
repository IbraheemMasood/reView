const PLACEHOLDER = 'Click on nodes to inspect execution pathways.';
const TYPE_INFO = {
    entry:  'Program entry point. _start prepares the process; main begins the program logic.',
    custom: 'Function defined in this program.',
    import: 'Function provided by an external library.'
};
const BADGE = {
    entry:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    custom: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    import: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
};
const CHIP = 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono text-xs text-slate-200';

/* ---------- interest heuristics constants ---------- */
const INTEREST = {
    risky:   ['gets','strcpy','strcat','sprintf','vsprintf','scanf','fscanf','sscanf','system','popen',
        'execl','execlp','execle','execv','execvp','execve','mktemp','tmpnam'],
    compare: ['strcmp','strncmp','memcmp','strcasecmp','strncasecmp'],
    nameWords:   /licen[cs]e|serial|passw|secret|token|auth|login|admin|privileg|crypt|cipher|hash|checksum|verif|valid|compar|cmp|grant/i,
    stringWords: /licen[cs]e|serial|passw|secret|token|key|auth|login|denied|granted|invalid|incorrect|wrong|correct|success|welcome|access/i
};

let cy = null, nodes = new Map(), out = new Map(), inn = new Map();
let visible = new Set(), rootId = null;
let interest = new Map(), showInterest = true;
let layoutDirection = null;
const positionCache = new Map();
const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionDuration = ms => reducedMotion.matches ? 0 : ms;
const themeColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let functionFilter = 'all';
const graphPath = location.pathname.split('/').filter(Boolean);
let graphLabel = decodeURIComponent(graphPath.at(-1)?.endsWith('.html') ? (graphPath.at(-2) || 'Binary graph') : (graphPath.at(-1) || 'Binary graph'));

/* ---------- user renames (display only; node.label stays the original so traces still match) ---------- */
let renames = new Map(), inspectedId = null;
const nameOf = id => renames.get(id) || (nodes.get(id) || {}).label || id;
const renameKey = () => 'reView-names:' + djb2(new TextEncoder().encode([...nodes.keys()].join(',')));
function loadRenames() {
    renames = new Map();
    try {
        const o = JSON.parse(localStorage.getItem(renameKey()) || '{}');
        Object.entries(o).forEach(([id, nm]) => { if (nodes.has(id) && typeof nm === 'string' && nm) renames.set(id, nm); });
    } catch (e) { /* storage unavailable: renames just won't persist */ }
}
function saveRenames() {
    try { localStorage.setItem(renameKey(), JSON.stringify(Object.fromEntries(renames))); } catch (e) {}
}
// decompiled code with every renamed function swapped for its new name (single pass, whole words only)
function renderedCode(n) {
    const code = n.decompiled || '// Decompilation unavailable';
    const map = new Map();
    renames.forEach((nm, id) => { const o = nodes.get(id); if (o && o.label !== nm) map.set(o.label, nm); });
    if (!map.size) return code;
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b(?:' + [...map.keys()].map(esc).join('|') + ')\\b', 'g');
    return code.replace(re, m => map.get(m));
}

if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);

// Canvas text doesn't trigger web-font loading, so load it explicitly and repaint once ready
Promise.all([
    document.fonts.load("400 11px 'Martian Mono'"),
    document.fonts.load("700 11px 'Martian Mono'")
]).then(() => cy && cy.forceRender()).catch(() => {});

/* ---------- loading ---------- */
fetch('graph.json')
    .then(r => { if (!r.ok) throw new Error('graph.json: HTTP ' + r.status); return r.json(); })
    .then(loadGraph)
    .catch(showLoadError);

function showLoadError(err) {
    $('loadErr').textContent = err.message;
    $('loadMsg').classList.remove('hidden');
    if ($('statusText')) $('statusText').textContent = 'Graph could not be loaded';
}

function loadGraph(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('JSON must contain "nodes" and "edges" arrays');
    if (data.nodes.some(n => !n || typeof n.id !== 'string' || typeof n.label !== 'string') ||
        data.edges.some(e => !e || typeof e.source !== 'string' || typeof e.target !== 'string'))
        throw new Error('Each function needs a string id and label; each connection needs a source and target.');
    if (new Set(data.nodes.map(n => n.id)).size !== data.nodes.length)
        throw new Error('Function IDs must be unique.');
    if (data.traces !== undefined && (!Array.isArray(data.traces) || data.traces.some(t => !t || !Array.isArray(t.events))))
        throw new Error('Recorded traces must each contain an events array.');
    nodes = new Map(); out = new Map(); inn = new Map();
    data.nodes.forEach(n => nodes.set(n.id, n));
    data.edges.forEach(e => {
        if (!nodes.has(e.source) || !nodes.has(e.target) || e.source === e.target) return;
        if (!out.has(e.source)) out.set(e.source, []);
        if (out.get(e.source).includes(e.target)) return;
        out.get(e.source).push(e.target);
        if (!inn.has(e.target)) inn.set(e.target, []);
        inn.get(e.target).push(e.source);
    });
    rootId = findRoot();
    inspectedId = null;
    loadRenames();
    computeInterest();
    graphTraces = Array.isArray(data.traces) ? data.traces : [];
    setupTrace();
    $('loadMsg').classList.add('hidden');
    resetView();
    updateWorkspace(data);
}

function findRoot() {
    const all = [...nodes.values()];
    const by = f => all.find(f);
    const r = by(n => n.label === 'main') || by(n => n.label === '_start') ||
        by(n => n.type === 'entry') || all[0];
    return r ? r.id : null;
}

const fileInput = $('fileInput');
fileInput?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(t => { loadGraph(JSON.parse(t)); graphLabel = f.name.replace(/\.json$/i, ''); updateWorkspace(); }).catch(showLoadError);
    e.target.value = '';
});

/* ---------- graph ---------- */
function createCy() {
    hideTip();
    if (cy) cy.destroy();
    cy = cytoscape({
        container: $('cy'),
        wheelSensitivity: 0.3,
        minZoom: 0.12,
        maxZoom: 2.4,
        style: [
            { selector: 'node', style: {
                    label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
                    color: '#f8fafc', 'font-family': '"Martian Mono", monospace', 'font-size': '11px',
                    'background-color': '#1e293b', 'border-width': 1.5, 'border-color': '#475569',
                    width: 190, height: 38, shape: 'round-rectangle',
                    'text-max-width': '170px', 'text-wrap': 'ellipsis' } },
            { selector: 'node[type = "entry"]',  style: { 'border-color': '#10b981', 'background-color': '#064e3b', 'border-width': 2 } },
            { selector: 'node[type = "import"]', style: { 'border-color': '#3b82f6', 'background-color': '#1e3a8a' } },
            { selector: 'node', style: { 'transition-property': 'width, height, border-width, opacity', 'transition-duration': '120ms' } },
            { selector: 'node.onpath', style: { 'border-color': '#fbbf24', 'background-color': '#78350f', 'border-width': 2.5 } },
            { selector: 'node.interest', style: { 'border-color': '#ef4444', 'border-width': 2.5,
                    'underlay-color': '#ef4444' } },
            { selector: 'node.match', style: { 'border-color': '#f0abfc', 'border-width': 4, 'border-style': 'double' } },
            { selector: 'node.trace-seen', style: { 'border-color': '#22d3ee', 'border-width': 2.5 } },
            { selector: 'node.hover', style: { width: 202, height: 42, 'overlay-color': '#ffffff', 'overlay-opacity': 0.1, 'overlay-padding': 4 } },
            { selector: 'node:selected', style: { 'border-color': '#ffffff', 'border-width': 4, 'background-color': '#475569',
                    color: '#ffffff', 'font-weight': 'bold' } },
            { selector: 'edge', style: { width: 1.5, 'line-color': '#334155', 'target-arrow-color': '#64748b',
                    'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
            { selector: 'edge.hl', style: { width: 2.5, 'line-color': '#cbd5e1', 'target-arrow-color': '#cbd5e1' } },
            { selector: 'edge.onpath', style: { width: 3, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24' } },
            { selector: '.faded', style: { opacity: 0.25 } },
            { selector: 'edge.trace-seen', style: { width: 2.5, 'line-color': '#0e7490', 'target-arrow-color': '#0e7490' } },
            { selector: 'edge.trace-active', style: { width: 4.5, 'line-color': '#22d3ee', 'target-arrow-color': '#22d3ee' } },
            { selector: 'node.trace-active', style: { 'border-color': '#22d3ee', 'border-width': 5, 'background-color': '#155e75',
                    color: '#ffffff', 'overlay-color': '#22d3ee', 'overlay-opacity': 0.25, 'overlay-padding': 8 } },
            { selector: '.trace-off', style: { opacity: 0.3 } },
            { selector: 'node.token', style: { width: 16, height: 16, shape: 'ellipse', 'background-color': 'data(color)',
                    'border-width': 2, 'border-color': '#ffffff', label: 'data(label)', 'font-size': '11px', 'font-weight': 'bold',
                    color: '#ffffff', 'text-valign': 'top', 'text-margin-y': -4, 'text-background-color': '#020617',
                    'text-background-opacity': 0.9, 'text-background-padding': '3px', 'text-background-shape': 'roundrectangle',
                    'text-wrap': 'none', 'z-index': 9999, events: 'no', opacity: 1 } }
        ]
    });
    cy.on('tap', 'node', evt => {
        const id = evt.target.id();
        if (trace.active || trace.busy) { inspect(id, true); return; }   // keep the trace graph fixed while it is active
        const needOpen = sidebarClosed();
        const expanded = shouldCollapse(id);
        const before = new Set(visible);
        inspect(id);                                      // always update the inspector
        if (expanded) collapseNode(id);                   // click an expanded node to collapse it
        else ensureVisible([...(out.get(id) || []), ...(inn.get(id) || [])]);
        // no full re-layout: existing nodes stay put, only new ones get placed
        const fresh = [...visible].filter(n => !before.has(n));
        if (fresh.length) placeNew(fresh);
        if (needOpen) openSidebar();
        if (fresh.length) setTimeout(() => revealInView(cy.nodes().filter(n => fresh.includes(n.id())).union(evt.target)), needOpen ? 320 : 0);
    });
    cy.on('dragfree', 'node', evt => {
        const n = evt.target;
        if (!n.hasClass('token')) positionCache.set(n.id(), { ...n.position() });
    });

    cy.on('mouseover', 'node', evt => {
        const n = evt.target;
        n.addClass('hover');
        cy.elements().addClass('faded');
        n.closedNeighborhood().removeClass('faded');
        n.connectedEdges().addClass('hl');
        $('cy').style.cursor = 'pointer';
        showTip(n);
    });
    cy.on('mouseout', 'node', evt => {
        evt.target.removeClass('hover');
        cy.elements().removeClass('faded hl');
        $('cy').style.cursor = '';
        hideTip();
    });
    cy.on('viewport drag', hideTip);
    cy.on('zoom', () => { if ($('zoomValue')) $('zoomValue').textContent = Math.round(cy.zoom() * 100) + '%'; });
    // Canvas styles share the same semantic palette as the surrounding workbench.
    const c = name => themeColor(name);
    if (c('--color-accent')) cy.style()
        .selector('node').style({ color: c('--color-text'), 'background-color': c('--color-node'), 'border-color': c('--color-border'), width: window.innerWidth < 600 ? 132 : 176, height: 48, 'font-size': 12, 'text-max-width': window.innerWidth < 600 ? 120 : 160, 'transition-duration': motionDuration(160) + 'ms' })
        .selector('node[type = "entry"]').style({ 'background-color': c('--color-accent-soft'), 'border-color': c('--color-accent'), color: c('--color-accent') })
        .selector('node[type = "import"]').style({ 'background-color': c('--color-import-soft'), 'border-color': c('--color-import'), color: c('--color-import') })
        .selector('node.interest').style({ 'border-color': c('--color-risk'), 'border-width': 1.5 })
        .selector('node.onpath').style({ 'background-color': c('--color-accent-soft'), 'border-color': c('--color-accent') })
        .selector('node:selected').style({ 'background-color': c('--color-accent'), 'border-color': c('--color-accent'), color: c('--color-background'), 'border-width': 2 })
        .selector('node.hover').style({ width: window.innerWidth < 600 ? 136 : 180, height: 50, 'overlay-opacity': 0 })
        .selector('edge').style({ 'line-color': c('--color-edge'), 'target-arrow-color': c('--color-edge'), width: 1.5 })
        .selector('edge.onpath, edge.trace-active').style({ 'line-color': c('--color-accent'), 'target-arrow-color': c('--color-accent'), width: 2.5 })
        .selector('node.trace-active').style({ 'border-color': c('--color-accent'), 'background-color': c('--color-accent-soft'), 'overlay-opacity': 0, color: c('--color-text') })
        .selector('node.trace-seen').style({ 'border-color': c('--color-accent') })
        .selector('edge.trace-seen').style({ 'line-color': c('--color-accent-dim'), 'target-arrow-color': c('--color-accent-dim') })
        .selector('node.token').style({ width: 12, height: 12, 'text-background-color': c('--color-background') })
        .update();
}

/* ---------- collapse ---------- */
function neighbours(id) {
    return [...new Set([...(out.get(id) || []), ...(inn.get(id) || [])])];
}

// What would collapsing this node hide? Everything it calls (directly or indirectly), even
// functions other visible parents also call, plus callers that were only on screen because of it.
// Never main or the call path to this node.
function collapsePlan(id) {
    const protect = new Set([rootId, ...(pathFromRoot(id) || [])]);
    const below = new Set(), q = [id];
    while (q.length) {
        for (const t of out.get(q.shift()) || [])
            if (t !== id && visible.has(t) && !below.has(t) && !protect.has(t)) { below.add(t); q.push(t); }
    }
    const component = reach([id], null);
    const anchors = [...protect].filter(x => x != null && visible.has(x));
    const keep = reach(anchors, id, below);
    keep.add(id);
    return new Set([...below, ...[...component].filter(n => !keep.has(n))]);
}

// A click collapses when all of the node's callees are already showing and there is something to hide;
// otherwise it expands. (Callers that are still hidden don't block collapsing.)
function shouldCollapse(id) {
    if ((out.get(id) || []).some(c => !visible.has(c))) return false;
    return collapsePlan(id).size > 0;
}

// undirected reachability over visible nodes; doesn't walk past `barrier`, never enters `skip`
function reach(seeds, barrier, skip) {
    const seen = new Set(seeds), q = [...seeds];
    while (q.length) {
        const cur = q.shift();
        if (cur === barrier) continue;
        for (const nx of neighbours(cur))
            if (visible.has(nx) && !seen.has(nx) && !(skip && skip.has(nx))) { seen.add(nx); q.push(nx); }
    }
    return seen;
}

function collapseNode(id) {
    const drop = collapsePlan(id);
    if (!drop.size) return false;
    hideTip();
    cachePositions(drop);
    cy.remove(cy.nodes().filter(n => drop.has(n.id())));
    drop.forEach(n => visible.delete(n));
    cy.elements().removeClass('faded hl');
    updateExpandBtn();
    return true;
}

function showTip(n) {
    const id = n.id(), node = nodes.get(id), tip = $('tip');
    tip.replaceChildren();
    const add = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; tip.appendChild(d); };
    add('font-mono font-bold text-white break-all', nameOf(id));
    add('font-mono text-slate-500', node.id + ' · ' + (node.type || 'custom'));
    add('text-slate-400 mt-1', (inn.get(id) || []).length + ' caller(s) · ' + (out.get(id) || []).length + ' callee(s)');
    const why = interest.get(id);
    if (why && showInterest) add('text-red-400 mt-1', '⚑ ' + why.length + ' reason' + (why.length > 1 ? 's' : '') + ' flagged, click to read');
    add('text-slate-500 mt-1 text-xs', shouldCollapse(id) ? 'click to collapse' : 'click to expand');
    tip.classList.remove('hidden');
    const p = n.renderedPosition(), zoom = cy.zoom(), box = $('cy');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = Math.max(8, Math.min(p.x - w / 2, box.clientWidth - w - 8));
    let top = p.y + 24 * zoom + 8;
    if (top + h > box.clientHeight - 8) top = p.y - 24 * zoom - h - 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}
function hideTip() { $('tip').classList.add('hidden'); }

function shortLabel(s) { return s.length > 24 ? s.slice(0, 21) + '…' : s; }

function ensureVisible(ids) {
    const added = ids.filter(id => nodes.has(id) && !visible.has(id));
    if (!added.length) return false;
    added.forEach(id => visible.add(id));
    cy.add(added.map(id => {
        const n = nodes.get(id);
        const position = positionCache.get(id);
        return { data: { id, label: shortLabel(nameOf(id)), type: n.type || 'custom' },
            ...(position ? { position: { ...position } } : {}),
            classes: (showInterest && interest.has(id)) ? 'interest' : '' };
    }));
    const edges = [];
    const addEdge = (s, t) => {
        const eid = s + '->' + t;
        if (!cy.getElementById(eid).length && !edges.some(e => e.data.id === eid))
            edges.push({ data: { id: eid, source: s, target: t } });
    };
    added.forEach(id => {
        (out.get(id) || []).forEach(t => visible.has(t) && addEdge(id, t));
        (inn.get(id) || []).forEach(s => visible.has(s) && addEdge(s, id));
    });
    cy.add(edges);
    updateExpandBtn();
    return true;
}

/* ---------- incremental placement (keeps existing nodes where they are) ---------- */
const GAP_X = 230, GAP_Y = 108;

function cachePositions(ids) {
    if (!cy) return;
    const selected = ids ? new Set(ids) : null;
    cy.nodes().not('.token').forEach(n => {
        if (!selected || selected.has(n.id())) positionCache.set(n.id(), { ...n.position() });
    });
}

// Places only unseen nodes along the same axis as the graph's initial layout.
function placeNew(fresh) {
    const pos = new Map();
    cy.nodes().not('.token').forEach(n => { if (!fresh.includes(n.id())) pos.set(n.id(), { ...n.position() }); });
    // A collapsed node can return at its old position. Treat it as pinned while placing new nodes.
    fresh.forEach(id => {
        const saved = positionCache.get(id);
        if (saved) pos.set(id, { ...saved });
    });
    const free = (x, y) => {
        for (const q of pos.values())
            if (Math.abs(q.x - x) < 215 && Math.abs(q.y - y) < 60) return false;
        return true;
    };
    const todo = new Set(fresh.filter(id => !pos.has(id)));
    while (todo.size) {
        let progressed = false;
        for (const id of [...todo]) {
            const parent = (inn.get(id) || []).find(p => pos.has(p));
            const child = (out.get(id) || []).find(c => pos.has(c));
            const ref = parent !== undefined ? parent : child;
            if (ref === undefined) continue;
            const base = pos.get(ref);
            let x = base.x, y = base.y, k = 0;
            const sign = parent !== undefined ? 1 : -1;
            if (layoutDirection === 'LR') x += sign * GAP_X;
            else y += sign * GAP_Y;
            while (!free(x, y) && k < 400) {
                const fan = Math.ceil((k + 1) / 2) * GAP_Y * (k % 2 ? -1 : 1);
                if (layoutDirection === 'LR') { x = base.x + sign * GAP_X; y = base.y + fan; }
                else { y = base.y + sign * GAP_Y; x = base.x + fan * (GAP_X / GAP_Y); }
                k++;
            }
            pos.set(id, { x, y }); todo.delete(id); progressed = true;
        }
        if (!progressed) {                       // disconnected additions continue in the graph's rank direction
            const id = [...todo][0];
            const points = [...pos.values()];
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            const x = layoutDirection === 'LR' ? (xs.length ? Math.max(...xs) + GAP_X : 0) : (xs.length ? Math.min(...xs) : 0);
            const y = layoutDirection === 'LR' ? (ys.length ? Math.min(...ys) : 0) : (ys.length ? Math.max(...ys) + GAP_Y : 0);
            let candidateX = x, candidateY = y, k = 0;
            while (!free(candidateX, candidateY) && k < 400) {
                if (layoutDirection === 'LR') candidateY += (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * GAP_Y;
                else candidateX += (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * GAP_X;
                k++;
            }
            pos.set(id, { x: candidateX, y: candidateY });
            todo.delete(id);
        }
    }
    cy.batch(() => fresh.forEach(id => cy.getElementById(id).position(pos.get(id))));
    cachePositions(fresh);
}

// Only moves the camera if the given nodes aren't comfortably on screen (never zooms in)
function revealInView(eles) {
    if (!cy || !eles.length) return;
    const w = cy.width(), h = cy.height(), z0 = cy.zoom(), p = cy.pan(), pad = 40;
    const bb = eles.boundingBox();
    const x1 = bb.x1 * z0 + p.x, x2 = bb.x2 * z0 + p.x, y1 = bb.y1 * z0 + p.y, y2 = bb.y2 * z0 + p.y;
    if (x1 >= pad && x2 <= w - pad && y1 >= pad && y2 <= h - pad) return;
    const z = Math.min(z0, (w - 2 * pad) / bb.w, (h - 2 * pad) / bb.h);
    cy.animate({ zoom: z, pan: { x: w / 2 - z * (bb.x1 + bb.w / 2), y: h / 2 - z * (bb.y1 + bb.h / 2) } }, { duration: motionDuration(250) });
}

function runLayout(cb) {
    const l = cy.elements().not('.token').layout({
        name: typeof dagre !== 'undefined' ? 'dagre' : 'breadthfirst',
        rankDir: layoutDirection || (window.innerWidth < 600 ? 'TB' : 'LR'), nodeSep: window.innerWidth < 600 ? 20 : 28, rankSep: 64, padding: window.innerWidth < 600 ? 20 : 60,
        animate: false, animationDuration: 0, fit: true
    });
    l.one('layoutstop', () => { cachePositions(); if (cb) cb(); });
    l.run();
}

function resetView() {
    traceClear();
    positionCache.clear();
    layoutDirection = window.innerWidth < 600 ? 'TB' : 'LR';
    visible = new Set();
    updateExpandBtn();
    createCy();
    $('detail').classList.add('hidden');
    $('intro').classList.remove('hidden');
    $('searchInput').value = '';
    functionFilter = 'all';
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === 'all')));
    if (!rootId) {
        if ($('statusText')) $('statusText').textContent = 'Graph view reset';
        return;
    }
    const first = out.get(rootId) || [];
    const second = first.flatMap(id => out.get(id) || []);
    ensureVisible(window.innerWidth < 600 ? [rootId, ...first.slice(0, 2)] : [rootId, ...first, ...second].slice(0, 22));
    runLayout();
    inspect(rootId);
    renderFunctionList();
    if ($('statusText')) $('statusText').textContent = 'Graph view reset';
}

/* ---------- inspector ---------- */
function pathFromRoot(target) {
    if (rootId === null) return null;
    if (target === rootId) return [rootId];
    const prev = new Map([[rootId, null]]);
    const q = [rootId];
    while (q.length) {
        const cur = q.shift();
        for (const nx of out.get(cur) || []) {
            if (prev.has(nx)) continue;
            prev.set(nx, cur);
            if (nx === target) {
                const p = [];
                for (let c = target; c !== null; c = prev.get(c)) p.unshift(c);
                return p;
            }
            q.push(nx);
        }
    }
    return null;
}

function chip(id) {
    const b = document.createElement('button');
    b.className = CHIP;
    b.textContent = nameOf(id);
    b.addEventListener('click', () => focusNode(id));
    return b;
}

function fillChips(el, ids, emptyText) {
    el.replaceChildren();
    if (!ids || !ids.length) {
        const s = document.createElement('span');
        s.className = 'text-xs text-slate-600';
        s.textContent = emptyText;
        el.appendChild(s);
        return;
    }
    ids.forEach(id => el.appendChild(chip(id)));
}

// returns true if it had to reveal extra nodes (caller should re-run layout)
function inspect(id, quiet) {
    const n = nodes.get(id);
    if (!n) return false;
    const type = n.type || 'custom';

    $('intro').classList.add('hidden');
    $('detail').classList.remove('hidden');
    $('funcTypeBadge').className = 'function-type-badge ' + (BADGE[type] || BADGE.custom);
    $('funcTypeBadge').textContent = type;
    inspectedId = id;
    $('funcName').textContent = nameOf(id);
    $('renameReset').classList.toggle('hidden', !renames.has(id));
    $('origName').textContent = 'originally ' + n.label;
    $('origName').classList.toggle('hidden', !renames.has(id));
    $('funcAddr').textContent = 'Address: ' + n.id;
    $('typeInfo').textContent = TYPE_INFO[type] || TYPE_INFO.custom;

    const why = interest.get(id) || [];
    const wl = $('whyList');
    wl.replaceChildren();
    why.forEach(r => { const li = document.createElement('li'); li.textContent = r; wl.appendChild(li); });
    $('whyBox').classList.toggle('hidden', !why.length);

    const has = typeof n.summary === 'string' && n.summary.trim() && n.summary !== PLACEHOLDER;
    const summaryBox = $('summaryBox') || $('aiSummary')?.closest('details');
    summaryBox?.classList.toggle('hidden', !has);
    if ($('aiSummary')) $('aiSummary').textContent = has ? n.summary : '';

    $('connCount').textContent = '· ' + (inn.get(id) || []).length + ' in, ' + (out.get(id) || []).length + ' out';
    fillChips($('callers'), inn.get(id), 'nobody (or not in view)');
    fillChips($('callees'), out.get(id), 'nothing, a leaf function');

    const code = $('codeBlock');
    code.textContent = renderedCode(n);
    if (window.Prism) Prism.highlightElement(code);

    // call path + highlighting
    const p = pathFromRoot(id);
    const added = (p && !quiet) ? ensureVisible(p) : false;
    cy.elements().removeClass('onpath');
    const pb = $('pathBox');
    pb.replaceChildren();
    if (p) {
        p.forEach((pid, i) => {
            if (i) { const a = document.createElement('span'); a.className = 'text-slate-600'; a.textContent = '→'; pb.appendChild(a); }
            pb.appendChild(chip(pid));
            if (!quiet) cy.getElementById(pid).addClass('onpath');
            if (i && !quiet) cy.getElementById(p[i - 1] + '->' + pid).addClass('onpath');
        });
    } else {
        const s = document.createElement('span');
        s.className = 'text-xs text-slate-500';
        s.textContent = 'Not reachable from main. It runs before or outside the main program flow.';
        pb.appendChild(s);
    }

    cy.$(':selected').unselect();
    cy.getElementById(id).select();
    document.querySelectorAll('.function-item').forEach(b => b.setAttribute('aria-current', String(b.dataset.id === id)));
    return added;
}

function focusNode(id) {
    if (!cy || !nodes.has(id)) return;
    const before = new Set(visible);
    ensureVisible([id]);
    inspect(id);
    const fresh = [...visible].filter(n => !before.has(n));
    if (fresh.length) placeNew(fresh);
    openSidebar();
    cy.animate({ center: { eles: cy.getElementById(id) } }, { duration: motionDuration(250) });
}

/* ---------- animated trace ---------- */
const KEYCHECK_LABELS = ['main','read_input','validate_key','check_length','check_chars','compare_key',
    'hash_string','grant_access','deny_access','strncpy','strlen','puts'];
const KEYCHECK_HASH = 0xc7b75ae5;
const TRACE_SPEED = { slow: 1100, normal: 650, fast: 280 };
const LOG_CUR = 'rounded-md border-l-2 border-cyan-400 bg-cyan-500/10 px-3 py-2 text-base';
const LOG_OLD = 'rounded-md border-l-2 border-transparent px-3 py-1.5 opacity-60';
let graphTraces = [];
const trace = { events: [], src: [], i: 0, stack: [], playing: false, busy: false, active: false, run: 0, keycheck: false, ids: new Set() };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const END_STYLE = {
    ok:    'bg-emerald-950/50 border-emerald-500/40 text-emerald-300',
    warn:  'bg-amber-950/50 border-amber-500/40 text-amber-300',
    error: 'bg-rose-950/50 border-rose-500/40 text-rose-300'
};
let liveCfg = null, liveBusy = false;       // liveCfg is set when review.py runs with --live
// canned inputs for the built-in keycheck simulation (each one fails at a different stage)
const SIM_KEYS = [['AREV3RSZ', 'valid key'], ['short', 'too short'], ['BREV3RSZ', 'wrong first letter'], ['AAAAAAAZ', 'right shape, wrong hash']];

function djb2(bytes) { let h = 5381; for (const c of bytes) h = (Math.imul(h, 33) + c) >>> 0; return h; }
const hex32 = h => '0x' + h.toString(16).padStart(8, '0');
const chr = b => (b >= 32 && b < 127) ? "'" + String.fromCharCode(b) + "'" : '0x' + b.toString(16);

function simulateKeycheck(key) {
    const ev = [];
    const call = (from, to, note) => ev.push({ t: 'call', from, to, note });
    const ret = (fn, val, note) => ev.push({ t: 'ret', fn, val, note });
    let bytes = [...new TextEncoder().encode(key)];
    const truncated = bytes.length > 63;
    if (truncated) bytes = bytes.slice(0, 63);
    const shown = JSON.stringify(key.length > 24 ? key.slice(0, 24) + '…' : key);

    ev.push({ t: 'enter', fn: 'main', note: 'The program starts in main with argv[1] = ' + shown + '. (The OS really starts at _start, which sets up C and then calls main.)' });
    call('main', 'read_input', 'main needs the key first, so it calls read_input.');
    call('read_input', 'strncpy', 'A key was given on the command line, so read_input copies it into a 64-byte buffer' + (truncated ? ' (only the first 63 bytes fit)' : '') + '.');
    ret('strncpy', '', 'The key is now sitting in the buffer.');
    ret('read_input', '1', 'read_input returns 1, meaning it got some input.');
    call('main', 'validate_key', 'Now main asks validate_key whether the key is good.');

    call('validate_key', 'check_length', 'Check 1 of 3: is the key the right length?');
    call('check_length', 'strlen', 'check_length asks strlen to count the characters.');
    ret('strlen', String(bytes.length), 'The key has ' + bytes.length + ' character' + (bytes.length === 1 ? '' : 's') + '.');
    const lenOk = bytes.length === 8;
    ret('check_length', lenOk ? '1' : '0', lenOk ? 'It needs exactly 8, so this check passes.' : 'It needs exactly 8 but got ' + bytes.length + ', so this check fails.');
    let ok = lenOk, skipped = lenOk ? '' : 'the other two checks never run';

    if (lenOk) {
        call('validate_key', 'check_chars', 'Check 2 of 3: the first character must be A and the last must be Z.');
        const charsOk = bytes[0] === 65 && bytes[7] === 90;
        ret('check_chars', charsOk ? '1' : '0', charsOk ? 'It starts with A and ends with Z, so this check passes.' : 'First is ' + chr(bytes[0]) + ' and last is ' + chr(bytes[7]) + ', so this check fails.');
        ok = charsOk;
        if (!charsOk) skipped = 'the hash check never runs';
        if (charsOk) {
            call('validate_key', 'compare_key', 'Check 3 of 3: does the key hash to the stored value? The binary stores only a hash, never the key itself.');
            call('compare_key', 'hash_string', 'compare_key hashes your key first.');
            const h = djb2(bytes);
            ret('hash_string', hex32(h), 'hash_string mixes every character into one 32-bit number (this is the djb2 hash).');
            const hashOk = h === KEYCHECK_HASH;
            ret('compare_key', hashOk ? '1' : '0', hashOk
                ? hex32(h) + ' equals the stored ' + hex32(KEYCHECK_HASH) + ', so this check passes.'
                : hex32(h) + ' is not the stored ' + hex32(KEYCHECK_HASH) + ', so this check fails.');
            ok = hashOk;
        }
    }
    ret('validate_key', ok ? '1' : '0', ok ? 'All three checks passed.' : 'A check failed' + (skipped ? ', so ' + skipped + ' (the && chain stops at the first failure)' : '') + '.');

    const verdict = ok ? 'grant_access' : 'deny_access';
    call('main', verdict, ok ? 'validate_key said yes, so main calls grant_access.' : 'validate_key said no, so main calls deny_access.');
    call(verdict, 'puts', 'It prints the verdict with puts.');
    ret('puts', '', 'The terminal shows ' + (ok ? '"Access Granted!"' : '"Access Denied!"') + '.');
    ret(verdict, '', 'Back to main.');
    ret('main', '0', 'main returns 0 and the program exits.');
    ev.push({ t: 'end', ok, note: ok ? 'ACCESS GRANTED' : 'ACCESS DENIED' });
    return ev;
}

function idsByLabel(l) { return [...nodes.values()].filter(n => n.label === l).map(n => n.id); }
// recorded (gdb) traces use node ids, the built-in simulation uses labels
function nodeId(x) { return nodes.has(x) ? x : idsByLabel(x)[0]; }
// real traces carry no teaching notes, so borrow the first sentence of the callee's explanation
function calleeNote(id) {
    const s = (nodes.get(id) || {}).summary;
    if (!s || s === PLACEHOLDER || s.startsWith('AI analysis failed')) return undefined;
    const first = s.split(/(?<=[.!?])\s/)[0];
    return first.length > 220 ? first.slice(0, 217) + '…' : first;
}

function resolveCall(from, to) {
    if (nodes.has(from) && nodes.has(to)) return [from, to];
    const f = idsByLabel(from);
    for (const fid of f)
        for (const t of out.get(fid) || [])
            if (nodes.get(t).label === to) return [fid, t];
    const t = idsByLabel(to);
    return (f.length && t.length) ? [f[0], t[0]] : null;
}

function prepareTrace(events) {
    const ids = new Set(), edges = new Set(), list = [];
    let st = [];
    events.forEach(e => {
        if (e.t === 'enter') {
            const id = nodeId(e.fn);
            if (id === undefined) return;
            st = [id]; ids.add(id);
            list.push({ t: 'enter', a: id, head: nameOf(id) + ' starts', note: e.note });
        } else if (e.t === 'call') {
            const r = resolveCall(e.from, e.to);
            if (!r) { st.push(null); return; }
            st.push(r[1]); ids.add(r[0]); ids.add(r[1]); edges.add(r[0] + '->' + r[1]);
            list.push({ t: 'call', a: r[0], b: r[1], head: nameOf(r[0]) + ' calls ' + nameOf(r[1]) + (e.args ? '(' + e.args + ')' : ''), note: e.note || (e.args !== undefined ? calleeNote(r[1]) : undefined) });
        } else if (e.t === 'ret') {
            const top = st.pop();
            if (top === undefined || top === null) return;
            const to = st.length ? st[st.length - 1] : undefined;
            list.push({ t: 'ret', a: top, b: to === null ? undefined : to, val: e.val,
                head: nameOf(top) + ' returns' + (e.val ? ' ' + e.val : ''), note: e.note });
        } else if (e.t === 'end') {
            list.push({ t: 'end', ok: e.ok, level: e.level, note: e.note, output: e.output });
        }
    });
    return { list, ids, edges };
}

function traceClear() {
    trace.run++; trace.busy = false; trace.playing = false; trace.active = false;
    trace.i = 0; trace.events = []; trace.stack = []; trace.ids = new Set();
    if (cy) {
        cy.nodes('.token').remove();
        cy.elements().removeClass('trace-off trace-seen trace-active');
    }
    const log = $('traceLog');
    log.replaceChildren();
    const d = document.createElement('div');
    d.className = 'text-slate-500 leading-relaxed';
    const hint = liveCfg ? 'Type an input in the top bar and press ▶ Trace.'
        : !$('traceSelect').disabled ? 'Pick a trace in the top bar, then press Trace.' : null;
    d.textContent = hint
        ? hint + ' Each step of the program is explained here as it happens.'
        : 'No traces for this graph. Record some with trace_run.py, or start review.py with --live.';
    log.appendChild(d);
    $('traceResult').classList.add('hidden');
    renderStack();
    updateTraceBtns();
}

function setupTrace() {
    const labels = new Set([...nodes.values()].map(n => n.label));
    trace.keycheck = KEYCHECK_LABELS.every(l => labels.has(l));

    // dropdown: recorded runs from graph.json first, then the keycheck simulation's canned keys
    const sel = $('traceSelect');
    sel.replaceChildren();
    const group = text => { const g = document.createElement('optgroup'); g.label = text; sel.appendChild(g); return g; };
    const add = (g, value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; g.appendChild(o); };
    if (graphTraces.length) {
        const g = group('Recorded runs');
        graphTraces.forEach((t, i) => add(g, 't:' + i, t.label || 'run ' + (i + 1)));
    }
    if (trace.keycheck) {
        const g = group('Simulated');
        SIM_KEYS.forEach(([k, why]) => add(g, 's:' + k, k + ' (' + why + ')'));
    }
    sel.disabled = !sel.querySelector('option');
    if (sel.disabled) { const o = document.createElement('option'); o.textContent = 'no traces'; sel.appendChild(o); }
    const availability = $('traceAvailability');
    if (availability) {
        const unavailable = sel.disabled && !liveCfg;
        availability.textContent = unavailable ? 'No execution traces are available for this graph.' : '';
        availability.classList.toggle('hidden', !unavailable);
    }

    // live mode: the Trace button runs whatever is typed in the live bar; otherwise it plays the selection
    $('traceSelect').classList.toggle('hidden', !!liveCfg);
    $('liveBar').classList.toggle('hidden', !liveCfg);
    $('traceBtn').title = liveCfg ? 'Run the program with this input and animate it' : 'Animate the selected trace';
    $('traceBtn').disabled = !liveCfg && sel.disabled;
    traceClear();
}

// plays the dropdown's selection (live mode has no selection: the Trace button calls liveRun instead)
function startDefault(autoplay) {
    if (liveCfg) return;
    const v = $('traceSelect').value || '';
    if (v.startsWith('t:')) {
        const t = graphTraces[+v.slice(2)];
        if (t) traceStart(t.events || [], autoplay);
    } else if (v.startsWith('s:')) {
        traceStart(simulateKeycheck(v.slice(2)), autoplay);
    }
}

function traceStart(events, autoplay) {
    traceClear();
    const prep = prepareTrace(events);
    const log = $('traceLog');
    log.replaceChildren();
    if (!prep.list.length) {
        const d = document.createElement('div');
        d.className = 'text-slate-500';
        d.textContent = 'None of this trace\'s functions were found in the graph.';
        log.appendChild(d);
        return;
    }
    trace.src = events; trace.events = prep.list; trace.i = 0; trace.active = true; trace.ids = prep.ids;
    const run = trace.run;
    const go = () => {
        if (run !== trace.run) return;
        cy.elements().addClass('trace-off');
        const involved = cy.nodes().filter(n => prep.ids.has(n.id()));
        involved.removeClass('trace-off');
        prep.edges.forEach(id => cy.getElementById(id).removeClass('trace-off'));
        if ($('traceFollow').checked) followTraceNode(prep.list.find(e => e.a)?.a);
        else cy.animate({ fit: { eles: involved, padding: 70 }, duration: motionDuration(300) });
        updateTraceBtns();
        if (autoplay) setTimeout(() => { if (run === trace.run) tracePlay(); }, 350);
    };
    const before = new Set(visible);
    ensureVisible([...prep.ids]);
    const fresh = [...visible].filter(id => !before.has(id));
    if (fresh.length) placeNew(fresh);
    go();
}

const traceSpeed = () => TRACE_SPEED[$('traceSpeed').value] || TRACE_SPEED.normal;

async function tracePlay() {
    if (!trace.active) { startDefault(true); return; }
    if (trace.i >= trace.events.length) { traceStart(trace.src, true); return; }
    if (trace.playing) return;
    trace.playing = true;
    updateTraceBtns();
    const run = trace.run;
    while (trace.playing && run === trace.run && trace.i < trace.events.length) {
        await traceStep();
        if (!trace.playing || run !== trace.run) break;
        await sleep(traceSpeed() * 0.45);
    }
    if (run === trace.run) { trace.playing = false; updateTraceBtns(); }
}

async function traceStep() {
    if (trace.busy || !trace.active || trace.i >= trace.events.length) return;
    trace.busy = true;
    updateTraceBtns();
    const run = trace.run;
    const e = trace.events[trace.i++];
    try { await applyEvent(e, run); }
    finally { if (run === trace.run) { trace.busy = false; updateTraceBtns(); } }
}

async function moveToken(fromId, toId, label, color, edgeId, run) {
    const from = cy.getElementById(fromId), to = cy.getElementById(toId);
    if (!from.length || !to.length) return;
    cy.nodes('.token').remove();
    const tok = cy.add({ group: 'nodes', data: { id: '__tok', label, color }, position: { ...from.position() },
        classes: 'token', selectable: false, grabbable: false });
    const edge = cy.getElementById(edgeId);
    edge.addClass('trace-active');
    await tok.animation({ position: { ...to.position() }, duration: reducedMotion.matches ? 1 : Math.max(200, traceSpeed() * 0.55), easing: 'ease-in-out' })
        .play().promise('completed');
    if (run !== trace.run) return;
    edge.removeClass('trace-active');
    if (!tok.removed()) tok.remove();
}

function setActive(id) {
    cy.nodes('.trace-active').removeClass('trace-active');
    if (!id) return;
    cy.getElementById(id).addClass('trace-active');
    if ($('traceFollow').checked) { inspect(id, true); followTraceNode(id); }
}

function followTraceNode(id) {
    if (!id || !cy) return;
    const node = cy.getElementById(id);
    if (!node.length) return;
    const zoom = Math.max(cy.zoom(), window.innerWidth < 600 ? 0.85 : 1);
    const p = node.position();
    cy.stop();
    cy.animate({ zoom, pan: { x: cy.width() / 2 - p.x * zoom, y: cy.height() / 2 - p.y * zoom } }, { duration: motionDuration(250) });
}

// the user may have collapsed part of the graph since the trace started; bring back what this step needs
function showTraceNodes(e) {
    const need = [e.a, e.b].filter(x => x !== undefined && nodes.has(x) && !visible.has(x));
    if (!need.length) return;
    ensureVisible(need);
    placeNew(need);
}

async function applyEvent(e, run) {
    addLog(e);
    showTraceNodes(e);
    if (e.t === 'enter') {
        trace.stack = [e.a];
        cy.getElementById(e.a).addClass('trace-seen');
        setActive(e.a);
    } else if (e.t === 'call') {
        await moveToken(e.a, e.b, 'call', '#22d3ee', e.a + '->' + e.b, run);
        if (run !== trace.run) return;
        trace.stack.push(e.b);
        cy.getElementById(e.a + '->' + e.b).addClass('trace-seen');
        cy.getElementById(e.b).addClass('trace-seen');
        setActive(e.b);
    } else if (e.t === 'ret') {
        if (e.b !== undefined) await moveToken(e.a, e.b, '↩ ' + (e.val || 'return'), '#a3e635', e.b + '->' + e.a, run);
        if (run !== trace.run) return;
        trace.stack.pop();
        setActive(e.b);
    } else if (e.t === 'end') {
        const r = $('traceResult');
        const level = e.level || (e.ok === false ? 'error' : 'ok');
        r.textContent = e.note || (level === 'error' ? 'FAILED' : 'DONE');
        r.className = 'rounded-lg border px-3 py-2 text-center font-bold tracking-wide ' + END_STYLE[level];
    }
    renderStack();
    updateTraceBtns();
}

function addLog(e) {
    const log = $('traceLog');
    log.querySelectorAll('[data-cur]').forEach(x => { x.removeAttribute('data-cur'); x.className = LOG_OLD; });
    if (e.t === 'end') {
        if (e.output) {
            const box = document.createElement('div');
            box.className = 'rounded-md border border-slate-700 bg-slate-950 px-3 py-2';
            const t = document.createElement('div');
            t.className = 'text-xs uppercase tracking-wider text-slate-400 mb-1';
            t.textContent = 'Program output';
            const pre = document.createElement('pre');
            pre.className = 'font-mono text-sm text-slate-200 whitespace-pre-wrap break-words';
            pre.textContent = e.output;               // untrusted program output: text only
            box.append(t, pre);
            log.appendChild(box);
            log.scrollTop = log.scrollHeight;
        }
        return;
    }
    const d = document.createElement('div');
    d.setAttribute('data-cur', '1');
    d.className = LOG_CUR;
    const h = document.createElement('div');
    h.className = 'font-mono font-semibold text-slate-100';
    h.textContent = (e.t === 'call' ? '→ ' : e.t === 'ret' ? '← ' : '▶ ') + e.head;
    d.appendChild(h);
    if (e.note) {
        const n = document.createElement('div');
        n.className = 'text-slate-300 mt-1 leading-relaxed';
        n.textContent = e.note;
        d.appendChild(n);
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
}

function renderStack() {
    const box = $('traceStack');
    box.replaceChildren();
    if (!trace.stack.length) {
        const d = document.createElement('div');
        d.className = 'text-slate-600';
        d.textContent = '(empty)';
        box.appendChild(d);
        return;
    }
    [...trace.stack].reverse().forEach((id, i) => {
        const d = document.createElement('div');
        d.className = 'rounded px-2 py-1 border ' + (i === 0
            ? 'bg-cyan-900/50 border-cyan-500/50 text-cyan-100' : 'bg-slate-950 border-slate-800 text-slate-400');
        d.textContent = nameOf(id);
        box.appendChild(d);
    });
}

function updateTraceBtns() {
    const finished = trace.active && trace.i >= trace.events.length;
    const hasSelection = !!trace.active || !$('traceSelect').disabled;
    setButtonLabel($('tracePlay'), '.trace-play-label', trace.playing ? 'Pause' : (finished ? 'Replay' : 'Play'));
    $('tracePlay').setAttribute('aria-label', trace.playing ? 'Pause trace' : (finished ? 'Replay trace' : 'Play trace'));
    $('tracePlay').setAttribute('aria-pressed', String(trace.playing));
    $('traceStep').disabled = trace.busy || trace.playing || finished || (!trace.active && !hasSelection);
    $('tracePlay').disabled = (!trace.active && !hasSelection) || (trace.busy && !trace.playing);
    $('traceReset').disabled = !trace.active && !trace.busy;
    updateExpandBtn();
    $('traceBtn').disabled = liveCfg ? liveBusy : $('traceSelect').disabled || trace.busy;
    if ($('traceProgress')) $('traceProgress').textContent = trace.active ? `${trace.i} / ${trace.events.length} events` : 'Ready';
    if ($('statusText')) $('statusText').textContent = liveBusy ? 'Running under gdb' : trace.playing ? 'Following execution' : finished ? 'Trace complete' : 'Ready to explore';
    $('tracePanel').classList.toggle('is-playing', trace.playing);
}

function setTracePanel(open) {
    $('tracePanel').classList.toggle('hidden', !open);
    if (!open) traceClear();
    if (cy) { cy.resize(); fitGraph(); }
}

$('traceBtn').addEventListener('click', () => {
    setTracePanel(true);
    if (liveCfg) liveRun(); else startDefault(true);
});
$('traceClose').addEventListener('click', () => setTracePanel(false));
$('traceSelect').addEventListener('change', () => {       // picking another run replays it if the panel is open
    if (!$('tracePanel').classList.contains('hidden')) startDefault(true);
});
$('tracePlay').addEventListener('click', () => {
    if ($('tracePlay').disabled) return;
    if (trace.playing) { trace.playing = false; updateTraceBtns(); } else tracePlay();
});
$('traceStep').addEventListener('click', async () => {
    if ($('traceStep').disabled) return;
    trace.playing = false;
    if (!trace.active) startDefault(false);
    if (trace.active) await traceStep();
    updateTraceBtns();
});
$('traceReset').addEventListener('click', traceClear);
$('traceFollow').addEventListener('change', () => {
    if ($('traceFollow').checked) followTraceNode(trace.stack.at(-1) || rootId);
    else fitGraph();
});

/* ---------- interest (red highlighting) ---------- */
function computeInterest() {
    interest = new Map();
    const add = (id, why) => {
        if (!interest.has(id)) interest.set(id, []);
        const a = interest.get(id);
        if (!a.includes(why)) a.push(why);
    };
    nodes.forEach(n => {
        const id = n.id, label = n.label;
        (Array.isArray(n.flags) ? n.flags : []).forEach(f => add(id, String(f)));
        if (n.interesting === true) add(id, 'Marked as interesting in graph.json.');

        if (n.type === 'import') {
            if (INTEREST.risky.includes(label))   add(id, label + '() is a classic source of bugs (no bounds checking, or it runs commands). Anything calling it deserves a close look.');
            if (INTEREST.compare.includes(label)) add(id, label + '() compares data. In crackmes this is often where your input meets the secret.');
            return;
        }
        (out.get(id) || []).forEach(tid => {
            const t = nodes.get(tid).label;
            if (INTEREST.risky.includes(t))   add(id, 'Calls ' + t + '(), a known-risky function.');
            if (INTEREST.compare.includes(t)) add(id, 'Calls ' + t + '() to compare data, possibly checking a secret.');
        });
        if (!label.startsWith('FUN_') && INTEREST.nameWords.test(label))
            add(id, 'Its name (' + label + ') suggests validation, crypto or access-control logic.');
        const strs = (n.decompiled || '').match(/"(?:[^"\\\\]|\\\\.)*"/g) || [];
        strs.filter(x => INTEREST.stringWords.test(x)).slice(0, 3).forEach(x =>
            add(id, 'Contains the string ' + x + '. Messages like this often mark decision points, so searching for strings is a classic way in.'));
    });
}

function applyInterest() {
    if (!cy) return;
    cy.nodes().forEach(n => n.toggleClass('interest', showInterest && interest.has(n.id())));
}

/* ---------- toolbar ---------- */
$('searchInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!cy) return;
    cy.nodes().removeClass('match');
    if (!q) return;
    const hits = matchingFunctions(q).map(n => n.id);
    if (!hits.length) {
        if ($('statusText')) $('statusText').textContent = 'No matching functions';
        return;
    }
    const before = new Set(visible);
    ensureVisible(hits);
    const fresh = [...visible].filter(id => !before.has(id));
    if (fresh.length) placeNew(fresh);
    hits.forEach(id => cy.getElementById(id).addClass('match'));
    focusNode(hits[0]);
    if ($('statusText')) $('statusText').textContent = hits.length === 1 ? '1 matching function' : `${hits.length} matching functions`;
});
$('resetBtn').addEventListener('click', resetView);
$('interestBtn').addEventListener('click', () => {
    if ($('interestBtn').disabled) return;
    showInterest = !showInterest;
    setButtonLabel($('interestBtn'), '.interest-label', 'Interest ' + (showInterest ? 'on' : 'off'));
    $('interestBtn').setAttribute('aria-pressed', String(showInterest));
    applyInterest();
    if ($('statusText')) $('statusText').textContent = 'Interest highlighting ' + (showInterest ? 'on' : 'off');
});

function setButtonLabel(button, selector, value) {
    if (!button) return;
    let label = button.querySelector(selector) || button.querySelector('span:not([aria-hidden="true"])');
    if (!label) { label = document.createElement('span'); button.appendChild(label); }
    label.textContent = value;
}

function updateInterestBtn() {
    const btn = $('interestBtn');
    if (!btn) return;
    const available = interest.size > 0;
    btn.disabled = !available;
    btn.title = available ? 'Toggle highlighting for functions worth a closer look' : 'No functions are flagged for closer inspection';
    setButtonLabel(btn, '.interest-label', 'Interest ' + (showInterest ? 'on' : 'off'));
    btn.setAttribute('aria-pressed', String(showInterest));
}

// "Show all" becomes "Hide all" once every node is on screen
function updateExpandBtn() {
    const all = nodes.size > 0 && visible.size >= nodes.size;
    const traceLocked = trace.active || trace.busy;
    setButtonLabel($('expandAllBtn'), '.action-label', all ? 'Hide all' : 'Show all');
    $('expandAllBtn').disabled = !nodes.size || traceLocked;
    $('expandAllBtn').setAttribute('aria-label', traceLocked ? 'Close or reset the trace to change graph visibility' : all ? 'Hide all functions except entry' : 'Show all functions');
    $('expandAllBtn').title = traceLocked ? 'Close or reset the trace to change graph visibility' : all ? 'Hide all functions except entry' : 'Show all functions';
}

// everything except main goes away
function hideAll() {
    const keep = new Set([rootId]);
    const drop = new Set([...visible].filter(id => !keep.has(id)));
    if (!drop.size) return;
    inspect(rootId);
    hideTip();
    cachePositions(drop);
    cy.remove(cy.nodes().filter(n => drop.has(n.id())));
    drop.forEach(id => visible.delete(id));
    cy.elements().removeClass('faded hl');
    updateExpandBtn();
    cy.animate({ center: { eles: cy.getElementById(rootId) } }, { duration: motionDuration(250) });
}

$('expandAllBtn').addEventListener('click', () => {
    if ($('expandAllBtn').disabled) return;
    if (nodes.size > 0 && visible.size >= nodes.size) {
        hideAll();
        if ($('statusText')) $('statusText').textContent = 'Entry view restored';
    } else {
        const before = new Set(visible);
        ensureVisible([...nodes.keys()]);
        const fresh = [...visible].filter(id => !before.has(id));
        if (fresh.length) placeNew(fresh);
        fitGraph();
        if ($('statusText')) $('statusText').textContent = 'All functions shown';
    }
});

function toggleSidebar() {
    const sidebar = $('sidebar');
    const isCollapsed = sidebar.classList.toggle('translate-x-full');
    if (!isCollapsed) closeNavigator();
    $('sidebarBtn').setAttribute('aria-expanded', String(!isCollapsed));
    $('sidebarBtn').setAttribute('aria-label', isCollapsed ? 'Show function inspector' : 'Hide function inspector');
    sidebar.inert = isCollapsed;
    if (window.innerWidth < 1100) {
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', String(!isCollapsed));
        if (!isCollapsed) $('inspectorClose')?.focus();
    }
    requestAnimationFrame(() => { if (cy) { cy.resize(); fitGraph(); } });
}

function sidebarClosed() { return $('sidebar').classList.contains('translate-x-full'); }
function openSidebar() { if (sidebarClosed()) toggleSidebar(); }

$('sidebarBtn').addEventListener('click', toggleSidebar);

/* ---------- rename in the inspector ---------- */
function setName(id, raw) {
    if (!nodes.has(id)) return;
    const name = raw.trim().replace(/\s+/g, '_').slice(0, 64);   // identifiers can't contain spaces
    if (!name || name === nodes.get(id).label) renames.delete(id); else renames.set(id, name);
    saveRenames();
    const c = cy && cy.getElementById(id);
    if (c && c.length) c.data('label', shortLabel(nameOf(id)));
    inspect(id, trace.busy);                                      // refresh title, chips, path and code
    renderFunctionList();
}

const nameEl = $('funcName');
nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    else if (e.key === 'Escape') { nameEl.textContent = nameOf(inspectedId); nameEl.blur(); }
});
nameEl.addEventListener('blur', () => {
    if (inspectedId === null) return;
    const t = nameEl.textContent.trim();
    if (t === nameOf(inspectedId)) { nameEl.textContent = t; return; }
    setName(inspectedId, t);                                      // empty text restores the original
});
$('renameReset').addEventListener('click', () => { if (inspectedId !== null) setName(inspectedId, ''); });


/* ---------- live tracing (review.py --live) ---------- */
function traceMessage(text, isErr) {
    setTracePanel(true);
    traceClear();
    const log = $('traceLog');
    log.replaceChildren();
    const d = document.createElement('div');
    d.className = isErr ? 'text-rose-300 leading-relaxed' : 'text-slate-400 leading-relaxed';
    d.textContent = text;
    log.appendChild(d);
}

function updateLiveMode() {
    if (!liveCfg) return;
    const args = $('liveMode').value === 'args';
    $('liveInput').maxLength = args ? liveCfg.max_args : liveCfg.max_stdin;
    $('liveInput').placeholder = args ? 'command-line arguments' : 'text typed on stdin';
}

async function liveRun() {
    if (!liveCfg || liveBusy) return;
    liveBusy = true;
    const btn = $('traceBtn'), label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Running…';
    traceMessage('Running the program under gdb…', false);
    try {
        const r = await fetch('/api/trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Review-Token': liveCfg.token },
            body: JSON.stringify({ mode: $('liveMode').value, text: $('liveInput').value })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.trace) throw new Error(data.error || 'HTTP ' + r.status);
        setTracePanel(true);
        traceStart(data.trace.events || [], true);
    } catch (err) {
        traceMessage('Live run failed: ' + err.message, true);
    } finally {
        liveBusy = false;
        btn.disabled = false;
        btn.textContent = label;
        updateTraceBtns();
    }
}

$('liveInput').addEventListener('keydown', e => { if (e.key === 'Enter') liveRun(); });
$('liveMode').addEventListener('change', updateLiveMode);

// the server only answers this when started with --live
fetch('/api/config')
    .then(r => r.ok ? r.json() : null)
    .then(c => {
        if (!c || !c.live) return;
        liveCfg = c;
        updateLiveMode();
        if (nodes.size) setupTrace();      // graph finished loading first: refresh the trace bar and hint
    })
    .catch(() => {});

/* ---------- workbench navigation and camera ---------- */
function updateWorkspace(data) {
    document.body.classList.toggle('has-graph', nodes.size > 0);
    const fields = {
        binaryName: graphLabel,
        nodeCount: nodes.size,
        edgeCount: [...out.values()].reduce((sum, ids) => sum + ids.length, 0),
        traceCount: graphTraces.length,
        functionCount: nodes.size
    };
    Object.entries(fields).forEach(([id, value]) => { if ($(id)) $(id).textContent = value; });
    if ($('statusText')) $('statusText').textContent = nodes.size ? 'Ready to explore' : 'This graph has no functions';
    $('traceBtn').disabled = !liveCfg && $('traceSelect').disabled;
    $('expandAllBtn').disabled = !nodes.size;
    $('resetBtn').disabled = !nodes.size;
    updateInterestBtn();
    updateTraceBtns();
    renderFunctionList();
}

function matchesFunctionFilter(n) {
    return functionFilter === 'all' ||
        (functionFilter === 'interest' ? interest.has(n.id) : (n.type || 'custom') === functionFilter);
}

function matchesFunctionQuery(n, query) {
    return !query || `${nameOf(n.id)} ${n.label} ${n.id}`.toLowerCase().includes(query);
}

function matchingFunctions(query = '') {
    return [...nodes.values()].filter(n => matchesFunctionFilter(n) && matchesFunctionQuery(n, query))
        .sort((a, b) => (a.id === rootId ? -1 : b.id === rootId ? 1 : nameOf(a.id).localeCompare(nameOf(b.id))));
}

function renderFunctionList() {
    const list = $('functionList');
    if (!list) return;
    const query = $('searchInput').value.trim().toLowerCase();
    const matches = matchingFunctions(query);
    list.replaceChildren();
    matches.forEach(n => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'function-item';
        button.dataset.id = n.id;
        button.dataset.type = n.type || 'custom';
        button.setAttribute('aria-current', String(n.id === inspectedId));
        button.title = nameOf(n.id) + ' · ' + n.id;
        const mark = document.createElement('span');
        mark.className = 'function-mark';
        mark.textContent = n.type === 'import' ? '{}' : 'ƒ';
        mark.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'function-label';
        label.textContent = nameOf(n.id);
        button.append(mark, label);
        if (interest.has(n.id)) {
            const dot = document.createElement('span');
            dot.className = 'interest-dot';
            dot.title = 'Flagged for closer inspection';
            dot.setAttribute('aria-label', 'Of interest');
            button.appendChild(dot);
        }
        button.addEventListener('click', () => {
            focusNode(n.id);
            closeNavigator();
        });
        list.appendChild(button);
    });
    if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'function-empty';
        empty.textContent = nodes.size ? 'No matching functions. Try another name or filter.' : 'No functions are available.';
        list.appendChild(empty);
    }
    if ($('functionCount')) $('functionCount').textContent = matches.length;
    if ($('searchFeedback')) $('searchFeedback').textContent = query ? `${matches.length} matching function${matches.length === 1 ? '' : 's'}` : '';
}

function fitGraph() {
    if (!cy || !cy.nodes().not('.token').length) return;
    cy.stop();
    const elements = cy.nodes().not('.token');
    const pad = cy.width() < 500 ? 24 : 45;
    cy.animate({ fit: { eles: elements, padding: pad } }, { duration: motionDuration(280) });
}

function closeNavigator() {
    $('workspace')?.classList.remove('navigator-open');
    $('navigatorBtn')?.setAttribute('aria-expanded', 'false');
    $('functionsNav')?.removeAttribute('aria-modal');
    $('functionsNav')?.removeAttribute('role');
}

$('searchInput').addEventListener('input', renderFunctionList);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    functionFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderFunctionList();
}));
$('fitBtn')?.addEventListener('click', fitGraph);
for (const [id, factor] of [['zoomInBtn', 1.25], ['zoomOutBtn', 0.8]]) {
    $(id)?.addEventListener('click', () => {
        if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    });
}
$('navigatorBtn')?.addEventListener('click', () => {
    const open = $('workspace').classList.toggle('navigator-open');
    $('navigatorBtn').setAttribute('aria-expanded', String(open));
    if (open) {
        $('functionsNav').setAttribute('role', 'dialog');
        $('functionsNav').setAttribute('aria-modal', 'true');
        $('searchInput').focus();
    } else closeNavigator();
});
$('inspectorClose')?.addEventListener('click', () => { if (!sidebarClosed()) toggleSidebar(); $('sidebarBtn').focus(); });
$('navigatorClose')?.addEventListener('click', () => { closeNavigator(); $('navigatorBtn').focus(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && window.innerWidth < 1100) {
        const panel = !sidebarClosed() ? $('sidebar') : $('workspace')?.classList.contains('navigator-open') ? $('functionsNav') : null;
        if (panel) {
            const focusable = [...panel.querySelectorAll('button, input, select, summary, [contenteditable], [tabindex="0"]')]
                .filter(el => !el.disabled && el.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (first && (!panel.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
            }
        }
    }
    if (e.key === 'Escape') {
        const navWasOpen = $('workspace')?.classList.contains('navigator-open');
        $('searchInput').value = '';
        renderFunctionList();
        closeNavigator();
        if (navWasOpen) $('navigatorBtn')?.focus();
        if (window.innerWidth < 1100 && !sidebarClosed()) { toggleSidebar(); $('sidebarBtn').focus(); }
    }
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === '/') {
        e.preventDefault();
        $('workspace')?.classList.add('navigator-open');
        $('navigatorBtn')?.setAttribute('aria-expanded', 'true');
        if (window.innerWidth < 1100) {
            $('functionsNav').setAttribute('role', 'dialog');
            $('functionsNav').setAttribute('aria-modal', 'true');
        }
        $('searchInput').focus();
    }
    if (e.key.toLowerCase() === 'f') fitGraph();
});
if (window.innerWidth < 1100) {
    $('sidebar').classList.add('translate-x-full');
    $('sidebar').inert = true;
    $('sidebarBtn').setAttribute('aria-expanded', 'false');
    $('sidebarBtn').setAttribute('aria-label', 'Show function inspector');
}
new ResizeObserver(() => {
    if (!cy) return;
    cy.resize();
    if (trace.active && $('traceFollow').checked) {
        const id = trace.stack.at(-1) || trace.events[trace.i]?.a || (trace.i === 0 ? trace.events[0]?.a : null);
        if (id) followTraceNode(id);
    }
}).observe($('cy'));
window.matchMedia('(min-width: 1100px)').addEventListener('change', event => {
    if (event.matches) {
        $('sidebar').removeAttribute('role');
        $('sidebar').removeAttribute('aria-modal');
        closeNavigator();
    } else if (!sidebarClosed()) {
        closeNavigator();
        $('sidebar').setAttribute('role', 'dialog');
        $('sidebar').setAttribute('aria-modal', 'true');
        $('inspectorClose')?.focus();
    }
});
