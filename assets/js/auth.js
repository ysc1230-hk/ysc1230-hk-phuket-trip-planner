/**
 * Authentication Module
 * Handles passcode entry, SHA-256 hashing, and session management
 */

// Global authentication state
const AUTH = {
    config: null,
    failedAttempts: 0,
    cooldownUntil: null,
    sessionKey: 'phuket_trip_session',
    accessLevel: null // 'viewer' or 'admin'
};

/**
 * SHA-256 hash function
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Load authentication configuration
 */
async function loadAuthConfig() {
    try {
        const response = await fetch('config/auth-config.json');
        if (!response.ok) {
            throw new Error('Failed to load auth config');
        }
        AUTH.config = await response.json();
        return AUTH.config;
    } catch (error) {
        console.error('Error loading auth config:', error);
        // Fallback config
        AUTH.config = {
            access_passcode_hash: '9f6e6800cfae7749eb6c486619254b9f56a9056798609c0edc2aa947c2fea05b',
            session_expiry_hours: 168,
            max_failed_attempts: 5,
            cooldown_seconds: 30
        };
        return AUTH.config;
    }
}

/**
 * Check if session is valid
 */
function checkSession() {
    try {
        const sessionData = localStorage.getItem(AUTH.sessionKey);
        if (!sessionData) {
            return false;
        }

        const session = JSON.parse(sessionData);
        const now = Date.now();

        // Check if session has expired
        if (session.expiry && now > session.expiry) {
            localStorage.removeItem(AUTH.sessionKey);
            return false;
        }

        // Store access level
        AUTH.accessLevel = session.accessLevel || 'viewer';
        return true;
    } catch (error) {
        console.error('Error checking session:', error);
        return false;
    }
}

/**
 * Create session
 */
function createSession(accessLevel = 'viewer') {
    const now = Date.now();
    const expiryHours = AUTH.config?.session_expiry_hours || 168; // Default 7 days
    const expiry = now + (expiryHours * 60 * 60 * 1000);

    const session = {
        timestamp: now,
        expiry: expiry,
        authenticated: true,
        accessLevel: accessLevel // 'viewer' or 'admin'
    };

    localStorage.setItem(AUTH.sessionKey, JSON.stringify(session));
    AUTH.accessLevel = accessLevel;
}

/**
 * Clear session (logout)
 */
function clearSession() {
    localStorage.removeItem(AUTH.sessionKey);
    AUTH.failedAttempts = 0;
    AUTH.cooldownUntil = null;
    AUTH.accessLevel = null;
}

/**
 * Verify passcode and return access level
 */
async function verifyPasscode(passcode) {
    const hash = await sha256(passcode);
    
    // Check viewer passcode (152)
    if (hash === AUTH.config.viewer_passcode_hash) {
        return 'viewer';
    }
    
    // Check admin passcode (333)
    if (hash === AUTH.config.admin_passcode_hash) {
        return 'admin';
    }
    
    return null; // Invalid passcode
}

/**
 * Check if in cooldown period
 */
function isInCooldown() {
    if (!AUTH.cooldownUntil) {
        return false;
    }
    
    const now = Date.now();
    if (now < AUTH.cooldownUntil) {
        return true;
    }
    
    // Cooldown expired
    AUTH.cooldownUntil = null;
    AUTH.failedAttempts = 0;
    return false;
}

/**
 * Start cooldown
 */
function startCooldown() {
    const cooldownSeconds = AUTH.config?.cooldown_seconds || 30;
    AUTH.cooldownUntil = Date.now() + (cooldownSeconds * 1000);
    return cooldownSeconds;
}

/**
 * Show error message
 */
function showError(message) {
    const errorElement = document.getElementById('passcode-error');
    const inputElement = document.getElementById('passcode-input');
    
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    
    if (inputElement) {
        inputElement.classList.add('error');
        setTimeout(() => {
            inputElement.classList.remove('error');
        }, 300);
    }
}

/**
 * Hide error message
 */
function hideError() {
    const errorElement = document.getElementById('passcode-error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

/**
 * Handle passcode submission
 */
async function handlePasscodeSubmit(event) {
    event.preventDefault();
    
    const input = document.getElementById('passcode-input');
    const submitBtn = document.getElementById('passcode-submit');
    const passcode = input.value.trim();
    
    // Check if in cooldown
    if (isInCooldown()) {
        const remainingSeconds = Math.ceil((AUTH.cooldownUntil - Date.now()) / 1000);
        showError(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
        return;
    }
    
    // Validate input
    if (!passcode) {
        showError('Please enter a passcode');
        return;
    }
    
    // Disable form while checking
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';
    hideError();
    
    try {
        const accessLevel = await verifyPasscode(passcode);
        
        if (accessLevel) {
            // Success!
            createSession(accessLevel);
            
            // Hide passcode screen and show main content
            const passcodeScreen = document.getElementById('passcode-screen');
            const mainContent = document.getElementById('main-content');
            
            if (passcodeScreen) {
                passcodeScreen.style.opacity = '0';
                passcodeScreen.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    passcodeScreen.style.display = 'none';
                }, 300);
            }
            
            if (mainContent) {
                mainContent.style.display = 'block';
                setTimeout(() => {
                    mainContent.style.opacity = '1';
                }, 10);
            }
            
            // Initialize main app with access level
            if (typeof initializeApp === 'function') {
                initializeApp(accessLevel);
            }
        } else {
            // Failed attempt
            AUTH.failedAttempts++;
            input.value = '';
            
            const maxAttempts = AUTH.config?.max_failed_attempts || 5;
            
            if (AUTH.failedAttempts >= maxAttempts) {
                const cooldownSeconds = startCooldown();
                showError(`Too many failed attempts. Please wait ${cooldownSeconds} seconds.`);
            } else {
                const remaining = maxAttempts - AUTH.failedAttempts;
                showError(`Incorrect passcode. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
            }
        }
    } catch (error) {
        console.error('Error verifying passcode:', error);
        showError('An error occurred. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Access Website';
    }
}

/**
 * Handle logout
 */
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        
        // Reload page to show passcode screen
        window.location.reload();
    }
}

/**
 * Initialize authentication on page load
 */
async function initAuth() {
    // Load config
    await loadAuthConfig();
    
    // Check if already authenticated
    if (checkSession()) {
        // Hide passcode screen and show main content
        const passcodeScreen = document.getElementById('passcode-screen');
        const mainContent = document.getElementById('main-content');
        
        if (passcodeScreen) {
            passcodeScreen.style.display = 'none';
        }
        
        if (mainContent) {
            mainContent.style.display = 'block';
        }
        
        // Initialize main app
        if (typeof initializeApp === 'function') {
            initializeApp(AUTH.accessLevel);
        }
    } else {
        // Show passcode screen
        const passcodeScreen = document.getElementById('passcode-screen');
        if (passcodeScreen) {
            passcodeScreen.style.display = 'flex';
        }
    }
    
    // Setup event listeners
    const passcodeForm = document.getElementById('passcode-form');
    if (passcodeForm) {
        passcodeForm.addEventListener('submit', handlePasscodeSubmit);
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Clear error when user starts typing
    const passcodeInput = document.getElementById('passcode-input');
    if (passcodeInput) {
        passcodeInput.addEventListener('input', hideError);
    }
}

// Initialize auth when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}
