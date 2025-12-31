/**
 * Main Application Module
 * Handles UI initialization, data loading, and user interactions
 */

// Global app state
const APP = {
    flights: null,
    accommodation: null,
    expenses: [],
    config: null,
    accessLevel: 'viewer', // 'viewer' or 'admin'
    adminSynced: false, // Track if admin has synced with Google Sheets
    currentFilters: {
        currency: 'all',
        category: 'all',
        participant: 'all'
    }
};

/**
 * Initialize the application
 */
async function initializeApp(accessLevel = 'viewer') {
    console.log('Initializing app with access level:', accessLevel);
    APP.accessLevel = accessLevel;
    
    try {
        // Load data
        await Promise.all([
            loadFlights(),
            loadAccommodation(),
            loadConfig()
        ]);
        
        // Load expenses based on access level
        if (accessLevel === 'admin') {
            // Admin: Initialize OAuth but don't load expenses yet
            // Admin must click sync first
            APP.expenses = [];
            if (APP.config && APP.config.google_sheets_id && APP.config.google_oauth_client_id) {
                await initializeSheetsAPI(APP.config);
            }
        } else {
            // Viewer: Load from published CSV (read-only)
            await loadExpensesFromCSV();
        }
        
        // Render UI
        renderFlights();
        renderAccommodation();
        renderExpenses();
        renderBalances();
        renderSummary();
        
        // Populate participant filter
        populateParticipantFilter();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide/show admin features
        toggleAdminFeatures(accessLevel === 'admin');
        
        // Setup collapsible sections
        setupCollapsibleSections();
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

/**
 * Load flights data
 */
async function loadFlights() {
    try {
        const response = await fetch('assets/data/flights.json');
        APP.flights = await response.json();
    } catch (error) {
        console.error('Error loading flights:', error);
    }
}

/**
 * Load accommodation data
 */
async function loadAccommodation() {
    try {
        const response = await fetch('assets/data/accommodation.json');
        APP.accommodation = await response.json();
    } catch (error) {
        console.error('Error loading accommodation:', error);
    }
}

/**
 * Load configuration
 */
async function loadConfig() {
    try {
        const response = await fetch('config/auth-config.json');
        APP.config = await response.json();
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

/**
 * Load expenses from localStorage
 */
function loadExpenses() {
    try {
        const stored = localStorage.getItem('phuket_expenses');
        if (stored) {
            APP.expenses = JSON.parse(stored);
        } else {
            APP.expenses = [];
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        APP.expenses = [];
    }
}

/**
 * Load expenses from published Google Sheets CSV (read-only)
 */
async function loadExpensesFromCSV() {
    try {
        const csvUrl = APP.config?.google_sheets_csv_url;
        if (!csvUrl) {
            console.warn('No CSV URL configured');
            APP.expenses = [];
            return;
        }

        // Add cache-busting parameter to force fresh data
        const timestamp = Date.now();
        const urlWithCacheBuster = csvUrl.includes('?') 
            ? `${csvUrl}&_=${timestamp}` 
            : `${csvUrl}?_=${timestamp}`;

        console.log('Fetching expenses from:', urlWithCacheBuster);

        const response = await fetch(urlWithCacheBuster, {
            cache: 'no-store'  // Disable browser cache
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        console.log('CSV response length:', csvText.length);
        console.log('First 200 chars:', csvText.substring(0, 200));
        
        // Parse CSV
        const lines = csvText.split('\n');
        const expenses = [];
        
        console.log(`Total lines in CSV: ${lines.length}`);
        
        // Skip header row (line 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Parse CSV line (handle quoted fields)
            const fields = parseCSVLine(line);
            
            console.log(`Line ${i}: ${fields.length} fields`, fields);
            
            if (fields.length < 11) {
                console.warn(`Line ${i}: Insufficient fields (${fields.length}/11), skipping`);
                continue;
            }
            
            try {
                const expense = {
                    expense_id: fields[0] || `exp_${Date.now()}_${i}`,
                    date: fields[1] || new Date().toISOString().split('T')[0],
                    description: fields[2] || '',
                    category: fields[3] || 'Other',
                    total_amount: parseFloat(fields[4]) || 0,
                    currency: fields[5] || 'THB',
                    paid_by: fields[6] || '',
                    split_among: fields[7] || '',
                    split_type: fields[8] || 'Equal',
                    custom_splits: fields[9] ? JSON.parse(fields[9]) : null,
                    notes: fields[10] || ''
                };
                expenses.push(expense);
            } catch (parseError) {
                console.error(`Error parsing line ${i}:`, parseError, fields);
            }
        }
        
        APP.expenses = expenses;
        console.log(`Successfully loaded ${expenses.length} expenses from CSV`);
    } catch (error) {
        console.error('Error loading expenses from CSV:', error);
        console.error('Error stack:', error.stack);
        APP.expenses = [];
    }
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    
    fields.push(currentField); // Last field
    return fields;
}

/**
 * Save expenses to localStorage
 */
function saveExpenses() {
    try {
        localStorage.setItem('phuket_expenses', JSON.stringify(APP.expenses));
    } catch (error) {
        console.error('Error saving expenses:', error);
    }
}

/**
 * Render flights
 */
function renderFlights() {
    if (!APP.flights) return;
    
    // Outbound flight
    const outbound = APP.flights.outbound;
    if (outbound) {
        document.getElementById('outbound-flight-number').textContent = outbound.flight_number;
        document.getElementById('outbound-airline').textContent = outbound.airline;
        document.getElementById('outbound-terminal').textContent = outbound.terminal;
        document.getElementById('outbound-baggage').textContent = outbound.baggage_allowance;
        
        const depDate = new Date(outbound.departure_datetime);
        const arrDate = new Date(outbound.arrival_datetime);
        
        document.getElementById('outbound-dep-code').textContent = outbound.departure_airport.split(' - ')[0];
        document.getElementById('outbound-dep-name').textContent = outbound.departure_airport.split(' - ')[1] || '';
        document.getElementById('outbound-dep-time').textContent = depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('outbound-dep-date').textContent = depDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        document.getElementById('outbound-arr-code').textContent = outbound.arrival_airport.split(' - ')[0];
        document.getElementById('outbound-arr-name').textContent = outbound.arrival_airport.split(' - ')[1] || '';
        document.getElementById('outbound-arr-time').textContent = arrDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('outbound-arr-date').textContent = arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const duration = (arrDate - depDate) / (1000 * 60 * 60);
        document.getElementById('outbound-duration').textContent = `~${duration.toFixed(1)}h`;
    }
    
    // Inbound flight
    const inbound = APP.flights.inbound;
    if (inbound) {
        document.getElementById('inbound-flight-number').textContent = inbound.flight_number;
        document.getElementById('inbound-airline').textContent = inbound.airline;
        document.getElementById('inbound-terminal').textContent = inbound.terminal;
        document.getElementById('inbound-baggage').textContent = inbound.baggage_allowance;
        
        const depDate = new Date(inbound.departure_datetime);
        const arrDate = new Date(inbound.arrival_datetime);
        
        document.getElementById('inbound-dep-code').textContent = inbound.departure_airport.split(' - ')[0];
        document.getElementById('inbound-dep-name').textContent = inbound.departure_airport.split(' - ')[1] || '';
        document.getElementById('inbound-dep-time').textContent = depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('inbound-dep-date').textContent = depDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        document.getElementById('inbound-arr-code').textContent = inbound.arrival_airport.split(' - ')[0];
        document.getElementById('inbound-arr-name').textContent = inbound.arrival_airport.split(' - ')[1] || '';
        document.getElementById('inbound-arr-time').textContent = arrDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('inbound-arr-date').textContent = arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const duration = (arrDate - depDate) / (1000 * 60 * 60);
        document.getElementById('inbound-duration').textContent = `~${duration.toFixed(1)}h`;
    }
}

/**
 * Render accommodation
 */
function renderAccommodation() {
    if (!APP.accommodation) return;
    
    const accom = APP.accommodation;
    
    document.getElementById('property-name').textContent = accom.property_name;
    document.getElementById('property-address').textContent = accom.address;
    
    const checkIn = new Date(accom.check_in_date);
    const checkOut = new Date(accom.check_out_date);
    
    document.getElementById('check-in-date').textContent = checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('check-in-time').textContent = accom.check_in_time;
    
    document.getElementById('check-out-date').textContent = checkOut.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('check-out-time').textContent = accom.check_out_time;
    
    // Map link
    const mapLink = document.getElementById('map-link');
    if (accom.map_url) {
        mapLink.href = accom.map_url;
    } else if (accom.address) {
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accom.address)}`;
    }
    
    // Phone link
    const phoneLink = document.getElementById('phone-link');
    if (accom.contact_phone && accom.contact_phone !== 'TBA') {
        phoneLink.href = `tel:${accom.contact_phone}`;
    } else {
        phoneLink.style.display = 'none';
    }
    
    // Amenities
    const amenitiesList = document.getElementById('amenities-list');
    if (accom.amenities && accom.amenities.length > 0) {
        amenitiesList.innerHTML = accom.amenities.map(amenity => 
            `<span class="amenity-badge">${amenity}</span>`
        ).join('');
    }
}

/**
 * Render expenses list
 */
function renderExpenses() {
    const expenseList = document.getElementById('expense-list');
    
    // Apply filters
    const filteredExpenses = filterExpenses(APP.expenses, APP.currentFilters);
    
    // Sort by date (most recent first)
    const sortedExpenses = sortExpenses(filteredExpenses, 'date', 'desc');
    
    if (sortedExpenses.length === 0) {
        expenseList.innerHTML = '<div class="empty-state"><p>No expenses match your filters.</p></div>';
        return;
    }
    
    expenseList.innerHTML = sortedExpenses.map(expense => {
        const isAdmin = APP.accessLevel === 'admin';
        return `
        <div class="expense-item currency-${expense.currency}" data-expense-id="${expense.expense_id}">
            <div class="expense-header-row">
                <span class="expense-description">${expense.description}</span>
                <div class="expense-amount-wrapper">
                    <span class="expense-amount currency-${expense.currency}">${formatCurrency(expense.total_amount, expense.currency)}</span>
                    ${isAdmin ? `<button class="btn-delete" onclick="deleteExpense('${expense.expense_id}')" title="Delete expense">🗑️</button>` : ''}
                </div>
            </div>
            <div class="expense-details">
                <span class="expense-category">${expense.category}</span>
                <span>Paid by: <strong>${expense.paid_by}</strong></span><br>
                <span>Split: ${Array.isArray(expense.split_among) ? expense.split_among.join(', ') : expense.split_among}</span><br>
                <span>${new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                ${expense.notes ? `<br><span><em>${expense.notes}</em></span>` : ''}
            </div>
        </div>
    `}).join('');
}

/**
 * Render balances
 */
function renderBalances() {
    const balanceList = document.getElementById('balance-list');
    
    if (APP.expenses.length === 0) {
        balanceList.innerHTML = '<div class="empty-state"><p>No balances to display yet.</p></div>';
        return;
    }
    
    const balances = calculateBalances(APP.expenses);
    const settlements = calculateSettlements(balances);
    
    // Filter balances by selected participant
    let filteredBalances = balances;
    if (APP.currentFilters.participant !== 'all') {
        filteredBalances = balances.filter(p => p.name === APP.currentFilters.participant);
    }
    
    balanceList.innerHTML = filteredBalances.map(person => {
        const thbClass = person.balance_thb > 0.01 ? 'positive' : person.balance_thb < -0.01 ? 'negative' : '';
        const hkdClass = person.balance_hkd > 0.01 ? 'positive' : person.balance_hkd < -0.01 ? 'negative' : '';
        
        return `
            <div class="balance-card">
                <div class="balance-name">${person.name}</div>
                <div class="balance-row">
                    <span class="balance-label">THB Paid:</span>
                    <span class="balance-value">${formatCurrency(person.paid_thb, 'THB')}</span>
                </div>
                <div class="balance-row">
                    <span class="balance-label">THB Owed:</span>
                    <span class="balance-value">${formatCurrency(person.owed_thb, 'THB')}</span>
                </div>
                <div class="balance-row">
                    <span class="balance-label">THB Balance:</span>
                    <span class="balance-value ${thbClass}">${formatCurrency(person.balance_thb, 'THB')}</span>
                </div>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
                <div class="balance-row">
                    <span class="balance-label">HKD Paid:</span>
                    <span class="balance-value">${formatCurrency(person.paid_hkd, 'HKD')}</span>
                </div>
                <div class="balance-row">
                    <span class="balance-label">HKD Owed:</span>
                    <span class="balance-value">${formatCurrency(person.owed_hkd, 'HKD')}</span>
                </div>
                <div class="balance-row">
                    <span class="balance-label">HKD Balance:</span>
                    <span class="balance-value ${hkdClass}">${formatCurrency(person.balance_hkd, 'HKD')}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Add settlements (only show when viewing all participants)
    if (APP.currentFilters.participant === 'all' && (settlements.THB.length > 0 || settlements.HKD.length > 0)) {
        let settlementsHTML = '<div class="balance-card" style="background: #fff3cd;"><div class="balance-name">💰 Settlements</div>';
        
        if (settlements.THB.length > 0) {
            settlementsHTML += '<strong>THB:</strong><br>';
            settlements.THB.forEach(s => {
                settlementsHTML += `${s.from} pays ${s.to}: ${formatCurrency(s.amount, s.currency)}<br>`;
            });
        }
        
        if (settlements.HKD.length > 0) {
            if (settlements.THB.length > 0) {
                settlementsHTML += '<br>';
            }
            settlementsHTML += '<strong>HKD:</strong><br>';
            settlements.HKD.forEach(s => {
                settlementsHTML += `${s.from} pays ${s.to}: ${formatCurrency(s.amount, s.currency)}<br>`;
            });
        }
        
        settlementsHTML += '</div>';
        balanceList.innerHTML += settlementsHTML;
    }
}

/**
 * Render summary cards
 */
function renderSummary() {
    const totals = calculateTotals(APP.expenses);
    const balances = calculateBalances(APP.expenses);
    const peopleCount = balances.length || 1;
    
    document.getElementById('total-thb').textContent = formatCurrency(totals.THB, 'THB');
    document.getElementById('total-hkd').textContent = formatCurrency(totals.HKD, 'HKD');
    document.getElementById('avg-thb').textContent = formatCurrency(totals.THB / peopleCount, 'THB');
    document.getElementById('avg-hkd').textContent = formatCurrency(totals.HKD / peopleCount, 'HKD');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Add expense button
    const addExpenseBtn = document.getElementById('add-expense-btn');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', openExpenseModal);
    }
    
    // Refresh expenses button
    const refreshExpensesBtn = document.getElementById('refresh-expenses-btn');
    if (refreshExpensesBtn) {
        refreshExpensesBtn.addEventListener('click', handleRefreshExpenses);
    }
    
    // Modal close
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeExpenseModal);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancel-expense');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeExpenseModal);
    }
    
    // Expense form
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) {
        expenseForm.addEventListener('submit', handleExpenseSubmit);
    }
    
    // Filters
    const currencyFilter = document.getElementById('currency-filter');
    if (currencyFilter) {
        currencyFilter.addEventListener('change', handleFilterChange);
    }
    
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', handleFilterChange);
    }
    
    const participantFilter = document.getElementById('participant-filter');
    if (participantFilter) {
        participantFilter.addEventListener('change', handleParticipantFilterChange);
    }
    
    // Photo gallery button
    const galleryBtn = document.getElementById('open-gallery-btn');
    if (galleryBtn) {
        galleryBtn.addEventListener('click', openPhotoGallery);
    }
    
    // Google Sheets sync button
    const syncBtn = document.getElementById('sync-sheets-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', handleSyncWithSheets);
    }
    
    // Google Sheets sign out button
    const signOutBtn = document.getElementById('signout-sheets-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            revokeSheetsAuthorization();
        });
    }
    
    // Select all / deselect all buttons for split-among
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('input[name="split-among"]');
            checkboxes.forEach(cb => cb.checked = true);
        });
    }
    
    const deselectAllBtn = document.getElementById('deselect-all-btn');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('input[name="split-among"]');
            checkboxes.forEach(cb => cb.checked = false);
        });
    }
    
    // Close modal on outside click
    const modal = document.getElementById('expense-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeExpenseModal();
            }
        });
    }
}

/**
 * Open expense modal
 */
function openExpenseModal() {
    const modal = document.getElementById('expense-modal');
    const form = document.getElementById('expense-form');
    
    // Reset form
    form.reset();
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expense-date').value = today;
    
    // Populate participant dropdowns
    populateParticipantFields();
    
    // Show modal
    modal.style.display = 'flex';
}

/**
 * Populate paid-by dropdown and split-among checkboxes with participants
 */
function populateParticipantFields() {
    const participants = APP.config?.trip_participants || [];
    
    // Populate "Paid By" dropdown
    const paidBySelect = document.getElementById('expense-paid-by');
    if (paidBySelect) {
        // Keep the default option
        const defaultOption = paidBySelect.querySelector('option[value=""]');
        paidBySelect.innerHTML = '';
        if (defaultOption) {
            paidBySelect.appendChild(defaultOption);
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- Select Person --';
            paidBySelect.appendChild(opt);
        }
        
        // Add participant options
        participants.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            paidBySelect.appendChild(option);
        });
    }
    
    // Populate "Split Among" checkboxes
    const checkboxContainer = document.getElementById('split-among-checkboxes');
    if (checkboxContainer) {
        checkboxContainer.innerHTML = '';
        
        participants.forEach(name => {
            const checkboxItem = document.createElement('div');
            checkboxItem.className = 'checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `split-${name}`;
            checkbox.name = 'split-among';
            checkbox.value = name;
            
            const label = document.createElement('label');
            label.htmlFor = `split-${name}`;
            label.textContent = name;
            
            checkboxItem.appendChild(checkbox);
            checkboxItem.appendChild(label);
            checkboxContainer.appendChild(checkboxItem);
            
            // Make the whole item clickable
            checkboxItem.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
            });
        });
    }
}

/**
 * Close expense modal
 */
function closeExpenseModal() {
    const modal = document.getElementById('expense-modal');
    modal.style.display = 'none';
}

/**
 * Handle expense form submission
 */
async function handleExpenseSubmit(event) {
    event.preventDefault();
    
    // Get selected split-among people
    const splitCheckboxes = document.querySelectorAll('input[name="split-among"]:checked');
    const splitAmong = Array.from(splitCheckboxes).map(cb => cb.value);
    
    // Validation
    if (splitAmong.length === 0) {
        alert('Please select at least one person to split the expense among.');
        return;
    }
    
    const expense = {
        expense_id: `EXP-${Date.now()}`,
        timestamp: new Date().toISOString(),
        date: document.getElementById('expense-date').value,
        description: document.getElementById('expense-description').value,
        category: document.getElementById('expense-category').value,
        total_amount: parseFloat(document.getElementById('expense-amount').value),
        currency: document.getElementById('expense-currency').value,
        paid_by: document.getElementById('expense-paid-by').value,
        split_among: splitAmong,
        split_type: 'Equal',
        custom_splits: null,
        receipt_url: null,
        notes: document.getElementById('expense-notes').value
    };
    
    // Add to expenses
    APP.expenses.push(expense);
    
    // Save to localStorage
    saveExpenses();
    
    // Re-render
    renderExpenses();
    renderBalances();
    renderSummary();
    
    // Close modal
    closeExpenseModal();
    
    // Show success message
    alert('Expense added successfully!');
    
    // If admin and Sheets configured, push to Google Sheets
    if (APP.accessLevel === 'admin' &&
        APP.config?.google_sheets_id &&
        typeof pushExpensesToSheets === 'function') {
        try {
            await pushExpensesToSheets(APP.expenses);
            console.log('Expense synced to Google Sheets');
        } catch (err) {
            console.error('Failed to sync new expense to Google Sheets:', err);
            // Don't show error to user - expense is saved locally
        }
    }
}

/**
 * Handle filter changes
 */
function handleFilterChange() {
    APP.currentFilters.currency = document.getElementById('currency-filter').value;
    APP.currentFilters.category = document.getElementById('category-filter').value;
    
    renderExpenses();
}

/**
 * Handle participant filter change for Balance Overview
 */
function handleParticipantFilterChange() {
    APP.currentFilters.participant = document.getElementById('participant-filter').value;
    renderBalances();
}

/**
 * Populate participant filter dropdown
 */
function populateParticipantFilter() {
    const participantFilter = document.getElementById('participant-filter');
    if (!participantFilter) return;
    
    const participants = APP.config?.trip_participants || [];
    
    // Clear existing options except "All Participants"
    participantFilter.innerHTML = '<option value="all">All Participants</option>';
    
    // Add participant options
    participants.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        participantFilter.appendChild(option);
    });
}

/**
 * Delete an expense
 */
async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }
    
    // Find and remove the expense
    const index = APP.expenses.findIndex(e => e.expense_id === expenseId);
    if (index > -1) {
        APP.expenses.splice(index, 1);
        
        // Save to localStorage
        saveExpenses();
        
        // Re-render
        renderExpenses();
        renderBalances();
        renderSummary();
        
        // Show feedback
        console.log('Expense deleted successfully');
        
        // If admin and Sheets configured, push deletion to Google Sheets
        if (APP.accessLevel === 'admin' &&
            APP.config?.google_sheets_id &&
            typeof pushExpensesToSheets === 'function') {
            try {
                await pushExpensesToSheets(APP.expenses);
                console.log('Deletion synced to Google Sheets');
            } catch (err) {
                console.error('Failed to sync deletion to Google Sheets:', err);
                // Don't show error to user - deletion is saved locally
            }
        }
    }
}

/**
 * Open photo gallery
 */
function openPhotoGallery() {
    const albumUrl = APP.config?.google_photos_album_url;
    
    if (albumUrl) {
        window.open(albumUrl, '_blank');
    } else {
        alert('Photo album URL not configured yet. Please add it to the configuration file.');
    }
}

/**
 * Handle sync with Google Sheets
 */
async function handleSyncWithSheets() {
    try {
        // Sync expenses (will trigger OAuth if needed)
        const syncedExpenses = await syncExpenses(APP.expenses);
        
        // Update local state
        APP.expenses = syncedExpenses;
        APP.adminSynced = true; // Mark admin as synced
        
        // Populate participant filter
        populateParticipantFilter();
        
        // Re-render UI
        renderExpenses();
        renderBalances();
        renderSummary();
        
        // Show expense management controls
        toggleExpenseManagement(true);
        
    } catch (error) {
        console.error('Sync failed:', error);
        // Error message already shown in sheets-api.js
    }
}

/**
 * Handle refresh expenses (for both admin and viewer)
 */
async function handleRefreshExpenses() {
    const refreshBtn = document.getElementById('refresh-expenses-btn');
    if (!refreshBtn) return;
    
    try {
        // Disable button and show loading state
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
        const originalContent = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '⏳';
        
        if (APP.accessLevel === 'admin') {
            // Admin: Re-sync with Google Sheets
            await handleSyncWithSheets();
        } else {
            // Viewer: Reload from CSV with fresh data
            await loadExpensesFromCSV();
            
            // Populate participant filter
            populateParticipantFilter();
            
            // Re-render UI
            renderExpenses();
            renderBalances();
            renderSummary();
            
            console.log('Expenses refreshed from CSV');
        }
        
        // Show success feedback
        refreshBtn.innerHTML = '✅';
        setTimeout(() => {
            refreshBtn.innerHTML = originalContent;
        }, 1000);
        
    } catch (error) {
        console.error('Refresh failed:', error);
        
        // Show error feedback
        refreshBtn.innerHTML = '❌';
        setTimeout(() => {
            refreshBtn.innerHTML = '🔄';
        }, 2000);
        
        alert('Failed to refresh expenses. Please check your connection and try again.');
    } finally {
        // Re-enable button
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = '1';
        }
    }
}

/**
 * Toggle visibility of admin-only features
 */
function toggleAdminFeatures(isAdmin) {
    // Sync section
    const syncSection = document.querySelector('.sync-section');
    if (syncSection) {
        syncSection.style.display = isAdmin ? 'block' : 'none';
    }
    
    // Refresh button - show for both admin and viewer
    const refreshBtn = document.getElementById('refresh-expenses-btn');
    if (refreshBtn) {
        refreshBtn.style.display = 'inline-flex';
    }
    
    // If admin, hide expense management until synced
    if (isAdmin) {
        toggleExpenseManagement(APP.adminSynced);
    } else {
        // For viewers, hide the add expense button
        const addExpenseBtn = document.getElementById('add-expense-btn');
        if (addExpenseBtn) {
            addExpenseBtn.style.display = 'none';
        }
    }
    
    // Show read-only badge for viewers
    if (!isAdmin) {
        const expenseHeader = document.querySelector('.expense-section .expense-header h3');
        if (expenseHeader && !document.getElementById('readonly-badge')) {
            const badge = document.createElement('span');
            badge.id = 'readonly-badge';
            badge.textContent = '(Read-Only)';
            badge.style.cssText = 'color: #999; font-size: 14px; font-weight: normal; margin-left: 8px;';
            expenseHeader.appendChild(badge);
        }
    }
}

/**
 * Toggle expense management controls (add button, expense list, etc.)
 */
function toggleExpenseManagement(show) {
    // Add expense button
    const addExpenseBtn = document.getElementById('add-expense-btn');
    if (addExpenseBtn) {
        addExpenseBtn.style.display = show ? 'inline-flex' : 'none';
    }
    
    // Expense list section
    const expenseList = document.getElementById('expense-list');
    const expenseFilters = document.querySelector('.expense-filters');
    const balanceSection = document.querySelector('.balance-section');
    
    if (!show && APP.accessLevel === 'admin') {
        // Show "please sync first" message in expense list
        if (expenseList) {
            expenseList.innerHTML = `
                <div class="empty-state sync-required">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
                    <h3 style="color: var(--ocean-deep); margin-bottom: 8px;">Sync Required</h3>
                    <p>Please click <strong>"Sync with Google Sheets"</strong> above to load expenses and start managing them.</p>
                    <p style="margin-top: 8px; font-size: 14px; color: #666;">This ensures you're working with the latest data from Google Sheets.</p>
                </div>
            `;
        }
        // Hide filters
        if (expenseFilters) {
            expenseFilters.style.display = 'none';
        }
        // Hide balance section
        if (balanceSection) {
            balanceSection.style.display = 'none';
        }
    } else {
        // Show filters and balance section
        if (expenseFilters) {
            expenseFilters.style.display = 'flex';
        }
        if (balanceSection) {
            balanceSection.style.display = 'block';
        }
    }
}

/**
 * Setup collapsible sections functionality
 */
function setupCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId);
            
            if (content) {
                // Toggle collapsed class
                this.classList.toggle('collapsed');
                content.classList.toggle('collapsed');
                
                // Smooth scroll to section if expanding
                if (!content.classList.contains('collapsed')) {
                    setTimeout(() => {
                        this.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            }
        });
    });
}

// Make initializeApp globally available for auth.js
window.initializeApp = initializeApp;

// Make deleteExpense globally available for inline onclick
window.deleteExpense = deleteExpense;
