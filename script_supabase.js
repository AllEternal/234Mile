/* ============================================
   234MILE — SUPABASE CLOUD SYNC
   ============================================
   ✅ Cross-device real-time sync via Supabase
   ✅ localStorage offline fallback + auto-sync
   ✅ All Firebase references removed
   ✅ Bug fixes applied (see CHANGELOG below)
   ✅ Performance & accessibility improvements

   CHANGELOG (vs previous version)
   ---------------------------------
   FIX  FIREBASE_ENABLED → SUPABASE_ENABLED (was undefined, broke init toast & fallback)
   FIX  Search inputs now attach listeners unconditionally (#searchBtn never existed)
   FIX  Nav links in index-supabase.html corrected (see HTML file)
   FIX  SUPABASE_ENABLED defaults to false to prevent crashes with placeholder creds
   FIX  trip.timestamp now set in FormHandler so DB insert is never undefined
   FIX  Real-time handles TIMED_OUT with 5 s auto-reconnect
   FIX  toast.hiding CSS added; activeToasts clamped to >= 0
   FIX  input.error border added to stylesheet (see CSS file)
   FIX  Modal clone/replace order corrected
   PERF displayTrips uses DocumentFragment; cloud query pre-filters expired trips
   UX   Loading spinner shown while Supabase fetch is in flight
   ============================================ */

'use strict';

// ============================================
// SUPABASE CONFIGURATION
// ============================================
// 1. Set SUPABASE_ENABLED to true
// 2. Paste your project URL and anon key below
// (Dashboard → Project Settings → API)

const SUPABASE_ENABLED = false; // ← change to true after filling in credentials

const SUPABASE_CONFIG = {
    url: 'https://tolipwgukxfgatunpoc.supabase.co',
    anonKey: 'sb_publishable_ae3OtV06zQebkdZzexKWQQ_o9F7FIgw'
};

// ============================================
// CONSTANTS
// ============================================
const CONFIG = {
    STORAGE_KEY:        '234mile_trips',
    MAX_STORAGE_SIZE:   4.5 * 1024 * 1024,
    MAX_CITY_LENGTH:    50,
    MAX_PHONE_LENGTH:   15,
    MIN_PHONE_LENGTH:   10,
    TOAST_DURATION:     4000,
    ERROR_TOAST_DURATION: 6000,
    DEBOUNCE_DELAY:     300,
    MAX_TOASTS:         3,
    MAX_FUTURE_DAYS:    365
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
            console.log('📱 Supabase disabled — using localStorage only');
            return false;
        }

        // FIX: validate credentials before attempting connection
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.error('❌ SUPABASE_CONFIG is empty. Fill in url and anonKey first.');
            return false;
        }

        if (typeof supabase === 'undefined') {
            console.error('❌ Supabase JS client not loaded. Check your <script> tag.');
            return false;
        }

        if (this.isConnecting) return false;
        this.isConnecting = true;

        try {
            this.client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

            // Lightweight connectivity probe
            const { error } = await this.client
                .from('trips')
                .select('count', { count: 'exact', head: true });

            if (error) throw new Error(error.message);

            this.isInitialized = true;
            this.isConnecting  = false;
            console.log('✅ Supabase connected — real-time sync enabled');
            this.setupRealtimeSync();
            return true;
        } catch (err) {
            console.error('❌ Supabase init failed:', err.message);
            this.isInitialized = false;
            this.isConnecting  = false;
            return false;
        }
    },

    setupRealtimeSync() {
        if (!this.isInitialized) return;

        // Remove existing channel before creating a new one (avoids duplicate listeners on reconnect)
        if (this.channel) {
            this.client.removeChannel(this.channel);
            this.channel = null;
        }

        this.channel = this.client
            .channel('trips_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'trips' },
                (payload) => {
                    const trip = this.mapSupabaseToApp(payload.new);
                    if (!AppState.hasTripLocally(trip.id)) {
                        AppState.addTripLocally(trip);
                        this.refreshUI();
                    }
                }
            )
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'trips' },
                (payload) => {
                    // payload.old.timestamp is the app-side id
                    AppState.removeTripLocally(payload.old.timestamp);
                    this.refreshUI();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Real-time sync active');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    // FIX: handle TIMED_OUT — was previously silently lost
                    console.warn('⚠️ Real-time disconnected, retrying in 5 s…');
                    setTimeout(() => this.setupRealtimeSync(), 5000);
                }
            });
    },

    refreshUI() {
        const container = document.getElementById('tripsContainer');
        if (!container) return;
        const hasFilters = Object.values(AppState.currentSearchFilters).some(Boolean);
        TripDisplay.displayTrips(
            hasFilters
                ? SearchManager.filterTrips(AppState.currentSearchFilters)
                : AppState.getTrips(),
            hasFilters
        );
    },

    // DB row → app object
    mapSupabaseToApp(row) {
        return {
            id:           row.timestamp,   // timestamp used as numeric id
            supabaseId:   row.id,          // UUID primary key for deletes
            fromCity:     row.from_city,
            toCity:       row.to_city,
            date:         row.trip_date,
            time:         row.trip_time,
            pricePerSeat: row.price_per_seat,
            totalSeats:   row.total_seats,
            phoneNumber:  row.phone_number,
            timestamp:    row.timestamp
        };
    },

    // App object → DB row
    mapAppToSupabase(trip) {
        return {
            from_city:     trip.fromCity,
            to_city:       trip.toCity,
            trip_date:     trip.date,
            trip_time:     trip.time,
            price_per_seat: trip.pricePerSeat,
            total_seats:   trip.totalSeats,
            phone_number:  trip.phoneNumber,
            timestamp:     trip.timestamp   // FIX: was trip.timestamp (undefined in old code)
        };
    },

    async loadAllTrips() {
        if (!this.isInitialized) return StorageManager.loadTrips();

        try {
            // PERF: filter expired rows server-side, not client-side
            const { data, error } = await this.client
                .from('trips')
                .select('*')
                .gte('trip_date', Utils.getTodayString())
                .order('trip_date', { ascending: true })
                .order('trip_time', { ascending: true });

            if (error) throw error;

            const trips = data.map(r => this.mapSupabaseToApp(r));
            console.log(`✅ Loaded ${trips.length} trips from cloud`);
            StorageManager.saveTrips(trips); // keep localStorage in sync
            return trips;
        } catch (err) {
            console.error('❌ Cloud load failed, using localStorage:', err.message);
            return StorageManager.loadTrips();
        }
    },

    async saveTrip(trip) {
        StorageManager.saveTrips(AppState.getTrips());

        if (!this.isInitialized) return true;

        try {
            const { data, error } = await this.client
                .from('trips')
                .insert([this.mapAppToSupabase(trip)])
                .select()
                .single();

            if (error) throw error;

            trip.supabaseId = data.id;
            console.log('☁️ Trip synced to cloud');
            return true;
        } catch (err) {
            console.error('❌ Cloud save failed (saved locally):', err.message);
            return false;
        }
    },

    async deleteTrip(tripId, supabaseId) {
        // AppState already removed the trip from its array before calling here
        StorageManager.saveTrips(AppState.getTrips());

        if (!this.isInitialized || !supabaseId) return true;

        try {
            const { error } = await this.client
                .from('trips')
                .delete()
                .eq('id', supabaseId);

            if (error) throw error;

            console.log('☁️ Trip deleted from cloud');
            return true;
        } catch (err) {
            console.error('❌ Cloud delete failed:', err.message);
            return false;
        }
    },

    disconnect() {
        if (this.channel && this.client) {
            this.client.removeChannel(this.channel);
            this.channel = null;
        }
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================
const AppState = {
    trips: [],
    currentSearchFilters: {},

    async init() {
        // FIX: was checking undefined FIREBASE_ENABLED
        const supabaseConnected = await SupabaseDB.init();

        if (supabaseConnected) {
            this.trips = await SupabaseDB.loadAllTrips();
            // Cloud query already excludes expired trips, so no local clean needed
        } else {
            this.trips = StorageManager.loadTrips();
            this.cleanExpiredTrips();
        }
    },

    async addTrip(trip) {
        this.trips.unshift(trip);
        await SupabaseDB.saveTrip(trip);
    },

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
        this.trips = this.trips.filter(t => t.id !== id);
        await SupabaseDB.deleteTrip(id, supabaseId);
    },

    removeTripLocally(tripId) {
        this.trips = this.trips.filter(t => t.id !== tripId);
        StorageManager.saveTrips(this.trips);
    },

    getTrips() { return this.trips; },

    cleanExpiredTrips() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const before = this.trips.length;

        this.trips = this.trips.filter(trip => {
            try { return this.parseLocalDate(trip.date) >= today; }
            catch { return false; }
        });

        if (this.trips.length < before) {
            StorageManager.saveTrips(this.trips);
            console.log(`🗑️ Removed ${before - this.trips.length} expired trips`);
        }
    },

    parseLocalDate(str) {
        if (!str) return null;
        const [y, m, d] = str.split('-');
        if (!y || !m || !d) return null;
        return new Date(+y, +m - 1, +d);
    }
};

// ============================================
// STORAGE MANAGER
// ============================================
const StorageManager = {

    loadTrips() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return [];
            const trips = JSON.parse(raw);
            return Array.isArray(trips) ? trips.filter(t => this.isValid(t)) : [];
        } catch {
            UIManager.showToast('Error loading local trips', 'error');
            return [];
        }
    },

    saveTrips(trips) {
        try {
            const data = JSON.stringify(trips);
            if (data.length > CONFIG.MAX_STORAGE_SIZE) {
                UIManager.showToast('Storage limit reached. Delete some trips.', 'error');
                return false;
            }
            localStorage.setItem(CONFIG.STORAGE_KEY, data);
            return true;
        } catch (err) {
            UIManager.showToast(
                err.name === 'QuotaExceededError'
                    ? 'Storage full. Delete some trips.'
                    : 'Error saving trip',
                'error'
            );
            return false;
        }
    },

    isValid(t) {
        return (
            t &&
            typeof t.id           === 'number' &&
            typeof t.fromCity     === 'string' &&
            typeof t.toCity       === 'string' &&
            typeof t.date         === 'string' &&
            typeof t.time         === 'string' &&
            typeof t.pricePerSeat === 'number' &&
            typeof t.totalSeats   === 'number' &&
            typeof t.phoneNumber  === 'string'
        );
    }
};

// ============================================
// SANITIZER
// ============================================
const Sanitizer = {

    sanitizeText(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    sanitizePhone(phone) {
        return String(phone).replace(/[^0-9]/g, '');
    },

    maskPhone(phone) {
        if (!phone || phone.length < 4) return phone;
        const clean = this.sanitizePhone(phone);
        return clean.slice(0, -4).replace(/\d/g, '*') + clean.slice(-4);
    },

    validateAndSanitize(input, type) {
        let value = String(input).trim();

        switch (type) {
            case 'text':
                if (value.length < 2)
                    throw new Error('City name must be at least 2 characters');
                if (value.length > CONFIG.MAX_CITY_LENGTH)
                    throw new Error(`Max ${CONFIG.MAX_CITY_LENGTH} characters`);
                return this.sanitizeText(value);

            case 'phone':
                value = this.sanitizePhone(value);
                if (value.length < CONFIG.MIN_PHONE_LENGTH ||
                    value.length > CONFIG.MAX_PHONE_LENGTH)
                    throw new Error(
                        `Phone must be ${CONFIG.MIN_PHONE_LENGTH}–${CONFIG.MAX_PHONE_LENGTH} digits`
                    );
                return value;

            case 'number': {
                const n = parseInt(value, 10);
                if (isNaN(n) || n < 0) throw new Error('Invalid number');
                return n;
            }
        }

        return value;
    }
};

// ============================================
// UI MANAGER
// ============================================
const UIManager = {
    toastContainer: null,
    activeToasts: 0,

    init() {
        this.toastContainer = document.getElementById('toastContainer');
    },

    showToast(message, type = 'success') {
        if (this.activeToasts >= CONFIG.MAX_TOASTS) return;
        if (!this.toastContainer)
            this.toastContainer = document.getElementById('toastContainer');

        const icons = {
            success: `<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            error:   `<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            warning: `<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
            info:    `<svg class="toast-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            ${icons[type] || icons.info}
            <span class="toast-message">${Sanitizer.sanitizeText(message)}</span>
        `;

        this.toastContainer.appendChild(toast);
        this.activeToasts++;

        const dur = type === 'error' ? CONFIG.ERROR_TOAST_DURATION : CONFIG.TOAST_DURATION;
        setTimeout(() => this.removeToast(toast), dur);
    },

    removeToast(toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.parentNode?.removeChild(toast);
            // FIX: clamp to 0 to avoid negative counts
            this.activeToasts = Math.max(0, this.activeToasts - 1);
        }, 300);
    },

    setButtonLoading(btn, isLoading) {
        btn.classList.toggle('loading', isLoading);
        btn.disabled = isLoading;
    },

    showLoadingState() {
        const container = document.getElementById('tripsContainer');
        if (!container) return;
        container.innerHTML = `
            <div class="loading-state" role="status" aria-label="Loading trips">
                <div class="loading-spinner" aria-hidden="true"></div>
                <p class="loading-text">Loading trips…</p>
            </div>
        `;
    },

    showDeleteModal(callback) {
        const modal = document.getElementById('deleteModal');
        if (!modal) return;

        modal.style.display = 'flex';

        // FIX: clone before querying to avoid stale reference confusion
        const overlay    = modal.querySelector('.modal-overlay').cloneNode(true);
        const confirmBtn = document.getElementById('modalConfirm').cloneNode(true);
        const cancelBtn  = document.getElementById('modalCancel').cloneNode(true);

        modal.querySelector('.modal-overlay').replaceWith(overlay);
        document.getElementById('modalConfirm').replaceWith(confirmBtn);
        document.getElementById('modalCancel').replaceWith(cancelBtn);

        const close = () => { modal.style.display = 'none'; };

        confirmBtn.addEventListener('click', () => { close(); callback(true);  });
        cancelBtn.addEventListener('click',  () => { close(); callback(false); });
        overlay.addEventListener('click',    () => { close(); callback(false); });

        const onEsc = (e) => {
            if (e.key === 'Escape') {
                close();
                callback(false);
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
        confirmBtn.focus();
    }
};

// ============================================
// VALIDATOR
// ============================================
const Validator = {

    validateField(field) {
        const value = field.value.trim();
        let error = '';

        if (field.hasAttribute('required') && !value) {
            error = 'This field is required';
        }

        if (value && !error) {
            switch (field.name) {
                case 'fromCity':
                case 'toCity':
                    if (value.length < 2)
                        error = 'City name must be at least 2 characters';
                    else if (value.length > CONFIG.MAX_CITY_LENGTH)
                        error = `Max ${CONFIG.MAX_CITY_LENGTH} characters`;
                    break;

                case 'phoneNumber': {
                    const clean = value.replace(/[^0-9]/g, '');
                    if (clean.length < CONFIG.MIN_PHONE_LENGTH)
                        error = `Phone needs at least ${CONFIG.MIN_PHONE_LENGTH} digits`;
                    else if (clean.length > CONFIG.MAX_PHONE_LENGTH)
                        error = `Phone max ${CONFIG.MAX_PHONE_LENGTH} digits`;
                    break;
                }

                case 'pricePerSeat': {
                    const p = parseInt(value, 10);
                    if (isNaN(p) || p < 100)  error = 'Price must be at least ₦100';
                    else if (p > 1_000_000)   error = 'Price cannot exceed ₦1,000,000';
                    break;
                }

                case 'totalSeats': {
                    const s = parseInt(value, 10);
                    if (isNaN(s) || s < 1) error = 'At least 1 seat required';
                    else if (s > 20)       error = 'Maximum 20 seats';
                    break;
                }

                case 'tripDate': {
                    const sel = new Date(value);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const max = new Date(today);
                    max.setDate(max.getDate() + CONFIG.MAX_FUTURE_DAYS);

                    if (sel < today) error = 'Date cannot be in the past';
                    else if (sel > max) error = `Date too far ahead (max ${CONFIG.MAX_FUTURE_DAYS} days)`;
                    break;
                }
            }
        }

        this.showError(field, error);
        return !error;
    },

    showError(field, message) {
        const el = document.getElementById(`${field.id}Error`);
        if (el) el.textContent = message;
        field.classList.toggle('error', !!message);
        message
            ? field.setAttribute('aria-invalid', 'true')
            : field.removeAttribute('aria-invalid');
    },

    validateForm(form) {
        let valid = true;
        form.querySelectorAll('input[required]').forEach(f => {
            if (!this.validateField(f)) valid = false;
        });
        return valid;
    }
};

// ============================================
// UTILITIES
// ============================================
const Utils = {

    formatDate(str) {
        if (!str) return 'Invalid date';
        try {
            const [y, m, d] = str.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            if (isNaN(date.getTime())) return 'Invalid date';
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return 'Invalid date';
        }
    },

    formatPrice(price) {
        if (typeof price !== 'number') return '0';
        return price.toLocaleString('en-NG');
    },

    debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    getMaxDateString() {
        const d = new Date();
        d.setDate(d.getDate() + CONFIG.MAX_FUTURE_DAYS);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
};

// ============================================
// TRIP DISPLAY
// ============================================
const TripDisplay = {

    displayTrips(trips, isSearchResult = false) {
        const container = document.getElementById('tripsContainer');
        if (!container) return;

        const countEl = document.getElementById('resultsCount');
        if (countEl) {
            countEl.textContent = trips.length > 0
                ? `${trips.length} ${trips.length === 1 ? 'Trip' : 'Trips'}`
                : 'Available Trips';
            countEl.setAttribute('aria-live', 'polite');
        }

        // PERF: build off-DOM, then swap in one paint
        const frag = document.createDocumentFragment();

        if (trips.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = isSearchResult ? `
                <div class="empty-state-icon">
                    <svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </div>
                <p class="empty-state-title">No trips match your search</p>
                <p class="empty-state-description">Try different cities or dates</p>
            ` : `
                <div class="empty-state-icon">
                    <svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>
                </div>
                <p class="empty-state-title">No trips available</p>
                <p class="empty-state-description">Be the first to post a trip!</p>
            `;
            frag.appendChild(empty);
        } else {
            trips.forEach(trip => frag.appendChild(this.createTripCard(trip)));
        }

        container.innerHTML = '';
        container.appendChild(frag);
    },

    createTripCard(trip) {
        const card = document.createElement('div');
        card.className = 'trip-card';
        card.dataset.tripId = trip.id;
        card.setAttribute('role', 'listitem');

        const safeFrom  = Sanitizer.sanitizeText(trip.fromCity);
        const safeTo    = Sanitizer.sanitizeText(trip.toCity);
        const seatsText = trip.totalSeats === 1 ? '1 seat' : `${trip.totalSeats} seats`;
        const masked    = Sanitizer.maskPhone(trip.phoneNumber);

        card.innerHTML = `
            <div class="trip-route">
                <svg class="trip-route-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <div class="trip-route-text">
                    <span class="trip-city">${safeFrom}</span>
                    <span class="trip-arrow">→</span>
                    <span class="trip-city">${safeTo}</span>
                </div>
            </div>

            <div class="trip-meta">
                <div class="trip-meta-item">
                    <svg class="trip-meta-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>${Utils.formatDate(trip.date)}</span>
                </div>
                <div class="trip-meta-item">
                    <svg class="trip-meta-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span>${Sanitizer.sanitizeText(trip.time)}</span>
                </div>
            </div>

            <div class="trip-tags">
                <div class="trip-tag">
                    <svg class="trip-tag-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    <span>${masked}</span>
                </div>
            </div>

            <div class="trip-footer">
                <div class="trip-info">
                    <div class="trip-seats">${seatsText}</div>
                    <div class="trip-price">₦${Utils.formatPrice(trip.pricePerSeat)}</div>
                </div>
                <div class="trip-actions">
                    <button class="btn btn-primary btn-sm" data-action="call"
                        aria-label="Call driver — ${safeFrom} to ${safeTo}">
                        <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        Call
                    </button>
                    <button class="btn btn-success btn-sm" data-action="whatsapp"
                        aria-label="WhatsApp driver — ${safeFrom} to ${safeTo}">
                        <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Chat
                    </button>
                </div>
            </div>

            <button class="btn btn-danger btn-sm btn-block mt-2" data-action="delete"
                aria-label="Delete trip from ${safeFrom} to ${safeTo}">
                <svg class="btn-icon icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete Trip
            </button>
        `;

        return card;
    }
};

// ============================================
// SEARCH MANAGER
// ============================================
const SearchManager = {

    filterTrips(filters) {
        return AppState.getTrips().filter(trip => {
            if (filters.fromCity &&
                !trip.fromCity.toLowerCase().includes(filters.fromCity.toLowerCase()))
                return false;
            if (filters.toCity &&
                !trip.toCity.toLowerCase().includes(filters.toCity.toLowerCase()))
                return false;
            if (filters.date && trip.date !== filters.date)
                return false;
            return true;
        });
    },

    handleSearch: Utils.debounce(function () {
        const filters = {
            fromCity: document.getElementById('searchFrom')?.value.trim() || '',
            toCity:   document.getElementById('searchTo')?.value.trim()   || '',
            date:     document.getElementById('searchDate')?.value         || ''
        };

        const hasFilters = Object.values(filters).some(Boolean);
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = hasFilters ? 'inline-block' : 'none';

        AppState.currentSearchFilters = filters;
        TripDisplay.displayTrips(SearchManager.filterTrips(filters), hasFilters);
    }, CONFIG.DEBOUNCE_DELAY),

    clearSearch() {
        ['searchFrom', 'searchTo', 'searchDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const clearBtn = document.getElementById('clearSearchBtn');
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
        const phone = Sanitizer.sanitizePhone(trip.phoneNumber);
        // fromCity/toCity already sanitized when stored; encodeURIComponent handles the rest
        const msg = encodeURIComponent(
            `Hi! I'm interested in your trip from ${trip.fromCity} to ${trip.toCity} on ${Utils.formatDate(trip.date)}. Is it still available?`
        );
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
    },

    makeCall(trip) {
        window.location.href = `tel:${Sanitizer.sanitizePhone(trip.phoneNumber)}`;
    },

    deleteTrip(tripId) {
        UIManager.showDeleteModal(async (confirmed) => {
            if (!confirmed) return;
            try {
                const trip = AppState.getTrips().find(t => t.id === tripId);
                await AppState.deleteTrip(tripId, trip?.supabaseId);

                const hasFilters = Object.values(AppState.currentSearchFilters).some(Boolean);
                TripDisplay.displayTrips(
                    hasFilters
                        ? SearchManager.filterTrips(AppState.currentSearchFilters)
                        : AppState.getTrips(),
                    hasFilters
                );

                UIManager.showToast('Trip deleted', 'success');
            } catch (err) {
                console.error('Delete error:', err);
                UIManager.showToast('Failed to delete trip', 'error');
            }
        });
    }
};

// ============================================
// FORM HANDLER
// ============================================
const FormHandler = {

    async handleSubmit(e) {
        e.preventDefault();
        const form      = e.target;
        const submitBtn = document.getElementById('submitBtn');

        if (!Validator.validateForm(form)) {
            UIManager.showToast('Please fix the errors above', 'error');
            return;
        }

        UIManager.setButtonLoading(submitBtn, true);
        form.setAttribute('aria-busy', 'true');

        try {
            const now = Date.now();
            const trip = {
                id:        now,
                timestamp: now,   // FIX: was missing, causing undefined in DB insert
                fromCity:     Sanitizer.validateAndSanitize(document.getElementById('fromCity').value, 'text'),
                toCity:       Sanitizer.validateAndSanitize(document.getElementById('toCity').value, 'text'),
                date:         document.getElementById('tripDate').value,
                time:         document.getElementById('tripTime').value,
                pricePerSeat: Sanitizer.validateAndSanitize(document.getElementById('pricePerSeat').value, 'number'),
                totalSeats:   Sanitizer.validateAndSanitize(document.getElementById('totalSeats').value, 'number'),
                phoneNumber:  Sanitizer.validateAndSanitize(document.getElementById('phoneNumber').value, 'phone')
            };

            await AppState.addTrip(trip);
            UIManager.showToast('Trip posted! 🎉', 'success');

            form.reset();
            form.querySelectorAll('.error-message').forEach(el => { el.textContent = ''; });
            form.querySelectorAll('input').forEach(inp => {
                inp.classList.remove('error');
                inp.removeAttribute('aria-invalid');
            });

            TripDisplay.displayTrips(AppState.getTrips(), false);

        } catch (err) {
            console.error('Submit error:', err);
            UIManager.showToast(err.message || 'Failed to post trip', 'error');
        } finally {
            UIManager.setButtonLoading(submitBtn, false);
            form.setAttribute('aria-busy', 'false');
        }
    }
};

// ============================================
// EVENT MANAGER
// ============================================
const EventManager = {

    init() {
        // Post-trip form
        const tripForm = document.getElementById('tripForm');
        if (tripForm) {
            tripForm.addEventListener('submit', e => FormHandler.handleSubmit(e));
            tripForm.addEventListener('blur', e => {
                if (e.target.tagName === 'INPUT') Validator.validateField(e.target);
            }, true);
            tripForm.addEventListener('paste', e => {
                setTimeout(() => {
                    if (e.target.tagName === 'INPUT') Validator.validateField(e.target);
                }, 0);
            }, true);
        }

        // FIX: search inputs attached unconditionally — #searchBtn does not exist in the HTML
        ['searchFrom', 'searchTo', 'searchDate'].forEach(id => {
            document.getElementById(id)
                ?.addEventListener('input', () => SearchManager.handleSearch());
        });

        document.getElementById('clearSearchBtn')
            ?.addEventListener('click', () => SearchManager.clearSearch());

        // Trip card actions via event delegation
        document.getElementById('tripsContainer')
            ?.addEventListener('click', e => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const card   = btn.closest('.trip-card');
                if (!card) return;

                const tripId = parseInt(card.dataset.tripId, 10);
                const trip   = AppState.getTrips().find(t => t.id === tripId);
                if (!trip) return;

                switch (btn.dataset.action) {
                    case 'whatsapp': TripActions.openWhatsApp(trip);  break;
                    case 'call':     TripActions.makeCall(trip);      break;
                    case 'delete':   TripActions.deleteTrip(tripId);  break;
                }
            });
    }
};

// ============================================
// APP INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        UIManager.init();

        // Show spinner immediately on the find-ride page
        if (document.getElementById('tripsContainer')) {
            UIManager.showLoadingState();
        }

        // FIX: was checking undefined FIREBASE_ENABLED
        if (SUPABASE_ENABLED) {
            UIManager.showToast('Connecting to cloud…', 'info');
        }

        await AppState.init();

        const tripDateInput = document.getElementById('tripDate');
        if (tripDateInput) {
            tripDateInput.min = Utils.getTodayString();
            tripDateInput.max = Utils.getMaxDateString();
        }

        if (document.getElementById('tripsContainer')) {
            TripDisplay.displayTrips(AppState.getTrips(), false);

            if (SUPABASE_ENABLED && SupabaseDB.isInitialized) {
                UIManager.showToast('✅ Live sync active', 'success');
            }
        }

        EventManager.init();
        console.log('✅ 234Mile ready');

    } catch (err) {
        console.error('Init error:', err);
        UIManager.showToast('Error loading app. Please refresh.', 'error');
    }
});

// ============================================
// GLOBAL ERROR HANDLERS
// ============================================
window.addEventListener('error',             () => UIManager.showToast('An unexpected error occurred', 'error'));
window.addEventListener('unhandledrejection',() => UIManager.showToast('An unexpected error occurred', 'error'));
window.addEventListener('beforeunload',      () => SupabaseDB.disconnect());
