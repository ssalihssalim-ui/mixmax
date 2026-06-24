// ==================== SCRIPT.JS - MIXMAX MINIMARKET ====================
// Script principal - Point d'entrée de l'application

// ========== VARIABLES GLOBALES ==========
window.currentUser = window.currentUser || null;
window.currentUserData = window.currentUserData || null;

// Variables partagées entre modules
window.allCreditsData = window.allCreditsData || [];
window.allDepensesData = window.allDepensesData || [];
window.allStockData = window.allStockData || [];
window.allPersonnelData = window.allPersonnelData || [];
window.allVentesData = window.allVentesData || [];
window.allCommandesData = window.allCommandesData || [];
window.editingId = window.editingId || null;
window.currentCollection = window.currentCollection || '';

// Pagination et tri
window.currentPages = window.currentPages || {
    categories: 1, products: 1, clients: 1, fournisseurs: 1,
    ventes: 1, credits: 1, depenses: 1, commandes: 1
};
window.sortOrders = window.sortOrders || {};
window.itemsPerPage = window.itemsPerPage || 15;

// Filtres
window.filteredCredits = window.filteredCredits || null;
window.filteredDepenses = window.filteredDepenses || null;
window.filteredVentes = window.filteredVentes || null;
window.filteredCommandes = window.filteredCommandes || null;

// Recherche
window.creditsSearch = '';
window.ventesSearch = '';
window.commandesSearch = '';
window.creditsPeriod = 'all';
window.ventesPeriod = 'all';
window.commandesPeriod = 'all';

// ========== FONCTIONS UTILITAIRES GLOBALES ==========

// Échappement HTML (utilisé par tous les modules)
window.escapeHtml = window.escapeHtml || function(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
};

// Conversion de date Firestore
window.toDate = window.toDate || function(val) {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string') return new Date(val);
    if (val instanceof Date) return val;
    return null;
};

// Options de période
window.getPeriodOptions = window.getPeriodOptions || function(selected) {
    var opts = '';
    opts += '<option value="all" ' + (selected === 'all' ? 'selected' : '') + '>Tout</option>';
    opts += '<option value="today" ' + (selected === 'today' ? 'selected' : '') + '>Aujourd\'hui</option>';
    opts += '<option value="7" ' + (selected === '7' ? 'selected' : '') + '>7 jours</option>';
    opts += '<option value="30" ' + (selected === '30' ? 'selected' : '') + '>30 jours</option>';
    opts += '<option value="90" ' + (selected === '90' ? 'selected' : '') + '>3 mois</option>';
    opts += '<option value="365" ' + (selected === '365' ? 'selected' : '') + '>1 an</option>';
    return opts;
};

// Filtre par période
window.filterByPeriod = window.filterByPeriod || function(data, period) {
    if (!period || period === 'all') return data;
    var now = new Date();
    var cutoff;
    if (period === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
        var days = parseInt(period);
        if (isNaN(days)) return data;
        cutoff = new Date(now.getTime() - days * 86400000);
    }
    return data.filter(function(d) {
        var date = d.createdAt ? new Date(d.createdAt.seconds * 1000) : null;
        return date && date >= cutoff;
    });
};

// Filtre par recherche
window.filterBySearch = window.filterBySearch || function(data, query, fields) {
    if (!query || !query.trim()) return data;
    var q = query.toLowerCase().trim();
    return data.filter(function(item) {
        return fields.some(function(field) {
            var value = item[field];
            if (Array.isArray(value)) return value.some(function(v) {
                return (v && v.toString().toLowerCase().indexOf(q) !== -1);
            });
            return (value && value.toString().toLowerCase().indexOf(q) !== -1);
        });
    });
};

// Tri générique
window.applySort = window.applySort || function(collection, data, defaultField) {
    var sortOrder = window.sortOrders[collection] || {};
    var field = Object.keys(sortOrder)[0] || defaultField;
    var order = sortOrder[field] || 'asc';
    return data.slice().sort(function(a, b) {
        var va = a[field], vb = b[field];
        if (va == null) va = '';
        if (vb == null) vb = '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return order === 'asc' ? -1 : 1;
        if (va > vb) return order === 'asc' ? 1 : -1;
        return 0;
    });
};

// En-tête de colonne triable
window.makeSortableHeader = window.makeSortableHeader || function(collection, field, label, refreshFn) {
    var currentSort = window.sortOrders[collection] || {};
    var currentField = Object.keys(currentSort)[0] || '';
    var currentOrder = currentSort[field] || 'asc';
    var arrow = '';
    if (currentField === field) {
        arrow = currentOrder === 'asc' ? ' ▲' : ' ▼';
    }
    return '<th style="cursor:pointer;white-space:nowrap;" onclick="window.sortOrders[\'' + collection + '\']={\'' + field + '\':(window.sortOrders[\'' + collection + '\']&&window.sortOrders[\'' + collection + '\'][\'' + field + '\']===\'asc\'?\'desc\':\'asc\')};' + refreshFn + '()">' + label + arrow + '</th>';
};

// Pagination
window.getPageData = window.getPageData || function(collection, data) {
    var page = window.currentPages[collection] || 1;
    var perPage = window.itemsPerPage || 15;
    var start = (page - 1) * perPage;
    return data.slice(start, start + perPage);
};

window.getPaginationHTML = window.getPaginationHTML || function(collection, totalItems) {
    var perPage = window.itemsPerPage || 15;
    var totalPages = Math.ceil(totalItems / perPage);
    var currentPage = window.currentPages[collection] || 1;
    if (totalPages <= 1) return '';
    var html = '<div style="display:flex;justify-content:center;gap:8px;margin-top:10px;flex-wrap:wrap;">';
    html += '<button onclick="window.currentPages.' + collection + '=1;' + getRefreshFn(collection) + '" ' + (currentPage <= 1 ? 'disabled' : '') + ' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">⏮</button>';
    html += '<button onclick="window.currentPages.' + collection + '=' + Math.max(1, currentPage - 1) + ';' + getRefreshFn(collection) + '" ' + (currentPage <= 1 ? 'disabled' : '') + ' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">◀</button>';
    html += '<span style="padding:6px 12px;">' + currentPage + ' / ' + totalPages + '</span>';
    html += '<button onclick="window.currentPages.' + collection + '=' + Math.min(totalPages, currentPage + 1) + ';' + getRefreshFn(collection) + '" ' + (currentPage >= totalPages ? 'disabled' : '') + ' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">▶</button>';
    html += '<button onclick="window.currentPages.' + collection + '=' + totalPages + ';' + getRefreshFn(collection) + '" ' + (currentPage >= totalPages ? 'disabled' : '') + ' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">⏭</button>';
    html += '</div>';
    return html;
};

function getRefreshFn(collection) {
    var map = {
        'categories': 'renderCategoriesTable()',
        'products': 'renderProductsTable()',
        'clients': 'renderClientsTable()',
        'fournisseurs': 'renderFournisseursTable()',
        'ventes': 'renderVentesTable()',
        'credits': 'renderCreditsTable()',
        'depenses': 'renderDepensesTable()',
        'commandes': 'renderCommandesTable()'
    };
    return map[collection] || '';
}

// Rafraîchir la page courante
window.refreshCurrentPage = function() {
    var currentTitle = document.getElementById('pageTitle')?.textContent || '';
    var pageMap = {
        'Dashboard': 'dashboard',
        'POS': 'pos',
        'Commandes en ligne': 'commandes',
        'Catégories': 'categories',
        'Produits': 'products',
        'Clients': 'clients',
        'Fournisseurs': 'fournisseurs',
        'Ventes': 'ventes',
        'Crédits': 'credits',
        'Dépenses': 'depenses',
        'Statistiques': 'statistiques',
        'Options': 'options'
    };
    var page = pageMap[currentTitle];
    if (page && typeof navigateTo === 'function') {
        navigateTo(page);
    }
};

// Gestion du modal
window.openModal = window.openModal || function(title, bodyHTML) {
    var overlay = document.getElementById('modalOverlay');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    if (!overlay || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    overlay.classList.remove('hidden');
};

window.closeModal = function() {
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
    window.editingId = null;
};

// Sauvegarde générique
window.saveDocument = window.saveDocument || function(collection, data, callback) {
    if (window.editingId) {
        CacheDB.write(collection, window.editingId, data, 'update').then(function() {
            if (callback) callback();
            CacheDB.sync();
        });
    } else {
        if (!data.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        CacheDB.write(collection, null, data, 'add').then(function() {
            if (callback) callback();
            CacheDB.sync();
        });
    }
};

// Édition générique
window.editDocument = window.editDocument || function(collection, id) {
    db.collection(collection).doc(id).get().then(function(doc) {
        if (doc.exists) {
            window.editingId = id;
            window.currentCollection = collection;
            var data = doc.data();
            var formOpeners = {
                'categories': 'openCategoryForm',
                'products': 'openProductForm',
                'clients': 'openClientForm',
                'fournisseurs': 'openFournisseurForm'
            };
            var fnName = formOpeners[collection];
            if (fnName && typeof window[fnName] === 'function') {
                window[fnName](data);
            }
        }
    });
};

// Suppression générique
window.deleteDocument = window.deleteDocument || function(collection, id) {
    if (!confirm('Supprimer définitivement cet élément ?')) return;
    CacheDB.write(collection, id, null, 'delete').then(function() {
        alert('Supprimé');
        if (typeof refreshCurrentPage === 'function') refreshCurrentPage();
        CacheDB.sync();
    });
};

// Conversion fichier en base64
window.fileToBase64 = window.fileToBase64 || function(file, callback) {
    var reader = new FileReader();
    reader.onload = function(e) { callback(e.target.result); };
    reader.readAsDataURL(file);
};

// Aperçu image
window.previewImage = window.previewImage || function(input, previewId) {
    var preview = document.getElementById(previewId);
    if (!preview) return;
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:100px;border-radius:8px;">';
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// ========== MENU TACTILE (paramètre table) ==========
(function() {
    var urlParams = new URLSearchParams(window.location.search);
    var tableParam = urlParams.get('table');
    if (tableParam) {
        document.addEventListener('DOMContentLoaded', function() {
            var authPage = document.getElementById('authPage');
            var dashboardPage = document.getElementById('dashboardPage');
            var clientPage = document.getElementById('clientPage');
            var menuTactilePage = document.getElementById('menuTactilePage');
            if (authPage) authPage.classList.add('hidden');
            if (dashboardPage) dashboardPage.classList.add('hidden');
            if (clientPage) clientPage.classList.add('hidden');
            if (menuTactilePage) menuTactilePage.classList.remove('hidden');
        });
        window._menuTactileTable = tableParam;
    }
})();

// ========== INITIALISATION ==========
window.addEventListener('load', function() {
    setTimeout(function() { initApp(); }, 300);
});

async function initApp() {
    console.log('☕ Mixmax Minimarket Started');

    // Mode menu tactile
    if (window._menuTactileTable) {
        var tableParam = window._menuTactileTable;
        document.getElementById('authPage').classList.add('hidden');
        document.getElementById('dashboardPage').classList.add('hidden');
        document.getElementById('clientPage').classList.add('hidden');
        document.getElementById('menuTactilePage').classList.remove('hidden');
        
        var attempts = 0;
        var waitForInit = setInterval(function() {
            if (typeof db !== 'undefined' && typeof CacheDB !== 'undefined' && typeof initMenuTactile === 'function') {
                clearInterval(waitForInit);
                initMenuTactile(tableParam);
            } else if (attempts++ > 100) {
                clearInterval(waitForInit);
                console.error('Timeout initialisation menu tactile');
            }
        }, 100);
        return;
    }

    var authPage = document.getElementById('authPage'),
        dashboardPage = document.getElementById('dashboardPage'),
        clientPage = document.getElementById('clientPage');

    if (!authPage || !dashboardPage || !clientPage) {
        console.error('Elements manquants');
        return;
    }

    dashboardPage.classList.add('hidden');
    clientPage.classList.add('hidden');
    authPage.classList.remove('hidden');

    // Vérifier le cache utilisateur
    var cachedUser = await CacheDB.get('users', 'current');
    if (cachedUser && cachedUser.uid) {
        auth.onAuthStateChanged(function(user) {
            if (user && user.uid === cachedUser.uid) {
                window.currentUserData = cachedUser;
                if (cachedUser.userData.role === 'client') showClientPage();
                else showDashboard();
            } else {
                CacheDB.write('users', 'current', null, 'delete');
                auth.signOut();
                showAuthPage();
            }
        });
    } else {
        auth.onAuthStateChanged(async function(user) {
            if (user) {
                try {
                    var userData = await CacheDB.get('users', user.uid);
                    if (!userData) {
                        var doc = await db.collection('users').doc(user.uid).get();
                        if (!doc.exists) throw new Error('No user doc');
                        userData = { uid: doc.id, userData: doc.data() };
                        await CacheDB.set('users', user.uid, userData);
                    }
                    if (userData.userData.authorized !== 'yes') {
                        auth.signOut();
                        showAuthPage();
                        return;
                    }
                    window.currentUserData = userData;
                    await CacheDB.set('users', 'current', userData);
                    if (userData.userData.role === 'client') showClientPage();
                    else showDashboard();
                } catch(err) {
                    console.error(err);
                    auth.signOut();
                    showAuthPage();
                }
            } else {
                window.currentUserData = null;
                showAuthPage();
            }
        });
    }

    showLogin();
}

// ========== NAVIGATION ==========
function toggleSidebar() {
    var s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
    if (s) s.classList.toggle('open');
    if (o) o.classList.toggle('active');
}

function toggleClientSidebar() {
    var s = document.getElementById('clientSidebar'), o = document.getElementById('clientSidebarOverlay');
    if (s) s.classList.toggle('open');
    if (o) o.classList.toggle('active');
}

function showAuthPage() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('clientPage').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authPage').classList.add('hidden'); 
    document.getElementById('dashboardPage').classList.remove('hidden'); 
    document.getElementById('clientPage').classList.add('hidden');
    buildMenu(); 
    updateSidebarUserInfo();
    if (window.currentUserData && window.currentUserData.userData.role === 'caissier') navigateTo('pos');
    else navigateTo('dashboard');
}

function showClientPage() {
    document.getElementById('authPage').classList.add('hidden'); 
    document.getElementById('dashboardPage').classList.add('hidden'); 
    document.getElementById('clientPage').classList.remove('hidden');
    updateClientSidebarInfo();
    if (typeof clientNavigate === 'function') clientNavigate('commander');
}

function buildMenu() {
    var menu = document.getElementById('navMenu');
    if (!menu) return;
    menu.innerHTML = '';
    
    var items = [];
    if (window.currentUserData && window.currentUserData.userData.role === 'admin') {
        items = [
            {p:'dashboard',i:'fa-chart-line',l:'Dashboard'},
            {p:'pos',i:'fa-cash-register',l:'POS'},
            {p:'commandes',i:'fa-shopping-basket',l:'Commandes en ligne'},
            {p:'categories',i:'fa-layer-group',l:'Catégories'},
            {p:'products',i:'fa-coffee',l:'Produits'},
            {p:'clients',i:'fa-users',l:'Clients'},
            {p:'fournisseurs',i:'fa-truck',l:'Fournisseurs'},
            {p:'ventes',i:'fa-shopping-cart',l:'Ventes'},
            {p:'credits',i:'fa-credit-card',l:'Crédits'},
            {p:'depenses',i:'fa-money-bill-wave',l:'Dépenses'},
            {p:'statistiques',i:'fa-chart-bar',l:'Statistiques'},
            {p:'options',i:'fa-cog',l:'Options'}
        ];
        var roleSpan = document.getElementById('sidebarRole');
        if (roleSpan) roleSpan.textContent = 'Admin';
    } else if (window.currentUserData && window.currentUserData.userData.role === 'caissier') {
        items = [
            {p:'pos',i:'fa-cash-register',l:'POS'},
            {p:'commandes',i:'fa-shopping-basket',l:'Commandes en ligne'},
            {p:'ventes',i:'fa-shopping-cart',l:'Ventes'},
            {p:'credits',i:'fa-credit-card',l:'Crédits'}
        ];
        var roleSpan = document.getElementById('sidebarRole');
        if (roleSpan) roleSpan.textContent = 'Caissier';
    }
    
    items.forEach(function(item) { 
        var li = document.createElement('li');
        li.className = 'nav-item';
        li.onclick = function() { navigateTo(item.p); };
        li.innerHTML = '<i class="fas ' + item.i + '"></i> ' + item.l;
        menu.appendChild(li); 
    });
}

// ========== NAVIGATION CENTRALE (CORRIGÉE) ==========
function navigateTo(page) {
    if (!window.currentUserData || window.currentUserData.userData.authorized !== 'yes') {
        auth.signOut();
        showAuthPage();
        return;
    }
    
    // Mise à jour du menu actif
    var items = document.querySelectorAll('#navMenu .nav-item');
    items.forEach(function(item) { item.classList.remove('active'); });
    
    var pages = ['dashboard','pos','commandes','categories','products','clients','fournisseurs','ventes','credits','depenses','statistiques','options'];
    var index = pages.indexOf(page);
    if (index >= 0 && items[index]) items[index].classList.add('active');
    
    // Mise à jour du titre et icône
    var titles = {
        dashboard:'Dashboard', pos:'POS', commandes:'Commandes en ligne',
        categories:'Catégories', products:'Produits', clients:'Clients',
        fournisseurs:'Fournisseurs', ventes:'Ventes', credits:'Crédits',
        depenses:'Dépenses', statistiques:'Statistiques', options:'Options'
    };
    var icons = {
        dashboard:'fa-chart-line', pos:'fa-cash-register', commandes:'fa-shopping-basket',
        categories:'fa-layer-group', products:'fa-coffee', clients:'fa-users',
        fournisseurs:'fa-truck', ventes:'fa-shopping-cart', credits:'fa-credit-card',
        depenses:'fa-money-bill-wave', statistiques:'fa-chart-bar', options:'fa-cog'
    };
    
    document.getElementById('pageTitle').textContent = titles[page] || page;
    var hi = document.querySelector('.header-title i');
    if (hi && icons[page]) hi.className = 'fas ' + icons[page];
    
    // ✅ VIDER le contenu AVANT de charger la nouvelle page
    var content = document.getElementById('dynamicContent');
    if (!content) return;
    
    // Afficher un loader immédiat
    content.innerHTML = '<div style="text-align:center;padding:60px;">' +
        '<i class="fas fa-spinner fa-spin" style="font-size:2.5rem;color:#2E7D32;"></i>' +
        '<p style="margin-top:15px;color:#64748b;">Chargement...</p></div>';
    
    // ✅ Charger la page avec un léger délai pour garantir le DOM
    setTimeout(function() {
        var pageFunctions = {
            'pos': 'loadPosPage',
            'commandes': 'loadCommandesPage',
            'categories': 'loadCategoriesPage',
            'products': 'loadProductsPage',
            'clients': 'loadClientsPage',
            'fournisseurs': 'loadFournisseursPage',
            'ventes': 'loadVentesPage',
            'credits': 'loadCreditsPage',
            'depenses': 'loadDepensesPage',
            'statistiques': 'loadStatistiquesPage',
            'options': 'loadOptionsPage',
            'dashboard': 'loadDashboardPage'
        };
        
        var fnName = pageFunctions[page];
        if (fnName && typeof window[fnName] === 'function') {
            try {
                window[fnName](content);
            } catch(e) {
                console.error('Erreur chargement page:', page, e);
                content.innerHTML = '<div class="content-card" style="text-align:center;padding:40px;">' +
                    '<i class="fas fa-exclamation-triangle" style="font-size:3rem;color:#ef4444;"></i>' +
                    '<h3>Erreur de chargement</h3><p>' + e.message + '</p>' +
                    '<button class="btn-add" onclick="location.reload()">🔄 Actualiser</button></div>';
            }
        } else {
            content.innerHTML = '<div class="content-card"><h3>' + (titles[page] || 'Page') + '</h3>' +
                '<p style="text-align:center;padding:40px;">En développement</p></div>';
        }
    }, 50);
    
    // Fermer le sidebar mobile
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }
}

// ========== INFOS UTILISATEUR ==========
function updateSidebarUserInfo() { 
    var el = document.getElementById('sidebarUserInfo'); 
    if (el && window.currentUserData) {
        el.innerHTML = '<i class="fas fa-user-circle"></i> ' + 
            window.currentUserData.userData.prenom + ' ' + 
            window.currentUserData.userData.nom + 
            ' <small style="color:#A67C52;">(' + window.currentUserData.userData.role + ')</small>';
    } 
}

function updateClientSidebarInfo() { 
    var el = document.getElementById('clientSidebarInfo'); 
    if (el && window.currentUserData) {
        el.innerHTML = '<i class="fas fa-user-circle"></i> ' + 
            window.currentUserData.userData.prenom + ' ' + 
            window.currentUserData.userData.nom;
    } 
}

// ========== GESTION DU MODAL OVERLAY ==========
document.addEventListener('click', function(e) {
    var overlay = document.getElementById('modalOverlay');
    if (overlay && e.target === overlay && !overlay.classList.contains('hidden')) {
        closeModal();
    }
});

// ========== DÉTECTION HORS LIGNE ==========
window.addEventListener('online', function() {
    console.log('✅ Connexion rétablie');
    if (typeof CacheDB !== 'undefined' && CacheDB.sync) {
        CacheDB.sync().catch(function(e) { console.warn('Erreur sync:', e); });
    }
});

window.addEventListener('offline', function() {
    console.warn('⚠️ Mode hors ligne');
});

console.log('☕ Mixmax Minimarket - Script principal OK (v2 corrigée)');
