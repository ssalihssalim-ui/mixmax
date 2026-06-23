function searchClientInCredits(clientName) {
    if (!clientName) return;
    
    // ✅ ARRÊTER le micro immédiatement
    if (isRecording) {
        posStopVoiceSearch();
    }
    
    // ✅ Mettre le vrai nom du client
    var searchInput = document.getElementById('creditsSearchInput');
    if (searchInput) {
        searchInput.value = clientName;
        if (typeof window.creditsSearch !== 'undefined') window.creditsSearch = clientName;
        if (typeof window.currentPages !== 'undefined') window.currentPages.credits = 1;
        if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
        showVoiceResult('🔍 Client: ' + clientName);
        
        // ✅ Redémarrer le micro après 500ms
        setTimeout(function() {
            posToggleVoiceSearch();
        }, 500);
    }
}
