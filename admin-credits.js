// ==================== ADMIN-CREDITS.JS - MIXMAX MINIMARKET ====================
// Gestion des crédits - Version corrigée
// Compatible avec la sélection multiple vocale

window.creditsPeriod = window.creditsPeriod || 'all';
window.creditsSearch = window.creditsSearch || '';
window.creditSelectionMode = false;
window.creditSelectedIndex = -1;
window.creditPaymentAmount = 0;
window.creditPaymentStep = 'idle';
window.allCreditsData = window.allCreditsData || [];
window.creditSelectAll = window.creditSelectAll || false;

function normalize(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function loadCreditsPage(c) {
    window.creditsPeriod = 'all';
    window.creditsSearch = '';
    window.creditSelectionMode = false;
    window.creditSelectedIndex = -1;
    window.creditPaymentAmount = 0;
    window.creditPaymentStep = 'idle';
    window.creditSelectAll = false;

    if (!window.sortOrders.credits) window.sortOrders.credits = {};
    if (!window.sortOrders.credits.createdAt) window.sortOrders.credits.createdAt = 'desc';
    
    if (!window.posAllClients || window.posAllClients.length === 0) {
        try {
            const snap = await db.collection('clients').limit(500).get();
            window.posAllClients = [];
            snap.forEach(function(d) {
                var data = d.data();
                window.posAllClients.push({
                    id: d.id,
                    nom: data.nom || '',
                    prenom: data.prenom || '',
                    telephone: data.telephone || '',
                    description: data.description || ''
                });
            });
            console.log('✅ Clients chargés:', window.posAllClients.length);
        } catch(e) {
            console.error('Erreur chargement clients:', e);
        }
    }
    
    c.innerHTML = '<div class="content-card">' +
        '<div class="card-header">' +
        '<h3><i class="fas fa-credit-card"></i> Crédits</h3>' +
        '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<div style="position:relative;">' +
        '<input type="text" id="creditsSearchInput" placeholder="🔍 Rechercher (client, description)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="searchClientInCreditsDropdown(this.value)" onfocus="searchClientInCreditsDropdown(this.value)" autocomplete="off">' +
        '<div id="creditsClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;z-index:50;box-shadow:0 5px 15px rgba(0,0,0,0.1);"></div>' +
        '</div>' +
        '<input type="text" id="creditsVoiceDisplay" placeholder="🎤 Audio..." style="padding:8px 12px; border:2px solid #16a34a; border-radius:8px; width:180px; background:#f0fdf4; color:#14532d; font-weight:600;" readonly>' +
        '<select id="creditsPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="window.creditsPeriod = this.value; window.currentPages.credits=1; applyCreditsFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadCredits()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div>' +
        '<div id="creditPaymentZone" style="display:none; background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:12px 16px; margin-bottom:15px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">' +
        '<div><strong>💳 Paiement en cours</strong><br><span id="creditPaymentInfo" style="font-size:0.85rem; color:#14532d;">Aucun crédit sélectionné</span></div>' +
        '<div style="display:flex; align-items:center; gap:10px;">' +
        '<label style="font-weight:600; font-size:0.9rem;">Montant :</label>' +
        '<input type="number" id="creditPaymentAmountInput" placeholder="0.00" step="0.01" style="width:120px; padding:6px 10px; border:2px solid #16a34a; border-radius:8px; font-size:0.9rem;" onfocus="this.select();">' +
        '<button class="btn-save" onclick="validateCreditPayment()" style="padding:6px 14px; font-size:0.85rem; margin:0;"><i class="fas fa-check"></i> Valider</button>' +
        '<button class="btn-cancel" onclick="closeCreditSelection()" style="padding:6px 14px; font-size:0.85rem; margin:0;">Annuler</button>' +
        '</div></div></div>' +
        '<div id="creditsTableContainer"></div>' +
        '<div id="creditsPagination" style="margin-top:10px;"></div>' +
        '</div>';
    
    loadCredits();
}

// Fonction de chargement des crédits
async function loadCredits() {
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var vendeurCaissier = '';
    if (!isAdmin && window.currentUserData) {
        vendeurCaissier = window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom;
    }
    
    try {
        const snapshot = await db.collection('credits').orderBy('createdAt', 'desc').limit(2000).get();
        window.allCreditsData = [];
        snapshot.forEach(function(dc) {
            var d = dc.data();
            d.id = dc.id;
            window.allCreditsData.push(d);
        });
        
        if (!isAdmin) {
            window.allCreditsData = window.allCreditsData.filter(function(d) {
                return d.vendeur === vendeurCaissier;
            });
        }
        
        if (!window.sortOrders.credits) window.sortOrders.credits = {};
        if (!window.sortOrders.credits.createdAt) window.sortOrders.credits.createdAt = 'desc';
    } catch (e) {
        console.error('Erreur chargement crédits:', e);
    }
    
    window.currentPages.credits = 1;
    applyCreditsFilters();
}

function applyCreditsFilters() {
    var filtered = filterByPeriod(window.allCreditsData, window.creditsPeriod);
    
    if (window.creditsSearch && window.creditsSearch.trim() !== '') {
        var q = normalize(window.creditsSearch.trim());
        filtered = filtered.filter(function(credit) {
            var creditName = normalize(credit.clientName || '');
            return creditName.indexOf(q) !== -1;
        });
    }
    
    if (!window.sortOrders.credits || !window.sortOrders.credits.createdAt) {
        filtered.sort(function(a, b) {
            var da = a.createdAt?.seconds || 0;
            var db = b.createdAt?.seconds || 0;
            return db - da;
        });
    } else {
        filtered = applySort('credits', filtered, 'createdAt');
    }
    
    window.filteredCredits = filtered;
    renderCreditsTable();
}

function renderCreditsTable() {
    var cont = document.getElementById('creditsTableContainer');
    if (!cont) return;
    
    var data = (window.filteredCredits || window.allCreditsData).slice();
    
    if (window.sortOrders.credits && window.sortOrders.credits.createdAt) {
        data = applySort('credits', data, 'createdAt');
    } else {
        data.sort(function(a, b) {
            var da = a.createdAt?.seconds || 0;
            var db = b.createdAt?.seconds || 0;
            return db - da;
        });
    }
    
    var pageData = getPageData('credits', data);
    
    if (pageData.length === 0) {
        cont.innerHTML = '<p style="text-align:center;padding:40px;">Aucun crédit trouvé</p>';
        document.getElementById('creditsPagination').innerHTML = '';
        return;
    }
    
    var tc = 0;
    var h = '<div class="table-container"><table class="data-table" style="font-size:0.55rem;"><thead><tr>' +
        makeSortableHeader('credits', 'factureNum', 'Facture', 'renderCreditsTable') +
        makeSortableHeader('credits', 'createdAt', 'Date', 'renderCreditsTable') +
        makeSortableHeader('credits', 'clientName', 'Client', 'renderCreditsTable') +
        makeSortableHeader('credits', 'total', 'Total', 'renderCreditsTable') +
        makeSortableHeader('credits', 'amountGiven', 'Payé', 'renderCreditsTable') +
        makeSortableHeader('credits', 'remainingAmount', 'Restant', 'renderCreditsTable') +
        makeSortableHeader('credits', 'paymentMethod', 'Mode', 'renderCreditsTable') +
        makeSortableHeader('credits', 'vendeur', 'Vendeur', 'renderCreditsTable') +
        '<th>Actions</th>';
    
    if (window.creditSelectionMode) {
        h += '<th style="width:40px;">✅</th>';
    }
    h += '</thead><tbody>';
    
    pageData.forEach(function(d, index) {
        var reste = d.remainingAmount || d.total || 0;
        if (!d.paid) tc += reste;
        
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var amountPaid = d.amountGiven || 0;
        var mode = d.paymentMethod || '-';
        
        var actions = '<button class="btn-edit" onclick="printFacture(\'' + d.id + '\')"><i class="fas fa-print"></i></button> ';
        if (!d.paid) {
            actions += '<button class="btn-add" style="padding:4px 8px;font-size:0.65rem;" onclick="markCreditPaid(\'' + d.id + '\')">Payer</button> ';
        }
        
        var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
        if (isAdmin) {
            actions += '<button class="btn-edit" onclick="editCredit(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> ';
            actions += '<button class="btn-delete" onclick="if(confirm(\'Supprimer définitivement ce crédit ?\')) deleteCredit(\'' + d.id + '\')"><i class="fas fa-trash"></i></button>';
        }
        
        var isSelected = (window.creditSelectAll) ? true : (window.creditSelectedIndex === index);
        var rowClass = isSelected ? ' style="background:#fef3c7; border-left:4px solid #d97706;"' : '';
        
        h += '<tr' + rowClass + '>' +
            '<td>' + (d.factureNum || d.id.substring(0, 8)) + '</td>' +
            '<td>' + dt + '</td>' +
            '<td>' + escapeHtml(d.clientName || d.table || '-') + '</td>' +
            '<td>' + d.total.toFixed(2) + '</td>' +
            '<td>' + amountPaid.toFixed(2) + '</td>' +
            '<td style="color:#ef4444;"><strong>' + reste.toFixed(2) + '</strong></td>' +
            '<td>' + mode + '</td>' +
            '<td>' + escapeHtml(d.vendeur || '-') + '</td>' +
            '<td>' + actions + '</td>';
        
        if (window.creditSelectionMode) {
            var checked = isSelected ? 'checked' : '';
            h += '<td><input type="checkbox" class="credit-select-check" data-index="' + index + '" ' + checked + ' onclick="toggleCreditCheckbox(' + index + ')"></td>';
        }
        h += '</tr>';
    });
    
    h += '</tbody></table></div>';
    h += '<div style="margin-top:15px;padding:15px;background:#fef2f2;border-radius:12px;text-align:center;">' +
        '<strong>Impayés: ' + tc.toFixed(2) + ' MAD</strong></div>';
    
    cont.innerHTML = h;
    document.getElementById('creditsPagination').innerHTML = getPaginationHTML('credits', data.length);
    updateCreditPaymentZone();
}

function updateCreditPaymentZone() {
    var zone = document.getElementById('creditPaymentZone');
    var info = document.getElementById('creditPaymentInfo');
    if (!zone || !info) return;
    
    if (window.creditSelectedIndex >= 0 && window.creditPaymentStep !== 'idle') {
        var data = window.filteredCredits || window.allCreditsData;
        var credit = data[window.creditSelectedIndex];
        if (credit) {
            var reste = credit.remainingAmount || credit.total || 0;
            info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD';
            zone.style.display = 'block';
            var input = document.getElementById('creditPaymentAmountInput');
            if (input) {
                input.value = window.creditPaymentAmount > 0 ? window.creditPaymentAmount : '';
                input.focus();
                input.select();
            }
            return;
        }
    }
    zone.style.display = 'none';
}

function toggleCreditCheckbox(index) {
    var data = window.filteredCredits || window.allCreditsData;
    if (index < 0 || index >= data.length) return;
    
    window.creditSelectedIndex = index;
    window.creditSelectAll = false;
    window.creditPaymentStep = 'selection';
    window.creditPaymentAmount = 0;
    renderCreditsTable();
}

function markCreditPaid(creditId) {
    var data = window.filteredCredits || window.allCreditsData || [];
    var index = data.findIndex(function(c) { return c.id === creditId; });
    
    if (index === -1) {
        alert('Crédit introuvable');
        return;
    }
    
    window.creditSelectedIndex = index;
    window.creditSelectAll = false;
    window.creditPaymentStep = 'payment';
    window.creditPaymentAmount = 0;
    window.creditSelectionMode = true;
    
    var zone = document.getElementById('creditPaymentZone');
    var info = document.getElementById('creditPaymentInfo');
    if (zone) {
        zone.style.display = 'block';
        var credit = data[index];
        var reste = credit.remainingAmount || credit.total || 0;
        if (info) {
            info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD';
        }
        var input = document.getElementById('creditPaymentAmountInput');
        if (input) {
            input.value = '';
            input.focus();
            input.select();
        }
    }
    renderCreditsTable();
}

function searchClientInCreditsDropdown(query) {
    var q = query.toLowerCase().trim();
    var dropdown = document.getElementById('creditsClientDropdown');
    
    if (!q || !window.posAllClients) {
        if (dropdown) dropdown.style.display = 'none';
        window.creditsSearch = q;
        window.currentPages.credits = 1;
        applyCreditsFilters();
        return;
    }
    
    var normalizedQuery = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var results = window.posAllClients.filter(function(c) {
        var nom = (c.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        var prenom = (c.prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        var telephone = (c.telephone || '').toLowerCase();
        var description = (c.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return nom.indexOf(normalizedQuery) !== -1 || prenom.indexOf(normalizedQuery) !== -1 ||
               telephone.indexOf(q) !== -1 || description.indexOf(normalizedQuery) !== -1;
    });
    
    if (results.length === 0) {
        if (dropdown) dropdown.style.display = 'none';
        window.creditsSearch = query.trim();
        window.currentPages.credits = 1;
        applyCreditsFilters();
        return;
    }
    
    if (results.length === 1) {
        var nomComplet = results[0].nom + ' ' + results[0].prenom;
        selectCreditClient(nomComplet);
        return;
    }
    
    var h = '';
    results.forEach(function(c) {
        var clientNameSafe = (c.nom + ' ' + c.prenom).replace(/'/g, "\\'");
        h += '<div onclick="selectCreditClient(\'' + clientNameSafe + '\')" style="padding:8px;cursor:pointer;border-bottom:1px solid #f1f5f9;">' +
            '<strong>' + escapeHtml(c.nom) + ' ' + escapeHtml(c.prenom) + '</strong>' +
            '<span style="color:#94a3b8;font-size:0.65rem;display:block;">' + escapeHtml(c.description || c.telephone || '') + '</span></div>';
    });
    
    if (dropdown) {
        dropdown.innerHTML = h;
        dropdown.style.display = 'block';
    }
}

function selectCreditClient(clientName) {
    var searchInput = document.getElementById('creditsSearchInput');
    var dropdown = document.getElementById('creditsClientDropdown');
    
    if (searchInput) searchInput.value = clientName;
    if (dropdown) dropdown.style.display = 'none';
    
    window.creditsSearch = clientName;
    window.currentPages.credits = 1;
    applyCreditsFilters();
}

async function editCredit(id) {
    try {
        var doc = await db.collection('credits').doc(id).get();
        if (!doc.exists) {
            alert('Crédit introuvable');
            return;
        }
        var d = doc.data();
        window.editingId = id;
        window.currentCollection = 'credits';
        
        var h = '<div class="form-row">' +
            '<div class="form-group"><label>Client</label><input type="text" id="editCreditClient" value="' + escapeHtml(d.clientName || '') + '"></div>' +
            '<div class="form-group"><label>Total (MAD)</label><input type="number" id="editCreditTotal" value="' + (d.total || 0) + '" step="0.01"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Payé (MAD)</label><input type="number" id="editCreditPaid" value="' + (d.amountGiven || 0) + '" step="0.01"></div>' +
            '<div class="form-group"><label>Restant (MAD)</label><input type="number" id="editCreditRemaining" value="' + (d.remainingAmount || 0) + '" step="0.01"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Mode de paiement</label><input type="text" id="editCreditMode" value="' + escapeHtml(d.paymentMethod || '') + '"></div>' +
            '<div class="form-group"><label>Statut</label><select id="editCreditStatut"><option value="0" ' + (!d.paid ? 'selected' : '') + '>Impayé</option><option value="1" ' + (d.paid ? 'selected' : '') + '>Payé</option></select></div>' +
            '</div>' +
            '<button class="btn-cancel" onclick="closeModal()">Annuler</button>' +
            '<button class="btn-save" onclick="saveEditCredit()">Enregistrer</button>';
        
        openModal('Modifier Crédit ' + (d.factureNum || id.substring(0, 8)), h);
    } catch (e) {
        console.error('Erreur editCredit:', e);
        alert('Erreur lors du chargement du crédit');
    }
}

async function saveEditCredit() {
    var clientName = document.getElementById('editCreditClient').value.trim();
    var total = parseFloat(document.getElementById('editCreditTotal').value) || 0;
    var amountGiven = parseFloat(document.getElementById('editCreditPaid').value) || 0;
    var remainingAmount = parseFloat(document.getElementById('editCreditRemaining').value) || 0;
    var paymentMethod = document.getElementById('editCreditMode').value.trim();
    var paid = document.getElementById('editCreditStatut').value === '1';
    
    var data = {
        clientName: clientName,
        total: total,
        amountGiven: amountGiven,
        remainingAmount: paid ? 0 : remainingAmount,
        paymentMethod: paymentMethod,
        paid: paid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await CacheDB.write('credits', window.editingId, data, 'update');
        closeModal();
        loadCredits();
        CacheDB.sync();
        alert('✅ Crédit mis à jour');
    } catch (e) {
        alert('❌ Erreur: ' + e.message);
    }
}

async function deleteCredit(id) {
    try {
        await db.collection('credits').doc(id).delete();
        window.allCreditsData = (window.allCreditsData || []).filter(function(c) { return c.id !== id; });
        if (typeof loadCredits === 'function') loadCredits();
    } catch (e) {
        console.error('Erreur deleteCredit:', e);
        throw e;
    }
}

async function validateCreditPayment() {
    if (window.creditSelectedIndex < 0) {
        alert('Aucun crédit sélectionné');
        return;
    }
    
    var input = document.getElementById('creditPaymentAmountInput');
    var amount = parseFloat(input ? input.value : window.creditPaymentAmount);
    
    if (isNaN(amount) || amount <= 0) {
        alert('Montant invalide');
        return;
    }
    
    var data = window.filteredCredits || window.allCreditsData || [];
    var credit = data[window.creditSelectedIndex];
    if (!credit) {
        alert('Crédit introuvable');
        return;
    }
    
    var reste = credit.remainingAmount || credit.total || 0;
    if (amount > reste) {
        if (!confirm('Le montant (' + amount.toFixed(2) + ' MAD) dépasse le reste à payer (' + reste.toFixed(2) + ' MAD). Continuer ?')) {
            return;
        }
    }
    
    var newReste = Math.max(0, reste - amount);
    var paid = newReste <= 0.01;
    
    var updateData = {
        paid: paid,
        remainingAmount: newReste,
        amountGiven: (credit.amountGiven || 0) + amount,
        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await CacheDB.write('credits', credit.id, updateData, 'update');
        
        var idx = window.allCreditsData.findIndex(function(c) { return c.id === credit.id; });
        if (idx !== -1) {
            window.allCreditsData[idx].paid = paid;
            window.allCreditsData[idx].remainingAmount = newReste;
            window.allCreditsData[idx].amountGiven = (credit.amountGiven || 0) + amount;
        }
        
        alert(paid ? '✅ Crédit soldé !' : '✅ Paiement enregistré. Reste: ' + newReste.toFixed(2) + ' MAD');
        
        window.creditPaymentStep = 'idle';
        window.creditSelectedIndex = -1;
        window.creditPaymentAmount = 0;
        window.creditSelectionMode = false;
        
        var zone = document.getElementById('creditPaymentZone');
        if (zone) zone.style.display = 'none';
        
        loadCredits();
        CacheDB.sync();
    } catch (e) {
        console.error('Erreur paiement:', e);
        alert('❌ Erreur: ' + e.message);
    }
}

function closeCreditSelection() {
    window.creditSelectionMode = false;
    window.creditSelectedIndex = -1;
    window.creditSelectAll = false;
    window.creditPaymentAmount = 0;
    window.creditPaymentStep = 'idle';
    
    var zone = document.getElementById('creditPaymentZone');
    if (zone) zone.style.display = 'none';
    
    window.creditsSearch = '';
    window.currentPages.credits = 1;
    window.filteredCredits = null;
    applyCreditsFilters();
}

document.addEventListener('click', function(e) {
    var d = document.getElementById('creditsClientDropdown');
    var s = document.getElementById('creditsSearchInput');
    if (d && s && !s.contains(e.target) && !d.contains(e.target)) {
        d.style.display = 'none';
    }
});

window.loadCreditsPage = loadCreditsPage;
window.loadCredits = loadCredits;
window.applyCreditsFilters = applyCreditsFilters;
window.renderCreditsTable = renderCreditsTable;
window.updateCreditPaymentZone = updateCreditPaymentZone;
window.toggleCreditCheckbox = toggleCreditCheckbox;
window.markCreditPaid = markCreditPaid;
window.selectCreditClient = selectCreditClient;
window.searchClientInCreditsDropdown = searchClientInCreditsDropdown;
window.editCredit = editCredit;
window.deleteCredit = deleteCredit;
window.saveEditCredit = saveEditCredit;
window.validateCreditPayment = validateCreditPayment;
window.closeCreditSelection = closeCreditSelection;
window.normalize = normalize;

console.log('🛒 Mixmax Minimarket - Admin Credits chargé');
