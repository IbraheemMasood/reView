const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'app.js'), 'utf8');

class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.events = {};
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            contains: name => this.classes.has(name),
            toggle: (name, force) => {
                const add = force === undefined ? !this.classes.has(name) : force;
                if (add) this.classes.add(name); else this.classes.delete(name);
                return add;
            }
        };
        this.style = {};
        this._textContent = '';
        this.value = '';
        this.disabled = false;
    }
    get textContent() { return this._textContent + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._textContent = String(value); this.children = []; }
    addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
    dispatch(name, event = {}) { for (const handler of this.events[name] || []) handler({ target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this._textContent = ''; this.children = children; }
    querySelector(selector) {
        if (selector === 'option') return this.children.flatMap(child => child.tagName === 'OPTION' ? [child] : child.querySelector('option') || []).find(Boolean) || null;
        if (selector.startsWith('.')) {
            const name = selector.slice(1);
            const visit = parent => {
                for (const child of parent.children) {
                    if (child.className?.split(/\s+/).includes(name) || child.classes.has(name)) return child;
                    const nested = visit(child);
                    if (nested) return nested;
                }
                return null;
            };
            return visit(this);
        }
        return null;
    }
    querySelectorAll(selector) {
        const tags = selector.split(',').map(part => part.trim());
        const found = [];
        const visit = parent => parent.children.forEach(child => {
            if (tags.includes(child.tagName.toLowerCase()) ||
                (tags.includes('[contenteditable]') && child.attributes.contenteditable !== undefined) ||
                (tags.includes('[tabindex="0"]') && child.attributes.tabindex === '0')) found.push(child);
            visit(child);
        });
        visit(this);
        return found;
    }
    contains(other) { for (let el = other; el; el = el.parentElement) if (el === this) return true; return false; }
    getClientRects() { return [this]; }
    closest() { return null; }
    focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
    click() { this.dispatch('click'); }
}

function harness(reduceMotion = false, width = 1400, absentIds = [], graphInstance = null) {
    const elements = new Map();
    const filters = ['all', 'custom', 'import', 'interest'].map(filter => {
        const button = new Element('button');
        button.dataset.filter = filter;
        return button;
    });
    const document = {
        documentElement: new Element('html'),
        body: new Element('body'),
        fonts: { load: () => Promise.resolve([]) },
        events: {},
        createElement: tag => { const el = new Element(tag); el.ownerDocument = document; return el; },
        getElementById: id => {
            if (absentIds.includes(id)) return null;
            if (!elements.has(id)) {
                const el = new Element();
                el.ownerDocument = document;
                elements.set(id, el);
            }
            return elements.get(id);
        },
        querySelectorAll: selector => selector === '[data-filter]' ? filters :
            selector === '.function-item' ? (elements.get('functionList')?.children || []).filter(el => el.className === 'function-item') : [],
        addEventListener(name, handler) { (this.events[name] ||= []).push(handler); },
        dispatch(name, event) { for (const handler of this.events[name] || []) handler(event); }
    };
    const window = { innerWidth: width, matchMedia: query => ({
        matches: query.includes('reduced-motion') ? reduceMotion : width >= 1100,
        addEventListener() {}
    }) };
    const context = vm.createContext({
        document, window, location: { pathname: '/demo.html' },
        fetch: () => new Promise(() => {}),
        cytoscape: graphInstance ? Object.assign(() => graphInstance, { use() {} }) : { use() {} },
        TextEncoder, Map, Set, Promise, console,
        localStorage: { getItem: () => null, setItem() {} },
        ResizeObserver: class { observe() {} },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        requestAnimationFrame: callback => callback(),
        setTimeout: callback => callback()
    });
    vm.runInContext(source, context, { filename: 'viewer/app.js' });
    return { context, elements, filters, run: code => vm.runInContext(code, context) };
}

// Enough of Cytoscape's collection and position API to exercise the viewer's real
// reveal/collapse logic without duplicating its placement algorithm in the test.
class GraphCollection extends Array {
    not(selector) { return selector === '.token' ? this.filter(el => !el.classes.has('token')) : this; }
    removeClass(name) { this.forEach(el => el.removeClass(name)); return this; }
    addClass(name) { this.forEach(el => el.addClass(name)); return this; }
    unselect() { this.forEach(el => { el.selected = false; }); return this; }
    remove() { return this; }
    boundingBox() {
        if (!this.length) return { x1: 0, y1: 0, x2: 0, y2: 0, w: 0, h: 0 };
        const xs = this.map(el => el.position().x), ys = this.map(el => el.position().y);
        const x1 = Math.min(...xs), x2 = Math.max(...xs);
        const y1 = Math.min(...ys), y2 = Math.max(...ys);
        return { x1, x2, y1, y2, w: x2 - x1, h: y2 - y1 };
    }
}

class GraphDouble {
    constructor(initial = []) {
        this.items = new Map();
        this.layoutCalls = 0;
        this.handlers = new Map();
        this.add(initial.map(({ id, position }) => ({ data: { id }, position })));
    }
    add(entries) {
        for (const entry of entries) {
            const id = entry.data.id;
            if (this.items.has(id)) continue;
            const element = {
                dataValue: entry.data,
                point: { ...(entry.position || { x: 0, y: 0 }) },
                classes: new Set((entry.classes || '').split(/\s+/).filter(Boolean)),
                id() { return id; },
                position(next) { if (next) this.point = { ...next }; return { ...this.point }; },
                addClass(name) { this.classes.add(name); return this; },
                removeClass(name) { this.classes.delete(name); return this; },
                select() { this.selected = true; return this; },
                data(name, value) { if (value !== undefined) this.dataValue[name] = value; return this.dataValue[name]; },
                length: 1
            };
            this.items.set(id, element);
        }
    }
    nodes(selector) {
        const nodes = [...this.items.values()].filter(el => !el.dataValue.source);
        return GraphCollection.from(selector === '.token' ? nodes.filter(el => el.classes.has('token')) : nodes);
    }
    elements() { return GraphCollection.from(this.items.values()); }
    getElementById(id) { return this.items.get(id) || { length: 0 }; }
    remove(collection) { collection.forEach(el => this.items.delete(el.id())); }
    batch(callback) { callback(); }
    $(selector) { return selector === ':selected' ? GraphCollection.from(this.nodes().filter(el => el.selected)) : new GraphCollection(); }
    width() { return 800; }
    height() { return 600; }
    zoom() { return 1; }
    pan() { return { x: 0, y: 0 }; }
    stop() {}
    resize() {}
    animate() {}
    destroy() {}
    on(events, selector, handler) {
        const callback = typeof selector === 'function' ? selector : handler;
        if (!this.handlers.has(events)) this.handlers.set(events, []);
        this.handlers.get(events).push(callback);
    }
    tapNode(id) { for (const callback of this.handlers.get('tap') || []) callback({ target: this.getElementById(id) }); }
    layout() { this.layoutCalls++; return { run() {} }; }
}

function graphHarness(width, initial, connections, withEvents = false) {
    const graph = new GraphDouble(initial);
    const h = harness(false, width, [], withEvents ? graph : null);
    h.context.graph = graph;
    h.context.graphNodes = [...new Set([...initial.map(({ id }) => id), ...connections.flat()])]
        .map(id => ({ id, label: id }));
    h.context.graphConnections = connections;
    h.run(`
        cy = graph;
        nodes = new Map(graphNodes.map(n => [n.id, n]));
        out = new Map(); inn = new Map();
        graphConnections.forEach(([source, target]) => {
            if (!out.has(source)) out.set(source, []);
            if (!inn.has(target)) inn.set(target, []);
            out.get(source).push(target); inn.get(target).push(source);
        });
        rootId = 'main';
        visible = new Set([...graph.items.keys()]);
        layoutDirection = window.innerWidth < 600 ? 'TB' : 'LR';
        positionCache.clear();
    `);
    return { ...h, graph };
}

test('loadGraph rejects malformed nodes, edges, and duplicate function IDs', () => {
    const h = harness();
    for (const graph of [
        { nodes: {}, edges: [] },
        { nodes: [null], edges: [] },
        { nodes: [{ id: 1, label: 'main' }], edges: [] },
        { nodes: [{ id: 'a', label: 'a' }], edges: [{ source: 'a', target: 2 }] },
        { nodes: [{ id: 'a', label: 'a' }, { id: 'a', label: 'b' }], edges: [] }
    ]) {
        h.context.inputGraph = graph;
        assert.throws(() => h.run('loadGraph(inputGraph)'), /(?:JSON must|Each function|Function IDs)/);
    }
});

test('loadGraph retains valid connections and ignores duplicate, dangling, and self edges', () => {
    const h = harness();
    h.run('setupTrace = () => {}; resetView = () => {}; updateWorkspace = () => {}');
    h.context.inputGraph = {
        nodes: [{ id: 'a', label: 'main' }, { id: 'b', label: 'helper' }],
        edges: [
            { source: 'a', target: 'b' }, { source: 'a', target: 'b' },
            { source: 'a', target: 'missing' }, { source: 'b', target: 'b' }
        ]
    };
    h.run('loadGraph(inputGraph)');
    assert.equal(h.run('rootId'), 'a');
    assert.equal(h.run('out.get("a").length'), 1);
    assert.equal(h.run('inn.get("b").length'), 1);
});

test('function navigation filters, searches, and selects functions with missing type', () => {
    const h = harness();
    h.run(`nodes = new Map([
        ['main', {id:'main',label:'main',type:'entry'}],
        ['helper', {id:'helper',label:'helper'}],
        ['lib', {id:'lib',label:'puts',type:'import'}]
    ]); rootId = 'main'; interest = new Map([['helper', ['Flagged']]]);`);
    h.filters.find(b => b.dataset.filter === 'custom').click();
    const list = h.elements.get('functionList');
    assert.deepEqual(list.children.filter(el => el.className === 'function-item').map(el => el.dataset.id), ['helper']);
    assert.equal(h.filters.find(b => b.dataset.filter === 'custom').getAttribute('aria-pressed'), 'true');
    h.elements.get('searchInput').value = 'absent';
    h.elements.get('searchInput').dispatch('input');
    assert.equal(h.elements.get('searchFeedback').textContent, '0 matching functions');
    h.elements.get('searchInput').value = 'help';
    h.elements.get('searchInput').dispatch('input');
    assert.equal(list.children.filter(el => el.className === 'function-item').length, 1);
    h.run('focusNode = id => { globalThis.focusedId = id; }; closeNavigator = () => {}');
    list.children[0].click();
    assert.equal(h.context.focusedId, 'helper');
});

test('new graph nodes extend the established orientation on desktop and mobile', () => {
    for (const [width, expectedAxis] of [[1400, 'x'], [500, 'y']]) {
        const h = graphHarness(width, [{ id: 'main', position: { x: 0, y: 0 } }], [['main', 'child']]);
        h.run('ensureVisible(["child"]); placeNew(["child"]);');
        const root = h.graph.getElementById('main').position();
        const child = h.graph.getElementById('child').position();
        assert.deepEqual(root, { x: 0, y: 0 });
        assert.ok(child[expectedAxis] > 0, `${width}px: callee should follow the root on ${expectedAxis}`);
        assert.equal(child[expectedAxis === 'x' ? 'y' : 'x'], 0);
    }
});

test('collapsing and reopening a branch restores its nodes to their exact positions', () => {
    const original = { x: 475, y: 55 };
    const h = graphHarness(1400, [
        { id: 'main', position: { x: 0, y: 0 } },
        { id: 'branch', position: { x: 230, y: 0 } },
        { id: 'leaf', position: original }
    ], [['main', 'branch'], ['branch', 'leaf']]);
    assert.equal(h.run('collapseNode("branch")'), true);
    assert.equal(h.graph.getElementById('leaf').length, 0);
    h.run('ensureVisible(["leaf"]); placeNew(["leaf"]);');
    assert.deepEqual(h.graph.getElementById('leaf').position(), original);
    assert.deepEqual(h.graph.getElementById('main').position(), { x: 0, y: 0 });
    assert.deepEqual(h.graph.getElementById('branch').position(), { x: 230, y: 0 });
});

test('node taps inspect without changing graph visibility during an active trace', () => {
    const original = { x: 460, y: 0 };
    const h = graphHarness(1400, [
        { id: 'main', position: { x: 0, y: 0 } },
        { id: 'branch', position: { x: 230, y: 0 } },
        { id: 'leaf', position: original }
    ], [['main', 'branch'], ['branch', 'leaf']], true);
    h.run('createCy(); inspect = id => { globalThis.inspected = id; }; trace.active = true; trace.busy = false;');
    h.graph.tapNode('branch');
    assert.equal(h.context.inspected, 'branch');
    assert.equal(h.graph.getElementById('leaf').length, 1);
    assert.deepEqual(h.graph.getElementById('leaf').position(), original);
    assert.equal(h.run('visible.has("leaf")'), true);
    h.run('trace.active = false;');
    h.graph.tapNode('branch');
    assert.equal(h.graph.getElementById('leaf').length, 0);
});

test('search, show all, and navigator selection reveal nodes without re-layout', () => {
    const h = graphHarness(1400, [{ id: 'main', position: { x: 0, y: 0 } }],
        [['main', 'helper'], ['helper', 'leaf']]);
    h.run('runLayout = () => { graph.layoutCalls++; }; inspect = id => { globalThis.inspected = id; };');
    const search = h.context.document.getElementById('searchInput');
    search.value = 'helper';
    search.dispatch('keydown', { key: 'Enter' });
    assert.equal(h.graph.getElementById('helper').length, 1);
    assert.equal(h.graph.layoutCalls, 0);
    h.context.document.getElementById('expandAllBtn').click();
    assert.equal(h.graph.getElementById('leaf').length, 1);
    assert.equal(h.graph.layoutCalls, 0);

    search.value = '';
    h.run('renderFunctionList()');
    const leafButton = h.context.document.getElementById('functionList').children
        .find(child => child.dataset.id === 'leaf');
    leafButton.click();
    assert.equal(h.context.inspected, 'leaf');
    assert.equal(h.graph.layoutCalls, 0);
    assert.deepEqual(h.graph.getElementById('main').position(), { x: 0, y: 0 });
    const helperPosition = h.graph.getElementById('helper').position();
    const leafPosition = h.graph.getElementById('leaf').position();
    h.context.document.getElementById('expandAllBtn').click();
    assert.equal(h.graph.getElementById('helper').length, 0);
    h.context.document.getElementById('expandAllBtn').click();
    assert.deepEqual(h.graph.getElementById('helper').position(), helperPosition);
    assert.deepEqual(h.graph.getElementById('leaf').position(), leafPosition);
    assert.equal(h.graph.layoutCalls, 0);
});

test('trace reset invalidates a pending step and clears its controls', async () => {
    const h = harness();
    let finish;
    h.context.pendingEvent = () => new Promise(resolve => { finish = resolve; });
    h.run(`trace.active = true; trace.events = [{t:'enter',a:'main'}]; applyEvent = pendingEvent;`);
    const step = h.run('traceStep()');
    assert.equal(h.run('trace.busy'), true);
    h.run('traceClear()');
    finish();
    await step;
    assert.equal(h.run('trace.busy'), false);
    assert.equal(h.run('trace.active'), false);
    assert.equal(h.elements.get('traceProgress').textContent, 'Ready');
});

test('trace reset prevents a queued autoplay callback from restarting playback', () => {
    const h = graphHarness(1400, [{ id: 'main', position: { x: 0, y: 0 } }], []);
    const timers = [];
    h.context.setTimeout = callback => { timers.push(callback); };
    h.run(`
        prepareTrace = () => ({ list: [{t:'enter',a:'main'}], ids: new Set(['main']), edges: new Set() });
        ensureVisible = () => false;
        traceStart([{t:'enter',a:'main'}], true);
    `);
    assert.equal(timers.length, 1);
    h.run('traceClear()');
    timers[0]();
    assert.equal(h.run('trace.active'), false);
    assert.equal(h.run('trace.playing'), false);
});

test('initial layout is synchronous and camera motion respects reduced motion', () => {
    const normal = harness(false);
    const reduced = harness(true);
    assert.equal(normal.run('motionDuration(280)'), 280);
    assert.equal(reduced.run('motionDuration(280)'), 0);
    for (const h of [normal, reduced]) {
        h.context.layoutOptions = null;
        h.run(`cy = { elements: () => ({ not: () => ({ layout: options => { globalThis.layoutOptions = options; return {one() {}, run() {}}; } }) }) }; runLayout();`);
        assert.equal(h.context.layoutOptions.animate, false);
        assert.equal(h.context.layoutOptions.animationDuration, 0);
    }
});

test('following a trace keeps its active node readable and respects reduced motion', () => {
    for (const [width, reduced, expectedZoom, expectedDuration] of [
        [1400, false, 1, 250], [500, false, 0.85, 250], [500, true, 0.85, 0]
    ]) {
        const h = harness(reduced, width);
        h.run(`cy = {
            zoom: () => 0.3,
            width: () => 800,
            height: () => 600,
            stop: () => { globalThis.stopped = true; },
            getElementById: () => ({length:1,position:() => ({x:100,y:150})}),
            animate: (camera, options) => { globalThis.camera = camera; globalThis.animation = options; }
        }; followTraceNode('main');`);
        assert.equal(h.context.camera.zoom, expectedZoom);
        assert.equal(h.context.camera.pan.x, 400 - 100 * expectedZoom);
        assert.equal(h.context.camera.pan.y, 300 - 150 * expectedZoom);
        assert.equal(h.context.animation.duration, expectedDuration);
        assert.equal(h.context.stopped, true);
    }
});

test('Follow node control switches between active node and graph overview', () => {
    const h = harness();
    h.run(`trace.stack = ['main']; followTraceNode = id => { globalThis.followed = id; }; fitGraph = () => { globalThis.overviewCount = (globalThis.overviewCount || 0) + 1; };`);
    const control = h.context.document.getElementById('traceFollow');
    control.checked = false;
    control.dispatch('change');
    assert.equal(h.context.overviewCount, 1);
    control.checked = true;
    control.dispatch('change');
    assert.equal(h.context.followed, 'main');
});

test('mobile dialogs cycle Tab focus and close with focus restored', () => {
    const h = harness(false, 500);
    const byId = id => h.context.document.getElementById(id);
    const nav = byId('functionsNav');
    const search = byId('searchInput');
    search.tagName = 'INPUT';
    const navClose = byId('navigatorClose');
    navClose.tagName = 'BUTTON';
    nav.append(search, navClose);
    const drawerButton = byId('navigatorBtn');
    drawerButton.click();
    assert.equal(nav.getAttribute('role'), 'dialog');
    assert.equal(nav.getAttribute('aria-modal'), 'true');
    assert.equal(h.context.document.activeElement, search);
    let prevented = false;
    navClose.focus();
    h.context.document.dispatch('keydown', {key:'Tab', shiftKey:false, target:navClose, preventDefault() { prevented = true; }});
    assert.equal(prevented, true);
    assert.equal(h.context.document.activeElement, search);
    h.context.document.dispatch('keydown', {key:'Tab', shiftKey:true, target:search, preventDefault() {}});
    assert.equal(h.context.document.activeElement, navClose);
    navClose.click();
    assert.equal(nav.getAttribute('role'), undefined);
    assert.equal(drawerButton.getAttribute('aria-expanded'), 'false');
    assert.equal(h.context.document.activeElement, drawerButton);

    drawerButton.click();
    assert.equal(nav.getAttribute('aria-modal'), 'true');
    const inspector = byId('sidebar');
    const inspectorClose = byId('inspectorClose');
    inspectorClose.tagName = 'BUTTON';
    const inspectorAction = h.context.document.createElement('button');
    inspector.append(inspectorClose, inspectorAction);
    byId('sidebarBtn').click();
    assert.equal(nav.getAttribute('aria-modal'), undefined);
    assert.equal(inspector.getAttribute('role'), 'dialog');
    assert.equal(inspector.getAttribute('aria-modal'), 'true');
    assert.equal(h.context.document.activeElement, inspectorClose);
    inspectorClose.focus();
    h.context.document.dispatch('keydown', {key:'Tab', shiftKey:true, target:inspectorClose, preventDefault() {}});
    assert.equal(h.context.document.activeElement, inspectorAction);
    inspectorClose.click();
    assert.equal(h.context.document.activeElement, byId('sidebarBtn'));
});

test('trace controls distinguish no recordings from optional live mode', () => {
    const h = harness();
    h.run('setupTrace()');
    assert.equal(h.elements.get('traceSelect').disabled, true);
    assert.equal(h.elements.get('traceBtn').disabled, true);
    assert.match(h.elements.get('traceAvailability').textContent, /No execution traces/);
    assert.equal(h.elements.get('traceAvailability').classList.contains('hidden'), false);
    h.run(`liveCfg = {token:'test-token',max_args:200,max_stdin:200}; setupTrace();`);
    assert.equal(h.elements.get('traceBtn').disabled, false);
    assert.equal(h.elements.get('liveBar').classList.contains('hidden'), false);
    assert.equal(h.elements.get('traceSelect').classList.contains('hidden'), true);
    assert.equal(h.elements.get('traceAvailability').classList.contains('hidden'), true);
});

test('a running trace can be paused while a step is busy, but cannot start another step', () => {
    const h = harness();
    h.run(`trace.active = true; trace.events = [{t:'enter',a:'main'}]; trace.playing = true; trace.busy = true; updateTraceBtns();`);
    assert.equal(h.elements.get('tracePlay').disabled, false);
    assert.equal(h.elements.get('traceStep').disabled, true);
    assert.equal(h.elements.get('traceReset').disabled, false);
    h.run('trace.playing = false; updateTraceBtns();');
    assert.equal(h.elements.get('tracePlay').disabled, true);
    assert.equal(h.elements.get('traceStep').disabled, true);
    h.run('trace.busy = false; updateTraceBtns();');
    assert.equal(h.elements.get('tracePlay').disabled, false);
    assert.equal(h.elements.get('traceStep').disabled, false);
});

test('Show all is unavailable through an active trace and recovers after reset', () => {
    const h = graphHarness(1400, [{ id: 'main', position: { x: 0, y: 0 } }], [['main', 'helper']]);
    const button = h.context.document.getElementById('expandAllBtn');
    h.run('trace.active = true; trace.playing = false; trace.busy = false; updateTraceBtns();');
    assert.equal(button.disabled, true);
    assert.equal(button.title, 'Close or reset the trace to change graph visibility');
    button.click();
    assert.equal(h.graph.getElementById('helper').length, 0);
    h.run('traceClear()');
    assert.equal(button.disabled, false);
    assert.equal(button.title, 'Show all functions');
    button.click();
    assert.equal(h.graph.getElementById('helper').length, 1);
});

test('Step starts the selected trace and applies its first event after Reset', async () => {
    const h = graphHarness(1400, [{ id: 'main', position: { x: 0, y: 0 } }], []);
    const select = h.context.document.getElementById('traceSelect');
    select.disabled = false;
    select.value = 't:0';
    h.run(`
        graphTraces = [{events:[{t:'enter',a:'main'}]}];
        prepareTrace = () => ({ list:[{t:'enter',a:'main'}], ids:new Set(['main']), edges:new Set() });
        applyEvent = async () => { globalThis.applied = (globalThis.applied || 0) + 1; };
        traceClear();
    `);
    const step = h.context.document.getElementById('traceStep');
    assert.equal(step.disabled, false);
    step.click();
    await Promise.resolve();
    assert.equal(h.run('trace.i'), 1);
    assert.equal(h.context.applied, 1);
    h.context.document.getElementById('traceReset').click();
    assert.equal(h.run('trace.active'), false);
    assert.equal(step.disabled, false);
    step.click();
    await Promise.resolve();
    assert.equal(h.run('trace.i'), 1);
    assert.equal(h.context.applied, 2);
});

test('removing the import control does not prevent the other controls from initializing', () => {
    const h = harness(false, 1400, ['importBtn', 'fileInput']);
    assert.ok(h.elements.get('resetBtn').events.click?.length);
    assert.ok(h.elements.get('expandAllBtn').events.click?.length);
    assert.ok(h.elements.get('sidebarBtn').events.click?.length);
    assert.ok(h.elements.get('zoomInBtn').events.click?.length);
});

test('state changes preserve icons and labels inside graph and playback buttons', () => {
    const h = harness();
    const byId = id => h.elements.get(id) || h.context.document.getElementById(id);
    const expand = byId('expandAllBtn');
    const expandIcon = new Element('svg');
    const expandLabel = new Element('span');
    expandLabel.className = 'action-label';
    expandLabel.textContent = 'Show all';
    expand.append(expandIcon, expandLabel);
    h.run('nodes = new Map([["main", {id:"main",label:"main"}]]); visible = new Set(); updateExpandBtn();');
    assert.equal(expand.children[0], expandIcon);
    assert.equal(expand.children[1], expandLabel);
    h.run('visible.add("main"); updateExpandBtn();');
    assert.equal(expand.children[0], expandIcon);
    assert.equal(expand.children[1], expandLabel);
    assert.match(expandLabel.textContent, /Hide all/);

    const interestButton = byId('interestBtn');
    const interestDot = new Element('span');
    const interestLabel = new Element('span');
    interestLabel.className = 'interest-label';
    interestLabel.textContent = 'Interest';
    interestButton.append(interestDot, interestLabel);
    interestButton.click();
    assert.equal(interestButton.children[0], interestDot);
    assert.equal(interestButton.children[1], interestLabel);
    assert.equal(interestButton.getAttribute('aria-pressed'), 'false');

    const play = byId('tracePlay');
    const playIcon = new Element('svg');
    const playLabel = new Element('span');
    playLabel.className = 'trace-play-label';
    playLabel.textContent = 'Play';
    play.append(playIcon, playLabel);
    h.run('trace.active = true; trace.playing = true; updateTraceBtns();');
    assert.equal(play.children[0], playIcon);
    assert.equal(play.children[1], playLabel);
    assert.match(playLabel.textContent, /Pause/);
});

test('live trace request keeps the token, selected mode, and input text', async () => {
    const h = harness();
    const requests = [];
    h.context.fetch = async (url, options) => {
        requests.push({ url, options });
        return { ok: false, status: 422, json: async () => ({ error: 'sample failure' }) };
    };
    h.run(`liveCfg = {token:'test-token', max_args:200, max_stdin:200};`);
    h.elements.get('liveMode').value = 'stdin';
    h.elements.get('liveInput').value = 'sample input';
    await h.run('liveRun()');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/trace');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['X-Review-Token'], 'test-token');
    assert.deepEqual(JSON.parse(requests[0].options.body), { mode: 'stdin', text: 'sample input' });
    assert.match(h.elements.get('traceLog').children[0].textContent, /sample failure/);
    assert.equal(h.elements.get('traceBtn').disabled, false);
    assert.equal(h.elements.get('statusText').textContent, 'Ready to explore');
});
