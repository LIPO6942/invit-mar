'use strict';

/* ═══════════════════════════════════════════════════════════════════
   WEDDING INVITATION — app.js
   ─────────────────────────────────────────────────────────────────
   Modules:
   0. Firebase Init + URL Config Loader  ← reads ?inv= / ?b= / ?c=
   1. Envelope Open
   2. Intro Petals
   3. Heart Analog Clock
   4. Countdown Section Petals
   5. Countdown Timer
   6. Timeline Reveal (Intersection Observer)
   7. Leaflet Map Modal
   8. Audio Ambiance (Web Audio API)
═══════════════════════════════════════════════════════════════════ */

let _weddingDateTime = '2026-07-12T15:30:00';
let _currentRole = null; // 'groom' | 'bride' or null
let _roleWishes = [];
let _resolvedGuestName = null;
let _resolvedGuestType = null;

// Weather forecast params — updated from cfg when config loads
let _weatherLat = 35.6327;   // Teboulba default
let _weatherLon = 10.9418;
let _weatherDate = null;      // will be set from cfg.wd (YYYY-MM-DD)
let _weatherLocation = null;  // city name from first event

/* ──────────────────────────────────────────────
   Firebase config (shared with admin.html)
──────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDiX0BwIT9wQKnlNHk0ADLgtI5eOUwF-1E",
  authDomain:        "invit-mar.firebaseapp.com",
  projectId:         "invit-mar",
  storageBucket:     "invit-mar.firebasestorage.app",
  messagingSenderId: "654872438284",
  appId:             "1:654872438284:web:c11d6f3cdff82bf35ff029"
};

let _fbApp = null, _db = null;
function initFirebase() {
  if (_fbApp) return;
  _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  _db    = firebase.firestore();
}

/* ────────────────────────────────────────────────
   0. URL CONFIG LOADER
   Priority: ?inv= (Firebase slug) → ?b= (JSONBlob) → ?c= (base64)
──────────────────────────────────────────────── */

function fromB64(str) {
  return decodeURIComponent(
    Array.from(atob(str), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  );
}

function applyConfigToDOM(cfg) {
  const isFr = cfg.la === 'fr';

  const groomDisplay = isFr ? (cfg.gf2 || cfg.ga) : cfg.ga;
  const brideDisplay = isFr ? (cfg.bf2 || cfg.ba) : cfg.ba;

  const MAP = {
    groomAr:          groomDisplay,
    brideAr:          brideDisplay,
    groomNameDisplay: groomDisplay,  // shown in the big animated names + envelope banner
    brideNameDisplay: brideDisplay,
    groomFather: cfg.gf,
    groomMother: cfg.gm,
    brideFather: cfg.bf,
    brideMother: cfg.bm,
  };
  Object.entries(MAP).forEach(([key, val]) => {
    if (!val) return;
    document.querySelectorAll(`[data-cfg="${key}"]`).forEach(el => {
      el.textContent = val;
    });
  });

  // Apply language translations
  applyLanguage(cfg.la || 'ar');

  // Set page title dynamically
  if (groomDisplay && brideDisplay) {
    document.title = isFr ? `Mariage de ${groomDisplay} & ${brideDisplay}` : `حفل زفاف ${groomDisplay} و ${brideDisplay}`;
  }

  // Initialize Photo Stack Widget
  if (typeof initPhotoStack === 'function') {
    initPhotoStack(cfg);
  }
}

function checkRoleView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'groom' || view === 'bride') {
    _currentRole = view;

    // Show the private mailbox button
    const mbToggle = document.getElementById('mailbox-toggle');
    if (mbToggle) mbToggle.style.display = 'flex';

    // Hide the guestbook — the couple cannot send wishes to themselves
    const gbSection = document.getElementById('guestbook-section');
    if (gbSection) gbSection.style.display = 'none';

    // Show the dedicated bride/groom inscription on the envelope
    const roleLabel = document.getElementById('role-inscription-banner');
    if (roleLabel) roleLabel.style.display = 'flex';
    // Text will be set after language is applied in applyLanguage()
    window._pendingRoleView = view;
  }
}

function processWishesForRole(dataWishes) {
  if (dataWishes && Array.isArray(dataWishes)) {
    const wishes = [...dataWishes];
    wishes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (_currentRole === 'groom') {
      _roleWishes = wishes.filter(w => w.target === 'groom' || w.target === 'both' || !w.target);
    } else if (_currentRole === 'bride') {
      _roleWishes = wishes.filter(w => w.target === 'bride' || w.target === 'both' || !w.target);
    }
    
    const badge = document.getElementById('mailbox-badge');
    if (badge) {
      badge.textContent = _roleWishes.length;
    }
  }
}

function loadConfigFromURL() {
  checkRoleView();
  const params  = new URLSearchParams(window.location.search);
  const invSlug = params.get('inv');   // Firebase personalized slug
  const blobId  = params.get('b');     // JSONBlob ID (legacy)
  let   encoded = params.get('c');     // base64 (legacy)

  if (invSlug) {
    /* ── Firebase path ── */
    initFirebase();
    watchRsvpCounter();
    _db.collection('invitations').doc(invSlug).get()
      .then(doc => {
        if (!doc.exists) {
          console.warn('[InvitApp] Invitation not found:', invSlug);
          return;
        }
        const data     = doc.data();
        const cfg      = data.config;
        const count    = data.count || 0;
        const pack     = data.pack  || 9999;

        /* Guest links (with ?guest= or ?gid=) get unlimited views — no pack check, no count increment */
        const hasGuestLink = !!(params.get('guest') || params.get('gid'));
        // Removed: pack limits the number of added guests, not public view clicks

        /* Process wishes for Groom/Bride private inbox */
        processWishesForRole(data.wishes);

        /* Apply config */
        if (cfg.wd) _weddingDateTime = cfg.wd;
        applyConfigToDOM(cfg);
        applyMusicFromConfig(cfg);
        if (cfg.ev && cfg.ev.length) rebuildTimelineFromConfig(cfg.ev);
        extractWeatherParamsFromConfig(cfg);
        loadWeatherForecast();
        
        // Apply theme color
        if (cfg.th && cfg.th !== 'gold') {
          document.body.classList.add('theme-' + cfg.th);
        }
        
        // Apply saved Day/Night mode preference
        const savedMode = localStorage.getItem('invitThemeMode');
        if (savedMode === 'night') {
          document.body.classList.add('night-mode');
        } else {
          document.body.classList.remove('night-mode');
        }

        applyEnvelopeDesign(cfg);

        /* Atomic counter increment — only for generic (non-guest-specific) links */
        if (!hasGuestLink) {
          _db.collection('invitations').doc(invSlug).update({
            count: firebase.firestore.FieldValue.increment(1)
          }).catch(e => console.warn('[InvitApp] Counter increment failed:', e));
        }
      })
      .catch(err => console.warn('[InvitApp] Firebase fetch failed:', err));

  } else if (blobId) {
    /* ── JSONBlob fallback ── */
    fetch(`https://jsonblob.com/api/jsonBlob/${blobId}`, { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : Promise.reject('blob 404'))
      .then(data => {
        const cfg   = data.config;
        const count = (data.count || 0) + 1;
        const pack  = data.pack || cfg.ps || 9999;
        // Removed count > pack check

        /* Process wishes for Groom/Bride private inbox */
        processWishesForRole(data.wishes);

        if (cfg.wd) _weddingDateTime = cfg.wd;
        applyConfigToDOM(cfg);
        if (cfg.ev && cfg.ev.length) rebuildTimelineFromConfig(cfg.ev);
        extractWeatherParamsFromConfig(cfg);
        loadWeatherForecast();

        if (cfg.th && cfg.th !== 'gold') document.body.classList.add('theme-' + cfg.th);
        applyEnvelopeDesign(cfg);
        fetch(`https://jsonblob.com/api/jsonBlob/${blobId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, count })
        }).catch(() => {});
      })
      .catch(e => console.warn('[InvitApp] JSONBlob fetch failed:', e));

  } else if (encoded) {
    /* ── Base64 fallback ── */
    encoded = encoded.replace(/ /g, '+');
    let cfg;
    try { cfg = JSON.parse(fromB64(encoded)); }
    catch (e) { console.warn('[InvitApp] base64 decode failed:', e); return; }
    if (cfg.wd) _weddingDateTime = cfg.wd;
    applyConfigToDOM(cfg);
    if (cfg.ev && cfg.ev.length) rebuildTimelineFromConfig(cfg.ev);
    extractWeatherParamsFromConfig(cfg);
    loadWeatherForecast();

    if (cfg.th && cfg.th !== 'gold') document.body.classList.add('theme-' + cfg.th);
    applyEnvelopeDesign(cfg);
    // Removed count-api check

  } else {
    // ── localStorage fallback (local testing) ──
    const raw = localStorage.getItem('weddingAdminConfig');
    if (raw) {
      try {
        const cfg = JSON.parse(raw);
        if (cfg.wd) _weddingDateTime = cfg.wd;
        applyConfigToDOM(cfg);
        if (cfg.ev && cfg.ev.length) rebuildTimelineFromConfig(cfg.ev);
        extractWeatherParamsFromConfig(cfg);
        loadWeatherForecast();

        
        // Apply theme color
        if (cfg.th && cfg.th !== 'gold') {
          document.body.classList.add('theme-' + cfg.th);
        }
        applyEnvelopeDesign(cfg);
      } catch (e) {}
    }
  }
}


/**
 * Rebuilds the #timeline div from the ev[] array in config.
 */
function getTimelineIcon(eventName) {
  const name = (eventName || '').toLowerCase();
  
  if (name.includes('عقد') || name.includes('💍') || name.includes('mariage') || name.includes('alliance') || name.includes('signature') || name.includes('ceremony')) {
    return `<svg class="timeline-custom-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="26" cy="38" r="14" />
      <circle cx="42" cy="28" r="14" />
      <path d="M42,10 C41,8 39,8 38,9 C37,10 37,12 39,14 L42,17 L45,14 C47,12 47,10 46,9 C45,8 43,8 42,10 Z" fill="#2c2c2c" stroke="#2c2c2c" stroke-width="1" />
    </svg>`;
  }
  
  if (name.includes('استقبال') || name.includes('ضيوف') || name.includes('reception') || name.includes('cocktail') || name.includes('سهرة') || name.includes('party') || name.includes('🏡') || name.includes('dinner') || name.includes('عشاء') || name.includes('مأدبة')) {
    return `<svg class="timeline-custom-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16,14 L48,14 L32,38 Z" />
      <line x1="32" y1="38" x2="32" y2="54" />
      <line x1="20" y1="54" x2="44" y2="54" />
      <circle cx="48" cy="14" r="6" fill="none" />
      <line x1="48" y1="8" x2="48" y2="20" />
      <line x1="42" y1="14" x2="54" y2="14" />
      <line x1="21" y1="22" x2="43" y2="22" />
    </svg>`;
  }
  
  if (name.includes('تصوير') || name.includes('جلسة') || name.includes('photo') || name.includes('camera') || name.includes('📷')) {
    return `<svg class="timeline-custom-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="20" width="44" height="30" rx="4" />
      <path d="M22,20 L24,14 L40,14 L42,20" />
      <circle cx="48" cy="26" r="2" fill="currentColor" />
      <circle cx="32" cy="35" r="10" />
      <circle cx="32" cy="35" r="5" />
    </svg>`;
  }
  
  // Fallback calendar
  return `<svg class="timeline-custom-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="14" width="40" height="40" rx="4" />
    <line x1="12" y1="24" x2="52" y2="24" />
    <line x1="22" y1="10" x2="22" y2="18" />
    <line x1="42" y1="10" x2="42" y2="18" />
  </svg>`;
}

function formatTo24h(timeStr, ampmStr) {
  if (!timeStr) return '';
  const ampm = (ampmStr || '').trim().toUpperCase();
  if (ampm !== 'AM' && ampm !== 'PM') {
    return timeStr;
  }
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  if (isNaN(hours)) return timeStr;
  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  const hoursFormatted = hours.toString().padStart(2, '0');
  const minutesFormatted = minutes.toString().padStart(2, '0');
  return `${hoursFormatted}:${minutesFormatted}`;
}

/* ────────────────────────────────────────────────
   GOOGLE CALENDAR INTEGRATION
──────────────────────────────────────────────── */

function formatToGCalUTC(dateObj) {
  const pad = num => String(num).padStart(2, '0');
  const year = dateObj.getUTCFullYear();
  const month = pad(dateObj.getUTCMonth() + 1);
  const day = pad(dateObj.getUTCDate());
  const hours = pad(dateObj.getUTCHours());
  const minutes = pad(dateObj.getUTCMinutes());
  const seconds = pad(dateObj.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function _getGuestFormattedName(isFr) {
  if (typeof _resolvedGuestName === 'undefined' || !_resolvedGuestName) return null;
  const guestName = _resolvedGuestName;
  const guestType = (typeof _resolvedGuestType !== 'undefined' && _resolvedGuestType) ? _resolvedGuestType : 'ar_couple';
  
  if (isFr) {
    switch (guestType) {
      case 'fr_couple':          return `Monsieur & Madame ${guestName}`;
      case 'fr_man':             return `Monsieur ${guestName}`;
      case 'fr_woman':           return `Madame ${guestName}`;
      case 'fr_friend_m':        return `Cher Ami ${guestName}`;
      case 'fr_friend_f':        return `Chère Amie ${guestName}`;
      default:                   return guestName;
    }
  } else {
    switch (guestType) {
      case 'ar_couple':          return `السيد ${guestName} وحرمه`;
      case 'ar_couple_children': return `السيد ${guestName} وحرمه وأبنائه`;
      case 'ar_man':             return `السيد ${guestName}`;
      case 'ar_woman':           return `السيدة ${guestName}`;
      case 'ar_friend_m':        return `الصديق العزيز ${guestName}`;
      case 'ar_friend_f':        return `الصديقة العزيزة ${guestName}`;
      default:                   return guestName;
    }
  }
}

function buildGoogleCalendarUrl(title, dateRaw, timeRaw, location, details) {
  let startDate = new Date();
  
  if (dateRaw) {
    if (typeof dateRaw === 'string' && dateRaw.includes('/')) {
      const parts = dateRaw.split('/').map(p => p.trim());
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        startDate = new Date(y, m, d);
      }
    } else if (typeof dateRaw === 'string' && dateRaw.includes('-')) {
      startDate = new Date(dateRaw);
    }
  }

  if (timeRaw && typeof timeRaw === 'string' && !isNaN(startDate.getTime())) {
    const timeParts = timeRaw.split(':');
    if (timeParts.length >= 2) {
      const h = parseInt(timeParts[0], 10);
      const m = parseInt(timeParts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        startDate.setHours(h, m, 0, 0);
      }
    }
  }

  if (isNaN(startDate.getTime())) {
    startDate = new Date(_weddingDateTime || '2026-07-16T20:00:00');
  }

  const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

  const startUtc = formatToGCalUTC(startDate);
  const endUtc = formatToGCalUTC(endDate);

  const isFr = document.documentElement.lang === 'fr' || document.body.classList.contains('lang-fr');
  const guestSalutation = _getGuestFormattedName(isFr);

  let guestHeader = '';
  if (guestSalutation) {
    guestHeader = isFr
      ? `Bienvenue ${guestSalutation} ! 🌸\n`
      : `أهلاً وسهلاً بك ${guestSalutation} 🌸\n`;
  }

  const defaultDetails = isFr
    ? `${guestHeader}Nous avons l'honneur de vous inviter à notre célébration de mariage !\n\n` +
      `📌 Rappel : Veuillez enregistrer cet événement dans votre Google Calendar. Rappels conseillés : 24h avant et 1h avant l'événement.\n\n` +
      `Lien de votre invitation personnelle : ${window.location.href}`
    : `${guestHeader}يسرنا ويشرفنا دعوتكم لحضور حفلنا!\n\n` +
      `تذكير: يرجى حفظ المناسبة في Calendrier Google. تذكير مقترح: قبل يوم واحد (24 ساعة) وقبل ساعة واحدة من الموعد.\n\n` +
      `رابط دعوتك الخاصة: ${window.location.href}`;

  const finalDetails = details || defaultDetails;
  const finalLocation = location || _weatherLocation || (isFr ? 'Téboulba, Tunisie' : 'طبلبة، تونس');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || document.title || (isFr ? 'Célébration de Mariage' : 'حفل الزفاف'),
    dates: `${startUtc}/${endUtc}`,
    details: finalDetails,
    location: finalLocation,
    ctz: 'Africa/Tunis'
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function openMainGoogleCalendar() {
  const isFr = document.documentElement.lang === 'fr' || document.body.classList.contains('lang-fr');
  const brideEl = document.querySelector('[data-cfg="brideNameDisplay"]');
  const groomEl = document.querySelector('[data-cfg="groomNameDisplay"]');
  const brideName = brideEl ? brideEl.textContent.trim() : '';
  const groomName = groomEl ? groomEl.textContent.trim() : '';
  const guestSalutation = _getGuestFormattedName(isFr);

  let title = '';
  if (isFr) {
    title = (groomName && brideName) ? `Mariage de ${groomName} & ${brideName} 💍` : 'Célébration de Mariage 💍';
    if (guestSalutation) title += ` (Pour ${guestSalutation})`;
  } else {
    title = (groomName && brideName) ? `حفل زفاف ${groomName} و ${brideName} 💍` : 'حفل الزفاف 💍';
    if (guestSalutation) title += ` (خاصة بـ ${guestSalutation})`;
  }

  const location = _weatherLocation || (isFr ? 'Téboulba, Tunisie' : 'طبلبة، تونس');
  const url = buildGoogleCalendarUrl(title, _weddingDateTime, null, location, null);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openEventGoogleCalendar(btn) {
  const isFr = document.documentElement.lang === 'fr' || document.body.classList.contains('lang-fr');
  const item = btn.closest('.timeline-item');
  if (!item) return;

  const titleEl = item.querySelector('.tl-event');
  const dateEl = item.querySelector('.tl-date');
  const timeEl = item.querySelector('.tl-time');
  
  const eventTitle = titleEl ? titleEl.textContent.trim() : (isFr ? 'Célébration' : 'حفل الزفاف');
  const eventDate = dateEl ? dateEl.textContent.trim() : null;
  const eventTime = timeEl ? timeEl.textContent.trim() : null;
  const eventLocation = item.getAttribute('data-location') || (isFr ? 'Tunisie' : 'تونس');

  const brideEl = document.querySelector('[data-cfg="brideNameDisplay"]');
  const groomEl = document.querySelector('[data-cfg="groomNameDisplay"]');
  const brideName = brideEl ? brideEl.textContent.trim() : '';
  const groomName = groomEl ? groomEl.textContent.trim() : '';
  const guestSalutation = _getGuestFormattedName(isFr);

  let fullTitle = isFr
    ? `${eventTitle} - Mariage ${groomName} & ${brideName}`.trim()
    : `${eventTitle} - ${groomName} & ${brideName}`.trim();

  if (guestSalutation) {
    fullTitle += isFr ? ` (${guestSalutation})` : ` (${guestSalutation})`;
  }

  let guestHeader = '';
  if (guestSalutation) {
    guestHeader = isFr
      ? `Bienvenue ${guestSalutation} ! 🌸\n`
      : `أهلاً وسهلاً بك ${guestSalutation} 🌸\n`;
  }

  const details = isFr
    ? `${guestHeader}Invitation pour la cérémonie : ${eventTitle}.\n\n` +
      `📌 Rappel : N'oubliez pas d'enregistrer l'événement dans votre Google Calendar. Notification de rappel conseillée : 1 jour avant et 1 heure avant l'événement.\n\n` +
      `Lieu : ${eventLocation}\n` +
      `Lien de votre invitation personnelle : ${window.location.href}`
    : `${guestHeader}دعوة لحضور ${eventTitle}.\n\n` +
      `تذكير: يرجى حفظ المناسبة في Calendrier Google. تذكير مقترح: قبل يوم واحد (24 ساعة) وقبل ساعة واحدة من الموعد.\n\n` +
      `المكان: ${eventLocation}\n` +
      `رابط دعوتك الخاصة: ${window.location.href}`;

  const url = buildGoogleCalendarUrl(fullTitle, eventDate, eventTime, eventLocation, details);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function rebuildTimelineFromConfig(events) {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;
  const isFr = document.body.classList.contains('lang-fr');
  const pinLabel = isFr ? 'Localisation' : 'الموقع';
  const pinIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const calIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>`;
  timeline.innerHTML = events.map((ev, i) => {
    const isEven  = i % 2 === 0;
    const evName  = (isFr && ev.nf) ? ev.nf : (ev.n || '');
    const iconHTML = getTimelineIcon(ev.n);
    const infoHTML = `
      <span class="tl-date">${ev.d||''}</span>
      <div class="tl-event font-amiri">${evName}</div>
      <div class="tl-location">${ev.l||''}</div>
      <div class="tl-time">${formatTo24h(ev.t, ev.a)}</div>
      <div class="tl-actions">
        <button class="tl-location-btn" onclick="openMap(this)">${pinIcon}<span>${pinLabel}</span></button>
        <button class="tl-calendar-btn" onclick="openEventGoogleCalendar(this)" title="إضافة للتقويم" aria-label="حفظ في التقويم">${calIcon}</button>
      </div>`;
    return `
      <div class="timeline-item"
           data-location="${ev.l||''}"
           data-lat="${ev.la||''}"
           data-lng="${ev.lo||""}">
        <div class="tl-left-cell">${isEven ? infoHTML : iconHTML}</div>
        <div class="tl-dot-wrapper"><div class="tl-dot"></div></div>
        <div class="tl-right-cell">${isEven ? iconHTML : infoHTML}</div>
      </div>`;
  }).join('');
  initTimelineReveal();
}

/**
 * Pack expiry: hit CountAPI, show expired overlay if over limit.
 */
function checkAndIncrementPack(linkId, packSize) {
  fetch(`https://api.countapi.xyz/hit/wedding-inv-2026/link-${linkId}`)
    .then(r => r.json())
    .then(data => { if ((data.value || 0) > packSize) showPackExpired(); })
    .catch(() => {}); // fail-open
}

function showPackExpired() {
  const overlay = document.getElementById('pack-expired-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

/* ────────────────────────────────────────────────
   1. ENVELOPE OPEN
──────────────────────────────────────────────── */
function startWeddingMusic() {
  const audio = document.getElementById('wedding-audio');
  const btn = document.getElementById('music-toggle');
  if (!audio) return;
  
  audio.volume = 0.4;
  audio.play().then(() => {
    if (btn) btn.classList.remove('paused');
  }).catch(err => {
    console.warn("Audio autoplay blocked or failed. User needs to toggle manually.", err);
    if (btn) btn.classList.add('paused');
  });
}

window.toggleMusic = function() {
  const audio = document.getElementById('wedding-audio');
  const btn = document.getElementById('music-toggle');
  if (!audio || !btn) return;
  
  if (audio.paused) {
    audio.play().then(() => {
      btn.classList.remove('paused');
    }).catch(e => {
      console.warn("Failed to play audio:", e);
    });
  } else {
    audio.pause();
    btn.classList.add('paused');
  }
};

window.openEnvelopeNow = function() {
  const inv = document.getElementById('invitation');
  if (!inv || inv.classList.contains('open')) return;

  // 1. Start the panel slide immediately (2.4s theatrical animation)
  document.body.classList.add('env-open');

  // 2. Delay revealing the content until panels are well into opening
  //    (~1.3s in: panels are ~54% open, no blank white space visible)
  setTimeout(() => {
    inv.classList.add('open');
  }, 1300);

  // Play the actual wedding march MP3 song
  startWeddingMusic();

  setTimeout(() => {
    spawnPetals();
    startHeartClock();
  }, 900);
};

// Secret admin shortcut: triple-tap the closing section to go to admin
(function secretAdminTap() {
  let tapCount = 0, tapTimer = null;
  document.addEventListener('click', e => {
    const closing = document.getElementById('closing-section');
    if (closing && closing.contains(e.target)) {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 1800);
      if (tapCount >= 5) {
        window.location.href = 'admin.html';
      }
    }
  });
})();

/* ────────────────────────────────────────────────
   2. INTRO PETALS (Hero section)
──────────────────────────────────────────────── */
function spawnPetals() {
  const layer = document.getElementById('petals');
  if (!layer) return;
  const colors = [
    '#e8cc7a','#f5e6c0','#c9a84c',
    '#fff8d0','#d4a960','#f5dca0',
    '#faf0d0','#dbb86a'
  ];
  for (let i = 0; i < 22; i++) {
    const p    = document.createElement('div');
    p.className = 'petal';
    const size  = Math.random() * 8 + 5;
    const r1    = Math.floor(Math.random() * 40 + 30);
    const r2    = Math.floor(Math.random() * 40 + 30);
    p.style.cssText = [
      `width:${size}px`,
      `height:${size * 1.5}px`,
      `left:${Math.random() * 100}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-duration:${Math.random() * 8 + 7}s`,
      `animation-delay:${Math.random() * 12}s`,
      `border-radius:${r1}% 0 ${r2}% 0`,
    ].join(';');
    layer.appendChild(p);
  }
}

/* ────────────────────────────────────────────────
   3. HEART ANALOG CLOCK
──────────────────────────────────────────────── */
function startHeartClock() {
  const cx = 130, cy = 122, r = 64;
  const tickG = document.getElementById('hcTicks');
  const dotG  = document.getElementById('hcDots');
  if (!tickG || !dotG) return;

  // Build 60 tick marks
  for (let i = 0; i < 60; i++) {
    const ang    = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const isHour = i % 5 === 0;
    const r1     = isHour ? r - 11 : r - 6;
    const x1 = cx + r * Math.cos(ang),  y1 = cy + r * Math.sin(ang);
    const x2 = cx + r1 * Math.cos(ang), y2 = cy + r1 * Math.sin(ang);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', x1.toFixed(2)); ln.setAttribute('y1', y1.toFixed(2));
    ln.setAttribute('x2', x2.toFixed(2)); ln.setAttribute('y2', y2.toFixed(2));
    ln.setAttribute('stroke-width', isHour ? '2.2' : '1');
    ln.setAttribute('opacity',      isHour ? '1'   : '0.4');
    tickG.appendChild(ln);
  }

  // Build 12 hour dots
  for (let j = 0; j < 12; j++) {
    const ang = (j / 12) * 2 * Math.PI - Math.PI / 2;
    const rd  = r - 20;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', (cx + rd * Math.cos(ang)).toFixed(2));
    dot.setAttribute('cy', (cy + rd * Math.sin(ang)).toFixed(2));
    dot.setAttribute('r',  '2.8');
    dot.setAttribute('fill', '#c9a84c');
    dotG.appendChild(dot);
  }

  function rotateHand(id, deg) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('transform', `rotate(${deg} ${cx} ${cy})`);
  }

  function setLive() {
    const now = new Date();
    const ms  = now.getMilliseconds();
    const s   = now.getSeconds()  + ms / 1000;
    const m   = now.getMinutes()  + s  / 60;
    const h   = (now.getHours() % 12) + m / 60;
    rotateHand('hcSHand', s * 6);
    rotateHand('hcMHand', m * 6);
    rotateHand('hcHHand', h * 30);
  }

  // Smooth entry sweep
  const now = new Date();
  const ms  = now.getMilliseconds();
  const s   = now.getSeconds()  + ms / 1000;
  const m   = now.getMinutes()  + s  / 60;
  const h   = (now.getHours() % 12) + m / 60;
  const tS  = s * 6, tM = m * 6, tH = h * 30;
  const dur = 1800, t0 = performance.now();

  (function sweep(ts) {
    const progress = Math.min((ts - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    rotateHand('hcSHand', ease * tS);
    rotateHand('hcMHand', ease * tM);
    rotateHand('hcHHand', ease * tH);
    if (progress < 1) requestAnimationFrame(sweep);
    else setInterval(setLive, 50);
  })(t0);

  // Trigger on scroll into view (for when envelope was already open)
  const sec = document.getElementById('countdown-section');
  if (sec) {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) startHeartClock._started || (startHeartClock._started = true);
    }, { threshold: 0.3 }).observe(sec);
  }
}
startHeartClock._started = false;

/* ────────────────────────────────────────────────
   4. COUNTDOWN SECTION PETALS
──────────────────────────────────────────────── */
(function spawnCountdownPetals() {
  const container = document.getElementById('cdPetals');
  const section   = document.getElementById('countdown-section');
  if (!container || !section) return;
  const colors  = ['#c9a84c','#e8cc7a','#f5e6c0','#d4a96a','#fff8ee','#b8973a'];
  let   spawned = false;

  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !spawned) {
      spawned = true;
      for (let i = 0; i < 26; i++) {
        const p  = document.createElement('div');
        p.className = 'cd-petal';
        const sz = 6 + Math.random() * 9;
        const r1 = Math.floor(Math.random() * 30 + 40);
        const r2 = Math.floor(Math.random() * 30 + 40);
        p.style.cssText = [
          `width:${sz}px`,
          `height:${sz * 1.5}px`,
          `left:${Math.random() * 100}%`,
          `top:-5%`,
          `background:${colors[Math.floor(Math.random() * colors.length)]}`,
          `animation-duration:${6 + Math.random() * 8}s`,
          `animation-delay:${Math.random() * 8}s`,
          `border-radius:${r1}% 0 ${r2}% 0`,
        ].join(';');
        container.appendChild(p);
      }
    }
  }, { threshold: 0.1 }).observe(section);
})();

/* ────────────────────────────────────────────────
   5. COUNTDOWN TIMER — Slot Machine
   Uses _weddingDateTime (overridden by URL config)
──────────────────────────────────────────────── */
(function initCountdown() {
  function getTargetDate() { return new Date(_weddingDateTime); }
  function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

  const slots = {
    d: document.getElementById('cd-days'),
    h: document.getElementById('cd-hours'),
    m: document.getElementById('cd-mins'),
    s: document.getElementById('cd-secs'),
  };
  const prev = { d: null, h: null, m: null, s: null };

  /**
   * Slot-machine animation: number glides up & blurs out,
   * then snaps to bottom and glides smoothly back to center.
   * The text is swapped while the element is invisible (middle of keyframe).
   */
  function slotUpdate(el, newStr) {
    if (!el || el.textContent === newStr) return;
    // Swap text at the invisible midpoint (38% through the 0.52s animation = ~197ms)
    setTimeout(() => { el.textContent = newStr; }, 200);
    el.classList.remove('ticking');
    void el.offsetWidth; // force reflow to restart
    el.classList.add('ticking');
    el.addEventListener('animationend', () => el.classList.remove('ticking'), { once: true });
  }

  function tick() {
    const diff = Math.max(0, getTargetDate().getTime() - Date.now());
    const vals = {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000)  / 60000),
      s: Math.floor((diff % 60000)    / 1000),
    };
    Object.keys(slots).forEach(k => {
      const str = pad(vals[k]);
      if (prev[k] !== str) {
        slotUpdate(slots[k], str);
        prev[k] = str;
      }
    });
  }

  // Init: display immediately without animation
  (function initDisplay() {
    const diff = Math.max(0, getTargetDate().getTime() - Date.now());
    const vals = {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000)  / 60000),
      s: Math.floor((diff % 60000)    / 1000),
    };
    Object.keys(slots).forEach(k => {
      const str = pad(vals[k]);
      if (slots[k]) slots[k].textContent = str;
      prev[k] = str;
    });
  })();

  setInterval(tick, 1000);
})();

/* ────────────────────────────────────────────────
   5b. CLOCK TICKING SOUND (Web Audio API)
   Plays a soft mechanical tick every second only when the
   countdown section is visible. Runs independently of the
   background wedding music (separate AudioContext).
──────────────────────────────────────────────── */
(function initClockTick() {
  const section = document.getElementById('countdown-section');
  if (!section) return;

  let tickCtx    = null; // AudioContext created on first user gesture
  let tickTimer  = null; // setInterval handle
  let isVisible  = false;

  /** Synthesize a short mechanical click using Web Audio API */
  function playTick() {
    if (!tickCtx) return;
    try {
      // Brief band-pass filtered noise burst = clock tick
      const bufSize = tickCtx.sampleRate * 0.025; // 25ms
      const buffer  = tickCtx.createBuffer(1, bufSize, tickCtx.sampleRate);
      const data    = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        // White noise, decaying exponentially
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 6);
      }

      const source  = tickCtx.createBufferSource();
      source.buffer = buffer;

      // Band-pass filter: 1800Hz center → crisp mechanical click
      const bpf = tickCtx.createBiquadFilter();
      bpf.type            = 'bandpass';
      bpf.frequency.value = 1800;
      bpf.Q.value         = 0.9;

      // Gain: subtle — won't overpower the music
      const gainNode = tickCtx.createGain();
      gainNode.gain.value = 0.18;

      source.connect(bpf);
      bpf.connect(gainNode);
      gainNode.connect(tickCtx.destination);
      source.start();
    } catch (e) { /* silent fail */ }
  }

  function startTicking() {
    if (tickTimer) return;
    // Create AudioContext only after a user gesture (autoplay policy)
    if (!tickCtx) {
      try { tickCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (tickCtx.state === 'suspended') tickCtx.resume();
    playTick(); // immediate first tick
    tickTimer = setInterval(playTick, 1000);
  }

  function stopTicking() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (tickCtx && tickCtx.state === 'running') tickCtx.suspend();
  }

  // Watch visibility of the countdown section
  new IntersectionObserver(entries => {
    isVisible = entries[0].isIntersecting;
    if (isVisible) startTicking();
    else           stopTicking();
  }, { threshold: 0.3 }).observe(section);

  // If the user hasn't interacted yet, wait for the first interaction
  // (required by browser autoplay policy)
  function onFirstInteraction() {
    if (isVisible && !tickCtx) startTicking();
    document.removeEventListener('click',      onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  }
  document.addEventListener('click',      onFirstInteraction, { once: true });
  document.addEventListener('touchstart', onFirstInteraction, { once: true });
})();

/* ────────────────────────────────────────────────
   6. TIMELINE REVEAL (Intersection Observer)
──────────────────────────────────────────────── */
function initTimelineReveal() {
  const items = document.querySelectorAll('.timeline-item');
  items.forEach(item => {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) entries[0].target.classList.add('visible');
    }, { threshold: 0.18 }).observe(item);
  });
}



/* ────────────────────────────────────────────────
   7. LEAFLET MAP MODAL
──────────────────────────────────────────────── */
let leafMap = null, leafMarker = null;
let currentLat = null, currentLng = null;

window.openMap = function(btn) {
  const item      = btn.closest('.timeline-item');
  const addr      = item.dataset.location || '';
  const lat       = item.dataset.lat;
  const lng       = item.dataset.lng;
  const eventName = item.querySelector('.tl-event')?.textContent || 'الموقع';

  currentLat = lat ? parseFloat(lat) : null;
  currentLng = lng ? parseFloat(lng) : null;

  document.getElementById('modal-event-title').textContent = eventName;
  document.getElementById('modal-address').textContent     = addr;

  const modal = document.getElementById('map-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (!currentLat || !currentLng) return;

  setTimeout(() => {
    const mapEl = document.getElementById('leaflet-map');
    if (!leafMap) {
      leafMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(leafMap);
    }
    leafMap.setView([currentLat, currentLng], 17);
    if (leafMarker) leafMap.removeLayer(leafMarker);
    const icon = L.divIcon({
      html: '<div style="font-size:32px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))">📍</div>',
      className: '', iconSize: [32, 32], iconAnchor: [16, 32],
    });
    leafMarker = L.marker([currentLat, currentLng], { icon }).addTo(leafMap);
    leafMarker.bindPopup(`<strong>${eventName}</strong><br><small>${addr}</small>`).openPopup();
    leafMap.invalidateSize();
  }, 160);
};

window.closeMap = function() {
  document.getElementById('map-modal').classList.remove('open');
  document.body.style.overflow = '';
};

window.openInMaps = function() {
  if (currentLat && currentLng) {
    window.open(`https://maps.google.com/?q=${currentLat},${currentLng}`, '_blank');
  }
};

// Swipe-down to close map sheet
(function() {
  const sheet = document.querySelector('.map-sheet');
  if (!sheet) return;
  let startY = 0;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - startY > 80) window.closeMap();
  }, { passive: true });
})();

/* ────────────────────────────────────────────────
   8. WEB AUDIO AMBIANCE
──────────────────────────────────────────────── */
let audioCtx = null;

function playCrackSound() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // White noise burst (wax crack simulation)
    const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.4, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.5) * 0.5;
    }
    const src  = audioCtx.createBufferSource();
    src.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.3;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
    setTimeout(startAmbience, 600);
  } catch (e) {
    // Graceful degradation
  }
}

function startAmbience() {
  if (!audioCtx) return;
  const chords = [
    [261.63, 329.63, 392,    493.88],  // Cmaj9
    [220,    261.63, 329.63, 392   ],  // Am9
    [174.61, 220,    261.63, 349.23],  // Fmaj7
    [196,    246.94, 293.66, 369.99],  // Gadd4
  ];
  let idx = 0;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(audioCtx.destination);

  function playChord() {
    chords[idx++ % chords.length].forEach(freq => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.5);
      gain.gain.linearRampToValueAtTime(0,    audioCtx.currentTime + 4.5);
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      osc.stop(audioCtx.currentTime + 5);
    });
    setTimeout(playChord, 5000);
  }
  playChord();
}

// Resume audio after browser autoplay policy blocks
document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { once: false });

/* ────────────────────────────────────────────────
   3D TILT EFFECT ON ENVELOPE
   ──────────────────────────────────────────────── */
function init3DTilt() {
  // Disabled to keep envelope static/fixed and prevent rendering bugs on mobile screens
}

/* ────────────────────────────────────────────────
   GUESTBOOK / WISHES SYSTEM
   ──────────────────────────────────────────────── */
window.submitWish = function() {
  const nameInput = document.getElementById('gb-name');
  const messageInput = document.getElementById('gb-message');
  const recipientSelect = document.getElementById('gb-recipient');
  const rsvpSelect = document.getElementById('gb-rsvp');
  if (!nameInput || !messageInput) return;

  const name = nameInput.value.trim();
  const msg = messageInput.value.trim();
  const recipient = recipientSelect ? recipientSelect.value : 'both';
  
  if (rsvpSelect && rsvpSelect.value === "") {
    alert(_currentLang === 'fr' ? 'Veuillez sélectionner votre réponse RSVP 🌹' : 'الرجاء تحديد تأكيد الحضور الخاص بك 🌹');
    return;
  }
  
  if (!name || !msg) {
    alert(_currentLang === 'fr' ? 'Veuillez saisir votre nom et valider votre choix 🌹' : 'الرجاء كتابة الاسم وتأكيد الحضور 🌹');
    return;
  }

  let rsvpVal = rsvpSelect ? rsvpSelect.value : '';
  let guestCount = 0;
  if (rsvpSelect) {
    const selectedOpt = rsvpSelect.options[rsvpSelect.selectedIndex];
    if (selectedOpt) {
      guestCount = Number(selectedOpt.getAttribute('data-count') || 0);
    }
  }
  const isConfirmed = rsvpVal !== '' && rsvpVal !== 'sorry_0';

  const params = new URLSearchParams(window.location.search);
  const invSlug = params.get('inv');

  if (!invSlug) {
    // Local preview fallback
    const localWish = { name, message: msg, target: recipient, timestamp: new Date().toISOString() };
    allWishes.unshift(localWish);
    renderWishesScroller();
    nameInput.value = '';
    messageInput.value = '';
    if (rsvpSelect) rsvpSelect.value = '';
    alert(_currentLang === 'fr' ? 'Votre réponse a été envoyée (Aperçu local) ✨' : 'تم إرسال ردك بنجاح (معاينة محلية) ✨');
    return;
  }

  initFirebase();
  
  const gidRaw = params.get('gid') || params.get('guest');
  const guestKey = gidRaw || ('anon_' + Math.random().toString(36).substr(2, 9));

  const updateData = {
    wishes: firebase.firestore.FieldValue.arrayUnion({
      name: name,
      message: msg,
      target: recipient,
      timestamp: new Date().toISOString()
    })
  };

  updateData["rsvps." + guestKey] = {
    confirmed: isConfirmed,
    count: guestCount,
    name: name,
    timestamp: new Date().toISOString()
  };

  updateData.rsvpConfirmed = isConfirmed;
  updateData.rsvpCount = guestCount;
  updateData.rsvpGuestName = name;

  _db.collection('invitations').doc(invSlug).update(updateData)
  .then(() => {
    nameInput.value = '';
    messageInput.value = '';
    if (rsvpSelect) rsvpSelect.value = '';
    alert(_currentLang === 'fr' ? 'Merci ! Votre réponse a été transmise aux mariés ✨' : 'شكراً لك! تم إرسال ردك وتأكيد حضورك للعروسين ✨');
    
    // Add real-time update to _roleWishes if this wish matches the current role view
    const newWish = { name, message: msg, target: recipient, timestamp: new Date().toISOString() };
    if (_currentRole === 'groom' && (recipient === 'groom' || recipient === 'both')) {
      _roleWishes.unshift(newWish);
    } else if (_currentRole === 'bride' && (recipient === 'bride' || recipient === 'both')) {
      _roleWishes.unshift(newWish);
    }
    const badge = document.getElementById('mailbox-badge');
    if (badge) badge.textContent = _roleWishes.length;

    loadAllWishes();
  })
  .catch(err => {
    console.error('Failed to submit wish:', err);
    alert('عذراً، حدث خطأ أثناء إرسال التهنئة. الرجاء المحاولة مرة أخرى.');
  });
};

window.openWishesWall = function() {
  const overlay = document.getElementById('wishes-wall-overlay');
  const titleEl = document.getElementById('wishes-wall-title');
  const listEl = document.getElementById('wishes-wall-list');
  if (!overlay || !listEl) return;

  overlay.style.display = 'flex';
  
  if (titleEl) {
    titleEl.textContent = _currentRole === 'groom' ? 'صندوق تهاني العريس 🤵' : 'صندوق تهاني العروسة 👰';
  }

  if (_roleWishes.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;color:var(--brown-light);padding:40px;font-style:italic">لا توجد رسائل موجهة لك بعد 💌</div>`;
    return;
  }

  listEl.innerHTML = _roleWishes.map(w => {
    const targetLabel = w.target === 'groom' ? '🤵 خاص بالعريس' : w.target === 'bride' ? '👰 خاص بالعروسة' : '💑 للعروسين';
    const dateStr = w.timestamp ? new Date(w.timestamp).toLocaleString('ar-TN') : '';
    return `
      <div class="wishes-wall-card">
        <div class="wishes-wall-guest">
          <span>👤 ${w.name}</span>
          <span style="font-size:0.7rem;background:rgba(201,168,76,0.15);color:var(--brown);padding:2px 8px;border-radius:10px">${targetLabel}</span>
        </div>
        <div class="wishes-wall-msg">"${w.message}"</div>
        <div class="wishes-wall-date">📅 ${dateStr}</div>
      </div>
    `;
  }).join('');
};

window.closeWishesWall = function() {
  const overlay = document.getElementById('wishes-wall-overlay');
  if (overlay) overlay.style.display = 'none';
};

let allWishes = [];
let wishesInterval = null;

function loadAllWishes() {
  initFirebase();
  _db.collection('invitations').get()
    .then(snapshot => {
      let wishes = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (doc.id !== 'settings' && data.wishes && Array.isArray(data.wishes)) {
          data.wishes.forEach(w => {
            wishes.push(w);
          });
        }
      });

      // Sort by date descending
      wishes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      allWishes = wishes;
      renderWishesScroller();
    })
    .catch(err => console.error('Failed to load wishes:', err));
}

function renderWishesScroller() {
  const scroller = document.getElementById('wishes-scroller');
  if (!scroller) return;

  if (allWishes.length === 0) {
    scroller.innerHTML = `<div style="padding: 20px; font-style: italic; color: var(--brown-light); text-align: center;">كن أول من يكتب تهنئة للعروسين 🌹</div>`;
    return;
  }

  scroller.innerHTML = allWishes.map(w => `
    <div class="wish-item">
      <div style="font-weight: bold; color: var(--brown); font-size: 0.95rem; margin-bottom: 4px;">👤 ${w.name}</div>
      <div style="color: var(--brown-mid); font-size: 0.85rem; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">"${w.message}"</div>
    </div>
  `).join('');

  clearInterval(wishesInterval);
  if (allWishes.length <= 1) return;

  let index = 0;
  wishesInterval = setInterval(() => {
    index = (index + 1) % allWishes.length;
    scroller.style.top = `-${index * 132}px`;
  }, 4000);
}

/* ────────────────────────────────────────────────
   BOOTSTRAP — runs once DOM is ready
   ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Read URL config and apply to DOM (names, dates, events)
  loadConfigFromURL();

  // 2. Init timeline reveal for default (non-config) items
  initTimelineReveal();

  // 3. Init 3D Tilt Effect on envelope
  init3DTilt();

  // 4. Load Guestbook wishes
  loadAllWishes();

  // 5. Apply nominative guest name if present in URL
  readAndApplyGuestParam();

  // 6. Load premium weather forecast widget
  loadWeatherForecast();

  // 7. Render premium circled wedding calendar
  renderPremiumCalendar();
});

function getTifinaghInitial(name) {
  if (!name) return 'ⵣ';
  const clean = name.trim().toLowerCase();
  const ch = clean.charAt(0);
  const TIFINAGH_MAP = {
    'a': 'ⴰ', 'b': 'ⴱ', 'c': 'ⵛ', 'd': 'ⴷ', 'e': 'ⴻ', 'f': 'ⴼ', 'g': 'ⴳ',
    'h': 'ⵀ', 'i': 'ⵉ', 'j': 'ⵊ', 'k': 'ⴽ', 'l': 'ⵍ', 'm': 'ⵎ', 'n': 'ⵏ',
    'o': 'ⵓ', 'p': 'ⵒ', 'q': 'ⵇ', 'r': 'ⵔ', 's': 'ⵙ', 't': 'ⵜ', 'u': 'ⵓ',
    'v': 'ⵠ', 'w': 'ⵡ', 'x': 'ⵅ', 'y': 'ⵢ', 'z': 'ⵣ',
    'أ': 'ⴰ', 'إ': 'ⴰ', 'آ': 'ⴰ', 'ا': 'ⴰ', 'ب': 'ⴱ', 'ت': 'ⵜ', 'ث': 'ⵝ',
    'ج': 'ⵊ', 'ح': 'ⵃ', 'خ': 'ⵅ', 'د': 'ⴷ', 'ذ': 'ⵠ', 'ر': 'ⵔ', 'ز': 'ⵣ',
    'س': 'ⵙ', 'ش': 'ⵛ', 'ص': 'ⵚ', 'ض': 'ⴹ', 'ط': 'ⵟ', 'ظ': 'ⵯ', 'ع': 'ⵄ',
    'غ': 'ⵖ', 'ف': 'ⴼ', 'ق': 'ⵇ', 'ك': 'ⴽ', 'ل': 'ⵍ', 'م': 'ⵎ', 'ن': 'ⵏ',
    'ه': 'ⵀ', 'و': 'ⵡ', 'ي': 'ⵢ'
  };
  return TIFINAGH_MAP[ch] || 'ⵣ';
}

/* ────────────────────────────────────────────────
   ENVELOPE DESIGN — applies motif & seal from config
   ──────────────────────────────────────────────── */
let _sealApplied = false; // Flag to prevent seal from being changed multiple times

function applyEnvelopeDesign(cfg) {
  if (!cfg) return;

  // ── Motif (ep: 'floral' | 'vintage' | 'minimalist' | 'nature' | 'arabesque' | 'zellige' | 'door' | 'calligraphy' | 'amazigh' | 'embossed') ──
  const pattern        = cfg.ep || 'floral';
  const showFloral     = pattern === 'floral';
  const showVintage    = pattern === 'vintage';
  const showMinimalist = pattern === 'minimalist';
  const showNature     = pattern === 'nature';
  const showArabesque  = pattern === 'arabesque';
  const showZellige    = pattern === 'zellige' || pattern === 'crown';
  const showDoor       = pattern === 'door' || pattern === 'porte';
  const showCalligraphy = pattern === 'calligraphy';
  const showAmazigh    = pattern === 'amazigh';
  const showEmbossed   = pattern === 'embossed' || pattern === 'botanical_embossed';
  const showSageEmbossed = pattern === 'sage_embossed' || pattern === 'botanical_sage';

  document.querySelectorAll('.panel-branches').forEach(el => {
    el.style.display = showFloral ? '' : 'none';
  });
  document.querySelectorAll('.panel-vintage').forEach(el => {
    el.style.display = showVintage ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-minimalist').forEach(el => {
    el.style.display = showMinimalist ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-nature').forEach(el => {
    el.style.display = showNature ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-arabesque').forEach(el => {
    el.style.display = showArabesque ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-zellige').forEach(el => {
    el.style.display = showZellige ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-door').forEach(el => {
    el.style.display = showDoor ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-calligraphy').forEach(el => {
    el.style.display = showCalligraphy ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-amazigh').forEach(el => {
    el.style.display = showAmazigh ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-embossed').forEach(el => {
    el.style.display = showEmbossed ? 'block' : 'none';
  });
  document.querySelectorAll('.panel-sage-embossed').forEach(el => {
    el.style.display = showSageEmbossed ? 'block' : 'none';
  });

  const invitationEl = document.getElementById('invitation');
  if (invitationEl) {
    if (showMinimalist) {
      invitationEl.classList.add('pattern-minimalist-active');
    } else {
      invitationEl.classList.remove('pattern-minimalist-active');
    }
  }

  // Apply nature green panel background when nature theme is active
  const panels = document.querySelectorAll('.env-panel');
  panels.forEach(p => {
    if (showNature) {
      p.classList.add('panel-nature-theme');
    } else {
      p.classList.remove('panel-nature-theme');
    }
  });

  // ── Hall Photo Background (hp) ──
  const hallPhoto = cfg.hp || 'luxury_wedding_hall';
  const heroBg = document.querySelector('.hero-bg-parallax');
  if (heroBg) {
    heroBg.style.backgroundImage = `url('assets/${hallPhoto}.png')`;
    if (hallPhoto === 'hall_bridal_entrance') {
      heroBg.classList.add('bg-bridal-entrance');
    } else {
      heroBg.classList.remove('bg-bridal-entrance');
    }
  }

  // ── Closing Photo (cp): which hall image shows in closing section ──
  const closingImg = document.querySelector('.closing-easel-photo');
  if (closingImg) {
    const closingPhoto = cfg.cp || 'wedding_hall_board';
    closingImg.src = `assets/${closingPhoto}.png`;
  }

  // ── Seal symbol (es: 'heart' | 'rings' | 'monogram' | 'bismillah' | 'lock' | 'amazigh' | 'zellige') ──
  // Only apply seal once to prevent it from changing after initial load
  if (!_sealApplied) {
    let seal = cfg.es;
    if (!seal) {
      if (showDoor) seal = 'lock';
      else if (showAmazigh) seal = 'amazigh';
      else if (showZellige) seal = 'zellige';
      else seal = 'heart';
    }
    const sealImg = document.getElementById('seal-3d-img');
    const sealMonoText = document.getElementById('seal-3d-monogram-text');

    if (sealImg) {
      if (seal === 'monogram') {
        sealImg.src = 'assets/monogram_wax_seal_bg.png';
        sealImg.style.transform = 'none';
        if (sealMonoText) {
          sealMonoText.style.display = 'flex';
          sealMonoText.style.flexDirection = 'row';
          sealMonoText.style.justifyContent = 'center';
          sealMonoText.style.alignItems = 'center';
          sealMonoText.style.paddingBottom = '0';

          let initials = '';
          if (cfg.si) {
            initials = cfg.si;
          } else {
            const isFr = cfg.la === 'fr';
            const groomName = isFr ? (cfg.gf2 || cfg.ga) : cfg.ga;
            const brideName = isFr ? (cfg.bf2 || cfg.ba) : cfg.ba;
            const g = (groomName || '').trim().charAt(0).toUpperCase();
            const b = (brideName || '').trim().charAt(0).toUpperCase();
            initials = g && b ? `${g} & ${b}` : 'M & M';
          }

          // Dynamically adjust font-family for 3D look
          const hasLatin = /[a-zA-Z]/.test(initials);
          if (hasLatin) {
            sealMonoText.style.fontFamily = "'Playfair Display', serif";
            sealMonoText.style.fontSize = "1.5rem";
          } else {
            sealMonoText.style.fontFamily = "'Amiri', serif";
            sealMonoText.style.fontSize = "1.75rem";
          }

          // Parse and render initials with individual spans for perfect centering
          sealMonoText.innerHTML = '';
          
          let parts = [];
          if (initials.includes('&')) {
            parts = initials.split('&').map(p => p.trim());
            if (parts.length === 2) {
              parts = [parts[0], '&', parts[1]];
            }
          } else if (initials.includes('و')) {
            parts = initials.split('و').map(p => p.trim());
            if (parts.length === 2) {
              parts = [parts[0], 'و', parts[1]];
            }
          }
          
          if (parts.length === 3) {
            const span1 = document.createElement('span');
            span1.textContent = parts[0];
            span1.className = 'mono-letter';
            
            const spanConnector = document.createElement('span');
            spanConnector.textContent = parts[1];
            spanConnector.className = 'mono-connector';
            
            const span2 = document.createElement('span');
            span2.textContent = parts[2];
            span2.className = 'mono-letter';
            
            if (!hasLatin) {
              sealMonoText.style.flexDirection = 'row-reverse';
            } else {
              sealMonoText.style.flexDirection = 'row';
            }
            
            sealMonoText.appendChild(span1);
            sealMonoText.appendChild(spanConnector);
            sealMonoText.appendChild(span2);
          } else {
            const singleSpan = document.createElement('span');
            singleSpan.textContent = initials;
            singleSpan.className = 'mono-letter';
            sealMonoText.style.flexDirection = 'row';
            sealMonoText.appendChild(singleSpan);
          }
        }
      } else if (seal === 'lock') {
        sealImg.src = 'assets/lock_wax_seal.png';
        sealImg.style.transform = 'scale(1.18)';
        if (sealMonoText) {
          sealMonoText.style.display = 'none';
        }
      } else if (seal === 'amazigh') {
        sealImg.src = 'assets/amazigh_wax_seal.png';
        sealImg.style.transform = 'none';
        if (sealMonoText) {
          sealMonoText.style.display = 'flex';
          sealMonoText.style.flexDirection = 'column';
          sealMonoText.style.justifyContent = 'flex-end';
          sealMonoText.style.alignItems = 'center';
          sealMonoText.style.paddingBottom = '12px';
          
          const isFr = cfg.la === 'fr';
          const groomName = isFr ? (cfg.gf2 || cfg.ga) : cfg.ga;
          const brideName = isFr ? (cfg.bf2 || cfg.ba) : cfg.ba;
          
          const gTifi = getTifinaghInitial(groomName || 'G');
          const bTifi = getTifinaghInitial(brideName || 'B');
          
          sealMonoText.innerHTML = `
            <div class="amazigh-engraved-wrapper">
              <span class="amazigh-char">${gTifi}</span>
              <span class="amazigh-sep">⵰</span>
              <span class="amazigh-char">${bTifi}</span>
            </div>
          `;
        }
      } else if (seal === 'zellige') {
        sealImg.src = 'assets/zellige_wax_seal.png';
        sealImg.style.transform = 'none';
        if (sealMonoText) {
          sealMonoText.style.display = 'flex';
          sealMonoText.style.flexDirection = 'column';
          sealMonoText.style.justifyContent = 'flex-end';
          sealMonoText.style.alignItems = 'center';
          sealMonoText.style.paddingBottom = '10px';
          const isFr = cfg.la === 'fr';
          const brideName = (isFr ? (cfg.bf2 || cfg.ba) : (cfg.ba || cfg.bf2) || 'العروسة').trim();
          sealMonoText.innerHTML = `
            <div class="seal-sub-engraved-wrapper">
              <div class="seal-sub-line"></div>
              <span class="seal-sub-bride-name">${brideName}</span>
            </div>
          `;
        }
      } else {
        sealImg.src = `assets/${seal}_wax_seal.png`;
        sealImg.style.transform = 'none';
        if (sealMonoText) {
          sealMonoText.style.display = 'none';
        }
      }
    }
    sealImg.style.opacity = '1';
    _sealApplied = true; // Mark seal as applied to prevent future changes

    // Update mini wax seals on guest banners
    const miniSealSrc = (seal === 'monogram') ? 'assets/monogram_wax_seal_bg.png' :
                        (seal === 'lock') ? 'assets/lock_wax_seal.png' :
                        (seal === 'amazigh') ? 'assets/amazigh_wax_seal.png' :
                        (seal === 'zellige') ? 'assets/zellige_wax_seal.png' :
                        `assets/${seal}_wax_seal.png`;
    document.querySelectorAll('.guest-seal-img').forEach(img => {
      img.src = miniSealSrc;
    });
  }

  // Sync Day/Night mode icon
  if (typeof initDayNightModeIcon === 'function') {
    initDayNightModeIcon();
  }
}

/* ────────────────────────────────────────────────
   TRANSLATION & LOCALIZATION SYSTEM
   ──────────────────────────────────────────────── */
const TRANSLATIONS = {
  ar: {
    basmala: 'بارك الله لهما وبارك عليهما وجمع بينهما في خير',
    invite_title: 'تتشرف عائلتا',
    mr: 'السيد',
    mrs: 'والسيدة',
    and: 'و',
    invite_desc: 'بدعوتكم لحضور حفل زفاف نجليهما',
    and_char: '&',
    scroll_hint: 'اسحب للأسفل',
    countdown_title: 'العد التنازلي',
    countdown_subtitle: 'لحظات تفصلنا عن اللقاء',
    days: 'يوم',
    hours: 'ساعة',
    mins: 'دقيقة',
    secs: 'ثانية',
    program_title: 'برنامج الحفل',
    location_btn: 'الموقع',
    guestbook_title: 'دفتر التهاني',
    guestbook_subtitle: 'شاركونا فرحتنا بكلمة طيبة للعروسين',
    gb_name_placeholder: 'اسمك الكريم',
    gb_rsvp_label: '🗳️ تأكيد الحضور (RSVP) :',
    gb_msg_placeholder: 'أكتب تهنئتك هنا...',
    gb_submit: 'إرسال التهنئة ✨',
    gb_sug_label: '💡 اقتراحات جاهزة للتهنئة:',
    closing_tagline: 'يسعدنا مشاركتكم هذه الفرحة',
    closing_to: 'إلى',
    closing_easel_header: 'حفل زفاف',
    open_maps: 'افتح في خرائط جوجل',
    weather_title: 'حالة الطقس ليوم الزفاف',
    weather_location: 'طبلبة، تونس',
    weather_humidity: 'الرطوبة',
    weather_wind: 'الرياح',
    weather_season_avg: 'معدل طقس صيفي مثالي ☀️',
    photo_stack_title: 'ألبوم صورنا',
    photo_stack_subtitle: 'لحظاتنا السعيدة معاً',
    photo_stack_next: 'الصورة التالية',
    calendar_subtitle: 'تاريخ يومنا المميز',
    souvenir_badge: 'تذكار خاص',
    souvenir_title: 'احفظ دعوتك للذكرى',
    souvenir_desc: 'يمكنك تحميل نسخة ثابتة من هذه الدعوة تتضمن المغلف باسمك لتبقى تذكاراً جميلاً لهذا اليوم المميّز.',
    souvenir_btn_text: 'تحميل تذكار الدعوة',
    souvenir_modal_title: 'تحميل تذكار الدعوة',
    souvenir_modal_subtitle: 'اختر صيغة الملف التي تفضلها لحفظ تذكار الدعوة',
    souvenir_opt_png_title: 'تحميل كصورة (PNG)',
    souvenir_opt_png_desc: 'صورة عالية الجودة تحتوي على المغلف باسمك وكارت الدعوة مناسبة للحفظ في معرض الصور.',
    souvenir_opt_html_title: 'تحميل كصفحة ويب (HTML)',
    souvenir_opt_html_desc: 'ملف HTML ثابت وكامل يعمل بدون انترنت ويعرض الدعوة مع المغلف والأسماء.',
  },
  fr: {
    basmala: 'Que Dieu les bénisse, les comble de bonheur et les réunisse.',
    invite_title: 'Les familles',
    mr: 'M.',
    mrs: 'Mme',
    and: 'et',
    invite_desc: 'ont l\'honneur de vous inviter au mariage de leurs enfants',
    and_char: '&',
    scroll_hint: 'Faites défiler vers le bas',
    countdown_title: 'Compte à rebours',
    countdown_subtitle: 'Quelques instants nous séparent de ce grand jour',
    days: 'Jours',
    hours: 'Heures',
    mins: 'Minutes',
    secs: 'Secondes',
    program_title: 'Programme de la Fête',
    location_btn: 'Localisation',
    guestbook_title: 'Livre d\'or',
    guestbook_subtitle: 'Laissez un message de félicitations aux mariés',
    gb_name_placeholder: 'Votre Nom',
    gb_rsvp_label: '🗳️ Confirmation de présence (RSVP) :',
    gb_msg_placeholder: 'Écrivez votre message ici...',
    gb_submit: 'Envoyer les félicitations ✨',
    gb_sug_label: '💡 Formules de vœux suggérées :',
    closing_tagline: 'Nous sommes honorés de partager ce moment avec vous',
    closing_to: 'À',
    closing_easel_header: 'Mariage de',
    open_maps: 'Ouvrir dans Google Maps',
    weather_title: 'Météo prévue pour le Jour J',
    weather_location: 'Teboulba, Tunisie',
    weather_humidity: 'Humidité',
    weather_wind: 'Vent',
    weather_season_avg: 'Météo estivale idéale ☀️',
    photo_stack_title: 'Notre album photo',
    photo_stack_subtitle: 'Nos moments précieux ensemble',
    photo_stack_next: 'Photo suivante',
    calendar_subtitle: 'La date de notre jour spécial',
    souvenir_badge: 'Souvenir Spécial',
    souvenir_title: 'Gardez votre invitation en souvenir',
    souvenir_desc: 'Vous pouvez télécharger une version statique de cette invitation incluant l\'enveloppe avec votre nom comme souvenir précieux.',
    souvenir_btn_text: 'Télécharger mon souvenir',
    souvenir_modal_title: 'Télécharger le souvenir',
    souvenir_modal_subtitle: 'Choisissez le format de fichier que vous préférez',
    souvenir_opt_png_title: 'Télécharger en Image (PNG)',
    souvenir_opt_png_desc: 'Une image haute définition contenant l\'enveloppe avec votre nom et la carte d\'invitation.',
    souvenir_opt_html_title: 'Télécharger en Page Web (HTML)',
    souvenir_opt_html_desc: 'Un fichier HTML autonome complet qui fonctionne hors-ligne.',
  }
};

/* ────────────────────────────────────────────────
   GUEST NOMINATIVE BANNER
   Supports two modes:
   • New short URL: ?inv=slug&gid=XXXX  → Firestore lookup by guest id
   • Legacy URL:    ?guest=NAME&gt=TYPE → direct application (backward compat)
──────────────────────────────────────────────── */

/** Apply banner data once name + type are resolved */
function _applyGuestBanner(guestName, guestType) {
  _resolvedGuestName = guestName;
  _resolvedGuestType = guestType;

  let title = '';
  let name = guestName;
  let isLtr = false;
  switch (guestType) {
    case 'ar_couple':          title = 'إلى السيد'; name = `${guestName} وحرمه`; break;
    case 'ar_couple_children': title = 'إلى السيد'; name = `${guestName} وحرمه وأبنائه`; break;
    case 'ar_man':             title = 'إلى السيد'; name = guestName; break;
    case 'ar_woman':           title = 'إلى السيدة'; name = guestName; break;
    case 'ar_friend_m':        title = 'إلى عْشيري'; name = guestName; break;
    case 'ar_friend_f':        title = 'إلى عْشيرتي'; name = guestName; break;
    case 'fr_couple':          title = 'Monsieur & Madame'; name = guestName; isLtr = true; break;
    case 'fr_man':             title = 'Monsieur'; name = guestName; isLtr = true; break;
    case 'fr_woman':           title = 'Madame'; name = guestName; isLtr = true; break;
    case 'fr_friend_m':        title = 'Pour mon Ami'; name = guestName; isLtr = true; break;
    case 'fr_friend_f':        title = 'Pour mon amie'; name = guestName; isLtr = true; break;
    default:                   title = 'إلى السيد'; name = `${guestName} وحرمه`;
  }

  const banner  = document.getElementById('guestNameBanner');
  const titleEl = document.getElementById('guestCardTitle');
  const labelEl = document.getElementById('guestBannerLabel');
  const medallionInitialsEl = document.getElementById('guestMedallionInitials');
  if (!banner) return;

  if (titleEl) titleEl.textContent = title;
  if (labelEl) labelEl.textContent = name;

  // Extract and render creative calligraphic initials on the 3D medallion
  if (medallionInitialsEl) {
    const initialsObj = _extractGuestInitials(guestName || name);
    medallionInitialsEl.innerHTML = initialsObj.html;
  }

  banner.style.display = 'flex';
  if (isLtr) banner.classList.add('ltr');

  // Update browser tab title
  const fullSalutation = `${title} ${name}`;
  document.title = `${fullSalutation} — ${document.title}`;

  // Pre-fill guestbook name field
  const gbNameInput = document.getElementById('gb-name');
  if (gbNameInput) gbNameInput.value = name;

  // ── Closing section: show personalised guest address ──
  const closingAddr  = document.getElementById('closingGuestAddress');
  const closingGName = document.getElementById('closingGuestName');
  if (closingAddr && closingGName) {
    closingGName.textContent = name;
    closingAddr.style.display = 'flex';
  }

  // Update personalized invitation description text
  _updatePersonalizedInviteDesc();
}

/** Extracts creative calligraphic initials for Arabic and Latin guest names */
function _extractGuestInitials(guestName) {
  if (!guestName || typeof guestName !== 'string') {
    return {
      isArabic: true,
      raw: 'س أ',
      html: `<div class="ar-callig-composition"><span class="ar-callig-main-flourish">س</span><span class="ar-callig-sec-flourish">أ</span><span class="ar-callig-hamza-accent">ء</span></div>`
    };
  }

  let name = guestName.trim();
  name = name.replace(/^(السيد|السيدة|الآنسة|الدكتور|الدكتورة|المهندس|الشيخ|Monsieur|Madame|Mademoiselle|Mr|Mrs|Dr)\b\s*/gi, '');
  name = name.replace(/\s*(وحرمه|وأبنائه|وأسرتِه|et sa famille)\b/gi, '');

  const words = name.split(/\s+/).filter(w => w.length > 0);
  const isArabic = /[\u0600-\u06FF]/.test(name);

  if (isArabic) {
    let char1 = 'س', char2 = 'أ';
    if (words.length >= 2) {
      let w1 = words[0];
      let w2 = words[words.length - 1];
      if (w1.startsWith('ال') && w1.length > 3) w1 = w1.substring(2);
      if (w2.startsWith('ال') && w2.length > 3) w2 = w2.substring(2);
      char1 = w1.charAt(0);
      char2 = w2.charAt(0);
    } else if (words.length === 1 && words[0].length >= 2) {
      char1 = words[0].charAt(0);
      char2 = words[0].charAt(1);
    } else if (words.length === 1) {
      char1 = words[0].charAt(0);
      char2 = 'أ';
    }

    if (char1 === 'ا' || char1 === 'إ' || char1 === 'آ') char1 = 'أ';
    if (char2 === 'ا' || char2 === 'إ' || char2 === 'آ') char2 = 'أ';

    const raw = `${char1}${char2}`;

    const html = `
      <div class="ar-callig-composition">
        <span class="ar-callig-main-flourish">${char1}</span>
        <span class="ar-callig-sec-flourish">${char2}</span>
        <span class="ar-callig-hamza-accent">ء</span>
      </div>
    `;

    return { isArabic: true, raw: raw, html: html };
  } else {
    // Latin: premium SVG calligraphic monogram with golden flourishes
    let initial1 = 'M', initial2 = 'M';
    if (words.length >= 2) {
      initial1 = words[0].charAt(0).toUpperCase();
      initial2 = words[words.length - 1].charAt(0).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      initial1 = words[0].charAt(0).toUpperCase();
      initial2 = words[0].charAt(1).toUpperCase();
    } else if (words.length === 1) {
      initial1 = words[0].charAt(0).toUpperCase();
      initial2 = '';
    }
    const raw = initial2 ? `${initial1}${initial2}` : initial1;

    // SVG monogram: initials in Playfair Display italic with golden filigree lines
    const html = `
      <div class="latin-monogram-wrap">
        <svg class="latin-mono-svg" viewBox="0 0 100 54" xmlns="http://www.w3.org/2000/svg" overflow="visible">
          <defs>
            <linearGradient id="monoGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f7e47a"/>
              <stop offset="50%" stop-color="#c9a84c"/>
              <stop offset="100%" stop-color="#a07020"/>
            </linearGradient>
          </defs>
          <line x1="2" y1="27" x2="22" y2="27" stroke="#c9a84c" stroke-width="0.7" stroke-dasharray="2,2.5" opacity="0.75"/>
          <circle cx="25" cy="27" r="1.4" fill="#c9a84c" opacity="0.9"/>
          <circle cx="75" cy="27" r="1.4" fill="#c9a84c" opacity="0.9"/>
          <line x1="78" y1="27" x2="98" y2="27" stroke="#c9a84c" stroke-width="0.7" stroke-dasharray="2,2.5" opacity="0.75"/>
          <text x="50" y="36" text-anchor="middle"
            font-family="Playfair Display, Didot, Georgia, serif"
            font-size="28" font-style="italic" font-weight="700"
            fill="url(#monoGold)" letter-spacing="3"
            filter="drop-shadow(0 1px 3px rgba(201,168,76,0.5))">${raw}</text>
        </svg>
      </div>
    `;
    return { isArabic: false, raw, html };
  }
}

/** Updates the invitation description text dynamically for personalized guests */
function _updatePersonalizedInviteDesc() {
  if (!_resolvedGuestName) return;
  const inviteDescEl = document.querySelector('[data-tr="invite_desc"]');
  if (!inviteDescEl) return;

  const guestName = _resolvedGuestName;
  const guestType = _resolvedGuestType || 'ar_couple';
  
  let title = '';
  let name = guestName;
  switch (guestType) {
    case 'ar_couple':          title = 'إلى السيد'; name = `${guestName} وحرمه`; break;
    case 'ar_couple_children': title = 'إلى السيد'; name = `${guestName} وحرمه وأبنائه`; break;
    case 'ar_man':             title = 'إلى السيد'; name = guestName; break;
    case 'ar_woman':           title = 'إلى السيدة'; name = guestName; break;
    case 'ar_friend_m':        title = 'إلى عْشيري'; name = guestName; break;
    case 'ar_friend_f':        title = 'إلى عْشيرتي'; name = guestName; break;
    case 'fr_couple':          title = 'Monsieur & Madame'; name = guestName; break;
    case 'fr_man':             title = 'Monsieur'; name = guestName; break;
    case 'fr_woman':           title = 'Madame'; name = guestName; break;
    case 'fr_friend_m':        title = 'Pour mon Ami'; name = guestName; break;
    case 'fr_friend_f':        title = 'Pour mon amie'; name = guestName; break;
    default:                   title = 'إلى السيد'; name = `${guestName} وحرمه`;
  }

  const isFr = document.documentElement.lang === 'fr';
  if (isFr) {
    let cleanTitle = title;
    if (title.startsWith('Pour mon ')) {
      cleanTitle = title.replace('Pour mon ', 'leur ami ').toLowerCase();
    }
    inviteDescEl.innerHTML = `ont l'honneur d'inviter <span class="invite-guest-name">${cleanTitle} ${name}</span> au mariage de leurs enfants`;
  } else {
    const cleanTitle = title.replace('إلى ', '').trim();
    const titlePrefix = cleanTitle ? cleanTitle + ' ' : '';
    inviteDescEl.innerHTML = `بدعوة <span class="invite-guest-name">${titlePrefix}${name}</span> لحضور زفاف نجليهما`;
  }
}

function readAndApplyGuestParam() {
  const params   = new URLSearchParams(window.location.search);
  const gidRaw   = params.get('gid');    // new short-link format
  const guestRaw = params.get('guest');  // legacy format

  if (gidRaw) {
    /* ── New short link: resolve guest by id from Firestore ── */
    const invSlug = params.get('inv');
    if (!invSlug) return;
    initFirebase();
    _db.collection('invitations').doc(invSlug).get()
      .then(doc => {
        if (!doc.exists) return;
        const guests = doc.data().guests || [];
        const guestIdx  = guests.findIndex(g => g.id === gidRaw);
        if (guestIdx === -1) return;
        const guest = guests[guestIdx];
        _applyGuestBanner(guest.name, guest.type || 'ar_couple');

        // Increment views counter
        guests[guestIdx].views = (guests[guestIdx].views || 0) + 1;
        _db.collection('invitations').doc(invSlug).update({
          guests: guests
        }).catch(err => console.warn('[InvitApp] Failed to update guest view count:', err));
      })
      .catch(e => console.warn('[InvitApp] gid lookup failed:', e));

  } else if (guestRaw || sessionStorage.getItem('pwa_override_guest')) {
    /* ── Guest link (URL or PWA override) ── */
    const guestName = guestRaw ? decodeURIComponent(guestRaw.replace(/\+/g, ' ')) : sessionStorage.getItem('pwa_override_guest');
    const guestType = params.get('type') || params.get('gt') || sessionStorage.getItem('pwa_override_type') || 'ar_couple';
    _applyGuestBanner(guestName, guestType);
  }
}

/* ────────────────────────────────────────────────
   MUSIC FROM CONFIG
   Reads cfg.mu and switches the <audio> src accordingly.
   Supported keys: 'wedding_march' | 'ziad_gharsa' | 'mabrouk_ramy_ayach'
──────────────────────────────────────────────── */
function applyMusicFromConfig(cfg) {
  if (!cfg || !cfg.mu) return;
  const MUSIC_MAP = {
    'wedding_march':      'assets/wedding_march.mp3',
    'ziad_gharsa':        'assets/ziad_gharsa.mp3',
    'mabrouk_ramy_ayach': 'assets/mabrouk_ramy_ayach.mp3',
  };
  const src = MUSIC_MAP[cfg.mu];
  if (!src) return;
  const audio = document.getElementById('wedding-audio');
  if (!audio) return;
  if (audio.getAttribute('src') === src) return; // already correct, nothing to do
  const wasPlaying = !audio.paused;
  audio.src = src;
  audio.load();
  if (wasPlaying) audio.play().catch(() => {});
}

const SUGGESTIONS = {
  ar: [
    "ألف مبروك للعروسين الجميلين! أتمنى لكما حياة مليئة بالحب والسعادة والهناء 💖",
    "بارك الله لكما وبارك عليكما وجمع بينكما في خير. زواج سعيد وعمر مديد بالرفاه والبنين 💍",
    "فرحتنا كبيرة بكما اليوم! تمنياتنا لكما برحلة زوجية سعيدة مليئة بالتفاهم والمودة والرحمة ✨",
    "أحر التهاني وأجمل التبريكات بمناسبة هذا الزواج الميمون. دامت بيوتكم عامرة بالأفراح والمسرات 🌹",
    "بكل الحب والود نهنئكما بزفافكما السعيد. أتمنى لكما مستقبلاً مشرقاً وحياة مشتركة مليئة بالبركة 💑"
  ],
  fr: [
    "Toutes nos félicitations pour votre mariage ! Nous vous souhaitons une vie remplie d'amour et de bonheur. 💖",
    "Que ce jour unique soit le début d'une merveilleuse aventure pleine de joie, de complicité et de tendresse. 💍",
    "Meilleurs vœux de bonheur pour ce nouveau chapitre de votre vie. Que votre amour grandisse jour après jour. ✨",
    "Félicitations aux magnifiques mariés ! Que votre foyer soit béni et toujours rempli d'harmonie et de paix. 🌹",
    "Avec tout notre amour, nous vous souhaitons une vie commune merveilleuse, parsemée de rires et de beaux projets. 💑"
  ]
};

function renderSuggestions(lang) {
  const container = document.getElementById('gb-suggestions-list');
  if (!container) return;
  const list = SUGGESTIONS[lang] || SUGGESTIONS.ar;
  container.innerHTML = list.map(text => {
    const escaped = text.replace(/'/g, "\\'");
    return `<div class="suggestion-pill" onclick="selectSuggestion('${escaped}')" title="${text}">${text}</div>`;
  }).join('');
}

window.selectSuggestion = function(text) {
  const textarea = document.getElementById('gb-message');
  if (textarea) {
    textarea.value = text;
    textarea.focus();
  }
};

function applyLanguage(lang) {
  _currentLang = lang;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.ar;
  const isFr = lang === 'fr';

  // Set html properties
  document.documentElement.lang = lang;
  document.documentElement.dir = isFr ? 'ltr' : 'rtl';

  // Apply language class to body
  if (isFr) {
    document.body.classList.add('lang-fr');
    document.body.classList.remove('lang-ar');
  } else {
    document.body.classList.add('lang-ar');
    document.body.classList.remove('lang-fr');
  }

  // Translate static texts
  document.querySelectorAll('[data-tr]').forEach(el => {
    const key = el.getAttribute('data-tr');
    if (dict && dict[key]) {
      el.textContent = dict[key];
    }
  });

  // Translate Google Calendar main button text dynamically
  const gcalBtnSpan = document.querySelector('[data-tr="gcal_main_btn"]');
  if (gcalBtnSpan) {
    gcalBtnSpan.textContent = isFr
      ? "Enregistrer dans Google Calendar (Rappels 24h & 1h avant) 🔔"
      : "حفظ الموعد في Calendrier Google لتلقي تذكير (قبل يوم وقبل ساعة) 🔔";
  }

  // Translate placeholders
  document.querySelectorAll('[data-tr-placeholder]').forEach(el => {
    const key = el.getAttribute('data-tr-placeholder');
    if (dict[key]) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  // Update circular text path around wax seal
  const circularText = document.querySelector('.seal-text-svg textPath');
  if (circularText) {
    circularText.textContent = isFr
      ? 'Cliquez pour ouvrir l\'invitation ✦ Cliquez pour ouvrir ✦'
      : 'اضغط لفتح الدعوة ✦ اضغط لفتح الدعوة ✦';
  }

  // Render suggestion pills
  renderSuggestions(lang);

  // Render RSVP select options
  renderRsvpOptions(lang);

  // Render Recipient select options
  renderRecipientOptions(lang);

  // Re-render premium calendar in active language
  renderPremiumCalendar();

  // Apply dedicated role inscription for groom/bride private view
  if (window._pendingRoleView) {
    const roleLabel  = document.getElementById('role-inscription-banner');
    const roleTitleEl = document.getElementById('role-inscription-title');
    const roleSubEl   = document.getElementById('role-inscription-sub');
    if (roleLabel && roleTitleEl && roleSubEl) {
      const isGroom = window._pendingRoleView === 'groom';
      if (isFr) {
        roleLabel.classList.add('ltr');
        roleTitleEl.textContent = 'Invitation souvenir';
        roleSubEl.textContent = isGroom
          ? 'Pour le marié'
          : 'Pour la mariée';
      } else {
        roleLabel.classList.remove('ltr');
        roleTitleEl.textContent = 'دعوة خاصة';
        roleSubEl.textContent = isGroom
          ? 'بالعريس للتذكار'
          : 'بالعروسة للتذكار';
      }
      roleLabel.style.display = 'flex';
    }
  }

  // If a guest was already resolved, re-apply the personalized invite description
  if (typeof _updatePersonalizedInviteDesc === 'function') {
    _updatePersonalizedInviteDesc();
  }
}

/* ────────────────────────────────────────────────
   Day/Night Theme mode helper & toggle
   ──────────────────────────────────────────────── */
function initDayNightModeIcon() {
  const isNight = document.body.classList.contains('night-mode');
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  if (sunIcon && moonIcon) {
    if (isNight) {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }
}

window.toggleDayNightMode = function() {
  const body    = document.body;
  const btn     = document.getElementById('day-night-toggle');
  const sunIcon  = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');

  // Trigger icon spin animation
  if (btn) {
    btn.classList.add('transitioning');
    setTimeout(() => btn.classList.remove('transitioning'), 460);
  }

  // Short delay so spin starts before mode switches
  setTimeout(() => {
    const isNight = body.classList.toggle('night-mode');

    if (sunIcon && moonIcon) {
      if (isNight) {
        sunIcon.style.display  = 'block';
        moonIcon.style.display = 'none';
        localStorage.setItem('invitThemeMode', 'night');
      } else {
        sunIcon.style.display  = 'none';
        moonIcon.style.display = 'block';
        localStorage.setItem('invitThemeMode', 'day');
      }
    }
  }, 220); // halfway through the spin, swap icons
};

/* ────────────────────────────────────────────────
   RSVP DYNAMIC SYSTEM & REAL-TIME COUNTER
   ──────────────────────────────────────────────── */
let _currentLang = 'ar';

const RSVP_OPTIONS = {
  ar: [
    { value: "", text: "👉 اختر تأكيد الحضور والتواجد" },
    { value: "both_1", text: "أؤكد حضوري بمفردي 👤", count: 1 },
    { value: "wife_2", text: "أؤكد حضوري مع زوجتي 💑 (+1)", count: 2 },
    { value: "husband_2", text: "أؤكد حضوري مع زوجي 💑 (+1)", count: 2 },
    { value: "family_3", text: "أؤكد حضورنا مع العائلة 👨‍👩‍👧 (+2)", count: 3 },
    { value: "family_4", text: "أؤكد حضورنا مع العائلة 👨‍👩‍👧‍👦 (+3)", count: 4 },
    { value: "sorry_0", text: "أعتذر عن الحضور 🌹", count: 0 }
  ],
  fr: [
    { value: "", text: "👉 Sélectionnez votre réponse RSVP" },
    { value: "both_1", text: "Je confirme ma présence (Seul/Seule) 👤", count: 1 },
    { value: "wife_2", text: "Je confirme ma présence avec ma femme 💑 (+1)", count: 2 },
    { value: "husband_2", text: "Je confirme ma présence avec mon mari 💑 (+1)", count: 2 },
    { value: "family_3", text: "Je confirme notre présence avec ma famille 👨‍👩‍👧 (+2)", count: 3 },
    { value: "family_4", text: "Je confirme notre présence avec ma famille 👨‍👩‍👧‍👦 (+3)", count: 4 },
    { value: "sorry_0", text: "Je m'excuse, je ne pourrai pas être présent 🌹", count: 0 }
  ]
};

function renderRsvpOptions(lang) {
  const selectEl = document.getElementById('gb-rsvp');
  if (!selectEl) return;
  const list = RSVP_OPTIONS[lang] || RSVP_OPTIONS.ar;
  selectEl.innerHTML = list.map(opt => {
    return `<option value="${opt.value}" data-count="${opt.count || 0}">${opt.text}</option>`;
  }).join('');
}

const RECIPIENT_OPTIONS = {
  ar: [
    { value: "both", text: "إلى: العرايس معاً 💑" },
    { value: "groom", text: "إلى: العريس 🤵" },
    { value: "bride", text: "إلى: العروسة 👰" }
  ],
  fr: [
    { value: "both", text: "Aux mariés ensemble 💑" },
    { value: "groom", text: "Au marié 🤵" },
    { value: "bride", text: "À la mariée 👰" }
  ]
};

function renderRecipientOptions(lang) {
  const selectEl = document.getElementById('gb-recipient');
  if (!selectEl) return;
  const list = RECIPIENT_OPTIONS[lang] || RECIPIENT_OPTIONS.ar;
  const currentVal = selectEl.value;
  selectEl.innerHTML = list.map(opt => {
    return `<option value="${opt.value}" ${opt.value === currentVal ? 'selected' : ''}>${opt.text}</option>`;
  }).join('');
}

window.onRsvpSelectChange = function() {
  const rsvpSelect = document.getElementById('gb-rsvp');
  const messageInput = document.getElementById('gb-message');
  if (!rsvpSelect || !messageInput) return;
  
  const selectedOpt = rsvpSelect.options[rsvpSelect.selectedIndex];
  if (selectedOpt && selectedOpt.value !== "") {
    messageInput.value = selectedOpt.text;
  } else {
    messageInput.value = "";
  }
};

let _confirmedInvitations = [];

function watchRsvpCounter() {
  const params = new URLSearchParams(window.location.search);
  const invSlug = params.get('inv');
  if (!invSlug) return;

  initFirebase();
  _db.collection('invitations').doc(invSlug).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    
    // 1. Process wishes in real-time for the couple's inbox!
    if (_currentRole === 'groom' || _currentRole === 'bride') {
      processWishesForRole(data.wishes);
    }
    
    // 2. Sum up RSVPs in real-time!
    const rsvps = data.rsvps || {};
    let totalConfirmed = 0;
    _confirmedInvitations = [];
    
    Object.keys(rsvps).forEach(key => {
      const rsvp = rsvps[key];
      if (rsvp.confirmed) {
        const count = Number(rsvp.count || 1);
        totalConfirmed += count;
        _confirmedInvitations.push({
          id: key,
          guestName: rsvp.name || 'عام',
          rsvpCount: count
        });
      }
    });
    
    const badge = document.getElementById('admin-rsvp-counter');
    if (badge && (_currentRole === 'groom' || _currentRole === 'bride')) {
      const countEl = document.getElementById('rsvp-count-num');
      if (countEl) countEl.textContent = totalConfirmed;
      badge.style.display = 'flex';
      badge.style.cursor = 'pointer';
      badge.onclick = openRsvpList;
    } else if (badge) {
      badge.style.display = 'none';
    }
  }, err => console.warn('[InvitApp] Failed to watch RSVP counter:', err));
}

window.openRsvpList = function() {
  const overlay = document.getElementById('rsvp-list-overlay');
  const scrollList = document.getElementById('rsvp-guests-scroll-list');
  const totalPopup = document.getElementById('rsvp-total-popup');
  if (!overlay || !scrollList) return;
  
  let totalCount = 0;
  
  if (_confirmedInvitations.length === 0) {
    scrollList.innerHTML = `
      <div style="text-align:center; color:var(--brown-mid); font-size:0.9rem; padding:20px;">
        لا يوجد حضور مؤكد بعد 🌹
      </div>`;
    totalPopup.textContent = '0';
  } else {
    scrollList.innerHTML = _confirmedInvitations.map(inv => {
      totalCount += inv.rsvpCount;
      
      return `
        <div style="background:rgba(201,168,76,0.06); border:1px solid rgba(201,168,76,0.15); border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; width:100%; text-align:right;">
          <strong style="color:var(--brown); font-size:1.05rem;">👤 ${inv.guestName}</strong>
          <span style="background:linear-gradient(135deg, #FCF6BA 0%, #c9a84c 50%, #8a6010 100%); color:#1a1000; font-size:0.75rem; font-weight:bold; padding:2px 8px; border-radius:12px;">+${inv.rsvpCount}</span>
        </div>
      `;
    }).join('');
    totalPopup.textContent = totalCount;
  }
  
  overlay.style.display = 'flex';
};

window.closeRsvpList = function() {
  const overlay = document.getElementById('rsvp-list-overlay');
  if (overlay) overlay.style.display = 'none';
};

/* ────────────────────────────────────────────────
   WEATHER FORECAST WIDGET — Open-Meteo (Dynamic)
   Reads lat/lon from first event in cfg.ev, date from cfg.wd.
   Falls back to Teboulba defaults if no config available.
   ──────────────────────────────────────────────── */

/**
 * Extracts weather-relevant params from config and updates globals.
 * Called every time a config is applied to DOM.
 */
function extractWeatherParamsFromConfig(cfg) {
  if (!cfg) return;

  // ── Date: from cfg.wd (format: "YYYY-MM-DDTHH:mm:ss") ──
  if (cfg.wd) {
    _weatherDate = cfg.wd.split('T')[0]; // keep only YYYY-MM-DD
  }

  // ── Coordinates: from first active event with valid lat/lng ──
  if (cfg.ev && cfg.ev.length) {
    const firstWithCoords = cfg.ev.find(e => e.la && e.lo && parseFloat(e.la) && parseFloat(e.lo));
    if (firstWithCoords) {
      _weatherLat = parseFloat(firstWithCoords.la);
      _weatherLon = parseFloat(firstWithCoords.lo);
      _weatherLocation = firstWithCoords.l || null;
    }
  }

  // ── Update location label in the weather card ──
  if (_weatherLocation) {
    document.querySelectorAll('[data-tr="weather_location"]').forEach(el => {
      el.textContent = _weatherLocation;
    });
  }
}

/**
 * Shared WMO code → description/icon mapper
 */
function _weatherCodeToDesc(code) {
  if (code === 0)                  return { ar: 'صافي ومشمس',    fr: 'Ensoleillé',               icon: '☀️' };
  if (code >= 1  && code <= 3)     return { ar: 'غائم جزئياً',   fr: 'Partiellement nuageux',     icon: '⛅' };
  if (code >= 45 && code <= 48)    return { ar: 'ضباب كثيف',     fr: 'Brouillard',                icon: '🌫️' };
  if (code >= 51 && code <= 67)    return { ar: 'أمطار خفيفة',   fr: 'Pluie légère',              icon: '🌧️' };
  if (code >= 71 && code <= 86)    return { ar: 'تساقط ثلوج',    fr: 'Neige',                     icon: '❄️' };
  if (code >= 95)                  return { ar: 'عواصف رعدية',   fr: 'Orageux',                   icon: '⛈️' };
  return                                   { ar: 'غائم',          fr: 'Nuageux',                   icon: '☁️' };
}

function _applyWeatherToDOM(temp, humidity, wind, code) {
  const isFr = document.documentElement.lang === 'fr';
  const { ar, fr, icon } = _weatherCodeToDesc(code);

  const tempVal    = document.getElementById('weather-temp-val');
  const descText   = document.getElementById('weather-desc-text');
  const humidityEl = document.getElementById('weather-humidity-val');
  const windEl     = document.getElementById('weather-wind-val');
  const iconGlow   = document.querySelector('.weather-icon-glow');
  const card       = document.querySelector('.weather-glass-card');

  if (tempVal)    tempVal.textContent    = `${temp}°C`;
  if (descText)   descText.textContent   = isFr ? `${fr} ${icon}` : `${ar} ${icon}`;
  if (humidityEl) humidityEl.textContent = `${humidity}%`;
  if (windEl)     windEl.textContent     = `${wind} km/h`;
  if (iconGlow)   iconGlow.textContent   = icon;
  if (card)       card.classList.remove('weather-skeleton');
}

function loadWeatherForecast() {
  const lat  = _weatherLat;
  const lon  = _weatherLon;
  const isFr = document.documentElement.lang === 'fr';

  // Determine if we should use daily forecast (future) or current conditions
  const today    = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const wDate    = _weatherDate || today;
  const isFuture = wDate > today;

  let url;
  if (isFuture) {
    // Forecast: ask for the specific wedding date daily data
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,windspeed_10m_max,precipitation_probability_max`
        + `&start_date=${wDate}&end_date=${wDate}&timezone=auto`;
  } else {
    // Past date or today: use current conditions
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
  }

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (isFuture) {
        // Daily forecast response
        if (!data || !data.daily) throw new Error('No daily data');
        const d = data.daily;
        const tempMax  = Math.round(d.temperature_2m_max[0]);
        const tempMin  = Math.round(d.temperature_2m_min[0]);
        const tempAvg  = Math.round((tempMax + tempMin) / 2);
        const code     = d.weathercode[0];
        const wind     = Math.round(d.windspeed_10m_max[0]);
        const precProb = d.precipitation_probability_max ? Math.round(d.precipitation_probability_max[0]) : null;

        // Show single average temperature — clean, no min/max confusion
        const tempVal = document.getElementById('weather-temp-val');
        if (tempVal) {
          tempVal.textContent = `${tempAvg}°C`;
        }

        // Rain probability in the humidity slot
        const humidityEl = document.getElementById('weather-humidity-val');
        if (humidityEl) humidityEl.textContent = precProb !== null ? `${precProb}%` : '--';

        const windEl = document.getElementById('weather-wind-val');
        if (windEl) windEl.textContent = `${wind} km/h`;

        const { ar, fr, icon } = _weatherCodeToDesc(code);
        const descText  = document.getElementById('weather-desc-text');
        if (descText)   descText.textContent = isFr ? `${fr} ${icon}` : `${ar} ${icon}`;
        const iconGlow  = document.querySelector('.weather-icon-glow');
        if (iconGlow)   iconGlow.textContent = icon;
        const card = document.querySelector('.weather-glass-card');
        if (card) card.classList.remove('weather-skeleton');

        // Short label for rain probability (fits in one line)
        document.querySelectorAll('[data-tr="weather_humidity"]').forEach(el => {
          el.textContent = isFr ? 'Pluie' : 'مطر';
        });

      } else {
        // Current conditions response
        if (!data || !data.current) throw new Error('No current data');
        const c = data.current;
        _applyWeatherToDOM(
          Math.round(c.temperature_2m),
          Math.round(c.relative_humidity_2m),
          Math.round(c.wind_speed_10m),
          c.weather_code
        );
      }
    })
    .catch(err => {
      console.warn('[InvitApp] Weather API failed, using seasonal fallback:', err);
      // Seasonal fallback based on month of wedding date
      const month = _weatherDate ? parseInt(_weatherDate.split('-')[1]) : new Date().getMonth() + 1;
      const isSummer = month >= 5 && month <= 9;
      const fallbackTemp = isSummer ? '31°C' : '18°C';
      const fallbackDesc = isSummer
        ? (isFr ? 'Estival et ensoleillé ☀️' : 'صيفي مشمس وجميل ☀️')
        : (isFr ? 'Doux et agréable 🌤️' : 'معتدل وجميل 🌤️');

      const tempVal    = document.getElementById('weather-temp-val');
      const descText   = document.getElementById('weather-desc-text');
      const humidityEl = document.getElementById('weather-humidity-val');
      const windEl     = document.getElementById('weather-wind-val');
      const iconGlow   = document.querySelector('.weather-icon-glow');
      const card       = document.querySelector('.weather-glass-card');

      if (tempVal)    tempVal.textContent    = fallbackTemp;
      if (descText)   descText.textContent   = fallbackDesc;
      if (humidityEl) humidityEl.textContent = isSummer ? '52%' : '65%';
      if (windEl)     windEl.textContent     = isSummer ? '14 km/h' : '18 km/h';
      if (iconGlow)   iconGlow.textContent   = isSummer ? '☀️' : '🌤️';
      if (card)       card.classList.remove('weather-skeleton');
    });
}

/* ────────────────────────────────────────────────
   PHOTO STACK WIDGET LOGIC
   ──────────────────────────────────────────────── */
function initPhotoStack(cfg) {
  const section = document.getElementById('photo-stack-section');
  const wrapper = document.getElementById('photo-stack-cards-wrapper');
  const widget  = document.getElementById('photo-stack-widget');

  if (!section || !wrapper || !widget) return;

  // 1. Must be globally enabled
  const isEnabled = cfg.features && cfg.features.photoStack === true;
  if (!isEnabled) {
    section.style.display = 'none';
    wrapper.innerHTML = '';
    return;
  }

  // 2. Determine which photos to show based on ?gid= or ?view= in URL
  const params   = new URLSearchParams(window.location.search);
  const gid      = params.get('gid') || params.get('guest') || null;
  const view     = params.get('view') || null;

  let rawPhotos = null;

  if (gid) {
    // Sub-guest link: ONLY show photos specifically assigned to this guest
    const perGuest = cfg.features.guestPhotos;
    if (perGuest && Array.isArray(perGuest[gid]) && perGuest[gid].length > 0) {
      rawPhotos = perGuest[gid];
    }
  } else if (view === 'groom' || view === 'bride') {
    // Groom/Bride view: look up guestPhotos['groom'] or guestPhotos['bride']
    const perGuest = cfg.features.guestPhotos;
    if (perGuest && Array.isArray(perGuest[view]) && perGuest[view].length > 0) {
      rawPhotos = perGuest[view];
    } else {
      // Fallback: if no custom couple photos are configured, show the 3 default couple photos
      const isFr = cfg.la === 'fr';
      rawPhotos = [
        { url: 'assets/default_couple_1.jpg', caption: isFr ? '💍 Notre bonheur est complet' : '💍 فرحتنا اكتملت' },
        { url: 'assets/default_couple_2.jpg', caption: isFr ? '✨ Le grand jour' : '✨ ليلة العمر' },
        { url: 'assets/default_couple_3.jpg', caption: isFr ? '❤️ Amour infini' : '❤️ حب أبدي' }
      ];
    }
  } else {
    // General link (no gid, no view): use global photoStackPhotos
    if (Array.isArray(cfg.features.photoStackPhotos) && cfg.features.photoStackPhotos.length > 0) {
      rawPhotos = cfg.features.photoStackPhotos;
    } else {
      // Fallback to default code-based general photo
      const isFr = cfg.la === 'fr';
      rawPhotos = [
        { url: 'assets/default_wedding_general.jpg', caption: isFr ? '💍 Notre bonheur est complet' : '💍 فرحتنا اكتملت' },
        { url: 'assets/default_wedding_general.jpg', caption: isFr ? '✨ Le grand jour' : '✨ ليلة العمر' },
        { url: 'assets/default_wedding_general.jpg', caption: isFr ? '❤️ Amour infini' : '❤️ حب أبدي' }
      ];
    }
  }

  if (!rawPhotos || rawPhotos.length === 0) {
    section.style.display = 'none';
    wrapper.innerHTML = '';
    return;
  }

  // 3. Normalise photo objects
  const photos = rawPhotos.map(p => {
    if (typeof p === 'string')  return { url: p.trim(), caption: '' };
    if (p && typeof p === 'object' && p.url) return { url: p.url.trim(), caption: p.caption || '' };
    return null;
  }).filter(p => p && p.url !== '');

  if (photos.length === 0) {
    section.style.display = 'none';
    wrapper.innerHTML = '';
    return;
  }
  
  // Show section
  section.style.display = 'flex';
  
  // 3. Set Theme
  let theme = cfg.features.photoStackTheme || 'floral';
  if (theme === 'emerald') theme = 'royal';
  if (theme !== 'floral' && theme !== 'vintage' && theme !== 'royal') {
    theme = 'floral';
  }
  widget.setAttribute('data-theme', theme);
  
  // 4. Render cards
  wrapper.innerHTML = '';
  const numPhotos = photos.length;
  let activeIndex = 0;
  
  const cardElements = photos.map((photo, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card-item';
    
    // Frame
    const frame = document.createElement('div');
    frame.className = 'card-frame';
    
    // Medallion
    const medallion = document.createElement('div');
    medallion.className = 'card-medallion';
    medallion.innerHTML = `
      <svg class="medallion-icon" viewBox="0 0 64 64">
        <path d="M12 44 L18 20 L28 32 L32 16 L36 32 L42 20 L48 44 Z" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="12" cy="18" r="2.5" fill="currentColor"/>
        <circle cx="32" cy="14" r="2.5" fill="currentColor"/>
        <circle cx="48" cy="18" r="2.5" fill="currentColor"/>
      </svg>
    `;
    frame.appendChild(medallion);
    
    // Corner Filigrees
    const corners = ['tl', 'tr', 'bl', 'br'];
    corners.forEach(pos => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', `corner-filigree corner-${pos}`);
      svg.setAttribute('viewBox', '0 0 40 40');
      svg.innerHTML = `
        <path d="M 5,5 L 20,5 M 5,5 L 5,20" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <circle cx="10" cy="10" r="2" fill="currentColor"/>
      `;
      frame.appendChild(svg);
    });
    
    // Image wrapper
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'card-image-wrapper';
    
    const img = document.createElement('img');
    img.className = 'card-photo';
    img.alt = photo.caption || 'Wedding Photo';
    img.loading = 'lazy';
    img.src = photo.url;
    
    // Fallback on error
    img.onerror = function() {
      console.warn('[InvitApp] Photo Stack image failed to load:', photo.url);
      imgWrapper.style.background = 'rgba(201,168,76,0.06)';
      imgWrapper.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; color:var(--gold); font-family:sans-serif; text-align:center; padding:15px; box-sizing:border-box;">
          <span style="font-size:2rem; margin-bottom:8px;">❤️</span>
          <span class="font-amiri" style="font-size:1.1rem; color:var(--gold-light);">M & M</span>
        </div>
      `;
    };
    
    imgWrapper.appendChild(img);
    frame.appendChild(imgWrapper);
    
    // Caption
    if (photo.caption) {
      const caption = document.createElement('div');
      caption.className = 'card-caption';
      caption.textContent = photo.caption;
      frame.appendChild(caption);
    }
    
    card.appendChild(frame);
    
    // Vintage light paper grain overlay
    const grain = document.createElement('div');
    grain.className = 'grain-overlay';
    card.appendChild(grain);
    
    wrapper.appendChild(card);
    return card;
  });
  
  // 5. Update Positions
  function updatePositions() {
    cardElements.forEach((card, index) => {
      card.classList.remove('card-top', 'card-mid', 'card-back', 'card-hidden');
      
      let diff = (index - activeIndex + numPhotos) % numPhotos;
      
      if (numPhotos === 1) {
        card.classList.add('card-top');
        card.removeAttribute('role');
        card.removeAttribute('tabindex');
        card.removeAttribute('aria-label');
      } else if (numPhotos === 2) {
        if (diff === 0) {
          card.classList.add('card-top');
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', TRANSLATIONS[_currentLang || 'ar'].photo_stack_next || 'Photo suivante');
        } else {
          card.classList.add('card-mid');
          card.removeAttribute('role');
          card.removeAttribute('tabindex');
          card.removeAttribute('aria-label');
        }
      } else {
        if (diff === 0) {
          card.classList.add('card-top');
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', TRANSLATIONS[_currentLang || 'ar'].photo_stack_next || 'Photo suivante');
        } else if (diff === 1) {
          card.classList.add('card-mid');
          card.removeAttribute('role');
          card.removeAttribute('tabindex');
          card.removeAttribute('aria-label');
        } else if (diff === 2) {
          card.classList.add('card-back');
          card.removeAttribute('role');
          card.removeAttribute('tabindex');
          card.removeAttribute('aria-label');
        } else {
          card.classList.add('card-hidden');
          card.removeAttribute('role');
          card.removeAttribute('tabindex');
          card.removeAttribute('aria-label');
        }
      }
    });
  }
  
  // 6. Interactive Event listeners
  if (numPhotos > 1) {
    const handleNextCard = (e) => {
      const card = e.target.closest('.photo-card-item');
      if (card && card.classList.contains('card-top')) {
        activeIndex = (activeIndex + 1) % numPhotos;
        updatePositions();
      }
    };
    
    wrapper.addEventListener('click', handleNextCard);
    
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.photo-card-item');
        if (card && card.classList.contains('card-top')) {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % numPhotos;
          updatePositions();
        }
      }
    });
  }
  
  updatePositions();
}

/* ────────────────────────────────────────────────
   MINI FEUILLET ÉPHÉMÉRIDE WIDGET
──────────────────────────────────────────────── */
function renderPremiumCalendar() {
  const monthYearEl = document.getElementById('calendar-month-year');
  const dayNumEl    = document.getElementById('mini-calendar-day');
  const weekdayEl   = document.getElementById('mini-calendar-weekday');
  if (!monthYearEl || !dayNumEl) return;

  const wDate = new Date(_weddingDateTime);
  if (isNaN(wDate.getTime())) return;

  const year       = wDate.getFullYear();
  const month      = wDate.getMonth(); // 0-indexed
  const weddingDay = wDate.getDate();
  const dayOfWeek  = wDate.getDay();   // 0 = Sun

  const isFr = typeof _currentLang !== 'undefined' && _currentLang === 'fr';

  // Month names
  const arMonths = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const frMonths = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthName = isFr ? frMonths[month] : arMonths[month];
  monthYearEl.textContent = `${monthName} ${year}`;

  dayNumEl.textContent = weddingDay;

  // Weekdays
  const arDaysFull = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const frDaysFull = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  if (weekdayEl) {
    weekdayEl.textContent = isFr ? frDaysFull[dayOfWeek] : arDaysFull[dayOfWeek];
  }
}

/* ────────────────────────────────────────────────
   SOUVENIR DOWNLOAD LOGIC
──────────────────────────────────────────────── */
function openSouvenirModal() {
  const modal = document.getElementById('souvenir-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSouvenirModal() {
  const modal = document.getElementById('souvenir-modal');
  if (modal) modal.style.display = 'none';
}

function _getSouvenirData() {
  const isFr = typeof _currentLang !== 'undefined' && _currentLang === 'fr';
  const guestTitle = document.getElementById('guestCardTitle')?.textContent || (isFr ? 'Monsieur & Madame' : 'إلى السيد');
  const guestName  = document.getElementById('guestBannerLabel')?.textContent || _resolvedGuestName || (isFr ? 'Nos Chers Invités' : 'ضيوفنا الكرام');
  const groom = document.querySelector('[data-cfg="groomNameDisplay"]')?.textContent || 'مرتضى';
  const bride = document.querySelector('[data-cfg="brideNameDisplay"]')?.textContent || 'مريم';
  const wDate = new Date(_weddingDateTime);
  const arMonths = ['جانفي','فيفري','مارس','أفريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const frMonths = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const arDays   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const frDays   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const monthName  = isFr ? frMonths[wDate.getMonth()] : arMonths[wDate.getMonth()];
  const dayName    = isFr ? frDays[wDate.getDay()] : arDays[wDate.getDay()];
  const dayNum     = wDate.getDate();
  const year       = wDate.getFullYear();
  const dateStr    = isFr ? `${dayName} ${dayNum} ${monthName} ${year}` : `${dayName} ${dayNum} ${monthName} ${year}`;
  const groomFather = document.querySelector('[data-cfg="groomFather"]')?.textContent || '';
  const brideFather = document.querySelector('[data-cfg="brideFather"]')?.textContent || '';
  return { isFr, guestTitle, guestName, groom, bride, dateStr, dayNum, monthName, year, groomFather, brideFather };
}

function _buildRoyalSouvenirHTML(data) {
  const { isFr, guestTitle, guestName, groom, bride, dateStr, dayNum, monthName, year, groomFather, brideFather } = data;
  const isRtl = !isFr;
  const dir   = isRtl ? 'rtl' : 'ltr';
  const lang  = isRtl ? 'ar' : 'fr';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guestTitle} ${guestName} — ${isFr ? 'Invitation Mariage' : 'دعوة الزفاف'} ${groom} & ${bride}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Playfair+Display:ital,wght@1,400;0,600;0,700&family=Dancing+Script:wght@600;700&family=Cinzel+Decorative:wght@700&family=Great+Vibes&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: radial-gradient(ellipse at center, #1a1008 0%, #0a0502 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 16px 40px;
      font-family: 'Amiri', serif;
    }

    /* ── Outer page border glow ── */
    .page-wrapper {
      width: 100%;
      max-width: 600px;
      position: relative;
    }
    .page-wrapper::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 28px;
      background: conic-gradient(from 0deg, #c9a84c, #f5e190, #c9a84c, #8a5d00, #c9a84c, #f5e190, #c9a84c);
      animation: rotateBorder 6s linear infinite;
      z-index: -1;
      filter: blur(1px);
    }
    @keyframes rotateBorder {
      to { transform: rotate(360deg); }
    }

    /* ── Main card ── */
    .card {
      background: linear-gradient(160deg, #fdf8ee 0%, #f7eed9 40%, #eedfc0 100%);
      border-radius: 26px;
      padding: 0;
      overflow: hidden;
      position: relative;
      box-shadow:
        0 30px 80px rgba(0,0,0,0.6),
        0 0 0 3px rgba(201,168,76,0.7),
        inset 0 0 40px rgba(201,168,76,0.1);
    }

    /* ── Top Envelope Flap (SVG) ── */
    .envelope-svg-top {
      width: 100%;
      display: block;
      margin-bottom: -2px;
    }

    /* ── Silk Ribbon ── */
    .ribbon-wrap {
      position: relative;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: -1px 0;
      background: linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.15) 30%, rgba(201,168,76,0.25) 50%, rgba(201,168,76,0.15) 70%, transparent 100%);
    }
    .ribbon {
      position: absolute;
      left: 0; right: 0;
      height: 36px;
      background: linear-gradient(180deg, #c9a84c 0%, #a07830 25%, #f5e190 50%, #a07830 75%, #c9a84c 100%);
      opacity: 0.92;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .ribbon-text {
      position: relative;
      z-index: 2;
      font-family: 'Great Vibes', cursive;
      font-size: 1.15rem;
      color: #1a1000;
      text-shadow: 0 1px 1px rgba(255,255,255,0.4);
      letter-spacing: 1px;
    }

    /* ── Card body ── */
    .card-body {
      padding: 28px 32px 24px;
      position: relative;
      direction: ${dir};
    }

    /* Corner ornaments */
    .corner {
      position: absolute;
      width: 60px;
      height: 60px;
      opacity: 0.55;
    }
    .corner-tl { top: 8px; ${isRtl ? 'right' : 'left'}: 8px; }
    .corner-tr { top: 8px; ${isRtl ? 'left' : 'right'}: 8px; transform: scaleX(-1); }
    .corner-bl { bottom: 8px; ${isRtl ? 'right' : 'left'}: 8px; transform: scaleY(-1); }
    .corner-br { bottom: 8px; ${isRtl ? 'left' : 'right'}: 8px; transform: scale(-1,-1); }

    /* Envelope nominative zone */
    .env-address {
      background: linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.05) 100%);
      border: 1.5px solid rgba(201,168,76,0.5);
      border-radius: 16px;
      padding: 18px 22px;
      text-align: center;
      margin-bottom: 24px;
      position: relative;
    }
    .env-address::before {
      content: '✦ ✦ ✦';
      display: block;
      color: rgba(201,168,76,0.6);
      font-size: 0.7rem;
      letter-spacing: 4px;
      margin-bottom: 8px;
    }
    .env-address::after {
      content: '— ✦ —';
      display: block;
      color: rgba(201,168,76,0.6);
      font-size: 0.7rem;
      letter-spacing: 3px;
      margin-top: 8px;
    }
    .env-to-label {
      font-size: 0.9rem;
      color: #8a6000;
      font-style: italic;
      margin-bottom: 4px;
    }
    .env-guest-name {
      font-family: 'Great Vibes', 'Dancing Script', cursive;
      font-size: 2.4rem;
      color: #4a2e0a;
      line-height: 1.25;
      text-shadow: 1px 1px 2px rgba(255,255,255,0.8);
    }

    /* Wax seal inline */
    .seal-line {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin: 6px 0 22px;
    }
    .seal-inline {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 38%, #f5e190 0%, #c9a84c 35%, #8a5d00 70%, #4a2e0a 100%);
      border: 2px solid #c9a84c;
      box-shadow:
        0 0 0 3px rgba(201,168,76,0.3),
        0 6px 18px rgba(0,0,0,0.4),
        inset 0 2px 4px rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      color: #fffcf5;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      flex-shrink: 0;
    }
    .seal-line-bar {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent);
    }

    /* Basmala */
    .basmala {
      text-align: center;
      font-size: 1.2rem;
      color: #6b4d12;
      line-height: 1.7;
      margin-bottom: 6px;
    }

    /* Gold divider */
    .gold-div {
      text-align: center;
      color: #c9a84c;
      letter-spacing: 6px;
      font-size: 0.75rem;
      margin: 10px 0;
    }

    /* Invite text */
    .invite-line {
      text-align: center;
      font-size: 1rem;
      color: #7a5c25;
      margin: 6px 0;
    }

    /* Couple names */
    .names-block {
      text-align: center;
      margin: 18px 0 20px;
    }
    .names-main {
      font-family: 'Great Vibes', cursive;
      font-size: 3.2rem;
      color: #3d2600;
      line-height: 1.15;
      text-shadow: 2px 2px 4px rgba(255,255,255,0.9);
    }
    .names-amp {
      font-family: 'Cinzel Decorative', serif;
      font-size: 1.4rem;
      color: #c9a84c;
      margin: 0 12px;
      vertical-align: middle;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .names-sub {
      font-size: 0.88rem;
      color: #8a6000;
      margin-top: 4px;
      letter-spacing: 0.5px;
    }

    /* Details block */
    .details-card {
      background: linear-gradient(135deg, rgba(255,252,240,0.9) 0%, rgba(242,228,195,0.6) 100%);
      border: 1px solid rgba(201,168,76,0.4);
      border-radius: 14px;
      padding: 18px 22px;
      margin: 6px 0 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .detail-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .detail-icon {
      font-size: 1.2rem;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .detail-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #8a6000;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 1px;
    }
    .detail-val {
      font-size: 1.05rem;
      color: #3d2600;
      font-weight: 600;
    }
    .detail-sep {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(201,168,76,0.3), transparent);
      margin: 2px 0;
    }

    /* Calendar mini inside card */
    .cal-mini {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(201,168,76,0.12);
      border: 1px solid rgba(201,168,76,0.35);
      border-radius: 12px;
      padding: 8px 18px;
      margin: 0 auto 16px;
    }
    .cal-day-big {
      font-family: 'Playfair Display', serif;
      font-size: 2.4rem;
      font-weight: 700;
      color: #8a5d00;
      line-height: 1;
    }
    .cal-month-year {
      display: flex;
      flex-direction: column;
      align-items: ${isRtl ? 'flex-end' : 'flex-start'};
    }
    .cal-month {
      font-size: 1.05rem;
      font-weight: 700;
      color: #5d3c00;
    }
    .cal-year {
      font-size: 0.85rem;
      color: #8a6000;
    }

    /* Thanks note */
    .thanks {
      text-align: center;
      font-size: 0.92rem;
      color: #7a6035;
      font-style: italic;
      line-height: 1.6;
padding: 0 12px;
      margin-bottom: 16px;
    }
    /* Bottom wax seal */
    .bottom-seal {
      text-align: center;
      padding: 12px 0 20px;
    }
    .wax-seal-big {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 35%,
        #f5e190 0%, #d4a830 25%, #b8860b 50%, #7a5300 75%, #3d2600 100%);
      border: 2.5px solid #c9a84c;
      box-shadow:
        0 0 0 4px rgba(201,168,76,0.25),
        0 0 0 8px rgba(201,168,76,0.1),
        0 10px 30px rgba(0,0,0,0.45),
        inset 0 3px 6px rgba(255,255,255,0.25);
      font-size: 1.6rem;
      color: rgba(255,252,220,0.9);
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      margin: 0 auto;
    }
    .seal-label {
      margin-top: 8px;
      font-size: 0.72rem;
      color: #8a6000;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    /* Bottom envelope flap */
    .envelope-svg-bottom {
      width: 100%;
      display: block;
      margin-top: -2px;
    }

    /* Footer watermark */
    .footer-watermark {
      text-align: center;
      margin-top: 20px;
      font-size: 0.72rem;
      color: rgba(201,168,76,0.5);
      letter-spacing: 1px;
    }

    @media print {
      body { background: #fff; padding: 0; }
      .page-wrapper::before { display: none; }
      .card { box-shadow: 0 0 0 2px #c9a84c; }
    }
  </style>
</head>
<body>

<div class="page-wrapper">
<div class="card">

  <!-- Top Envelope Flap SVG -->
  <svg class="envelope-svg-top" viewBox="0 0 600 140" preserveAspectRatio="none">
    <defs>
      <linearGradient id="flapGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e8d5a0"/>
        <stop offset="100%" stop-color="#c9a84c" stop-opacity="0.6"/>
      </linearGradient>
    </defs>
    <polygon points="0,0 600,0 300,120" fill="url(#flapGrad)" opacity="0.95"/>
    <polygon points="0,0 600,0 300,120" fill="none" stroke="#c9a84c" stroke-width="1.5" opacity="0.4"/>
    <!-- Flap decorative lines -->
    <line x1="50" y1="10" x2="550" y2="10" stroke="#c9a84c" stroke-width="0.6" opacity="0.4"/>
    <line x1="80" y1="20" x2="520" y2="20" stroke="#c9a84c" stroke-width="0.4" opacity="0.3"/>
    <!-- Corner ornament dots -->
    <circle cx="30" cy="18" r="4" fill="#c9a84c" opacity="0.5"/>
    <circle cx="570" cy="18" r="4" fill="#c9a84c" opacity="0.5"/>
    <!-- Center monogram on flap -->
    <text x="300" y="58" text-anchor="middle" font-family="'Great Vibes', cursive" font-size="28" fill="#7a5c1a" opacity="0.6">${groom[0]} &amp; ${bride[0]}</text>
  </svg>

  <!-- Ribbon -->
  <div class="ribbon-wrap">
    <div class="ribbon"></div>
    <div class="ribbon-text">${isFr ? `✦ Invitation au Mariage ✦` : `✦ دعوة الزفاف ✦`}</div>
  </div>

  <!-- Card Body -->
  <div class="card-body">
    <!-- Corner SVG ornaments -->
    <svg class="corner corner-tl" viewBox="0 0 80 80" fill="none"><path d="M4,4 L36,4" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 L4,36" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 Q32,4 32,32" stroke="#c9a84c" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><circle cx="4" cy="4" r="4" fill="#c9a84c" opacity="0.8"/></svg>
    <svg class="corner corner-tr" viewBox="0 0 80 80" fill="none"><path d="M4,4 L36,4" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 L4,36" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 Q32,4 32,32" stroke="#c9a84c" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><circle cx="4" cy="4" r="4" fill="#c9a84c" opacity="0.8"/></svg>
    <svg class="corner corner-bl" viewBox="0 0 80 80" fill="none"><path d="M4,4 L36,4" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 L4,36" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 Q32,4 32,32" stroke="#c9a84c" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><circle cx="4" cy="4" r="4" fill="#c9a84c" opacity="0.8"/></svg>
    <svg class="corner corner-br" viewBox="0 0 80 80" fill="none"><path d="M4,4 L36,4" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 L4,36" stroke="#c9a84c" stroke-width="2" stroke-linecap="round"/><path d="M4,4 Q32,4 32,32" stroke="#c9a84c" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><circle cx="4" cy="4" r="4" fill="#c9a84c" opacity="0.8"/></svg>

    <!-- Nominative Envelope Zone -->
    <div class="env-address">
      <div class="env-to-label">${guestTitle}</div>
      <div class="env-guest-name">${guestName}</div>
    </div>

    <!-- Inline wax seal divider -->
    <div class="seal-line">
      <div class="seal-line-bar"></div>
      <div class="seal-inline">✦</div>
      <div class="seal-line-bar"></div>
    </div>

    <!-- Basmala -->
    <div class="basmala">بارك الله لهما وبارك عليهما وجمع بينهما في خير</div>
    <div class="gold-div">✦ ✦ ✦</div>

    <!-- Invite lines -->
    <div class="invite-line">${isFr ? `Les familles` : `تتشرف عائلتا`}</div>
    ${groomFather ? `<div class="invite-line" style="font-weight:700; color:#4a2e0a; font-size:1.05rem;">${groomFather}</div>` : ''}
    ${brideFather ? `<div class="invite-line" style="font-weight:700; color:#4a2e0a; font-size:1.05rem;">${brideFather}</div>` : ''}
    <div class="invite-line" style="margin-top:8px;">${isFr ? `ont l'honneur de vous inviter au mariage de leurs enfants` : `بدعوتكم لحضور حفل زفاف نجليهما`}</div>

    <!-- Couple Names -->
    <div class="names-block">
      <div class="names-main">
        ${isRtl
          ? `${groom} <span class="names-amp">&amp;</span> ${bride}`
          : `${groom} <span class="names-amp">&amp;</span> ${bride}`}
      </div>
      <div class="names-sub">${isFr ? 'Mariage de' : 'زفاف مبارك'} ${groom} &amp; ${bride}</div>
    </div>

    <!-- Mini Calendar + Details -->
    <div class="cal-mini">
      <div class="cal-day-big">${dayNum}</div>
      <div class="cal-month-year">
        <div class="cal-month">${monthName}</div>
        <div class="cal-year">${year}</div>
      </div>
    </div>

    <div class="details-card">
      <div class="detail-row">
        <div class="detail-icon">📅</div>
        <div>
          <div class="detail-label">${isFr ? 'Date' : 'التاريخ'}</div>
          <div class="detail-val">${dateStr}</div>
        </div>
      </div>
      <div class="detail-sep"></div>
      <div class="detail-row">
        <div class="detail-icon">📍</div>
        <div>
          <div class="detail-label">${isFr ? 'Lieu' : 'المكان'}</div>
          <div class="detail-val">${isFr ? 'Palais des Fêtes — Teboulba, Monastir, Tunisie' : 'قصر الأفراح — طبلبة، المنستير، تونس'}</div>
        </div>
      </div>
    </div>

    <div class="gold-div">— ✦ —</div>

    <!-- Thanks -->
    <div class="thanks">
      ${isFr
        ? 'Nous vous remercions chaleureusement pour votre présence<br>et votre affection sincère ❤'
        : 'نشكركم جزيل الشكر على حضوركم ومحبتكم<br>دمتُم سنداً وفرحاً لنا ❤'}
    </div>

    <!-- Big wax seal bottom -->
    <div class="bottom-seal">
      <div class="wax-seal-big">✦</div>
      <div class="seal-label">${isFr ? 'Sceau Royal' : 'الختم الملكي'}</div>
    </div>
  </div>

  <!-- Bottom Envelope Flap -->
  <svg class="envelope-svg-bottom" viewBox="0 0 600 80" preserveAspectRatio="none">
    <defs>
      <linearGradient id="botFlapGrad" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#c9a84c" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#e8d5a0"/>
      </linearGradient>
    </defs>
    <polygon points="0,80 600,80 300,0" fill="url(#botFlapGrad)" opacity="0.85"/>
    <polygon points="0,80 600,80 300,0" fill="none" stroke="#c9a84c" stroke-width="1.5" opacity="0.35"/>
  </svg>

</div><!-- /card -->

<div class="footer-watermark">
  ${isFr ? `Souvenir Exclusif — Mariage de ${groom} & ${bride}` : `تذكار حصري — زفاف ${groom} & ${bride}`}
</div>
</div><!-- /page-wrapper -->

</body>
</html>`;
}

function downloadSouvenirHtml() {
  closeSouvenirModal();
  const data = _getSouvenirData();
  const htmlContent = _buildRoyalSouvenirHTML(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const sanitizedGuest = (data.guestName || 'Souvenir').replace(/[^a-z0-9_\u0600-\u06FF]/gi, '_');
  a.download = `Invitation_Royale_${sanitizedGuest}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadSouvenirImage() {
  closeSouvenirModal();

  const isFr = typeof _currentLang !== 'undefined' && _currentLang === 'fr';

  if (typeof html2canvas === 'undefined') {
    alert(isFr ? "La bibliothèque d'image est en cours de chargement, veuillez réessayer." : 'جاري تحميل مكتبة الصور، يرجى المحاولة بعد ثوانٍ.');
    return;
  }

  const data = _getSouvenirData();
  const { guestTitle, guestName, groom, bride, dateStr, dayNum, monthName, year } = data;
  const isRtl = !isFr;
  const dir = isRtl ? 'rtl' : 'ltr';

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: 0;
    left: -9999px;
    width: 540px;
    background: radial-gradient(ellipse at 50% 30%, #22160c 0%, #110904 70%, #060301 100%);
    padding: 30px 20px 25px;
    box-sizing: border-box;
    font-family: 'Amiri', 'Traditional Arabic', 'Playfair Display', serif;
    direction: ${dir};
    color: #2c1d11;
  `;

  const mono = `${groom[0] || 'م'} & ${bride[0] || 'م'}`;

  container.innerHTML = `
    <div style="position: relative; width: 100%; margin: 0 auto; text-align: center;">

      <!-- ── 1. TOP ENVELOPE OPEN FLAP (Elegant Parchment V-Flap) ── -->
      <svg width="460" height="105" viewBox="0 0 460 105" style="display: block; margin: 0 auto -42px auto; position: relative; z-index: 1;" preserveAspectRatio="none">
        <defs>
          <linearGradient id="topFlapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f5e8c4"/>
            <stop offset="50%" stop-color="#e2c687"/>
            <stop offset="100%" stop-color="#c49e52"/>
          </linearGradient>
          <filter id="flapShadow" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
          </filter>
        </defs>
        <!-- Triangle Flap pointing UP -->
        <polygon points="0,105 460,105 230,0" fill="url(#topFlapGrad)" filter="url(#flapShadow)"/>
        <polygon points="0,105 460,105 230,0" fill="none" stroke="#fcf2d4" stroke-width="2" opacity="0.8"/>
        <!-- Inner flap gold foil trim -->
        <polygon points="16,103 444,103 230,10" fill="none" stroke="#9e7b2f" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.5"/>
      </svg>

      <!-- ── 2. INVITATION CARD (Sliding out of Envelope) ── -->
      <div style="
        position: relative;
        z-index: 2;
        width: 460px;
        margin: 0 auto;
        background: linear-gradient(155deg, #fffdfa 0%, #fbf5e6 50%, #f4e7cd 100%);
        border: 2.5px solid #d4af37;
        border-radius: 14px;
        box-shadow: 0 10px 28px rgba(0,0,0,0.42), inset 0 0 0 4px rgba(212,175,55,0.22);
        padding: 22px 20px 72px 20px;
        box-sizing: border-box;
      ">

        <!-- Top Gold Ornament Stars (No Monogram Repetition) -->
        <div style="color: #c9a84c; font-size: 0.85rem; letter-spacing: 4px; margin-bottom: 10px;">
          ✦ ✦ ✦
        </div>

        <!-- Guest Salutation Card -->
        <div style="
          background: rgba(255, 255, 255, 0.9);
          border: 1.5px dashed #c59b27;
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 16px;
          box-shadow: 0 3px 10px rgba(140, 109, 35, 0.08);
        ">
          <div style="font-size: 0.8rem; color: #8c6d23; margin-bottom: 2px; font-style: italic;">
            ${guestTitle}
          </div>
          <div style="font-size: 1.6rem; font-weight: bold; color: #4a3410; line-height: 1.2;">
            ${guestName}
          </div>
        </div>

        <!-- Verse / Blessing -->
        <div style="font-size: 1.05rem; color: #7a5a18; font-weight: bold; margin-bottom: 4px; line-height: 1.5;">
          بارك الله لهما وبارك عليهما وجمع بينهما في خير
        </div>

        <div style="color: #d4af37; font-size: 0.85rem; letter-spacing: 4px; margin: 6px 0;">
          ✦ ✦ ✦
        </div>

        <div style="font-size: 0.88rem; color: #664d1a; margin-bottom: 8px;">
          ${isFr ? "Les familles vous invitent au mariage de leurs enfants" : "يتشرف العريسان وعائلاتهما بدعوتكم لحضور حفل الزفاف"}
        </div>

        <!-- Couple Names -->
        <div style="
          font-size: 2.4rem;
          font-weight: bold;
          color: #3b280a;
          margin: 6px 0 12px;
          line-height: 1.1;
        ">
          ${groom} <span style="color: #d4af37; font-size: 1.6rem; vertical-align: middle;">&amp;</span> ${bride}
        </div>

        <!-- Highlighted Date Badge -->
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: rgba(212, 175, 55, 0.12);
          border: 1.5px solid #d4af37;
          border-radius: 12px;
          padding: 8px 18px;
          margin-bottom: 14px;
        ">
          <div style="font-size: 2.1rem; font-weight: 800; color: #8c6d23; line-height: 1;">
            ${dayNum}
          </div>
          <div style="text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-size: 1rem; font-weight: bold; color: #4a3410;">${monthName}</div>
            <div style="font-size: 0.78rem; color: #8c6d23;">${year}</div>
          </div>
        </div>

        <!-- Venue & Details Box -->
        <div style="
          background: #ffffff;
          border: 1px solid #e0c878;
          border-radius: 10px;
          padding: 12px 14px;
          text-align: ${isRtl ? 'right' : 'left'};
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        ">
          <!-- Time & Day Line (No Date Repetition!) -->
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background: #fdf7e7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8860b" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div>
              <div style="font-size: 0.65rem; font-weight: bold; color: #9c7b28; text-transform: uppercase;">
                ${isFr ? 'Jour et Heure' : 'اليوم والتوقيت'}
              </div>
              <div style="font-size: 0.88rem; font-weight: bold; color: #3b280a;">
                ${isFr ? 'Samedi, à partir de 19:00' : 'يوم السبت، بداية من الساعة 19:00'}
              </div>
            </div>
          </div>

          <div style="height: 1px; background: #f0e2b6; margin: 6px 0;"></div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: #fdf7e7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b8860b" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div>
              <div style="font-size: 0.65rem; font-weight: bold; color: #9c7b28; text-transform: uppercase;">
                ${isFr ? 'Lieu' : 'مكان الحفل'}
              </div>
              <div style="font-size: 0.88rem; font-weight: bold; color: #3b280a;">
                ${isFr ? 'Palais des Fêtes — Teboulba, Monastir' : 'قصر الأفراح — طبلبة، المنستير'}
              </div>
            </div>
          </div>
        </div>

      </div><!-- /Card -->

      <!-- ── 3. ENVELOPE FRONT POCKET (470px aligned flush with card & top flap) ── -->
      <div style="
        position: relative;
        z-index: 3;
        width: 470px;
        margin: -80px auto 0 auto;
      ">
        <svg width="470" height="140" viewBox="0 0 470 140" style="display: block; margin: 0 auto;" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pocketGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f5e7c4"/>
              <stop offset="40%" stop-color="#ebd8a7"/>
              <stop offset="100%" stop-color="#d4ba7d"/>
            </linearGradient>
            <filter id="pocketShadow" x="-10%" y="-20%" width="120%" height="140%">
              <feDropShadow dx="0" dy="-4" stdDeviation="5" flood-color="#000" flood-opacity="0.3"/>
            </filter>
          </defs>
          <!-- Front Pocket V-Shape -->
          <polygon points="0,0 235,65 470,0 470,140 0,140" fill="url(#pocketGrad)" filter="url(#pocketShadow)"/>
          <polygon points="0,0 235,65 470,0" fill="none" stroke="#fcf3d9" stroke-width="2"/>
          <line x1="0" y1="0" x2="235" y2="65" stroke="#b89a58" stroke-width="1.2"/>
          <line x1="470" y1="0" x2="235" y2="65" stroke="#b89a58" stroke-width="1.2"/>
        </svg>

        <!-- Postal Stamp Badge (Top Right Corner of Envelope) -->
        <div style="
          position: absolute;
          top: 30px;
          right: 25px;
          background: #faf4e4;
          border: 2px dashed #b8860b;
          border-radius: 4px;
          padding: 4px 10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          text-align: center;
          transform: rotate(4deg);
        ">
          <div style="font-size: 0.6rem; color: #8c6d23; font-weight: bold; text-transform: uppercase;">
            STAMP · 2026
          </div>
          <div style="font-size: 0.75rem; font-weight: bold; color: #4a3410;">
            ${dayNum} ${monthName}
          </div>
        </div>

        <!-- 3D ROYAL CRIMSON & GOLD WAX SEAL (Matching Main Envelope Seal) -->
        <div style="
          position: absolute;
          top: 28px;
          left: 50%;
          transform: translateX(-50%);
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #d62828 0%, #a81c1c 45%, #700f0f 80%, #3a0505 100%);
          border: 2.5px solid #d4af37;
          box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.35), 0 8px 22px rgba(0,0,0,0.55), inset 0 3px 6px rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        ">
          <!-- Inner Gold Engraved Circle Trim -->
          <div style="
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: 1px dashed rgba(212, 175, 55, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff8dc;
            font-size: 1.05rem;
            font-weight: bold;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
          ">
            ${mono}
          </div>
        </div>

        <!-- Footer Caption (Clean, Elegant, NO repeated names) -->
        <div style="
          margin-top: 14px;
          text-align: center;
          font-size: 0.85rem;
          color: #d4af37;
          font-weight: bold;
        ">
          ✦ تذكار دعوة زفاف ملكية ✦
        </div>

      </div><!-- /Pocket -->

    </div>
  `;

  document.body.appendChild(container);

  const triggerCapture = () => {
    html2canvas(container, {
      scale: 2.5,
      backgroundColor: '#0f0a05',
      useCORS: true,
      logging: false,
    }).then(canvas => {
      document.body.removeChild(container);
      const link = document.createElement('a');
      const sanitizedGuest = (guestName || 'Souvenir').replace(/[^a-z0-9_\u0600-\u06FF]/gi, '_');
      link.download = `Invitation_3D_Souvenir_${sanitizedGuest}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }).catch(err => {
      console.error('Souvenir 3D capture error:', err);
      if (document.body.contains(container)) document.body.removeChild(container);
    });
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => setTimeout(triggerCapture, 100));
  } else {
    setTimeout(triggerCapture, 300);
  }
}

/* ═══════════════════════════════════════════════
   PWA INSTALLATION & SERVICE WORKER LOGIC
   ═══════════════════════════════════════════════ */
let deferredPwaPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
      .catch(err => console.error('[PWA] Service Worker registration failed:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
});

function triggerPWAInstall() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIos) {
    const modal = document.getElementById('iosPwaModal');
    if (modal) modal.style.display = 'flex';
    return;
  }
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        const installContainer = document.getElementById('pwaInstallContainer');
        if (installContainer) installContainer.style.display = 'none';
      }
      deferredPwaPrompt = null;
    });
  } else {
    const modal = document.getElementById('iosPwaModal');
    if (modal) modal.style.display = 'flex';
  }
}

function closeIosPwaModal() {
  const modal = document.getElementById('iosPwaModal');
  if (modal) modal.style.display = 'none';
}

/* ═══════════════════════════════════════════════
   PWA ADMIN GUEST SWITCHER TRICK & SECURITY
   ═══════════════════════════════════════════════ */
function _checkIsAdminAccess() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('admin') === '1' ||
    params.get('view') === 'groom' ||
    params.get('view') === 'bride' ||
    sessionStorage.getItem('admin_authenticated') === 'true' ||
    localStorage.getItem('admin_authenticated') === 'true'
  );
}

function handleMedallionClick(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  // Public guests -> simply opens the envelope!
  if (!_checkIsAdminAccess()) {
    openEnvelopeNow();
    return;
  }
  // Admin user -> opens the PWA Guest Switcher Modal
  openPwaGuestSwitcher();
}

function handleEnvelopeNamesClick(e) {
  // handled by touchend below — click is ignored on mobile
}

function handleEnvelopeNamesDblClick(e) {
  if (e) e.preventDefault();
  openWeddingSwitcherModal();
}

// NOTE: app.js loads at bottom of <body>, so DOM is already ready — no DOMContentLoaded needed!
// Attach directly: double-tap on .env-names-banner -> openWeddingSwitcherModal()
(function attachEnvBannerDoubleTap() {
  const envBanner = document.querySelector('.env-names-banner');
  if (!envBanner) {
    // Retry once in case rendering is delayed
    setTimeout(() => {
      const b = document.querySelector('.env-names-banner');
      if (b) _attachBannerListeners(b);
    }, 800);
    return;
  }
  _attachBannerListeners(envBanner);
})();

function _attachBannerListeners(envBanner) {
  // Mobile: touchend double-tap (admin only)
  let lastTap = 0;
  envBanner.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTap > 0 && now - lastTap < 450) {
      if (!_checkIsAdminAccess()) { lastTap = 0; return; }
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      openWeddingSwitcherModal();
    }
    lastTap = now;
  }, { passive: false });

  // Desktop: dblclick (admin only)
  envBanner.addEventListener('dblclick', function(e) {
    if (!_checkIsAdminAccess()) return;
    e.preventDefault();
    e.stopPropagation();
    openWeddingSwitcherModal();
  });

  // Prevent text selection on mousedown
  envBanner.addEventListener('mousedown', function(e) { e.preventDefault(); });
}

// Seal click: always opens the envelope directly (guest switching via medallion)
function handleSealClick(e) {
  if (e) e.stopPropagation();
  openEnvelopeNow();
}

function openWeddingSwitcherModal() {
  const modal = document.getElementById('weddingSwitcherModal');
  if (!modal) return;
  modal.style.display = 'flex';

  const container = document.getElementById('weddingProjectsList');
  if (!container) return;

  // Immediately clear hardcoded HTML and show spinner
  container.innerHTML = '<div style="text-align:center; padding:15px; color:#fff3ad; font-family:\'Amiri\',serif;">&#x23F3; جاري الاتصال بـ Firebase...</div>';

  const BASE_URL = 'https://invit-mar-bice.vercel.app/';

  // Ensure Firebase is initialized
  try {
    initFirebase();
  } catch(e) {
    container.innerHTML = '<div style="color:#f66;padding:12px;font-size:0.85rem;">❌ خطأ في تهيئة Firebase: ' + e.message + '</div>';
    return;
  }

  if (!_db) {
    container.innerHTML = '<div style="color:#f66;padding:12px;font-size:0.85rem;">❌ _db is null — Firebase not initialized</div>';
    return;
  }

  _db.collection('invitations').get()
    .then(snapshot => {
      const count = snapshot.size;
      let realWeddings = [];

      snapshot.forEach(doc => {
        const data = doc.data() || {};
        const cfg = data.config || {};
        const groom = cfg.gn || cfg.ga || cfg.groomName || '';
        const bride  = cfg.bn || cfg.ba || cfg.brideName  || '';
        const label = (groom || bride)
          ? `💍 ${groom}${groom && bride ? ' & ' : ''}${bride}`.trim()
          : `💍 Mariage — ${doc.id}`;
        const url = cfg.url || `${BASE_URL}?inv=${encodeURIComponent(doc.id)}`;
        realWeddings.push({ id: doc.id, label, url });
      });

      if (realWeddings.length === 0) {
        container.innerHTML =
          '<div style="text-align:center;padding:14px;color:#f99;font-size:0.85rem;">' +
          '⚠️ Firebase connecté mais collection vide<br>' +
          '<small>snapshot.size = ' + count + ' | Collection = invitations</small>' +
          '</div>';
        return;
      }

      const currentInv = new URLSearchParams(window.location.search).get('inv') || '';
      container.innerHTML = realWeddings.map(w => {
        const isCurrent = w.id === currentInv;
        const border = isCurrent ? '2px solid #f7cb4d' : '1.5px solid #c9a84c';
        const bg = isCurrent
          ? 'linear-gradient(135deg, rgba(247,203,77,0.3) 0%, rgba(138,96,16,0.35) 100%)'
          : 'linear-gradient(135deg, rgba(247,203,77,0.1) 0%, rgba(138,96,16,0.15) 100%)';
        const badge = isCurrent
          ? '<span style="font-size:0.72rem;color:#0a1912;background:#f7cb4d;padding:2px 8px;border-radius:6px;margin-right:6px;">الحالي</span>'
          : '';
        return `<button onclick="switchWeddingProject('${w.id}','${w.url}')"
          style="display:flex;justify-content:space-between;align-items:center;width:100%;
          padding:12px 14px;background:${bg};border:${border};border-radius:12px;
          font-family:'Amiri',serif;font-size:1rem;color:#fff3ad;font-weight:bold;
          cursor:pointer;text-align:right;box-sizing:border-box;margin-bottom:6px;">
          <span>${badge}${w.label}</span>
          <span style="font-size:0.8rem;color:#f7cb4d;background:rgba(0,0,0,0.4);
            padding:4px 10px;border-radius:6px;flex-shrink:0;">فتح ➜</span>
        </button>`;
      }).join('');
    })
    .catch(err => {
      container.innerHTML =
        '<div style="text-align:center;padding:14px;color:#f66;font-size:0.85rem;">' +
        '❌ Firestore Error: ' + err.code + '<br>' +
        '<small>' + err.message + '</small>' +
        '</div>';
    });
}




function openPwaGuestSwitcher() {
  const modal = document.getElementById('pwaGuestSwitcherModal');
  if (!modal) return;
  modal.style.display = 'flex';

  const container = document.getElementById('pwaSavedGuestsList');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:15px; color:#8a6010; font-family:'Amiri',serif;">⏳ جاري تحميل قائمة ضيوف هذا الزفاف الحقيقيين...</div>`;

  initFirebase();
  const params = new URLSearchParams(window.location.search);
  const invSlug = params.get('inv') || 'default';

  _db.collection('invitations').doc(invSlug).get()
    .then(doc => {
      let realGuests = [];
      if (doc.exists) {
        const data = doc.data();
        // 1. Read guests array from Firebase Firestore (created in admin/guests.html)
        if (Array.isArray(data.guests) && data.guests.length > 0) {
          data.guests.forEach(g => {
            if (g && g.name) {
              realGuests.push({ name: g.name, type: g.type || 'ar_couple', id: g.id });
            }
          });
        }
        // 2. Read RSVPs if any
        if (data.rsvps) {
          Object.keys(data.rsvps).forEach(key => {
            const r = data.rsvps[key];
            if (r && r.name && r.name !== 'عام' && !realGuests.some(g => g.name === r.name)) {
              realGuests.push({ name: r.name, type: 'ar_couple', id: key });
            }
          });
        }
      }

      if (realGuests.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:14px; color:#704706; font-family:'Amiri',serif; font-size:0.92rem; background:rgba(201,168,76,0.1); border-radius:10px; border:1px solid rgba(201,168,76,0.3);">
            ℹ️ لا يوجد ضيوف مضافين بعد في هذا الزفاف.<br>يمكنك كتابة اسم ضيف جديد أعلاه وتطبيقه مباشرة!
          </div>
        `;
        return;
      }

      container.innerHTML = realGuests.map(g => `
        <button onclick="applyPwaGuest('${g.name.replace(/'/g, "\\'")}', '${g.type || 'ar_couple'}')" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:10px 14px; background:linear-gradient(135deg, #fffdf5 0%, #f7ebd0 100%); border:1px solid rgba(201,168,76,0.4); border-radius:10px; font-family:'Amiri',serif; font-size:0.98rem; color:#2b1800; font-weight:bold; cursor:pointer; text-align:right;">
          <span>👤 ${g.name}</span>
          <span style="font-size:0.8rem; color:#8a6010; background:rgba(201,168,76,0.2); padding:3px 8px; border-radius:6px;">عرض الدعوة ➜</span>
        </button>
      `).join('');
    })
    .catch(err => {
      console.error('[PWA Switcher] Failed to load real guests:', err);
      container.innerHTML = `<div style="text-align:center; padding:10px; color:#a00;">❌ حدث خطأ أثناء تحميل قائمة الضيوف</div>`;
    });
}

function handleEnvelopeNamesDblClick(e) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  _envNamesClickCount = 0;
  openWeddingSwitcherModal();
}

function applyPwaGuestFromInput() {
  const input = document.getElementById('pwaCustomGuestInput');
  if (!input || !input.value.trim()) return;
  applyPwaGuest(input.value.trim(), 'ar_couple');
}

function applyPwaGuest(guestName, guestType = 'ar_couple') {
  if (!guestName) return;
  
  // Persist override in storage
  sessionStorage.setItem('pwa_override_guest', guestName);
  sessionStorage.setItem('pwa_override_type', guestType);
  localStorage.setItem('pwa_override_guest', guestName);
  localStorage.setItem('pwa_override_type', guestType);

  // Close modal first
  const modal = document.getElementById('pwaGuestSwitcherModal');
  if (modal) modal.style.display = 'none';

  // Update URL silently (no reload — PWA would reset to manifest start_url on reload)
  try {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('guest', guestName);
    if (guestType) newUrl.searchParams.set('type', guestType);
    window.history.pushState({}, '', newUrl.toString());
  } catch(e) {}

  // Apply guest banner and personalized content LIVE without reloading
  _resolvedGuestName = guestName;
  _resolvedGuestType = guestType;
  _applyGuestBanner(guestName, guestType);
  _updatePersonalizedInviteDesc();

  // Show banner
  const banner = document.getElementById('guestNameBanner');
  if (banner) banner.style.display = 'block';

  // Open envelope if not already open
  if (!_envelopeOpened) {
    setTimeout(() => openEnvelopeNow(), 300);
  } else {
    // Re-open: close then re-open
    _envelopeOpened = false;
    document.querySelector('.invitation')?.classList.remove('open');
    setTimeout(() => openEnvelopeNow(), 400);
  }
}

/* ═══════════════════════════════════════════════
   ADMIN GESTURES (PWA)
   ═══════════════════════════════════════════════ */
function initAdminLongPressGestures() {
  // Direct HTML onclick handlers handleSealClick & handleCoupleNamesClick handle 2-click events cleanly!
}

/** Helper function to attach 100% reliable long-press (600ms) AND triple-tap handlers */
function _attachLongPressAndMultiTap(element, callback) {
  if (!element) return;
  let timer = null;
  let tapCount = 0;
  let tapTimer = null;
  let startX = 0, startY = 0;

  // Multi-tap detector (3 fast clicks/taps)
  const registerTap = (e) => {
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount >= 3) {
      tapCount = 0;
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      callback(e);
      return;
    }
    tapTimer = setTimeout(() => { tapCount = 0; }, 500);
  };

  // Long-press detector (600ms threshold)
  const start = (e) => {
    registerTap(e);

    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (navigator.vibrate) navigator.vibrate(80);
      callback(e);
    }, 600);
  };

  const move = (e) => {
    if (!timer) return;
    const touch = e.touches ? e.touches[0] : e;
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = Math.abs(touch.clientY - startY);
    if (deltaX > 15 || deltaY > 15) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('touchmove', move, { passive: true });
  element.addEventListener('touchend', cancel, { passive: true });
  element.addEventListener('touchcancel', cancel, { passive: true });
  element.addEventListener('mousedown', start);
  element.addEventListener('mousemove', move);
  element.addEventListener('mouseup', cancel);
  element.addEventListener('mouseleave', cancel);
}

// 🏰 Wedding Switcher Modal Functions
function openWeddingSwitcherModal() {
  if (!_checkIsAdminAccess()) {
    const pass = prompt('🔑 أدخل كلمة مرور الأدمن للتبديل بين مشاريع الزفاف (Admin Password):');
    if (pass === 'admin2026') {
      sessionStorage.setItem('admin_authenticated', 'true');
    } else if (pass !== null) {
      alert('❌ كلمة المرور خاطئة. هذه الخاصية مخصصة للآدمن فقط.');
      return;
    } else {
      return;
    }
  }

  const modal = document.getElementById('weddingSwitcherModal');
  if (modal) modal.style.display = 'flex';
}

function closeWeddingSwitcher() {
  const modal = document.getElementById('weddingSwitcherModal');
  if (modal) modal.style.display = 'none';
}

function switchWeddingProject(invSlug, customUrl) {
  if (!invSlug && !customUrl) return;
  
  // Close modal
  const modal = document.getElementById('weddingSwitcherModal');
  if (modal) modal.style.display = 'none';

  // If a direct URL is provided (from Firebase config.url), use it directly
  if (customUrl) {
    window.location.href = customUrl;
    return;
  }

  // Known local project paths
  const LOCAL_MAP = {
    'invit-mar': '../../invit mar/index.html',
    'invit mar': './index.html',
    'invit watia': '../../invit watia/invit-watia/index.html',
    'invit-watia': '../../invit watia/invit-watia/index.html',
  };

  if (LOCAL_MAP[invSlug]) {
    window.location.href = LOCAL_MAP[invSlug];
    return;
  }

  // Fallback: try relative path using slug
  window.location.href = `../../${invSlug}/index.html`;
}

function switchWeddingFromInput() {
  const input = document.getElementById('customWeddingSlugInput');
  if (!input || !input.value.trim()) return;
  switchWeddingProject(input.value.trim());
}

// Kept for compatibility — long-press gestures no longer needed (handled via touchend)
function initAdminLongPressGestures() {}




