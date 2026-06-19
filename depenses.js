// ==================== DEPENSES.JS - ALMA COFFEE SHOP ====================
var globalPeriod = 'all';
var depensesSearch = '';
var depensesCategoryFilter = '';

var stockCategories = [
    "Café", "Thé", "Chocolat", "Lait", "Sucre", "Épices", "Pâtisserie", "Fruits",
    "Emballages", "Sacs", "Boîtes", "Gobelets", "Serviettes", "Sirop", "Sauces", "Autre"
];

var allStockData = [];
var stockSearchQuery = '';
var stockCurrentPage = 1;
var stockItemsPerPage = 15;

var allPersonnelData = [];
var personnelSearchQuery = '';
var personnelCurrentPage = 1;
var personnelItemsPerPage = 15;

function loadDepensesPage(c) {
    var html = '';

    html += '<div class="content-card" style="margin-bottom:20px; padding:15px;">';
    html += '<div style="display:flex; align-items:center; gap:15px;">';
    html += '<strong><i class="fas fa-calendar-alt"></i> Période :</strong>';
    html += '<select id="globalPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="globalPeriod = this.value; loadDepenses(); loadPersonnel();">';
    html += getPeriodOptions('all');
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // SECTION STOCK
    html += '<div class="content-card" style="margin-bottom:30px;">';
    html += '<div class="card-header">';
    html += '<h3><i class="fas fa-boxes"></i> Stock (matières premières, emballages…) <span id="stockTotalDisplay" style="font-size:0.9rem;color:#16a34a;"></span></h3>';
    html += '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
    html += '<input type="text" id="stockSearchInput" placeholder="🔍 Rechercher un produit..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:200px;" onkeyup="stockSearchQuery = this.value.trim().toLowerCase(); stockCurrentPage=1; renderStockTable();">';
    html += '<button class="btn-add" onclick="openStockForm()"><i class="fas fa-plus"></i> Ajouter</button>';
    html += '<button class="btn-add" onclick="loadStock()"><i class="fas fa-sync"></i> Actualiser</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="table-container"><table class="data-table" id="stockTable" style="font-size:0.7rem;">';
    html += '<thead><tr>';
    html += '<th>Nom</th><th>Catégorie</th><th>Prix achat (MAD)</th><th>Quantité</th><th>Unité</th><th>Qté base</th><th>Actions</th>';
    html += '</thead><tbody></tbody></table></div>';
    html += '<div id="stockPagination"></div>';
    html += '</div>';

    // SECTION DÉPENSES
    var catOptions = '<option value="">Toutes les catégories</option>';
    Object.keys(depenseCategories).forEach(function(cat) {
        catOptions += '<option value="' + cat + '">' + cat + '</option>';
    });

    html += '<div class="content-card" style="margin-bottom:30px;">';
    html += '<div class="card-header">';
    html += '<h3><i class="fas fa-money-bill-wave"></i> Dépenses <span id="depensesTotalDisplay" style="font-size:0.9rem;color:#16a34a;"></span></h3>';
    html += '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
    html += '<input type="text" id="depensesSearchInput" placeholder="🔍 Rechercher..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:200px;" onkeyup="depensesSearch = this.value; currentPages.depenses=1; applyDepensesFilters();">';
    html += '<select id="depensesCategorySelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="depensesCategoryFilter = this.value; currentPages.depenses=1; applyDepensesFilters();">' + catOptions + '</select>';
    html += '<button class="btn-add" onclick="openDepenseForm()"><i class="fas fa-plus"></i> Nouvelle</button>';
    html += '<button class="btn-add" onclick="loadDepenses()"><i class="fas fa-sync"></i> Actualiser</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="table-container"><table class="data-table" id="depensesTable" style="font-size:0.65rem;"><thead><tr>';
    html += '<th>ID</th><th>Titre</th><th>Catégorie</th><th>Sous‑catégorie</th><th>Montant</th><th>Description</th><th>Date</th><th>Actions</th>';
    html += '</thead><tbody></tbody></table></div>';
    html += '<div id="depensesPagination"></div>';
    html += '</div>';

    // SECTION PERSONNEL
    html += '<div class="content-card">';
    html += '<div class="card-header">';
    html += '<h3><i class="fas fa-users"></i> Personnel <span id="personnelTotalDisplay" style="font-size:0.9rem;color:#16a34a;"></span></h3>';
    html += '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">';
    html += '<input type="text" id="personnelSearchInput" placeholder="🔍 Rechercher..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:200px;" onkeyup="personnelSearchQuery = this.value.trim().toLowerCase(); personnelCurrentPage=1; renderPersonnelTable();">';
    html += '<button class="btn-add" onclick="openPersonnelForm()"><i class="fas fa-plus"></i> Ajouter</button>';
    html += '<button class="btn-add" onclick="loadPersonnel()"><i class="fas fa-sync"></i> Actualiser</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="table-container"><table class="data-table" id="personnelTable" style="font-size:0.7rem;">';
    html += '<thead><tr>';
    html += '<th>Nom</th><th>Rôle</th><th>Salaire (MAD)</th><th>Horaire</th><th>Téléphone</th><th>Date d\'embauche</th><th>Actions</th>';
    html += '</thead><tbody></tbody></tr></div>';
    html += '<div id="personnelPagination"></div>';
    html += '</div>';

    c.innerHTML = html;
    loadStock();
    loadDepenses();
    loadPersonnel();
}

// ==================== STOCK ====================
async function loadStock() {
    try {
        const snapshot = await db.collection('stock').orderBy('nom').get();
        allStockData = [];
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allStockData.push(dd); });
        for (let doc of allStockData) await CacheDB.set('stock', doc.id, doc);
    } catch(e) { console.error(e); }
    stockCurrentPage = 1;
    renderStockTable();
}

function renderStockTable() {
    var tb = document.querySelector('#stockTable tbody');
    if (!tb) return;

    var data = allStockData.slice();
    if (stockSearchQuery) {
        data = data.filter(function(d) {
            return (d.nom||'').toLowerCase().indexOf(stockSearchQuery) !== -1 ||
                   (d.categorie||'').toLowerCase().indexOf(stockSearchQuery) !== -1;
        });
    }

    var totalValue = data.reduce(function(sum, d) { return sum + ((d.prixAchat||0) * (d.quantite||0)); }, 0);
    document.getElementById('stockTotalDisplay').textContent = '(Valeur totale : ' + totalValue.toFixed(2) + ' MAD)';

    var totalPages = Math.ceil(data.length / stockItemsPerPage);
    var start = (stockCurrentPage - 1) * stockItemsPerPage;
    var pageData = data.slice(start, start + stockItemsPerPage);

    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;">Aucun produit en stock</td></tr>';
        document.getElementById('stockPagination').innerHTML = '';
        return;
    }

    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var qteBase = convertirQuantiteBase(d.quantite, d.unite);
        tb.innerHTML += '<tr>' +
            '<td><strong>' + escapeHtml(d.nom||'') + '</strong></td>' +
            '<td>' + escapeHtml(d.categorie||'-') + '</td>' +
            '<td>' + (d.prixAchat||0).toFixed(2) + '</td>' +
            '<td>' + (d.quantite||0) + '</td>' +
            '<td>' + escapeHtml(d.unite||'') + '</td>' +
            '<td><small>' + qteBase + '</small></td>' +
            '<td><button class="btn-edit" onclick="editStock(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> ' +
            '<button class="btn-delete" onclick="deleteStock(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }

    var pagHTML = '';
    if (totalPages > 1) {
        pagHTML += '<div style="display:flex; justify-content:center; gap:10px; margin-top:15px;">';
        pagHTML += '<button onclick="stockCurrentPage = Math.max(1, stockCurrentPage-1); renderStockTable();" ' + (stockCurrentPage <= 1 ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">« Précédent</button>';
        pagHTML += '<span>Page ' + stockCurrentPage + ' / ' + totalPages + '</span>';
        pagHTML += '<button onclick="stockCurrentPage = Math.min(totalPages, stockCurrentPage+1); renderStockTable();" ' + (stockCurrentPage >= totalPages ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">Suivant »</button>';
        pagHTML += '</div>';
    }
    document.getElementById('stockPagination').innerHTML = pagHTML;
}

function openStockForm(data) {
    data = data || {};
    var selectedCategorie = data.categorie || '';

    var catOptions = '<option value="">-- Choisir --</option>';
    stockCategories.forEach(function(cat) {
        catOptions += '<option value="' + cat + '" ' + (selectedCategorie === cat ? 'selected' : '') + '>' + cat + '</option>';
    });

    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="stockNom" value="' + escapeHtml(data.nom || '') + '" required></div>';
    h += '<div class="form-group"><label>Catégorie</label><select id="stockCat">' + catOptions + '</select></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Prix d\'achat (MAD)</label><input type="number" id="stockPA" value="' + (data.prixAchat || 0) + '" step="0.01"></div>';
    h += '<div class="form-group"><label>Quantité</label><input type="number" id="stockQte" value="' + (data.quantite || 0) + '" step="any"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Unité</label><select id="stockUnite">';
    var unites = ['kg', 'g', 'L', 'mL', 'pièce', 'unité', 'sac', 'carton', 'bouteille', 'capsule'];
    unites.forEach(function(u) {
        h += '<option value="' + u + '" ' + (data.unite === u ? 'selected' : '') + '>' + u + '</option>';
    });
    h += '</select></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveStock()">Enregistrer</button>';

    openModal(editingId ? 'Modifier Produit Stock' : 'Nouveau Produit Stock', h);
    currentCollection = 'stock';
}

function saveStock() {
    var nom = document.getElementById('stockNom').value.trim();
    if (!nom) { alert('Nom obligatoire'); return; }
    var d = {
        nom: nom,
        categorie: document.getElementById('stockCat').value,
        prixAchat: parseFloat(document.getElementById('stockPA').value) || 0,
        quantite: parseFloat(document.getElementById('stockQte').value) || 0,
        unite: document.getElementById('stockUnite').value
    };
    if (editingId) {
        CacheDB.write('stock', editingId, d, 'update').then(function() {
            var idx = allStockData.findIndex(function(x) { return x.id === editingId; });
            if (idx !== -1) allStockData[idx] = Object.assign({}, allStockData[idx], d, { id: editingId });
            closeModal();
            renderStockTable();
            CacheDB.sync();
        });
    } else {
        CacheDB.write('stock', null, d, 'add').then(function(newId) {
            d.id = newId;
            allStockData.push(d);
            closeModal();
            renderStockTable();
            CacheDB.sync();
        });
    }
}

function editStock(id) {
    db.collection('stock').doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = 'stock'; openStockForm(doc.data()); }
    });
}

async function deleteStock(id) {
    if (confirm('Supprimer ce produit du stock ?')) {
        await CacheDB.write('stock', id, null, 'delete');
        allStockData = allStockData.filter(function(x) { return x.id !== id; });
        renderStockTable();
        CacheDB.sync();
    }
}

function convertirQuantiteBase(quantite, unite) {
    if (!unite) return quantite;
    switch(unite) {
        case 'kg': return (quantite * 1000).toFixed(0) + ' g';
        case 'L': return (quantite * 1000).toFixed(0) + ' mL';
        case 'g': return quantite + ' g';
        case 'mL': return quantite + ' mL';
        default: return quantite + ' ' + unite;
    }
}

// ==================== DÉPENSES ====================
var depenseCategories = {
    "Boissons": ["Café", "Thé", "Chocolat", "Jus", "Eau", "Sodas"],
    "Personnel": ["Salaires", "Avances", "Primes", "CNSS"],
    "Charges du local": ["Loyer", "Eau", "Électricité", "Gaz", "Internet", "Téléphone"],
    "Maintenance": ["Réparation machine café", "Climatisation", "Plomberie", "Matériel"],
    "Marketing": ["Publicité Facebook", "Publicité Instagram", "Flyers", "Promotions"],
    "Administratif": ["Comptable", "Logiciel POS", "Frais bancaires", "Assurances"],
    "Transport et livraison": ["Carburant", "Entretien véhicule", "Frais de livraison"],
    "Taxes et impôts": ["Taxes", "Impôts"]
};

async function loadDepenses() {
    try {
        const snapshot = await db.collection('depenses').orderBy('createdAt','desc').get();
        allDepensesData = [];
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allDepensesData.push(dd); });
        for (let doc of allDepensesData) await CacheDB.set('depenses', doc.id, doc);
    } catch(e) { console.error(e); }
    currentPages.depenses = 1;
    applyDepensesFilters();
}

function applyDepensesFilters() {
    var filtered = filterByPeriod(allDepensesData, globalPeriod);
    if (depensesSearch) filtered = filterBySearch(filtered, depensesSearch, ['titre','description','categorie','sousCategories']);
    if (depensesCategoryFilter) filtered = filtered.filter(function(d){ return d.categorie === depensesCategoryFilter; });
    window.filteredDepenses = filtered;
    renderDepensesTable();
}

function renderDepensesTable() {
    var tb = document.querySelector('#depensesTable tbody');
    if (!tb) return;
    var data = (window.filteredDepenses || allDepensesData).slice();
    var total = data.reduce(function(sum, d){ return sum + (d.montant||0); }, 0);
    document.getElementById('depensesTotalDisplay').textContent = '(Total : ' + total.toFixed(2) + ' MAD)';

    var totalPages = Math.ceil(data.length / itemsPerPage);
    var start = (currentPages.depenses - 1) * itemsPerPage;
    var pageData = data.slice(start, start + itemsPerPage);

    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">Aucune dépense</td></tr>';
        document.getElementById('depensesPagination').innerHTML = '';
        return;
    }

    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateCreated = d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleString('fr-FR') : '-';
        var sousCategories = d.sousCategories ? d.sousCategories.join(', ') : '-';
        tb.innerHTML += '<tr>' +
            '<td><small>'+(d.id||'').substring(0,6)+'</small></td>' +
            '<td><strong>' + escapeHtml(d.titre||d.description||'-') + '</strong></td>' +
            '<td><small>' + escapeHtml(d.categorie||'-') + '</small></td>' +
            '<td><small>' + escapeHtml(sousCategories) + '</small></td>' +
            '<td style="color:#ef4444;font-weight:700;">'+(d.montant||0).toFixed(2)+' MAD</td>' +
            '<td><small>' + escapeHtml(d.description||'-') + '</small></td>' +
            '<td><small>'+dateCreated+'</small></td>' +
            '<td><button class="btn-edit" onclick="editDepense(\''+d.id+'\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteDepense(\''+d.id+'\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }

    var pagHTML = '';
    if (totalPages > 1) {
        pagHTML += '<div style="display:flex; justify-content:center; gap:10px; margin-top:15px;">';
        pagHTML += '<button onclick="changePage(\'depenses\', ' + (currentPages.depenses-1) + ')" ' + (currentPages.depenses <= 1 ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">« Précédent</button>';
        pagHTML += '<span>Page ' + currentPages.depenses + ' / ' + totalPages + '</span>';
        pagHTML += '<button onclick="changePage(\'depenses\', ' + (currentPages.depenses+1) + ')" ' + (currentPages.depenses >= totalPages ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">Suivant »</button>';
        pagHTML += '</div>';
    }
    document.getElementById('depensesPagination').innerHTML = pagHTML;
}

function openDepenseForm(data) {
    data = data || {};
    var selectedCategorie = data.categorie || '';
    var selectedSousCategories = data.sousCategories || [];

    var catOptions = '<option value="">-- Choisir --</option>';
    Object.keys(depenseCategories).forEach(function(cat) {
        var sel = selectedCategorie === cat ? 'selected' : '';
        catOptions += '<option value="' + cat + '" ' + sel + '>' + cat + '</option>';
    });

    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Titre *</label><input type="text" id="depTitre" value="' + escapeHtml(data.titre || '') + '" required></div><div class="form-group"><label>Montant *</label><input type="number" id="depMontant" value="' + (data.montant || 0) + '" step="0.01" required></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Catégorie</label><select id="depCategorie" onchange="updateDepSousCategories()">' + catOptions + '</select></div></div>';
    h += '<div class="form-row"><div class="form-group" style="min-width:100%;"><label>Sous‑catégories</label><div id="depSousCategories" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:5px;"></div></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Autre sous‑catégorie</label><input type="text" id="depAutreSousCat" placeholder="Ajouter une sous‑catégorie non listée"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="depDate" value="' + (data.date || new Date().toISOString().split('T')[0]) + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Description</label><textarea id="depDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveDepense()">Enregistrer</button>';

    openModal(editingId ? 'Modifier Dépense' : 'Nouvelle Dépense', h);
    currentCollection = 'depenses';

    setTimeout(function() {
        updateDepSousCategories();
        if (selectedSousCategories.length > 0) {
            selectedSousCategories.forEach(function(sc) {
                var cb = document.querySelector('.dep-sous-cat-check[value="' + sc.replace(/"/g, '&quot;') + '"]');
                if (cb) cb.checked = true;
                else document.getElementById('depAutreSousCat').value = sc;
            });
        }
    }, 100);
}

function updateDepSousCategories() {
    var cat = document.getElementById('depCategorie').value;
    var container = document.getElementById('depSousCategories');
    if (!container) return;
    container.innerHTML = '';
    if (cat && depenseCategories[cat]) {
        depenseCategories[cat].forEach(function(sc) {
            container.innerHTML += '<label style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.8rem;">' +
                '<input type="checkbox" class="dep-sous-cat-check" value="' + sc + '"> ' + sc + '</label>';
        });
    }
}

function saveDepense() {
    var titre = document.getElementById('depTitre').value.trim();
    var montant = parseFloat(document.getElementById('depMontant').value) || 0;
    if (!titre || !montant) { alert('Titre et montant obligatoires'); return; }

    var categorie = document.getElementById('depCategorie').value;
    var sousCategories = [];
    document.querySelectorAll('.dep-sous-cat-check:checked').forEach(function(cb) { sousCategories.push(cb.value); });
    var autre = document.getElementById('depAutreSousCat').value.trim();
    if (autre) sousCategories.push(autre);

    var d = {
        titre: titre, montant: montant, categorie: categorie,
        sousCategories: sousCategories,
        date: document.getElementById('depDate').value,
        description: document.getElementById('depDesc').value
    };

    if (editingId) {
        CacheDB.write('depenses', editingId, d, 'update').then(function() {
            closeModal();
            loadDepenses();
            CacheDB.sync();
        });
    } else {
        d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        CacheDB.write('depenses', null, d, 'add').then(function() {
            closeModal();
            loadDepenses();
            CacheDB.sync();
        });
    }
}

function editDepense(id) {
    db.collection('depenses').doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = 'depenses'; openDepenseForm(doc.data()); }
    });
}

function deleteDepense(id) {
    if (confirm('Supprimer cette dépense ?')) {
        CacheDB.write('depenses', id, null, 'delete').then(function() {
            alert('Supprimée');
            loadDepenses();
            CacheDB.sync();
        });
    }
}

// ==================== PERSONNEL ====================
async function loadPersonnel() {
    try {
        const snapshot = await db.collection('personnel').orderBy('nom').get();
        allPersonnelData = [];
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allPersonnelData.push(dd); });
        for (let doc of allPersonnelData) await CacheDB.set('personnel', doc.id, doc);
    } catch(e) { console.error(e); }
    personnelCurrentPage = 1;
    renderPersonnelTable();
}

function filterPersonnelByPeriod(data, period) {
    if (!period || period === 'all') return data;
    var now = Date.now();
    var days = parseInt(period);
    if (isNaN(days)) return data;
    var cutoff = now - days * 86400000;
    return data.filter(function(d) {
        if (!d.dateEmbauche) return false;
        var parts = d.dateEmbauche.split('-');
        var embaucheDate = new Date(parts[0], parts[1]-1, parts[2]);
        return embaucheDate.getTime() >= cutoff;
    });
}

function renderPersonnelTable() {
    var tb = document.querySelector('#personnelTable tbody');
    if (!tb) return;

    var data = allPersonnelData.slice();
    data = filterPersonnelByPeriod(data, globalPeriod);
    if (personnelSearchQuery) {
        data = data.filter(function(d) {
            return (d.nom||'').toLowerCase().indexOf(personnelSearchQuery) !== -1 ||
                   (d.role||'').toLowerCase().indexOf(personnelSearchQuery) !== -1;
        });
    }

    var totalSalaires = data.reduce(function(sum, d) { return sum + (d.salaire||0); }, 0);
    document.getElementById('personnelTotalDisplay').textContent = '(Total salaires : ' + totalSalaires.toFixed(2) + ' MAD)';

    var totalPages = Math.ceil(data.length / personnelItemsPerPage);
    var start = (personnelCurrentPage - 1) * personnelItemsPerPage;
    var pageData = data.slice(start, start + personnelItemsPerPage);

    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;">Aucun employé</td></tr>';
        document.getElementById('personnelPagination').innerHTML = '';
        return;
    }

    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateEmbauche = d.dateEmbauche || '-';
        tb.innerHTML += '<tr>' +
            '<td><strong>' + escapeHtml(d.nom||'') + '</strong></td>' +
            '<td>' + escapeHtml(d.role||'-') + '</td>' +
            '<td>' + (d.salaire||0).toFixed(2) + '</td>' +
            '<td>' + escapeHtml(d.horaire||'-') + '</td>' +
            '<td>' + escapeHtml(d.telephone||'-') + '</td>' +
            '<td>' + dateEmbauche + '</td>' +
            '<td><button class="btn-edit" onclick="editPersonnel(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> ' +
            '<button class="btn-delete" onclick="deletePersonnel(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }

    var pagHTML = '';
    if (totalPages > 1) {
        pagHTML += '<div style="display:flex; justify-content:center; gap:10px; margin-top:15px;">';
        pagHTML += '<button onclick="personnelCurrentPage = Math.max(1, personnelCurrentPage-1); renderPersonnelTable();" ' + (personnelCurrentPage <= 1 ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">« Précédent</button>';
        pagHTML += '<span>Page ' + personnelCurrentPage + ' / ' + totalPages + '</span>';
        pagHTML += '<button onclick="personnelCurrentPage = Math.min(totalPages, personnelCurrentPage+1); renderPersonnelTable();" ' + (personnelCurrentPage >= totalPages ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px;">Suivant »</button>';
        pagHTML += '</div>';
    }
    document.getElementById('personnelPagination').innerHTML = pagHTML;
}

function openPersonnelForm(data) {
    data = data || {};
    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="persNom" value="' + escapeHtml(data.nom || '') + '" required></div>';
    h += '<div class="form-group"><label>Rôle</label><select id="persRole">';
    var roles = ['Barista', 'Cuisinier', 'Serveur', 'Livreur', 'Gérant', 'Plongeur'];
    roles.forEach(function(r) {
        h += '<option value="' + r + '" ' + (data.role === r ? 'selected' : '') + '>' + r + '</option>';
    });
    h += '</select></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Salaire (MAD)</label><input type="number" id="persSalaire" value="' + (data.salaire || 0) + '" step="0.01"></div>';
    h += '<div class="form-group"><label>Horaire de travail</label><input type="text" id="persHoraire" value="' + escapeHtml(data.horaire || '') + '" placeholder="ex: 08:00 - 16:00"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Téléphone</label><input type="text" id="persTel" value="' + escapeHtml(data.telephone || '') + '"></div>';
    h += '<div class="form-group"><label>Date d\'embauche</label><input type="date" id="persDate" value="' + (data.dateEmbauche || '') + '"></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="savePersonnel()">Enregistrer</button>';

    openModal(editingId ? 'Modifier Employé' : 'Nouvel Employé', h);
    currentCollection = 'personnel';
}

function savePersonnel() {
    var nom = document.getElementById('persNom').value.trim();
    if (!nom) { alert('Nom obligatoire'); return; }
    var d = {
        nom: nom,
        role: document.getElementById('persRole').value,
        salaire: parseFloat(document.getElementById('persSalaire').value) || 0,
        horaire: document.getElementById('persHoraire').value,
        telephone: document.getElementById('persTel').value,
        dateEmbauche: document.getElementById('persDate').value
    };
    if (editingId) {
        CacheDB.write('personnel', editingId, d, 'update').then(function() {
            var idx = allPersonnelData.findIndex(function(x) { return x.id === editingId; });
            if (idx !== -1) allPersonnelData[idx] = Object.assign({}, allPersonnelData[idx], d, { id: editingId });
            closeModal();
            renderPersonnelTable();
            CacheDB.sync();
        });
    } else {
        CacheDB.write('personnel', null, d, 'add').then(function(newId) {
            d.id = newId;
            allPersonnelData.push(d);
            closeModal();
            renderPersonnelTable();
            CacheDB.sync();
        });
    }
}

function editPersonnel(id) {
    db.collection('personnel').doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = 'personnel'; openPersonnelForm(doc.data()); }
    });
}

async function deletePersonnel(id) {
    if (confirm('Supprimer cet employé ?')) {
        await CacheDB.write('personnel', id, null, 'delete');
        allPersonnelData = allPersonnelData.filter(function(x) { return x.id !== id; });
        renderPersonnelTable();
        CacheDB.sync();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

console.log('☕ Alma Coffee Shop - Dépenses JS prêt');
