// Vegetable Stock — frontend. Talks only to the /api routes; all shared
// state lives in the server KV store, so every visitor sees the same stock.
(function () {
  'use strict';

  var state = { items: [], sales: [], date: '', month: '', year: '' };

  function $(id) { return document.getElementById(id); }

  function formatMinor(item) {
    if (item.unit === 'piece') {
      return item.stock === 1 ? '1 pc' : item.stock + ' pcs';
    }
    var g = item.stock;
    if (g >= 1000) {
      var kg = g / 1000;
      var text = Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 1000) / 1000);
      return text + ' kg';
    }
    return g + ' g';
  }

  function isLow(item) {
    return item.stock > 0 && item.stock <= (item.unit === 'kg' ? 5000 : 5);
  }
  function isFinished(item) { return item.stock === 0; }

  function money(n) {
    return '৳' + (Math.round(n * 100) / 100);
  }

  function showError(msg) {
    var el = $('errorBanner');
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.classList.remove('hidden');
    el.textContent = msg;
  }

  // ---------- password gate ----------
  // The password is kept for the browser tab only (sessionStorage) and
  // sent as the x-app-password header on every API call. It is never
  // stored anywhere else and never appears in the page itself.

  function getPassword() {
    try { return sessionStorage.getItem('appPassword') || ''; }
    catch (e) { return ''; }
  }
  function setPassword(pw) {
    try { sessionStorage.setItem('appPassword', pw); } catch (e) { /* ignore */ }
  }
  function clearPassword() {
    try { sessionStorage.removeItem('appPassword'); } catch (e) { /* ignore */ }
  }

  function showLogin(message) {
    $('loginScreen').classList.remove('hidden');
    $('appMain').classList.add('hidden');
    var err = $('loginError');
    if (message) { err.textContent = message; err.classList.remove('hidden'); }
    else { err.classList.add('hidden'); err.textContent = ''; }
    $('loginPassword').focus();
  }
  function hideLogin() {
    $('loginScreen').classList.add('hidden');
    $('appMain').classList.remove('hidden');
  }

  async function tryLogin() {
    var pw = $('loginPassword').value;
    if (!pw) { showLogin('Please enter the password.'); return; }
    setPassword(pw);
    $('loginPassword').value = '';
    hideLogin();
    await load();
  }

  async function api(path, method, body) {
    var opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-app-password': getPassword() },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var res = await fetch(path, opts);
    var data = {};
    try { data = await res.json(); } catch (e) { /* keep {} */ }
    if (!res.ok) {
      var err = new Error(data.error || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      if (res.status === 401) {
        clearPassword();
        showLogin(data.notConfigured ? data.error : 'Wrong password. Please try again.');
      }
      throw err;
    }
    return data;
  }

  // ---------- rendering ----------

  function render() {
    renderSummary();
    renderCards();
    renderSales();
  }

  function renderSummary() {
    var list = $('summaryList');
    var empty = $('summaryEmpty');
    var sorted = state.items.slice().sort(function (a, b) { return a.stock - b.stock; });
    if (!sorted.length) {
      empty.classList.remove('hidden');
      list.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');
    list.innerHTML = sorted.map(function (it) {
      var cls = isFinished(it) ? 'warn-out' : (isLow(it) ? 'warn-low' : '');
      var note = isFinished(it) ? 'Finished' : (isLow(it) ? 'Low stock!' : '');
      return '<li><span>' + esc(it.name) + '</span><span class="' + cls + '">' +
        esc(formatMinor(it)) + (note ? ' — ' + note : '') + '</span></li>';
    }).join('');
  }

  function renderCards() {
    var wrap = $('cards');
    var empty = $('listEmpty');
    $('itemCount').textContent = state.items.length
      ? state.items.length + (state.items.length === 1 ? ' vegetable' : ' vegetables')
      : '';
    if (!state.items.length) {
      empty.classList.remove('hidden');
      wrap.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');
    wrap.innerHTML = state.items.map(function (it) {
      var cls = isFinished(it) ? 'out' : (isLow(it) ? 'low' : '');
      var badge = isFinished(it)
        ? '<div class="warn-out">Finished — nothing left</div>'
        : (isLow(it) ? '<div class="warn-low">Low stock!</div>' : '');
      var priceLine = (it.price !== null && it.price !== undefined)
        ? '<div class="price-line">' + money(it.price) + (it.unit === 'kg' ? ' / kg' : ' / pc') + '</div>'
        : '';
      return '<div class="card ' + cls + '">' +
        '<h3>' + esc(it.name) + '</h3>' +
        '<div class="left-label">Left now</div>' +
        '<div class="big-left ' + cls + '">' + esc(formatMinor(it)) + '</div>' +
        badge + priceLine +
        '<div class="card-actions">' +
          '<button class="btn primary" data-act="sold" data-id="' + it.id + '">Sold</button>' +
          '<button class="btn" data-act="restock" data-id="' + it.id + '">Stock added</button>' +
          '<button class="btn" data-act="edit" data-id="' + it.id + '">Edit</button>' +
          '<button class="btn danger" data-act="delete" data-id="' + it.id + '">Delete</button>' +
        '</div></div>';
    }).join('');
    wrap.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var it = state.items.find(function (x) { return x.id === btn.dataset.id; });
        if (!it) return;
        if (btn.dataset.act === 'sold') openSold(it);
        if (btn.dataset.act === 'restock') openRestock(it);
        if (btn.dataset.act === 'edit') openEdit(it);
        if (btn.dataset.act === 'delete') deleteItem(it);
      });
    });
  }

  function monthOf(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function dateOf(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  function yearOf(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return String(d.getFullYear());
  }

  function renderSales() {
    var list = $('salesList');
    var empty = $('salesEmpty');
    // One filter is active at a time: an exact date wins over a month,
    // and a month wins over a whole year.
    var shown = state.sales;
    var emptyText = 'No sales yet.';
    if (state.date) {
      shown = state.sales.filter(function (s) { return dateOf(s.at) === state.date; });
      emptyText = 'No sales on this date.';
    } else if (state.month) {
      shown = state.sales.filter(function (s) { return monthOf(s.at) === state.month; });
      emptyText = 'No sales in this month.';
    } else if (state.year) {
      shown = state.sales.filter(function (s) { return yearOf(s.at) === state.year; });
      emptyText = 'No sales in this year.';
    }
    if (!shown.length) {
      empty.textContent = emptyText;
      empty.classList.remove('hidden');
      list.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');
    list.innerHTML = shown.map(function (s) {
      var when = new Date(s.at).toLocaleString();
      var price = (s.totalPrice !== null && s.totalPrice !== undefined)
        ? ' — ' + money(s.totalPrice) : '';
      return '<li><span>' + esc(s.itemName) + ' — sold ' + esc(s.qtyText) + price +
        '</span><span><span class="muted">' + esc(when) + '</span> ' +
        '<button class="btn danger sale-del" data-sale-id="' + esc(s.id) +
        '" title="Delete this sale">×</button></span></li>';
    }).join('');
    list.querySelectorAll('[data-sale-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sale = state.sales.find(function (x) { return x.id === btn.dataset.saleId; });
        if (sale) deleteSale(sale);
      });
    });
  }

  async function deleteSale(sale) {
    if (!window.confirm('Delete this sale of ' + sale.itemName + ' (' + sale.qtyText +
      ')? The sold quantity will be added back to its stock.')) return;
    try {
      var result = await api('/api/sales', 'DELETE', { id: sale.id });
      await load();
      if (!result.stockRestored) {
        showError('Sale deleted, but its quantity could not be added back to stock ' +
          '(the vegetable may no longer exist).');
      }
    } catch (err) {
      if (err.status !== 401) showError(err.message);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- modal ----------

  var modalConfirmHandler = null;
  function openModal(title, bodyHtml, onConfirm, confirmLabel) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    $('modalError').classList.add('hidden');
    $('modalError').textContent = '';
    $('modalConfirm').textContent = confirmLabel || 'Confirm';
    modalConfirmHandler = onConfirm;
    $('modalBackdrop').classList.remove('hidden');
  }
  function closeModal() {
    $('modalBackdrop').classList.add('hidden');
    modalConfirmHandler = null;
  }
  $('modalCancel').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', function (e) {
    if (e.target === $('modalBackdrop')) closeModal();
  });
  $('modalConfirm').addEventListener('click', async function () {
    if (!modalConfirmHandler) return;
    $('modalError').classList.add('hidden');
    $('modalConfirm').disabled = true;
    try {
      await modalConfirmHandler();
      closeModal();
    } catch (err) {
      if (err.status === 401) { closeModal(); return; }
      var el = $('modalError');
      el.textContent = err.message;
      el.classList.remove('hidden');
    } finally {
      $('modalConfirm').disabled = false;
    }
  });

  // ---------- quantity field (kg/g switch + chips, or pieces) ----------

  // Returns { html, bind(previewFn) } for a quantity input.
  function qtyField(item, prefix) {
    if (item.unit === 'piece') {
      return {
        html:
          '<div class="field"><label>How many pieces?</label>' +
          '<input id="' + prefix + 'Qty" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 3" />' +
          '<div class="chips">' +
            [1, 2, 5, 10].map(function (n) {
              return '<button type="button" class="chip" data-q="' + n + '">' + n + '</button>';
            }).join('') +
          '</div></div>',
        bind: function (onChange) {
          var input = $(prefix + 'Qty');
          document.querySelectorAll('#modalBody .chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
              input.value = chip.dataset.q;
              onChange();
            });
          });
          input.addEventListener('input', onChange);
        },
        read: function () {
          return { qty: $(prefix + 'Qty').value, qtyUnit: 'piece' };
        },
      };
    }
    return {
      html:
        '<div class="field"><label>Quantity</label>' +
        '<div class="unit-toggle">' +
          '<button type="button" class="btn" id="' + prefix + 'KgBtn">kg</button>' +
          '<button type="button" class="btn active" id="' + prefix + 'GBtn">g (gram)</button>' +
        '</div></div>' +
        '<div class="field"><input id="' + prefix + 'Qty" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 250" />' +
        '<div class="chips">' +
          '<button type="button" class="chip" data-q="100" data-u="g">100 g</button>' +
          '<button type="button" class="chip" data-q="250" data-u="g">250 g</button>' +
          '<button type="button" class="chip" data-q="500" data-u="g">500 g</button>' +
          '<button type="button" class="chip" data-q="750" data-u="g">750 g</button>' +
          '<button type="button" class="chip" data-q="1" data-u="kg">1 kg</button>' +
        '</div></div>',
      bind: function (onChange) {
        var kgBtn = $(prefix + 'KgBtn');
        var gBtn = $(prefix + 'GBtn');
        var input = $(prefix + 'Qty');
        var unit = 'g';
        function setUnit(u) {
          unit = u;
          kgBtn.classList.toggle('active', u === 'kg');
          gBtn.classList.toggle('active', u === 'g');
          onChange();
        }
        kgBtn.addEventListener('click', function () { setUnit('kg'); });
        gBtn.addEventListener('click', function () { setUnit('g'); });
        document.querySelectorAll('#modalBody .chip').forEach(function (chip) {
          chip.addEventListener('click', function () {
            input.value = chip.dataset.q;
            setUnit(chip.dataset.u);
          });
        });
        input.addEventListener('input', onChange);
        this.getUnit = function () { return unit; };
      },
      read: function () {
        var unit = 'g';
        var gBtn = $(prefix + 'GBtn');
        if (gBtn && !gBtn.classList.contains('active')) unit = 'kg';
        return { qty: $(prefix + 'Qty').value, qtyUnit: unit };
      },
    };
  }

  function minorFrom(qty, qtyUnit, item) {
    var n = Number(qty);
    if (!Number.isFinite(n)) return NaN;
    if (item.unit === 'kg') return qtyUnit === 'kg' ? Math.round(n * 1000) : Math.round(n);
    return Math.round(n);
  }

  // ---------- flows ----------

  function openAdd() {
    var body =
      '<div class="field"><label>Vegetable name</label>' +
      '<input id="addName" type="text" placeholder="e.g. Potol" /></div>' +
      '<div class="field"><label>Unit</label>' +
      '<select id="addUnit"><option value="kg">kg (sold by weight)</option>' +
      '<option value="piece">piece</option></select></div>' +
      '<div class="field"><label>Starting stock</label>' +
      '<input id="addQty" type="number" min="0" step="any" placeholder="e.g. 40" />' +
      '<span class="muted" id="addQtyHint">For kg items enter kg (e.g. 40). For piece items enter pieces.</span></div>' +
      '<div class="field"><label>Price (optional)</label>' +
      '<input id="addPrice" type="number" min="0" step="any" placeholder="per kg or per piece, leave blank if none" /></div>';
    openModal('Add vegetable', body, async function () {
      var name = $('addName').value.trim();
      var unit = $('addUnit').value;
      var qty = $('addQty').value;
      if (!name) throw new Error('Please enter a vegetable name.');
      if (qty === '' || Number(qty) < 0) throw new Error('Please enter a starting stock of 0 or more.');
      var payload = { name: name, unit: unit, qty: qty, qtyUnit: unit === 'kg' ? 'kg' : 'piece' };
      var price = $('addPrice').value;
      if (price !== '') payload.price = price;
      await api('/api/items', 'POST', payload);
      await load();
    }, 'Add');
  }

  function openEdit(item) {
    var stockText = item.unit === 'kg' ? (item.stock / 1000) : item.stock;
    var body =
      '<div class="field"><label>Vegetable name</label>' +
      '<input id="editName" type="text" value="' + esc(item.name) + '" /></div>' +
      '<div class="field"><label>Stock (' + (item.unit === 'kg' ? 'kg' : 'pieces') + ')</label>' +
      '<input id="editQty" type="number" min="0" step="any" value="' + stockText + '" /></div>' +
      '<div class="field"><label>Price (optional, blank = none)</label>' +
      '<input id="editPrice" type="number" min="0" step="any" value="' +
        (item.price !== null && item.price !== undefined ? item.price : '') + '" /></div>';
    openModal('Edit ' + item.name, body, async function () {
      var name = $('editName').value.trim();
      if (!name) throw new Error('Please enter a vegetable name.');
      var payload = {
        name: name,
        qty: $('editQty').value,
        qtyUnit: item.unit === 'kg' ? 'kg' : 'piece',
        price: $('editPrice').value === '' ? null : $('editPrice').value,
      };
      await api('/api/items/' + encodeURIComponent(item.id), 'PUT', payload);
      await load();
    }, 'Save');
  }

  async function deleteItem(item) {
    if (!window.confirm('Delete ' + item.name + '? Its sales history will stay.')) return;
    try {
      await api('/api/items/' + encodeURIComponent(item.id), 'DELETE');
      await load();
    } catch (err) {
      if (err.status !== 401) showError(err.message);
    }
  }

  function openSold(item) {
    var qf = qtyField(item, 'sold');
    var body = qf.html +
      '<div class="preview" id="soldPreview"></div>';
    openModal('Sold: ' + item.name, body, async function () {
      var v = qf.read();
      if (v.qty === '' || Number(v.qty) <= 0) throw new Error('Please enter a quantity more than 0.');
      var amount = minorFrom(v.qty, v.qtyUnit, item);
      if (amount > item.stock) throw new Error('That is more than you have — only ' + formatMinor(item) + ' left.');
      await api('/api/sell', 'POST', { id: item.id, qty: v.qty, qtyUnit: v.qtyUnit });
      await load();
    }, 'Confirm sale');
    var preview = $('soldPreview');
    function update() {
      var v = qf.read();
      var amount = minorFrom(v.qty, v.qtyUnit, item);
      if (v.qty === '' || !Number.isFinite(amount) || amount < 0) {
        preview.innerHTML = '<span class="muted">Enter a quantity to see the result.</span>';
        return;
      }
      var left = item.stock - amount;
      var leftText = left < 0
        ? 'Too much! Only ' + formatMinor(item) + ' left.'
        : formatMinor({ unit: item.unit, stock: left });
      var priceLine = '';
      if (item.price !== null && item.price !== undefined) {
        var units = item.unit === 'kg' ? amount / 1000 : amount;
        priceLine = '<div>Total price: ' + money(Math.round(units * item.price * 100) / 100) + '</div>';
      }
      var eq = item.unit === 'kg'
        ? '<div>= ' + (v.qtyUnit === 'kg' ? v.qty + ' kg' : (Number(v.qty) / 1000) + ' kg') + '</div>'
        : '';
      preview.innerHTML = eq + priceLine +
        '<div>Left after this sale:</div>' +
        '<div class="left-after ' + (left < 0 ? 'bad' : '') + '">' + esc(leftText) + '</div>';
    }
    qf.bind(update);
    update();
  }

  function openRestock(item) {
    var qf = qtyField(item, 'rs');
    var body = qf.html + '<div class="preview" id="rsPreview"></div>';
    openModal('Stock added: ' + item.name, body, async function () {
      var v = qf.read();
      if (v.qty === '' || Number(v.qty) <= 0) throw new Error('Please enter a quantity more than 0.');
      await api('/api/restock', 'POST', { id: item.id, qty: v.qty, qtyUnit: v.qtyUnit });
      await load();
    }, 'Add stock');
    var preview = $('rsPreview');
    function update() {
      var v = qf.read();
      var amount = minorFrom(v.qty, v.qtyUnit, item);
      if (v.qty === '' || !Number.isFinite(amount) || amount < 0) {
        preview.innerHTML = '<span class="muted">Enter a quantity to see the result.</span>';
        return;
      }
      preview.innerHTML = '<div>New stock will be:</div>' +
        '<div class="left-after">' + esc(formatMinor({ unit: item.unit, stock: item.stock + amount })) + '</div>';
    }
    qf.bind(update);
    update();
  }

  // ---------- load ----------

  async function load() {
    if (!getPassword()) { showLogin(); return; }
    try {
      showError('');
      var itemsData = await api('/api/items');
      state.items = itemsData.items || [];
      try {
        var salesData = await api('/api/sales?all=1');
        state.sales = salesData.sales || [];
      } catch (e) {
        state.sales = [];
      }
      render();
    } catch (err) {
      if (err.status === 401) { render(); return; } // login screen already shown
      showError(err.message);
      render();
    }
  }

  $('addBtn').addEventListener('click', openAdd);
  $('refreshBtn').addEventListener('click', load);
  $('salesRefreshBtn').addEventListener('click', load);
  // The three filters are single-active: picking one clears the others,
  // so the list never mixes two different selections.
  function clearFilters() {
    state.date = '';
    state.month = '';
    state.year = '';
    $('dateFilter').value = '';
    $('monthFilter').value = '';
    $('yearFilter').value = '';
  }
  $('dateFilter').addEventListener('change', function () {
    clearFilters();
    state.date = $('dateFilter').value;
    renderSales();
  });
  $('monthFilter').addEventListener('change', function () {
    clearFilters();
    state.month = $('monthFilter').value;
    renderSales();
  });
  $('yearFilter').addEventListener('change', function () {
    clearFilters();
    state.year = $('yearFilter').value;
    renderSales();
  });
  $('monthClear').addEventListener('click', function () {
    clearFilters();
    renderSales();
  });
  $('monthThis').addEventListener('click', function () {
    clearFilters();
    var now = new Date();
    state.month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    $('monthFilter').value = state.month;
    renderSales();
  });
  $('dateToday').addEventListener('click', function () {
    clearFilters();
    var now = new Date();
    state.date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') +
      '-' + String(now.getDate()).padStart(2, '0');
    $('dateFilter').value = state.date;
    renderSales();
  });
  // Fill the year dropdown (2024 through next year).
  (function fillYears() {
    var sel = $('yearFilter');
    var thisYear = new Date().getFullYear();
    for (var y = 2024; y <= thisYear + 1; y++) {
      var opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      sel.appendChild(opt);
    }
  })();
  $('loginBtn').addEventListener('click', tryLogin);
  $('loginPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryLogin();
  });

  if (getPassword()) { hideLogin(); load(); } else { showLogin(); }
  setInterval(function () { if (getPassword()) load(); }, 30000); // keep the board fresh
})();
