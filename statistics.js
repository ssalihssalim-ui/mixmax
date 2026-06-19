// ==================== STATISTIQUES.JS - ALMA COFFEE SHOP ====================
var statsCharts = {};

function loadStatistiquesPage(c) {
    if (!window.currentUserData || window.currentUserData.userData.role !== 'admin') {
        c.innerHTML = '<div class="content-card"><p style="text-align:center;padding:40px;color:#ef4444;"><i class="fas fa-lock" style="font-size:2rem;display:block;margin-bottom:10px;"></i>Accès réservé à l\'administrateur</p></div>';
        return;
    }

    var html = `
    <div class="content-card" style="margin-bottom:15px;">
        <div class="card-header">
            <h3><i class="fas fa-chart-bar"></i> Tableau de bord - Statistiques Alma Coffee</h3>
            <div style="display:flex; gap:8px; align-items:center;">
                <select id="statPeriodSelect" style="padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px;" onchange="loadStatistiques()">
                    <option value="1">Aujourd'hui</option>
                    <option value="7" selected>7 derniers jours</option>
                    <option value="30">30 derniers jours</option>
                    <option value="90">3 mois</option>
                    <option value="365">1 an</option>
                    <option value="all">Tout</option>
                </select>
                <button class="btn-add" onclick="loadStatistiques()"><i class="fas fa-sync"></i> Actualiser</button>
            </div>
        </div>
    </div>
    <div id="statsContent" style="text-align:center;padding:40px;">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#A67C52;"></i>
        <p style="margin-top:10px;">Chargement des données...</p>
    </div>
    `;
    c.innerHTML = html;
    loadStatistiques();
}

function toDate(val) {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string') return new Date(val);
    if (val instanceof Date) return val;
    return null;
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

async function loadStatistiques() {
    Object.values(statsCharts).forEach(chart => { if (chart && chart.destroy) chart.destroy(); });
    statsCharts = {};

    var period = document.getElementById('statPeriodSelect')?.value || '7';
    var now = new Date();
    var startDate = null;
    if (period !== 'all') {
        var days = parseInt(period);
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    }

    var statsContent = document.getElementById('statsContent');
    if (!statsContent) return;

    try {
        const [
            ventesSnap, commandesSnap, depensesSnap, clientsSnap, produitsSnap, categoriesSnap,
            stockSnap, personnelSnap, creditsSnap, settingsSnap
        ] = await Promise.all([
            db.collection('ventes').orderBy('createdAt','desc').get(),
            db.collection('commandes').orderBy('createdAt','desc').get(),
            db.collection('depenses').orderBy('createdAt','desc').get(),
            db.collection('clients').get(),
            db.collection('products').get(),
            db.collection('categories').get(),
            db.collection('stock').get(),
            db.collection('personnel').get(),
            db.collection('credits').orderBy('createdAt','desc').get(),
            db.collection('settings').doc('fidelite').get()
        ]);

        var ventes = [], commandes = [], depenses = [], credits = [];
        ventesSnap.forEach(d => { var dd = d.data(); dd.id = d.id; var docDate = toDate(dd.createdAt); if (!startDate || (docDate && docDate >= startDate)) ventes.push(dd); });
        commandesSnap.forEach(d => { var dd = d.data(); dd.id = d.id; var docDate = toDate(dd.createdAt); if (!startDate || (docDate && docDate >= startDate)) commandes.push(dd); });
        depensesSnap.forEach(d => { var dd = d.data(); dd.id = d.id; var docDate = toDate(dd.createdAt); if (!startDate || (docDate && docDate >= startDate)) depenses.push(dd); });
        creditsSnap.forEach(d => { var dd = d.data(); dd.id = d.id; var docDate = toDate(dd.createdAt); if (!startDate || (docDate && docDate >= startDate)) credits.push(dd); });

        var clients = []; clientsSnap.forEach(d => clients.push({ id: d.id, ...d.data() }));
        var produits = []; produitsSnap.forEach(d => produits.push({ id: d.id, ...d.data() }));
        var categories = []; categoriesSnap.forEach(d => categories.push({ id: d.id, ...d.data() }));
        var stockItems = []; stockSnap.forEach(d => stockItems.push({ id: d.id, ...d.data() }));
        var personnel = []; personnelSnap.forEach(d => personnel.push({ id: d.id, ...d.data() }));
        var fideliteSettings = settingsSnap.exists ? settingsSnap.data() : { active: true, pointsParVente: 1 };

        var totalVentes = ventes.reduce((sum, v) => sum + (v.total || 0), 0);
        var totalProfit = ventes.reduce((sum, v) => {
            var profit = 0;
            if (v.items) {
                v.items.forEach(it => {
                    var pa = it.prixAchat || 0, pv = it.prixVente || 0, pp = it.prixPromo || 0, pvr = (pp > 0) ? pp : pv, q = it.quantite || 1;
                    profit += (pvr - pa) * q;
                });
            }
            return sum + profit;
        }, 0);
        var totalDepenses = depenses.reduce((sum, d) => sum + (d.montant || 0), 0);
        var totalCreditsImpayes = credits.filter(c => !c.paid).reduce((sum, c) => sum + (c.remainingAmount || c.total || 0), 0);
        var nbVentes = ventes.length;
        var panierMoyen = nbVentes > 0 ? totalVentes / nbVentes : 0;
        var nbClients = clients.length;
        var nbProduits = produits.length;
        var nbCommandes = commandes.length;
        var tauxConversion = nbCommandes > 0 ? (nbVentes / nbCommandes * 100) : 0;
        var valeurStock = stockItems.reduce((sum, s) => sum + ((s.prixAchat || 0) * (s.quantite || 0)), 0);
        var totalSalaires = personnel.reduce((sum, p) => sum + (p.salaire || 0), 0);
        var pointsTotal = fideliteSettings.active ? clients.reduce((sum, c) => sum + (c.pointsFidelite || 0), 0) : 0;

        var productSales = {};
        ventes.forEach(v => {
            if (v.items) {
                v.items.forEach(it => {
                    var nom = it.nom || 'Sans nom';
                    if (!productSales[nom]) productSales[nom] = 0;
                    productSales[nom] += (it.quantite || 0);
                });
            }
        });
        var topProduits = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5);

        var categoryCA = {};
        ventes.forEach(v => {
            if (v.items) {
                v.items.forEach(it => {
                    var cat = produits.find(p => p.nom === it.nom)?.categorie || 'Sans catégorie';
                    if (!categoryCA[cat]) categoryCA[cat] = 0;
                    categoryCA[cat] += (it.prixVente || it.prixUnitaire || 0) * (it.quantite || 0);
                });
            }
        });
        var topCategories = Object.entries(categoryCA).sort((a, b) => b[1] - a[1]).slice(0, 5);

        var paymentMethods = {};
        ventes.forEach(v => {
            var method = v.paymentMethod || 'espece';
            if (!paymentMethods[method]) paymentMethods[method] = 0;
            paymentMethods[method] += 1;
        });

        var dailySales = {};
        var daysToShow = period === 'all' ? 30 : parseInt(period);
        for (var i = daysToShow - 1; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            var key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailySales[key] = 0;
        }
        ventes.forEach(v => {
            var vDate = toDate(v.createdAt);
            if (vDate) {
                var dateKey = vDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                if (dailySales[dateKey] !== undefined) dailySales[dateKey] += v.total || 0;
            }
        });

        var depensesByCat = {};
        depenses.forEach(d => {
            var cat = d.categorie || 'Autre';
            if (!depensesByCat[cat]) depensesByCat[cat] = 0;
            depensesByCat[cat] += d.montant || 0;
        });

        var creditsImpayesParClient = {};
        credits.filter(c => !c.paid).forEach(c => {
            var client = c.clientName || 'Inconnu';
            if (!creditsImpayesParClient[client]) creditsImpayesParClient[client] = 0;
            creditsImpayesParClient[client] += (c.remainingAmount || c.total || 0);
        });

        var statsHTML = '';

        statsHTML += '<div class="stats-grid" style="margin-bottom:20px;">';
        statsHTML += buildStatCard('Chiffre d\'affaires', totalVentes.toFixed(2) + ' MAD', 'fa-money-bill-wave', '#dcfce7', '#16a34a');
        statsHTML += buildStatCard('Ventes', nbVentes.toString(), 'fa-shopping-cart', '#e0e7ff', '#4f46e5');
        statsHTML += buildStatCard('Profit brut', totalProfit.toFixed(2) + ' MAD', 'fa-chart-line', '#fef3c7', '#A67C52');
        statsHTML += buildStatCard('Panier moyen', panierMoyen.toFixed(2) + ' MAD', 'fa-shopping-basket', '#fce7f3', '#ec4899');
        statsHTML += buildStatCard('Dépenses', totalDepenses.toFixed(2) + ' MAD', 'fa-coins', '#fee2e2', '#ef4444');
        statsHTML += buildStatCard('Crédits impayés', totalCreditsImpayes.toFixed(2) + ' MAD', 'fa-credit-card', '#fef3c7', '#d97706');
        statsHTML += buildStatCard('Bénéfice net', (totalProfit - totalDepenses).toFixed(2) + ' MAD', 'fa-balance-scale', '#e0e7ff', '#4f46e5');
        statsHTML += buildStatCard('Clients', nbClients.toString(), 'fa-users', '#dcfce7', '#16a34a');
        statsHTML += buildStatCard('Produits', nbProduits.toString(), 'fa-coffee', '#f0fdf4', '#16a34a');
        statsHTML += buildStatCard('Taux conversion', tauxConversion.toFixed(1) + '%', 'fa-chart-pie', '#fef3c7', '#A67C52');
        statsHTML += buildStatCard('Valeur stock', valeurStock.toFixed(2) + ' MAD', 'fa-boxes', '#e0e7ff', '#4f46e5');
        statsHTML += buildStatCard('Salaires', totalSalaires.toFixed(2) + ' MAD', 'fa-user-tie', '#fee2e2', '#ef4444');
        if (fideliteSettings.active) statsHTML += buildStatCard('Points fidélité', pointsTotal.toString(), 'fa-star', '#fef3c7', '#A67C52');
        statsHTML += '</div>';

        statsHTML += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">📈 Évolution du CA</h4><canvas id="salesChart" style="max-height:250px;"></canvas></div>';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">💳 Méthodes de paiement</h4><canvas id="paymentChart" style="max-height:250px;"></canvas></div>';
        statsHTML += '</div>';
        statsHTML += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">📊 Top 5 Catégories (CA)</h4><canvas id="categoryChart" style="max-height:250px;"></canvas></div>';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">💸 Dépenses par catégorie</h4><canvas id="depensesChart" style="max-height:250px;"></canvas></div>';
        statsHTML += '</div>';
        statsHTML += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">🏆 Top 5 Produits (quantité vendue)</h4><table class="data-table"><thead><tr><th>Produit</th><th>Qté vendue</th></tr></thead><tbody>';
        if (topProduits.length > 0) topProduits.forEach(p => { statsHTML += `<tr><td>${escapeHtml(p[0])}</td><td>${p[1]}</td></tr>`; });
        else statsHTML += '<tr><td colspan="2">Aucune vente</td>\n            </tr>';
        statsHTML += '</tbody>\\n          </table></div>';
        statsHTML += '<div class="content-card"><h4 style="margin-bottom:10px;">📋 Crédits impayés par client</h4><table class="data-table"><thead><tr><th>Client</th><th>Montant (MAD)</th></tr></thead><tbody>';
        var creditsArray = Object.entries(creditsImpayesParClient).sort((a,b) => b[1] - a[1]);
        if (creditsArray.length > 0) creditsArray.slice(0, 10).forEach(c => { statsHTML += `<tr><td>${escapeHtml(c[0])}</td><td style="color:#ef4444;font-weight:600;">${c[1].toFixed(2)}</td></tr>`; });
        else statsHTML += '<tr><td colspan="2">Aucun crédit impayé</td></tr>';
        statsHTML += '</tbody>\\n          </table></div>';
        statsHTML += '</div>';

        if (personnel.length > 0) {
            statsHTML += '<div class="content-card" style="margin-bottom:20px;"><h4 style="margin-bottom:10px;">👥 Effectif</h4><table class="data-table"><thead><tr><th>Rôle</th><th>Effectif</th><th>Total salaires</th></tr></thead><tbody>';
            var effectifParRole = {}, salaireParRole = {};
            personnel.forEach(p => {
                var role = p.role || 'Non défini';
                effectifParRole[role] = (effectifParRole[role] || 0) + 1;
                salaireParRole[role] = (salaireParRole[role] || 0) + (p.salaire || 0);
            });
            Object.keys(effectifParRole).forEach(role => {
                statsHTML += `<tr><td>${escapeHtml(role)}</td><td>${effectifParRole[role]}</td><td>${salaireParRole[role].toFixed(2)} MAD</td></tr>`;
            });
            statsHTML += '</tbody>\\n          </table></div>';
        }

        statsContent.innerHTML = statsHTML;

        setTimeout(() => {
            try {
                var ctx1 = document.getElementById('salesChart')?.getContext('2d');
                if (ctx1) statsCharts.sales = new Chart(ctx1, { type: 'line', data: { labels: Object.keys(dailySales), datasets: [{ label: 'CA (MAD)', data: Object.values(dailySales), borderColor: '#A67C52', backgroundColor: 'rgba(166,124,82,0.1)', fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#A67C52' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' MAD' } } } } });
                var ctx2 = document.getElementById('paymentChart')?.getContext('2d');
                if (ctx2) statsCharts.payment = new Chart(ctx2, { type: 'doughnut', data: { labels: Object.keys(paymentMethods), datasets: [{ data: Object.values(paymentMethods), backgroundColor: ['#A67C52', '#4f46e5', '#16a34a', '#ef4444', '#d97706'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
                var ctx3 = document.getElementById('categoryChart')?.getContext('2d');
                if (ctx3) statsCharts.category = new Chart(ctx3, { type: 'bar', data: { labels: topCategories.map(c => c[0]), datasets: [{ label: 'CA (MAD)', data: topCategories.map(c => c[1]), backgroundColor: '#A67C52', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' MAD' } } } } });
                var ctx4 = document.getElementById('depensesChart')?.getContext('2d');
                if (ctx4) statsCharts.depenses = new Chart(ctx4, { type: 'bar', data: { labels: Object.keys(depensesByCat), datasets: [{ label: 'Dépenses (MAD)', data: Object.values(depensesByCat), backgroundColor: '#ef4444', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' MAD' } } } } });
            } catch(chartError) { console.error('Erreur Chart.js :', chartError); }
        }, 200);

    } catch(e) {
        console.error('Erreur statistiques :', e);
        statsContent.innerHTML = `<div style="text-align:center; padding:40px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#ef4444;"></i><p style="color:#ef4444; margin-top:10px;">Erreur lors du chargement des statistiques</p><p style="color:#64748b; font-size:0.85rem;">${e.message || e}</p></div>`;
    }
}

function buildStatCard(label, value, icon, bgColor, iconColor) {
    return `<div class="stat-card"><div class="stat-icon" style="background:${bgColor};"><i class="fas ${icon}" style="color:${iconColor};"></i></div><div class="stat-info"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-value" style="color:${value.includes('-') ? '#ef4444' : '#1e293b'};">${escapeHtml(value)}</span></div></div>`;
}

console.log('☕ Alma Coffee Shop - Statistics JS prêt');
