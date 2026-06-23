// ==================== ADMIN-CREDITS.JS - MIXMAX MINIMARKET ====================
async function loadCreditsPage(c) {
    creditsPeriod = 'all'; creditsSearch = '';
    window.creditSelectionMode = false; window.creditSelectedIndex = -1;
    creditPaymentAmount = 0; creditPaymentStep = 'idle';
    if (!sortOrders.credits) sortOrders.credits = {}; if (!sortOrders.credits.createdAt) { sortOrders.credits.createdAt = 'desc'; }
    
    if (!window.posAllClients || window.posAllClients.length === 0) {
        try {
            const snap = await db.collection('clients').limit(500).get();
            window.posAllClients = [];
            snap.forEach(function(d) {
                var data = d.data();
                window.posAllClients.push({ id: d.id, nom: data.nom || '', prenom: data.prenom || '', telephone: data.telephone || '', description: data.description || '' });
            });
            console.log('✅ Clients chargés:', window.posAllClients.length);
        } catch(e) { console.error('Erreur chargement clients:', e); }
    }
    
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-credit-card"></i> Crédits</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<div style="position:relative;">' +
        '<input type="text" id="creditsSearchInput" placeholder="🔍 Rechercher (client)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="searchClientInCreditsDropdown(this.value)" onfocus="searchClientInCreditsDropdown(this.value)" autocomplete="off">' +
        '<div id="creditsClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;z-index:50;box-shadow:0 5px 15px rgba(0,0,0,0.1);"></div>' +
        '</div>' +
        '<input type="text" id="creditsVoiceDisplay" placeholder="🎤 Audio..." style="padding:8px 12px; border:2px solid #16a34a; border-radius:8px; width:180px; background:#f0fdf4; color:#14532d; font-weight:600;" readonly>' +
        '<select id="creditsPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="creditsPeriod = this.value; currentPages.credits=1; applyCreditsFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadCredits()"><i class="fas fa-sync"></i> Actualiser</button></div></div>' +
        '<div id="creditPaymentZone" style="display:none; background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:12px 16px; margin-bottom:15px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">' +
        '<div><strong>💳 Paiement en cours</strong><br><span id="creditPaymentInfo" style="font-size:0.85rem; color:#14532d;">Aucun crédit sélectionné</span></div>' +
        '<div style="display:flex; align-items:center; gap:10px;"><label style="font-weight:600; font-size:0.9rem;">Montant :</label>' +
        '<input type="number" id="creditPaymentAmountInput" placeholder="0.00" step="0.01" style="width:120px; padding:6px 10px; border:2px solid #16a34a; border-radius:8px; font-size:0.9rem;" onfocus="this.select();">' +
        '<button class="btn-save" onclick="validateCreditPayment()" style="padding:6px 14px; font-size:0.85rem; margin:0;"><i class="fas fa-check"></i> Valider</button>' +
        '<button class="btn-cancel" onclick="closeCreditSelection()" style="padding:6px 14px; font-size:0.85rem; margin:0;">Annuler</button></div></div></div>' +
        '<div id="creditsTableContainer"></div><div id="creditsPagination" style="margin-top:10px;"></div></div>';
    loadCredits();
}

async function loadCredits() {
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var vendeurCaissier = ''; if (!isAdmin && window.currentUserData) { vendeurCaissier = window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom; }
    try {
        const snapshot = await db.collection('credits').orderBy('createdAt', 'desc').limit(2000).get();
        allCreditsData = []; snapshot.forEach(dc => { var d = dc.data(); d.id = dc.id; allCreditsData.push(d); });
        if (!isAdmin) { allCreditsData = allCreditsData.filter(function(d) { return d.vendeur === vendeurCaissier; }); }
        if (!sortOrders.credits) sortOrders.credits = {}; if (!sortOrders.credits.createdAt) { sortOrders.credits.createdAt = 'desc'; }
    } catch (e) { console.error('Erreur chargement crédits:', e); }
    currentPages.credits = 1; applyCreditsFilters();
}

function applyCreditsFilters() {
    var filtered = filterByPeriod(allCreditsData, creditsPeriod);
    if (creditsSearch && creditsSearch.trim() !== '') {
        var q = creditsSearch.toLowerCase().trim();
        var clientsByName = {};
        if (window.posAllClients) { window.posAllClients.forEach(function(c) { var key = (c.nom + ' ' + c.prenom).toLowerCase().trim(); clientsByName[key] = c.description || ''; }); }
        filtered = filtered.filter(function(credit) {
            if ((credit.clientName || '').toLowerCase().indexOf(q) !== -1) return true;
            var creditName = (credit.clientName || '').toLowerCase().trim();
            var desc = clientsByName[creditName] || '';
            if (desc && desc.toLowerCase().indexOf(q) !== -1) return true;
            return false;
        });
    }
    if (!sortOrders.credits || !sortOrders.credits.createdAt) { filtered.sort(function(a, b) { var da = a.createdAt?.seconds || 0; var db = b.createdAt?.seconds || 0; return db - da; }); }
    else { filtered = applySort('credits', filtered, 'createdAt'); }
    window.filteredCredits = filtered; renderCreditsTable();
}

function renderCreditsTable() {
    var cont = document.getElementById('creditsTableContainer'); if (!cont) return;
    var data = (window.filteredCredits || allCreditsData).slice();
    if (sortOrders.credits && sortOrders.credits.createdAt) { data = applySort('credits', data, 'createdAt'); }
    else { data.sort(function(a, b) { var da = a.createdAt?.seconds || 0; var db = b.createdAt?.seconds || 0; return db - da; }); }
    var pageData = getPageData('credits', data);
    if (pageData.length === 0) { cont.innerHTML = '<p style="text-align:center;padding:40px;">Aucun crédit trouvé</p>'; document.getElementById('creditsPagination').innerHTML = ''; return; }
    var tc = 0;
    var h = '<div class="table-container"><table class="data-table" style="font-size:0.55rem;"><thead><tr>' +
        makeSortableHeader('credits', 'factureNum', 'Facture', 'renderCreditsTable') + makeSortableHeader('credits', 'createdAt', 'Date', 'renderCreditsTable') +
        makeSortableHeader('credits', 'clientName', 'Client', 'renderCreditsTable') + makeSortableHeader('credits', 'total', 'Total', 'renderCreditsTable') +
        makeSortableHeader('credits', 'amountGiven', 'Payé', 'renderCreditsTable') + makeSortableHeader('credits', 'remainingAmount', 'Restant', 'renderCreditsTable') +
        makeSortableHeader('credits', 'paymentMethod', 'Mode', 'renderCreditsTable') + makeSortableHeader('credits', 'vendeur', 'Vendeur', 'renderCreditsTable') + '<th>Actions</th>';
    if (window.creditSelectionMode) { h += '<th style="width:40px;">✅</th>'; }
    h += '</thead><tbody>';
    pageData.forEach(function(d, index) {
        var reste = d.remainingAmount || d.total || 0; if (!d.paid) tc += reste;
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var amountPaid = d.amountGiven || 0; var mode = d.paymentMethod || '-';
        var actions = '<button class="btn-edit" onclick="printFacture(\'' + d.id + '\')"><i class="fas fa-print"></i></button> ';
        if (!d.paid) actions += '<button class="btn-add" style="padding:4px 8px;font-size:0.65rem;" onclick="markCreditPaid(\'' + d.id + '\')">Payer</button> ';
        var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
        if (isAdmin) { actions += '<button class="btn-edit" onclick="editCredit(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteCredit(\'' + d.id + '\')"><i class="fas fa-trash"></i></button>'; }
        var isSelected = (window.creditSelectedIndex === index);
        var rowClass = isSelected ? ' style="background:#fef3c7; border-left:4px solid #d97706;"' : '';
        h += '<tr' + rowClass + '><td>' + (d.factureNum || d.id.substring(0, 8)) + '</td><td>' + dt + '</td><td>' + escapeHtml(d.clientName || d.table || '-') + '</td><td>' + d.total.toFixed(2) + '</td><td>' + amountPaid.toFixed(2) + '</td><td style="color:#ef4444;"><strong>' + reste.toFixed(2) + '</strong></td><td>' + mode + '</td><td>' + escapeHtml(d.vendeur || '-') + '</td><td>' + actions + '</td>';
        if (window.creditSelectionMode) { var checked = isSelected ? 'checked' : ''; h += '<td><input type="checkbox" class="credit-select-check" data-index="' + index + '" ' + checked + ' onclick="toggleCreditCheckbox(' + index + ')"></td>'; }
        h += '</tr>';
    });
    h += '</tbody></div><div style="margin-top:15px;padding:15px;background:#fef2f2;border-radius:12px;text-align:center;"><strong>Impayés: ' + tc.toFixed(2) + ' MAD</strong></div>';
    cont.innerHTML = h; document.getElementById('creditsPagination').innerHTML = getPaginationHTML('credits', data.length);
    updateCreditPaymentZone();
}

function updateCreditPaymentZone() {
    var zone = document.getElementById('creditPaymentZone'); var info = document.getElementById('creditPaymentInfo');
    if (!zone || !info) return;
    if (window.creditSelectedIndex >= 0 && window.creditPaymentStep !== 'idle') {
        var data = window.filteredCredits || allCreditsData; var credit = data[window.creditSelectedIndex];
        if (credit) { var reste = credit.remainingAmount || credit.total || 0; info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD'; zone.style.display = 'block'; var input = document.getElementById('creditPaymentAmountInput'); if (input) { input.value = window.creditPaymentAmount > 0 ? window.creditPaymentAmount : ''; input.focus(); input.select(); } return; }
    }
    zone.style.display = 'none';
}

function toggleCreditCheckbox(index) {
    var data = window.filteredCredits || allCreditsData; if (index < 0 || index >= data.length) return;
    window.creditSelectedIndex = index; window.creditPaymentStep = 'selection'; window.creditPaymentAmount = 0;
    renderCreditsTable(); showVoiceResult('✅ Ligne ' + (index + 1) + ' sélectionnée');
}

function markCreditPaid(creditId) {
    var data = window.filteredCredits || allCreditsData || [];
    var index = data.findIndex(function(c) { return c.id === creditId; });
    if (index === -1) { alert('Crédit introuvable'); return; }
    window.creditSelectedIndex = index; window.creditPaymentStep = 'payment'; window.creditPaymentAmount = 0; window.creditSelectionMode = true;
    var zone = document.getElementById('creditPaymentZone'); var info = document.getElementById('creditPaymentInfo');
    if (zone) { zone.style.display = 'block'; var credit = data[index]; var reste = credit.remainingAmount || credit.total || 0; if (info) info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD'; var input = document.getElementById('creditPaymentAmountInput'); if (input) { input.value = ''; input.focus(); input.select(); } }
    renderCreditsTable();
}

// ✅ Dropdown + sélection automatique
function searchClientInCreditsDropdown(query) {
    var q = query.toLowerCase().trim();
    var dropdown = document.getElementById('creditsClientDropdown');
    if (!q || !window.posAllClients) { if (dropdown) dropdown.style.display = 'none'; window.creditsSearch = q; window.currentPages.credits = 1; applyCreditsFilters(); return; }
    var results = window.posAllClients.filter(function(c) {
        return (c.nom || '').toLowerCase().indexOf(q) !== -1 || (c.prenom || '').toLowerCase().indexOf(q) !== -1 || (c.telephone || '').toLowerCase().indexOf(q) !== -1 || (c.description || '').toLowerCase().indexOf(q) !== -1;
    });
    if (results.length === 0) { if (dropdown) dropdown.style.display = 'none'; window.creditsSearch = q; window.currentPages.credits = 1; applyCreditsFilters(); return; }
    selectCreditClient(results[0].nom + ' ' + results[0].prenom);
}

function selectCreditClient(clientName) {
    var searchInput = document.getElementById('creditsSearchInput');
    var dropdown = document.getElementById('creditsClientDropdown');
    if (searchInput) { searchInput.value = clientName; }
    if (dropdown) { dropdown.style.display = 'none'; }
    window.creditsSearch = clientName;
    window.currentPages.credits = 1;
    applyCreditsFilters();
    showVoiceResult('👤 Client: ' + clientName);
}

document.addEventListener('click', function(e) {
    var d = document.getElementById('creditsClientDropdown');
    var s = document.getElementById('creditsSearchInput');
    if (d && s && !s.contains(e.target) && !d.contains(e.target)) { d.style.display = 'none'; }
});

window.renderCreditsTable = renderCreditsTable;
window.loadCredits = loadCredits;
window.applyCreditsFilters = applyCreditsFilters;
window.toggleCreditCheckbox = toggleCreditCheckbox;
window.markCreditPaid = markCreditPaid;
window.selectCreditClient = selectCreditClient;

console.log('🛒 Mixmax Minimarket - Admin Credits chargé');
