const PLACEHOLDER = 'Click on nodes to inspect execution pathways.';
const TYPE_INFO = {
    entry:  'Entry point. main is where the program\'s own logic starts. _start is a tiny stub the OS jumps to first; it sets things up and then hands control to main.',
    custom: 'Code written inside this program. These are the functions worth reading closely.',
    import: 'A library function (e.g. from libc). Its code lives outside this binary, so look it up in the docs instead of reversing it.'
};
const TYPE_COLOR = { entry: '#34d399', custom: '#a78bfa', import: '#60a5fa' };
const TYPE_ICON = { entry: 'play', custom: 'braces', import: 'package' };
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- icons (Lucide-style strokes, inlined so the viewer stays three files) ---------- */
const ICONS = {
    braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    fork: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    step: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
    keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    callers: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    callees: '<path d="m7 7 10 10"/><path d="M17 7v10H7"/>',
    lines: '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
    quote: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    cornerLeft: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'
};
function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}
function iconEl(name, cls) {
    const t = document.createElement('template');
    t.innerHTML = icon(name, cls);
    return t.content.firstChild;
}
function hydrateIcons(root) {
    (root || document).querySelectorAll('i[data-icon]').forEach(el => el.replaceWith(iconEl(el.dataset.icon, el.className)));
}
hydrateIcons();

// Cytoscape draws node icons as images, so they need data URIs in the node's own colour
const svgUri = (paths, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' + color +
    '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>');
const NODE_ICON = {
    entry: svgUri(ICONS.play, TYPE_COLOR.entry),
    custom: svgUri(ICONS.braces, TYPE_COLOR.custom),
    import: svgUri(ICONS.package, TYPE_COLOR.import)
};

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

/* ---------- boot: splash runs while graph.json and the fonts load ---------- */
let booting = true, skipBoot = false;
$('stage').classList.add('booting');
$('splash').addEventListener('click', () => { skipBoot = true; });

// Canvas text doesn't trigger web-font loading, so load the fonts before the graph is drawn
const fontsReady = Promise.race([
    Promise.all([
        document.fonts.load("500 11px 'JetBrains Mono'"),
        document.fonts.load("700 11px 'JetBrains Mono'"),
        document.fonts.load("600 14px 'Space Grotesk'")
    ]),
    sleep(2500)
]).catch(() => {});

Promise.all([
    fetch('graph.json').then(r => { if (!r.ok) throw new Error('graph.json: HTTP ' + r.status); return r.json(); }),
    fontsReady
])
    .then(([data]) => { loadGraph(data); return runBoot(); })
    .catch(err => { endBoot(); showLoadError(err); });

function bootLines() {
    let calls = 0, imports = 0;
    out.forEach(v => { calls += v.length; });
    nodes.forEach(n => { if (n.type === 'import') imports++; });
    const runs = graphTraces.length + (trace.keycheck ? SIM_KEYS.length : 0);
    return [
        ['cmd', '$', 'review --open <b>graph.json</b>'],
        ['ok', 'OK', '<b>' + nodes.size + '</b> functions recovered by Ghidra'],
        ['ok', 'OK', '<b>' + calls + '</b> call edges mapped'],
        ['ok', 'OK', '<b>' + imports + '</b> library imports resolved'],
        [interest.size ? 'warn' : 'ok', interest.size ? 'FLAG' : 'OK', '<b>' + interest.size + '</b> functions flagged for a closer look'],
        ['ok', 'OK', runs ? '<b>' + runs + '</b> execution traces ready to replay' : 'no recorded traces (try --live)'],
        ['go', '>>', 'rendering call graph<span class="caret"></span>']
    ];
}

async function runBoot() {
    const lines = bootLines(), log = $('bootLog');
    for (let i = 0; i < lines.length; i++) {
        if (!skipBoot && !REDUCED) await sleep(i ? 150 : 700);
        const [cls, tag, html] = lines[i];
        const d = document.createElement('div');
        d.className = 'boot-line';
        // html here only carries counts computed above, never graph strings
        d.innerHTML = '<span class="tag ' + cls + '">' + tag + '</span><span>' + html + '</span>';
        log.querySelectorAll('.caret').forEach(c => c.remove());
        log.appendChild(d);
        $('bootBar').style.width = ((i + 1) / lines.length * 100) + '%';
    }
    if (!skipBoot && !REDUCED) await sleep(500);
    endBoot();
}

function endBoot() {
    if (!booting) return;
    booting = false;
    const s = $('splash');
    s.classList.add('out');
    setTimeout(() => s.remove(), 900);
    $('stage').classList.remove('booting');
    introReveal();
    countStats();
}

// camera dollies in while nodes fade in top to bottom
function introReveal() {
    if (!cy) return;
    const ns = cy.nodes().not('.token').sort((a, b) => a.position('y') - b.position('y') || a.position('x') - b.position('x'));
    if (!ns.length) return;
    const target = computeFit(ns, 1.15);
    cy.viewport(target);
    if (REDUCED) return;
    cy.zoom({ level: target.zoom * 0.8, renderedPosition: { x: (cy.width()) / 2, y: (cy.height() - 64) / 2 } });
    tweenViewport(target, 1200);
    ns.forEach((n, i) => {
        n.style('opacity', 0);
        n.delay(120 + Math.min(i, 30) * 70).animate({ style: { opacity: 1 } },
            { duration: 450, easing: 'ease-out-cubic', complete: () => n.removeStyle('opacity') });
    });
    cy.edges().forEach(e => {
        e.style('opacity', 0);
        e.delay(420 + Math.min(ns.length, 30) * 50).animate({ style: { opacity: 1 } },
            { duration: 500, complete: () => e.removeStyle('opacity') });
    });
    if (rootId) setTimeout(() => ripple(rootId, TYPE_COLOR.entry, 70), 500);
}

function countStats() {
    let calls = 0, imports = 0;
    out.forEach(v => { calls += v.length; });
    nodes.forEach(n => { if (n.type === 'import') imports++; });
    countTo($('statFns'), nodes.size, 900);
    countTo($('statCalls'), calls, 900);
    countTo($('statImports'), imports, 900);
    countTo($('statFlagged'), interest.size, 900);
}

function countTo(el, value, dur) {
    const token = (el._count || 0) + 1;
    el._count = token;
    if (REDUCED || !value) { el.textContent = value; return; }
    const t0 = performance.now(), d = dur || 500;
    const step = now => {
        if (el._count !== token) return;
        const p = Math.min(1, (now - t0) / d);
        el.textContent = Math.round(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/* ---------- loading ---------- */
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
    inspectedId = null;
    loadRenames();
    computeInterest();
    graphTraces = Array.isArray(data.traces) ? data.traces : [];
    setupTrace();
    $('loadMsg').classList.add('hidden');
    resetView();
    if (!booting) countStats();
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
const MONO = '"JetBrains Mono", ui-monospace, monospace';
function typeStyle(type, stops, border, text) {
    return { selector: 'node[type = "' + type + '"]', style: {
        'background-gradient-stop-colors': stops, 'border-color': border, color: text,
        'background-image': NODE_ICON[type] } };
}

function createCy() {
    hideTip();
    if (cy) cy.destroy();
    cy = cytoscape({
        container: $('cy'),
        wheelSensitivity: 0.3,
        style: [
            { selector: 'node', style: {
                    label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'text-margin-x': 9,
                    color: '#ede9fe', 'font-family': MONO, 'font-size': '11px', 'font-weight': 500,
                    shape: 'round-rectangle', width: 210, height: 42,
                    'background-fill': 'linear-gradient', 'background-gradient-direction': 'to-bottom-right',
                    'background-gradient-stop-colors': '#1d2142 #0c0f22',
                    'border-width': 1.5, 'border-color': '#5b5fc7',
                    'background-image': NODE_ICON.custom, 'background-width': 15, 'background-height': 15,
                    'background-position-x': 16, 'background-position-y': '50%', 'background-clip': 'none',
                    'background-image-containment': 'over', 'background-image-opacity': 0.95,
                    'text-max-width': '160px', 'text-wrap': 'ellipsis',
                    'transition-property': 'width, height, border-width, opacity', 'transition-duration': '180ms' } },
            typeStyle('entry', '#0a4a39 #03140f', '#34d399', '#d1fae5'),
            typeStyle('import', '#12305c #081226', '#3b82f6', '#dbeafe'),
            { selector: 'node.onpath', style: { 'border-color': '#fbbf24', 'border-width': 2.5,
                    'background-gradient-stop-colors': '#4a3608 #1a1204', color: '#fef3c7' } },
            { selector: 'node.interest', style: { 'border-color': '#f43f5e', 'border-width': 2 } },
            { selector: 'node.match', style: { 'border-color': '#f0abfc', 'border-width': 3 } },
            { selector: 'node.trace-seen', style: { 'border-color': '#22d3ee', 'border-width': 2 } },
            { selector: 'node.hover', style: { width: 220, height: 46, 'overlay-color': '#ffffff', 'overlay-opacity': 0.06, 'overlay-padding': 0, 'overlay-shape': 'round-rectangle' } },
            { selector: 'node:selected', style: { 'border-color': '#ffffff', 'border-width': 2.5, color: '#ffffff', 'font-weight': 700,
                    'background-gradient-stop-colors': '#3a3f78 #171a36' } },
            { selector: 'edge', style: { width: 1.4, 'line-color': '#3a4472', 'target-arrow-color': '#6370a8',
                    'target-arrow-shape': 'triangle', 'arrow-scale': 0.9, 'curve-style': 'bezier',
                    'transition-property': 'opacity, width', 'transition-duration': '180ms' } },
            { selector: 'edge.hl', style: { width: 2.2, 'line-fill': 'linear-gradient', 'line-gradient-stop-colors': '#22d3ee #a78bfa',
                    'target-arrow-color': '#a78bfa', 'line-style': 'dashed', 'line-dash-pattern': [8, 6] } },
            { selector: 'edge.onpath', style: { width: 2.6, 'line-fill': 'solid', 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24',
                    'line-style': 'dashed', 'line-dash-pattern': [8, 6] } },
            { selector: '.faded', style: { opacity: 0.16 } },
            { selector: 'edge.trace-seen', style: { width: 2.2, 'line-fill': 'solid', 'line-color': '#0e7490', 'target-arrow-color': '#0e7490',
                    'line-style': 'dashed', 'line-dash-pattern': [8, 6] } },
            { selector: 'edge.trace-active', style: { width: 4, 'line-fill': 'solid', 'line-color': '#22d3ee', 'target-arrow-color': '#22d3ee' } },
            { selector: 'node.trace-active', style: { 'border-color': '#22d3ee', 'border-width': 3, color: '#ffffff', 'font-weight': 700,
                    'background-gradient-stop-colors': '#0e5568 #072631' } },
            { selector: 'node.crash-site', style: { 'border-color': '#f43f5e', 'border-width': 3.5, color: '#ffe4e6', 'font-weight': 700,
                    'background-gradient-stop-colors': '#5c0a1e #1c0209' } },
            { selector: '.trace-off', style: { opacity: 0.2 } },
            { selector: 'node.token', style: { width: 14, height: 14, shape: 'ellipse', 'background-fill': 'solid', 'background-color': 'data(color)',
                    'background-image': 'none', 'border-width': 2, 'border-color': '#ffffff',
                    'underlay-color': 'data(color)', 'underlay-opacity': 0.55, 'underlay-padding': 9, 'underlay-shape': 'ellipse',
                    label: 'data(label)', 'font-size': '11px', 'font-weight': 700, 'text-margin-x': 0,
                    color: '#ffffff', 'text-valign': 'top', 'text-margin-y': -8, 'text-background-color': '#04050b',
                    'text-background-opacity': 0.92, 'text-background-padding': '4px', 'text-background-shape': 'roundrectangle',
                    'text-border-color': 'data(color)', 'text-border-width': 1, 'text-border-opacity': 0.7,
                    'text-wrap': 'none', 'z-index': 9999, events: 'no', opacity: 1 } }
        ]
    });
    cy.on('tap', 'node', evt => {
        const id = evt.target.id();
        ripple(id, TYPE_COLOR[(nodes.get(id) || {}).type] || TYPE_COLOR.custom);
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
        if (fresh.length) setTimeout(() => revealInView(cy.nodes().filter(n => fresh.includes(n.id())).union(evt.target)), needOpen ? 560 : 0);
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
    cy.on('viewport', scheduleGrid);
    cy.on('scrollzoom pinchzoom dragpan', () => cancelAnimationFrame(vpTween));   // the user takes the camera
    scheduleGrid();
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
    dropNodes(drop);
    drop.forEach(n => visible.delete(n));
    cy.elements().removeClass('faded hl');
    updateExpandBtn();
    return true;
}

// Fades nodes out before removing them. They are tagged "dying" so placement and layout ignore them,
// and ensureVisible removes a dying copy straight away if the same function is shown again.
function dropNodes(ids) {
    const els = cy.nodes().filter(n => ids.has(n.id()));
    if (REDUCED) { cy.remove(els); return; }
    const all = els.union(els.connectedEdges());
    all.addClass('dying');
    all.forEach(el => el.stop(true).animate({ style: { opacity: 0 } }, { duration: 200, easing: 'ease-in-cubic' }));
    const c = cy;
    setTimeout(() => { if (c === cy) cy.remove(cy.elements('.dying')); }, 230);
}

function showTip(n) {
    const id = n.id(), node = nodes.get(id), tip = $('tip');
    tip.replaceChildren();
    const add = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; tip.appendChild(d); return d; };
    const head = add('tip-name', nameOf(id));
    const dot = document.createElement('span');
    dot.className = 'dot ' + (node.type || 'custom');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:none';
    head.prepend(dot);
    add('tip-meta', node.id + ' · ' + (node.type || 'custom'));
    add('tip-row', (inn.get(id) || []).length + ' caller(s) · ' + (out.get(id) || []).length + ' callee(s)');
    const why = interest.get(id);
    if (why && showInterest) {
        const h = add('tip-hot', why.length + ' reason' + (why.length > 1 ? 's' : '') + ' flagged, click to read');
        h.prepend(iconEl('flag'));
    }
    add('tip-hint', shouldCollapse(id) ? 'click to collapse' : 'click to expand');
    tip.classList.remove('hidden');
    const p = n.renderedPosition(), zoom = cy.zoom(), box = $('cy');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = Math.max(8, Math.min(p.x - w / 2, box.clientWidth - w - 8));
    let top = p.y + 26 * zoom + 10;
    if (top + h > box.clientHeight - 8) top = p.y - 26 * zoom - h - 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}
function hideTip() { $('tip').classList.add('hidden'); }

function shortLabel(s) { return s.length > 24 ? s.slice(0, 21) + '…' : s; }

function ensureVisible(ids) {
    const added = ids.filter(id => nodes.has(id) && !visible.has(id));
    if (!added.length) return false;
    const zombies = cy.nodes('.dying').filter(n => added.includes(n.id()));
    if (zombies.length) cy.remove(zombies);
    added.forEach(id => visible.add(id));
    const newNodes = cy.add(added.map(id => {
        const n = nodes.get(id);
        return { data: { id, label: shortLabel(nameOf(id)), type: n.type || 'custom' },
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
    const newEdges = cy.add(edges);
    enter(newNodes);
    enter(newEdges, 120);
    updateExpandBtn();
    return true;
}

// new elements fade in with a short stagger instead of popping
function enter(eles, delay) {
    if (booting || REDUCED || !eles.length) return;
    eles.forEach((el, i) => {
        el.style('opacity', 0);
        el.delay((delay || 0) + Math.min(i, 24) * 24).animate({ style: { opacity: 1 } },
            { duration: 380, easing: 'ease-out-cubic', complete: () => el.removeStyle('opacity') });
    });
}

/* ---------- incremental placement (keeps existing nodes where they are) ---------- */
const GAP_X = 236, GAP_Y = 108;

// Positions only the newly added nodes: callees go below a node they're called by, callers above,
// fanning out sideways until there's a free slot. Nodes already on screen never move.
function placeNew(fresh) {
    const pos = new Map();
    cy.nodes().not('.token, .dying').forEach(n => { if (!fresh.includes(n.id())) pos.set(n.id(), { ...n.position() }); });
    const free = (x, y) => { for (const q of pos.values()) if (Math.abs(q.x - x) < 222 && Math.abs(q.y - y) < 60) return false; return true; };
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
            const bb = cy.nodes().not('.token, .dying').boundingBox();
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
    tweenViewport({ zoom: z, pan: { x: w / 2 - z * (bb.x1 + bb.w / 2), y: h / 2 - z * (bb.y1 + bb.h / 2) } }, 400);
}

// Zoom + pan in one tween. Done by hand because cy.animate with both zoom and pan drifts off target.
let vpTween = 0;
function tweenViewport(to, dur, done) {
    cancelAnimationFrame(vpTween);
    if (!cy) return;
    if (REDUCED || !dur) { cy.viewport(to); if (done) done(); return; }
    const from = { zoom: cy.zoom(), pan: { ...cy.pan() } }, t0 = performance.now();
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = now => {
        const p = Math.min(1, (now - t0) / dur), e = ease(p);
        cy.viewport({ zoom: from.zoom + (to.zoom - from.zoom) * e,
            pan: { x: from.pan.x + (to.pan.x - from.pan.x) * e, y: from.pan.y + (to.pan.y - from.pan.y) * e } });
        if (p < 1) vpTween = requestAnimationFrame(step); else if (done) done();
    };
    vpTween = requestAnimationFrame(step);
}

// viewport that fits `eles` into the part of the canvas the inspector and dock don't cover
function computeFit(eles, maxZoom) {
    const sbw = sidebarClosed() ? 0 : $('sidebar').offsetWidth;
    const w = cy.width() - sbw, h = cy.height() - 64, pad = 56;
    const bb = eles.boundingBox();
    const zoom = Math.max(0.15, Math.min(maxZoom || 1.25, (w - 2 * pad) / bb.w, (h - 2 * pad) / bb.h));
    return { zoom, pan: { x: w / 2 - zoom * (bb.x1 + bb.w / 2), y: h / 2 - zoom * (bb.y1 + bb.h / 2) } };
}

function fitView(eles, maxZoom) {
    if (!cy) return;
    eles = eles || cy.nodes().not('.token, .dying');
    if (!eles.length) return;
    tweenViewport(computeFit(eles, maxZoom), 550);
}

function zoomBy(f) {
    if (!cy) return;
    const sbw = sidebarClosed() ? 0 : $('sidebar').offsetWidth;
    cy.stop();
    cy.animate({ zoom: { level: cy.zoom() * f, renderedPosition: { x: (cy.width() - sbw) / 2, y: cy.height() / 2 } } },
        { duration: 220, easing: 'ease-out-cubic' });
}

// small graphs get fitted after the layout settles (cb may do its own camera move instead)
function runLayout(cb) {
    const small = visible.size <= 14;
    const l = cy.elements().not('.token, .dying').layout({
        name: typeof dagre !== 'undefined' ? 'dagre' : 'breadthfirst',
        rankDir: 'TB', nodeSep: 40, rankSep: 70, padding: 40,
        animate: !REDUCED, animationDuration: 450, animationEasing: 'ease-in-out-cubic', fit: false
    });
    l.one('layoutstop', () => {
        if (cb) cb();
        else if (small && !booting) fitView(null, 1.15);
    });
    l.run();
}

function resetView() {
    traceClear();
    visible = new Set();
    updateExpandBtn();
    createCy();
    $('detail').classList.add('hidden');
    $('tabs').classList.add('hidden');
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
    const n = nodes.get(id) || {};
    b.className = 'chip' + (showInterest && interest.has(id) ? ' hot' : '');
    const dot = document.createElement('span');
    dot.className = 'dot ' + (n.type || 'custom');
    b.append(dot, document.createTextNode(nameOf(id)));
    b.title = id;
    b.addEventListener('click', () => focusNode(id));
    return b;
}

function fillChips(el, ids, emptyText) {
    el.replaceChildren();
    if (!ids || !ids.length) {
        const s = document.createElement('span');
        s.className = 'empty-note';
        s.textContent = emptyText;
        el.appendChild(s);
        return;
    }
    ids.forEach(id => el.appendChild(chip(id)));
}

let scrambleRaf = 0;
// decode-style reveal of the function name
function scramble(el, text) {
    cancelAnimationFrame(scrambleRaf);
    if (REDUCED || document.activeElement === el) { el.textContent = text; el.classList.remove('scrambling'); return; }
    const glyphs = '<>/\\[]{}=+*#%0123456789abcdef';
    const t0 = performance.now(), dur = 420;
    el.classList.add('scrambling');
    const tick = now => {
        const p = Math.min(1, (now - t0) / dur), fixed = Math.floor(text.length * p);
        let s = text.slice(0, fixed);
        for (let i = fixed; i < text.length; i++) s += text[i] === '_' ? '_' : glyphs[(Math.random() * glyphs.length) | 0];
        el.textContent = s;
        if (p < 1) scrambleRaf = requestAnimationFrame(tick);
        else { el.textContent = text; el.classList.remove('scrambling'); }
    };
    scrambleRaf = requestAnimationFrame(tick);
}

function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
}

// returns true if it had to reveal extra nodes (caller should re-run layout)
function inspect(id, quiet) {
    const n = nodes.get(id);
    if (!n) return false;
    const type = n.type || 'custom';
    const changed = inspectedId !== id;

    $('intro').classList.add('hidden');
    $('detail').classList.remove('hidden');
    if ($('tabs').classList.contains('hidden')) { $('tabs').classList.remove('hidden'); requestAnimationFrame(positionInk); }
    $('funcTypeBadge').className = 'type-badge ' + type;
    $('funcTypeBadge').textContent = type;
    $('idCard').style.setProperty('--accent', TYPE_COLOR[type] || TYPE_COLOR.custom);
    inspectedId = id;
    // the decode effect is for clicks; during trace playback it would fire every step
    if (changed && !quiet) scramble($('funcName'), nameOf(id));
    else { cancelAnimationFrame(scrambleRaf); $('funcName').classList.remove('scrambling'); $('funcName').textContent = nameOf(id); }
    $('renameReset').classList.toggle('hidden', !renames.has(id));
    $('origName').textContent = 'originally ' + n.label;
    $('origName').classList.toggle('hidden', !renames.has(id));
    $('funcAddr').textContent = n.id;
    $('typeInfo').textContent = TYPE_INFO[type] || TYPE_INFO.custom;

    const why = interest.get(id) || [];
    const wl = $('whyList');
    wl.replaceChildren();
    why.forEach(r => { const li = document.createElement('li'); li.textContent = r; wl.appendChild(li); });
    $('whyBox').classList.toggle('hidden', !why.length);
    $('whyCount').textContent = why.length + (why.length === 1 ? ' signal' : ' signals');
    $('funcHot').classList.toggle('hidden', !why.length || !showInterest);
    $('funcHot').lastChild.textContent = why.length + ' flagged';

    const raw = n.decompiled || '';
    const stats = [
        ['stCallers', (inn.get(id) || []).length], ['stCallees', (out.get(id) || []).length],
        ['stLines', raw ? raw.split('\n').filter(l => l.trim()).length : 0],
        ['stStrings', (raw.match(/"(?:[^"\\]|\\.)*"/g) || []).length]
    ];
    stats.forEach(([el, v]) => changed ? countTo($(el), v) : ($(el).textContent = v));

    const has = n.summary && n.summary !== PLACEHOLDER;
    $('aiSummary').textContent = has ? n.summary :
        'No explanation generated yet. Run review.py with a GEMINI_API_KEY to add one, or try reading the decompiled code yourself first.';
    $('aiSummary').className = 'leading-relaxed whitespace-pre-line ' + (has ? 'has' : 'none');

    $('connCount').textContent = '· ' + (inn.get(id) || []).length + ' in, ' + (out.get(id) || []).length + ' out';
    fillChips($('callers'), inn.get(id), 'nobody (or not in view)');
    fillChips($('callees'), out.get(id), 'nothing, a leaf function');

    $('codeFile').textContent = nameOf(id) + '.c';
    highlightCode(n);

    // call path + highlighting
    const p = pathFromRoot(id);
    const added = (p && !quiet) ? ensureVisible(p) : false;
    cy.elements().removeClass('onpath');
    const pb = $('pathBox');
    pb.replaceChildren();
    if (p) {
        p.forEach((pid, i) => {
            if (i) { const a = document.createElement('span'); a.className = 'path-arrow'; pb.appendChild(a); }
            pb.appendChild(chip(pid));
            if (!quiet) cy.getElementById(pid).addClass('onpath');
            if (i && !quiet) cy.getElementById(p[i - 1] + '->' + pid).addClass('onpath');
        });
    } else {
        const s = document.createElement('span');
        s.className = 'empty-note';
        s.textContent = 'Not reachable from main. It runs before or outside the main program flow.';
        pb.appendChild(s);
    }

    if (changed && !REDUCED) {
        replay($('paneOverview'), 'reveal');
        replay($('detail'), 'flash');
    }

    cy.$(':selected').unselect();
    cy.getElementById(id).select();
    return added;
}

function highlightCode(n) {
    const code = $('codeBlock');
    code.textContent = renderedCode(n);
    if (window.Prism) Prism.highlightElement(code);
}

function focusNode(id) {
    const before = new Set(visible);
    ensureVisible([id]);
    inspect(id);
    const fresh = [...visible].filter(n => !before.has(n));
    if (fresh.length) placeNew(fresh);
    const sbw = sidebarClosed() ? 0 : $('sidebar').offsetWidth;
    const pos = cy.getElementById(id).position(), z = cy.zoom();
    cy.animate({ pan: { x: (cy.width() - sbw) / 2 - pos.x * z, y: cy.height() / 2 - pos.y * z } },
        { duration: 400, easing: 'ease-in-out-cubic', complete: () => ripple(id, '#c4b5fd', 70) });
}

/* ---------- inspector tabs ---------- */
function positionInk() {
    const on = document.querySelector('.tab.on'), ink = $('tabInk');
    if (!on || !on.offsetWidth) return;
    ink.style.width = on.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (on.offsetLeft - 3) + 'px)';
}
function setTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    $('paneOverview').classList.toggle('hidden', name !== 'overview');
    $('paneCode').classList.toggle('hidden', name !== 'code');
    positionInk();
    // line numbers measure wrapped lines, which only works once the pane is visible
    if (name === 'code' && inspectedId !== null) highlightCode(nodes.get(inspectedId));
    const pane = name === 'code' ? $('paneCode') : $('paneOverview');
    if (!REDUCED) replay(pane, 'reveal');
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

$('copyCode').addEventListener('click', () => {
    const text = $('codeBlock').textContent;
    const done = () => toast('Decompiled code copied', 'check');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(() => toast('Copy failed', 'alert'));
    else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed', 'alert'); }
        ta.remove();
    }
});

/* ---------- animated trace ---------- */
const KEYCHECK_LABELS = ['main','read_input','validate_key','check_length','check_chars','compare_key',
    'hash_string','grant_access','deny_access','strncpy','strlen','puts'];
const KEYCHECK_HASH = 0xc7b75ae5;
const TRACE_SPEED = { slow: 1100, normal: 650, fast: 280 };
let graphTraces = [];
const trace = { events: [], src: [], i: 0, stack: [], playing: false, busy: false, active: false, run: 0, keycheck: false, ids: new Set() };
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

// depth = how many frames sit above main at that moment; the log indents by it
function prepareTrace(events) {
    const ids = new Set(), edges = new Set(), list = [];
    let st = [];
    events.forEach(e => {
        if (e.t === 'enter') {
            const id = nodeId(e.fn);
            if (id === undefined) return;
            st = [id]; ids.add(id);
            list.push({ t: 'enter', a: id, depth: 0, note: e.note });
        } else if (e.t === 'call') {
            const r = resolveCall(e.from, e.to);
            if (!r) { st.push(null); return; }
            const depth = st.length;
            st.push(r[1]); ids.add(r[0]); ids.add(r[1]); edges.add(r[0] + '->' + r[1]);
            list.push({ t: 'call', a: r[0], b: r[1], args: e.args, depth, note: e.note || (e.args !== undefined ? calleeNote(r[1]) : undefined) });
        } else if (e.t === 'ret') {
            const top = st.pop();
            if (top === undefined || top === null) return;
            const to = st.length ? st[st.length - 1] : undefined;
            list.push({ t: 'ret', a: top, b: to === null ? undefined : to, val: e.val, depth: st.length, note: e.note });
        } else if (e.t === 'end') {
            list.push({ t: 'end', ok: e.ok, level: e.level, note: e.note, output: e.output });
        }
    });
    return { list, ids, edges };
}

function logHint(text, isErr) {
    const d = document.createElement('div');
    d.className = 'log-hint' + (isErr ? ' err' : '');
    d.appendChild(iconEl(isErr ? 'alert' : 'info'));
    const s = document.createElement('span');
    s.textContent = text;
    d.appendChild(s);
    return d;
}

function traceClear() {
    trace.run++; trace.busy = false; trace.playing = false; trace.active = false;
    trace.i = 0; trace.events = []; trace.stack = []; trace.ids = new Set();
    if (cy) {
        cy.nodes('.token').remove();
        cy.elements().removeClass('trace-off trace-seen trace-active crash-site');
    }
    const log = $('traceLog');
    log.replaceChildren();
    const hint = liveCfg ? 'Type an input in the top bar and press Run trace.'
        : !$('traceSelect').disabled ? 'Pick a trace in the top bar, then press Run trace.' : null;
    log.appendChild(logHint(hint
        ? hint + ' Each step of the program is explained here as it happens.'
        : 'No traces for this graph. Record some with trace_run.py, or start review.py with --live.'));
    $('traceResult').classList.add('hidden');
    $('traceLabel').textContent = '';
    hideBanner(true);
    buildTimeline([]);
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

    // live mode: the Trace button runs whatever is typed in the live bar; otherwise it plays the selection
    $('traceSelect').parentElement.classList.toggle('hidden', !!liveCfg);
    $('liveBar').classList.toggle('hidden', !liveCfg);
    $('traceBtn').title = liveCfg ? 'Run the program with this input and animate it' : 'Animate the selected trace';
    traceClear();
}

// plays the dropdown's selection (live mode has no selection: the Trace button calls liveRun instead)
function startDefault(autoplay) {
    if (liveCfg) return;
    const sel = $('traceSelect'), v = sel.value || '';
    const label = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
    if (v.startsWith('t:')) {
        const t = graphTraces[+v.slice(2)];
        if (t) traceStart(t.events || [], autoplay, label);
    } else if (v.startsWith('s:')) {
        traceStart(simulateKeycheck(v.slice(2)), autoplay, label);
    }
}

function traceStart(events, autoplay, label) {
    traceClear();
    $('traceLabel').textContent = label || '';
    const prep = prepareTrace(events);
    const log = $('traceLog');
    log.replaceChildren();
    if (!prep.list.length) {
        log.appendChild(logHint('None of this trace\'s functions were found in the graph.', true));
        return;
    }
    trace.src = events; trace.events = prep.list; trace.i = 0; trace.active = true; trace.ids = prep.ids;
    buildTimeline(prep.list);
    const run = trace.run;
    const go = () => {
        if (run !== trace.run) return;
        cy.elements().addClass('trace-off');
        const involved = cy.nodes().filter(n => prep.ids.has(n.id()));
        involved.removeClass('trace-off');
        prep.edges.forEach(id => cy.getElementById(id).removeClass('trace-off'));
        fitView(involved, 1.1);
        updateTraceBtns();
        if (autoplay) setTimeout(() => { if (run === trace.run) tracePlay(); }, 550);
    };
    if (ensureVisible([...prep.ids])) runLayout(go); else go();
}

const traceSpeed = () => TRACE_SPEED[$('traceSpeed').value] || TRACE_SPEED.normal;

async function tracePlay() {
    if (!trace.active) { startDefault(true); return; }
    if (trace.i >= trace.events.length) { traceStart(trace.src, true, $('traceLabel').textContent); return; }
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
    updateTimeline();
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
    await tok.animation({ position: { ...to.position() }, duration: Math.max(220, traceSpeed() * 0.6), easing: 'ease-in-out-cubic' })
        .play().promise('completed');
    if (run !== trace.run) return;
    edge.removeClass('trace-active');
    if (!tok.removed()) tok.remove();
    ripple(toId, color);
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
        ripple(e.a, TYPE_COLOR.entry, 80);
    } else if (e.t === 'call') {
        await moveToken(e.a, e.b, 'call', '#22d3ee', e.a + '->' + e.b, run);
        if (run !== trace.run) return;
        trace.stack.push(e.b);
        cy.getElementById(e.a + '->' + e.b).addClass('trace-seen');
        cy.getElementById(e.b).addClass('trace-seen');
        setActive(e.b);
    } else if (e.t === 'ret') {
        if (e.b !== undefined) await moveToken(e.a, e.b, e.val ? 'return ' + e.val : 'return', '#a3e635', e.b + '->' + e.a, run);
        if (run !== trace.run) return;
        trace.stack.pop();
        setActive(e.b);
    } else if (e.t === 'end') {
        const r = $('traceResult');
        const level = e.level || (e.ok === false ? 'error' : 'ok');
        const note = e.note || (level === 'error' ? 'FAILED' : 'DONE');
        // "CRASHED (SIGSEGV at boom + 16 ...)" -> headline "CRASHED", detail in the subtitle
        const m = note.match(/^([^(]{2,40}?)\s*\((.+)\)\s*$/);
        const title = m ? m[1] : note, detail = m ? m[2] : '';
        const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
        r.replaceChildren();
        const head = document.createElement('div');
        head.textContent = title;
        r.appendChild(head);
        if (detail) { const d = document.createElement('div'); d.className = 'result-detail'; d.textContent = detail; r.appendChild(d); }
        r.className = 'result-card lvl-' + level;
        // a crashed run still has frames on the stack: the top one is where it died
        const site = level === 'error' && trace.stack.length ? trace.stack[trace.stack.length - 1] : null;
        if (site) {
            cy.getElementById(site).addClass('crash-site');
            const p = nodePoint(site);
            if (p && !REDUCED) burst(p.x, p.y, ['#f43f5e', '#fb7185', '#fecdd3'], 50, 7);
        }
        const firstOut = (e.output || '').split('\n').find(l => l.trim());
        const sub = [detail ? clip(detail, 90) : '', firstOut ? 'printed: ' + clip(firstOut, 60) : '',
            (trace.events.length - 1) + ' steps traced'].filter(Boolean).join('  ·  ');
        showBanner(level, title, sub);
    }
    renderStack();
}

function addLog(e) {
    const log = $('traceLog');
    log.querySelectorAll('.log-row.cur').forEach(x => { x.classList.remove('cur'); x.classList.add('old'); });
    if (e.t === 'end') {
        if (e.output) {
            const box = document.createElement('div');
            box.className = 'out-box';
            const t = document.createElement('div');
            t.className = 'out-title';
            t.append(iconEl('terminal', 'ic-xs'), document.createTextNode('Program output'));
            const pre = document.createElement('pre');
            pre.textContent = e.output;               // untrusted program output: text only
            box.append(t, pre);
            log.appendChild(box);
            log.scrollTop = log.scrollHeight;
        }
        return;
    }
    const d = document.createElement('div');
    d.className = 'log-row cur ' + e.t;
    d.style.marginLeft = Math.min(e.depth || 0, 8) * 14 + 'px';
    const ic = document.createElement('span');
    ic.className = 'lg-ic';
    ic.appendChild(iconEl(e.t === 'call' ? 'arrowRight' : e.t === 'ret' ? 'cornerLeft' : 'play'));
    const h = document.createElement('div');
    h.className = 'log-head';
    const fn = id => { const s = document.createElement('span'); s.className = 'fn'; s.textContent = nameOf(id); return s; };
    const txt = s => document.createTextNode(s);
    if (e.t === 'enter') h.append(fn(e.a), txt(' starts'));
    else if (e.t === 'call') h.append(fn(e.a), txt(' calls '), fn(e.b), txt(e.args ? '(' + e.args + ')' : ''));
    else {
        h.append(fn(e.a), txt(' returns'));
        if (e.val) { const v = document.createElement('span'); v.className = 'val'; v.textContent = ' ' + e.val; h.appendChild(v); }
    }
    d.append(ic, h);
    if (e.note) {
        const n = document.createElement('div');
        n.className = 'log-note';
        n.textContent = e.note;
        d.appendChild(n);
    }
    log.appendChild(d);
    log.scrollTo({ top: log.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
}

let stackShown = 0;
function renderStack() {
    const box = $('traceStack');
    box.replaceChildren();
    const grew = trace.stack.length > stackShown;
    stackShown = trace.stack.length;
    if (!trace.stack.length) {
        const d = document.createElement('div');
        d.className = 'stack-empty';
        d.textContent = '(empty)';
        box.appendChild(d);
        return;
    }
    [...trace.stack].reverse().forEach((id, i) => {
        const d = document.createElement('div');
        d.className = 'stack-item' + (i === 0 ? ' top' : '') + (i === 0 && grew ? ' push' : '');
        const depth = document.createElement('span');
        depth.className = 'depth';
        depth.textContent = trace.stack.length - 1 - i;
        const nm = document.createElement('span');
        nm.className = 'truncate';
        nm.textContent = nameOf(id);
        d.append(depth, nm);
        box.appendChild(d);
    });
}

function buildTimeline(list) {
    const ticks = $('traceTicks');
    ticks.replaceChildren();
    list.forEach(e => { const i = document.createElement('i'); i.className = e.t; ticks.appendChild(i); });
    updateTimeline();
}
function updateTimeline() {
    const ticks = $('traceTicks').children;
    for (let k = 0; k < ticks.length; k++) {
        ticks[k].classList.toggle('done', k < trace.i);
        ticks[k].classList.toggle('now', k === trace.i - 1);
    }
    $('traceCount').textContent = trace.events.length ? 'step ' + trace.i + ' / ' + trace.events.length : '';
}

function updateTraceBtns() {
    const finished = trace.active && trace.i >= trace.events.length;
    const [ic, text] = trace.playing ? ['pause', 'Pause'] : finished ? ['undo', 'Replay'] : ['play', 'Play'];
    $('tracePlay').innerHTML = icon(ic) + '<span>' + text + '</span>';
    $('traceDot').classList.toggle('live', trace.playing);
}

function setTracePanel(open) {
    const p = $('tracePanel'), was = !p.classList.contains('hidden');
    p.classList.toggle('hidden', !open);
    if (open && !was && !REDUCED) replay(p, 'panel-in');
    if (!open) traceClear();
    if (cy) cy.resize();
    resizeCanvases();
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
    if (trace.playing) { trace.playing = false; updateTraceBtns(); } else tracePlay();
});
$('traceStep').addEventListener('click', async () => {
    trace.playing = false;
    if (!trace.active) { startDefault(false); return; }
    await traceStep();
    updateTraceBtns();
});
$('traceReset').addEventListener('click', traceClear);
document.querySelectorAll('#speedSeg button').forEach(b => b.addEventListener('click', () => {
    $('traceSpeed').value = b.dataset.speed;
    document.querySelectorAll('#speedSeg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
}));

/* ---------- result banner ---------- */
let bannerTimer = 0;
function showBanner(level, title, sub) {
    const b = $('resultBanner');
    b.className = 'lvl-' + level;
    $('rbIcon').innerHTML = icon(level === 'error' ? 'xCircle' : level === 'warn' ? 'alert' : 'check');
    $('rbTitle').textContent = title;
    $('rbSub').textContent = sub;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => hideBanner(), 4200);
    if (REDUCED) return;
    requestAnimationFrame(() => {
        const s = $('stage').getBoundingClientRect(), r = b.getBoundingClientRect();
        const x = r.left - s.left + r.width / 2, y = r.top - s.top + r.height / 2;
        if (level === 'error') { burst(x, y, ['#f43f5e', '#fb7185', '#fda4af'], 70, 9); replay($('stage'), 'shake'); }
        else if (level === 'warn') burst(x, y, ['#fbbf24', '#fde68a'], 60, 8);
        else confetti(x, y);
    });
}
function hideBanner(now) {
    const b = $('resultBanner');
    clearTimeout(bannerTimer);
    if (b.classList.contains('hidden')) return;
    if (now || REDUCED) { b.className = 'hidden'; return; }
    b.classList.add('leaving');
    setTimeout(() => { if (b.classList.contains('leaving')) b.className = 'hidden'; }, 450);
}
$('resultBanner').addEventListener('click', () => hideBanner());

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
    if (inspectedId !== null) inspect(inspectedId, true);
}

/* ---------- toolbar ---------- */
// Shift+Enter in the palette: show and mark every match (the original search behaviour)
function highlightMatches(q) {
    cy.nodes().removeClass('match');
    if (!q) return;
    const hits = [...nodes.values()].filter(n => (n.label + ' ' + nameOf(n.id)).toLowerCase().includes(q)).map(n => n.id);
    if (!hits.length) { toast('No functions match "' + q + '"', 'search'); return; }
    const added = ensureVisible(hits);
    hits.forEach(id => cy.getElementById(id).addClass('match'));
    if (added) runLayout();
    toast(hits.length + ' match' + (hits.length > 1 ? 'es' : '') + ' highlighted', 'search');
    if (hits.length === 1) { openSidebar(); focusNode(hits[0]); }
}
$('resetBtn').addEventListener('click', () => { resetView(); toast('Back to main', 'home'); });
$('interestBtn').addEventListener('click', () => {
    showInterest = !showInterest;
    $('interestBtn').classList.toggle('on', showInterest);
    applyInterest();
    toast('Interest highlighting ' + (showInterest ? 'on' : 'off'), 'flag');
});
$('fitBtn').addEventListener('click', () => fitView());
$('zoomInBtn').addEventListener('click', () => zoomBy(1.3));
$('zoomOutBtn').addEventListener('click', () => zoomBy(1 / 1.3));
$('helpBtn').addEventListener('click', () => openOverlay('help'));

// "Show all" becomes "Hide all" once every node is on screen
function updateExpandBtn() {
    const all = nodes.size > 0 && visible.size >= nodes.size;
    $('expandAllBtn').lastChild.textContent = all ? 'Hide all' : 'Show all';
}

// everything except main goes away
function hideAll() {
    const keep = new Set([rootId]);
    const drop = new Set([...visible].filter(id => !keep.has(id)));
    if (!drop.size) return;
    inspect(rootId);
    hideTip();
    dropNodes(drop);
    drop.forEach(id => visible.delete(id));
    cy.elements().removeClass('faded hl');
    updateExpandBtn();
    cy.animate({ center: { eles: cy.getElementById(rootId) } }, { duration: 350, easing: 'ease-in-out-cubic' });
}

$('expandAllBtn').addEventListener('click', () => {
    if (trace.busy) return;
    if (nodes.size > 0 && visible.size >= nodes.size) hideAll();
    else if (ensureVisible([...nodes.keys()])) runLayout(() => fitView());
});

function toggleSidebar() {
    const sidebar = $('sidebar');
    const isCollapsed = sidebar.classList.toggle('translate-x-full');
    document.body.classList.toggle('sb-open', !isCollapsed);
    syncSidebarWidth();
    if (cy) {
        cy.stop();
        cancelAnimationFrame(vpTween);
        // keep the graph centred in whatever part of the canvas stays uncovered
        const pan = cy.pan(), shiftX = sidebar.offsetWidth / 2 * (isCollapsed ? 1 : -1);
        cy.animate({ pan: { x: pan.x + shiftX, y: pan.y }, zoom: cy.zoom() }, { duration: 550, easing: 'ease-in-out-cubic' });
    }
    if (!isCollapsed) requestAnimationFrame(positionInk);
}

function sidebarClosed() { return $('sidebar').classList.contains('translate-x-full'); }
function openSidebar() { if (sidebarClosed()) toggleSidebar(); }
function syncSidebarWidth() { document.body.style.setProperty('--sbw', $('sidebar').offsetWidth + 'px'); }

$('sidebarBtn').addEventListener('click', toggleSidebar);

/* ---------- command palette ---------- */
const pal = { list: [], sel: 0 };
function openOverlay(id) {
    const o = $(id);
    o.classList.remove('hidden');
    requestAnimationFrame(() => o.classList.add('open'));
}
function closeOverlay(id) {
    const o = $(id);
    if (o.classList.contains('hidden')) return;
    o.classList.remove('open');
    setTimeout(() => { if (!o.classList.contains('open')) o.classList.add('hidden'); }, 200);
}
const overlayOpen = id => !$(id).classList.contains('hidden') && $(id).classList.contains('open');

function openPalette() {
    if (!nodes.size) return;
    openOverlay('palette');
    $('searchInput').value = '';
    renderPalette();
    setTimeout(() => $('searchInput').focus(), 10);
}

function paletteResults(q) {
    const all = [...nodes.values()];
    const typeRank = { entry: 0, custom: 1, import: 2 };
    if (!q) {
        const rank = n => (interest.has(n.id) ? 0 : 3) + (typeRank[n.type || 'custom'] ?? 1);
        return all.slice().sort((a, b) => rank(a) - rank(b) || nameOf(a.id).localeCompare(nameOf(b.id))).slice(0, 60);
    }
    const scored = [];
    all.forEach(n => {
        const nm = nameOf(n.id).toLowerCase(), orig = n.label.toLowerCase(), addr = String(n.id).toLowerCase();
        const s = nm.startsWith(q) ? 0 : nm.includes(q) ? 1 : orig.includes(q) ? 2 : addr.includes(q) ? 3 : -1;
        if (s >= 0) scored.push([s, n]);
    });
    scored.sort((a, b) => a[0] - b[0] || nameOf(a[1].id).length - nameOf(b[1].id).length);
    return scored.slice(0, 80).map(x => x[1]);
}

function renderPalette() {
    const q = $('searchInput').value.trim().toLowerCase();
    pal.list = paletteResults(q);
    const box = $('paletteList');
    box.replaceChildren();
    if (!q) { const h = document.createElement('div'); h.className = 'pal-section'; h.textContent = 'Flagged first'; box.appendChild(h); }
    if (!pal.list.length) {
        const d = document.createElement('div');
        d.className = 'pal-empty';
        d.textContent = 'No function or address matches "' + q + '".';
        box.appendChild(d);
    }
    pal.list.forEach((n, i) => {
        const type = n.type || 'custom', name = nameOf(n.id);
        const b = document.createElement('button');
        b.className = 'pal-row';
        b.setAttribute('role', 'option');
        const ty = document.createElement('span');
        ty.className = 'ty ' + type;
        ty.appendChild(iconEl(TYPE_ICON[type] || 'braces'));
        const nm = document.createElement('span');
        nm.className = 'nm';
        const at = q ? name.toLowerCase().indexOf(q) : -1;
        if (at >= 0) {
            const m = document.createElement('mark');
            m.textContent = name.slice(at, at + q.length);
            nm.append(name.slice(0, at), m, name.slice(at + q.length));
        } else nm.textContent = name;
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = (inn.get(n.id) || []).length + ' in · ' + (out.get(n.id) || []).length + ' out';
        b.append(ty, nm);
        if (interest.has(n.id)) { const f = document.createElement('span'); f.className = 'flag'; f.appendChild(iconEl('flag')); b.appendChild(f); }
        const ad = document.createElement('span');
        ad.className = 'ad';
        ad.textContent = n.id;
        b.append(ad, meta);
        b.addEventListener('mousemove', () => { if (pal.sel !== i) selectPal(i, true); });
        b.addEventListener('click', () => choosePal(i, false));
        box.appendChild(b);
    });
    selectPal(0);
}

function selectPal(i, fromMouse) {
    const rows = $('paletteList').querySelectorAll('.pal-row');
    if (!rows.length) return;
    pal.sel = (i + rows.length) % rows.length;
    rows.forEach((r, j) => r.setAttribute('aria-selected', j === pal.sel));
    if (!fromMouse) rows[pal.sel].scrollIntoView({ block: 'nearest' });
}

function choosePal(i, all) {
    const q = $('searchInput').value.trim().toLowerCase();
    closeOverlay('palette');
    if (all) { highlightMatches(q); return; }
    const n = pal.list[i];
    if (!n) return;
    openSidebar();
    focusNode(n.id);
}

$('paletteBtn').addEventListener('click', openPalette);
$('searchInput').addEventListener('input', renderPalette);
$('searchInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectPal(pal.sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectPal(pal.sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choosePal(pal.sel, e.shiftKey); }
});
['palette', 'help'].forEach(id => $(id).addEventListener('mousedown', e => { if (e.target === $(id)) closeOverlay(id); }));

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
    if (booting) { skipBoot = true; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlayOpen('palette')) closeOverlay('palette'); else openPalette();
        return;
    }
    if (e.key === 'Escape') {
        if (overlayOpen('palette')) closeOverlay('palette');
        else if (overlayOpen('help')) closeOverlay('help');
        else hideBanner();
        return;
    }
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (overlayOpen('palette') || overlayOpen('help')) return;
    const panelOpen = !$('tracePanel').classList.contains('hidden');
    switch (e.key) {
        case '/': e.preventDefault(); openPalette(); break;
        case '?': openOverlay('help'); break;
        case 't': case 'T': $('traceBtn').click(); break;
        case ' ':
            if (!panelOpen) return;
            e.preventDefault();
            $('tracePlay').click();
            break;
        case 'ArrowRight': if (panelOpen) $('traceStep').click(); break;
        case 'f': case 'F': fitView(); break;
        case 'i': case 'I': $('interestBtn').click(); break;
        case 'e': case 'E': toggleSidebar(); break;
    }
});

/* ---------- toasts ---------- */
function toast(text, ic) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.appendChild(iconEl(ic || 'check'));
    t.appendChild(document.createTextNode(text));
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 300); }, 2200);
}

/* ---------- rename in the inspector ---------- */
function setName(id, raw) {
    if (!nodes.has(id)) return;
    const name = raw.trim().replace(/\s+/g, '_').slice(0, 64);   // identifiers can't contain spaces
    const before = nameOf(id);
    if (!name || name === nodes.get(id).label) renames.delete(id); else renames.set(id, name);
    saveRenames();
    const c = cy && cy.getElementById(id);
    if (c && c.length) { c.data('label', shortLabel(nameOf(id))); ripple(id, '#fbbf24', 70); }
    inspect(id, trace.busy);                                      // refresh title, chips, path and code
    if (before !== nameOf(id)) toast('Renamed ' + before + ' to ' + nameOf(id), 'pencil');
}

const nameEl = $('funcName');
nameEl.addEventListener('focus', () => {                          // finish any scramble before editing
    cancelAnimationFrame(scrambleRaf);
    nameEl.classList.remove('scrambling');
    if (inspectedId !== null) nameEl.textContent = nameOf(inspectedId);
});
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
    log.appendChild(logHint(text, isErr));
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
    const btn = $('traceBtn'), label = btn.innerHTML;
    const mode = $('liveMode').value, text = $('liveInput').value;
    btn.disabled = true;
    btn.innerHTML = icon('loader', 'spin') + '<span>Running…</span>';
    traceMessage('Running the program under gdb…', false);
    try {
        const r = await fetch('/api/trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Review-Token': liveCfg.token },
            body: JSON.stringify({ mode, text })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.trace) throw new Error(data.error || 'HTTP ' + r.status);
        setTracePanel(true);
        traceStart(data.trace.events || [], true, data.trace.label || ('live ' + mode + ': ' + text));
    } catch (err) {
        traceMessage('Live run failed: ' + err.message, true);
    } finally {
        liveBusy = false;
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

$('liveInput').addEventListener('keydown', e => { if (e.key === 'Enter') { setTracePanel(true); liveRun(); } });
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

/* ==========================================================================
   motion layer: dot grid that tracks the camera, particle effects, edge flow
   ========================================================================== */
const bgCanvas = $('bgCanvas'), glowCanvas = $('glowCanvas'), fxCanvas = $('fxCanvas');
const bgCtx = bgCanvas.getContext('2d'), glowCtx = glowCanvas.getContext('2d'), fxCtx = fxCanvas.getContext('2d');
const parts = [];
let gridQueued = false, fxDirty = false;

function resizeCanvases() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    [[bgCanvas, bgCtx], [glowCanvas, glowCtx], [fxCanvas, fxCtx]].forEach(([c, ctx]) => {
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    syncSidebarWidth();
    drawGrid();
}

function scheduleGrid() {
    if (gridQueued) return;
    gridQueued = true;
    requestAnimationFrame(() => { gridQueued = false; drawGrid(); });
}

function drawGrid() {
    const w = bgCanvas.clientWidth, h = bgCanvas.clientHeight;
    bgCtx.clearRect(0, 0, w, h);
    const z = cy ? cy.zoom() : 1, p = cy ? cy.pan() : { x: w / 2, y: h / 2 };
    let s = 34 * z;
    while (s < 16) s *= 2;
    while (s > 68) s /= 2;
    const ox = ((p.x % s) + s) % s, oy = ((p.y % s) + s) % s;
    const r = Math.max(1, Math.min(1.6, z * 1.2));
    bgCtx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    for (let x = ox; x < w; x += s)
        for (let y = oy; y < h; y += s) bgCtx.fillRect(x - r / 2, y - r / 2, r, r);
    // every fourth intersection gets a small cross, like a drafting board
    const S = s * 4, OX = ((p.x % S) + S) % S, OY = ((p.y % S) + S) % S;
    bgCtx.strokeStyle = 'rgba(167, 139, 250, 0.22)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    for (let x = OX; x < w; x += S)
        for (let y = OY; y < h; y += S) { bgCtx.moveTo(x - 4, y); bgCtx.lineTo(x + 4, y); bgCtx.moveTo(x, y - 4); bgCtx.lineTo(x, y + 4); }
    bgCtx.stroke();
}

function nodePoint(id) {
    const n = cy && cy.getElementById(id);
    return n && n.length ? n.renderedPosition() : null;
}

function ripple(id, color, R) {
    if (REDUCED) return;
    const p = nodePoint(id);
    if (!p) return;
    parts.push({ k: 'ring', x: p.x, y: p.y, life: 0, max: 42, R: (R || 56) * Math.max(0.6, cy.zoom()), color });
    parts.push({ k: 'ring', x: p.x, y: p.y, life: -8, max: 42, R: (R || 56) * 0.6 * Math.max(0.6, cy.zoom()), color });
}

function burst(x, y, colors, n, speed) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
        parts.push({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.05, drag: 0.94,
            life: 0, max: 45 + Math.random() * 25, size: 1.5 + Math.random() * 2.5, color: colors[i % colors.length] });
    }
}

function confetti(x, y) {
    const colors = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 140; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, v = 4 + Math.random() * 9;
        parts.push({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.22, drag: 0.985,
            life: 0, max: 90 + Math.random() * 50, w: 4 + Math.random() * 5, h: 2 + Math.random() * 3,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, color: colors[i % colors.length] });
    }
    burst(x, y, ['#ffffff', '#a7f3d0'], 30, 6);
}

function drawFx() {
    const w = fxCanvas.clientWidth, h = fxCanvas.clientHeight;
    if (!parts.length) { if (fxDirty) { fxCtx.clearRect(0, 0, w, h); fxDirty = false; } return; }
    fxDirty = true;
    fxCtx.clearRect(0, 0, w, h);
    fxCtx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life++;
        if (q.life > q.max) { parts.splice(i, 1); continue; }
        if (q.life < 0) continue;
        const t = q.life / q.max;
        if (q.k === 'ring') {
            fxCtx.globalAlpha = (1 - t) * 0.8;
            fxCtx.strokeStyle = q.color;
            fxCtx.lineWidth = 2.5 * (1 - t) + 0.5;
            fxCtx.beginPath();
            fxCtx.arc(q.x, q.y, 6 + q.R * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
            fxCtx.stroke();
            continue;
        }
        q.vx *= q.drag; q.vy = q.vy * q.drag + q.g;
        q.x += q.vx; q.y += q.vy;
        fxCtx.globalAlpha = Math.min(1, (1 - t) * 1.4);
        fxCtx.fillStyle = q.color;
        if (q.k === 'conf') {
            q.rot += q.vr;
            fxCtx.save();
            fxCtx.translate(q.x, q.y);
            fxCtx.rotate(q.rot);
            fxCtx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h * Math.abs(Math.cos(q.rot * 2)) + 0.6);
            fxCtx.restore();
        } else {
            fxCtx.beginPath();
            fxCtx.arc(q.x, q.y, q.size * (1 - t * 0.6), 0, Math.PI * 2);
            fxCtx.fill();
        }
    }
    fxCtx.globalAlpha = 1;
    fxCtx.globalCompositeOperation = 'source-over';
}

// comet tail behind the trace token
function trailToken() {
    const tok = cy && cy.getElementById('__tok');
    if (!tok || !tok.length || tok.removed()) return;
    const p = tok.renderedPosition(), c = tok.data('color');
    for (let i = 0; i < 2; i++)
        parts.push({ k: 'dot', x: p.x + (Math.random() - 0.5) * 4, y: p.y + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, g: 0, drag: 0.96,
            life: 0, max: 22 + Math.random() * 10, size: 1.6 + Math.random() * 2, color: c });
}

// marching dashes on highlighted edges
function animateGraph(now) {
    if (!cy) return;
    const flow = cy.edges('.hl, .onpath, .trace-seen, .trace-active');
    if (flow.length) cy.batch(() => flow.style('line-dash-offset', -((now / 45) % 14)));
}

// Soft neon halos drawn under the graph. Cytoscape has no blur, so the halo is a canvas shadow behind
// each node; the node's own opaque fill covers the centre and only the glow shows around it.
function glowFor(n, pulse, quiet) {
    if (n.hasClass('crash-site')) return ['#f43f5e', 0.55 + 0.45 * pulse, 42];
    if (n.hasClass('trace-active')) return ['#22d3ee', 0.95, 36];
    if (n.selected()) return ['#a78bfa', 0.8, 30];
    if (n.hasClass('match')) return ['#f0abfc', 0.75, 28];
    if (showInterest && n.hasClass('interest')) return ['#f43f5e', 0.3 + 0.5 * pulse, 26];
    if (n.hasClass('onpath')) return ['#fbbf24', 0.55, 22];
    if (n.hasClass('trace-seen')) return ['#22d3ee', 0.35, 18];
    if (quiet) return null;
    return [TYPE_COLOR[n.data('type')] || TYPE_COLOR.custom, 0.22, 16];
}

function drawGlow(now) {
    const w = glowCanvas.clientWidth, h = glowCanvas.clientHeight;
    glowCtx.clearRect(0, 0, w, h);
    if (!cy || booting) return;
    const z = cy.zoom(), pulse = REDUCED ? 0.6 : 0.5 + 0.5 * Math.sin(now / 450);
    const all = cy.nodes().not('.token');
    const quiet = all.length > 150;                // big graphs: only glow what matters
    all.forEach(n => {
        const g = glowFor(n, pulse, quiet);
        if (!g) return;
        const op = n.effectiveOpacity();
        if (op < 0.05) return;
        const bb = n.renderedBoundingBox({ includeLabels: false, includeOverlays: false, includeUnderlays: false });
        if (bb.x2 < -60 || bb.y2 < -60 || bb.x1 > w + 60 || bb.y1 > h + 60) return;
        glowCtx.globalAlpha = g[1] * op;
        glowCtx.shadowColor = g[0];
        glowCtx.shadowBlur = g[2] * Math.max(0.45, Math.min(z, 1.6));
        glowCtx.fillStyle = g[0];
        glowCtx.beginPath();
        if (glowCtx.roundRect) glowCtx.roundRect(bb.x1 + 3, bb.y1 + 3, bb.w - 6, bb.h - 6, 9 * z);
        else glowCtx.rect(bb.x1 + 3, bb.y1 + 3, bb.w - 6, bb.h - 6);
        glowCtx.fill();
    });
    glowCtx.globalAlpha = 1;
    glowCtx.shadowBlur = 0;
}

let frameNo = 0;
function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    frameNo++;
    if (!REDUCED) trailToken();
    drawFx();
    if (frameNo % 2 === 0) {
        drawGlow(now);
        if (!REDUCED && !booting) animateGraph(now);
    }
}

new ResizeObserver(() => { resizeCanvases(); }).observe($('stage'));
window.addEventListener('resize', () => { syncSidebarWidth(); positionInk(); });
resizeCanvases();
updateTraceBtns();
requestAnimationFrame(frame);
