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
        this.textContent = '';
        this.value = '';
        this.disabled = false;
    }
    addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
    dispatch(name, event = {}) { for (const handler of this.events[name] || []) handler({ target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) {
        if (selector === 'option') return this.children.flatMap(child => child.tagName === 'OPTION' ? [child] : child.querySelector('option') || []).find(Boolean) || null;
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

function harness(reduceMotion = false, width = 1400) {
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
        cytoscape: { use() {} },
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

test('trace reset prevents a delayed layout callback from starting playback', () => {
    const h = harness();
    h.run(`
        globalThis.cameraMoves = 0;
        cy = {
            nodes: () => ({ remove() {} }),
            elements: () => ({ removeClass() {} }),
            animate: () => { globalThis.cameraMoves++; }
        };
        prepareTrace = () => ({ list: [{t:'enter',a:'main'}], ids: new Set(['main']), edges: new Set() });
        ensureVisible = () => true;
        runLayout = callback => { globalThis.pendingLayout = callback; };
        traceStart([{t:'enter',a:'main'}], true);
        traceClear();
        pendingLayout();
    `);
    assert.equal(h.context.cameraMoves, 0);
    assert.equal(h.run('trace.active'), false);
    assert.equal(h.run('trace.playing'), false);
});

test('reduced motion disables layout and camera animation durations', () => {
    const normal = harness(false);
    const reduced = harness(true);
    assert.equal(normal.run('motionDuration(280)'), 280);
    assert.equal(reduced.run('motionDuration(280)'), 0);
    reduced.context.layoutOptions = null;
    reduced.run(`cy = { elements: () => ({ not: () => ({ layout: options => { globalThis.layoutOptions = options; return {run() {}}; } }) }) }; runLayout();`);
    assert.equal(reduced.context.layoutOptions.animate, false);
    assert.equal(reduced.context.layoutOptions.animationDuration, 0);
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
    h.run(`liveCfg = {token:'test-token',max_args:200,max_stdin:200}; setupTrace();`);
    assert.equal(h.elements.get('traceBtn').disabled, false);
    assert.equal(h.elements.get('liveBar').classList.contains('hidden'), false);
    assert.equal(h.elements.get('traceSelect').classList.contains('hidden'), true);
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
