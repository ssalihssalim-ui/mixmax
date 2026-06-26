// ==================== SCRIPT.JS - MIXMAX MINIMARKET ====================
// Script principal - Navigation instantanée optimisée

// ========== VARIABLES GLOBALES ==========
window.currentUser = window.currentUser || null;
window.currentUserData = window.currentUserData || null;

window.allCreditsData = window.allCreditsData || [];
window.allDepensesData = window.allDepensesData || [];
window.allStockData = window.allStockData || [];
window.allPersonnelData = window.allPersonnelData || [];
window.allVentesData = window.allVentesData || [];
window.allCommandesData = window.allCommandesData || [];
window.editingId = window.editingId || null;
window.currentCollection = window.currentCollection || '';

window.currentPages = window.currentPages || { categories:1, products:1, clients:1, fournisseurs:1, ventes:1, credits:1, depenses:1, commandes:1 };
window.sortOrders = window.sortOrders || {};
window.itemsPerPage = window.itemsPerPage || 15;

window.filteredCredits = window.filteredCredits || null;
window.filteredDepenses = window.filteredDepenses || null;
window.filteredVentes = window.filteredVentes || null;
window.filteredCommandes = window.filteredCommandes || null;

window.creditsSearch = ''; window.ventesSearch = ''; window.commandesSearch = '';
window.creditsPeriod = 'all'; window.ventesPeriod = 'all'; window.commandesPeriod = 'all';

// ========== FONCTIONS UTILITAIRES GLOBALES ==========
window.escapeHtml = window.escapeHtml || function(str) { if(!str) return ''; return str.replace(/[&<>]/g,function(m){ if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m; }); };
window.toDate = window.toDate || function(val) { if(!val) return null; if(val.toDate) return val.toDate(); if(val.seconds) return new Date(val.seconds*1000); if(typeof val==='string') return new Date(val); if(val instanceof Date) return val; return null; };
window.getPeriodOptions = window.getPeriodOptions || function(selected) { return '<option value="all" '+(selected==='all'?'selected':'')+'>Tout</option><option value="today" '+(selected==='today'?'selected':'')+'>Aujourd\'hui</option><option value="7" '+(selected==='7'?'selected':'')+'>7 jours</option><option value="30" '+(selected==='30'?'selected':'')+'>30 jours</option><option value="90" '+(selected==='90'?'selected':'')+'>3 mois</option><option value="365" '+(selected==='365'?'selected':'')+'>1 an</option>'; };
window.filterByPeriod = window.filterByPeriod || function(data,period){ if(!period||period==='all') return data; var now=new Date(),cutoff; if(period==='today'){ cutoff=new Date(now.getFullYear(),now.getMonth(),now.getDate()); }else{ var days=parseInt(period); if(isNaN(days)) return data; cutoff=new Date(now.getTime()-days*86400000); } return data.filter(function(d){ var date=d.createdAt?new Date(d.createdAt.seconds*1000):null; return date&&date>=cutoff; }); };
window.filterBySearch = window.filterBySearch || function(data,query,fields){ if(!query||!query.trim()) return data; var q=query.toLowerCase().trim(); return data.filter(function(item){ return fields.some(function(field){ var value=item[field]; if(Array.isArray(value)) return value.some(function(v){ return v&&v.toString().toLowerCase().indexOf(q)!==-1; }); return value&&value.toString().toLowerCase().indexOf(q)!==-1; }); }); };
window.applySort = window.applySort || function(collection,data,defaultField){ var so=window.sortOrders[collection]||{},field=Object.keys(so)[0]||defaultField,order=so[field]||'asc'; return data.slice().sort(function(a,b){ var va=a[field],vb=b[field]; if(va==null) va=''; if(vb==null) vb=''; if(typeof va==='string') va=va.toLowerCase(); if(typeof vb==='string') vb=vb.toLowerCase(); if(va<vb) return order==='asc'?-1:1; if(va>vb) return order==='asc'?1:-1; return 0; }); };
window.makeSortableHeader = window.makeSortableHeader || function(collection,field,label,refreshFn){ var cs=window.sortOrders[collection]||{},cf=Object.keys(cs)[0]||'',co=cs[field]||'asc',arrow=''; if(cf===field) arrow=co==='asc'?' ▲':' ▼'; return '<th style="cursor:pointer;white-space:nowrap;" onclick="window.sortOrders[\''+collection+'\']={\''+field+'\':(window.sortOrders[\''+collection+'\']&&window.sortOrders[\''+collection+'\'][\''+field+'\']===\'asc\'?\'desc\':\'asc\')};'+refreshFn+'()">'+label+arrow+'</th>'; };
window.getPageData = window.getPageData || function(collection,data){ var page=window.currentPages[collection]||1,perPage=window.itemsPerPage||15,start=(page-1)*perPage; return data.slice(start,start+perPage); };
window.getPaginationHTML = window.getPaginationHTML || function(collection,totalItems){ var perPage=window.itemsPerPage||15,totalPages=Math.ceil(totalItems/perPage),cp=window.currentPages[collection]||1; if(totalPages<=1) return ''; var html='<div style="display:flex;justify-content:center;gap:8px;margin-top:10px;flex-wrap:wrap;">'; html+='<button onclick="window.currentPages.'+collection+'=1;'+getRefreshFn(collection)+'" '+(cp<=1?'disabled':'')+' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">⏮</button>'; html+='<button onclick="window.currentPages.'+collection+'='+Math.max(1,cp-1)+';'+getRefreshFn(collection)+'" '+(cp<=1?'disabled':'')+' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">◀</button>'; html+='<span style="padding:6px 12px;">'+cp+' / '+totalPages+'</span>'; html+='<button onclick="window.currentPages.'+collection+'='+Math.min(totalPages,cp+1)+';'+getRefreshFn(collection)+'" '+(cp>=totalPages?'disabled':'')+' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">▶</button>'; html+='<button onclick="window.currentPages.'+collection+'='+totalPages+';'+getRefreshFn(collection)+'" '+(cp>=totalPages?'disabled':'')+' style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;">⏭</button>'; html+='</div>'; return html; };
function getRefreshFn(c){ var m={categories:'renderCategoriesTable()',products:'renderProductsTable()',clients:'renderClientsTable()',fournisseurs:'renderFournisseursTable()',ventes:'renderVentesTable()',credits:'renderCreditsTable()',depenses:'renderDepensesTable()',commandes:'renderCommandesTable()'}; return m[c]||''; }
window.refreshCurrentPage = function(){ var ct=document.getElementById('pageTitle')?.textContent||'',pm={Dashboard:'dashboard',POS:'pos','Commandes en ligne':'commandes',Catégories:'categories',Produits:'products',Clients:'clients',Fournisseurs:'fournisseurs',Ventes:'ventes',Crédits:'credits',Dépenses:'depenses',Statistiques:'statistiques',Options:'options'},p=pm[ct]; if(p&&typeof navigateTo==='function') navigateTo(p); };
window.openModal = window.openModal || function(title,bodyHTML){ var o=document.getElementById('modalOverlay'),t=document.getElementById('modalTitle'),b=document.getElementById('modalBody'); if(!o||!t||!b) return; t.textContent=title; b.innerHTML=bodyHTML; o.classList.remove('hidden'); };
window.closeModal = function(){ var o=document.getElementById('modalOverlay'); if(o) o.classList.add('hidden'); window.editingId=null; };
window.saveDocument = window.saveDocument||function(collection,data,cb){ if(window.editingId){ CacheDB.write(collection,window.editingId,data,'update').then(function(){ if(cb) cb(); CacheDB.sync(); }); }else{ if(!data.createdAt) data.createdAt=firebase.firestore.FieldValue.serverTimestamp(); CacheDB.write(collection,null,data,'add').then(function(){ if(cb) cb(); CacheDB.sync(); }); } };
window.editDocument = window.editDocument||function(collection,id){ db.collection(collection).doc(id).get().then(function(doc){ if(doc.exists){ window.editingId=id; window.currentCollection=collection; var d=doc.data(),fo={categories:'openCategoryForm',products:'openProductForm',clients:'openClientForm',fournisseurs:'openFournisseurForm'},fn=fo[collection]; if(fn&&typeof window[fn]==='function') window[fn](d); } }); };
window.deleteDocument = window.deleteDocument||function(collection,id){ if(!confirm('Supprimer définitivement ?')) return; CacheDB.write(collection,id,null,'delete').then(function(){ alert('Supprimé'); if(typeof refreshCurrentPage==='function') refreshCurrentPage(); CacheDB.sync(); }); };
window.fileToBase64 = window.fileToBase64||function(file,cb){ var r=new FileReader(); r.onload=function(e){ cb(e.target.result); }; r.readAsDataURL(file); };
window.previewImage = window.previewImage||function(input,previewId){ var p=document.getElementById(previewId); if(!p) return; if(input.files&&input.files[0]){ var r=new FileReader(); r.onload=function(e){ p.innerHTML='<img src="'+e.target.result+'" style="max-width:100px;border-radius:8px;">'; }; r.readAsDataURL(input.files[0]); } };

// ========== MENU TACTILE ==========
(function(){ var up=new URLSearchParams(window.location.search),tp=up.get('table'); if(tp){ document.addEventListener('DOMContentLoaded',function(){ var ap=document.getElementById('authPage'),dp=document.getElementById('dashboardPage'),cp=document.getElementById('clientPage'),mp=document.getElementById('menuTactilePage'); if(ap) ap.classList.add('hidden'); if(dp) dp.classList.add('hidden'); if(cp) cp.classList.add('hidden'); if(mp) mp.classList.remove('hidden'); }); window._menuTactileTable=tp; } })();

// ========== INITIALISATION ==========
window.addEventListener('load',function(){ setTimeout(function(){ initApp(); },300); });

async function initApp(){
    console.log('☕ Mixmax Minimarket Started');
    if(window._menuTactileTable){ var tp=window._menuTactileTable; document.getElementById('authPage').classList.add('hidden'); document.getElementById('dashboardPage').classList.add('hidden'); document.getElementById('clientPage').classList.add('hidden'); document.getElementById('menuTactilePage').classList.remove('hidden'); var a=0,wi=setInterval(function(){ if(typeof db!=='undefined'&&typeof CacheDB!=='undefined'&&typeof initMenuTactile==='function'){ clearInterval(wi); initMenuTactile(tp); }else if(a++>100){ clearInterval(wi); console.error('Timeout'); } },100); return; }
    var ap=document.getElementById('authPage'),dp=document.getElementById('dashboardPage'),cp=document.getElementById('clientPage');
    if(!ap||!dp||!cp){ console.error('Elements manquants'); return; }
    dp.classList.add('hidden'); cp.classList.add('hidden'); ap.classList.remove('hidden');
    var cu=await CacheDB.get('users','current');
    if(cu&&cu.uid){ auth.onAuthStateChanged(function(u){ if(u&&u.uid===cu.uid){ window.currentUserData=cu; if(cu.userData.role==='client') showClientPage(); else showDashboard(); }else{ CacheDB.write('users','current',null,'delete'); auth.signOut(); showAuthPage(); } }); }
    else{ auth.onAuthStateChanged(async function(u){ if(u){ try{ var ud=await CacheDB.get('users',u.uid); if(!ud){ var d=await db.collection('users').doc(u.uid).get(); if(!d.exists) throw new Error('No user'); ud={uid:d.id,userData:d.data()}; await CacheDB.set('users',u.uid,ud); } if(ud.userData.authorized!=='yes'){ auth.signOut(); showAuthPage(); return; } window.currentUserData=ud; await CacheDB.set('users','current',ud); if(ud.userData.role==='client') showClientPage(); else showDashboard(); }catch(e){ console.error(e); auth.signOut(); showAuthPage(); } }else{ window.currentUserData=null; showAuthPage(); } }); }
    showLogin();
}

// ========== NAVIGATION ==========
function toggleSidebar(){ var s=document.getElementById('sidebar'),o=document.getElementById('sidebarOverlay'); if(s) s.classList.toggle('open'); if(o) o.classList.toggle('active'); }
function toggleClientSidebar(){ var s=document.getElementById('clientSidebar'),o=document.getElementById('clientSidebarOverlay'); if(s) s.classList.toggle('open'); if(o) o.classList.toggle('active'); }
function showAuthPage(){ document.getElementById('authPage').classList.remove('hidden'); document.getElementById('dashboardPage').classList.add('hidden'); document.getElementById('clientPage').classList.add('hidden'); }
function showDashboard(){ document.getElementById('authPage').classList.add('hidden'); document.getElementById('dashboardPage').classList.remove('hidden'); document.getElementById('clientPage').classList.add('hidden'); buildMenu(); updateSidebarUserInfo(); if(window.currentUserData&&window.currentUserData.userData.role==='caissier') navigateTo('pos'); else navigateTo('dashboard'); }
function showClientPage(){ document.getElementById('authPage').classList.add('hidden'); document.getElementById('dashboardPage').classList.add('hidden'); document.getElementById('clientPage').classList.remove('hidden'); updateClientSidebarInfo(); if(typeof clientNavigate==='function') clientNavigate('commander'); }

function buildMenu(){
    var m=document.getElementById('navMenu'); if(!m) return; m.innerHTML='';
    var items=[];
    if(window.currentUserData&&window.currentUserData.userData.role==='admin'){ items=[{p:'dashboard',i:'fa-chart-line',l:'Dashboard'},{p:'pos',i:'fa-cash-register',l:'POS'},{p:'commandes',i:'fa-shopping-basket',l:'Commandes en ligne'},{p:'categories',i:'fa-layer-group',l:'Catégories'},{p:'products',i:'fa-coffee',l:'Produits'},{p:'clients',i:'fa-users',l:'Clients'},{p:'fournisseurs',i:'fa-truck',l:'Fournisseurs'},{p:'ventes',i:'fa-shopping-cart',l:'Ventes'},{p:'credits',i:'fa-credit-card',l:'Crédits'},{p:'depenses',i:'fa-money-bill-wave',l:'Dépenses'},{p:'statistiques',i:'fa-chart-bar',l:'Statistiques'},{p:'options',i:'fa-cog',l:'Options'}]; var rs=document.getElementById('sidebarRole'); if(rs) rs.textContent='Admin'; }
    else if(window.currentUserData&&window.currentUserData.userData.role==='caissier'){ items=[{p:'pos',i:'fa-cash-register',l:'POS'},{p:'commandes',i:'fa-shopping-basket',l:'Commandes en ligne'},{p:'ventes',i:'fa-shopping-cart',l:'Ventes'},{p:'credits',i:'fa-credit-card',l:'Crédits'}]; var rs=document.getElementById('sidebarRole'); if(rs) rs.textContent='Caissier'; }
    items.forEach(function(item){ var li=document.createElement('li'); li.className='nav-item'; li.onclick=function(){ navigateTo(item.p); }; li.innerHTML='<i class="fas '+item.i+'"></i> '+item.l; m.appendChild(li); });
}

// ========== NAVIGATION INSTANTANÉE ==========
function navigateTo(page){
    if(!window.currentUserData||window.currentUserData.userData.authorized!=='yes'){ auth.signOut(); showAuthPage(); return; }
    var items=document.querySelectorAll('#navMenu .nav-item'); items.forEach(function(item){ item.classList.remove('active'); });
    var pages=['dashboard','pos','commandes','categories','products','clients','fournisseurs','ventes','credits','depenses','statistiques','options'];
    var index=pages.indexOf(page); if(index>=0&&items[index]) items[index].classList.add('active');
    var titles={ dashboard:'Dashboard',pos:'POS',commandes:'Commandes en ligne',categories:'Catégories',products:'Produits',clients:'Clients',fournisseurs:'Fournisseurs',ventes:'Ventes',credits:'Crédits',depenses:'Dépenses',statistiques:'Statistiques',options:'Options' };
    var icons={ dashboard:'fa-chart-line',pos:'fa-cash-register',commandes:'fa-shopping-basket',categories:'fa-layer-group',products:'fa-coffee',clients:'fa-users',fournisseurs:'fa-truck',ventes:'fa-shopping-cart',credits:'fa-credit-card',depenses:'fa-money-bill-wave',statistiques:'fa-chart-bar',options:'fa-cog' };
    document.getElementById('pageTitle').textContent=titles[page]||page;
    var hi=document.querySelector('.header-title i'); if(hi&&icons[page]) hi.className='fas '+icons[page];
    var content=document.getElementById('dynamicContent'); if(!content) return;
    
    // ✅ Loader minimaliste
    content.innerHTML='<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:#2E7D32;"></i></div>';
    
    // ✅ Navigation immédiate (sans setTimeout)
    var pageFunctions={ pos:'loadPosPage',commandes:'loadCommandesPage',categories:'loadCategoriesPage',products:'loadProductsPage',clients:'loadClientsPage',fournisseurs:'loadFournisseursPage',ventes:'loadVentesPage',credits:'loadCreditsPage',depenses:'loadDepensesPage',statistiques:'loadStatistiquesPage',options:'loadOptionsPage',dashboard:'loadDashboardPage' };
    var fnName=pageFunctions[page];
    if(fnName&&typeof window[fnName]==='function'){ try{ window[fnName](content); }catch(e){ console.error(e); content.innerHTML='<div class="content-card" style="text-align:center;padding:40px;"><h3>Erreur</h3><p>'+e.message+'</p></div>'; } }
    else{ content.innerHTML='<div class="content-card"><h3>'+(titles[page]||'Page')+'</h3><p style="text-align:center;padding:40px;">En développement</p></div>'; }
    
    var s=document.getElementById('sidebar'),o=document.getElementById('sidebarOverlay'); if(s&&s.classList.contains('open')){ s.classList.remove('open'); if(o) o.classList.remove('active'); }
}

function updateSidebarUserInfo(){ var el=document.getElementById('sidebarUserInfo'); if(el&&window.currentUserData){ el.innerHTML='<i class="fas fa-user-circle"></i> '+window.currentUserData.userData.prenom+' '+window.currentUserData.userData.nom+' <small style="color:#A67C52;">('+window.currentUserData.userData.role+')</small>'; } }
function updateClientSidebarInfo(){ var el=document.getElementById('clientSidebarInfo'); if(el&&window.currentUserData){ el.innerHTML='<i class="fas fa-user-circle"></i> '+window.currentUserData.userData.prenom+' '+window.currentUserData.userData.nom; } }

document.addEventListener('click',function(e){ var o=document.getElementById('modalOverlay'); if(o&&e.target===o&&!o.classList.contains('hidden')) closeModal(); });
window.addEventListener('online',function(){ console.log('✅ En ligne'); if(typeof CacheDB!=='undefined'&&CacheDB.sync) CacheDB.sync().catch(function(e){ console.warn(e); }); });
window.addEventListener('offline',function(){ console.warn('⚠️ Mode hors ligne'); });

console.log('☕ Mixmax Minimarket - Script principal OK (navigation instantanée)');
