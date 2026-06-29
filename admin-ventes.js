// ==================== ADMIN-VENTES.JS - MIXMAX MINIMARKET ====================
// Contient : Commandes en ligne, Ventes
// Dépend de : admin.js (variables globales, fonctions utilitaires)
// Version FINALE : window. pour toutes les variables + input vocal + mode sélection ventes + WhatsApp

// ========== VARIABLES GLOBALES ==========
window.commandesSearch = window.commandesSearch || '';
window.commandesPeriod = window.commandesPeriod || 'all';
window.ventesSearch = window.ventesSearch || '';
window.ventesPeriod = window.ventesPeriod || 'all';
window.allVentesData = window.allVentesData || [];
window.allCommandesData = window.allCommandesData || [];
window.filteredVentes = window.filteredVentes || null;
window.filteredCommandes = window.filteredCommandes || null;
window.venteSelectionMode = window.venteSelectionMode || false;
window.venteSelectedIndex = window.venteSelectedIndex || -1;

// ==================== COMMANDES EN LIGNE ====================
function loadCommandesPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-shopping-basket"></i> Commandes en ligne</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<input type="text" id="commandesSearchInput" placeholder="🔍 Rechercher (client, email, tél, produit)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="window.commandesSearch = this.value; window.currentPages.commandes=1; applyCommandesFilters();">' +
        '<select id="commandesPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="window.commandesPeriod = this.value; window.currentPages.commandes=1; applyCommandesFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadCommandes()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div><div id="commandesTableContainer"></div><div id="commandesPagination" style="margin-top:10px;"></div></div>';
    loadCommandes();
}

async function loadCommandes() {
    try {
        const snapshot = await db.collection('commandes').orderBy('createdAt', 'desc').limit(500).get();
        window.allCommandesData = [];
        snapshot.forEach(dc => { var d = dc.data(); d.id = dc.id; if (d.source === 'client') window.allCommandesData.push(d); });
    } catch (e) {
        console.error('Erreur chargement commandes en ligne :', e);
        const fallback = await db.collection('commandes').get();
        window.allCommandesData = [];
        fallback.forEach(dc => { var d = dc.data(); if (d.source === 'client') { d.id = dc.id; window.allCommandesData.push(d); } });
        window.allCommandesData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    window.currentPages.commandes = 1;
    applyCommandesFilters();
}

function applyCommandesFilters() {
    var filtered = filterByPeriod(window.allCommandesData, window.commandesPeriod);
    filtered = filterBySearch(filtered, window.commandesSearch, ['clientName', 'clientEmail', 'clientTelephone', 'items.nom']);
    if (!window.sortOrders.commandes || !window.sortOrders.commandes.createdAt) {
        filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } else {
        filtered = applySort('commandes', filtered, 'createdAt');
    }
    window.filteredCommandes = filtered;
    renderCommandesTable();
}

function renderCommandesTable() {
    var cont = document.getElementById('commandesTableContainer');
    if (!cont) return;
    var data = (window.filteredCommandes || window.allCommandesData).slice();
    if (!window.sortOrders.commandes || !window.sortOrders.commandes.createdAt) {
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } else {
        data = applySort('commandes', data, 'createdAt');
    }
    var pageData = getPageData('commandes', data);
    if (pageData.length === 0) {
        cont.innerHTML = '<p style="text-align:center;padding:40px;">Aucune commande trouvée</p>';
        document.getElementById('commandesPagination').innerHTML = '';
        return;
    }
    var h = '<div class="table-container"><table class="data-table" style="font-size:0.65rem;"><thead><tr>' +
        makeSortableHeader('commandes', 'createdAt', 'Date', 'renderCommandesTable') +
        makeSortableHeader('commandes', 'clientName', 'Client', 'renderCommandesTable') +
        makeSortableHeader('commandes', 'clientEmail', 'Email', 'renderCommandesTable') +
        makeSortableHeader('commandes', 'clientTelephone', 'Tél', 'renderCommandesTable') +
        '<th>Articles</th><th>Options</th>' +
        makeSortableHeader('commandes', 'total', 'Total', 'renderCommandesTable') +
        makeSortableHeader('commandes', 'statut', 'Statut', 'renderCommandesTable') +
        '<th>Actions</th></thead><tbody>';
    pageData.forEach(function(d) {
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var arts = d.items ? d.items.map(function(it) { return '<strong>' + it.quantite + 'x</strong> ' + escapeHtml(it.nom); }).join('<br>') : '';
        var opts = d.items ? d.items.map(function(it) {
            var o = [];
            if (it.sauces && it.sauces.length) o.push('<span style="color:#2E7D32;">🥫' + escapeHtml(it.sauces.join(',')) + '</span>');
            if (it.interdits && it.interdits.length) o.push('<span style="color:#ef4444;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>');
            if (it.epice && it.epice !== 'Normal') o.push('<span style="color:#d97706;">🌶️' + escapeHtml(it.epice) + '</span>');
            if (it.sel && it.sel !== 'Normal') o.push('<span style="color:#4f46e5;">🧂' + escapeHtml(it.sel) + '</span>');
            return o.length ? o.join(' | ') : '-';
        }).join('<br>') : '-';
        var sc = d.statut === 'payé' ? '#4f46e5' : (d.statut === 'valide' ? '#2E7D32' : '#d97706');
        var sl = d.statut === 'payé' ? '💵 Payée' : (d.statut === 'valide' ? '✅ Validée' : '⏳ En attente');
        var act = '';
        if (d.statut === 'en_attente') {
            act = '<button class="btn-add" style="padding:4px 6px;font-size:0.65rem;margin-right:2px;" onclick="validateCommande(\'' + d.id + '\')"><i class="fas fa-check"></i> Valider</button>' +
                  '<button class="btn-save" style="padding:4px 6px;font-size:0.65rem;margin-right:2px;" onclick="payCommande(\'' + d.id + '\')"><i class="fas fa-money-bill-wave"></i> Payer</button>' +
                  '<button class="btn-delete" style="padding:4px 6px;font-size:0.65rem;" onclick="cancelCommande(\'' + d.id + '\')"><i class="fas fa-times"></i> Annuler</button>';
        } else if (d.statut === 'valide') {
            act = '<button class="btn-save" style="padding:4px 6px;font-size:0.65rem;" onclick="payCommande(\'' + d.id + '\')"><i class="fas fa-money-bill-wave"></i> Payer</button>';
        } else {
            act = '<small style="color:#4f46e5;">Payée</small>';
        }
        h += '<tr><td>' + dt + '</td><td><strong>' + escapeHtml(d.clientName || '') + '</strong></td><td>' + escapeHtml(d.clientEmail || '-') + '</td><td>' + escapeHtml(d.clientTelephone || '-') + '</td><td>' + arts + '</td><td>' + opts + '</td><td><strong>' + d.total.toFixed(2) + ' MAD</strong></td><td><span style="color:' + sc + ';">' + sl + '</span></td><td>' + act + '</td></tr>';
    });
    h += '</tbody></div>';
    cont.innerHTML = h;
    document.getElementById('commandesPagination').innerHTML = getPaginationHTML('commandes', data.length);
}

async function validateCommande(cid) {
    if (!confirm('Valider cette commande ?')) return;
    await CacheDB.write('commandes', cid, {
        statut: 'valide',
        validatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        validatedBy: window.currentUserData ? window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom : 'Admin'
    }, 'update');
    alert('✅ Validée !');
    loadCommandes();
    CacheDB.sync();
}

async function payCommande(cid) {
    if (!confirm('Payer cette commande ? Redirection vers le POS...')) return;
    var dc = await db.collection('commandes').doc(cid).get();
    if (!dc.exists) { alert('Introuvable'); return; }
    var cmd = dc.data();
    localStorage.setItem('posCommandeData', JSON.stringify({
        commandeId: cid,
        clientId: cmd.clientId,
        clientName: cmd.clientName,
        items: cmd.items,
        total: cmd.total,
        table: cmd.table || ''
    }));
    navigateTo('pos');
}

function cancelCommande(cid) {
    if (confirm('Annuler ?')) {
        CacheDB.write('commandes', cid, { statut: 'annule' }, 'update').then(function() {
            alert('❌ Annulée');
            loadCommandes();
            CacheDB.sync();
        });
    }
}

// ==================== VENTES ====================
function loadVentesPage(c) {
    window.ventesPeriod = 'all';
    window.ventesSearch = '';
    window.venteSelectionMode = false;
    window.venteSelectedIndex = -1;
    if (!window.sortOrders.ventes) window.sortOrders.ventes = {};
    if (!window.sortOrders.ventes.createdAt) { window.sortOrders.ventes.createdAt = 'desc'; }
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-shopping-cart"></i> Ventes</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<input type="text" id="ventesSearchInput" placeholder="🔍 Rechercher (client, produit)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="window.ventesSearch = this.value; window.currentPages.ventes=1; applyVentesFilters();">' +
        '<input type="text" id="ventesVoiceDisplay" placeholder="🎤 Audio..." style="padding:8px 12px; border:2px solid #16a34a; border-radius:8px; width:180px; background:#f0fdf4; color:#14532d; font-weight:600;" readonly>' +
        '<select id="ventesPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="window.ventesPeriod = this.value; window.currentPages.ventes=1; applyVentesFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadVentes()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div><div id="ventesTableContainer"></div><div id="ventesPagination" style="margin-top:10px;"></div></div>';
    loadVentes();
}

async function loadVentes() {
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var vendeurCaissier = '';
    if (!isAdmin && window.currentUserData) {
        vendeurCaissier = window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom;
    }
    try {
        const snapshot = await db.collection('ventes').orderBy('createdAt', 'desc').limit(2000).get();
        window.allVentesData = [];
        snapshot.forEach(dc => {
            var d = dc.data(); d.id = dc.id;
            var achat = 0, profit = 0;
            if (d.items) {
                d.items.forEach(function(it) {
                    var pa = it.prixAchat || 0, pv = it.prixVente || 0, pp = it.prixPromo || 0,
                        pvr = (pp > 0) ? pp : pv, q = it.quantite || 1;
                    achat += pa * q;
                    profit += (pvr - pa) * q;
                });
            }
            d.achat = achat; d.profit = profit;
            window.allVentesData.push(d);
        });
        if (!isAdmin) {
            window.allVentesData = window.allVentesData.filter(function(d) { return d.vendeur === vendeurCaissier; });
        }
        if (!window.sortOrders.ventes) window.sortOrders.ventes = {};
        if (!window.sortOrders.ventes.createdAt) { window.sortOrders.ventes.createdAt = 'desc'; }
    } catch (e) { console.error('Erreur chargement ventes:', e); }
    window.currentPages.ventes = 1;
    applyVentesFilters();
}

function applyVentesFilters() {
    var filtered = filterByPeriod(window.allVentesData, window.ventesPeriod);
    filtered = filterBySearch(filtered, window.ventesSearch, ['clientName', 'items.nom']);
    if (!window.sortOrders.ventes || !window.sortOrders.ventes.createdAt) {
        filtered.sort(function(a, b) {
            var da = a.createdAt?.seconds || 0;
            var db = b.createdAt?.seconds || 0;
            return db - da;
        });
    } else {
        filtered = applySort('ventes', filtered, 'createdAt');
    }
    window.filteredVentes = filtered;
    renderVentesTable();
}

function renderVentesTable() {
    var cont = document.getElementById('ventesTableContainer');
    if (!cont) return;
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var data = (window.filteredVentes || window.allVentesData).slice();
    if (window.sortOrders.ventes && window.sortOrders.ventes.createdAt) {
        data = applySort('ventes', data, 'createdAt');
    } else {
        data.sort(function(a, b) {
            var da = a.createdAt?.seconds || 0;
            var db = b.createdAt?.seconds || 0;
            return db - da;
        });
    }
    var pageData = getPageData('ventes', data);
    if (pageData.length === 0) {
        cont.innerHTML = '<p style="text-align:center;padding:40px;">Aucune vente trouvée</p>';
        document.getElementById('ventesPagination').innerHTML = '';
        return;
    }
    var tv = 0;
    var h = '<div class="table-container"><table class="data-table" style="font-size:0.55rem;"><thead><tr>' +
        makeSortableHeader('ventes', 'factureNum', 'Facture', 'renderVentesTable') +
        makeSortableHeader('ventes', 'createdAt', 'Date', 'renderVentesTable') +
        makeSortableHeader('ventes', 'clientName', 'Client/Table', 'renderVentesTable') +
        '<th>Articles</th><th>Options</th>' +
        (isAdmin ? makeSortableHeader('ventes', 'achat', 'Achat', 'renderVentesTable') +
                   makeSortableHeader('ventes', 'profit', 'Profit', 'renderVentesTable') : '') +
        makeSortableHeader('ventes', 'total', 'Total', 'renderVentesTable') +
        makeSortableHeader('ventes', 'discountMAD', 'Remise', 'renderVentesTable') +
        makeSortableHeader('ventes', 'amountGiven', 'Donné', 'renderVentesTable') +
        makeSortableHeader('ventes', 'change', 'Rendu', 'renderVentesTable') +
        makeSortableHeader('ventes', 'vendeur', 'Vendeur', 'renderVentesTable') +
        makeSortableHeader('ventes', 'paymentMethod', 'Paiement', 'renderVentesTable') +
        makeSortableHeader('ventes', 'statutPaiement', 'Statut', 'renderVentesTable') +
        '<th>Actions</th>';
    // ✅ Colonne sélection si mode actif
    if (window.venteSelectionMode) {
        h += '<th style="width:40px;">✅</th>';
    }
    h += '</thead><tbody>';

    pageData.forEach(function(d, index) {
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var cl = d.clientName || d.table || '-';
        var arts = d.items ? d.items.map(function(it) { return '<strong>' + it.quantite + 'x</strong> ' + escapeHtml(it.nom); }).join('<br>') : '-';
        var opts = d.items ? d.items.map(function(it) {
            var o = [];
            if (it.sauces && it.sauces.length) o.push('<span style="color:#2E7D32;">🥫' + escapeHtml(it.sauces.join(',')) + '</span>');
            if (it.interdits && it.interdits.length) o.push('<span style="color:#ef4444;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>');
            if (it.epice && it.epice !== 'Normal') o.push('<span style="color:#d97706;">🌶️' + escapeHtml(it.epice) + '</span>');
            if (it.sel && it.sel !== 'Normal') o.push('<span style="color:#4f46e5;">🧂' + escapeHtml(it.sel) + '</span>');
            return o.length ? o.join(' | ') : '-';
        }).join('<br>') : '-';
        tv += d.total || 0;
        var amountGiven = d.amountGiven || 0;
        var change = d.change || 0;
        var statutLabel = d.statutPaiement || (d.paid ? 'payé' : 'impayé');
        var statutColor = statutLabel === 'payé' ? '#2E7D32' : (statutLabel === 'crédit' ? '#2E7D32' : (statutLabel === 'partiel' ? '#d97706' : '#ef4444'));
        // Boutons d'action
        var actions = '<button class="btn-edit" onclick="printFacture(\'' + d.id + '\')" title="Imprimer"><i class="fas fa-print"></i></button> ' +
            '<button class="btn-edit" onclick="sendWhatsApp(\'' + d.id + '\')" style="color:#25D366;" title="Envoyer WhatsApp"><i class="fab fa-whatsapp"></i></button> ';
        if (!d.paid) actions += '<button class="btn-add" style="padding:4px 6px;font-size:0.65rem;" onclick="payerVente(\'' + d.id + '\')"><i class="fas fa-check"></i> Payer</button> ';
        if (isAdmin) actions += '<button class="btn-edit" onclick="editVente(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteVente(\'' + d.id + '\')"><i class="fas fa-trash"></i></button>';

        var isSelected = (window.venteSelectionMode && window.venteSelectedIndex === index);
        var rowClass = isSelected ? ' style="background:#fef3c7; border-left:4px solid #d97706;"' : '';

        h += '<tr' + rowClass + '><td><strong>' + (d.factureNum || d.id.substring(0, 8)) + '</strong></td><td>' + dt + '</td><td>' + cl + '</td><td>' + arts + '</td><td>' + opts + '</td>' +
            (isAdmin ? '<td>' + d.achat.toFixed(2) + '</td><td style="color:#2E7D32;">' + d.profit.toFixed(2) + '</td>' : '') +
            '<td><strong>' + (d.total || 0).toFixed(2) + '</strong></td><td>' + (d.discountMAD || 0).toFixed(2) + '</td><td>' + amountGiven.toFixed(2) + '</td><td>' + change.toFixed(2) + '</td><td>' + (d.vendeur || '-') + '</td><td>' + (d.paymentMethod || '-') + '</td><td><span style="color:' + statutColor + ';font-weight:600;">' + statutLabel + '</span></td><td>' + actions + '</td>';

        // ✅ Colonne sélection
        if (window.venteSelectionMode) {
            var checked = isSelected ? 'checked' : '';
            h += '<td><input type="checkbox" ' + checked + ' onclick="window.venteSelectedIndex=' + index + ';renderVentesTable();"></td>';
        }
        h += '</tr>';
    });
    h += '</tbody></div><div style="margin-top:15px;padding:15px;background:#E8F5E9;border-radius:12px;text-align:center;"><strong>Total: ' + tv.toFixed(2) + ' MAD</strong></div>';
    cont.innerHTML = h;
    document.getElementById('ventesPagination').innerHTML = getPaginationHTML('ventes', data.length);
}

function editVente(did) {
    db.collection('ventes').doc(did).get().then(function(doc) {
        if (doc.exists) {
            window.editingId = did;
            window.currentCollection = 'ventes';
            var d = doc.data();
            var h = '<div class="form-row"><div class="form-group"><label>Statut paiement</label><select id="editStatut"><option value="payé" ' + (d.statutPaiement === 'payé' ? 'selected' : '') + '>Payé</option><option value="crédit" ' + (d.statutPaiement === 'crédit' ? 'selected' : '') + '>Crédit</option><option value="partiel" ' + (d.statutPaiement === 'partiel' ? 'selected' : '') + '>Partiel</option><option value="en_attente" ' + (d.statutPaiement === 'en_attente' ? 'selected' : '') + '>En attente</option></select></div><div class="form-group"><label>Montant donné</label><input type="number" id="editAmountGiven" value="' + (d.amountGiven || 0) + '" step="0.01"></div></div>' +
            '<div class="form-row"><div class="form-group"><label>Montant rendu</label><input type="number" id="editChange" value="' + (d.change || 0) + '" step="0.01"></div><div class="form-group"><label>Reste à payer</label><input type="number" id="editRemaining" value="' + (d.remainingAmount || 0) + '" step="0.01"></div></div>' +
            '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveEditVente()">Enregistrer</button>';
            openModal('Modifier vente ' + d.factureNum, h);
        }
    });
}

function saveEditVente() {
    var statut = document.getElementById('editStatut').value;
    var amountGiven = parseFloat(document.getElementById('editAmountGiven').value) || 0;
    var change = parseFloat(document.getElementById('editChange').value) || 0;
    var remaining = parseFloat(document.getElementById('editRemaining').value) || 0;
    var paid = (statut === 'payé');
    var data = {
        statutPaiement: statut,
        amountGiven: amountGiven,
        change: change,
        remainingAmount: paid ? 0 : remaining,
        paid: paid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    saveDocument('ventes', data, function() { closeModal(); loadVentes(); });
}

function deleteVente(did) {
    if (confirm('Supprimer définitivement cette vente ?')) {
        CacheDB.write('ventes', did, null, 'delete').then(function() {
            alert('Supprimé');
            loadVentes();
            CacheDB.sync();
        });
    }
}

async function payerVente(did) {
    if (!confirm('Payer cette vente ? Redirection vers le POS...')) return;
    var dc = await db.collection('ventes').doc(did).get();
    if (!dc.exists) { alert('Introuvable'); return; }
    var d = dc.data();
    localStorage.setItem('posPayerVente', JSON.stringify({
        venteId: did,
        clientId: d.clientId,
        clientName: d.clientName,
        items: d.items,
        total: d.total,
        table: d.table || ''
    }));
    navigateTo('pos');
}

function printFacture(did) {
    db.collection('ventes').doc(did).get().then(function(dc) {
        if (dc.exists) imprimerFacture(dc.data(), dc.id);
        else {
            db.collection('credits').doc(did).get().then(function(cd) {
                if (cd.exists) imprimerFacture(cd.data(), cd.id);
            });
        }
    });
}

function imprimerFacture(d, id) {
    var ih = '';
    if (d.items) {
        d.items.forEach(function(it) {
            var o = '';
            if (it.interdits && it.interdits.length > 0) o += ' 🚫' + it.interdits.join(',');
            if (it.permis && it.permis.length > 0) o += ' ✅' + it.permis.join(',');
            if (it.epice && it.epice !== 'Normal') o += ' 🌶️' + it.epice;
            ih += '<tr><td>' + escapeHtml(it.nom) + o + '</td><td>' + it.quantite + '</td><td>' + (it.prixVente || 0).toFixed(2) + '</td><td>' + ((it.prixVente || 0) * it.quantite).toFixed(2) + '</td></tr>';
        });
    }
    var w = window.open('', '_blank', 'width=400,height=600');
    w.document.write('<html><head><title>Facture Mixmax Minimarket</title><style>body{font-family:Arial;padding:20px;}h2{text-align:center;}table{width:100%;border-collapse:collapse;}th,td{padding:5px;border-bottom:1px solid #ddd;}.total{font-size:16px;font-weight:bold;text-align:right;}</style></head><body>' +
        '<h2>🛒 Mixmax Minimarket</h2><p>Facture: ' + (d.factureNum || id.substring(0, 8)) + '</p><p>Date: ' + (d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '') + '</p>' +
        '<p>Client: ' + (d.clientName || d.table || '') + '</p><p>Vendeur: ' + (d.vendeur || '-') + '</p>' +
        '<table><th>Article</th><th>Qté</th><th>Prix</th><th>Total</th></tr>' + ih + (d.discountMAD > 0 ? '<p>Remise: ' + d.discountMAD.toFixed(2) + ' MAD</p>' : '') +
        '<p class="total">Total: ' + d.total.toFixed(2) + ' MAD</p></body></html>');
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
}

// ==================== ENVOI WHATSAPP ====================
async function sendWhatsApp(did) {
    try {
        const doc = await db.collection('ventes').doc(did).get();
        if (!doc.exists) { alert('Vente introuvable'); return; }
        const vente = doc.data();

        // Chercher le téléphone
        let phone = '';
        if (vente.clientId) {
            const clientDoc = await db.collection('clients').doc(vente.clientId).get();
            if (clientDoc.exists) {
                phone = clientDoc.data().telephone || '';
            }
        }
        phone = phone.replace(/\s+/g, '').replace(/^0+/, '');
        if (!phone) { alert('❌ Aucun numéro WhatsApp trouvé.'); return; }

        // Construire le message
        var message = '🧾 *Facture Mixmax Minimarket*\n';
        message += '📄 N°: ' + (vente.factureNum || did.substring(0, 8)) + '\n';
        message += '📅 Date: ' + (vente.createdAt ? new Date(vente.createdAt.seconds * 1000).toLocaleString('fr-FR') : '') + '\n';
        message += '👤 Client: ' + (vente.clientName || '-') + '\n';
        message += '━━━━━━━━━━━━━━━━\n';
        if (vente.items) {
            vente.items.forEach(function(it) {
                message += it.quantite + 'x ' + it.nom + ' — ' + (it.prixVente || 0).toFixed(2) + ' MAD\n';
            });
        }
        message += '━━━━━━━━━━━━━━━━\n';
        message += '*💰 Total: ' + vente.total.toFixed(2) + ' MAD*';

        var encodedMessage = encodeURIComponent(message);
        var whatsappURL = 'https://wa.me/' + phone + '?text=' + encodedMessage;
        window.open(whatsappURL, '_blank');
    } catch (e) {
        console.error('Erreur WhatsApp:', e);
        alert('❌ Erreur: ' + e.message);
    }
}

// ==================== EXPORTS ====================
window.loadCommandesPage = loadCommandesPage;
window.loadCommandes = loadCommandes;
window.applyCommandesFilters = applyCommandesFilters;
window.renderCommandesTable = renderCommandesTable;
window.validateCommande = validateCommande;
window.payCommande = payCommande;
window.cancelCommande = cancelCommande;
window.loadVentesPage = loadVentesPage;
window.loadVentes = loadVentes;
window.applyVentesFilters = applyVentesFilters;
window.renderVentesTable = renderVentesTable;
window.editVente = editVente;
window.saveEditVente = saveEditVente;
window.deleteVente = deleteVente;
window.payerVente = payerVente;
window.printFacture = printFacture;
window.imprimerFacture = imprimerFacture;
window.sendWhatsApp = sendWhatsApp;

console.log('🛒 Mixmax Minimarket - Admin Ventes chargé (FINAL avec WhatsApp)');
