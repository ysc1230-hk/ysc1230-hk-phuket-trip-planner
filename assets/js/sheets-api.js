/**
 * Google Sheets API Integration Module
 * Handles OAuth authentication and data synchronization with Google Sheets
 */

// Google Sheets API state
const SHEETS_API = {
    config: null,
    isAuthenticated: false,
    accessToken: null,
    tokenExpiry: null,
    gapiLoaded: false,
    gisLoaded: false,
    tokenClient: null
};

// API Discovery doc URL for Sheets API
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// Authorization scopes
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Load Google API client library
 */
function loadGoogleAPI() {
    return new Promise((resolve, reject) => {
        if (SHEETS_API.gapiLoaded) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: '', // Not needed for OAuth
                        discoveryDocs: [DISCOVERY_DOC]
                    });
                    SHEETS_API.gapiLoaded = true;
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Load Google Identity Services (GIS) library
 */
function loadGoogleIdentity() {
    return new Promise((resolve, reject) => {
        if (SHEETS_API.gisLoaded) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            SHEETS_API.gisLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Initialize Google Sheets API
 */
async function initializeSheetsAPI(config) {
    SHEETS_API.config = config;

    try {
        // Load both libraries in parallel
        await Promise.all([
            loadGoogleAPI(),
            loadGoogleIdentity()
        ]);

        // Initialize token client
        SHEETS_API.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: config.google_oauth_client_id,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) {
                    console.error('OAuth error:', response);
                    return;
                }
                SHEETS_API.accessToken = response.access_token;
                SHEETS_API.tokenExpiry = Date.now() + (response.expires_in * 1000);
                SHEETS_API.isAuthenticated = true;
                
                // Update UI
                updateSyncButtonState();
            },
        });

        console.log('Google Sheets API initialized');
        return true;
    } catch (error) {
        console.error('Error initializing Sheets API:', error);
        return false;
    }
}

/**
 * Request OAuth authorization
 */
function requestSheetsAuthorization() {
    if (!SHEETS_API.tokenClient) {
        console.error('Token client not initialized');
        return;
    }

    // Check if already authenticated with valid token
    if (SHEETS_API.accessToken && Date.now() < SHEETS_API.tokenExpiry - 60000) {
        console.log('Already authenticated');
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        // Store callbacks
        const originalCallback = SHEETS_API.tokenClient.callback;
        SHEETS_API.tokenClient.callback = (response) => {
            if (response.error) {
                reject(response);
            } else {
                if (originalCallback) originalCallback(response);
                resolve();
            }
        };

        // Request token
        SHEETS_API.tokenClient.requestAccessToken({ prompt: '' });
    });
}

/**
 * Check if authenticated
 */
function isSheetsAuthenticated() {
    return SHEETS_API.isAuthenticated && 
           SHEETS_API.accessToken && 
           Date.now() < SHEETS_API.tokenExpiry - 60000;
}

/**
 * Revoke OAuth token (sign out)
 */
function revokeSheetsAuthorization() {
    if (SHEETS_API.accessToken) {
        google.accounts.oauth2.revoke(SHEETS_API.accessToken, () => {
            console.log('Token revoked');
        });
    }
    SHEETS_API.accessToken = null;
    SHEETS_API.tokenExpiry = null;
    SHEETS_API.isAuthenticated = false;
    updateSyncButtonState();
}

/**
 * Read expenses from Google Sheets
 */
async function readExpensesFromSheets() {
    if (!isSheetsAuthenticated()) {
        await requestSheetsAuthorization();
    }

    try {
        const spreadsheetId = SHEETS_API.config.google_sheets_id;
        const sheetName = SHEETS_API.config.google_sheets_name || 'Expenses';
        const range = `${sheetName}!A2:K`; // Skip header row

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range,
        });

        const rows = response.result.values || [];
        const expenses = rows.map(row => {
            const expense = {
                expense_id: row[0] || generateExpenseId(),
                date: row[1] || new Date().toISOString().split('T')[0],
                description: row[2] || '',
                category: row[3] || 'Other',
                total_amount: parseFloat(row[4]) || 0,
                currency: row[5] || 'THB',
                paid_by: row[6] || '',
                split_among: row[7] || '',
                split_type: row[8] || 'Equal',
                custom_splits: row[9] ? JSON.parse(row[9]) : null,
                notes: row[10] || '',
                time: '' // Time field not supported in Sheets initially, set to empty
            };
            
            // Create timestamp from date if available
            if (expense.date) {
                // Validate the date format before creating timestamp
                const dateObj = new Date(expense.date);
                if (!isNaN(dateObj.getTime())) {
                    // Valid date, create timestamp
                    expense.timestamp = dateObj.toISOString();
                } else {
                    // Invalid date, set timestamp to current time
                    expense.timestamp = new Date().toISOString();
                }
            } else {
                // No date provided, set timestamp to current time
                expense.timestamp = new Date().toISOString();
            }
            
            return expense;
        });

        console.log(`Read ${expenses.length} expenses from Sheets`);
        return expenses;
    } catch (error) {
        console.error('Error reading from Sheets:', error);
        throw error;
    }
}

/**
 * Write expenses to Google Sheets
 */
async function writeExpensesToSheets(expenses) {
    if (!isSheetsAuthenticated()) {
        await requestSheetsAuthorization();
    }

    try {
        const spreadsheetId = SHEETS_API.config.google_sheets_id;
        const sheetName = SHEETS_API.config.google_sheets_name || 'Expenses';

        // Prepare data rows
        const values = expenses.map(exp => [
            exp.expense_id,
            exp.date,
            exp.description,
            exp.category,
            exp.total_amount,
            exp.currency,
            exp.paid_by,
            Array.isArray(exp.split_among) ? exp.split_among.join(',') : exp.split_among,
            exp.split_type || 'Equal',
            exp.custom_splits ? JSON.stringify(exp.custom_splits) : '',
            exp.notes || ''
        ]);

        // Clear existing data (except header)
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:K`,
        });

        // Write new data
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: values
            }
        });

        console.log(`Wrote ${expenses.length} expenses to Sheets`);
        return response;
    } catch (error) {
        console.error('Error writing to Sheets:', error);
        throw error;
    }
}

/**
 * Sync expenses: Pull from Sheets, merge with local, push back
 */
async function syncExpenses(localExpenses) {
    try {
        // Show loading state
        showSyncStatus('Syncing with Google Sheets...', 'loading');

        // Authenticate if needed
        if (!isSheetsAuthenticated()) {
            await requestSheetsAuthorization();
        }

        // Read from Sheets
        const sheetsExpenses = await readExpensesFromSheets();

        // Merge strategy: Sheets is source of truth
        // But keep local expenses that aren't in Sheets yet (by ID)
        const sheetsIds = new Set(sheetsExpenses.map(e => e.expense_id));
        const localOnly = localExpenses.filter(e => !sheetsIds.has(e.expense_id));

        // Combine: Sheets data + local-only items
        const mergedExpenses = [...sheetsExpenses, ...localOnly];

        // Write merged data back to Sheets
        if (localOnly.length > 0) {
            await writeExpensesToSheets(mergedExpenses);
        }

        // Update local storage
        localStorage.setItem('phuket_expenses', JSON.stringify(mergedExpenses));

        showSyncStatus('✓ Synced successfully', 'success');
        
        return mergedExpenses;
    } catch (error) {
        console.error('Sync error:', error);
        showSyncStatus('✗ Sync failed: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Push local expenses to Sheets (one-way sync)
 */
async function pushExpensesToSheets(localExpenses) {
    try {
        showSyncStatus('Uploading to Google Sheets...', 'loading');

        if (!isSheetsAuthenticated()) {
            await requestSheetsAuthorization();
        }

        await writeExpensesToSheets(localExpenses);
        
        showSyncStatus('✓ Uploaded successfully', 'success');
    } catch (error) {
        console.error('Push error:', error);
        showSyncStatus('✗ Upload failed: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Pull expenses from Sheets (one-way sync)
 */
async function pullExpensesFromSheets() {
    try {
        showSyncStatus('Downloading from Google Sheets...', 'loading');

        if (!isSheetsAuthenticated()) {
            await requestSheetsAuthorization();
        }

        const expenses = await readExpensesFromSheets();
        localStorage.setItem('phuket_expenses', JSON.stringify(expenses));
        
        showSyncStatus('✓ Downloaded successfully', 'success');
        
        return expenses;
    } catch (error) {
        console.error('Pull error:', error);
        showSyncStatus('✗ Download failed: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Show sync status message
 */
function showSyncStatus(message, type) {
    const statusElement = document.getElementById('sync-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `sync-status ${type}`;
        statusElement.style.display = 'block';

        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        }
    }
}

/**
 * Update sync button state
 */
function updateSyncButtonState() {
    const syncBtn = document.getElementById('sync-sheets-btn');
    const signOutBtn = document.getElementById('signout-sheets-btn');
    
    if (isSheetsAuthenticated()) {
        if (syncBtn) syncBtn.disabled = false;
        if (signOutBtn) signOutBtn.style.display = 'inline-block';
    } else {
        if (syncBtn) syncBtn.disabled = false; // Still allow click to trigger auth
        if (signOutBtn) signOutBtn.style.display = 'none';
    }
}

/**
 * Generate unique expense ID
 */
function generateExpenseId() {
    return 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
