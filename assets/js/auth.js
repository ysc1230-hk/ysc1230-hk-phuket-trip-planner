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
    

    if (hash === AUTH.config.viewer_passcode_hash) {
        return 'viewer';
    }
    

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
    const cooldownSeconds = AUTH.config?.cooldown_seconds || 3;
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
 * Handle picture-based passcode submission
 */
function initializePicturePasscode() {
    const images = document.querySelectorAll('.passcode-image');
    const viewerSequence = [1, 5, 2]; // Required sequence: 1st, 5th, 2nd (viewer access)
    const adminSequence = [3, 3, 3];  // Required sequence: 3rd, 3rd, 3rd (admin access)
    let currentStep = 0;
    let enteredSequence = [];
    
    images.forEach(image => {
        image.addEventListener('click', function() {
            const position = parseInt(this.getAttribute('data-position'));
            
            // Add visual feedback for tap
            addTapFeedback(this);
            
            // Add the position to the entered sequence
            enteredSequence.push(position);
            
            // Check if it matches the viewer sequence
            if (enteredSequence.length <= viewerSequence.length && 
                position === viewerSequence[currentStep] && 
                enteredSequence.join(',') === viewerSequence.slice(0, enteredSequence.length).join(',')) {
                
                // Correct selection for viewer sequence
                this.classList.add('selected');
                
                // Remove hover effect during selection
                this.style.pointerEvents = 'none';
                
                currentStep++;
                
                if (currentStep === viewerSequence.length) {
                    // Complete viewer sequence entered correctly
                    setTimeout(() => {
                        handlePicturePasscodeSuccess('viewer');
                    }, 300);
                } else {
                    // Brief delay before next selection
                    setTimeout(() => {
                        // Re-enable pointer events for next selection
                        images.forEach(img => img.style.pointerEvents = 'auto');
                    }, 300);
                }
            }
            // Check if it matches the admin sequence
            else if (enteredSequence.length <= adminSequence.length && 
                     position === adminSequence[currentStep] && 
                     enteredSequence.join(',') === adminSequence.slice(0, enteredSequence.length).join(',')) {
                
                // Correct selection for admin sequence
                this.classList.add('selected');
                
                // Remove hover effect during selection
                this.style.pointerEvents = 'none';
                
                currentStep++;
                
                if (currentStep === adminSequence.length) {
                    // Complete admin sequence entered correctly
                    setTimeout(() => {
                        handlePicturePasscodeSuccess('admin');
                    }, 300);
                } else {
                    // Brief delay before next selection
                    setTimeout(() => {
                        // Re-enable pointer events for next selection
                        images.forEach(img => img.style.pointerEvents = 'auto');
                    }, 300);
                }
            } else {
                // Wrong selection for both sequences
                handlePicturePasscodeError();
                
                // Reset selections
                resetPasscodeSelections();
                
                currentStep = 0;
                enteredSequence = [];
            }
        });
    });
}

/**
 * Add visual feedback for tap
 */
function addTapFeedback(element) {
    // Create ripple effect at tap position
    const ripple = document.createElement('span');
    ripple.classList.add('ripple-effect');
    
    // Position the ripple at the center of the element
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `50%`;
    ripple.style.top = `50%`;
    
    element.appendChild(ripple);
    
    // Add a brief scale animation to the image itself
    element.style.transform = 'scale(0.95)';
    setTimeout(() => {
        element.style.transform = '';
    }, 150);
    
    // Remove ripple after animation completes
    setTimeout(() => {
        if (ripple.parentNode === element) {
            element.removeChild(ripple);
        }
    }, 600);
}

/**
 * Handle successful passcode entry
 */
async function handlePicturePasscodeSuccess(accessLevel = 'viewer') {
    // Create session with appropriate access level
    createSession(accessLevel);
    
    // Create ripple effect
    createRippleEffect();
    
    // Add success animation to all images
    const images = document.querySelectorAll('.passcode-image');
    images.forEach((img, index) => {
        img.style.animation = 'none';
        // Add a success animation
        setTimeout(() => {
            img.style.transform = 'scale(0.8)';
            img.style.opacity = '0.5';
        }, index * 100); // Stagger the animation
    });
    
    // Hide passcode screen and show main content
    const passcodeScreen = document.getElementById('passcode-screen');
    const mainContent = document.getElementById('main-content');
    
    if (passcodeScreen) {
        // Add a slight delay to allow ripple to show
        setTimeout(() => {
            passcodeScreen.style.opacity = '0';
            passcodeScreen.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                passcodeScreen.style.display = 'none';
            }, 500);
        }, 200);
    }
    
    if (mainContent) {
        // Show main content after passcode screen fades out
        setTimeout(() => {
            mainContent.style.display = 'block';
            setTimeout(() => {
                mainContent.style.opacity = '1';
            }, 10);
        }, 700); // Wait for passcode screen to fully disappear
    }
    
    // Initialize main app with access level
    if (typeof initializeApp === 'function') {
        initializeApp(accessLevel);
    }
}

/**
 * Handle incorrect passcode entry
 */
function handlePicturePasscodeError() {
    // Increment failed attempts
    AUTH.failedAttempts++;
    
    const maxAttempts = AUTH.config?.max_failed_attempts || 5;
    
    // Add shake animation to all images to indicate error
    const images = document.querySelectorAll('.passcode-image');
    images.forEach(img => {
        img.style.animation = 'shake 0.5s';
        setTimeout(() => {
            img.style.animation = '';
        }, 500);
    });
    
    if (AUTH.failedAttempts >= maxAttempts) {
        const cooldownSeconds = startCooldown();
        showError(`Too many failed attempts. Please wait ${cooldownSeconds} seconds.`);
    } else {
        const remaining = maxAttempts - AUTH.failedAttempts;
        showError(`Incorrect sequence. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }
}

/* Add shake animation CSS */
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}
`;
document.head.appendChild(style);

/**
 * Reset passcode selections
 */
function resetPasscodeSelections() {
    const images = document.querySelectorAll('.passcode-image');
    images.forEach(img => {
        img.classList.remove('selected');
        img.style.pointerEvents = 'auto';
    });
}

/**
 * Create ripple effect for success
 */
function createRippleEffect() {
    const passcodeScreen = document.getElementById('passcode-screen');
    const ripple = document.createElement('div');
    ripple.classList.add('ripple');
    
    // Position in the center
    const rect = passcodeScreen.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5; // Make it slightly larger
    
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `50%`;
    ripple.style.top = `50%`;
    ripple.style.transform = `translate(-50%, -50%)`;
    
    passcodeScreen.appendChild(ripple);
    
    // Remove ripple after animation completes
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

/**
 * Handle passcode submission (for compatibility with old form)
 */
async function handlePasscodeSubmit(event) {
    if (event) {
        event.preventDefault();
    }
    
    // Check if in cooldown
    if (isInCooldown()) {
        const remainingSeconds = Math.ceil((AUTH.cooldownUntil - Date.now()) / 1000);
        showError(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
        return;
    }
    
    // For picture-based passcode, we don't use the form
    // This function is kept for compatibility
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
        
        // Initialize picture passcode
        setTimeout(() => {
            resetPasscodeSelections(); // Ensure clean state
            initializePicturePasscode();
        }, 100);
    }
    
    // Setup event listeners
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Initialize auth when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}
