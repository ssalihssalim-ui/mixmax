// ==================== SCRIPT.JS - ALMA COFFEE SHOP ====================
var currentUser = null;
var currentUserData = null;

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

window.addEventListener('load', function() {
    setTimeout(function() { initApp(); }, 300);
});

async function initApp() {
    console.log('☕ Alma Coffee Shop Started');

    if (window._menuTactileTable) {
        var tableParam = window._menuTactileTable;
        document.getElementById('authPage').classList.add('hidden');
        document.getElementById('dashboardPage').classList.add('hidden');
        document.getElementById('clientPage').classList.add('hidden');
        document.getElementById('menuTactilePage').classList.remove('hidden');
        
        let attempts = 0;
        const waitForInit = setInterval(function() {
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

    const cachedUser = await CacheDB.get('users', 'current');
    if (cachedUser && cachedUser.uid) {
        auth.onAuthStateChanged(user => {
            if (user && user.uid === cachedUser.uid) {
                currentUserData = cachedUser;
                if (cachedUser.userData.role === 'client') showClientPage();
                else showDashboard();
            } else {
                auth.signOut();
                showAuthPage();
            }
        });
    } else {
        auth.onAuthStateChanged(async function(user) {
            if (user) {
                try {
                    let userData = await CacheDB.get('users', user.uid);
                    if (!userData) {
                        const doc = await db.collection('users').doc(user.uid).get();
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

function toggleSidebar() { var s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay'); if (s) s.classList.toggle('open'); if (o) o.classList.toggle('active'); }
function toggleClientSidebar() { var s = document.getElementById('clientSidebar'), o = document.getElementById('clientSidebarOverlay'); if (s) s.classList.toggle('open'); if (o) o.classList.toggle('active'); }
function showAuthPage() { document.getElementById('authPage').classList.remove('hidden'); document.getElementById('dashboardPage').classList.add('hidden'); document.getElementById('clientPage').classList.add('hidden'); }

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
    var menu = document.getElementById('navMenu'); if (!menu) return; menu.innerHTML = ''; 
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
        var li = document.createElement('li'); li.className = 'nav-item'; li.onclick = function() { navigateTo(item.p); }; li.innerHTML = '<i class="fas ' + item.i + '"></i> ' + item.l; menu.appendChild(li); 
    });
}

function navigateTo(page) {
    if (!window.currentUserData || window.currentUserData.userData.authorized !== 'yes') { auth.signOut(); showAuthPage(); return; }
    var items = document.querySelectorAll('#navMenu .nav-item'); items.forEach(function(item) { item.classList.remove('active'); });
    var pages = ['dashboard','pos','commandes','categories','products','clients','fournisseurs','ventes','credits','depenses','statistiques','options'];
    var index = pages.indexOf(page); if (index >= 0 && items[index]) items[index].classList.add('active');
    var titles = { dashboard:'Dashboard',pos:'POS',commandes:'Commandes en ligne',categories:'Catégories',products:'Produits',clients:'Clients',fournisseurs:'Fournisseurs',ventes:'Ventes',credits:'Crédits',depenses:'Dépenses',statistiques:'Statistiques',options:'Options' };
    var icons = { dashboard:'fa-chart-line',pos:'fa-cash-register',commandes:'fa-shopping-basket',categories:'fa-layer-group',products:'fa-coffee',clients:'fa-users',fournisseurs:'fa-truck',ventes:'fa-shopping-cart',credits:'fa-credit-card',depenses:'fa-money-bill-wave',statistiques:'fa-chart-bar',options:'fa-cog' };
    document.getElementById('pageTitle').textContent = titles[page] || '';
    var hi = document.querySelector('.header-title i'); if (hi && icons[page]) hi.className = 'fas ' + icons[page];
    var content = document.getElementById('dynamicContent'); if (!content) return;
    if (page === 'pos' && typeof loadPosPage === 'function') loadPosPage(content);
    else if (page === 'commandes' && typeof loadCommandesPage === 'function') loadCommandesPage(content);
    else if (page === 'categories' && typeof loadCategoriesPage === 'function') loadCategoriesPage(content);
    else if (page === 'products' && typeof loadProductsPage === 'function') loadProductsPage(content);
    else if (page === 'clients' && typeof loadClientsPage === 'function') loadClientsPage(content);
    else if (page === 'fournisseurs' && typeof loadFournisseursPage === 'function') loadFournisseursPage(content);
    else if (page === 'ventes' && typeof loadVentesPage === 'function') loadVentesPage(content);
    else if (page === 'credits' && typeof loadCreditsPage === 'function') loadCreditsPage(content);
    else if (page === 'depenses' && typeof loadDepensesPage === 'function') loadDepensesPage(content);
    else if (page === 'statistiques' && typeof loadStatistiquesPage === 'function') loadStatistiquesPage(content);
    else if (page === 'options' && typeof loadOptionsPage === 'function') loadOptionsPage(content);
    else if (page === 'dashboard' && typeof loadDashboardPage === 'function') loadDashboardPage(content);
    else content.innerHTML = '<div class="content-card"><h3>' + (titles[page] || 'Page') + '</h3><p style="text-align:center;padding:40px;">En développement</p></div>';
}

function updateSidebarUserInfo() { 
    var el = document.getElementById('sidebarUserInfo'); 
    if (el && window.currentUserData) {
        el.innerHTML = '<i class="fas fa-user-circle"></i> ' + window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom + ' <small style="color:#A67C52;">(' + window.currentUserData.userData.role + ')</small>';
    } 
}

function updateClientSidebarInfo() { 
    var el = document.getElementById('clientSidebarInfo'); 
    if (el && window.currentUserData) {
        el.innerHTML = '<i class="fas fa-user-circle"></i> ' + window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom;
    } 
}

console.log('☕ Alma Coffee Shop - Script principal OK');
