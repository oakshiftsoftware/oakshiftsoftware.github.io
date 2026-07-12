const CONFIG = {
    cdn_host: 'https://oakshiftsoftware.github.io/cdn/young-suns-companion',
    app_name: 'Sundog Tracker',
    app_version: '0.0.6',
    app_author: 'Oakshift Software',
    app_description: 'A companion app for Young Suns Xbox game'
};

class DataService {
    constructor() { this.cache_prefix = 'ysc_'; }
    async get_cached(key) { const stored = localStorage.getItem(this.cache_prefix + key); return stored ? JSON.parse(stored) : null; }
    async _write_cache(key, data) { localStorage.setItem(this.cache_prefix + key, JSON.stringify(data)); }
    async fetch_and_cache(key) {
        const urls = {
            'blueprints': CONFIG.cdn_host + '/blueprints.json',
            'resources': CONFIG.cdn_host + '/resources.json'
        };
        const url = urls[key]; if (!url) return this.get_cached(key);
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) { const data = await response.json(); await this._write_cache(key, data); return data; }
        } catch (error) { console.error(`Failed to fetch ${key}:`, error); }
        return this.get_cached(key);
    }
    async get_json(key) { const cached = await this.get_cached(key); if (cached !== null) return cached; return this.fetch_and_cache(key); }
    async save_json(key, data) { await this._write_cache(key, data); }
}

const appState = {
    resources: {}, blueprints: {}, build_queue: [], resource_tracker: {},
    current_screen: 'queue', current_detail_id: null,
    load_cached() {
        const queue = localStorage.getItem('ysc_queue');
        const tracker = localStorage.getItem('ysc_tracker');
        if (queue) this.build_queue = JSON.parse(queue).items || [];
        if (tracker) this.resource_tracker = JSON.parse(tracker).collected || {};
    },
    async load_remote(dataService) {
        const bp = await dataService.fetch_and_cache('blueprints');
        const rs = await dataService.fetch_and_cache('resources');
        if (bp) this.blueprints = bp; if (rs) this.resources = rs;
    },
    save_queue() { localStorage.setItem('ysc_queue', JSON.stringify({ items: this.build_queue })); },
    save_tracker() { localStorage.setItem('ysc_tracker', JSON.stringify({ collected: this.resource_tracker })); },
    format_location(loc_str) { if (!loc_str) return 'Unknown'; return loc_str.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); },
    compute_totals() {
        const totals = { resources: {}, gratitude: 0 };
        const add_requirements = (bp_id, multiplier = 1) => {
            const bp = this.blueprints[bp_id] || {}; const required = bp.required || [];
            for (const req of required) {
                const item_id = req.item; const qty = (req.quantity || 0) * multiplier;
                if (this.blueprints[item_id]) { add_requirements(item_id, qty); }
                else { totals.resources[item_id] = (totals.resources[item_id] || 0) + qty; }
            }
        };
        for (const bp_id of this.build_queue) {
            add_requirements(bp_id);
            const bp = this.blueprints[bp_id] || {};
            totals.gratitude += (bp.gratitude_cost || 0);
        }
        return totals;
    }
};

const UI = {
    screens: ['queue', 'blueprints', 'detail', 'resources', 'about'],
    switch_screen(name) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const screen = document.getElementById(`screen-${name}`); if (screen) { screen.classList.add('active'); appState.current_screen = name; this.render_screen(name); } },
    render_screen(name) {
        switch (name) {
            case 'queue': this.render_build_queue(); break;
            case 'blueprints': this.render_blueprints(); break;
            case 'detail': this.render_blueprint_detail(); break;
            case 'resources': this.render_resources(); break;
            case 'about': this.render_about(); break;
        }
    },
    render_build_queue() {
        const list = document.getElementById('queue-list'); list.innerHTML = '';
        if (appState.build_queue.length === 0) { const item = document.createElement('div'); item.className = 'list-item disabled'; item.textContent = "Tap '+' to add blueprints"; list.appendChild(item); return; }
        for (const bp_id of appState.build_queue) { const bp = appState.blueprints[bp_id] || {}; const item = document.createElement('div'); item.className = 'list-item queue-item'; item.innerHTML = `<div>${bp.name || bp_id}</div>`; item.addEventListener('click', () => this.show_detail(bp_id)); list.appendChild(item); }
    },
    render_blueprints() {
        const list = document.getElementById('blueprints-list'); list.innerHTML = '';
        const intermediates = []; const equipment = [];
        for (const [bp_id, bp_data] of Object.entries(appState.blueprints)) {
            if (bp_data.variant === 'intermediate') intermediates.push([bp_id, bp_data]);
            else if (bp_data.variant === 'equipment') equipment.push([bp_id, bp_data]);
        }
        if (intermediates.length > 0) {
            const header = document.createElement('div'); header.className = 'section-header'; header.textContent = 'Intermediates'; list.appendChild(header);
            intermediates.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
            for (const [bp_id, bp_data] of intermediates) { const item = document.createElement('div'); item.className = 'list-item blueprint-item'; item.textContent = bp_data.name || bp_id; item.addEventListener('click', () => { appState.add_to_build_queue(bp_id); this.switch_screen('queue'); }); list.appendChild(item); }
        }
        if (equipment.length > 0) {
            const header = document.createElement('div'); header.className = 'section-header'; header.textContent = 'Equipment'; list.appendChild(header);
            equipment.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
            for (const [bp_id, bp_data] of equipment) { const item = document.createElement('div'); item.className = 'list-item blueprint-item'; item.textContent = bp_data.name || bp_id; item.addEventListener('click', () => { appState.add_to_build_queue(bp_id); this.switch_screen('queue'); }); list.appendChild(item); }
        }
    },
    show_detail(bp_id) { appState.current_detail_id = bp_id; this.switch_screen('detail'); },
    render_blueprint_detail() {
        const list = document.getElementById('detail-list'); list.innerHTML = '';
        const bp = appState.blueprints[appState.current_detail_id] || {}; const bp_name = bp.name || appState.current_detail_id;
        const header = document.querySelector('#screen-detail .app-bar-title'); if (header) header.textContent = bp_name;
        const createDetailItem = (label, value) => { const div = document.createElement('div'); div.className = 'detail-item'; div.innerHTML = `<div class="detail-label">${label}</div><div class="detail-value">${value}</div>`; return div; };
        list.appendChild(createDetailItem('Name', bp_name));
        list.appendChild(createDetailItem('Type', (bp.variant || '').toUpperCase()));
        list.appendChild(createDetailItem('Made in', (bp.medium || '').toUpperCase()));
        if (bp.gratitude_cost !== undefined && bp.gratitude_cost !== 0) {
            list.appendChild(createDetailItem('Gratitude Cost', `😊 ${bp.gratitude_cost}`));
        }
        const req_header = document.createElement('div'); req_header.className = 'section-header'; req_header.textContent = 'Required'; list.appendChild(req_header);
        const required = bp.required || [];
        for (const req of required) {
            const item_id = req.item; const qty = req.quantity || 0;
            if (appState.blueprints[item_id]) {
                const intermediate = appState.blueprints[item_id]; const div = document.createElement('div'); div.className = 'detail-item'; div.innerHTML = `<div>${intermediate.name || item_id} x${qty} (intermediate)</div>`; list.appendChild(div);
                for (const sub_req of (intermediate.required || [])) {
                    const sub_id = sub_req.item; const sub_qty = (sub_req.quantity || 0) * qty; const res = appState.resources[sub_id] || {}; const loc = appState.format_location(res.location); const sub_div = document.createElement('div'); sub_div.className = 'nested-requirement'; sub_div.innerHTML = `<div>${res.name || sub_id} x${sub_qty} (${loc})</div>`; list.appendChild(sub_div);
                }
            } else {
                const res = appState.resources[item_id] || {}; const loc = appState.format_location(res.location); const div = document.createElement('div'); div.className = 'detail-item'; div.innerHTML = `<div>${res.name || item_id} x${qty} (${loc})</div>`; list.appendChild(div);
            }
        }
    },
    render_resources() {
        const list = document.getElementById('resources-list'); list.innerHTML = '';
        const totals = appState.compute_totals();
        if (!totals.resources || Object.keys(totals.resources).length === 0) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No items in queue'; list.appendChild(empty); return; }
        if (totals.gratitude > 0) {
            const gratitudeHeader = document.createElement('div'); gratitudeHeader.className = 'section-header'; gratitudeHeader.textContent = `Total Gratitude Cost: 😊 ${totals.gratitude}`; list.appendChild(gratitudeHeader);
        }
        const items = Object.entries(totals.resources).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [res_id, required] of items) {
            const res = appState.resources[res_id] || {}; const loc = appState.format_location(res.location); const collected = appState.resource_tracker[res_id] || 0;
            const div = document.createElement('div'); div.className = 'resource-row';
            div.innerHTML = `
            <div class="resource-info">
                <div class="resource-name">${res.name || res_id}</div>
                <div class="resource-location">(${loc})</div>
            </div>
            <div class="resource-counter">
                <button class="counter-btn" onclick="appState.decrement('${res_id}'); ui.render_resources()">−</button>
                <div class="counter-label">${collected}/${required}</div>
                <button class="counter-btn" onclick="appState.increment('${res_id}'); ui.render_resources()">+</button>
                <button class="counter-btn" onclick="ui.prompt_set('${res_id}', ${required})">✎</button>
                <button class="counter-btn" onclick="appState.clear_count('${res_id}'); ui.render_resources()">✕</button>
            </div>`;
            list.appendChild(div);
        }
    },
    render_about() {
        const content = document.getElementById('about-content');
        content.innerHTML = `
            <h1 class="about-title">${CONFIG.app_name}</h1>
            <h2 class="about-subtitle">Young Suns Companion (Unofficial)</h2>
            <p class="about-text">Whilst this companion app was created and developed by Oakshift Software, the underlying game (and its content) are the intellectual property of the wonderful developers at KO_OP. This app is not officially affiliated with or endorsed by them.</p>
            <br />
            <p class="about-text">Any and all trademarks, game content and direct game references belong to their respective owners. This application should be considered fan-made and is provided as-is without warranty of any kind.</p>
            <br />
            <p class="about-text">An Android application version is also available, and can be found on Oakshift Software's GitHub Releases (<a href="https://github.com/oakshiftsoftware/Sundog-Tracker/releases/tag/YSC-V6" target="_blank" rel="noopener noreferrer">Sundog Tracker - Version 0.0.6</a>). You can find the game itself on the <a href="https://www.xbox.com/en-gb/games/store/young-suns-game-preview/9N3KQH8183GD" target="_blank" rel="noopener noreferrer">Xbox Store</a>.</p>
            <div class="about-version">Version ${CONFIG.app_version} by ${CONFIG.app_author} (Jamie Harper)</div>`;
    },
    prompt_set(res_id, required) {
        const current = appState.resource_tracker[res_id] || 0; const overlay = document.getElementById('modal-overlay'); const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-header">Set Collected</div>
            <div class="modal-content"><div class="input-group"><input type="number" id="modal-input" min="0" value="${current}" /></div></div>
            <div class="modal-buttons"><button class="btn btn-secondary" onclick="ui.close_modal()">Cancel</button><button class="btn btn-primary" onclick="ui.save_modal_input('${res_id}')">Save</button></div>`;
        overlay.classList.add('active'); document.getElementById('modal-input').focus();
    },
    save_modal_input(res_id) { const input = document.getElementById('modal-input'); const val = Math.max(0, parseInt(input.value) || 0); appState.resource_tracker[res_id] = val; appState.save_tracker(); this.close_modal(); this.render_resources(); },
    close_modal() { document.getElementById('modal-overlay').classList.remove('active'); }
};

appState.add_to_build_queue = function (bp_id) { if (!this.build_queue.includes(bp_id)) { this.build_queue.push(bp_id); this.save_queue(); } };
appState.remove_from_build_queue = function (bp_id) { this.build_queue = this.build_queue.filter(id => id !== bp_id); this.save_queue(); };
appState.increment = function (res_id) { this.resource_tracker[res_id] = (this.resource_tracker[res_id] || 0) + 1; this.save_tracker(); };
appState.decrement = function (res_id) { const current = this.resource_tracker[res_id] || 0; if (current > 0) { this.resource_tracker[res_id] = current - 1; this.save_tracker(); } };
appState.clear_count = function (res_id) { this.resource_tracker[res_id] = 0; this.save_tracker(); };

const ui = UI;
const app = UI;

async function init_app() {
    const dataService = new DataService(); appState.load_cached();
    const bp = await dataService.get_json('blueprints'); const rs = await dataService.get_json('resources');
    if (bp) appState.blueprints = bp; if (rs) appState.resources = rs;
    UI.render_screen('queue');
    document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') UI.close_modal(); });
    dataService.fetch_and_cache('blueprints').then(bp => { if (bp) appState.blueprints = bp; UI.render_screen(appState.current_screen); });
    dataService.fetch_and_cache('resources').then(rs => { if (rs) appState.resources = rs; UI.render_screen(appState.current_screen); });
    init_three_background();
}

function init_three_background() {
    if (!window.THREE) return;
    const canvas = document.getElementById('bg-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 5;

    const geometry = new THREE.IcosahedronGeometry(2, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x4a148c, emissive: 0x2a0845, metalness: 0.3, roughness: 0.5 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const light1 = new THREE.PointLight(0xff6f00, 1, 20); light1.position.set(5, 3, 5); scene.add(light1);
    const light2 = new THREE.PointLight(0xffffff, 0.4, 20); light2.position.set(-5, -3, -5); scene.add(light2);

    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize(); window.addEventListener('resize', resize);

    let t = 0; function animate() {
        t += 0.01; mesh.rotation.x += 0.003; mesh.rotation.y += 0.004;
        mesh.position.y = Math.sin(t) * 0.1; renderer.render(scene, camera); requestAnimationFrame(animate);
    }
    animate();
}

document.addEventListener('DOMContentLoaded', init_app);