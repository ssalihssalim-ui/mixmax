// ==================== ADMIN.JS - ALMA COFFEE SHOP (COMPLET) ====================
// ==================== VARIABLES GLOBALES ====================
var editingId = null;
var currentCollection = '';
var selectedCategoryFilter = '';
var sortOrders = {};
var clientSearchQuery = '';
var pendingUsersData = [];

var allCategoriesData = [];
var allProductsData = [];
var allClientsData = [];
var allFournisseursData = [];
var allDepensesData = [];
var allCommandesData = [];
var allVentesData = [];
var allCreditsData = [];
var allUsersData = [];

var currentPages = {
    categories: 1,
    products: 1,
    clients: 1,
    fournisseurs: 1,
    depenses: 1,
    commandes: 1,
    ventes: 1,
    credits: 1,
    users: 1
};
var itemsPerPage = 15;

var ventesPeriod = 'all', ventesSearch = '';
var creditsPeriod = 'all', creditsSearch = '';
var commandesPeriod = 'all', commandesSearch = '';
var usersSearchQuery = '';

var fournisseurCategoriesList = ['Alimentaire', 'Boissons', 'Emballage', 'Entretien', 'Viandes', 'Légumes', 'Sauces', 'Autre'];
var allStockData = [];

// ==================== FONCTIONS UTILITAIRES ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function toDate(val) {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string') return new Date(val);
    if (val instanceof Date) return val;
    return null;
}

// ==================== DASHBOARD ====================
function loadDashboardPage(c) {
    c.innerHTML = '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-icon"><i class="fas fa-coffee"></i></div><div class="stat-info"><span class="stat-label">Produits</span><span class="stat-value" id="productsCount">0</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><span class="stat-label">Clients</span><span class="stat-value" id="clientsCount">0</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-info"><span class="stat-label">Catégories</span><span class="stat-value" id="categoriesCount">0</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon"><i class="fas fa-shopping-cart"></i></div><div class="stat-info"><span class="stat-label">Ventes</span><span class="stat-value" id="ventesCount">0</span></div></div>' +
        '</div>' +
        '<div class="content-card">' +
        '<div class="card-header"><h3><i class="fas fa-bell"></i> Inscriptions en attente</h3><button class="btn-add" onclick="loadPendingRegistrations()"><i class="fas fa-sync"></i> Actualiser</button></div>' +
        '<div id="pendingRegistrations">Chargement...</div>' +
        '</div>';
    loadDashboardStats();
    loadPendingRegistrations();
}

function loadDashboardStats() {
    db.collection('products').get().then(function(s) { var e = document.getElementById('productsCount'); if (e) e.textContent = s.size; }).catch(e => console.error(e));
    db.collection('clients').get().then(function(s) { var e = document.getElementById('clientsCount'); if (e) e.textContent = s.size; }).catch(e => console.error(e));
    db.collection('categories').get().then(function(s) { var e = document.getElementById('categoriesCount'); if (e) e.textContent = s.size; }).catch(e => console.error(e));
    db.collection('ventes').get().then(function(s) { var e = document.getElementById('ventesCount'); if (e) e.textContent = s.size; }).catch(e => console.error(e));
}

// ==================== INSCRIPTIONS EN ATTENTE ====================
function loadPendingRegistrations() {
    var d = document.getElementById('pendingRegistrations');
    if (!d) return;
    d.innerHTML = '<div class="table-container"><table class="data-table" id="pendingTable"><thead></table>' +
        makeSortableHeader('pending', 'prenom', 'Utilisateur', 'renderPendingTable') +
        makeSortableHeader('pending', 'email', 'Email', 'renderPendingTable') +
        makeSortableHeader('pending', 'role', 'Rôle', 'renderPendingTable') +
        makeSortableHeader('pending', 'createdAt', 'Date', 'renderPendingTable') +
        '<th>Actions</th>' +
        '</thead><tbody></tbody>' +
        '</div>';
    
    db.collection('users').where('authorized', '==', 'no').get().then(function(s) {
        pendingUsersData = [];
        if (!s.empty) {
            s.forEach(function(dc) {
                var userData = dc.data();
                pendingUsersData.push({
                    id: dc.id,
                    prenom: userData.prenom + ' ' + userData.nom,
                    email: userData.email,
                    role: userData.role,
                    createdAt: userData.createdAt,
                    data: userData
                });
            });
        }
        renderPendingTable();
    }).catch(function(err) {
        console.error(err);
        pendingUsersData = [];
        renderPendingTable();
    });
}

function renderPendingTable() {
    var tb = document.querySelector('#pendingTable tbody');
    if (!tb) return;
    var data = applySort('pending', pendingUsersData.slice(), 'createdAt');
    tb.innerHTML = '';
    if (data.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#16a34a;">Aucune inscription en attente</td></tr>';
        return;
    }
    data.forEach(function(x) {
        var dt = x.createdAt ? new Date(x.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : 'N/A';
        var row = '<tr>';
        row += '<td><strong>' + escapeHtml(x.prenom) + '</strong> (@' + escapeHtml(x.data.username) + ')</td>';
        row += '<td>' + escapeHtml(x.email) + '</td>';
        row += '<td>' + escapeHtml(x.role) + '</td>';
        row += '<td>' + dt + '</td>';
        row += '<td><button class="btn-add" style="padding:4px 10px;font-size:0.7rem;margin-right:5px;" onclick="approveUser(\'' + x.id + '\')"><i class="fas fa-check"></i> Accepter</button><button class="btn-delete" style="padding:4px 10px;font-size:0.7rem;" onclick="rejectUser(\'' + x.id + '\')"><i class="fas fa-times"></i> Refuser</button></td>';
        row += '</tr>';
        tb.innerHTML += row;
    });
}

// ==================== APPROBATION / REJET ====================
async function approveUser(uid) {
    if (!confirm('Accepter cet utilisateur ?')) return;
    let userDoc;
    try {
        userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) { alert('Utilisateur introuvable'); return; }
    } catch (e) { alert('Erreur lors de la récupération des données utilisateur'); return; }
    const userData = userDoc.data();
    await CacheDB.write('users', uid, { authorized: 'yes', approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, 'update');
    if (userData.role === 'client') {
        const clientData = {
            nom: userData.nom || '',
            prenom: userData.prenom || '',
            email: userData.email || '',
            telephone: userData.telephone || '',
            username: userData.username || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const existingClient = await db.collection('clients').doc(uid).get();
        if (existingClient.exists) await CacheDB.write('clients', uid, clientData, 'update');
        else await CacheDB.write('clients', uid, clientData, 'set');
    }
    alert('✅ Utilisateur accepté avec succès');
    loadPendingRegistrations();
    if (typeof loadUsersList === 'function') loadUsersList();
    if (typeof loadClients === 'function') loadClients();
    CacheDB.sync();
}

async function rejectUser(uid) {
    if (confirm('Refuser et supprimer ?')) {
        await CacheDB.write('users', uid, null, 'delete');
        alert('Supprimé');
        loadPendingRegistrations();
        if (typeof loadUsersList === 'function') loadUsersList();
        CacheDB.sync();
    }
}

// ==================== MODAL & CRUD ====================
function openModal(t, b) {
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var overlayEl = document.getElementById('modalOverlay');
    if (titleEl) titleEl.textContent = t;
    if (bodyEl) bodyEl.innerHTML = b;
    if (overlayEl) overlayEl.classList.remove('hidden');
}

function closeModal() {
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
    editingId = null;
    currentCollection = '';
    editCategoryData = null;
}

function fileToBase64(file, callback, maxWidth, maxHeight, quality) {
    if (!file) { callback(null); return; }
    maxWidth = maxWidth || 600;
    maxHeight = maxHeight || 600;
    quality = quality || 0.6;
    if (!file.type.startsWith('image/')) {
        var reader = new FileReader();
        reader.onload = function(e) { callback(e.target.result); };
        reader.readAsDataURL(file);
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var width = img.width, height = img.height;
            if (width > maxWidth || height > maxHeight) {
                var ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
            }
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            var compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            callback(compressedBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function previewImage(inp, pid) {
    var p = document.getElementById(pid);
    if (!p) return;
    if (inp.files && inp.files[0]) {
        var r = new FileReader();
        r.onload = function(e) { p.innerHTML = '<img src="' + e.target.result + '" style="max-width:100px;margin-top:5px;border-radius:8px;">'; };
        r.readAsDataURL(inp.files[0]);
    }
}

async function saveDocument(cn, data, cb) {
    try {
        let resultId;
        if (editingId) {
            data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            resultId = await CacheDB.write(cn, editingId, data, 'update');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            resultId = await CacheDB.write(cn, null, data, 'add');
        }
        if (cb) cb(resultId);
        CacheDB.sync();
    } catch (err) { alert('Erreur: ' + err.message); }
}

async function deleteDocument(cn, id) {
    if (confirm('Confirmer la suppression ?')) {
        await CacheDB.write(cn, id, null, 'delete');
        if (cn === 'categories') {
            allCategoriesData = allCategoriesData.filter(function(x) { return x.id !== id; });
            renderCategoriesTable();
        } else if (cn === 'products') {
            allProductsData = allProductsData.filter(function(x) { return x.id !== id; });
            renderProductsTable();
        } else if (cn === 'clients') {
            allClientsData = allClientsData.filter(function(x) { return x.id !== id; });
            renderClientsTable();
        } else {
            refreshCurrentPage();
        }
        alert('Supprimé');
        CacheDB.sync();
    }
}

function refreshCurrentPage() {
    var t = document.getElementById('pageTitle').textContent;
    var m = { 'Catégories': 'categories', 'Produits': 'products', 'Clients': 'clients', 'Fournisseurs': 'fournisseurs', 'Dépenses': 'depenses', 'Ventes': 'ventes', 'Crédits': 'credits', 'Commandes en ligne': 'commandes' };
    navigateTo(m[t] || 'dashboard');
}

function editDocument(cn, id) {
    db.collection(cn).doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = cn; openEditForm(cn, doc.data()); }
    }).catch(e => console.error(e));
}

function openEditForm(cn, data) {
    if (cn === 'categories') openCategoryForm(data);
    else if (cn === 'products') openProductForm(data);
    else if (cn === 'clients') openClientForm(data);
    else if (cn === 'fournisseurs') openFournisseurForm(data);
    else if (cn === 'depenses') openDepenseForm(data);
}

// ==================== SYSTÈME DE TRI ====================
function sortTableData(tableName, field, loadFn) {
    if (!sortOrders[tableName]) sortOrders[tableName] = {};
    if (!sortOrders[tableName][field]) sortOrders[tableName][field] = 'asc';
    else sortOrders[tableName][field] = sortOrders[tableName][field] === 'asc' ? 'desc' : 'asc';
    Object.keys(sortOrders[tableName]).forEach(function(k) { if (k !== field) sortOrders[tableName][k] = null; });
    if (typeof loadFn === 'string') window[loadFn]();
    else if (typeof loadFn === 'function') loadFn();
}

function getSortIcon(tableName, field) {
    if (!sortOrders[tableName] || !sortOrders[tableName][field]) return '<i class="fas fa-sort" style="font-size:0.5rem;margin-left:2px;opacity:0.3;cursor:pointer;"></i>';
    return sortOrders[tableName][field] === 'asc' ? '<i class="fas fa-sort-up" style="font-size:0.55rem;margin-left:2px;color:#A67C52;"></i>' : '<i class="fas fa-sort-down" style="font-size:0.55rem;margin-left:2px;color:#A67C52;"></i>';
}

function applySort(tableName, data, defaultField) {
    if (!sortOrders[tableName]) sortOrders[tableName] = {};
    var activeField = Object.keys(sortOrders[tableName]).find(function(k) { return sortOrders[tableName][k]; });
    if (!activeField) activeField = defaultField;
    var order = sortOrders[tableName][activeField] || 'asc';
    return data.sort(function(a, b) {
        var va = a[activeField], vb = b[activeField];
        if (va === undefined || va === null) va = '';
        if (vb === undefined || vb === null) vb = '';
        if (typeof va === 'number' && typeof vb === 'number') return order === 'asc' ? va - vb : vb - va;
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
        if (order === 'asc') return va > vb ? 1 : (va < vb ? -1 : 0);
        else return va < vb ? 1 : (va > vb ? -1 : 0);
    });
}

function makeSortableHeader(tableName, field, label, loadFnName) {
    return '<th onclick="sortTableData(\'' + tableName + '\',\'' + field + '\', \'' + loadFnName + '\')" style="cursor:pointer;white-space:nowrap;">' + label + ' ' + getSortIcon(tableName, field) + '</th>';
}

// ==================== PAGINATION ====================
function getPaginationHTML(tableName, totalItems) {
    var totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return '';
    var page = currentPages[tableName] || 1;
    var html = '<div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-top:15px; flex-wrap:wrap;">';
    html += '<button onclick="changePage(\'' + tableName + '\', ' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px; background:white; cursor:pointer;">« Précédent</button>';
    html += '<span style="font-weight:600;">Page ' + page + ' / ' + totalPages + '</span>';
    html += '<button onclick="changePage(\'' + tableName + '\', ' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + ' style="padding:8px 16px; border:1px solid #e2e8f0; border-radius:8px; background:white; cursor:pointer;">Suivant »</button>';
    html += '</div>';
    return html;
}

function changePage(tableName, newPage) {
    var renderFunctions = {
        categories: renderCategoriesTable,
        products: renderProductsTable,
        clients: renderClientsTable,
        fournisseurs: renderFournisseursTable,
        depenses: renderDepensesTable,
        commandes: renderCommandesTable,
        ventes: renderVentesTable,
        credits: renderCreditsTable,
        users: renderUsersTable
    };
    var dataArrays = {
        categories: allCategoriesData,
        products: allProductsData,
        clients: allClientsData,
        fournisseurs: allFournisseursData,
        depenses: allDepensesData,
        commandes: window.filteredCommandes || allCommandesData,
        ventes: window.filteredVentes || allVentesData,
        credits: window.filteredCredits || allCreditsData,
        users: window.filteredUsers || allUsersData
    };
    var totalItems = (dataArrays[tableName] || []).length;
    var totalPages = Math.ceil(totalItems / itemsPerPage);
    if (newPage < 1 || newPage > totalPages) return;
    currentPages[tableName] = newPage;
    if (renderFunctions[tableName]) renderFunctions[tableName]();
}

function getPageData(tableName, dataArray) {
    var page = currentPages[tableName] || 1;
    var start = (page - 1) * itemsPerPage;
    return dataArray.slice(start, start + itemsPerPage);
}

// ==================== FILTRES ====================
function getPeriodOptions(selected) {
    var periods = [
        { value: 'all', text: 'Toutes les dates' },
        { value: '1', text: 'Aujourd\'hui' },
        { value: '3', text: '3 jours' },
        { value: '7', text: '7 jours' },
        { value: '15', text: '15 jours' },
        { value: '30', text: '1 mois' },
        { value: '90', text: '3 mois' },
        { value: '365', text: '1 an' }
    ];
    return periods.map(p => '<option value="' + p.value + '" ' + (selected == p.value ? 'selected' : '') + '>' + p.text + '</option>').join('');
}

function filterByPeriod(data, period) {
    if (!period || period === 'all') return data;
    var now = Date.now();
    var days = parseInt(period);
    if (isNaN(days)) return data;
    var cutoff = now - days * 86400000;
    return data.filter(function(d) {
        if (!d.createdAt || !d.createdAt.seconds) return false;
        return d.createdAt.seconds * 1000 >= cutoff;
    });
}

function filterBySearch(data, query, fields) {
    if (!query) return data;
    var q = query.toLowerCase().trim();
    return data.filter(function(d) {
        for (var i = 0; i < fields.length; i++) {
            var val = fields[i];
            if (val.startsWith('items.')) {
                var itemField = val.split('.')[1];
                if (d.items && Array.isArray(d.items)) {
                    for (var j = 0; j < d.items.length; j++) {
                        var it = d.items[j];
                        if (it[itemField] && String(it[itemField]).toLowerCase().indexOf(q) !== -1) return true;
                    }
                }
            } else {
                var fieldVal = d[val];
                if (fieldVal && String(fieldVal).toLowerCase().indexOf(q) !== -1) return true;
            }
        }
        return false;
    });
}

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
        '</thead><tbody></tbody>' +
        '</div><div id="categoriesPagination"></div>' +
        '</div>';
    loadCategories();
}

async function loadCategories() {
    currentPages.categories = 1;
    allCategoriesData = [];
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
        document.getElementById('categoriesPagination').innerHTML = '';
        return;
    }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var pc = 0;
        try { var ps = await db.collection('products').where('categorie', '==', d.nom).get(); pc = ps.size; } catch (e) { }
        var im = d.imageBase64 ? '<img src="' + d.imageBase64 + '" style="width:35px;height:35px;object-fit:cover;border-radius:6px;">' : '<i class="fas fa-folder fa-2x" style="color:#A67C52;"></i>';
        var pcol = (d.profit || 0) >= 0 ? '#16a34a' : '#dc2626';
        var recetteBadge = d.recette ? '<span class="status-success">✅ Oui</span>' : '<span class="status-warning">❌ Non</span>';
        tb.innerHTML += '<tr>' +
            '<td>' + im + '</td>' +
            '<td><strong>' + escapeHtml(d.nom || '') + '</strong></td>' +
            '<td>' + escapeHtml(d.description || '-') + '</td>' +
            '<td>' + (d.ca || 0).toFixed(2) + ' MAD</td>' +
            '<td style="color:' + pcol + ';">' + (d.profit || 0).toFixed(2) + ' MAD</td>' +
            '<td>' + pc + '</td>' +
            '<td>' + recetteBadge + '</td>' +
            '<td><button class="btn-edit" onclick="editDocument(\'categories\',\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteDocument(\'categories\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }
    document.getElementById('categoriesPagination').innerHTML = getPaginationHTML('categories', data.length);
}

function openCategoryForm(data) {
    data = data || {};
    editCategoryData = data;
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
        var d = {
            nom: n,
            description: document.getElementById('catDesc').value,
            ca: parseFloat(document.getElementById('catCA').value) || 0,
            profit: parseFloat(document.getElementById('catProfit').value) || 0,
            recette: recette
        };
        d.imageBase64 = img || existingImage;
        saveDocument('categories', d, function() { closeModal(); refreshCurrentPage(); });
    };
    if (f) fileToBase64(f, sf); else sf(null);
}

// ==================== PRODUITS ====================
async function loadStockForProductForm() {
    if (typeof allStockData === 'undefined' || allStockData.length === 0) {
        try {
            const snap = await db.collection('stock').orderBy('nom').get();
            allStockData = [];
            snap.forEach(d => { let dd = d.data(); dd.id = d.id; allStockData.push(dd); });
        } catch (e) { console.error(e); }
    }
}

function renderIngredientRow(index, ing) {
    ing = ing || {};
    var stockOptions = '<option value="">-- Choisir --</option>';
    if (typeof allStockData !== 'undefined') {
        allStockData.forEach(function(s) {
            var selected = (ing.idStock === s.id) ? 'selected' : '';
            stockOptions += '<option value="' + s.id + '" ' + selected + '>' + escapeHtml(s.nom) + ' (' + (s.unite || '') + ')</option>';
        });
    }
    return '<div class="ingredient-row" style="display:flex; gap:8px; align-items:center;">' +
        '<select class="ingredient-select" style="flex:1; padding:10px; border:2px solid #e2e8f0; border-radius:8px;" onchange="updateIngredientUnit(this)">' + stockOptions + '</select>' +
        '<input type="number" class="ingredient-qty" placeholder="Qté" value="' + (ing.quantite || '') + '" step="any" style="width:100px; padding:10px; border:2px solid #e2e8f0; border-radius:8px;">' +
        '<span class="ingredient-unit" style="min-width:60px; text-align:center;">' + (ing.unite || '') + '</span>' +
        '<button type="button" class="btn-delete" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>' +
        '</div>';
}

function addIngredientRow() {
    var container = document.getElementById('productIngredientsList');
    if (container) {
        container.insertAdjacentHTML('beforeend', renderIngredientRow(container.children.length, {}));
    }
}

function updateIngredientUnit(selectEl) {
    var row = selectEl.closest('.ingredient-row');
    var unitSpan = row.querySelector('.ingredient-unit');
    var selectedId = selectEl.value;
    var stockItem = allStockData.find(function(s) { return s.id === selectedId; });
    if (stockItem) {
        unitSpan.textContent = stockItem.unite || '';
    } else {
        unitSpan.textContent = '';
    }
}

function loadProductsPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-coffee"></i> Produits</h3><div style="display:flex;gap:10px;flex-wrap:wrap;"><select id="categoryFilter" onchange="filterProducts()"><option value="">Toutes catégories</option></select><button class="btn-add" onclick="openProductForm()"><i class="fas fa-plus"></i> Nouveau</button></div></div>' +
        '<div class="table-container"><table class="data-table" id="productsTable" style="font-size:0.7rem;"><thead><tr><th>Img</th>' +
        makeSortableHeader('products', 'nom', 'Nom', 'loadProducts') +
        makeSortableHeader('products', 'categorie', 'Catégorie', 'loadProducts') +
        makeSortableHeader('products', 'prixAchat', 'Achat', 'loadProducts') +
        makeSortableHeader('products', 'prixVente', 'Vente', 'loadProducts') +
        makeSortableHeader('products', 'prixPromo', 'Promo', 'loadProducts') +
        makeSortableHeader('products', 'profit', 'Profit', 'loadProducts') +
        makeSortableHeader('products', 'stock', 'Stock', 'loadProducts') +
        makeSortableHeader('products', 'vendues', 'Vendues', 'loadProducts') +
        makeSortableHeader('products', 'ca', 'CA', 'loadProducts') +
        makeSortableHeader('products', 'disponible', 'Dispo', 'loadProducts') +
        '<th>Temps</th><th>Desc</th><th>Actions</th>' +
        '</thead><tbody></tbody>' +
        '</div><div id="productsPagination"></div>' +
        '</div>';
    loadCategoriesInFilter();
    loadProducts();
}

async function loadCategoriesInFilter() {
    var s = document.getElementById('categoryFilter');
    if (!s) return;
    try {
        var sn = await db.collection('categories').get();
        s.innerHTML = '<option value="">Toutes catégories</option>';
        sn.forEach(function(d) { s.innerHTML += '<option value="' + escapeHtml(d.data().nom) + '">' + escapeHtml(d.data().nom) + '</option>'; });
    } catch (e) { }
}

function filterProducts() {
    selectedCategoryFilter = document.getElementById('categoryFilter').value;
    currentPages.products = 1;
    renderProductsTable();
}

async function loadProducts() {
    currentPages.products = 1;
    allProductsData = [];
    try {
        const snapshot = await db.collection('products').get();
        snapshot.forEach(d => {
            let dd = d.data();
            dd.id = d.id;
            let prix = (dd.prixPromo && dd.prixPromo > 0) ? dd.prixPromo : (dd.prixVente || 0);
            dd.profit = (prix - (dd.prixAchat || 0));
            allProductsData.push(dd);
        });
        for (let doc of allProductsData) await CacheDB.set('products', doc.id, doc);
    } catch (e) { console.error(e); }
    renderProductsTable();
}

function renderProductsTable() {
    var tb = document.querySelector('#productsTable tbody');
    if (!tb) return;
    var data = allProductsData.slice();
    if (selectedCategoryFilter) data = data.filter(function(d) { return d.categorie === selectedCategoryFilter; });
    data = applySort('products', data, 'nom');
    var pageData = getPageData('products', data);
    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;">Aucun produit</td><tr>';
        document.getElementById('productsPagination').innerHTML = '';
        return;
    }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var im = d.imageBase64 ? '<img src="' + d.imageBase64 + '" style="width:30px;height:30px;object-fit:cover;border-radius:4px;">' : '<i class="fas fa-coffee" style="color:#94a3b8;"></i>';
        var disp = d.disponible !== false ? '<span class="status-success">Oui</span>' : '<span class="status-danger">Non</span>';
        var profitVal = (d.profit !== undefined && !isNaN(d.profit)) ? d.profit : 0;
        var pc = profitVal >= 0 ? '#16a34a' : '#dc2626';
        tb.innerHTML += '<tr>' +
            '<td>' + im + '</td>' +
            '<td><strong>' + escapeHtml(d.nom || '') + '</strong></td>' +
            '<td>' + escapeHtml(d.categorie || '-') + '</td>' +
            '<td>' + ((d.prixAchat || 0).toFixed(2)) + '</td>' +
            '<td>' + ((d.prixVente || 0).toFixed(2)) + '</td>' +
            '<td>' + ((d.prixPromo || 0).toFixed(2)) + '</td>' +
            '<td style="color:' + pc + ';">' + profitVal.toFixed(2) + '</td>' +
            '<td>' + (d.stock || 0) + '</td>' +
            '<td>' + (d.vendues || 0) + '</td>' +
            '<td>' + ((d.ca || 0).toFixed(2)) + '</td>' +
            '<td>' + disp + '</td>' +
            '<td>' + (d.tempsPrep || '-') + '</td>' +
            '<td>' + (d.description || '-') + '</td>' +
            '<td><button class="btn-edit" onclick="editDocument(\'products\',\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteDocument(\'products\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }
    document.getElementById('productsPagination').innerHTML = getPaginationHTML('products', data.length);
}

async function openProductForm(data) {
    data = data || {};
    await loadStockForProductForm();
    var co = '';
    try {
        var cs = await db.collection('categories').get();
        cs.forEach(function(d) { var sel = data.categorie === d.data().nom ? 'selected' : ''; co += '<option value="' + escapeHtml(d.data().nom) + '" ' + sel + '>' + escapeHtml(d.data().nom) + '</option>'; });
    } catch (e) { }
    var ip = data.imageBase64 ? '<img src="' + data.imageBase64 + '" style="max-width:100px;">' : '';
    var dy = data.disponible !== false ? 'selected' : '', dn = data.disponible === false ? 'selected' : '';
    var h = '<div class="form-row"><div class="form-group"><label>Image</label><input type="file" id="prodImage" onchange="previewImage(this,\'prodPreview\')"><div id="prodPreview">' + ip + '</div></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="prodNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Catégorie</label><select id="prodCat"><option value="">-</option>' + co + '</select></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Prix Achat</label><input type="number" id="prodPA" value="' + (data.prixAchat || 0) + '" step="0.01"></div><div class="form-group"><label>Prix Vente</label><input type="number" id="prodPV" value="' + (data.prixVente || 0) + '" step="0.01"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Prix Promo</label><input type="number" id="prodPromo" value="' + (data.prixPromo || 0) + '" step="0.01"></div><div class="form-group"><label>Stock</label><input type="number" id="prodStock" value="' + (data.stock || 0) + '"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Temps Prep</label><input type="text" id="prodTemps" value="' + escapeHtml(data.tempsPrep || '') + '" placeholder="15 min"></div><div class="form-group"><label>Disponible</label><select id="prodDispo"><option value="1" ' + dy + '>Oui</option><option value="0" ' + dn + '>Non</option></select></div></div>' +
        '<div class="form-row"><div class="form-group"><label>Description</label><textarea id="prodDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<div class="form-row" style="flex-direction:column;">';
    h += '<label style="font-weight:600; margin-bottom:10px;">🧾 Recette (ingrédients du stock)</label>';
    h += '<div id="productIngredientsList" style="display:flex; flex-direction:column; gap:8px;">';
    if (data.ingredients && data.ingredients.length > 0) {
        data.ingredients.forEach(function(ing, idx) { h += renderIngredientRow(idx, ing); });
    }
    h += '</div>';
    h += '<button type="button" class="btn-add" onclick="addIngredientRow()" style="margin-top:10px; width:auto;"><i class="fas fa-plus"></i> Ajouter un ingrédient</button>';
    h += '</div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveProduct()">Enregistrer</button>';
    currentCollection = 'products';
    openModal(editingId ? 'Modifier Produit' : 'Nouveau Produit', h);
}

function saveProduct() {
    var n = document.getElementById('prodNom').value;
    if (!n) { alert('Nom obligatoire'); return; }
    var f = document.getElementById('prodImage').files[0];
    var ingredients = [];
    var rows = document.querySelectorAll('#productIngredientsList .ingredient-row');
    rows.forEach(function(row) {
        var select = row.querySelector('.ingredient-select');
        var qtyInput = row.querySelector('.ingredient-qty');
        if (select && select.value && qtyInput && parseFloat(qtyInput.value) > 0) {
            var stockId = select.value;
            var stockItem = allStockData.find(function(s) { return s.id === stockId; });
            ingredients.push({
                idStock: stockId,
                nom: stockItem ? stockItem.nom : '',
                quantite: parseFloat(qtyInput.value),
                unite: stockItem ? stockItem.unite : ''
            });
        }
    });
    var sf = function(img) {
        var d = {
            nom: n,
            categorie: document.getElementById('prodCat').value,
            prixAchat: parseFloat(document.getElementById('prodPA').value) || 0,
            prixVente: parseFloat(document.getElementById('prodPV').value) || 0,
            prixPromo: parseFloat(document.getElementById('prodPromo').value) || 0,
            stock: parseInt(document.getElementById('prodStock').value) || 0,
            vendues: 0,
            ca: 0,
            tempsPrep: document.getElementById('prodTemps').value,
            disponible: document.getElementById('prodDispo').value === '1',
            description: document.getElementById('prodDesc').value,
            ingredients: ingredients
        };
        if (img) d.imageBase64 = img;
        if (editingId) {
            CacheDB.write('products', editingId, d, 'update').then(function() {
                var idx = allProductsData.findIndex(function(x) { return x.id === editingId; });
                if (idx !== -1) allProductsData[idx] = Object.assign({}, allProductsData[idx], d, { id: editingId });
                closeModal();
                renderProductsTable();
                CacheDB.sync();
            });
        } else {
            CacheDB.write('products', null, d, 'add').then(function(newId) {
                d.id = newId;
                allProductsData.push(d);
                closeModal();
                renderProductsTable();
                CacheDB.sync();
            });
        }
    };
    if (f) fileToBase64(f, sf); else sf(null);
}

// ==================== CLIENTS ====================
function loadClientsPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-users"></i> Clients</h3><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
        '<div class="input-group" style="width:300px;min-width:200px;margin-bottom:0;background:#fff;border:2px solid var(--border);border-radius:12px;"><i class="fas fa-search" style="color:#94a3b8;"></i><input type="text" id="clientSearchInput" placeholder="Rechercher..." onkeyup="clientSearch(this.value)" style="border:none;padding:12px;"></div>' +
        '<button class="btn-add" onclick="openClientForm()"><i class="fas fa-plus"></i> Ajouter</button>' +
        '</div></div>' +
        '<div class="table-container"><table class="data-table" id="clientsTable" style="font-size:0.6rem;"><thead><tr>' +
        makeSortableHeader('clients', 'id', 'ID', 'loadClients') +
        makeSortableHeader('clients', 'nom', 'Nom', 'loadClients') +
        makeSortableHeader('clients', 'prenom', 'Prénom', 'loadClients') +
        makeSortableHeader('clients', 'username', 'Username', 'loadClients') +
        makeSortableHeader('clients', 'genre', 'Genre', 'loadClients') +
        makeSortableHeader('clients', 'adresse', 'Adresse', 'loadClients') +
        makeSortableHeader('clients', 'email', 'Email', 'loadClients') +
        makeSortableHeader('clients', 'telephone', 'Tél', 'loadClients') +
        makeSortableHeader('clients', 'whatsapp', 'WhatsApp', 'loadClients') +
        makeSortableHeader('clients', 'facebook', 'Facebook', 'loadClients') +
        makeSortableHeader('clients', 'instagram', 'Instagram', 'loadClients') +
        makeSortableHeader('clients', 'ca', 'CA', 'loadClients') +
        makeSortableHeader('clients', 'profit', 'Profit', 'loadClients') +
        makeSortableHeader('clients', 'pointsFidelite', 'Points Fid', 'loadClients') +
        makeSortableHeader('clients', 'allergies', 'Allergies', 'loadClients') +
        makeSortableHeader('clients', 'aime', 'Aime', 'loadClients') +
        makeSortableHeader('clients', 'deteste', 'Déteste', 'loadClients') +
        makeSortableHeader('clients', 'createdAt', 'Date créé', 'loadClients') +
        '<th>Actions</th>' +
        '</thead><tbody></tbody>' +
        '</div><div id="clientsPagination"></div>' +
        '</div>';
    loadClients();
}

function clientSearch(query) { clientSearchQuery = query.toLowerCase().trim(); currentPages.clients = 1; renderClientsTable(); }

async function loadClients() {
    try {
        const cached = await CacheDB.getAll('clients');
        if (cached.length) allClientsData = cached;
        const snapshot = await db.collection('clients').get();
        allClientsData = [];
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allClientsData.push(dd); });
        for (let doc of allClientsData) await CacheDB.set('clients', doc.id, doc);
    } catch (e) { console.error(e); }
    currentPages.clients = 1;
    renderClientsTable();
}

function renderClientsTable() {
    var tb = document.querySelector('#clientsTable tbody');
    if (!tb) return;
    var data = allClientsData.slice();
    if (clientSearchQuery) {
        data = data.filter(function(d) {
            return (d.nom || '').toLowerCase().indexOf(clientSearchQuery) !== -1 ||
                (d.prenom || '').toLowerCase().indexOf(clientSearchQuery) !== -1 ||
                (d.username || '').toLowerCase().indexOf(clientSearchQuery) !== -1 ||
                (d.email || '').toLowerCase().indexOf(clientSearchQuery) !== -1 ||
                (d.telephone || '').toLowerCase().indexOf(clientSearchQuery) !== -1;
        });
    }
    data = applySort('clients', data, 'nom');
    var pageData = getPageData('clients', data);
    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="19" style="text-align:center;padding:30px;">Aucun client</td></tr>';
        document.getElementById('clientsPagination').innerHTML = '';
        return;
    }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateCreated = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('fr-FR') + ' ' + new Date(d.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
        var row = '<tr>';
        row += '<td><small>' + (d.id || '').substring(0, 6) + '</small></td>';
        row += '<td><strong>' + escapeHtml(d.nom || '') + '</strong></td>';
        row += '<td>' + escapeHtml(d.prenom || '') + '</td>';
        row += '<td>@' + escapeHtml(d.username || '') + '</td>';
        row += '<td>' + escapeHtml(d.genre || '-') + '</td>';
        row += '<td><small>' + escapeHtml(d.adresse || '-') + '</small></td>';
        row += '<td><small>' + escapeHtml(d.email || '-') + '</small></td>';
        row += '<td>' + escapeHtml(d.telephone || '-') + '</td>';
        row += '<td>' + escapeHtml(d.whatsapp || '-') + '</td>';
        row += '<td>' + escapeHtml(d.facebook || '-') + '</td>';
        row += '<td>' + escapeHtml(d.instagram || '-') + '</td>';
        row += '<td style="color:#16a34a;font-weight:600;">' + (d.ca || 0).toFixed(2) + '</td>';
        row += '<td style="color:#16a34a;">' + (d.profit || 0).toFixed(2) + '</td>';
        row += '<td style="color:#A67C52;font-weight:600;">' + (d.pointsFidelite || 0) + '</td>';
        row += '<td><small>' + (d.allergies ? d.allergies.join(', ') : '-') + '</small></td>';
        row += '<td><small>' + (d.aime ? d.aime.join(', ') : '-') + '</small></td>';
        row += '<td><small>' + (d.deteste ? d.deteste.join(', ') : '-') + '</small></td>';
        row += '<td><small>' + dateCreated + '</small></td>';
        row += '<td><button class="btn-edit" onclick="editClient(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteClient(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>';
        row += '</tr>';
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
    currentCollection = 'clients';
    openModal(editingId ? 'Modifier Client' : 'Nouveau Client', h);
}

function saveClient() {
    var n = document.getElementById('cliNom').value, p = document.getElementById('cliPrenom').value;
    if (!n || !p) { alert('Nom et Prénom obligatoires'); return; }
    var d = {
        nom: n, prenom: p, username: document.getElementById('cliUsername').value,
        genre: document.getElementById('cliGenre').value, adresse: document.getElementById('cliAdresse').value,
        email: document.getElementById('cliEmail').value, telephone: document.getElementById('cliTel').value,
        whatsapp: document.getElementById('cliWhatsapp').value, facebook: document.getElementById('cliFacebook').value,
        instagram: document.getElementById('cliInstagram').value, ca: parseFloat(document.getElementById('cliCA').value) || 0,
        profit: parseFloat(document.getElementById('cliProfit').value) || 0,
        pointsFidelite: parseInt(document.getElementById('cliPoints').value) || 0,
        allergies: document.getElementById('cliAllergies').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        aime: document.getElementById('cliAime').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        deteste: document.getElementById('cliDeteste').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        description: document.getElementById('cliDesc').value
    };
    if (!editingId) d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    saveDocument('clients', d, function() { closeModal(); loadClients(); });
}

function editClient(id) {
    db.collection('clients').doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = 'clients'; openClientForm(doc.data()); }
    });
}

function deleteClient(id) {
    if (confirm('Supprimer ce client ?')) {
        CacheDB.write('clients', id, null, 'delete').then(function() { alert('Supprimé'); loadClients(); CacheDB.sync(); });
    }
}

// ==================== FOURNISSEURS ====================
function loadFournisseursPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-truck"></i> Fournisseurs</h3><button class="btn-add" onclick="openFournisseurForm()"><i class="fas fa-plus"></i> Ajouter</button></div>' +
        '<div class="table-container"><table class="data-table" id="fournisseursTable" style="font-size:0.6rem;"><thead><tr>' +
        makeSortableHeader('fournisseurs', 'id', 'ID', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'nom', 'Nom', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'prenom', 'Prénom', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'societe', 'Société', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'telephone', 'Tél', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'whatsapp', 'WhatsApp', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'email', 'Email', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'adresse', 'Adresse', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'description', 'Description', 'loadFournisseurs') +
        makeSortableHeader('fournisseurs', 'ca', 'CA', 'loadFournisseurs') +
        '<th>Catégories</th>' +
        makeSortableHeader('fournisseurs', 'createdAt', 'Date créé', 'loadFournisseurs') +
        '<th>Actions</th>' +
        '</thead><tbody></tbody>' +
        '</div><div id="fournisseursPagination"></div>' +
        '</div>';
    loadFournisseurs();
}

async function loadFournisseurs() {
    try {
        const cached = await CacheDB.getAll('fournisseurs');
        if (cached.length) allFournisseursData = cached;
        const snapshot = await db.collection('fournisseurs').get();
        allFournisseursData = [];
        snapshot.forEach(d => { let dd = d.data(); dd.id = d.id; allFournisseursData.push(dd); });
        for (let doc of allFournisseursData) await CacheDB.set('fournisseurs', doc.id, doc);
    } catch (e) { console.error(e); }
    currentPages.fournisseurs = 1;
    renderFournisseursTable();
}

function renderFournisseursTable() {
    var tb = document.querySelector('#fournisseursTable tbody');
    if (!tb) return;
    var data = applySort('fournisseurs', allFournisseursData.slice(), 'nom');
    var pageData = getPageData('fournisseurs', data);
    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:30px;">Aucun fournisseur</td></tr>';
        document.getElementById('fournisseursPagination').innerHTML = '';
        return;
    }
    for (var i = 0; i < pageData.length; i++) {
        var d = pageData[i];
        var dateCreated = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('fr-FR') + ' ' + new Date(d.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
        var categories = d.categories ? d.categories.join(', ') : '-';
        tb.innerHTML += '<tr>' +
            '<td><small>' + (d.id || '').substring(0, 6) + '</small></td>' +
            '<td><strong>' + escapeHtml(d.nom || '') + '</strong></td>' +
            '<td>' + escapeHtml(d.prenom || '') + '</td>' +
            '<td>' + escapeHtml(d.societe || '-') + '</td>' +
            '<td>' + escapeHtml(d.telephone || '-') + '</td>' +
            '<td>' + escapeHtml(d.whatsapp || '-') + '</td>' +
            '<td><small>' + escapeHtml(d.email || '-') + '</small></td>' +
            '<td><small>' + escapeHtml(d.adresse || '-') + '</small></td>' +
            '<td><small>' + escapeHtml(d.description || '-') + '</small></td>' +
            '<td>' + (d.ca || 0).toFixed(2) + ' MAD</td>' +
            '<td><small>' + escapeHtml(categories) + '</small></td>' +
            '<td><small>' + dateCreated + '</small></td>' +
            '<td><button class="btn-edit" onclick="editFournisseur(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteFournisseur(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
    }
    document.getElementById('fournisseursPagination').innerHTML = getPaginationHTML('fournisseurs', data.length);
}

function openFournisseurForm(data) {
    data = data || {};
    var selectedCategories = data.categories || [];
    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="fourNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Prénom</label><input type="text" id="fourPrenom" value="' + escapeHtml(data.prenom || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Société</label><input type="text" id="fourSociete" value="' + escapeHtml(data.societe || '') + '"></div><div class="form-group"><label>Téléphone</label><input type="text" id="fourTel" value="' + escapeHtml(data.telephone || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>WhatsApp</label><input type="text" id="fourWhatsapp" value="' + escapeHtml(data.whatsapp || '') + '"></div><div class="form-group"><label>Email</label><input type="email" id="fourEmail" value="' + escapeHtml(data.email || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Adresse</label><input type="text" id="fourAdresse" value="' + escapeHtml(data.adresse || '') + '"></div><div class="form-group"><label>CA</label><input type="number" id="fourCA" value="' + (data.ca || 0) + '" step="0.01"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Description</label><textarea id="fourDesc">' + escapeHtml(data.description || '') + '</textarea></div></div>';
    h += '<div class="form-row"><div class="form-group" style="min-width:100%;"><label>Catégories</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:5px;">';
    fournisseurCategoriesList.forEach(function(cat) {
        var checked = selectedCategories.indexOf(cat) !== -1 ? 'checked' : '';
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.8rem;"><input type="checkbox" class="four-cat-check" value="' + cat + '" ' + checked + '> ' + cat + '</label>';
    });
    h += '</div></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveFournisseur()">Enregistrer</button>';
    currentCollection = 'fournisseurs';
    openModal(editingId ? 'Modifier Fournisseur' : 'Nouveau Fournisseur', h);
}

function saveFournisseur() {
    var nom = document.getElementById('fourNom').value;
    if (!nom) { alert('Nom obligatoire'); return; }
    var categories = [];
    document.querySelectorAll('.four-cat-check:checked').forEach(function(cb) { categories.push(cb.value); });
    var d = {
        nom: nom,
        prenom: document.getElementById('fourPrenom').value,
        societe: document.getElementById('fourSociete').value,
        telephone: document.getElementById('fourTel').value,
        whatsapp: document.getElementById('fourWhatsapp').value,
        email: document.getElementById('fourEmail').value,
        adresse: document.getElementById('fourAdresse').value,
        ca: parseFloat(document.getElementById('fourCA').value) || 0,
        description: document.getElementById('fourDesc').value,
        categories: categories
    };
    if (!editingId) d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    saveDocument('fournisseurs', d, function() { closeModal(); loadFournisseurs(); });
}

function editFournisseur(id) {
    db.collection('fournisseurs').doc(id).get().then(function(doc) {
        if (doc.exists) { editingId = id; currentCollection = 'fournisseurs'; openFournisseurForm(doc.data()); }
    });
}

function deleteFournisseur(id) {
    if (confirm('Supprimer ce fournisseur ?')) {
        CacheDB.write('fournisseurs', id, null, 'delete').then(function() { alert('Supprimé'); loadFournisseurs(); CacheDB.sync(); });
    }
}

// ==================== COMMANDES EN LIGNE ====================
function loadCommandesPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-shopping-basket"></i> Commandes en ligne</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<input type="text" id="commandesSearchInput" placeholder="🔍 Rechercher (client, email, tél, produit)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="commandesSearch = this.value; currentPages.commandes=1; applyCommandesFilters();">' +
        '<select id="commandesPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="commandesPeriod = this.value; currentPages.commandes=1; applyCommandesFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadCommandes()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div><div id="commandesTableContainer"></div><div id="commandesPagination" style="margin-top:10px;"></div>' +
        '</div>';
    loadCommandes();
}

async function loadCommandes() {
    try {
        const snapshot = await db.collection('commandes')
            .orderBy('createdAt', 'desc')
            .limit(500)
            .get();
        allCommandesData = [];
        snapshot.forEach(dc => {
            var d = dc.data();
            d.id = dc.id;
            if (d.source === 'client') allCommandesData.push(d);
        });
    } catch (e) {
        console.error('Erreur chargement commandes en ligne :', e);
        const fallback = await db.collection('commandes').get();
        allCommandesData = [];
        fallback.forEach(dc => {
            var d = dc.data();
            if (d.source === 'client') {
                d.id = dc.id;
                allCommandesData.push(d);
            }
        });
        allCommandesData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    currentPages.commandes = 1;
    applyCommandesFilters();
}

function applyCommandesFilters() {
    var filtered = filterByPeriod(allCommandesData, commandesPeriod);
    filtered = filterBySearch(filtered, commandesSearch, ['clientName', 'clientEmail', 'clientTelephone', 'items.nom']);
    if (!sortOrders.commandes || !sortOrders.commandes.createdAt) {
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
    var data = (window.filteredCommandes || allCommandesData).slice();
    if (!sortOrders.commandes || !sortOrders.commandes.createdAt) {
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
        '<th>Actions</th>' +
        '</thead><tbody>';
    pageData.forEach(function(d) {
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var arts = d.items ? d.items.map(function(it) { return '<strong>' + it.quantite + 'x</strong> ' + escapeHtml(it.nom); }).join('<br>') : '';
        var opts = d.items ? d.items.map(function(it) {
            var o = [];
            if (it.sauces && it.sauces.length) o.push('<span style="color:#A67C52;">🥫' + escapeHtml(it.sauces.join(',')) + '</span>');
            if (it.interdits && it.interdits.length) o.push('<span style="color:#ef4444;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>');
            if (it.epice && it.epice !== 'Normal') o.push('<span style="color:#d97706;">🌶️' + escapeHtml(it.epice) + '</span>');
            if (it.sel && it.sel !== 'Normal') o.push('<span style="color:#4f46e5;">🧂' + escapeHtml(it.sel) + '</span>');
            return o.length ? o.join(' | ') : '-';
        }).join('<br>') : '-';
        var sc = d.statut === 'payé' ? '#4f46e5' : (d.statut === 'valide' ? '#16a34a' : '#d97706');
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
        h += '<tr>' +
            '<td>' + dt + '</td>' +
            '<td><strong>' + escapeHtml(d.clientName || '') + '</strong></td>' +
            '<td>' + escapeHtml(d.clientEmail || '-') + '</td>' +
            '<td>' + escapeHtml(d.clientTelephone || '-') + '</td>' +
            '<td>' + arts + '</td>' +
            '<td>' + opts + '</td>' +
            '<td><strong>' + d.total.toFixed(2) + ' MAD</strong></td>' +
            '<td><span style="color:' + sc + ';">' + sl + '</span></td>' +
            '<td>' + act + '</td>' +
            '</tr>';
    });
    h += '</tbody>' +
        '</div>';
    cont.innerHTML = h;
    document.getElementById('commandesPagination').innerHTML = getPaginationHTML('commandes', data.length);
}

async function validateCommande(cid) {
    if (!confirm('Valider cette commande ?')) return;
    await CacheDB.write('commandes', cid, { statut: 'valide', validatedAt: firebase.firestore.FieldValue.serverTimestamp(), validatedBy: window.currentUserData ? window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom : 'Admin' }, 'update');
    alert('✅ Validée !'); loadCommandes(); CacheDB.sync();
}

async function payCommande(cid) {
    if (!confirm('Payer cette commande ? Redirection vers le POS...')) return;
    var dc = await db.collection('commandes').doc(cid).get(); if (!dc.exists) { alert('Introuvable'); return; }
    var cmd = dc.data();
    localStorage.setItem('posCommandeData', JSON.stringify({ commandeId: cid, clientId: cmd.clientId, clientName: cmd.clientName, items: cmd.items, total: cmd.total, table: cmd.table || '' }));
    navigateTo('pos');
}

function cancelCommande(cid) {
    if (confirm('Annuler ?')) {
        CacheDB.write('commandes', cid, { statut: 'annule' }, 'update').then(function() { alert('❌ Annulée'); loadCommandes(); CacheDB.sync(); });
    }
}

// ==================== VENTES ====================
function loadVentesPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-shopping-cart"></i> Ventes</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<input type="text" id="ventesSearchInput" placeholder="🔍 Rechercher (client, produit)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="ventesSearch = this.value; currentPages.ventes=1; applyVentesFilters();">' +
        '<select id="ventesPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="ventesPeriod = this.value; currentPages.ventes=1; applyVentesFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadVentes()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div><div id="ventesTableContainer"></div><div id="ventesPagination" style="margin-top:10px;"></div>' +
        '</div>';
    loadVentes();
}

async function loadVentes() {
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var vendeurCaissier = '';
    if (!isAdmin && window.currentUserData) vendeurCaissier = window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom;
    try {
        const snapshot = await db.collection('ventes').orderBy('createdAt', 'desc').limit(2000).get();
        allVentesData = [];
        snapshot.forEach(dc => {
            var d = dc.data(); d.id = dc.id;
            var achat = 0, profit = 0;
            if (d.items) {
                d.items.forEach(function(it) {
                    var pa = it.prixAchat || 0, pv = it.prixVente || 0, pp = it.prixPromo || 0, pvr = (pp > 0) ? pp : pv, q = it.quantite || 1;
                    achat += pa * q; profit += (pvr - pa) * q;
                });
            }
            d.achat = achat; d.profit = profit;
            allVentesData.push(d);
        });
        if (!isAdmin) allVentesData = allVentesData.filter(function(d) { return d.vendeur === vendeurCaissier; });
    } catch (e) { console.error(e); }
    currentPages.ventes = 1;
    applyVentesFilters();
}

function applyVentesFilters() {
    var filtered = filterByPeriod(allVentesData, ventesPeriod);
    filtered = filterBySearch(filtered, ventesSearch, ['clientName', 'items.nom']);
    window.filteredVentes = filtered;
    renderVentesTable();
}

function renderVentesTable() {
    var cont = document.getElementById('ventesTableContainer');
    if (!cont) return;
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var data = applySort('ventes', (window.filteredVentes || allVentesData).slice(), 'createdAt');
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
        (isAdmin ? makeSortableHeader('ventes', 'achat', 'Achat', 'renderVentesTable') + makeSortableHeader('ventes', 'profit', 'Profit', 'renderVentesTable') : '') +
        makeSortableHeader('ventes', 'total', 'Total', 'renderVentesTable') +
        makeSortableHeader('ventes', 'discountMAD', 'Remise', 'renderVentesTable') +
        makeSortableHeader('ventes', 'amountGiven', 'Donné', 'renderVentesTable') +
        makeSortableHeader('ventes', 'change', 'Rendu', 'renderVentesTable') +
        makeSortableHeader('ventes', 'vendeur', 'Vendeur', 'renderVentesTable') +
        makeSortableHeader('ventes', 'paymentMethod', 'Paiement', 'renderVentesTable') +
        makeSortableHeader('ventes', 'statutPaiement', 'Statut', 'renderVentesTable') +
        '<th>Actions</th>' +
        '</thead><tbody>';
    pageData.forEach(function(d) {
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var cl = d.clientName || d.table || '-';
        var arts = d.items ? d.items.map(function(it) { return '<strong>' + it.quantite + 'x</strong> ' + escapeHtml(it.nom); }).join('<br>') : '-';
        var opts = d.items ? d.items.map(function(it) {
            var o = [];
            if (it.sauces && it.sauces.length) o.push('<span style="color:#A67C52;">🥫' + escapeHtml(it.sauces.join(',')) + '</span>');
            if (it.interdits && it.interdits.length) o.push('<span style="color:#ef4444;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>');
            if (it.epice && it.epice !== 'Normal') o.push('<span style="color:#d97706;">🌶️' + escapeHtml(it.epice) + '</span>');
            if (it.sel && it.sel !== 'Normal') o.push('<span style="color:#4f46e5;">🧂' + escapeHtml(it.sel) + '</span>');
            return o.length ? o.join(' | ') : '-';
        }).join('<br>') : '-';
        tv += d.total || 0;
        var amountGiven = d.amountGiven || 0;
        var change = d.change || 0;
        var statutLabel = d.statutPaiement || (d.paid ? 'payé' : 'impayé');
        var statutColor = statutLabel === 'payé' ? '#16a34a' : (statutLabel === 'crédit' ? '#A67C52' : (statutLabel === 'partiel' ? '#d97706' : '#ef4444'));
        var actions = '<button class="btn-edit" onclick="printFacture(\'' + d.id + '\')"><i class="fas fa-print"></i></button> ';
        if (!d.paid) actions += '<button class="btn-add" style="padding:4px 6px;font-size:0.65rem;" onclick="payerVente(\'' + d.id + '\')"><i class="fas fa-check"></i> Payer</button> ';
        if (isAdmin) actions += '<button class="btn-edit" onclick="editVente(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> <button class="btn-delete" onclick="deleteVente(\'' + d.id + '\')"><i class="fas fa-trash"></i></button>';
        h += '<tr>' +
            '<td><strong>' + (d.factureNum || d.id.substring(0, 8)) + '</strong></td>' +
            '<td>' + dt + '</td>' +
            '<td>' + cl + '</td>' +
            '<td>' + arts + '</td>' +
            '<td>' + opts + '</td>' +
            (isAdmin ? '<td>' + d.achat.toFixed(2) + '</td><td style="color:#16a34a;">' + d.profit.toFixed(2) + '</td>' : '') +
            '<td><strong>' + (d.total || 0).toFixed(2) + '</strong></td>' +
            '<td>' + (d.discountMAD || 0).toFixed(2) + '</td>' +
            '<td>' + amountGiven.toFixed(2) + '</td>' +
            '<td>' + change.toFixed(2) + '</td>' +
            '<td>' + (d.vendeur || '-') + '</td>' +
            '<td>' + (d.paymentMethod || '-') + '</td>' +
            '<td><span style="color:' + statutColor + ';font-weight:600;">' + statutLabel + '</span></td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
    });
    h += '</tbody>' +
        '</div><div style="margin-top:15px;padding:15px;background:#f0fdf4;border-radius:12px;text-align:center;"><strong>Total: ' + tv.toFixed(2) + ' MAD</strong></div>';
    cont.innerHTML = h;
    document.getElementById('ventesPagination').innerHTML = getPaginationHTML('ventes', data.length);
}

function editVente(did) {
    db.collection('ventes').doc(did).get().then(function(doc) {
        if (doc.exists) {
            editingId = did; currentCollection = 'ventes';
            var d = doc.data();
            var h = '<div class="form-row"><div class="form-group"><label>Statut paiement</label><select id="editStatut"><option value="payé" ' + (d.statutPaiement === 'payé' ? 'selected' : '') + '>Payé</option><option value="crédit" ' + (d.statutPaiement === 'crédit' ? 'selected' : '') + '>Crédit</option><option value="partiel" ' + (d.statutPaiement === 'partiel' ? 'selected' : '') + '>Partiel</option><option value="en_attente" ' + (d.statutPaiement === 'en_attente' ? 'selected' : '') + '>En attente</option></select></div><div class="form-group"><label>Montant donné</label><input type="number" id="editAmountGiven" value="' + (d.amountGiven || 0) + '" step="0.01"></div></div>';
            h += '<div class="form-row"><div class="form-group"><label>Montant rendu</label><input type="number" id="editChange" value="' + (d.change || 0) + '" step="0.01"></div><div class="form-group"><label>Reste à payer</label><input type="number" id="editRemaining" value="' + (d.remainingAmount || 0) + '" step="0.01"></div></div>';
            h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveEditVente()">Enregistrer</button>';
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
    var data = { statutPaiement: statut, amountGiven: amountGiven, change: change, remainingAmount: paid ? 0 : remaining, paid: paid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    saveDocument('ventes', data, function() { closeModal(); loadVentes(); });
}

function deleteVente(did) {
    if (confirm('Supprimer définitivement cette vente ?')) {
        CacheDB.write('ventes', did, null, 'delete').then(function() { alert('Supprimé'); loadVentes(); CacheDB.sync(); });
    }
}

async function payerVente(did) {
    if (!confirm('Payer cette vente ? Redirection vers le POS...')) return;
    var dc = await db.collection('ventes').doc(did).get(); if (!dc.exists) { alert('Introuvable'); return; }
    var d = dc.data();
    localStorage.setItem('posPayerVente', JSON.stringify({ venteId: did, clientId: d.clientId, clientName: d.clientName, items: d.items, total: d.total, table: d.table || '' }));
    navigateTo('pos');
}

function printFacture(did) {
    db.collection('ventes').doc(did).get().then(function(dc) {
        if (dc.exists) imprimerFacture(dc.data(), dc.id);
        else {
            db.collection('credits').doc(did).get().then(function(cd) { if (cd.exists) imprimerFacture(cd.data(), cd.id); });
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
    w.document.write('<html><head><title>Facture Alma Coffee Shop</title><style>body{font-family:Arial;padding:20px;}h2{text-align:center;}table{width:100%;border-collapse:collapse;}th,td{padding:5px;border-bottom:1px solid #ddd;}.total{font-size:16px;font-weight:bold;text-align:right;}</style></head><body>' +
        '<h2>☕ Alma Coffee Shop</h2><p>Facture: ' + (d.factureNum || id.substring(0, 8)) + '</p><p>Date: ' + (d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '') + '</p>' +
        '<p>Client: ' + (d.clientName || d.table || '') + '</p><p>Vendeur: ' + (d.vendeur || '-') + '</p>' +
        '<table><th>Article</th><th>Qté</th><th>Prix</th><th>Total</th></tr>' + ih +
        (d.discountMAD > 0 ? '<p>Remise: ' + d.discountMAD.toFixed(2) + ' MAD</p>' : '') +
        '<p class="total">Total: ' + d.total.toFixed(2) + ' MAD</p></body></html>');
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
}

// ==================== CRÉDITS ====================
function loadCreditsPage(c) {
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-credit-card"></i> Crédits</h3><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<input type="text" id="creditsSearchInput" placeholder="🔍 Rechercher (client)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:250px;" onkeyup="creditsSearch = this.value; currentPages.credits=1; applyCreditsFilters();">' +
        '<select id="creditsPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="creditsPeriod = this.value; currentPages.credits=1; applyCreditsFilters();">' + getPeriodOptions('all') + '</select>' +
        '<button class="btn-add" onclick="loadCredits()"><i class="fas fa-sync"></i> Actualiser</button>' +
        '</div></div><div id="creditsTableContainer"></div><div id="creditsPagination" style="margin-top:10px;"></div>' +
        '</div>';
    loadCredits();
}

async function loadCredits() {
    var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
    var vendeurCaissier = '';
    if (!isAdmin && window.currentUserData) vendeurCaissier = window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom;
    try {
        const snapshot = await db.collection('credits').orderBy('createdAt', 'desc').limit(2000).get();
        allCreditsData = [];
        snapshot.forEach(dc => { var d = dc.data(); d.id = dc.id; allCreditsData.push(d); });
        if (!isAdmin) allCreditsData = allCreditsData.filter(function(d) { return d.vendeur === vendeurCaissier; });
    } catch (e) { console.error(e); }
    currentPages.credits = 1;
    applyCreditsFilters();
}

function applyCreditsFilters() {
    var filtered = filterByPeriod(allCreditsData, creditsPeriod);
    filtered = filterBySearch(filtered, creditsSearch, ['clientName']);
    window.filteredCredits = filtered;
    renderCreditsTable();
}

function renderCreditsTable() {
    var cont = document.getElementById('creditsTableContainer');
    if (!cont) return;
    var data = applySort('credits', (window.filteredCredits || allCreditsData).slice(), 'createdAt');
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
        '<th>Actions</th>' +
        '</thead><tbody>';
    pageData.forEach(function(d) {
        var reste = d.remainingAmount || d.total || 0;
        if (!d.paid) tc += reste;
        var dt = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '';
        var amountPaid = d.amountGiven || 0;
        var mode = d.paymentMethod || '-';
        var actions = '<button class="btn-edit" onclick="printFacture(\'' + d.id + '\')"><i class="fas fa-print"></i></button> ';
        if (!d.paid) actions += '<button class="btn-add" style="padding:4px 8px;font-size:0.65rem;" onclick="markCreditPaid(\'' + d.id + '\')">Payer</button> ';
        var isAdmin = window.currentUserData && window.currentUserData.userData.role === 'admin';
        if (isAdmin) {
            actions += '<button class="btn-edit" onclick="editCredit(\'' + d.id + '\')"><i class="fas fa-edit"></i></button> ';
            actions += '<button class="btn-delete" onclick="deleteCredit(\'' + d.id + '\')"><i class="fas fa-trash"></i></button>';
        }
        h += '<tr>' +
            '<td>' + (d.factureNum || d.id.substring(0, 8)) + '</td>' +
            '<td>' + dt + '</td>' +
            '<td>' + escapeHtml(d.clientName || d.table || '-') + '</td>' +
            '<td>' + d.total.toFixed(2) + '</td>' +
            '<td>' + amountPaid.toFixed(2) + '</td>' +
            '<td style="color:#ef4444;"><strong>' + reste.toFixed(2) + '</strong></td>' +
            '<td>' + mode + '</td>' +
            '<td>' + escapeHtml(d.vendeur || '-') + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
    });
    h += '</tbody>' +
        '</div><div style="margin-top:15px;padding:15px;background:#fef2f2;border-radius:12px;text-align:center;"><strong>Impayés: ' + tc.toFixed(2) + ' MAD</strong></div>';
    cont.innerHTML = h;
    document.getElementById('creditsPagination').innerHTML = getPaginationHTML('credits', data.length);
}

function editCredit(did) {
    db.collection('credits').doc(did).get().then(function(doc) {
        if (doc.exists) {
            editingId = did; currentCollection = 'credits';
            var d = doc.data();
            var h = '<div class="form-row"><div class="form-group"><label>Statut</label><select id="editCreditPaid"><option value="1" ' + (d.paid ? 'selected' : '') + '>Payé</option><option value="0" ' + (!d.paid ? 'selected' : '') + '>Impayé</option></select></div><div class="form-group"><label>Montant payé</label><input type="number" id="editAmountGiven" value="' + (d.amountGiven || 0) + '" step="0.01"></div></div>';
            h += '<div class="form-row"><div class="form-group"><label>Reste à payer</label><input type="number" id="editRemaining" value="' + (d.remainingAmount || d.total || 0) + '" step="0.01"></div><div class="form-group"><label>Mode de paiement</label><input type="text" id="editPaymentMethod" value="' + (d.paymentMethod || '') + '"></div></div>';
            h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="saveEditCredit()">Enregistrer</button>';
            openModal('Modifier crédit ' + (d.factureNum || did), h);
        }
    });
}

function saveEditCredit() {
    var paid = document.getElementById('editCreditPaid').value === '1';
    var amountGiven = parseFloat(document.getElementById('editAmountGiven').value) || 0;
    var remaining = parseFloat(document.getElementById('editRemaining').value) || 0;
    var paymentMethod = document.getElementById('editPaymentMethod').value.trim();
    var data = { paid: paid, amountGiven: amountGiven, remainingAmount: paid ? 0 : remaining, paymentMethod: paymentMethod, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    saveDocument('credits', data, function() { closeModal(); loadCredits(); });
}

function deleteCredit(did) {
    if (confirm('Supprimer ce crédit ?')) {
        CacheDB.write('credits', did, null, 'delete').then(function() { alert('Supprimé'); loadCredits(); CacheDB.sync(); });
    }
}

async function markCreditPaid(cid) {
    if (confirm('Marquer ce crédit comme totalement payé ?')) {
        await CacheDB.write('credits', cid, { paid: true, remainingAmount: 0, paidAt: firebase.firestore.FieldValue.serverTimestamp() }, 'update');
        alert('✅ Payé'); loadCredits(); CacheDB.sync();
    }
}

// ==================== OPTIONS ====================
function loadOptionsPage(c) {
    if (!window.currentUserData || window.currentUserData.userData.role !== 'admin') {
        c.innerHTML = '<p>Accès refusé</p>';
        return;
    }

    c.innerHTML = `
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-icon" style="background:#fef3c7;"><i class="fas fa-clock" style="color:#d97706;"></i></div>
            <div class="stat-info"><span>En attente</span><span class="stat-value" id="pendingCount">0</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#dcfce7;"><i class="fas fa-check-circle" style="color:#16a34a;"></i></div>
            <div class="stat-info"><span>Autorisés</span><span class="stat-value" id="authorizedCount">0</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#e0e7ff;"><i class="fas fa-users" style="color:#4f46e5;"></i></div>
            <div class="stat-info"><span>Total</span><span class="stat-value" id="totalUsers">0</span></div>
        </div>
    </div>

    <div class="content-card">
        <div class="card-header"><h3><i class="fas fa-lock"></i> Sécurité</h3>
        <button class="btn-add" onclick="toggleChangePasswordForm()"><i class="fas fa-key"></i> Changer le mot de passe</button></div>
        <div id="changePasswordForm" class="hidden" style="margin-top:15px;">
            <div class="form-row">
                <div class="form-group"><label>Mot de passe actuel</label><input type="password" id="currentPassword" placeholder="Mot de passe actuel"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Nouveau mot de passe</label><input type="password" id="newPassword" placeholder="6 caractères minimum"></div>
                <div class="form-group"><label>Confirmer le mot de passe</label><input type="password" id="confirmPassword" placeholder="Confirmer"></div>
            </div>
            <button class="btn-save" onclick="changeAdminPassword()" style="float:left;margin-top:10px;"><i class="fas fa-save"></i> Changer le mot de passe</button>
        </div>
    </div>

    <div class="content-card">
        <div class="card-header">
            <h3><i class="fas fa-bullhorn"></i> Programme marketing</h3>
            <button class="btn-add" onclick="toggleMarketingProgram()"><i class="fas fa-cog"></i> Gérer le programme de fidélité</button>
        </div>
        <div id="marketingProgramContent" class="hidden" style="margin-top:15px;">
            <div style="display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap;">
                <div class="form-group">
                    <label>Activer le programme</label>
                    <select id="fideliteActifSelect">
                        <option value="1">✅ Actif</option>
                        <option value="0">❌ Inactif</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Points par vente</label>
                    <input type="number" id="fidelitePointsInput" value="1" min="1" step="1" style="width:100px;">
                </div>
                <button class="btn-save" onclick="saveFideliteSettings()" style="float:none;margin:0;height:44px;"><i class="fas fa-save"></i> Enregistrer</button>
            </div>
        </div>
    </div>

    <div class="content-card">
        <div class="card-header">
            <h3><i class="fas fa-users"></i> Utilisateurs</h3>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <input type="text" id="usersSearchInput" placeholder="🔍 Rechercher (nom, email, username)..." style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; width:220px;" onkeyup="usersSearchQuery = this.value.trim().toLowerCase(); currentPages.users = 1; renderUsersTable();">
                <button class="btn-add" onclick="loadUsersList()"><i class="fas fa-sync"></i> Actualiser</button>
            </div>
        </div>
        <div class="table-container">
            <table class="data-table" id="usersTable" style="font-size:0.85rem;">
                <thead><tr>
                    ${makeSortableHeader('users', 'username', 'Username', 'renderUsersTable')}
                    ${makeSortableHeader('users', 'nom', 'Nom', 'renderUsersTable')}
                    ${makeSortableHeader('users', 'email', 'Email', 'renderUsersTable')}
                    ${makeSortableHeader('users', 'role', 'Rôle', 'renderUsersTable')}
                    ${makeSortableHeader('users', 'authorized', 'Statut', 'renderUsersTable')}
                    <th>Actions</th>
                </tr></thead>
                <tbody></tbody>
            </table>
        </div>
        <div id="usersPagination"></div>
    </div>
    `;

    loadUsersList();
    loadFideliteSettings();
}

// ==================== GESTION DES UTILISATEURS ====================
function loadUsersList() {
    db.collection('users').get().then(function(sn) {
        allUsersData = [];
        if (!sn.empty) {
            sn.forEach(function(dc) {
                var d = dc.data();
                d.id = dc.id;
                d.fullName = (d.prenom + ' ' + d.nom).toLowerCase();
                allUsersData.push(d);
            });
        }
        var p = allUsersData.filter(u => u.authorized === 'no').length;
        var a = allUsersData.filter(u => u.authorized === 'yes').length;
        var pendingSpan = document.getElementById('pendingCount');
        var authorizedSpan = document.getElementById('authorizedCount');
        var totalSpan = document.getElementById('totalUsers');
        if (pendingSpan) pendingSpan.textContent = p;
        if (authorizedSpan) authorizedSpan.textContent = a;
        if (totalSpan) totalSpan.textContent = allUsersData.length;
        currentPages.users = 1;
        renderUsersTable();
    });
}

function renderUsersTable() {
    var tb = document.querySelector('#usersTable tbody');
    if (!tb) return;
    var data = allUsersData.slice();
    if (usersSearchQuery) {
        data = data.filter(function(u) {
            return (u.email || '').toLowerCase().indexOf(usersSearchQuery) !== -1 ||
                (u.username || '').toLowerCase().indexOf(usersSearchQuery) !== -1 ||
                (u.fullName || '').indexOf(usersSearchQuery) !== -1;
        });
    }
    window.filteredUsers = data;
    data = applySort('users', data, 'username');
    var pageData = getPageData('users', data);
    tb.innerHTML = '';
    if (pageData.length === 0) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Aucun utilisateur trouvé</td>' +
            '</tr>';
        document.getElementById('usersPagination').innerHTML = '';
        return;
    }
    pageData.forEach(function(u) {
        var badge = u.authorized === 'yes' ? '<span class="status-success">✅ OK</span>' : '<span class="status-warning">⏳ En attente</span>';
        var act = u.authorized === 'no' ?
            '<button class="btn-add" style="padding:4px 8px;font-size:0.7rem;margin-right:4px;" onclick="approveUser(\'' + u.id + '\')">✔ Accepter</button>' +
            '<button class="btn-delete" style="padding:4px 8px;font-size:0.7rem;" onclick="rejectUser(\'' + u.id + '\')">✖ Refuser</button>'
            :
            '<button style="padding:4px 8px;font-size:0.7rem;margin-right:4px;color:#d97706;border:none;background:#fef3c7;border-radius:6px;cursor:pointer;" onclick="blockUser(\'' + u.id + '\')">⛔ Bloquer</button>' +
            '<button class="btn-delete" style="padding:4px 8px;font-size:0.7rem;" onclick="deleteUserPermanently(\'' + u.id + '\')">🗑 Supprimer</button>';
        var row = '<tr>' +
            '<td><strong>@' + escapeHtml(u.username || '') + '</strong></td>' +
            '<td>' + escapeHtml(u.prenom || '') + ' ' + escapeHtml(u.nom || '') + '</td>' +
            '<td>' + escapeHtml(u.email || '') + '</td>' +
            '<td>' + escapeHtml(u.role || '') + '</td>' +
            '<td>' + badge + '</td>' +
            '<td>' + act + '</td>' +
            '</tr>';
        tb.innerHTML += row;
    });
    document.getElementById('usersPagination').innerHTML = getPaginationHTML('users', data.length);
}

function blockUser(uid) {
    if (confirm('Bloquer cet utilisateur ?')) {
        CacheDB.write('users', uid, { authorized: 'no' }, 'update').then(function() { loadUsersList(); loadPendingRegistrations(); CacheDB.sync(); });
    }
}

function deleteUserPermanently(uid) {
    if (confirm('Supprimer définitivement cet utilisateur ?')) {
        CacheDB.write('users', uid, null, 'delete').then(function() { loadUsersList(); loadPendingRegistrations(); CacheDB.sync(); });
    }
}

// ==================== GESTION MOT DE PASSE ====================
function toggleChangePasswordForm() {
    var form = document.getElementById('changePasswordForm');
    if (form) form.classList.toggle('hidden');
}

async function changeAdminPassword() {
    var currentPass = document.getElementById('currentPassword').value.trim();
    var newPass = document.getElementById('newPassword').value.trim();
    var confirmPass = document.getElementById('confirmPassword').value.trim();
    if (!currentPass || !newPass || !confirmPass) { alert('Tous les champs sont obligatoires.'); return; }
    if (newPass.length < 6) { alert('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
    var user = auth.currentUser;
    if (!user) { alert('Aucun utilisateur connecté.'); return; }
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);
    try {
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPass);
        alert('✅ Mot de passe changé avec succès !');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        toggleChangePasswordForm();
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/wrong-password') alert('❌ Mot de passe actuel incorrect.');
        else alert('Erreur : ' + error.message);
    }
}

// ==================== MARKETING / FIDÉLITÉ ====================
function toggleMarketingProgram() {
    var div = document.getElementById('marketingProgramContent');
    if (div) {
        if (div.classList.contains('hidden')) {
            div.classList.remove('hidden');
            loadFideliteSettings();
        } else {
            div.classList.add('hidden');
        }
    }
}

async function loadFideliteSettings() {
    let active = true;
    let points = 1;
    try {
        const doc = await db.collection('settings').doc('fidelite').get();
        if (doc.exists) {
            active = doc.data().active === true;
            points = doc.data().pointsParVente || 1;
        }
    } catch (e) {
        active = localStorage.getItem('fidelite_active') === 'true';
        points = parseInt(localStorage.getItem('fidelite_points')) || 1;
    }
    var actifSelect = document.getElementById('fideliteActifSelect');
    var pointsInput = document.getElementById('fidelitePointsInput');
    if (actifSelect) actifSelect.value = active ? '1' : '0';
    if (pointsInput) pointsInput.value = points;
}

async function saveFideliteSettings() {
    var active = document.getElementById('fideliteActifSelect').value === '1';
    var points = parseInt(document.getElementById('fidelitePointsInput').value) || 1;
    try {
        await db.collection('settings').doc('fidelite').set({
            active: active,
            pointsParVente: points
        }, { merge: true });
    } catch (e) {
        console.warn('Firestore inaccessible, sauvegarde locale');
    }
    localStorage.setItem('fidelite_active', active);
    localStorage.setItem('fidelite_points', points);
    alert('✅ Paramètres de fidélité enregistrés');
}

console.log('☕ Alma Coffee Shop - Admin JS complet');
