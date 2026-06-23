// ==================== ADMIN-CRUD.JS - MIXMAX MINIMARKET ====================
// Contient : Catégories, Produits, Clients, Fournisseurs
// Dépend de : admin.js (variables globales, fonctions utilitaires)

// ==================== CATÉGORIES ====================
function loadCategoriesPage(c) {
    c.innerHTML = '<div class="content-card">' +
        '<div class="card-header"><h3><i class="fas fa-layer-group"></i> Catégories</h3><button class="btn-add" onclick="openCategoryForm()"><i class="fas fa-plus"></i> Nouvelle</button></div>' +
        '<div class="table-container"><table class="data-table" id="categoriesTable"><thead><tr><th>Image</th>' +
        makeSortableHeader('categories', 'nom', 'Nom', 'loadCategories') +
        makeSortableHeader('categories', 'description', 'Description', 'loadCategories') +
        makeSortableHeader('categories', 'ca', 'CA', 'loadCategories') +
        makeSortableHeader('categories', 'profit', 'Profit', 'loadCategories') +
        '<th>Nb Produits</th><th>Recette</th><th>Actions</th>' +
        '</thead><tbody></tbody></div><div id="categoriesPagination"></div></div>';
    loadCategories();
}

async function loadCategories() {
    currentPages.categories = 1; allCategoriesData = [];
    try {
        const snapshot = await db.collection('categories').get();
        snapshot.forEach(d => allCategoriesData.push({ id: d.id, ...d.data() }));
        for (let doc of allCategoriesData) await CacheDB.set('categories', doc.id, doc);
    } catch (e) { console.error(e); }
    renderCategoriesTable();
}

async function renderCategoriesTable() {
    var tb = document.querySelector('#categoriesTable tbody');
    if (!tb) return;
    var data = applySort('categories', allCategoriesData.slice(), 'nom');
    var pageData = getPageData('categories', data);
    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">Aucune catégorie</td></tr>';
        document.getElementById('categoriesPagination').innerHTML = ''; return;
    }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i]; var pc = 0;
        try { var ps = await db.collection('products').where('categorie', '==', d.nom).get(); pc = ps.size; } catch (e) { }
        var im = d.imageBase64 ? '<img src="' + d.imageBase64 + '" style="width:35px;height:35px;object-fit:cover;border-radius:6px;">' : '<i class="fas fa-folder fa-2x" style="color:#2E7D32;"></i>';
        var pcol = (d.profit || 0) >= 0 ? '#2E7D32' : '#dc2626';
        var recetteBadge = d.recette ? '<span class="status-success">✅ Oui</span>' : '<span class="status-warning">❌ Non</span>';
        tb.innerHTML += '<tr><td>' + im + '</td><td><strong>' + escapeHtml(d.nom || '') + '</strong></td><td>' + escapeHtml(d.description || '-') + '</td><td>' + (d.ca || 0).toFixed(2) + ' MAD</td><td style="color:' + pcol + ';">' + (d.profit || 0).toFixed(2) + ' MAD</td><td>' + pc + '</td><td>' + recetteBadge + '</td><td><button class="btn-edit" onclick="editDocument(\'categories\',\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteDocument(\'categories\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
    }
    document.getElementById('categoriesPagination').innerHTML = getPaginationHTML('categories', data.length);
}

function openCategoryForm(data) {
    data = data || {}; editCategoryData = data;
    var recetteChecked = data.recette ? 'checked' : '';
    var h = '<div class="form-row"><div class="form-group"><label>Image</label><input type="file" id="catImage" onchange="previewImage(this,\'catPreview\')"><div id="catPreview">' + (data.imageBase64 ? '<img src="' + data.imageBase64 + '" style="max-width:100px;">' : '') + '</div></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="catNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Description</label><textarea id="catDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>' +
        '<div class="form-row"><div class="form-group"><label>CA</label><input type="number" id="catCA" value="' + (data.ca || 0) + '" step="0.01"></div><div class="form-group"><label>Profit</label><input type="number" id="catProfit" value="' + (data.profit || 0) + '" step="0.01"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Recette</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="catRecette" ' + recetteChecked + ' style="width:20px; height:20px;"><span>Activer la personnalisation</span></div></div></div>' +
        '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveCategory()">Enregistrer</button>';
    currentCollection = 'categories';
    openModal(editingId ? 'Modifier Catégorie' : 'Nouvelle Catégorie', h);
}

function saveCategory() {
    var n = document.getElementById('catNom').value;
    if (!n) { alert('Nom obligatoire'); return; }
    var f = document.getElementById('catImage').files[0];
    var recette = document.getElementById('catRecette').checked;
    var existingImage = (editingId && editCategoryData) ? editCategoryData.imageBase64 : null;
    var sf = function(img) {
        var d = { nom: n, description: document.getElementById('catDesc').value, ca: parseFloat(document.getElementById('catCA').value) || 0, profit: parseFloat(document.getElementById('catProfit').value) || 0, recette: recette };
        d.imageBase64 = img || existingImage;
        saveDocument('categories', d, function() { closeModal(); refreshCurrentPage(); });
    };
    if (f) fileToBase64(f, sf); else sf(null);
}

// ==================== PRODUITS ====================
async function loadStockForProductForm() {
    if (typeof allStockData === 'undefined' || allStockData.length === 0) {
        try { const snap = await db.collection('stock').orderBy('nom').get(); allStockData = []; snap.forEach(d => { let dd = d.data(); dd.id = d.id; allStockData.push(dd); }); } catch (e) { console.error(e); }
    }
}

function renderIngredientRow(index, ing) {
    ing = ing || {};
    var stockOptions = '<option value="">-- Choisir --</option>';
    if (typeof allStockData !== 'undefined') { allStockData.forEach(function(s) { var selected = (ing.idStock === s.id) ? 'selected' : ''; stockOptions += '<option value="' + s.id + '" ' + selected + '>' + escapeHtml(s.nom) + ' (' + (s.unite || '') + ')</option>'; }); }
    return '<div class="ingredient-row" style="display:flex; gap:8px; align-items:center;">' +
        '<select class="ingredient-select" style="flex:1; padding:10px; border:2px solid #e2e8f0; border-radius:8px;" onchange="updateIngredientUnit(this)">' + stockOptions + '</select>' +
        '<input type="number" class="ingredient-qty" placeholder="Qté" value="' + (ing.quantite || '') + '" step="any" style="width:100px; padding:10px; border:2px solid #e2e8f0; border-radius:8px;">' +
        '<span class="ingredient-unit" style="min-width:60px; text-align:center;">' + (ing.unite || '') + '</span>' +
        '<button type="button" class="btn-delete" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button></div>';
}

function addIngredientRow() { var container = document.getElementById('productIngredientsList'); if (container) { container.insertAdjacentHTML('beforeend', renderIngredientRow(container.children.length, {})); } }

function updateIngredientUnit(selectEl) {
    var row = selectEl.closest('.ingredient-row'); var unitSpan = row.querySelector('.ingredient-unit');
    var selectedId = selectEl.value; var stockItem = allStockData.find(function(s) { return s.id === selectedId; });
    if (stockItem) { unitSpan.textContent = stockItem.unite || ''; } else { unitSpan.textContent = ''; }
}

function loadProductsPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-box"></i> Produits</h3><div style="display:flex;gap:10px;flex-wrap:wrap;"><select id="categoryFilter" onchange="filterProducts()"><option value="">Toutes catégories</option></select><button class="btn-add" onclick="openProductForm()"><i class="fas fa-plus"></i> Nouveau</button></div></div>' +
        '<div class="table-container"><table class="data-table" id="productsTable" style="font-size:0.7rem;"><thead><tr><th>Img</th>' +
        makeSortableHeader('products', 'nom', 'Nom', 'loadProducts') + makeSortableHeader('products', 'categorie', 'Catégorie', 'loadProducts') +
        makeSortableHeader('products', 'prixAchat', 'Achat', 'loadProducts') + makeSortableHeader('products', 'prixVente', 'Vente', 'loadProducts') +
        makeSortableHeader('products', 'prixPromo', 'Promo', 'loadProducts') + makeSortableHeader('products', 'profit', 'Profit', 'loadProducts') +
        makeSortableHeader('products', 'stock', 'Stock', 'loadProducts') + makeSortableHeader('products', 'vendues', 'Vendues', 'loadProducts') +
        makeSortableHeader('products', 'ca', 'CA', 'loadProducts') + makeSortableHeader('products', 'disponible', 'Dispo', 'loadProducts') +
        '<th>Temps</th><th>Desc</th><th>Actions</th></thead><tbody></tbody></div><div id="productsPagination"></div></div>';
    loadCategoriesInFilter(); loadProducts();
}

async function loadCategoriesInFilter() {
    var s = document.getElementById('categoryFilter'); if (!s) return;
    try { var sn = await db.collection('categories').get(); s.innerHTML = '<option value="">Toutes catégories</option>'; sn.forEach(function(d) { s.innerHTML += '<option value="' + escapeHtml(d.data().nom) + '">' + escapeHtml(d.data().nom) + '</option>'; }); } catch (e) { }
}

function filterProducts() { selectedCategoryFilter = document.getElementById('categoryFilter').value; currentPages.products = 1; renderProductsTable(); }

async function loadProducts() {
    currentPages.products = 1; allProductsData = [];
    try {
        const snapshot = await db.collection('products').get();
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; let prix = (dd.prixPromo && dd.prixPromo > 0) ? dd.prixPromo : (dd.prixVente || 0); dd.profit = (prix - (dd.prixAchat || 0)); allProductsData.push(dd); });
        for (let doc of allProductsData) await CacheDB.set('products', doc.id, doc);
    } catch (e) { console.error(e); }
    renderProductsTable();
}

function renderProductsTable() {
    var tb = document.querySelector('#productsTable tbody'); if (!tb) return;
    var data = allProductsData.slice(); if (selectedCategoryFilter) data = data.filter(function(d) { return d.categorie === selectedCategoryFilter; });
    data = applySort('products', data, 'nom'); var pageData = getPageData('products', data);
    tb.innerHTML = '';
    if (pageData.length === 0) { tb.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;">Aucun produit</td></tr>'; document.getElementById('productsPagination').innerHTML = ''; return; }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var im = d.imageBase64 ? '<img src="' + d.imageBase64 + '" style="width:30px;height:30px;object-fit:cover;border-radius:4px;">' : '<i class="fas fa-box" style="color:#94a3b8;"></i>';
        var disp = d.disponible !== false ? '<span class="status-success">Oui</span>' : '<span class="status-danger">Non</span>';
        var profitVal = (d.profit !== undefined && !isNaN(d.profit)) ? d.profit : 0; var pc = profitVal >= 0 ? '#2E7D32' : '#dc2626';
        tb.innerHTML += '<tr><td>' + im + '</td><td><strong>' + escapeHtml(d.nom || '') + '</strong></td><td>' + escapeHtml(d.categorie || '-') + '</td><td>' + ((d.prixAchat || 0).toFixed(2)) + '</td><td>' + ((d.prixVente || 0).toFixed(2)) + '</td><td>' + ((d.prixPromo || 0).toFixed(2)) + '</td><td style="color:' + pc + ';">' + profitVal.toFixed(2) + '</td><td>' + (d.stock || 0) + '</td><td>' + (d.vendues || 0) + '</td><td>' + ((d.ca || 0).toFixed(2)) + '</td><td>' + disp + '</td><td>' + (d.tempsPrep || '-') + '</td><td>' + (d.description || '-') + '</td><td><button class="btn-edit" onclick="editDocument(\'products\',\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteDocument(\'products\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
    }
    document.getElementById('productsPagination').innerHTML = getPaginationHTML('products', data.length);
}

async function openProductForm(data) {
    data = data || {}; await loadStockForProductForm();
    var co = ''; try { var cs = await db.collection('categories').get(); cs.forEach(function(d) { var sel = data.categorie === d.data().nom ? 'selected' : ''; co += '<option value="' + escapeHtml(d.data().nom) + '" ' + sel + '>' + escapeHtml(d.data().nom) + '</option>'; }); } catch (e) { }
    var ip = data.imageBase64 ? '<img src="' + data.imageBase64 + '" style="max-width:100px;">' : '';
    var dy = data.disponible !== false ? 'selected' : '', dn = data.disponible === false ? 'selected' : '';
    var h = '<div class="form-row"><div class="form-group"><label>Image</label><input type="file" id="prodImage" onchange="previewImage(this,\'prodPreview\')"><div id="prodPreview">' + ip + '</div></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="prodNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Catégorie</label><select id="prodCat"><option value="">-</option>' + co + '</select></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Prix Achat</label><input type="number" id="prodPA" value="' + (data.prixAchat || 0) + '" step="0.01"></div><div class="form-group"><label>Prix Vente</label><input type="number" id="prodPV" value="' + (data.prixVente || 0) + '" step="0.01"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Prix Promo</label><input type="number" id="prodPromo" value="' + (data.prixPromo || 0) + '" step="0.01"></div><div class="form-group"><label>Stock</label><input type="number" id="prodStock" value="' + (data.stock || 0) + '"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Temps Prep</label><input type="text" id="prodTemps" value="' + escapeHtml(data.tempsPrep || '') + '" placeholder="15 min"></div><div class="form-group"><label>Disponible</label><select id="prodDispo"><option value="1" ' + dy + '>Oui</option><option value="0" ' + dn + '>Non</option></select></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Description</label><textarea id="prodDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<div class="form-row" style="flex-direction:column;"><label style="font-weight:600; margin-bottom:10px;">🧾 Recette (ingrédients du stock)</label><div id="productIngredientsList" style="display:flex; flex-direction:column; gap:8px;">';
    if (data.ingredients && data.ingredients.length > 0) { data.ingredients.forEach(function(ing, idx) { h += renderIngredientRow(idx, ing); }); }
    h += '</div><button type="button" class="btn-add" onclick="addIngredientRow()" style="margin-top:10px; width:auto;"><i class="fas fa-plus"></i> Ajouter un ingrédient</button></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveProduct()">Enregistrer</button>';
    currentCollection = 'products'; openModal(editingId ? 'Modifier Produit' : 'Nouveau Produit', h);
}

function saveProduct() {
    var n = document.getElementById('prodNom').value; if (!n) { alert('Nom obligatoire'); return; }
    var f = document.getElementById('prodImage').files[0]; var ingredients = [];
    var rows = document.querySelectorAll('#productIngredientsList .ingredient-row');
    rows.forEach(function(row) {
        var select = row.querySelector('.ingredient-select'); var qtyInput = row.querySelector('.ingredient-qty');
        if (select && select.value && qtyInput && parseFloat(qtyInput.value) > 0) {
            var stockId = select.value; var stockItem = allStockData.find(function(s) { return s.id === stockId; });
            ingredients.push({ idStock: stockId, nom: stockItem ? stockItem.nom : '', quantite: parseFloat(qtyInput.value), unite: stockItem ? stockItem.unite : '' });
        }
    });
    var sf = function(img) {
        var d = { nom: n, categorie: document.getElementById('prodCat').value, prixAchat: parseFloat(document.getElementById('prodPA').value) || 0, prixVente: parseFloat(document.getElementById('prodPV').value) || 0, prixPromo: parseFloat(document.getElementById('prodPromo').value) || 0, stock: parseInt(document.getElementById('prodStock').value) || 0, vendues: 0, ca: 0, tempsPrep: document.getElementById('prodTemps').value, disponible: document.getElementById('prodDispo').value === '1', description: document.getElementById('prodDesc').value, ingredients: ingredients };
        if (img) d.imageBase64 = img;
        if (editingId) { CacheDB.write('products', editingId, d, 'update').then(function() { var idx = allProductsData.findIndex(function(x) { return x.id === editingId; }); if (idx !== -1) allProductsData[idx] = Object.assign({}, allProductsData[idx], d, { id: editingId }); closeModal(); renderProductsTable(); CacheDB.sync(); }); }
        else { CacheDB.write('products', null, d, 'add').then(function(newId) { d.id = newId; allProductsData.push(d); closeModal(); renderProductsTable(); CacheDB.sync(); }); }
    };
    if (f) fileToBase64(f, sf); else sf(null);
}

// ==================== CLIENTS ====================
function loadClientsPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-users"></i> Clients</h3><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
        '<div class="input-group" style="width:300px;min-width:200px;margin-bottom:0;background:#fff;border:2px solid var(--border);border-radius:12px;"><i class="fas fa-search" style="color:#94a3b8;"></i><input type="text" id="clientSearchInput" placeholder="Rechercher..." onkeyup="clientSearch(this.value)" style="border:none;padding:12px;"></div>' +
        '<button class="btn-add" onclick="openClientForm()"><i class="fas fa-plus"></i> Ajouter</button></div></div>' +
        '<div class="table-container"><table class="data-table" id="clientsTable" style="font-size:0.6rem;"><thead><tr>' +
        makeSortableHeader('clients', 'id', 'ID', 'loadClients') + makeSortableHeader('clients', 'nom', 'Nom', 'loadClients') +
        makeSortableHeader('clients', 'prenom', 'Prénom', 'loadClients') + makeSortableHeader('clients', 'username', 'Username', 'loadClients') +
        makeSortableHeader('clients', 'genre', 'Genre', 'loadClients') + makeSortableHeader('clients', 'adresse', 'Adresse', 'loadClients') +
        makeSortableHeader('clients', 'email', 'Email', 'loadClients') + makeSortableHeader('clients', 'telephone', 'Tél', 'loadClients') +
        makeSortableHeader('clients', 'whatsapp', 'WhatsApp', 'loadClients') + makeSortableHeader('clients', 'facebook', 'Facebook', 'loadClients') +
        makeSortableHeader('clients', 'instagram', 'Instagram', 'loadClients') + makeSortableHeader('clients', 'ca', 'CA', 'loadClients') +
        makeSortableHeader('clients', 'profit', 'Profit', 'loadClients') + makeSortableHeader('clients', 'pointsFidelite', 'Points Fid', 'loadClients') +
        makeSortableHeader('clients', 'allergies', 'Allergies', 'loadClients') + makeSortableHeader('clients', 'aime', 'Aime', 'loadClients') +
        makeSortableHeader('clients', 'deteste', 'Déteste', 'loadClients') + makeSortableHeader('clients', 'createdAt', 'Date créé', 'loadClients') +
        makeSortableHeader('clients', 'description', 'Description', 'loadClients') + '<th>Actions</th></thead><tbody></tbody></div><div id="clientsPagination"></div></div>';
    loadClients();
}

function clientSearch(query) { clientSearchQuery = query.toLowerCase().trim(); currentPages.clients = 1; renderClientsTable(); }

async function loadClients() {
    try { const cached = await CacheDB.getAll('clients'); if (cached.length) allClientsData = cached; const snapshot = await db.collection('clients').get(); allClientsData = []; snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allClientsData.push(dd); }); for (let doc of allClientsData) await CacheDB.set('clients', doc.id, doc); }
    catch (e) { console.error(e); }
    currentPages.clients = 1; renderClientsTable();
}

function renderClientsTable() {
    var tb = document.querySelector('#clientsTable tbody'); if (!tb) return;
    var data = allClientsData.slice();
    if (clientSearchQuery) { data = data.filter(function(d) { return (d.nom || '').toLowerCase().indexOf(clientSearchQuery) !== -1 || (d.prenom || '').toLowerCase().indexOf(clientSearchQuery) !== -1 || (d.username || '').toLowerCase().indexOf(clientSearchQuery) !== -1 || (d.email || '').toLowerCase().indexOf(clientSearchQuery) !== -1 || (d.telephone || '').toLowerCase().indexOf(clientSearchQuery) !== -1 || (d.description || '').toLowerCase().indexOf(clientSearchQuery) !== -1; }); }
    data = applySort('clients', data, 'nom'); var pageData = getPageData('clients', data);
    tb.innerHTML = '';
    if (pageData.length === 0) { tb.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:30px;">Aucun client</td></tr>'; document.getElementById('clientsPagination').innerHTML = ''; return; }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateCreated = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('fr-FR') + ' ' + new Date(d.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
        var row = '<tr><td><small>' + (d.id || '').substring(0, 6) + '</small></td><td><strong>' + escapeHtml(d.nom || '') + '</strong></td><td>' + escapeHtml(d.prenom || '') + '</td><td>@' + escapeHtml(d.username || '') + '</td><td>' + escapeHtml(d.genre || '-') + '</td><td><small>' + escapeHtml(d.adresse || '-') + '</small></td><td><small>' + escapeHtml(d.email || '-') + '</small></td><td>' + escapeHtml(d.telephone || '-') + '</td><td>' + escapeHtml(d.whatsapp || '-') + '</td><td>' + escapeHtml(d.facebook || '-') + '</td><td>' + escapeHtml(d.instagram || '-') + '</td><td style="color:#2E7D32;font-weight:600;">' + (d.ca || 0).toFixed(2) + '</td><td style="color:#2E7D32;">' + (d.profit || 0).toFixed(2) + '</td><td style="color:#2E7D32;font-weight:600;">' + (d.pointsFidelite || 0) + '</td><td><small>' + (d.allergies ? d.allergies.join(', ') : '-') + '</small></td><td><small>' + (d.aime ? d.aime.join(', ') : '-') + '</small></td><td><small>' + (d.deteste ? d.deteste.join(', ') : '-') + '</small></td><td><small>' + dateCreated + '</small></td><td><small>' + escapeHtml(d.description || '-') + '</small></td><td><button class="btn-edit" onclick="editClient(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteClient(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
        tb.innerHTML += row;
    }
    document.getElementById('clientsPagination').innerHTML = getPaginationHTML('clients', data.length);
}

function openClientForm(data) {
    data = data || {};
    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="cliNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Prénom *</label><input type="text" id="cliPrenom" value="' + escapeHtml(data.prenom || '') + '" required></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Username</label><input type="text" id="cliUsername" value="' + escapeHtml(data.username || '') + '"></div><div class="form-group"><label>Genre</label><select id="cliGenre"><option value="">-</option><option value="M" ' + (data.genre === 'M' ? 'selected' : '') + '>M</option><option value="F" ' + (data.genre === 'F' ? 'selected' : '') + '>F</option></select></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Adresse</label><input type="text" id="cliAdresse" value="' + escapeHtml(data.adresse || '') + '"></div><div class="form-group"><label>Email</label><input type="email" id="cliEmail" value="' + escapeHtml(data.email || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Téléphone</label><input type="text" id="cliTel" value="' + escapeHtml(data.telephone || '') + '"></div><div class="form-group"><label>WhatsApp</label><input type="text" id="cliWhatsapp" value="' + escapeHtml(data.whatsapp || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Facebook</label><input type="text" id="cliFacebook" value="' + escapeHtml(data.facebook || '') + '"></div><div class="form-group"><label>Instagram</label><input type="text" id="cliInstagram" value="' + escapeHtml(data.instagram || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>CA</label><input type="number" id="cliCA" value="' + (data.ca || 0) + '" step="0.01"></div><div class="form-group"><label>Profit</label><input type="number" id="cliProfit" value="' + (data.profit || 0) + '" step="0.01"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Points Fidélité</label><input type="number" id="cliPoints" value="' + (data.pointsFidelite || 0) + '"></div><div class="form-group"><label>Description</label><textarea id="cliDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Allergies (virgules)</label><input type="text" id="cliAllergies" value="' + (data.allergies ? data.allergies.join(', ') : '') + '" placeholder="gluten, lactose"></div><div class="form-group"><label>Aime (virgules)</label><input type="text" id="cliAime" value="' + (data.aime ? data.aime.join(', ') : '') + '" placeholder="café, thé"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Déteste (virgules)</label><input type="text" id="cliDeteste" value="' + (data.deteste ? data.deteste.join(', ') : '') + '" placeholder="sucre, lactose"></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveClient()">Enregistrer</button>';
    currentCollection = 'clients'; openModal(editingId ? 'Modifier Client' : 'Nouveau Client', h);
}

function saveClient() {
    var n = document.getElementById('cliNom').value, p = document.getElementById('cliPrenom').value;
    if (!n || !p) { alert('Nom et Prénom obligatoires'); return; }
    var d = { nom: n, prenom: p, username: document.getElementById('cliUsername').value, genre: document.getElementById('cliGenre').value, adresse: document.getElementById('cliAdresse').value, email: document.getElementById('cliEmail').value, telephone: document.getElementById('cliTel').value, whatsapp: document.getElementById('cliWhatsapp').value, facebook: document.getElementById('cliFacebook').value, instagram: document.getElementById('cliInstagram').value, ca: parseFloat(document.getElementById('cliCA').value) || 0, profit: parseFloat(document.getElementById('cliProfit').value) || 0, pointsFidelite: parseInt(document.getElementById('cliPoints').value) || 0, allergies: document.getElementById('cliAllergies').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean), aime: document.getElementById('cliAime').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean), deteste: document.getElementById('cliDeteste').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean), description: document.getElementById('cliDesc').value };
    if (!editingId) d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    saveDocument('clients', d, function() { closeModal(); loadClients(); });
}

function editClient(id) { db.collection('clients').doc(id).get().then(function(doc) { if (doc.exists) { editingId = id; currentCollection = 'clients'; openClientForm(doc.data()); } }); }
function deleteClient(id) { if (confirm('Supprimer ce client ?')) { CacheDB.write('clients', id, null, 'delete').then(function() { alert('Supprimé'); loadClients(); CacheDB.sync(); }); } }

// ==================== FOURNISSEURS ====================
function loadFournisseursPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-truck"></i> Fournisseurs</h3><button class="btn-add" onclick="openFournisseurForm()"><i class="fas fa-plus"></i> Ajouter</button></div>' +
        '<div class="table-container"><table class="data-table" id="fournisseursTable" style="font-size:0.6rem;"><thead><tr>' +
        makeSortableHeader('fournisseurs', 'id', 'ID', 'loadFournisseurs') + makeSortableHeader('fournisseurs', 'nom', 'Nom', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'prenom', 'Prénom', 'loadFournisseurs') + makeSortableHeader('fournisseurs', 'societe', 'Société', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'telephone', 'Tél', 'loadFournisseurs') + makeSortableHeader('fournisseurs', 'whatsapp', 'WhatsApp', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'email', 'Email', 'loadFournisseurs') + makeSortableHeader('fournisseurs', 'adresse', 'Adresse', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'description', 'Description', 'loadFournisseurs') + makeSortableHeader('fournisseurs', 'ca', 'CA', 'loadFournisseurs') +
        '<th>Catégories</th>' + makeSortableHeader('fournisseurs', 'createdAt', 'Date créé', 'loadFournisseurs') + '<th>Actions</th></thead><tbody></tbody></div><div id="fournisseursPagination"></div></div>';
    loadFournisseurs();
}

async function loadFournisseurs() {
    try { const cached = await CacheDB.getAll('fournisseurs'); if (cached.length) allFournisseursData = cached; const snapshot = await db.collection('fournisseurs').get(); allFournisseursData = []; snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allFournisseursData.push(dd); }); for (let doc of allFournisseursData) await CacheDB.set('fournisseurs', doc.id, doc); }
    catch (e) { console.error(e); }
    currentPages.fournisseurs = 1; renderFournisseursTable();
}

function renderFournisseursTable() {
    var tb = document.querySelector('#fournisseursTable tbody'); if (!tb) return;
    var data = applySort('fournisseurs', allFournisseursData.slice(), 'nom'); var pageData = getPageData('fournisseurs', data);
    tb.innerHTML = '';
    if (pageData.length === 0) { tb.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:30px;">Aucun fournisseur</td></tr>'; document.getElementById('fournisseursPagination').innerHTML = ''; return; }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateCreated = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('fr-FR') + ' ' + new Date(d.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
        var categories = d.categories ? d.categories.join(', ') : '-';
        tb.innerHTML += '<tr><td><small>' + (d.id || '').substring(0, 6) + '</small></td><td><strong>' + escapeHtml(d.nom || '') + '</strong></td><td>' + escapeHtml(d.prenom || '') + '</td><td>' + escapeHtml(d.societe || '-') + '</td><td>' + escapeHtml(d.telephone || '-') + '</td><td>' + escapeHtml(d.whatsapp || '-') + '</td><td><small>' + escapeHtml(d.email || '-') + '</small></td><td><small>' + escapeHtml(d.adresse || '-') + '</small></td><td><small>' + escapeHtml(d.description || '-') + '</small></td><td>' + (d.ca || 0).toFixed(2) + ' MAD</td><td><small>' + escapeHtml(categories) + '</small></td><td><small>' + dateCreated + '</small></td><td><button class="btn-edit" onclick="editFournisseur(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteFournisseur(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
    }
    document.getElementById('fournisseursPagination').innerHTML = getPaginationHTML('fournisseurs', data.length);
}

function openFournisseurForm(data) {
    data = data || {}; var selectedCategories = data.categories || [];
    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="fourNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Prénom</label><input type="text" id="fourPrenom" value="' + escapeHtml(data.prenom || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Société</label><input type="text" id="fourSociete" value="' + escapeHtml(data.societe || '') + '"></div><div class="form-group"><label>Téléphone</label><input type="text" id="fourTel" value="' + escapeHtml(data.telephone || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>WhatsApp</label><input type="text" id="fourWhatsapp" value="' + escapeHtml(data.whatsapp || '') + '"></div><div class="form-group"><label>Email</label><input type="email" id="fourEmail" value="' + escapeHtml(data.email || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Adresse</label><input type="text" id="fourAdresse" value="' + escapeHtml(data.adresse || '') + '"></div><div class="form-group"><label>CA</label><input type="number" id="fourCA" value="' + (data.ca || 0) + '" step="0.01"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Description</label><textarea id="fourDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<div class="form-row"><div class="form-group" style="min-width:100%;"><label>Catégories</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:5px;">';
    fournisseurCategoriesList.forEach(function(cat) { var checked = selectedCategories.indexOf(cat) !== -1 ? 'checked' : ''; h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.8rem;"><input type="checkbox" class="four-cat-check" value="' + cat + '" ' + checked + '> ' + cat + '</label>'; });
    h += '</div></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveFournisseur()">Enregistrer</button>';
    currentCollection = 'fournisseurs'; openModal(editingId ? 'Modifier Fournisseur' : 'Nouveau Fournisseur', h);
}

function saveFournisseur() {
    var nom = document.getElementById('fourNom').value; if (!nom) { alert('Nom obligatoire'); return; }
    var categories = []; document.querySelectorAll('.four-cat-check:checked').forEach(function(cb) { categories.push(cb.value); });
    var d = { nom: nom, prenom: document.getElementById('fourPrenom').value, societe: document.getElementById('fourSociete').value, telephone: document.getElementById('fourTel').value, whatsapp: document.getElementById('fourWhatsapp').value, email: document.getElementById('fourEmail').value, adresse: document.getElementById('fourAdresse').value, ca: parseFloat(document.getElementById('fourCA').value) || 0, description: document.getElementById('fourDesc').value, categories: categories };
    if (!editingId) d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    saveDocument('fournisseurs', d, function() { closeModal(); loadFournisseurs(); });
}

function editFournisseur(id) { db.collection('fournisseurs').doc(id).get().then(function(doc) { if (doc.exists) { editingId = id; currentCollection = 'fournisseurs'; openFournisseurForm(doc.data()); } }); }
function deleteFournisseur(id) { if (confirm('Supprimer ce fournisseur ?')) { CacheDB.write('fournisseurs', id, null, 'delete').then(function() { alert('Supprimé'); loadFournisseurs(); CacheDB.sync(); }); } }

console.log('🛒 Mixmax Minimarket - Admin CRUD chargé');
