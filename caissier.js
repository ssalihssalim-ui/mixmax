// ==================== CAISSIER.JS - ALMA COFFEE SHOP ====================

(function() {
    let attempts = 0;
    const maxAttempts = 50;
    const interval = 300;
    let intervalId = null;

    function redirectToValidRole() {
        if (!window.currentUserData) {
            if (++attempts >= maxAttempts) {
                console.error('Impossible de détecter l\'utilisateur connecté');
                if (intervalId) clearInterval(intervalId);
                if (typeof showAuthPage === 'function') showAuthPage();
            }
            return false;
        }
        if (intervalId) clearInterval(intervalId);

        const role = window.currentUserData.userData.role;
        if (role !== 'caissier') {
            console.warn(`Rôle ${role} détecté, redirection...`);
            if (role === 'admin' && typeof showDashboard === 'function') {
                showDashboard();
            } else if (role === 'client' && typeof showClientPage === 'function') {
                showClientPage();
            } else if (typeof showAuthPage === 'function') {
                showAuthPage();
            }
            return false;
        }

        console.log('☕ Interface caissier chargée');
        return true;
    }

    intervalId = setInterval(function() {
        redirectToValidRole();
    }, interval);
})();

function loadCaissierDashboard() {
    if (typeof loadDashboardPage === 'function') {
        loadDashboardPage(document.getElementById('dynamicContent'));
    } else {
        console.error('loadDashboardPage non définie');
    }
}

function loadCaissierPOS() {
    if (typeof loadPosPage === 'function') {
        loadPosPage(document.getElementById('dynamicContent'));
    } else {
        console.error('loadPosPage non définie');
    }
}

function loadCaissierCommandes() {
    if (typeof loadCommandesPage === 'function') {
        loadCommandesPage(document.getElementById('dynamicContent'));
    } else {
        console.error('loadCommandesPage non définie');
    }
}

function loadCaissierVentes() {
    if (typeof loadVentesPage === 'function') {
        loadVentesPage(document.getElementById('dynamicContent'));
    } else {
        console.error('loadVentesPage non définie');
    }
}

function loadCaissierCredits() {
    if (typeof loadCreditsPage === 'function') {
        loadCreditsPage(document.getElementById('dynamicContent'));
    } else {
        console.error('loadCreditsPage non définie');
    }
}

console.log('☕ Alma Coffee Shop - Caissier JS prêt');
