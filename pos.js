// ==================== POS.JS - LOGIQUE MÉTIER (FINAL OPTIMISÉ) ====================
// Mixmax Minimarket - Point de vente complet avec virtualisation
// Améliorations : client = Passager par défaut, montant donné = total par défaut

var posCart = [];
var posStep = 1;
var posCategoriesList = [];
var posProductsList = [];
var posSelectedCategory = 'all';
var posCurrentClient = null;
var posCurrentTable = '';
var posPaymentMethod = 'espece';
var posAmountGiven = 0;
var posDiscountMAD = 0;
var posAllClients = [];
var posFilteredClients = [];
var posCurrentProductId = null;
var posSearchQuery = '';

var productNameIndex = {};
var productIndexBuilt = false;
var factureCounter = parseInt(localStorage.getItem('factureCounter')) || 0;
var fideliteSettingsCache = null;

var posCommandesTables = [];
var posCommandesTablesCount = 0;
var posCommandesEnLigneCount = 0;
var posCommandesFilterText = '';
var posCommandesSortField = 'createdAt';
var posCommandesSortOrder = 'desc';

var posEpicesList = ['Normal', 'Moins épicé', 'Très épicé', 'Sans épice'];
var posSelList = ['Normal', 'Moins de sel', 'Sans sel'];
var posCurrentProductIngredients = [];
var allStockData = [];

var posIsRendering = false;
var posLastRenderTime = 0;
var isFinalizing = false;

// ✅ Virtualisation
var posProductOffset = 0;
var posProductBatchSize = 50;
var posHasMoreProducts = false;

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g,function(m){ if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m; }); }
function toDate(val) { if(!val) return null; if(val.toDate) return val.toDate(); if(val.seconds) return new Date(val.seconds*1000); if(typeof val==='string') return new Date(val); if(val instanceof Date) return val; return null; }

function buildProductIndex() { if(productIndexBuilt) return; productNameIndex={}; posProductsList.forEach(function(p){ if(!p.nom) return; p.nom.toLowerCase().split(' ').forEach(function(w){ if(w.length<2) return; if(!productNameIndex[w]) productNameIndex[w]=[]; productNameIndex[w].push(p); }); }); productIndexBuilt=true; }
function fastSearch(query) { if(!query) return posProductsList; buildProductIndex(); var words=query.toLowerCase().split(' '),results=[],seen={}; words.forEach(function(w){ if(w.length<2) return; (productNameIndex[w]||[]).forEach(function(p){ if(!seen[p.id]){ seen[p.id]=true; results.push(p); } }); }); if(results.length===0) return posProductsList.filter(function(p){ return (p.nom||'').toLowerCase().indexOf(query)!==-1||(p.categorie||'').toLowerCase().indexOf(query)!==-1||(p.description||'').toLowerCase().indexOf(query)!==-1; }); return results; }
function posEnrichirItemsAvecPrixAchat(items){ return items.map(function(item){ var produit=posProductsList.find(function(p){ return p.id===item.id; }); var prixAchat=(produit&&produit.prixAchat!=null)?produit.prixAchat:(item.prixAchat||0); return Object.assign({},item,{prixAchat:prixAchat}); }); }
function isOnPOSPage(){ var pt=document.getElementById('pageTitle')?.textContent||''; return pt==='POS'||pt==='Dashboard'; }

// ==================== CHARGEMENT ====================
async function loadPosPage(c){
    posResetCart(); posStep=1; posCommandesFilterText=''; posCommandesSortField='createdAt'; posCommandesSortOrder='desc'; posSearchQuery=''; productIndexBuilt=false; posProductOffset=0;
    posCategoriesList=[]; posProductsList=[]; posAllClients=[]; posFilteredClients=[];
    c.innerHTML='<div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:2.5rem;color:#2E7D32;"></i><p style="margin-top:15px;color:#64748b;">Chargement du POS...</p></div>';
    try{
        let cc=await CacheDB.getAll('categories'),cp=await CacheDB.getAll('products'),cl=await CacheDB.getAll('clients');
        if(cc.length){ posCategoriesList=cc.map(x=>({id:x.id,nom:x.nom,imageBase64:x.imageBase64,recette:x.recette||false})); }
        if(cp.length){ posProductsList=cp.filter(x=>x.disponible!==false).map(x=>({...x,description:x.description||''})); productIndexBuilt=false; }
        if(cl.length){ posAllClients=cl.map(x=>({id:x.id,nom:x.nom,prenom:x.prenom,telephone:x.telephone,description:x.description||''})); posFilteredClients=[...posAllClients]; }
        if(isOnPOSPage()) renderPOS();
    }catch(e){ console.error(e); }
    setTimeout(async function(){
        try{
            const[cs,ps,cl]=await Promise.all([db.collection('categories').get(),db.collection('products').get(),db.collection('clients').limit(500).get()]);
            posCategoriesList=[]; cs.forEach(d=>{ let cat={id:d.id,nom:d.data().nom,imageBase64:d.data().imageBase64,recette:d.data().recette||false}; posCategoriesList.push(cat); CacheDB.set('categories',d.id,cat); });
            posProductsList=[]; ps.forEach(d=>{ let dd=d.data(); if(dd.disponible!==false){ let prod={id:d.id,nom:dd.nom||'',description:dd.description||'',prixVente:dd.prixVente||0,prixPromo:dd.prixPromo||0,prixAchat:dd.prixAchat||0,stock:dd.stock,categorie:dd.categorie||'',imageBase64:dd.imageBase64||''}; posProductsList.push(prod); CacheDB.set('products',d.id,prod); } }); productIndexBuilt=false;
            posAllClients=[]; cl.forEach(d=>{ let data=d.data(),cli={id:d.id,nom:data.nom,prenom:data.prenom,telephone:data.telephone,description:data.description||''}; posAllClients.push(cli); CacheDB.set('clients',d.id,cli); }); posFilteredClients=[...posAllClients];
            if(isOnPOSPage()) renderPOS();
        }catch(e){ console.error(e); }
    },300);
    await posChargerCommandesTables(); await posChargerCommandesEnLigneCount();
    var cmdData=localStorage.getItem('posCommandeData'),payData=localStorage.getItem('posPayerVente');
    if(cmdData){ var cmd=JSON.parse(cmdData); localStorage.removeItem('posCommandeData'); posCart=[]; if(cmd.items){ posEnrichirItemsAvecPrixAchat(cmd.items).forEach(function(item){ posCart.push({id:item.id,nom:item.nom,prixUnitaire:item.prixVente||item.prixUnitaire||0,prixAchat:item.prixAchat||0,prixPromo:item.prixPromo||0,prixVente:item.prixVente||item.prixUnitaire||0,quantite:item.quantite||1,categorie:item.categorie||'',imageBase64:item.imageBase64||'',sauces:item.sauces||[],interdits:item.interdits||[],epice:item.epice||'Normal',sel:item.sel||'Normal'}); }); } if(cmd.clientId&&cmd.clientName) posCurrentClient={id:cmd.clientId,name:cmd.clientName}; posCurrentTable=cmd.table||''; posStep=2; posDiscountMAD=0; posPaymentMethod='espece'; window.posCommandeId=cmd.commandeId; if(isOnPOSPage()) renderPOS(); return; }
    if(payData){ var v=JSON.parse(payData); localStorage.removeItem('posPayerVente'); posCart=[]; if(v.items){ posEnrichirItemsAvecPrixAchat(v.items).forEach(function(item){ posCart.push({id:item.id,nom:item.nom,prixUnitaire:item.prixVente||0,prixAchat:item.prixAchat||0,prixPromo:item.prixPromo||0,prixVente:item.prixVente||0,quantite:item.quantite||1,categorie:'',imageBase64:'',sauces:item.sauces||[],interdits:item.interdits||[],epice:item.epice||'Normal',sel:item.sel||'Normal'}); }); } if(v.clientId&&v.clientName) posCurrentClient={id:v.clientId,name:v.clientName}; posCurrentTable=v.table||''; posStep=2; posDiscountMAD=0; posPaymentMethod='espece'; window.posVenteId=v.venteId; if(isOnPOSPage()) renderPOS(); return; }
    if(isOnPOSPage()) renderPOS();
}

function posSearchProducts(query){ clearTimeout(window._searchTimeout); window._searchTimeout=setTimeout(function(){ posProductOffset=0; posSearchQuery=query.toLowerCase().trim(); if(isOnPOSPage()) filterProductGrid(); },150); }

function loadMoreProducts(){ posProductOffset+=posProductBatchSize; filterProductGrid(); }

function filterProductGrid(){
    if(!isOnPOSPage()) return;
    var grid=document.getElementById('posProductGrid')||document.querySelector('.pos-products-grid'); if(!grid) return;
    var f=fastSearch(posSearchQuery); if(posSelectedCategory!=='all') f=f.filter(function(p){ return p.categorie===posSelectedCategory; }); f.sort(function(a,b){ return (a.nom||'').localeCompare(b.nom||''); });
    
    // ✅ Virtualisation
    var totalProducts = f.length;
    var displayProducts = f.slice(0, posProductOffset + posProductBatchSize);
    posHasMoreProducts = (posProductOffset + posProductBatchSize) < totalProducts;
    
    var html='';
    if(totalProducts===0){ html+='<div style="grid-column:1/-1;text-align:center;padding:40px 10px;"><i class="fas fa-search" style="font-size:2.5rem;color:#94a3b8;"></i><p style="color:#94a3b8;">'+(posSearchQuery?'Aucun produit pour "'+escapeHtml(posSearchQuery)+'"':'Aucun produit')+'</p>'+(posSearchQuery?'<button class="btn-add" onclick="document.getElementById(\'posSearchInput\').value=\'\';posSearchProducts(\'\');">Effacer</button>':'')+'</div>'; }
    else{
        if(posSearchQuery) html+='<div style="grid-column:1/-1;padding:3px 8px;font-size:0.75rem;color:#94a3b8;">'+totalProducts+' résultat'+(totalProducts>1?'s':'')+'</div>';
        for(var j=0;j<displayProducts.length;j++){ var p=displayProducts[j],pr=p.prixPromo&&p.prixPromo>0?p.prixPromo:p.prixVente,hp=p.prixPromo&&p.prixPromo>0,sc='',stt=''; if(p.stock!==undefined){ if(p.stock<=0){sc='pos-out-of-stock';stt=' (Rupture)';}else if(p.stock<=5) stt=' ('+p.stock+' rest.)'; } var dn=escapeHtml(p.nom); if(posSearchQuery) dn=dn.replace(new RegExp('('+posSearchQuery.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark style="background:#fef3c7;border-radius:3px;">$1</mark>'); html+='<div class="pos-product-card '+sc+'" onclick="posAddToCartOrOpenOptions(\''+p.id+'\')">'+(p.imageBase64?'<div class="pos-product-img"><img src="'+escapeHtml(p.imageBase64)+'" loading="lazy" alt=""></div>':'<div class="pos-product-img pos-product-placeholder"><i class="fas fa-box"></i></div>')+'<div class="pos-product-info"><span class="pos-product-name">'+dn+stt+'</span><span class="pos-product-price">'+(hp?'<span class="pos-old-price">'+p.prixVente.toFixed(2)+'</span> <span class="pos-promo-price">'+pr.toFixed(2)+' MAD</span>':pr.toFixed(2)+' MAD')+'</span></div></div>'; }
        if(posHasMoreProducts){ html+='<div style="grid-column:1/-1;text-align:center;padding:10px;"><button class="btn-add" onclick="loadMoreProducts()" style="font-size:0.8rem;">Afficher plus ('+(totalProducts-displayProducts.length)+' produits restants)</button></div>'; }
    }
    grid.innerHTML=html;
}

// ==================== COMMANDES TABLES ====================
async function posChargerCommandesTables(){ try{ var snap=await db.collection('commandes').where('statut','==','en_attente').where('source','==','menu_tactile').get(); posCommandesTables=[]; snap.forEach(function(doc){ var d=doc.data();d.id=doc.id;posCommandesTables.push(d); }); posCommandesTables.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); posCommandesTablesCount=posCommandesTables.length; }catch(e){ posCommandesTablesCount=0; } }
async function posChargerCommandesEnLigneCount(){ try{ var snap=await db.collection('commandes').where('statut','==','en_attente').where('source','==','client').get(); posCommandesEnLigneCount=snap.size; }catch(e){ posCommandesEnLigneCount=0; } }
function posTriCommandesTables(field){ posCommandesSortOrder=(posCommandesSortField===field)?(posCommandesSortOrder==='asc'?'desc':'asc'):'asc'; posCommandesSortField=field; posAfficherCommandesTables(); }
function posApplyCommandesFilter(value){ posCommandesFilterText=value; posAfficherCommandesTables(); }

function posAfficherCommandesTables(){
    if(posCommandesTables.length===0){ alert('Aucune commande table en attente.'); return; }
    var fd=posCommandesTables.slice(); if(posCommandesFilterText.trim()){ var q=posCommandesFilterText.toLowerCase().trim(); fd=fd.filter(function(cmd){ if((cmd.table||'').toLowerCase().includes(q)) return true; if(cmd.items&&cmd.items.some(function(it){ return (it.nom||'').toLowerCase().includes(q)||((it.interdits||[]).concat(it.epice!=='Normal'?[it.epice]:[],it.sel!=='Normal'?[it.sel]:[])).some(function(o){ return o.toLowerCase().includes(q); }); })) return true; return false; }); }
    fd.sort(function(a,b){ var va,vb; switch(posCommandesSortField){ case'table':va=(a.table||'').toLowerCase();vb=(b.table||'').toLowerCase();break; case'total':va=a.total||0;vb=b.total||0;break; case'createdAt':va=a.createdAt?.seconds||0;vb=b.createdAt?.seconds||0;break; default:va=0;vb=0; } return (va<vb)?(posCommandesSortOrder==='asc'?-1:1):(va>vb)?(posCommandesSortOrder==='asc'?1:-1):0; });
    function rsh(label,field){ var icon=''; if(posCommandesSortField===field) icon=posCommandesSortOrder==='asc'?' ▲':' ▼'; return '<th style="cursor:pointer;" onclick="posTriCommandesTables(\''+field+'\')">'+label+icon+'</th>'; }
    var html='<div style="margin-bottom:12px;display:flex;gap:8px;"><input type="text" id="posCmdFilterInput" placeholder="🔍 Filtrer..." style="flex:1;padding:8px 12px;border:2px solid #e2e8f0;border-radius:30px;font-size:0.8rem;" value="'+escapeHtml(posCommandesFilterText)+'" onkeyup="posApplyCommandesFilter(this.value)"><button class="btn-add" onclick="posApplyCommandesFilter(\'\')">❌</button></div><div style="max-height:60vh;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:0.7rem;"><thead><tr>'+rsh('Table','table')+'<th>Produits</th><th>Options</th>'+rsh('Total','total')+rsh('Date','createdAt')+'<th>Actions</th></thead><tbody>';
    if(fd.length===0) html+='<tr><td colspan="6" style="text-align:center;padding:20px;">Aucune</td></tr>';
    else fd.forEach(function(cmd){ var table=cmd.table||'?',dh=cmd.createdAt?new Date(cmd.createdAt.seconds*1000).toLocaleString('fr-FR'):'N/A',prod=cmd.items?cmd.items.map(function(it){ return '<strong>'+it.quantite+'x</strong> '+escapeHtml(it.nom); }).join('<br>'):'-',opts=cmd.items?cmd.items.map(function(it){ var o=[]; if(it.interdits&&it.interdits.length) o.push('<span style="color:#ef4444;">🚫 '+escapeHtml(it.interdits.join(', '))+'</span>'); if(it.epice&&it.epice!=='Normal') o.push('<span style="color:#d97706;">🌶️ '+escapeHtml(it.epice)+'</span>'); if(it.sel&&it.sel!=='Normal') o.push('<span style="color:#4f46e5;">🧂 '+escapeHtml(it.sel)+'</span>'); return o.length?o.join(' | '):'<span style="color:#94a3b8;">-</span>'; }).join('<br>'):'-'; html+='<tr><td><strong>🍽️ '+escapeHtml(table)+'</strong></td><td>'+prod+'</td><td><small>'+opts+'</small></td><td><strong style="color:#2E7D32;">'+cmd.total.toFixed(2)+' MAD</strong></td><td><small>'+dh+'</small></td><td><button class="btn-add" style="padding:3px 6px;font-size:0.65rem;" onclick="posChargerCommandeTable(\''+cmd.id+'\')">Accepter</button> <button class="btn-save" style="padding:3px 6px;font-size:0.65rem;" onclick="posPayerCommandeTable(\''+cmd.id+'\')">Payé</button></td></tr>'; });
    html+='</tbody></table></div>'; openModal('🛎️ Commandes tables ('+fd.length+')',html);
}
function posChargerCommandeTable(cid){ var cmd=posCommandesTables.find(function(c){ return c.id===cid; }); if(!cmd) return; posCart=[]; posEnrichirItemsAvecPrixAchat(cmd.items).forEach(function(item){ posCart.push({id:item.id,nom:item.nom,prixUnitaire:item.prixUnitaire||item.prixVente||0,prixAchat:item.prixAchat||0,prixPromo:item.prixPromo||0,prixVente:item.prixVente||item.prixUnitaire||0,quantite:item.quantite||1,categorie:item.categorie||'',imageBase64:item.imageBase64||'',sauces:[],interdits:item.interdits||[],epice:item.epice||'Normal',sel:item.sel||'Normal'}); }); posCurrentTable='Table '+(cmd.table||'?'); posCurrentClient=null; posPaymentMethod='espece'; posDiscountMAD=0; window.posCommandeId=cid; closeModal(); posStep=2; if(isOnPOSPage()) renderPOS(); }
async function posPayerCommandeTable(cid){ if(!confirm('Marquer comme payée ?')) return; try{ await CacheDB.write('commandes',cid,{statut:'payé',paidAt:firebase.firestore.FieldValue.serverTimestamp()},'update'); alert('✅ Payée !'); await posChargerCommandesTables(); closeModal(); if(isOnPOSPage()) renderPOS(); CacheDB.sync(); }catch(e){ alert('❌ '+e.message); } }

// ==================== PANIER ====================
function posResetCart(){ posCart=[]; posStep=1; posSelectedCategory='all'; posCurrentClient=null; posCurrentTable=''; posPaymentMethod='espece'; posAmountGiven=0; posDiscountMAD=0; posSearchQuery=''; posProductOffset=0; posFilteredClients=posAllClients.slice(); delete window.posCommandeId; delete window.posVenteId; var si=document.getElementById('posSearchInput'); if(si) si.value=''; if(isOnPOSPage()) renderPOS(); }

function posSearchClient(query){ var q=query.toLowerCase().trim(); posCurrentClient=null; if(!q){ posFilteredClients=posAllClients.slice(); var d=document.getElementById('posClientDropdown'); if(d) d.style.display='none'; }else{ posFilteredClients=posAllClients.filter(function(c){ return (c.nom||'').toLowerCase().indexOf(q)!==-1||(c.prenom||'').toLowerCase().indexOf(q)!==-1||(c.telephone||'').toLowerCase().indexOf(q)!==-1||(c.description||'').toLowerCase().indexOf(q)!==-1; }); renderClientDropdown(); } }
function renderClientDropdown(){ var d=document.getElementById('posClientDropdown'); if(!d) return; var h=''; if(posFilteredClients.length===0) h='<div style="padding:8px;color:#94a3b8;text-align:center;">Aucun</div>'; else posFilteredClients.forEach(function(c){ h+='<div onclick="posSelectClientFromDropdown(\''+c.id+'\',\''+escapeHtml(c.nom)+' '+escapeHtml(c.prenom)+'\')" style="padding:8px;cursor:pointer;border-bottom:1px solid #f1f5f9;">'+escapeHtml(c.nom)+' '+escapeHtml(c.prenom)+' <span style="color:#94a3b8;font-size:0.65rem;">('+(c.telephone||'')+')</span></div>'; }); d.innerHTML=h; d.style.display='block'; }
function posSelectClientFromDropdown(cid,cn){ posCurrentClient={id:cid,name:cn}; posCurrentTable=''; var s=document.getElementById('posClientSearchInput'),t=document.getElementById('posTableNum'),d=document.getElementById('posClientDropdown'); if(s) s.value=cn; if(t) t.value=''; if(d) d.style.display='none'; updatePaymentButtons(); if(isOnPOSPage()) renderPOS(); }
document.addEventListener('click',function(e){ var d=document.getElementById('posClientDropdown'),s=document.getElementById('posClientSearchInput'); if(d&&s&&!s.contains(e.target)&&!d.contains(e.target)) d.style.display='none'; });
function updatePaymentButtons(){ setTimeout(function(){ var cb=document.getElementById('posCreditBtn'),pb=document.getElementById('posPartielBtn'),cc=posCurrentClient&&posCurrentClient.id; if(cb){ cb.disabled=!cc; cb.style.opacity=cc?'1':'0.4'; } if(pb){ pb.disabled=!cc; pb.style.opacity=cc?'1':'0.4'; } },300); }
function posSetTable(v){ posCurrentTable=v.trim(); if(posCurrentTable){ posCurrentClient=null; posPaymentMethod='espece'; var s=document.getElementById('posClientSearchInput'); if(s) s.value=''; } }

function posAddToCartOrOpenOptions(pid){ var p=posProductsList.find(function(x){ return x.id===pid; }); if(!p) return; if(p.stock!==undefined&&p.stock<=0){ alert('Rupture'); return; } var cat=posCategoriesList.find(function(c){ return c.nom===p.categorie; }),isRecette=cat&&cat.recette===true; if(isRecette){ posCurrentProductId=pid; posOpenOptionsModal(pid); }else{ var ex=posCart.find(function(x){ return x.id===pid; }); if(ex){ if(p.stock!==undefined&&ex.quantite>=p.stock){ alert('Stock insuffisant'); return; } ex.quantite+=1; }else{ var pr=p.prixPromo&&p.prixPromo>0?p.prixPromo:p.prixVente; posCart.push({id:p.id,nom:p.nom,prixUnitaire:pr,prixAchat:p.prixAchat||0,prixPromo:p.prixPromo||0,prixVente:p.prixVente||0,quantite:1,categorie:p.categorie||'',imageBase64:p.imageBase64||'',sauces:[],interdits:[],epice:'Normal',sel:'Normal'}); } if(typeof window.onProductAdded==='function') window.onProductAdded(p.id); updateCartOnly(); } }
async function posOpenOptionsModal(pid){ var p=posProductsList.find(function(x){ return x.id===pid; }); if(!p) return; if(p.stock!==undefined&&p.stock<=0){ alert('Rupture'); return; } if(typeof allStockData==='undefined'||allStockData.length===0){ try{ var snap=await db.collection('stock').orderBy('nom').get(); allStockData=[]; snap.forEach(function(d){ var dd=d.data();dd.id=d.id;allStockData.push(dd); }); }catch(e){} } try{ var doc=await db.collection('products').doc(pid).get(); posCurrentProductIngredients=doc.exists?(doc.data().ingredients||[]):[]; }catch(e){ posCurrentProductIngredients=[]; } var grouped={}; posCurrentProductIngredients.forEach(function(ing){ var si=allStockData.find(function(s){ return s.id===ing.idStock; }),cat=si?si.categorie:'Autre'; if(!grouped[cat]) grouped[cat]=[]; grouped[cat].push(ing.nom); }); var order=['Sauces','Légumes','Fruits','Viande','Poulet','Poisson'],sortedCats=Object.keys(grouped).sort(function(a,b){ var ia=order.indexOf(a),ib=order.indexOf(b); if(ia!==-1&&ib!==-1) return ia-ib; if(ia!==-1) return -1; if(ib!==-1) return 1; return a.localeCompare(b); }); posCurrentProductId=pid; var h='<h4>'+escapeHtml(p.nom)+'</h4>'; if(sortedCats.length===0) h+='<div style="color:#94a3b8;">Aucun ingrédient</div>'; else sortedCats.forEach(function(cat){ h+='<div style="margin-bottom:10px;"><label style="font-weight:600;">🥫 '+escapeHtml(cat)+'</label><div style="display:flex;flex-wrap:wrap;gap:4px;">'; grouped[cat].forEach(function(ing){ h+='<label style="display:flex;align-items:center;gap:3px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;"><input type="checkbox" class="pos-interdit-check" value="'+escapeHtml(ing)+'"> '+escapeHtml(ing)+'</label>'; }); h+='</div></div>'; }); h+='<div><label>🌶️ Épices:</label><div style="display:flex;flex-wrap:wrap;gap:4px;">'; posEpicesList.forEach(function(s,idx){ h+='<label style="padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;"><input type="radio" name="pos-epice" value="'+s+'" '+(idx===0?'checked':'')+'> '+s+'</label>'; }); h+='</div></div><div><label>🧂 Sel:</label><div style="display:flex;flex-wrap:wrap;gap:4px;">'; posSelList.forEach(function(s,idx){ h+='<label style="padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;"><input type="radio" name="pos-sel" value="'+s+'" '+(idx===0?'checked':'')+'> '+s+'</label>'; }); h+='</div></div>'; h+='<div style="text-align:right;margin-top:15px;"><button class="btn-cancel" onclick="closeModal()">Annuler</button> <button class="btn-save" onclick="posConfirmOptions()">Ajouter</button></div>'; openModal('Personnaliser',h); }
function posConfirmOptions(){ var interdits=[]; document.querySelectorAll('.pos-interdit-check:checked').forEach(function(cb){ interdits.push(cb.value); }); var epice=(document.querySelector('input[name="pos-epice"]:checked')||{}).value||'Normal',sel=(document.querySelector('input[name="pos-sel"]:checked')||{}).value||'Normal',p=posProductsList.find(function(x){ return x.id===posCurrentProductId; }); if(!p){ closeModal(); return; } var ex=posCart.find(function(x){ return x.id===posCurrentProductId; }); if(ex){ if(p.stock!==undefined&&ex.quantite>=p.stock){ alert('Stock insuffisant'); closeModal(); return; } ex.quantite+=1; }else{ var pr=p.prixPromo&&p.prixPromo>0?p.prixPromo:p.prixVente; posCart.push({id:p.id,nom:p.nom,prixUnitaire:pr,prixAchat:p.prixAchat||0,prixPromo:p.prixPromo||0,prixVente:p.prixVente||0,quantite:1,categorie:p.categorie||'',imageBase64:p.imageBase64||'',sauces:[],interdits:interdits,epice:epice,sel:sel}); } if(typeof window.onProductAdded==='function') window.onProductAdded(p.id); closeModal(); updateCartOnly(); }
function updateCartOnly(){ if(!isOnPOSPage()) return; var ci=document.querySelector('.pos-cart-items'); if(!ci) return; var html=''; if(posCart.length===0) html='<div class="pos-cart-empty"><i class="fas fa-shopping-basket"></i><p>Panier vide</p></div>'; else for(var k=0;k<posCart.length;k++){ var it=posCart[k],opts=''; if(it.interdits&&it.interdits.length) opts+=' <span style="color:#ef4444;font-size:0.6rem;">🚫'+escapeHtml(it.interdits.join(','))+'</span>'; if(it.epice&&it.epice!=='Normal') opts+=' <span style="color:#d97706;font-size:0.6rem;">🌶️'+escapeHtml(it.epice)+'</span>'; if(it.sel&&it.sel!=='Normal') opts+=' <span style="color:#4f46e5;font-size:0.6rem;">🧂'+escapeHtml(it.sel)+'</span>'; html+='<div class="pos-cart-item"><div class="pos-cart-item-info"><span class="pos-cart-item-name">'+escapeHtml(it.nom)+opts+'</span><span class="pos-cart-item-price">'+it.prixUnitaire.toFixed(2)+' MAD/u</span></div><div class="pos-cart-item-actions"><button class="pos-qty-btn" onclick="posUpdateQty('+k+',-1)"><i class="fas fa-minus"></i></button><span class="pos-qty-value">'+it.quantite+'</span><button class="pos-qty-btn" onclick="posUpdateQty('+k+',1)"><i class="fas fa-plus"></i></button><button class="pos-remove-btn" onclick="posRemoveItem('+k+')"><i class="fas fa-times"></i></button></div><span class="pos-cart-item-total">'+(it.prixUnitaire*it.quantite).toFixed(2)+' MAD</span></div>'; } ci.innerHTML=html; var badge=document.querySelector('.pos-cart-badge'); if(badge) badge.textContent=posCart.length; var tr=document.querySelector('.pos-cart-total-row span:last-child'); if(tr){ var st=posCalculateTotal(),t=st-posDiscountMAD; tr.textContent=t.toFixed(2)+' MAD'; } var vb=document.querySelector('.pos-validate-btn'); if(vb) vb.disabled=posCart.length===0; }
function getNextFactureNum(){ factureCounter=parseInt(localStorage.getItem('factureCounter'))||0; factureCounter++; localStorage.setItem('factureCounter',factureCounter); return 'FACT-'+new Date().getFullYear()+'-'+String(factureCounter).padStart(5,'0'); }

// ==================== RENDU ====================
function renderPOS(){
    if(!isOnPOSPage()) return;
    var now=Date.now(); if(now-posLastRenderTime<100&&posCart.length>0) return; posLastRenderTime=now;
    var c=document.getElementById('dynamicContent'); if(!c) return;
    if(posCart.length===0&&posStep===1){ buildFullPOS(c); return; }
    if(document.querySelector('.pos-container')&&posStep===1&&posCart.length>0){ updateCartOnly(); filterProductGrid(); var tr=document.querySelector('.pos-cart-total-row span:last-child'); if(tr){ var st=posCalculateTotal(),t=st-posDiscountMAD; tr.textContent=t.toFixed(2)+' MAD'; } return; }
    buildFullPOS(c);
}
function buildFullPOS(c){
    if(posProductsList.length===0&&posCategoriesList.length===0){ c.innerHTML='<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i><p>Chargement...</p></div>'; return; }
    var st=posCalculateTotal(),t=st-posDiscountMAD,h='<div class="pos-container"><div class="pos-products-panel"><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;display:flex;align-items:center;background:#fff;border:2px solid #e2e8f0;border-radius:40px;padding:2px 12px;"><i class="fas fa-search" style="color:#94a3b8;margin-right:6px;"></i><input type="text" id="posSearchInput" placeholder="🔍 Rechercher..." value="'+escapeHtml(posSearchQuery)+'" onkeyup="posSearchProducts(this.value)" style="border:none;outline:none;padding:8px 0;width:100%;background:transparent;">'+(posSearchQuery?'<button onclick="document.getElementById(\'posSearchInput\').value=\'\';posSearchProducts(\'\');"><i class="fas fa-times-circle"></i></button>':'')+'</div><button id="posMicBtn" title="Micro" style="background:#dcfce7;border:3px solid #16a34a;border-radius:50%;width:46px;height:46px;cursor:pointer;" onclick="posToggleVoiceSearch()"><i class="fas fa-microphone"></i></button><div style="display:flex;gap:4px;"><button onclick="posAfficherCommandesTables()" style="background:#fff;border:2px solid #e2e8f0;border-radius:50px;padding:5px 12px;font-weight:600;font-size:0.7rem;">🍽️ Tables <span style="background:#ef4444;color:#fff;border-radius:20px;padding:1px 6px;">'+posCommandesTablesCount+'</span></button><button onclick="navigateTo(\'commandes\')" style="background:#fff;border:2px solid #e2e8f0;border-radius:50px;padding:5px 12px;font-weight:600;font-size:0.7rem;">🌐 En ligne <span style="background:#ef4444;color:#fff;border-radius:20px;padding:1px 6px;">'+posCommandesEnLigneCount+'</span></button></div></div><div class="pos-categories-bar"><button class="pos-cat-btn '+(posSelectedCategory==='all'?'active':'')+'" onclick="posFilterCategory(\'all\')"><i class="fas fa-th-large"></i> Tous</button>';
    for(var i=0;i<posCategoriesList.length;i++){ var ca=posCategoriesList[i],ac=posSelectedCategory===ca.nom?'active':'',ih=ca.imageBase64?'<img src="'+escapeHtml(ca.imageBase64)+'" loading="lazy">':'<i class="fas fa-folder"></i>'; h+='<button class="pos-cat-btn '+ac+'" onclick="posFilterCategory(\''+escapeHtml(ca.nom).replace(/'/g,"\\'")+'\')">'+ih+' '+escapeHtml(ca.nom)+'</button>'; }
    h+='</div></div><div class="pos-products-grid" id="posProductGrid"></div></div><div class="pos-cart-panel">';
    if(posStep===1){
        h+='<div class="pos-cart-header"><h3><i class="fas fa-shopping-cart"></i> Panier <span class="pos-cart-badge">'+posCart.length+'</span></h3><button class="pos-clear-btn" onclick="posResetCart()"><i class="fas fa-trash-alt"></i> Vider</button></div><div class="pos-cart-items">';
        if(posCart.length===0){ h+='<div class="pos-cart-empty"><i class="fas fa-shopping-basket"></i><p>Panier vide</p></div>'; }
        else{ for(var k=0;k<posCart.length;k++){ var it=posCart[k],opts=''; if(it.interdits&&it.interdits.length) opts+=' <span style="color:#ef4444;font-size:0.6rem;">🚫'+escapeHtml(it.interdits.join(','))+'</span>'; if(it.epice&&it.epice!=='Normal') opts+=' <span style="color:#d97706;">🌶️'+escapeHtml(it.epice)+'</span>'; if(it.sel&&it.sel!=='Normal') opts+=' <span style="color:#4f46e5;">🧂'+escapeHtml(it.sel)+'</span>'; h+='<div class="pos-cart-item"><div class="pos-cart-item-info"><span class="pos-cart-item-name">'+escapeHtml(it.nom)+opts+'</span><span class="pos-cart-item-price">'+it.prixUnitaire.toFixed(2)+' MAD/u</span></div><div class="pos-cart-item-actions"><button class="pos-qty-btn" onclick="posUpdateQty('+k+',-1)"><i class="fas fa-minus"></i></button><span class="pos-qty-value">'+it.quantite+'</span><button class="pos-qty-btn" onclick="posUpdateQty('+k+',1)"><i class="fas fa-plus"></i></button><button class="pos-remove-btn" onclick="posRemoveItem('+k+')"><i class="fas fa-times"></i></button></div><span class="pos-cart-item-total">'+(it.prixUnitaire*it.quantite).toFixed(2)+' MAD</span></div>'; } }
        h+='</div><div style="padding:8px 0;display:flex;gap:8px;"><label>Remise:</label><input type="number" id="posDiscountMAD" value="'+posDiscountMAD+'" min="0" step="0.01" onchange="posUpdateDiscountMAD(this.value)" style="width:80px;padding:4px 8px;border:2px solid #e2e8f0;border-radius:6px;"></div><div class="pos-cart-footer">'+(posDiscountMAD>0?'<div style="display:flex;justify-content:space-between;"><span>Sous-total</span><span>'+st.toFixed(2)+'</span></div><div style="display:flex;justify-content:space-between;color:#ef4444;"><span>Remise</span><span>-'+posDiscountMAD.toFixed(2)+'</span></div>':'')+'<div class="pos-cart-total-row"><span>Total</span><span>'+t.toFixed(2)+' MAD</span></div><button class="pos-validate-btn" onclick="posGoToStep2()" '+(posCart.length===0?'disabled':'')+'><i class="fas fa-check-circle"></i> Valider</button></div>';
    }else{
        var canCredit=posCurrentClient&&posCurrentClient.id;
        h+='<div class="pos-cart-header"><h3><i class="fas fa-credit-card"></i> Paiement</h3><button class="pos-back-btn" onclick="posGoToStep1()"><i class="fas fa-arrow-left"></i> Retour</button></div><div class="pos-payment-form"><div style="margin-bottom:4px;"><label>Client</label><div style="position:relative;"><input type="text" id="posClientSearchInput" placeholder="🔍 Cliquez et tapez..." onkeyup="posSearchClient(this.value)" onfocus="if(this.value)posSearchClient(this.value)" autocomplete="off" value="'+(posCurrentClient?escapeHtml(posCurrentClient.name):'')+'" style="width:100%;padding:8px;border:2px solid #e2e8f0;border-radius:8px;"><div id="posClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;z-index:50;"></div></div></div><div style="margin:2px 0;font-size:0.7rem;text-align:center;">— OU —</div><div style="margin-bottom:4px;"><label>Table</label><input type="text" id="posTableNum" value="'+escapeHtml(posCurrentTable)+'" onchange="posSetTable(this.value)" style="width:100%;padding:8px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:4px;"><div style="padding:8px;background:#f8fafc;border-radius:8px;"><div>Articles: '+posCart.length+'</div>'+(posDiscountMAD>0?'<div style="color:#ef4444;">Remise: -'+posDiscountMAD.toFixed(2)+'</div>':'')+'<div style="font-size:1.1rem;font-weight:700;">Total: '+t.toFixed(2)+' MAD</div></div></div><div style="margin-bottom:4px;"><label>Vendeur</label><input type="text" id="posVendeur" value="'+(window.currentUserData?escapeHtml(window.currentUserData.userData.prenom+' '+window.currentUserData.userData.nom):'')+'" style="width:100%;padding:8px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:4px;"><div style="display:flex;gap:6px;"><button class="pos-payment-btn '+(posPaymentMethod==='espece'?'active':'')+'" onclick="posSetPaymentMethod(\'espece\')"><i class="fas fa-money-bill-wave"></i> Espèces</button><button class="pos-payment-btn '+(posPaymentMethod==='credit'?'active':'')+'" onclick="posSetPaymentMethod(\'credit\')" id="posCreditBtn" '+(canCredit?'':'disabled style="opacity:0.4;"')+'><i class="fas fa-credit-card"></i> Crédit</button><button class="pos-payment-btn '+(posPaymentMethod==='partiel'?'active':'')+'" onclick="posSetPaymentMethod(\'partiel\')" id="posPartielBtn" '+(canCredit?'':'disabled style="opacity:0.4;"')+'><i class="fas fa-hand-holding-usd"></i> Partiel</button></div></div>';
        if(posPaymentMethod==='espece'||posPaymentMethod==='partiel') h+='<div style="margin-bottom:4px;"><label>Montant donné</label><input type="number" id="posAmountGiven" placeholder="0.00" value="'+(posAmountGiven>0?posAmountGiven:'')+'" onkeyup="posCalculateChange()" style="width:100%;padding:8px;border:2px solid #e2e8f0;border-radius:8px;"><div id="posChangeDisplay"></div></div>';
        h+='<button class="pos-finalize-btn" onclick="posFinalizeSale()" style="width:100%;padding:12px;margin-top:8px;background:#2E7D32;color:#fff;border:none;border-radius:12px;font-weight:700;"><i class="fas fa-check-circle"></i> Finaliser</button></div>';
    }
    h+='</div></div>'; c.innerHTML=h; filterProductGrid(); if(posStep===2) setTimeout(posCalculateChange,200);
}

// ==================== MÉTIER ====================
function posFilterCategory(ca){ posSelectedCategory=ca; posProductOffset=0; var si=document.getElementById('posSearchInput'); if(si) posSearchQuery=si.value.toLowerCase().trim(); if(isOnPOSPage()) filterProductGrid(); }
function posUpdateDiscountMAD(v){ posDiscountMAD=parseFloat(v)||0; if(posDiscountMAD<0) posDiscountMAD=0; if(isOnPOSPage()) renderPOS(); }
function posUpdateQty(i,ch){ var it=posCart[i]; if(!it) return; var p=posProductsList.find(function(x){ return x.id===it.id; }),nq=it.quantite+ch; if(nq<=0) posCart.splice(i,1); else{ if(p&&p.stock!==undefined&&nq>p.stock){ alert('Max: '+p.stock); return; } it.quantite=nq; } updateCartOnly(); }
function posRemoveItem(i){ posCart.splice(i,1); updateCartOnly(); }
function posCalculateTotal(){ var t=0; for(var i=0;i<posCart.length;i++) t+=posCart[i].prixUnitaire*posCart[i].quantite; return t; }
function posGoToStep2(){ if(posCart.length===0){ alert('Panier vide'); return; } posStep=2; if(isOnPOSPage()) renderPOS(); }
function posGoToStep1(){ posStep=1; delete window.posCommandeId; delete window.posVenteId; if(isOnPOSPage()) renderPOS(); }
function posSetPaymentMethod(m){ if((m==='credit'||m==='partiel')&&(!posCurrentClient||!posCurrentClient.id)){ alert('Client requis'); return; } posPaymentMethod=m; posAmountGiven=0; if(isOnPOSPage()) renderPOS(); }
function posCalculateChange(){ var ai=document.getElementById('posAmountGiven'),cd=document.getElementById('posChangeDisplay'); if(!ai||!cd) return; var st=posCalculateTotal(),t=st-posDiscountMAD; posAmountGiven=parseFloat(ai.value)||0; var c=posAmountGiven-t; if(posAmountGiven>0) cd.innerHTML=c>=0?'<div class="pos-change-positive"><span>Rendu</span><span>'+c.toFixed(2)+' MAD</span></div>':'<div class="pos-change-negative"><span>Manquant</span><span>'+Math.abs(c).toFixed(2)+' MAD</span></div>'; else cd.innerHTML=''; }

async function updateClientFidelityAsync(clientId,total,profitTotal){ try{ if(!fideliteSettingsCache){ var fDoc=await db.collection('settings').doc('fidelite').get(); fideliteSettingsCache=fDoc.exists?fDoc.data():{active:true,pointsParVente:1}; } if(!fideliteSettingsCache.active) return; var cr=await db.collection('clients').doc(clientId).get(); if(!cr.exists) return; var cd=cr.data(),points=parseInt(fideliteSettingsCache.pointsParVente)||1; await CacheDB.write('clients',clientId,{ca:(cd.ca||0)+total,profit:(cd.profit||0)+profitTotal,pointsFidelite:(cd.pointsFidelite||0)+points,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},'update'); }catch(e){ console.warn(e); } }

async function posFinalizeSale(){
    if(isFinalizing) return; 
    var st=posCalculateTotal(), t=st-posDiscountMAD;
    
    // ✅ 1. Si ni client ni table → client = Passager
    if(!posCurrentClient && !posCurrentTable){ 
        posCurrentClient = { id: null, name: 'Passager' };
    }
    
    if(posCurrentTable && (posPaymentMethod==='credit'||posPaymentMethod==='partiel')){ 
        alert('Table = espèces uniquement.'); return; 
    }
    if((posPaymentMethod==='credit'||posPaymentMethod==='partiel') && !posCurrentClient){ 
        alert('Client requis pour crédit/partiel.'); return; 
    }
    
    // ✅ 2. Si le montant donné n'est pas saisi → utiliser le total
    if(posPaymentMethod==='espece' || posPaymentMethod==='partiel'){ 
        var amountInput = document.getElementById('posAmountGiven');
        var givenAmount = parseFloat(amountInput ? amountInput.value : 0) || 0;
        if (givenAmount <= 0) {
            posAmountGiven = t;
            if (amountInput) amountInput.value = t.toFixed(2);
        } else {
            posAmountGiven = givenAmount;
        }
        if(posPaymentMethod==='espece' && posAmountGiven < t){ 
            alert('Montant insuffisant.'); return; 
        }
    }
    
    isFinalizing=true; 
    var fb=document.querySelector('.pos-finalize-btn'); 
    if(fb){ fb.disabled=true; fb.textContent='⏳...'; }
    
    var vendeur=document.getElementById('posVendeur').value.trim()||(window.currentUserData?window.currentUserData.userData.prenom+' '+window.currentUserData.userData.nom:'');
    
    try{
        var fn=getNextFactureNum(), remaining=0, paid=true, statutPaiement='payé', change=0;
        
        if(posPaymentMethod==='credit'){ 
            paid=false; remaining=t; statutPaiement='crédit'; 
        } else if(posPaymentMethod==='partiel'){ 
            remaining = t - posAmountGiven;
            paid = false; 
            statutPaiement='partiel'; 
            change = Math.max(0, posAmountGiven - t); 
        } else { 
            // espèces
            change = posAmountGiven - t; 
        }
        
        if(posCurrentTable && !posCurrentClient){ 
            paid=false; statutPaiement='en_attente'; remaining=t; 
        }
        
        var profitTotal=0, itemsDetail=posCart.map(function(it){ 
            var pa=it.prixAchat||0, pvn=it.prixVente||0, pp=it.prixPromo||0, 
                pvr=pp>0?pp:pvn, prof=(pvr-pa)*it.quantite; 
            profitTotal+=prof; 
            return {
                id:it.id, nom:it.nom, quantite:it.quantite, 
                prixVente:pvr, prixAchat:pa, prixPromo:pp, profit:prof,
                sauces:[], interdits:it.interdits||[], 
                epice:it.epice||'Normal', sel:it.sel||'Normal'
            }; 
        });
        
        var sd={
            factureNum:fn, items:itemsDetail, subtotal:st, 
            discountMAD:posDiscountMAD, total:t,
            clientId:posCurrentClient ? posCurrentClient.id : null,
            clientName:posCurrentClient ? posCurrentClient.name : 'Passager',
            table:posCurrentTable || null,
            vendeur:vendeur, paymentMethod:posPaymentMethod,
            statutPaiement:statutPaiement,
            amountGiven:posAmountGiven, change:change,
            paid:paid, remainingAmount:remaining,
            profitTotal:profitTotal,
            createdAt:firebase.firestore.FieldValue.serverTimestamp()
        };
        
        var batch=db.batch(), ventesRef=db.collection('ventes').doc(); 
        batch.set(ventesRef,sd); 
        if(!paid){ var creditsRef=db.collection('credits').doc(); batch.set(creditsRef,sd); }
        if(window.posCommandeId){ 
            batch.update(db.collection('commandes').doc(window.posCommandeId), {
                statut:'payé', 
                paidAt:firebase.firestore.FieldValue.serverTimestamp(), 
                factureNum:fn
            }); 
            delete window.posCommandeId; 
        }
        if(window.posVenteId){ 
            batch.update(db.collection('ventes').doc(window.posVenteId), {
                paid:true, statutPaiement:'payé', remainingAmount:0, 
                paidAt:firebase.firestore.FieldValue.serverTimestamp()
            }); 
            delete window.posVenteId; 
        }
        for(var i=0;i<posCart.length;i++){ 
            var it=posCart[i]; 
            batch.update(db.collection('products').doc(it.id), {
                stock:firebase.firestore.FieldValue.increment(-it.quantite),
                vendues:firebase.firestore.FieldValue.increment(it.quantite),
                ca:firebase.firestore.FieldValue.increment(it.prixUnitaire*it.quantite)
            }); 
        }
        await batch.commit(); 
        if(posCurrentClient && posCurrentClient.id && paid) 
            updateClientFidelityAsync(posCurrentClient.id, t, profitTotal);
        
        var venteId = ventesRef.id;  // 🔥 Garder l'ID pour WhatsApp

        // --- Message de confirmation et proposition WhatsApp ---
        var msg='✅ Vente: '+fn+'\n💰 Total: '+t.toFixed(2)+' MAD'; 
        if(posPaymentMethod==='espece' && posAmountGiven > t) 
            msg+='\n💵 Rendu: '+change.toFixed(2)+' MAD'; 
        if(statutPaiement==='crédit') msg+='\n📋 Crédit enregistré.'; 
        if(statutPaiement==='partiel') msg+='\n📋 Reste: '+remaining.toFixed(2)+' MAD'; 
        alert(msg);

        // Proposer l'envoi WhatsApp
        if (typeof window.sendWhatsApp === 'function') {
            // On construit une modale de confirmation
            var modalHtml = '<p style="text-align:center;">Voulez-vous envoyer la facture par WhatsApp ?</p>';
            modalHtml += '<div style="display:flex;justify-content:center;gap:10px;margin-top:15px;">';
            modalHtml += '<button class="btn-save" onclick="window._whatsappConfirmYes(\'' + venteId + '\')">✅ Oui</button>';
            modalHtml += '<button class="btn-cancel" onclick="closeModal(); window._whatsappConfirmNo()">❌ Non</button>';
            modalHtml += '</div>';
            openModal('📱 Envoyer la facture WhatsApp', modalHtml);
        } else {
            // Pas de fonction WhatsApp, on termine normalement
            posResetCart(); 
            if(isOnPOSPage()) renderPOS(); 
            if(navigator.onLine) setTimeout(function(){ CacheDB.sync().catch(function(){}); },500);
        }
    }catch(e){ 
        alert('Erreur: '+e.message); 
    } finally { 
        isFinalizing=false; 
        if(fb){ fb.disabled=false; fb.innerHTML='<i class="fas fa-check-circle"></i> Finaliser'; } 
    }
}

// 🔥 Fonctions utilitaires pour la confirmation WhatsApp
window._whatsappConfirmYes = function(venteId) {
    closeModal(); // fermer la modale de confirmation
    // Arrêter le micro avant l'envoi
    if (typeof window.posStopVoiceSearch === 'function') {
        window.posStopVoiceSearch();
    }
    // Envoyer WhatsApp (fonction corrigée dans admin-ventes.js)
    window.sendWhatsApp(venteId);
    // Réinitialiser le POS après un court délai pour laisser le temps à WhatsApp de s'ouvrir
    setTimeout(function() {
        posResetCart();
        if(isOnPOSPage()) renderPOS();
        if(navigator.onLine) setTimeout(function(){ CacheDB.sync().catch(function(){}); },500);
    }, 500);
};

window._whatsappConfirmNo = function() {
    // On ferme la modale (déjà fait par le bouton qui appelle closeModal())
    // On réinitialise juste le POS
    posResetCart();
    if(isOnPOSPage()) renderPOS();
    if(navigator.onLine) setTimeout(function(){ CacheDB.sync().catch(function(){}); },500);
};

function goBackToPOS(){ if(window.currentUserData&&(window.currentUserData.userData.role==='caissier'||window.currentUserData.userData.role==='admin')){ if(posCart.length>0&&posStep===1){ if(!confirm('⚠️ '+posCart.length+' article(s) dans le panier. Garder ?')) posResetCart(); } navigateTo('pos'); } }
if(!window._posKeydownListenerAdded){ window._posKeydownListenerAdded=true; document.addEventListener('keydown',function(event){ if(event.key==='Escape'){ var cp=document.getElementById('pageTitle')?.textContent||''; if(cp!=='POS'&&cp!=='Dashboard'&&cp!=='') goBackToPOS(); } if(event.ctrlKey&&(event.key==='p'||event.key==='P')){ event.preventDefault(); if((document.getElementById('pageTitle')?.textContent||'')!=='POS') navigateTo('pos'); } }); }

window.posCart=posCart; window.posStep=posStep; window.posProductsList=posProductsList; window.posAllClients=posAllClients; window.posCurrentClient=posCurrentClient; window.posCurrentTable=posCurrentTable; window.posDiscountMAD=posDiscountMAD; window.posAmountGiven=posAmountGiven; window.posPaymentMethod=posPaymentMethod; window.posResetCart=posResetCart; window.posAddToCartOrOpenOptions=posAddToCartOrOpenOptions; window.posSetPaymentMethod=posSetPaymentMethod; window.posCalculateTotal=posCalculateTotal; window.posFinalizeSale=posFinalizeSale; window.posGoToStep2=posGoToStep2; window.posSearchProducts=posSearchProducts; window.updateCartOnly=updateCartOnly; window.renderPOS=renderPOS; window.updatePaymentButtons=updatePaymentButtons; window.loadMoreProducts=loadMoreProducts; window.onProductAdded=window.onProductAdded||function(pid){ console.log('Produit ajouté:',pid); };

console.log('⚡ Mixmax Minimarket - POS chargé (final optimisé avec virtualisation)');
