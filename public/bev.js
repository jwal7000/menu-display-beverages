/**
 * bev.js — Five Daughters Bakery Beverage Menu Display
 * Fetches ./data/bev-{loc}.json and renders a 4-column horizontal layout.
 * Refreshes every 5 minutes.
 */

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const params     = new URLSearchParams(window.location.search);
  const LOC        = params.get('loc') || 'the-gulch';
  const BEV_PATH   = `./data/bev-${LOC}.json`;
  const ADD_PATH   = './addons.json';
  // Real-time availability overrides — written by admin page, read directly from
  // the raw GitHub URL so changes propagate within minutes without a full deploy.
  const OVERRIDES_URL = `https://raw.githubusercontent.com/jwal7000/menu-display-beverages/main/public/overrides-${LOC}.json`;
  const REFRESH    = 5 * 60 * 1000;  // 5 minutes (full menu)
  const OV_REFRESH = 60 * 1000;      // 1 minute  (availability overrides)

  // Section → column index (0-3)
  const SECTION_COL = {
    'ESPRESSO':         0,
    'COFFEE + NITRO':   0,
    'NON ESPRESSO':     1,
    'SEASONAL DRINKS':  2,
    'ADD-ONS':          2,
    'OTHER DRINKS':     3,
    'JUICES (12oz)':    3,
  };

  // ── Element refs ────────────────────────────────────────────────────────────
  const locationEl       = document.getElementById('location-name');
  const footerLocationEl = document.getElementById('footer-location');
  const footerEl         = document.getElementById('footer-updated');
  const columns          = [0,1,2,3].map(i => document.getElementById(`col-${i}`));

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls)  e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Render item row ──────────────────────────────────────────────────────────
  function renderItem(item) {
    // Apply real-time override: item in sold-out set → unavailable; else use config
    const available = overridesData.has(item.name) ? false : (item.available !== false);
    const row   = el('div', `item-row${available === false ? ' unavailable' : ''}`);
    const name  = el('span', 'item-name', item.name);
    const lead  = el('span', 'item-leader');
    const price = el('span', 'item-price', item.price || '');
    row.append(name, lead, price);
    return row;
  }

  // ── Render temperature sub-label ─────────────────────────────────────────────
  function renderTempLabel(text) {
    return el('div', 'temp-label', text);
  }

  // ── Render section ───────────────────────────────────────────────────────────
  function renderSection(sec) {
    const card   = el('div', 'section-card');
    const hdrDiv = el('div', 'section-header');
    const title  = el('h2',  'section-name', sec.name);
    hdrDiv.appendChild(title);
    card.appendChild(hdrDiv);

    const body = el('div', 'section-body');

    // Top-level temp_label (e.g. ESPRESSO → HOT OR ICED)
    if (sec.temp_label) body.appendChild(renderTempLabel(sec.temp_label));

    // Direct items
    if (sec.items && sec.items.length) {
      sec.items.forEach(item => body.appendChild(renderItem(item)));
    }

    // Sub-sections (NON ESPRESSO)
    if (sec.sub_sections) {
      sec.sub_sections.forEach(sub => {
        if (sub.temp_label) body.appendChild(renderTempLabel(sub.temp_label));
        (sub.items || []).forEach(item => body.appendChild(renderItem(item)));
      });
    }

    card.appendChild(body);
    return card;
  }

  // ── Render add-ons static block ──────────────────────────────────────────────
  function renderAddons(addons) {
    const wrap   = el('div', 'section-card addons-section');
    const hdrDiv = el('div', 'section-header');
    const hdr    = el('h2',  'section-name', 'ADD-ONS');
    hdrDiv.appendChild(hdr);
    wrap.appendChild(hdrDiv);
    const body = el('div', 'section-body');
    wrap.appendChild(body);

    // Milk
    const milkGroup = el('div', 'addons-group');
    milkGroup.appendChild(renderTempLabel(addons.milk.label));
    const milkItems = el('div', 'addons-items');
    addons.milk.items.forEach(item => {
      const row = renderItem({ name: item.name, price: item.price, available: true });
      milkItems.appendChild(row);
    });
    milkGroup.appendChild(milkItems);
    body.appendChild(milkGroup);

    // Syrups
    const syrGroup = el('div', 'addons-group');
    syrGroup.appendChild(renderTempLabel(addons.syrups.label));
    const priceNote = el('div', 'price-note', addons.syrups.price_note);
    syrGroup.appendChild(priceNote);
    const syrItems = el('div', 'addons-items addons-syrups');
    addons.syrups.items.forEach(name => {
      const span = el('span', '', name);
      syrItems.appendChild(span);
    });
    syrGroup.appendChild(syrItems);
    body.appendChild(syrGroup);

    return wrap;
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  let addonsData    = null;
  let overridesData = new Set(); // set of sold-out item names

  async function fetchOverrides() {
    try {
      const res = await fetch(OVERRIDES_URL + '?t=' + Date.now());
      if (res.ok) {
        const d   = await res.json();
        const now = Date.now();

        // Indefinite sold out — always apply
        const indefinite = new Set(Array.isArray(d.sold_out_indefinite) ? d.sold_out_indefinite : []);

        // Today-only sold out — only apply if not past midnight
        const todayExpiry = d.sold_out_today_expires ? new Date(d.sold_out_today_expires).getTime() : 0;
        const todaySet    = (Array.isArray(d.sold_out_today) && now < todayExpiry)
          ? new Set(d.sold_out_today)
          : new Set();

        overridesData = new Set([...indefinite, ...todaySet]);
        if (overridesData.size) {
          console.log('[bev] overrides active:', [...overridesData]);
        }
      }
    } catch (_) { /* silently keep previous overrides */ }
  }

  async function render() {
    // Fetch addons if not loaded
    if (!addonsData) {
      try {
        const res = await fetch(ADD_PATH + '?t=' + Date.now());
        if (res.ok) addonsData = await res.json();
      } catch (_) { /* ignore */ }
    }

    // Fetch beverage data
    const res = await fetch(BEV_PATH + '?t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();

    // Set location name (matching pastry menu format)
    const locName = data.location_name || '';
    if (locationEl)       locationEl.textContent       = locName ? 'Five Daughters Bakery: ' + locName : '';
    if (footerLocationEl) footerLocationEl.textContent = locName;

    // Clear columns
    columns.forEach(col => { if (col) col.innerHTML = ''; });

    // Render sections into columns
    for (const sec of (data.sections || [])) {
      const colIdx = SECTION_COL[sec.name] ?? 3;
      const col = columns[colIdx];
      if (!col) continue;

      if (sec.name === 'ADD-ONS') {
        if (addonsData) col.appendChild(renderAddons(addonsData));
      } else {
        col.appendChild(renderSection(sec));
      }
    }

    // Inject ADD-ONS if not in sections list
    const hasAddons = (data.sections || []).some(s => s.name === 'ADD-ONS');
    if (!hasAddons && addonsData && columns[2]) {
      columns[2].appendChild(renderAddons(addonsData));
    }

    // Update footer timestamp
    if (footerEl) {
      footerEl.textContent = data.generated_at ? 'Last updated ' + formatTime(data.generated_at) : '';
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  fetchOverrides().then(() => render()).catch(() => {});
  setInterval(() => render().catch(() => {}),         REFRESH);
  setInterval(() => fetchOverrides().catch(() => {}), OV_REFRESH);

})();
