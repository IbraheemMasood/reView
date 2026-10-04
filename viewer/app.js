const PLACEHOLDER = 'Click on nodes to inspect execution pathways.';
const TYPE_INFO = {
    entry:  'Entry point. main is where the program\'s own logic starts. _start is a tiny stub the OS jumps to first; it sets things up and then hands control to main.',
    custom: 'Code written inside this program. These are the functions worth reading closely.',
    import: 'A library function (e.g. from libc). Its code lives outside this binary, so look it up in the docs instead of reversing it.'
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
const $ = id => document.getElementById(id);

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
}

function loadGraph(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('JSON must contain "nodes" and "edges" arrays');
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
    computeInterest();
    graphTraces = Array.isArray(data.traces) ? data.traces : [];
    setupTrace();
    $('loadMsg').classList.add('hidden');
    resetView();
}

function findRoot() {
    const all = [...nodes.values()];
    const by = f => all.find(f);
    const r = by(n => n.label === 'main') || by(n => n.label === '_start') ||
        by(n => n.type === 'entry') || all[0];
    return r ? r.id : null;
}

$('fileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(t => loadGraph(JSON.parse(t))).catch(showLoadError);
    e.target.value = '';
});

/* ---------- graph ---------- */
function createCy() {
    hideTip();
    if (cy) cy.destroy();
    cy = cytoscape({
        container: $('cy'),
        wheelSensitivity: 0.3,
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
        if (trace.busy) { inspect(id, true); return; }   // don't move nodes under the token
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
    add('font-mono font-bold text-white break-all', node.label);
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
        return { data: { id, label: shortLabel(n.label), type: n.type || 'custom' },
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

// Positions only the newly added nodes: callees go below a node they're called by, callers above,
// fanning out sideways until there's a free slot. Nodes already on screen never move.
function placeNew(fresh) {
    const pos = new Map();
    cy.nodes().not('.token').forEach(n => { if (!fresh.includes(n.id())) pos.set(n.id(), { ...n.position() }); });
    const free = (x, y) => { for (const q of pos.values()) if (Math.abs(q.x - x) < 215 && Math.abs(q.y - y) < 60) return false; return true; };
    const todo = new Set(fresh);
    while (todo.size) {
        let progressed = false;
        for (const id of [...todo]) {
            const parent = (inn.get(id) || []).find(p => pos.has(p));
            const child = (out.get(id) || []).find(c => pos.has(c));
            const ref = parent !== undefined ? parent : child;
            if (ref === undefined) continue;
            const base = pos.get(ref);
            const y = base.y + (parent !== undefined ? GAP_Y : -GAP_Y);
            let x = base.x, k = 0;
            while (!free(x, y) && k < 400) { x = base.x + (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * GAP_X; k++; }
            pos.set(id, { x, y }); todo.delete(id); progressed = true;
        }
        if (!progressed) {                       // not connected to anything on screen: park it to the right
            const id = [...todo][0];
            const bb = cy.nodes().not('.token').boundingBox();
            pos.set(id, { x: isFinite(bb.x2) ? bb.x2 + GAP_X : 0, y: isFinite(bb.y1) ? bb.y1 : 0 });
            todo.delete(id);
        }
    }
    cy.batch(() => fresh.forEach(id => cy.getElementById(id).position(pos.get(id))));
}

// Only moves the camera if the given nodes aren't comfortably on screen (never zooms in)
function revealInView(eles) {
    if (!cy || !eles.length) return;
    const sbw = sidebarClosed() ? 0 : $('sidebar').offsetWidth;
    const w = cy.width() - sbw, h = cy.height(), z0 = cy.zoom(), p = cy.pan(), pad = 50;
    const bb = eles.boundingBox();
    const x1 = bb.x1 * z0 + p.x, x2 = bb.x2 * z0 + p.x, y1 = bb.y1 * z0 + p.y, y2 = bb.y2 * z0 + p.y;
    if (x1 >= pad && x2 <= w - pad && y1 >= pad && y2 <= h - pad) return;
    const z = Math.min(z0, (w - 2 * pad) / bb.w, (h - 2 * pad) / bb.h);
    cy.animate({ zoom: z, pan: { x: w / 2 - z * (bb.x1 + bb.w / 2), y: h / 2 - z * (bb.y1 + bb.h / 2) } }, { duration: 250 });
}

function runLayout(cb) {
    const l = cy.elements().not('.token').layout({
        name: typeof dagre !== 'undefined' ? 'dagre' : 'breadthfirst',
        rankDir: 'TB', nodeSep: 40, rankSep: 70, padding: 40,
        animate: true, animationDuration: 250, fit: visible.size <= 14
    });
    if (cb) l.one('layoutstop', cb);
    l.run();
}

function resetView() {
    traceClear();
    visible = new Set();
    updateExpandBtn();
    createCy();
    $('detail').classList.add('hidden');
    $('intro').classList.remove('hidden');
    $('searchInput').value = '';
    if (!rootId) return;
    ensureVisible([rootId, ...(out.get(rootId) || [])]);
    runLayout();
    inspect(rootId);
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
    b.textContent = nodes.get(id).label;
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
    $('funcTypeBadge').className = 'text-[10px] font-mono tracking-wider uppercase border px-2 py-0.5 rounded ' + (BADGE[type] || BADGE.custom);
    $('funcTypeBadge').textContent = type;
    $('funcName').textContent = n.label;
    $('funcAddr').textContent = 'Address: ' + n.id;
    $('typeInfo').textContent = TYPE_INFO[type] || TYPE_INFO.custom;

    const why = interest.get(id) || [];
    const wl = $('whyList');
    wl.replaceChildren();
    why.forEach(r => { const li = document.createElement('li'); li.textContent = r; wl.appendChild(li); });
    $('whyBox').classList.toggle('hidden', !why.length);

    const has = n.summary && n.summary !== PLACEHOLDER;
    $('aiSummary').textContent = has ? n.summary :
        'No explanation generated yet. Run enrich.py to add one, or try reading the code below yourself first.';
    $('aiSummary').className = 'leading-relaxed whitespace-pre-line ' + (has ? 'text-slate-100' : 'text-sm text-slate-500 italic');

    $('connCount').textContent = '· ' + (inn.get(id) || []).length + ' in, ' + (out.get(id) || []).length + ' out';
    fillChips($('callers'), inn.get(id), 'nobody (or not in view)');
    fillChips($('callees'), out.get(id), 'nothing, a leaf function');

    const code = $('codeBlock');
    code.textContent = n.decompiled || '// Decompilation unavailable';
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
    return added;
}

function focusNode(id) {
    const before = new Set(visible);
    ensureVisible([id]);
    inspect(id);
    const fresh = [...visible].filter(n => !before.has(n));
    if (fresh.length) placeNew(fresh);
    cy.animate({ center: { eles: cy.getElementById(id) } }, { duration: 250 });
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

function resolveCall(from, to) {
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
            const id = idsByLabel(e.fn)[0];
            if (id === undefined) return;
            st = [id]; ids.add(id);
            list.push({ t: 'enter', a: id, head: nodes.get(id).label + ' starts', note: e.note });
        } else if (e.t === 'call') {
            const r = resolveCall(e.from, e.to);
            if (!r) { st.push(null); return; }
            st.push(r[1]); ids.add(r[0]); ids.add(r[1]); edges.add(r[0] + '->' + r[1]);
            list.push({ t: 'call', a: r[0], b: r[1], head: e.from + ' calls ' + e.to, note: e.note });
        } else if (e.t === 'ret') {
            const top = st.pop();
            if (top === undefined || top === null) return;
            const to = st.length ? st[st.length - 1] : undefined;
            list.push({ t: 'ret', a: top, b: to === null ? undefined : to, val: e.val,
                head: nodes.get(top).label + ' returns' + (e.val ? ' ' + e.val : ''), note: e.note });
        } else if (e.t === 'end') {
            list.push({ t: 'end', ok: e.ok, note: e.note });
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
    d.textContent = (trace.keycheck || graphTraces.length)
        ? (trace.keycheck ? 'Enter a key in the top bar, then press Trace.' : 'Press Trace in the top bar.') + ' Each step of the program is explained here as it happens.'
        : 'No traces for this graph. The built-in one targets the keycheck demo; you can also add a "traces" array to graph.json.';
    log.appendChild(d);
    $('traceResult').classList.add('hidden');
    renderStack();
    updateTraceBtns();
}

function setupTrace() {
    const labels = new Set([...nodes.values()].map(n => n.label));
    trace.keycheck = KEYCHECK_LABELS.every(l => labels.has(l));
    $('traceInput').classList.toggle('hidden', !trace.keycheck);
    traceClear();
}

function runFromInput(autoplay) { traceStart(simulateKeycheck($('traceInput').value), autoplay); }

function startDefault(autoplay) {
    if (trace.keycheck) runFromInput(autoplay);
    else if (graphTraces.length) traceStart(graphTraces[0].events || [], autoplay);
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
        cy.animate({ fit: { eles: involved, padding: 70 }, duration: 300 });
        updateTraceBtns();
        if (autoplay) setTimeout(() => { if (run === trace.run) tracePlay(); }, 350);
    };
    if (ensureVisible([...prep.ids])) runLayout(go); else go();
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
    const run = trace.run;
    const e = trace.events[trace.i++];
    try { await applyEvent(e, run); }
    finally { if (run === trace.run) trace.busy = false; }
}

async function moveToken(fromId, toId, label, color, edgeId, run) {
    const from = cy.getElementById(fromId), to = cy.getElementById(toId);
    if (!from.length || !to.length) return;
    cy.nodes('.token').remove();
    const tok = cy.add({ group: 'nodes', data: { id: '__tok', label, color }, position: { ...from.position() },
        classes: 'token', selectable: false, grabbable: false });
    const edge = cy.getElementById(edgeId);
    edge.addClass('trace-active');
    await tok.animation({ position: { ...to.position() }, duration: Math.max(200, traceSpeed() * 0.55), easing: 'ease-in-out' })
        .play().promise('completed');
    if (run !== trace.run) return;
    edge.removeClass('trace-active');
    if (!tok.removed()) tok.remove();
}

function setActive(id) {
    cy.nodes('.trace-active').removeClass('trace-active');
    if (!id) return;
    cy.getElementById(id).addClass('trace-active');
    if ($('traceFollow').checked) inspect(id, true);
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
        r.textContent = e.note || (e.ok === false ? 'FAILED' : 'DONE');
        r.className = 'rounded-lg border px-3 py-2 text-center font-bold tracking-wide ' +
            (e.ok === false ? 'bg-rose-950/50 border-rose-500/40 text-rose-300' : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300');
    }
    renderStack();
}

function addLog(e) {
    const log = $('traceLog');
    log.querySelectorAll('[data-cur]').forEach(x => { x.removeAttribute('data-cur'); x.className = LOG_OLD; });
    if (e.t === 'end') return;
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
        d.textContent = nodes.get(id).label;
        box.appendChild(d);
    });
}

function updateTraceBtns() {
    const finished = trace.active && trace.i >= trace.events.length;
    $('tracePlay').textContent = trace.playing ? '⏸ Pause' : (finished ? '↻ Replay' : '▶ Play');
}

function setTracePanel(open) {
    $('tracePanel').classList.toggle('hidden', !open);
    if (!open) traceClear();
    if (cy) cy.resize();
}

$('traceBtn').addEventListener('click', () => { setTracePanel(true); startDefault(true); });
$('traceClose').addEventListener('click', () => setTracePanel(false));
$('traceInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { setTracePanel(true); runFromInput(true); }
});
$('tracePlay').addEventListener('click', () => {
    if (trace.playing) { trace.playing = false; updateTraceBtns(); } else tracePlay();
});
$('traceStep').addEventListener('click', async () => {
    trace.playing = false;
    if (!trace.active) { startDefault(false); return; }
    await traceStep();
    updateTraceBtns();
});
$('traceReset').addEventListener('click', traceClear);

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
    cy.nodes().removeClass('match');
    if (!q) return;
    const hits = [...nodes.values()].filter(n => n.label.toLowerCase().includes(q)).map(n => n.id);
    if (!hits.length) return;
    const added = ensureVisible(hits);
    hits.forEach(id => cy.getElementById(id).addClass('match'));
    if (added) runLayout();
    if (hits.length === 1) focusNode(hits[0]);
});
$('resetBtn').addEventListener('click', resetView);
$('interestBtn').addEventListener('click', () => {
    showInterest = !showInterest;
    $('interestBtn').textContent = '🔴 Interest: ' + (showInterest ? 'on' : 'off');
    applyInterest();
});
// "Show all" becomes "Hide all" once every node is on screen
function updateExpandBtn() {
    const all = nodes.size > 0 && visible.size >= nodes.size;
    $('expandAllBtn').textContent = all ? 'Hide all' : 'Show all';
}

// everything except main goes away
function hideAll() {
    const keep = new Set([rootId]);
    const drop = new Set([...visible].filter(id => !keep.has(id)));
    if (!drop.size) return;
    inspect(rootId);
    hideTip();
    cy.remove(cy.nodes().filter(n => drop.has(n.id())));
    drop.forEach(id => visible.delete(id));
    cy.elements().removeClass('faded hl');
    updateExpandBtn();
    cy.animate({ center: { eles: cy.getElementById(rootId) } }, { duration: 250 });
}

$('expandAllBtn').addEventListener('click', () => {
    if (trace.busy) return;
    if (nodes.size > 0 && visible.size >= nodes.size) hideAll();
    else if (ensureVisible([...nodes.keys()])) runLayout();
});

function toggleSidebar() {
    const sidebar = $('sidebar');
    const icon = $('sidebarBtnIcon');

    // Toggle slide animation (translate off-screen to the right)
    const isCollapsed = sidebar.classList.toggle('translate-x-full');
    if (icon) icon.textContent = isCollapsed ? '◀' : '▶';

    if (cy) {
        // Stop any running camera animation
        cy.stop();

        const pan = cy.pan();
        const zoom = cy.zoom();

        // Shift camera X by half the sidebar width (325px) to keep graph centered in visible area
        const shiftX = isCollapsed ? 325 : -325;

        // Native Cytoscape animation runs at 60 FPS without canvas redraws or blinking
        cy.animate({
            pan: { x: pan.x + shiftX, y: pan.y },
            zoom: zoom
        }, {
            duration: 300,
            easing: 'ease-in-out-cubic'
        });
    }
}

function sidebarClosed() { return $('sidebar').classList.contains('translate-x-full'); }
function openSidebar() { if (sidebarClosed()) toggleSidebar(); }

$('sidebarBtn').addEventListener('click', toggleSidebar);