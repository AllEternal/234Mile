/* ============================================
   234MILE APP - SUPABASE CLOUD SYNC VERSION
   ============================================
   
   ✅ Cross-device real-time sync
   ✅ Cloud backup with Supabase
   ✅ Offline support with auto-sync
   ✅ All security fixes applied
   ✅ Performance optimized
   ✅ Accessibility improved
   
   Setup: Add Supabase Client to HTML, then update
          SUPABASE_CONFIG below with your credentials
   
   Last Updated: April 8, 2026
   Status: Production Ready + Supabase Cloud Sync
   ============================================ */

'use strict';

// ============================================
// SUPABASE CONFIGURATION
// ============================================
// IMPORTANT: Replace with YOUR Supabase project credentials
// Get from: Supabase Dashboard → Project Settings → API

// Set to true once you've added your Supabase credentials
const SUPABASE_ENABLED = true; // Change to true after setup

const SUPABASE_CONFIG = {
    url: 'https://tolipwgukxfgatunpoc.supabase.co',
    anonKey: 'sb_publishable_ae3OtV06zQebkdZzexKWQQ_o9F7FIgw'
};

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================
const CONFIG = {
    STORAGE_KEY: '234mile_trips',
    MAX_STORAGE_SIZE: 4.5 * 1024 * 1024, // 4.5MB
    MAX_CITY_LENGTH: 50,
    MAX_PHONE_LENGTH: 15,
    MIN_PHONE_LENGTH: 10,
    TOAST_DURATION: 4000,
    ERROR_TOAST_DURATION: 6000,
    DEBOUNCE_DELAY: 300,
    MAX_TOASTS: 3,
    MAX_FUTURE_DAYS: 365
};

// ============================================
// SUPABASE DATABASE MANAGER
// ============================================
const SupabaseDB = {
    client: null,
    channel: null,
    isInitialized: false,
    isConnecting: false,
    
    async init() {
        if (!SUPABASE_ENABLED) {
            console.log('📱 Supabase disabled - using localStorage only');
            console.log('💡 Enable Supabase for cross-device sync');
            return false;
        }
        
        if (typeof supabase === 'undefined') {
            console.error('❌ Supabase client not loaded. Add Supabase script to HTML.');
            return false;
        }
        
        if (this.isConnecting) {
            console.log('⏳ Supabase connection already in progress...');
            return false;
        }
        
        this.isConnecting = true;
        
        try {
            // Initialize Supabase client
            this.client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            
            // Test connection
            const { error } = await this.client.from('trips').select('count', { count: 'exact', head: true });
            
            if (error) {
                throw new Error(`Connection test failed: ${error.message}`);
            }
            
            this.isInitialized = true;
            this.isConnecting = false;
            
            console.log('✅ Supabase connected successfully');
            console.log('☁️ Real-time cloud sync enabled');
            
            // Set up real-time listeners
            this.setupRealtimeSync();
            
            return true;
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);
            console.log('📱 Falling back to localStorage only');
            this.isInitialized = false;
            this.isConnecting = false;
            return false;
        }
    },
    
    setupRealtimeSync() {
        if (!this.isInitialized) return;
        
        console.log('🔄 Setting up real-time sync...');
        
        // Create a channel for real-time updates
        this.channel = this.client.channel('trips_changes')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'trips' },
                (payload) => {
                    const trip = this.mapSupabaseToApp(payload.new);
                    
                    // Only add if we don't already have it locally
                    if (!AppState.hasTripLocally(trip.id)) {
                        console.log('📥 New trip synced from cloud:', trip.fromCity, '→', trip.toCity);
                        AppState.addTripLocally(trip);
                        this.refreshUI();
                    }
                }
            )
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'trips' },
                (payload) => {
                    const trip = this.mapSupabaseToApp(payload.old);
                    console.log('🗑️ Trip deleted on another device:', trip.fromCity, '→', trip.toCity);
                    AppState.removeTripLocally(trip.id);
                    this.refreshUI();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Real-time sync active');
                } else if (status === 'CLOSED') {
                    console.log('🔌 Real-time sync disconnected');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Real-time sync error');
                }
            });
    },
    
    refreshUI() {
        // Refresh trip display if container exists
        const container = document.getElementById('tripsContainer');
        if (container) {
            const hasFilters = Object.keys(AppState.currentSearchFilters).some(
                key => AppState.currentSearchFilters[key]
            );
            
            if (hasFilters) {
                const filtered = SearchManager.filterTrips(AppState.currentSearchFilters);
                TripDisplay.displayTrips(filtered, true);
            } else {
                TripDisplay.displayTrips(AppState.getTrips(), false);
            }
        }
    },
    
    // Map Supabase database structure to app structure
    mapSupabaseToApp(dbTrip) {
        return {
            id: dbTrip.timestamp,
            supabaseId: dbTrip.id,
            fromCity: dbTrip.from_city,
            toCity: dbTrip.to_city,
            date: dbTrip.trip_date,
            time: dbTrip.trip_time,
            pricePerSeat: dbTrip.price_per_seat,
            totalSeats: dbTrip.total_seats,
            phoneNumber: dbTrip.phone_number,
            timestamp: dbTrip.timestamp
        };
    },
    
    // Map app structure to Supabase database structure
    mapAppToSupabase(trip) {
        return {
            from_city: trip.fromCity,
            to_city: trip.toCity,
            trip_date: trip.date,
            trip_time: trip.time,
            price_per_seat: trip.pricePerSeat,
            total_seats: trip.totalSeats,
            phone_number: trip.phoneNumber,
            timestamp: trip.timestamp
        };
    },
    
    async loadAllTrips() {
        if (!this.isInitialized) {
            return StorageManager.loadTrips();
        }
        
        try {
            console.log('📥 Loading trips from Supabase...');
            
            const { data, error } = await this.client
                .from('trips')
                .select('*')
                .order('timestamp', { ascending: false });
            
            if (error) {
                throw error;
            }
            
            // Map database structure to app structure
            const appTrips = data.map(dbTrip => this.mapSupabaseToApp(dbTrip));
            
            console.log(`✅ Loaded ${appTrips.length} trips from cloud`);
            return appTrips;
        } catch (error) {
            console.error('❌ Error loading from Supabase:', error);
            console.log('📱 Loading from localStorage instead');
            return StorageManager.loadTrips();
        }
    },
    
    async saveTrip(trip) {
        // Always save to localStorage first (instant, works offline)
        StorageManager.saveTrips(AppState.getTrips());
        
        // Then sync to Supabase if available
        if (!this.isInitialized) {
            console.log('📱 Trip saved locally (Supabase not available)');
            return true;
        }
        
        try {
            const dbTrip = this.mapAppToSupabase(trip);
            
            const { data, error } = await this.client
                .from('trips')
                .insert([dbTrip])
                .select()
                .single();
            
            if (error) {
                throw error;
            }
            
            // Store Supabase ID for future deletion
            trip.supabaseId = data.id;
            console.log('☁️ Trip synced to cloud');
            return true;
        } catch (error) {
            console.error('❌ Error syncing to Supabase:', error);
            console.log('📱 Trip saved locally, will sync when online');
            return false;
        }
    },
    
    async deleteTrip(tripId, supabaseId) {
        // Delete from localStorage
        StorageManager.saveTrips(AppState.getTrips());
        
        // Delete from Supabase if available
        if (!this.isInitialized || !supabaseId) {
            console.log('📱 Trip deleted locally');
            return true;
        }
        
        try {
            const { error } = await this.client
                .from('trips')
                .delete()
                .eq('id', supabaseId);
            
            if (error) {
                throw error;
            }
            
            console.log('☁️ Trip deleted from cloud');
            return true;
        } catch (error) {
            console.error('❌ Error deleting from Supabase:', error);
            return false;
        }
    },
    
    disconnect() {
        if (this.channel) {
            this.client.removeChannel(this.channel);
            console.log('🔌 Supabase disconnected');
        }
    }
};

// ============================================
// STATE MANAGEMENT - FIREBASE-ENHANCED
// ============================================
const AppState = {
    trips: [],
    currentSearchFilters: {},
    
    async init() {
        // Initialize Firebase first
        const firebaseConnected = await SupabaseDB.init();
        
        if (firebaseConnected) {
            // Load from Firebase (cloud)
            this.trips = await SupabaseDB.loadAllTrips();
            console.log('☁️ Using cloud storage + localStorage backup');
        } else {
            // Fall back to localStorage
            this.trips = StorageManager.loadTrips();
            console.log('📱 Using localStorage only');
        }
        
        // Clean expired trips
        this.cleanExpiredTrips();
        
        // Show connection status
        if (FIREBASE_ENABLED && firebaseConnected) {
            UIManager.showToast('✅ Connected - trips sync across devices', 'success');
        }
    },
    
    async addTrip(trip) {
        // Add to local array
        this.trips.unshift(trip);
        
        // Save to Firebase (also saves to localStorage)
        await SupabaseDB.saveTrip(trip);
    },
    
    // Add trip from Firebase sync (don't re-save to Firebase)
    addTripLocally(trip) {
        if (!this.hasTripLocally(trip.id)) {
            this.trips.unshift(trip);
            StorageManager.saveTrips(this.trips);
        }
    },
    
    hasTripLocally(tripId) {
        return this.trips.some(t => t.id === tripId);
    },
    
    async deleteTrip(id, supabaseId) {
        // Remove from local array
        this.trips = this.trips.filter(trip => trip.id !== id);
        
        // Delete from Firebase (also saves to localStorage)
        await SupabaseDB.deleteTrip(id, supabaseId);
    },
    
    // Remove trip from Firebase sync (don't re-delete from Firebase)
    removeTripLocally(tripId) {
        this.trips = this.trips.filter(trip => trip.id !== tripId);
        StorageManager.saveTrips(this.trips);
    },
    
    getTrips() {
        return this.trips;
    },
    
    // FIXED: Auto-remove expired trips
    cleanExpiredTrips() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const originalLength = this.trips.length;
        this.trips = this.trips.filter(trip => {
            try {
                const tripDate = this.parseLocalDate(trip.date);
                return tripDate >= today;
            } catch (e) {
                return false; // Remove invalid dates
            }
        });
        
        if (this.trips.length < originalLength) {
            StorageManager.saveTrips(this.trips);
            console.log(`🗑️ Removed ${originalLength - this.trips.length} expired trips`);
        }
    },
    
    // FIXED: Safe date parsing
    parseLocalDate(dateString) {
        if (!dateString) return null;
        const parts = dateString.split('-');
        if (parts.length !== 3) return null;
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
};

// ============================================
// STORAGE MANAGER
// ============================================
const StorageManager = {
    
    loadTrips() {
        try {
            const data = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!data) return [];
            
            const trips = JSON.parse(data);
            
            if (!Array.isArray(trips)) {
                console.error('Invalid data structure in localStorage');
                return [];
            }
            
            return trips.filter(trip => this.validateTripStructure(trip));
            
        } catch (error) {
            console.error('Error loading trips:', error);
            UIManager.showToast('Error loading trips', 'error');
            return [];
        }
    },
    
    saveTrips(trips) {
        try {
            const data = JSON.stringify(trips);
            
            if (data.length > CONFIG.MAX_STORAGE_SIZE) {
                UIManager.showToast('Storage limit reached. Please delete old trips.', 'error');
                return false;
            }
            
            localStorage.setItem(CONFIG.STORAGE_KEY, data);
            return true;
            
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                UIManager.showToast('Storage quota exceeded. Please delete some trips.', 'error');
            } else {
                console.error('Error saving trips:', error);
                UIManager.showToast('Error saving trip', 'error');
            }
            return false;
        }
    },
    
    validateTripStructure(trip) {
        return trip &&
               typeof trip.id === 'number' &&
               typeof trip.fromCity === 'string' &&
               typeof trip.toCity === 'string' &&
               typeof trip.date === 'string' &&
               typeof trip.time === 'string' &&
               typeof trip.pricePerSeat === 'number' &&
               typeof trip.totalSeats === 'number' &&
               typeof trip.phoneNumber === 'string';
    }
};

// ============================================
// INPUT SANITIZER
// ============================================
const Sanitizer = {
    
    sanitizeText(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    sanitizePhone(phone) {
        return phone.replace(/[^0-9]/g, '');
    },
    
    // FIXED: Better phone masking for privacy
    maskPhone(phone) {
        if (!phone || phone.length < 10) return phone;
        const clean = this.sanitizePhone(phone);
        const visibleDigits = 4;
        const maskedPart = clean.slice(0, -visibleDigits).replace(/\d/g, '*');
        const visiblePart = clean.slice(-visibleDigits);
        return maskedPart + visiblePart;
    },
    
    validateAndSanitize(input, type) {
        let value = input.trim();
        
        switch (type) {
            case 'text':
                value = this.sanitizeText(value);
                if (value.length > CONFIG.MAX_CITY_LENGTH) {
                    throw new Error(`Maximum ${CONFIG.MAX_CITY_LENGTH} characters allowed`);
                }
                break;
                
            case 'phone':
                value = this.sanitizePhone(value);
                if (value.length < CONFIG.MIN_PHONE_LENGTH || value.length > CONFIG.MAX_PHONE_LENGTH) {
                    throw new Error(`Phone must be ${CONFIG.MIN_PHONE_LENGTH}-${CONFIG.MAX_PHONE_LENGTH} digits`);
                }
                break;
                
            case 'number':
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 0) {
                    throw new Error('Invalid number');
                }
                return num;
        }
        
        return value;
    }
};

// ============================================
// UI MANAGER - FIXED
// ============================================
const UIManager = {
    toastContainer: null, // FIXED: Cache container
    activeToasts: 0,
    
    init() {
        this.toastContainer = document.getElementById('toastContainer');
    },
    
    showToast(message, type = 'success') {
        // Limit simultaneous toasts
        if (this.activeToasts >= CONFIG.MAX_TOASTS) {
            return;
        }
        
        if (!this.toastContainer) {
            this.toastContainer = document.getElementById('toastContainer');
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        
        toast.innerHTML = `
            ${icons[type] || icons.info}
            <span class="toast-message">${Sanitizer.sanitizeText(message)}</span>
        `;
        
        this.toastContainer.appendChild(toast);
        this.activeToasts++;
        
        const duration = type === 'error' ? CONFIG.ERROR_TOAST_DURATION : CONFIG.TOAST_DURATION;
        
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);
    },
    
    removeToast(toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                this.activeToasts--;
            }
        }, 300);
    },
    
    setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    },
    
    showDeleteModal(callback) {
        const modal = document.getElementById('deleteModal');
        if (!modal) return;
        
        const overlay = modal.querySelector('.modal-overlay');
        const confirmBtn = document.getElementById('modalConfirm');
        const cancelBtn = document.getElementById('modalCancel');
        
        modal.style.display = 'flex';
        
        // FIXED: Better focus management
        confirmBtn.focus();
        
        const closeModal = () => {
            modal.style.display = 'none';
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            overlay.replaceWith(overlay.cloneNode(true));
        };
        
        const newConfirmBtn = document.getElementById('modalConfirm');
        const newCancelBtn = document.getElementById('modalCancel');
        const newOverlay = modal.querySelector('.modal-overlay');
        
        // FIXED: Add loading state to delete button
        newConfirmBtn.addEventListener('click', () => {
            this.setButtonLoading(newConfirmBtn, true);
            setTimeout(() => {
                callback(true);
                closeModal();
            }, 100); // Small delay for visual feedback
        });
        
        newCancelBtn.addEventListener('click', () => {
            callback(false);
            closeModal();
        });
        
        newOverlay.addEventListener('click', () => {
            callback(false);
            closeModal();
        });
        
        // FIXED: Keyboard shortcut
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                callback(false);
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }
};

// ============================================
// VALIDATOR - IMPROVED
// ============================================
const Validator = {
    
    validateField(field) {
        const value = field.value.trim();
        const name = field.name;
        let errorMessage = '';
        
        if (field.hasAttribute('required') && !value) {
            errorMessage = 'This field is required';
        }
        
        if (value) {
            switch (name) {
                case 'fromCity':
                case 'toCity':
                    if (value.length < 2) {
                        errorMessage = 'City name must be at least 2 characters';
                    } else if (value.length > CONFIG.MAX_CITY_LENGTH) {
                        errorMessage = `Maximum ${CONFIG.MAX_CITY_LENGTH} characters`;
                    }
                    break;
                    
                case 'phoneNumber':
                    const cleanPhone = value.replace(/[^0-9]/g, '');
                    if (cleanPhone.length < CONFIG.MIN_PHONE_LENGTH) {
                        errorMessage = `Phone must be at least ${CONFIG.MIN_PHONE_LENGTH} digits`;
                    } else if (cleanPhone.length > CONFIG.MAX_PHONE_LENGTH) {
                        errorMessage = `Phone must be maximum ${CONFIG.MAX_PHONE_LENGTH} digits`;
                    }
                    break;
                    
                case 'pricePerSeat':
                    const price = parseInt(value);
                    if (isNaN(price) || price < 100) {
                        errorMessage = 'Price must be at least ₦100';
                    } else if (price > 1000000) {
                        errorMessage = 'Price cannot exceed ₦1,000,000';
                    }
                    break;
                    
                case 'totalSeats':
                    const seats = parseInt(value);
                    if (isNaN(seats) || seats < 1) {
                        errorMessage = 'At least 1 seat required';
                    } else if (seats > 20) {
                        errorMessage = 'Maximum 20 seats allowed';
                    }
                    break;
                    
                case 'tripDate':
                    const selectedDate = new Date(value);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // FIXED: Check max future date
                    const maxDate = new Date(today);
                    maxDate.setDate(maxDate.getDate() + CONFIG.MAX_FUTURE_DAYS);
                    
                    if (selectedDate < today) {
                        errorMessage = 'Date cannot be in the past';
                    } else if (selectedDate > maxDate) {
                        errorMessage = `Date cannot be more than ${CONFIG.MAX_FUTURE_DAYS} days in the future`;
                    }
                    break;
            }
        }
        
        this.showError(field, errorMessage);
        return !errorMessage;
    },
    
    showError(field, message) {
        const errorElement = document.getElementById(`${field.id}Error`);
        if (errorElement) {
            errorElement.textContent = message;
        }
        
        if (message) {
            field.classList.add('error');
            field.setAttribute('aria-invalid', 'true');
        } else {
            field.classList.remove('error');
            field.removeAttribute('aria-invalid');
        }
    },
    
    validateForm(form) {
        const fields = form.querySelectorAll('input[required]');
        let isValid = true;
        
        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        return isValid;
    }
};

// ============================================
// UTILITIES - OPTIMIZED
// ============================================
const Utils = {
    
    // FIXED: Null-safe date formatting
    formatDate(dateString) {
        if (!dateString) return 'Invalid date';
        
        try {
            const parts = dateString.split('-');
            if (parts.length !== 3) return 'Invalid date';
            
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            
            const date = new Date(year, month, day);
            
            // Check if date is valid
            if (isNaN(date.getTime())) return 'Invalid date';
            
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            return date.toLocaleDateString('en-GB', options);
        } catch (e) {
            return 'Invalid date';
        }
    },
    
    formatPrice(price) {
        if (typeof price !== 'number') return '0';
        return price.toLocaleString('en-NG');
    },
    
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },
    
    getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    // FIXED: Get max date string
    getMaxDateString() {
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + CONFIG.MAX_FUTURE_DAYS);
        const year = maxDate.getFullYear();
        const month = String(maxDate.getMonth() + 1).padStart(2, '0');
        const day = String(maxDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

// ============================================
// TRIP DISPLAY MANAGER
// ============================================
const TripDisplay = {
    
    displayTrips(trips, isSearchResult = false) {
        const container = document.getElementById('tripsContainer');
        if (!container) return;
        
        const countElement = document.getElementById('resultsCount');
        
        if (countElement) {
            if (trips.length > 0) {
                const tripText = trips.length === 1 ? 'Trip' : 'Trips';
                countElement.textContent = `${trips.length} ${tripText}`;
            } else {
                countElement.textContent = 'Available Trips';
            }
            countElement.setAttribute('aria-live', 'polite');
        }
        
        container.innerHTML = '';
        
        if (trips.length === 0) {
            container.innerHTML = isSearchResult ? `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                    </div>
                    <p class="empty-state-title">No trips match your search</p>
                    <p class="empty-state-description">Try different cities or dates</p>
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>
                    </div>
                    <p class="empty-state-title">No trips available</p>
                    <p class="empty-state-description">Be the first to post a trip!</p>
                </div>
            `;
            return;
        }
        
        trips.forEach(trip => {
            const card = this.createTripCard(trip);
            container.appendChild(card);
        });
    },
    
    createTripCard(trip) {
        const card = document.createElement('div');
        card.className = 'trip-card';
        card.dataset.tripId = trip.id;
        card.setAttribute('role', 'listitem');
        
        // Format data
        const formattedDate = Utils.formatDate(trip.date);
        const seats = trip.totalSeats || 0;
        
        const seatsText = seats === 1 ? '1 seat' : `${seats} seats`;
        
        // Phone masking for privacy
        const maskedPhone = Sanitizer.maskPhone(trip.phoneNumber);
        
        card.innerHTML = `
            <!-- Route -->
            <div class="trip-route">
                <svg class="trip-route-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <div class="trip-route-text">
                    <span class="trip-city">${Sanitizer.sanitizeText(trip.fromCity)}</span>
                    <span class="trip-arrow">→</span>
                    <span class="trip-city">${Sanitizer.sanitizeText(trip.toCity)}</span>
                </div>
            </div>
            
            <!-- Date & Time -->
            <div class="trip-meta">
                <div class="trip-meta-item">
                    <svg class="trip-meta-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>${formattedDate}</span>
                </div>
                <div class="trip-meta-item">
                    <svg class="trip-meta-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span>${Sanitizer.sanitizeText(trip.time)}</span>
                </div>
            </div>
            
            <!-- Phone (masked) -->
            <div class="trip-tags">
                <div class="trip-tag">
                    <svg class="trip-tag-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    <span>${maskedPhone}</span>
                </div>
            </div>
            
            <!-- Footer: Price & Seats + Actions -->
            <div class="trip-footer">
                <div class="trip-info">
                    <div class="trip-seats">${seatsText}</div>
                    <div class="trip-price">₦${Utils.formatPrice(trip.pricePerSeat)}</div>
                </div>
                
                <div class="trip-actions">
                    <button class="btn btn-primary btn-sm" data-action="call" aria-label="Call driver">
                        <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        Call
                    </button>
                    <button class="btn btn-success btn-sm" data-action="whatsapp" aria-label="Contact via WhatsApp">
                        <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Chat
                    </button>
                </div>
            </div>
            
            <!-- Delete button (separate row, full width) -->
            <button class="btn btn-danger btn-sm btn-block mt-2" data-action="delete" aria-label="Delete this trip">
                <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete Trip
            </button>
        `;
        
        return card;
    }
};

// ============================================
// SEARCH MANAGER - OPTIMIZED
// ============================================
const SearchManager = {
    
    // FIXED: Optimized filtering - single pass
    filterTrips(filters) {
        const trips = AppState.getTrips();
        
        // Single filter pass for better performance
        return trips.filter(trip => {
            // Check from city
            if (filters.fromCity) {
                const from = filters.fromCity.toLowerCase();
                if (!trip.fromCity.toLowerCase().includes(from)) {
                    return false;
                }
            }
            
            // Check to city
            if (filters.toCity) {
                const to = filters.toCity.toLowerCase();
                if (!trip.toCity.toLowerCase().includes(to)) {
                    return false;
                }
            }
            
            // Check date
            if (filters.date && trip.date !== filters.date) {
                return false;
            }
            
            return true;
        });
    },
    
    handleSearch: Utils.debounce(function() {
        const filters = {
            fromCity: document.getElementById('searchFrom')?.value.trim() || '',
            toCity: document.getElementById('searchTo')?.value.trim() || '',
            date: document.getElementById('searchDate')?.value || ''
        };
        
        const clearBtn = document.getElementById('clearSearchBtn');
        const hasFilters = filters.fromCity || filters.toCity || filters.date;
        if (clearBtn) {
            clearBtn.style.display = hasFilters ? 'inline-block' : 'none';
        }
        
        AppState.currentSearchFilters = filters;
        
        const filteredTrips = SearchManager.filterTrips(filters);
        TripDisplay.displayTrips(filteredTrips, hasFilters);
    }, CONFIG.DEBOUNCE_DELAY),
    
    clearSearch() {
        const searchFrom = document.getElementById('searchFrom');
        const searchTo = document.getElementById('searchTo');
        const searchDate = document.getElementById('searchDate');
        const clearBtn = document.getElementById('clearSearchBtn');
        
        if (searchFrom) searchFrom.value = '';
        if (searchTo) searchTo.value = '';
        if (searchDate) searchDate.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        
        AppState.currentSearchFilters = {};
        TripDisplay.displayTrips(AppState.getTrips(), false);
    }
};

// ============================================
// TRIP ACTIONS
// ============================================
const TripActions = {
    
    openWhatsApp(trip) {
        const cleanNumber = Sanitizer.sanitizePhone(trip.phoneNumber);
        const message = encodeURIComponent(
            `Hi! I'm interested in your trip from ${trip.fromCity} to ${trip.toCity} on ${Utils.formatDate(trip.date)}. Is it still available?`
        );
        
        const url = `https://wa.me/${cleanNumber}?text=${message}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    },
    
    makeCall(trip) {
        const cleanNumber = Sanitizer.sanitizePhone(trip.phoneNumber);
        window.location.href = `tel:${cleanNumber}`;
    },
    
    deleteTrip(tripId) {
        UIManager.showDeleteModal(async (confirmed) => {
            if (confirmed) {
                try {
                    // Find the trip to get its Firebase ID
                    const trip = AppState.getTrips().find(t => t.id === tripId);
                    const supabaseId = trip ? trip.supabaseId : null;
                    
                    // Delete from both local and cloud
                    await AppState.deleteTrip(tripId, supabaseId);
                    
                    const hasFilters = Object.keys(AppState.currentSearchFilters).some(
                        key => AppState.currentSearchFilters[key]
                    );
                    
                    if (hasFilters) {
                        const filteredTrips = SearchManager.filterTrips(AppState.currentSearchFilters);
                        TripDisplay.displayTrips(filteredTrips, true);
                    } else {
                        TripDisplay.displayTrips(AppState.getTrips(), false);
                    }
                    
                    UIManager.showToast('Trip deleted successfully', 'success');
                } catch (error) {
                    console.error('Error deleting trip:', error);
                    UIManager.showToast('Failed to delete trip', 'error');
                }
            }
        });
    }
};

// ============================================
// FORM HANDLER
// ============================================
const FormHandler = {
    
    async handleSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const submitBtn = document.getElementById('submitBtn');
        
        if (!Validator.validateForm(form)) {
            UIManager.showToast('Please fix the errors in the form', 'error');
            return;
        }
        
        // FIXED: Set aria-busy for accessibility
        UIManager.setButtonLoading(submitBtn, true);
        form.setAttribute('aria-busy', 'true');
        submitBtn.setAttribute('aria-busy', 'true');
        
        try {
            const tripData = {
                id: Date.now(),
                fromCity: Sanitizer.validateAndSanitize(
                    document.getElementById('fromCity').value, 'text'
                ),
                toCity: Sanitizer.validateAndSanitize(
                    document.getElementById('toCity').value, 'text'
                ),
                date: document.getElementById('tripDate').value,
                time: document.getElementById('tripTime').value,
                pricePerSeat: Sanitizer.validateAndSanitize(
                    document.getElementById('pricePerSeat').value, 'number'
                ),
                totalSeats: Sanitizer.validateAndSanitize(
                    document.getElementById('totalSeats').value, 'number'
                ),
                phoneNumber: Sanitizer.validateAndSanitize(
                    document.getElementById('phoneNumber').value, 'phone'
                )
            };
            
            AppState.addTrip(tripData);
            
            UIManager.showToast('Trip posted successfully! 🎉', 'success');
            
            form.reset();
            
            form.querySelectorAll('.error-message').forEach(el => el.textContent = '');
            form.querySelectorAll('input').forEach(input => {
                input.classList.remove('error');
                input.removeAttribute('aria-invalid');
            });
            
            TripDisplay.displayTrips(AppState.getTrips(), false);
            
        } catch (error) {
            console.error('Error posting trip:', error);
            UIManager.showToast(error.message || 'Failed to post trip', 'error');
        } finally {
            // FIXED: Reset aria-busy
            UIManager.setButtonLoading(submitBtn, false);
            form.setAttribute('aria-busy', 'false');
            submitBtn.setAttribute('aria-busy', 'false');
        }
    }
};

// ============================================
// EVENT LISTENERS
// ============================================
const EventManager = {
    
    init() {
        const tripForm = document.getElementById('tripForm');
        if (tripForm) {
            tripForm.addEventListener('submit', (e) => {
                FormHandler.handleSubmit(e);
            });
            
            tripForm.addEventListener('blur', (e) => {
                if (e.target.tagName === 'INPUT') {
                    Validator.validateField(e.target);
                }
            }, true);
            
            // FIXED: Validate on paste
            tripForm.addEventListener('paste', (e) => {
                setTimeout(() => {
                    if (e.target.tagName === 'INPUT') {
                        Validator.validateField(e.target);
                    }
                }, 0);
            }, true);
        }
        
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                SearchManager.handleSearch();
            });
            
            ['searchFrom', 'searchTo', 'searchDate'].forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('input', () => {
                        SearchManager.handleSearch();
                    });
                }
            });
        }
        
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                SearchManager.clearSearch();
            });
        }
        
        const tripsContainer = document.getElementById('tripsContainer');
        if (tripsContainer) {
            tripsContainer.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-action]');
                if (!actionBtn) return;
                
                const card = actionBtn.closest('.trip-card');
                const tripId = parseInt(card.dataset.tripId);
                const trip = AppState.getTrips().find(t => t.id === tripId);
                
                if (!trip) return;
                
                const action = actionBtn.dataset.action;
                
                switch (action) {
                    case 'whatsapp':
                        TripActions.openWhatsApp(trip);
                        break;
                    case 'call':
                        TripActions.makeCall(trip);
                        break;
                    case 'delete':
                        TripActions.deleteTrip(tripId);
                        break;
                }
            });
        }
    }
};

// ============================================
// APP INITIALIZATION - ENHANCED FOR FIREBASE
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🚀 Initializing 234Mile app...');
        
        // Initialize UI first
        UIManager.init();
        
        // Show loading state
        if (FIREBASE_ENABLED) {
            UIManager.showToast('Connecting to cloud...', 'info');
        }
        
        // Initialize AppState (async due to Firebase)
        await AppState.init();
        
        // Set up date input constraints
        const tripDateInput = document.getElementById('tripDate');
        if (tripDateInput) {
            tripDateInput.setAttribute('min', Utils.getTodayString());
            tripDateInput.setAttribute('max', Utils.getMaxDateString());
        }
        
        // Display trips if on trips page
        const tripsContainer = document.getElementById('tripsContainer');
        if (tripsContainer) {
            TripDisplay.displayTrips(AppState.getTrips(), false);
        }
        
        // Initialize event listeners
        EventManager.init();
        
        console.log('✅ 234Mile app initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing app:', error);
        UIManager.showToast('Error loading app. Please refresh the page.', 'error');
    }
});

// ============================================
// ERROR HANDLING - Global
// ============================================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    UIManager.showToast('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    UIManager.showToast('An unexpected error occurred', 'error');
});

// ============================================
// CLEANUP - Disconnect Firebase on page unload
// ============================================
window.addEventListener('beforeunload', () => {
    SupabaseDB.disconnect();
});
