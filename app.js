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

  // Apply Arch Glass Style
  const overlay = document.getElementById('introOverlay');
  if (overlay) {
    overlay.className = overlay.className.replace(/\barch-style-\S+/g, '').trim();
    const styleKey = cfg.archStyle || 'royal_dome';
    overlay.classList.add(`arch-style-${styleKey}`);
  }

  // Update ECG Tattoo-style name elements (tspan inside SVG text)
  const ecgGroomTspan = document.getElementById('ecgGroomTspan');
  const ecgBrideTspan  = document.getElementById('ecgBrideTspan');
  if (ecgGroomTspan && groomDisplay) ecgGroomTspan.textContent = groomDisplay;
  if (ecgBrideTspan  && brideDisplay) ecgBrideTspan.textContent  = brideDisplay;

  // Initialize Photo Stack Widget
  if (typeof initPhotoStack === 'function') {
    initPhotoStack(cfg);
  }

  // ── ZODIAC ARC CÉLESTE Section ──
  applyZodiacSection(cfg);
}

/* ─────────────────────────────────────────────────────────
   ZODIAC SECTION — Premium Dark Design
   Called from applyConfigToDOM when cfg.gs / cfg.bs are set
───────────────────────────────────────────────────────── */
function applyZodiacSection(cfg) {
  const gs = cfg.gs || '';
  const bs = cfg.bs || '';

  const section = document.getElementById('zodiac-section');
  if (!section) return;

  if (!gs && !bs) { section.style.display = 'none'; return; }
  section.style.display = '';

  // ─── Zodiac data ───
  const ZODIAC = {
    aries:       { sym:'♈', fr:'BÉLIER',     ar:'الحمل',      el:'🔥 Feu',     dates:'21 Mars – 19 Avr',  poem_ar:'بشجاعة الحمل وقوة عزمه' },
    taurus:      { sym:'♉', fr:'TAUREAU',    ar:'الثور',      el:'🌍 Terre',   dates:'20 Avr – 20 Mai',   poem_ar:'بوفاء الثور ورسوخه' },
    gemini:      { sym:'♊', fr:'GÉMEAUX',    ar:'الجوزاء',    el:'💨 Air',     dates:'21 Mai – 20 Juin',  poem_ar:'بروح الجوزاء المرحة' },
    cancer:      { sym:'♋', fr:'CANCER',     ar:'السرطان',    el:'💧 Eau',     dates:'21 Juin – 22 Juil', poem_ar:'بحنان السرطان الدافئ' },
    leo:         { sym:'♌', fr:'LION',       ar:'الأسد',      el:'🔥 Feu',     dates:'23 Juil – 22 Août', poem_ar:'بكرم الأسد الملكي' },
    virgo:       { sym:'♍', fr:'VIERGE',     ar:'العذراء',    el:'🌍 Terre',   dates:'23 Août – 22 Sep',  poem_ar:'بلطف العذراء النقي' },
    libra:       { sym:'♎', fr:'BALANCE',    ar:'الميزان',    el:'💨 Air',     dates:'23 Sep – 22 Oct',   poem_ar:'بتوازن الميزان الجميل' },
    scorpio:     { sym:'♏', fr:'SCORPION',   ar:'العقرب',     el:'💧 Eau',     dates:'23 Oct – 21 Nov',   poem_ar:'بعمق العقرب وإخلاصه' },
    sagittarius: { sym:'♐', fr:'SAGITTAIRE', ar:'القوس',      el:'🔥 Feu',     dates:'22 Nov – 21 Déc',   poem_ar:'بحرية القوس ومغامراته' },
    capricorn:   { sym:'♑', fr:'CAPRICORNE', ar:'الجدي',      el:'🌍 Terre',   dates:'22 Déc – 19 Jan',   poem_ar:'بصبر الجدي وثباته' },
    aquarius:    { sym:'♒', fr:'VERSEAU',    ar:'الدلو',      el:'💨 Air',     dates:'20 Jan – 18 Fév',   poem_ar:'بإبداع الدلو ورؤيته' },
    pisces:      { sym:'♓', fr:'POISSONS',   ar:'الحوت',      el:'💧 Eau',     dates:'19 Fév – 20 Mars',  poem_ar:'بحساسية الحوت ورومانسيته' },
  };

  // ─── Constellation star positions (viewBox 0 0 120 120) ───
  const CONST_STARS = {
    aries:       [[60,22],[50,44],[70,44],[38,68],[56,60],[76,68]],
    taurus:      [[35,30],[60,18],[85,30],[76,56],[44,56],[60,50]],
    gemini:      [[30,20],[70,20],[38,45],[62,45],[28,70],[72,70]],
    cancer:      [[50,18],[28,48],[72,48],[36,73],[64,73]],
    leo:         [[40,28],[58,16],[76,30],[68,52],[52,63],[36,54],[28,38],[52,82]],
    virgo:       [[50,14],[33,33],[67,33],[27,58],[73,58],[50,74],[50,44]],
    libra:       [[50,18],[22,52],[78,52],[30,76],[70,76],[50,42]],
    scorpio:     [[28,20],[44,30],[62,24],[74,42],[68,58],[55,68],[50,84],[60,92],[72,86]],
    sagittarius: [[50,18],[32,44],[68,44],[20,66],[78,35],[50,70],[38,84]],
    capricorn:   [[28,24],[55,18],[74,36],[62,58],[40,68],[22,50]],
    aquarius:    [[18,38],[40,28],[62,40],[84,28],[18,62],[40,72],[62,62],[84,72]],
    pisces:      [[28,24],[52,14],[76,24],[52,50],[28,78],[52,88],[76,78]],
  };
  const CONST_LINES = {
    aries:       [[0,1],[0,2],[1,3],[2,4],[3,5]],
    taurus:      [[0,1],[1,2],[2,4],[0,3],[3,5],[5,4]],
    gemini:      [[0,1],[0,2],[1,3],[2,4],[3,5]],
    cancer:      [[0,1],[0,2],[1,3],[2,4]],
    leo:         [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0],[4,7]],
    virgo:       [[0,1],[0,2],[1,3],[2,4],[3,6],[4,6],[6,5]],
    libra:       [[0,5],[5,1],[5,2],[1,3],[2,4]],
    scorpio:     [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]],
    sagittarius: [[0,1],[0,2],[1,3],[2,4],[0,5],[5,6]],
    capricorn:   [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]],
    aquarius:    [[0,1],[1,2],[2,3],[4,5],[5,6],[6,7],[1,5],[2,6]],
    pisces:      [[0,1],[1,2],[0,3],[2,3],[3,4],[3,5],[3,6]],
  };

  function renderConst(svgEl, key) {
    if (!svgEl || !key || !CONST_STARS[key]) return;
    const NS = 'http://www.w3.org/2000/svg';
    svgEl.innerHTML = '';
    const stars = CONST_STARS[key];
    const lines  = CONST_LINES[key] || [];
    lines.forEach(([a, b]) => {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', stars[a][0]); el.setAttribute('y1', stars[a][1]);
      el.setAttribute('x2', stars[b][0]); el.setAttribute('y2', stars[b][1]);
      el.setAttribute('stroke', '#c9a84c'); el.setAttribute('stroke-width', '0.8');
      el.setAttribute('stroke-linecap', 'round');
      svgEl.appendChild(el);
    });
    stars.forEach(([x, y], i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y);
      c.setAttribute('r', i === 0 ? '2.8' : '1.9');
      c.setAttribute('fill', '#c9a84c');
      svgEl.appendChild(c);
    });
  }

  function setEl(id, text)  { const e = document.getElementById(id); if (e) e.textContent = text; }
  function setElHTML(id, h) { const e = document.getElementById(id); if (e) e.innerHTML = h; }

  const gd = ZODIAC[gs];
  const bd = ZODIAC[bs];

  // ─── Groom card ───
  if (gd) {
    setEl('zdGroomSymbol', gd.sym + '\uFE0E'); // U+FE0E = text presentation (no emoji color)
    setEl('zdGroomName',   gd.fr);
    setEl('zdGroomAr',     gd.ar);
    setEl('zdGroomEl',     gd.el);
    setEl('zdGroomDates',  gd.dates);
    setEl('zdGroomLabel',  cfg.ga || 'العريس');
    renderConst(document.getElementById('zdGroomConst'), gs);
    const groomCard = document.getElementById('zdGroomCard');
    if (groomCard) groomCard.style.display = '';
  } else {
    const c = document.getElementById('zdGroomCard');
    if (c) c.style.display = 'none';
    // Shift bridge if no groom sign
    const bridge = document.querySelector('.zd-bridge');
    if (bridge) bridge.style.display = 'none';
  }

  // ─── Bride card ───
  if (bd) {
    setEl('zdBrideSymbol', bd.sym + '\uFE0E');
    setEl('zdBrideName',   bd.fr);
    setEl('zdBrideAr',     bd.ar);
    setEl('zdBrideEl',     bd.el);
    setEl('zdBrideDates',  bd.dates);
    setEl('zdBrideLabel',  cfg.ba || 'العروسة');
    renderConst(document.getElementById('zdBrideConst'), bs);
    const brideCard = document.getElementById('zdBrideCard');
    if (brideCard) brideCard.style.display = '';
  } else {
    const c = document.getElementById('zdBrideCard');
    if (c) c.style.display = 'none';
  }

  // ─── Compat label ───
  const compatEl = document.getElementById('zdCompatText');
  if (compatEl) {
    if (gd && bd) {
      const gEl = gd.el.split(' ')[1] || gd.el;
      const bEl = bd.el.split(' ')[1] || bd.el;
      compatEl.textContent = (gEl === bEl) ? `HARMONIE ${gEl.toUpperCase()}` : `${gEl.toUpperCase()} & ${bEl.toUpperCase()}`;
    } else if (gd) {
      compatEl.textContent = (gd.el.split(' ')[1] || gd.el).toUpperCase();
    } else if (bd) {
      compatEl.textContent = (bd.el.split(' ')[1] || bd.el).toUpperCase();
    }
  }

  // ─── Poetic text ───
  const poemEl = document.getElementById('zodiacPoemText');
  if (poemEl) {
    const isFr = cfg.la === 'fr';
    const frName = (d) => d.fr.charAt(0) + d.fr.slice(1).toLowerCase();
    if (gd && bd) {
      poemEl.textContent = isFr
        ? `Sous les étoiles, ${frName(gd)} et ${frName(bd)} ont uni leurs destins pour l'éternité.`
        : `${gd.poem_ar}، و${bd.poem_ar}، جمعتهما النجوم في حبٍّ أبديّ ✨`;
    } else if (gd) {
      poemEl.textContent = isFr
        ? `Né·e sous le signe du ${frName(gd)}, les étoiles ont guidé ce chemin.`
        : `${gd.poem_ar}، نقشت النجوم لهما قدرًا جميلًا ✨`;
    } else if (bd) {
      poemEl.textContent = isFr
        ? `Né·e sous le signe du ${frName(bd)}, les étoiles ont guidé ce chemin.`
        : `${bd.poem_ar}، نقشت النجوم لهما قدرًا جميلًا ✨`;
    }
  }

  // ─── Generate star particles background (cream/gold palette) ───
  const starsContainer = document.getElementById('zodiacStarsBg');
  if (starsContainer && !starsContainer.dataset.init) {
    starsContainer.dataset.init = '1';
    for (let i = 0; i < 50; i++) {
      const star = document.createElement('div');
      const size = (Math.random() * 2.2 + 0.6).toFixed(1);
      const isViolet = Math.random() > 0.75;
      star.style.cssText = [
        'position:absolute',
        `left:${(Math.random() * 100).toFixed(1)}%`,
        `top:${(Math.random() * 100).toFixed(1)}%`,
        `width:${size}px`, `height:${size}px`,
        'border-radius:50%',
        `background:rgba(${isViolet ? '200, 160, 255' : '201, 168, 76'}, ${(Math.random() * 0.45 + 0.25).toFixed(2)})`,
        `animation:zdStarTwinkle ${(Math.random() * 3 + 2).toFixed(1)}s ${(Math.random() * 5).toFixed(1)}s ease-in-out infinite`,
        `box-shadow:0 0 ${(size * 2.5).toFixed(0)}px rgba(201, 168, 76, 0.25)`,
        'pointer-events:none',
      ].join(';');
      starsContainer.appendChild(star);
    }

    if (!document.getElementById('zdKf')) {
      const s = document.createElement('style');
      s.id = 'zdKf';
      s.textContent = '@keyframes zdStarTwinkle{0%,100%{opacity:0.1;transform:scale(1)}50%{opacity:0.8;transform:scale(1.4)}}';
      document.head.appendChild(s);
    }
  }



  // ─── Guest Fortune Parchment (Hidden for Groom/Bride view) ───
  const guestFortuneSec = document.getElementById('zdGuestFortuneSection');
  if (_currentRole === 'groom' || _currentRole === 'bride') {
    if (guestFortuneSec) guestFortuneSec.style.display = 'none';
  } else {
    if (guestFortuneSec) guestFortuneSec.style.display = '';
    buildGuestFortune(cfg, ZODIAC);
  }
}


/* ═══════════════════════════════════════════════════════════
   MIROIR DU CIEL v2 — Multi-member, locked, RTL-correct
═══════════════════════════════════════════════════════════ */

let _zdSelectedKey = null;
let _zdSelectedZd  = null;
let _zdIsFr        = false;
let _zdCfg         = null;
let _zdZodiac      = null;
let _zdMembers     = [];     // [{name, role, storageKey}]
let _zdActiveMember = 0;     // which member tab is active
let _zdIsLocked    = false;  // true once all revealed

// ── Determine members from guest type ──
function zdGetMembers(name, type, isFr) {
  const members = [];
  const fallbackGuest = isFr ? 'Cher(e) Invité(e)' : 'ضيفنا العزيز';
  const n = name || fallbackGuest;

  // Primary guest always present
  const primaryLabel = isFr
    ? (type.includes('fr_woman') ? 'Madame' : type.includes('fr_friend_f') ? 'Mon amie' : 'Vous')
    : (type.includes('ar_woman') ? 'السيدة' : type.includes('ar_friend_f') ? 'عشيرتي' : type.includes('ar_friend_m') ? 'عشيري' : 'أنتَ');
  members.push({ name: n, role: primaryLabel, key: 'primary' });

  // Spouse?
  if (type === 'ar_couple' || type === 'ar_couple_children' || type === 'fr_couple') {
    const spouseRole = isFr ? 'Conjoint·e' : 'القرين / القرينة';
    const spouseName = isFr ? `Conjoint(e) de ${n}` : (n.includes('حرم') ? n : `حرم ${n}`);
    members.push({ name: spouseName, role: spouseRole, key: 'spouse' });
  }
  // Children?
  if (type === 'ar_couple_children') {
    const kidRole = 'الأبناء';
    const kidName = isFr ? `Enfants de ${n}` : `أبناء ${n}`;
    members.push({ name: kidName, role: kidRole, key: 'children' });
  }
  return members;
}

// ── LocalStorage key for a specific member's fortune (Strictly Guest-Isolated) ──
function zdStorageKey(guestId, memberKey) {
  const params = new URLSearchParams(window.location.search);
  const invSlug = params.get('inv') || localStorage.getItem('invitLastSlug') || (window._lastLoadedConfig && window._lastLoadedConfig.id) || 'default';
  const rawGuest = guestId || _resolvedGuestId || _resolvedGuestName || 'guest';
  const cleanGuest = encodeURIComponent(String(rawGuest).trim().toLowerCase());
  return `zd_fortune_v5_${invSlug}_${cleanGuest}_${memberKey || 'primary'}`;
}

// ── Admin Reset Helper for testing ──
window.zdAdminResetGuestFortune = function(guestId) {
  const gid = guestId || _resolvedGuestId || _resolvedGuestName || 'guest';
  if (_zdMembers && Array.isArray(_zdMembers)) {
    _zdMembers.forEach(m => {
      localStorage.removeItem(zdStorageKey(gid, m.key));
    });
  }
  localStorage.removeItem(zdStorageKey(gid, 'primary'));
  localStorage.removeItem(zdStorageKey(gid, 'spouse'));
  localStorage.removeItem(zdStorageKey(gid, 'children'));
  zdRefreshGuestFortune();
};

// ── Fortune messages per sign (wedding-linked, bilingual) ──
function zdGetFortunes(gName, bName, gNameFr, bNameFr) {
  return {
    aries:       { ar: `يا صاحب الحمل، روحك من نار وجرأة، وفي هذه الليلة المباركة التي تجمع ${gName} و${bName}، كتبت النجوم أن حضورك يُضيء الحفل كما يُضيء الحمل سماء الربيع. اللهم اجعل فرحتك اليوم بداية نعمة لا تنتهي 🌟`, fr: `Cher Bélier, votre fougue illumine cette nuit où ${gNameFr} et ${bNameFr} unissent leurs destins. Que ce soir vous apporte joie et bénédiction ✨` },
    taurus:      { ar: `يا من وُلدت تحت نجم الثور، ثباتك وأمانتك منحة من الله. وفي ليلة ميثاق ${gName} و${bName}، كما رسخت جذور الثور في الأرض، فليرسخ الفرح في قلبك وقلوب الأحبة 🌿`, fr: `Noble Taureau, votre loyauté est un trésor en cette nuit d'alliance entre ${gNameFr} et ${bNameFr} 🌿` },
    gemini:      { ar: `يا صاحب الجوزاء، روحك خفيفة كنسيم الليل الذي يداعب نجوم سماء ${gName} و${bName}. كلماتك ستكون بلسماً وضحكتك ستجعل الفرح مضاعفاً 💫`, fr: `Brillant Gémeaux, votre esprit anime cette nuit où ${gNameFr} et ${bNameFr} se disent oui 💫` },
    cancer:      { ar: `يا من تحمل قلب السرطان، حنانك هو هدية للجميع في ليلة زفاف ${gName} و${bName}. النجوم ترى فيك روحاً تجمع القلوب، اللهم أدم عليك هذا النور 🤍`, fr: `Doux Cancer, votre sensibilité est un cadeau en cette nuit où ${gNameFr} et ${bNameFr} bâtissent leur nid d'amour 🤍` },
    leo:         { ar: `يا أسد الليل المبارك، حضورك في حفل ${gName} و${bName} كالشمس في سماء صافية. أنت من يُضفي على هذه الليلة مهابتها وبريقها الملكي 👑`, fr: `Majestueux Lion, votre présence au mariage de ${gNameFr} et ${bNameFr} est comme un soleil royal 👑` },
    virgo:       { ar: `يا نقية العذراء، في هذه الليلة التي تجمع ${gName} و${bName} في ميثاق مقدس، لطفك وجمال روحك هما زينة هذا الحفل 🌸`, fr: `Gracieuse Vierge, votre délicatesse est l'ornement de cette nuit où ${gNameFr} et ${bNameFr} s'engagent 🌸` },
    libra:       { ar: `يا صاحب الميزان، في ليلة بنى فيها ${gName} و${bName} توازن حياة مشتركة، أناقتك وتوازنك يجعلان كل من حولك في راحة وبهجة ⚖️`, fr: `Élégante Balance, en cette nuit où ${gNameFr} et ${bNameFr} trouvent leur équilibre à deux ⚖️` },
    scorpio:     { ar: `يا عميق الروح يا عقرب، في هذه الليلة الخالدة التي توّج فيها ${gName} و${bName} حبهما، حضورك يُضيف إلى هذه الذكرى معنى لا يُنسى 🖤`, fr: `Profond Scorpion, en cette nuit immortelle où ${gNameFr} et ${bNameFr} scellent leur amour 🖤` },
    sagittarius: { ar: `يا حر القوس، روحك المتفائلة هي النسيم الذي يحمل بخور هذه الليلة. في فرح ${gName} و${bName}، سهامك من المحبة ستصيب القلوب 🏹`, fr: `Libre Sagittaire, en cette fête de ${gNameFr} et ${bNameFr}, vos flèches de joie atteignent tous les cœurs 🏹` },
    capricorn:   { ar: `يا صبور الجدي، في ليلة ${gName} و${bName}، صبرك وحكمتك هما درعٌ لمن تحبّ، وعزيمتك مثالٌ يحتذى به 🌙`, fr: `Persévérant Capricorne, en cette nuit de ${gNameFr} et ${bNameFr}, votre sagesse brille comme la lune 🌙` },
    aquarius:    { ar: `يا مبدع الدلو، روحك الحرة هي الفضاء الذي تتألق فيه نجوم ${gName} و${bName}. أفكارك تجعل هذا الاحتفال استثنائياً 🌊`, fr: `Visionnaire Verseau, votre créativité illumine l'espace où brillent les étoiles de ${gNameFr} et ${bNameFr} 🌊` },
    pisces:      { ar: `يا حساس الحوت، في هذه الليلة الرومانسية التي يتبادل فيها ${gName} و${bName} عهد الحب الأبدي، الحب الحقيقي الذي تراه بعيونك الليلة سيُلهمك طويلاً 🐟`, fr: `Sensible Poissons, en cette nuit où ${gNameFr} et ${bNameFr} échangent leur serment éternel, l'amour vous inspire 🐟` },
  };
}

// ── Update Active Member Picker Badge ──
function zdUpdateActivePickerBadge(m) {
  const badge = document.getElementById('zdActivePickerBadge');
  if (!badge) return;
  if (!m) {
    badge.style.display = 'none';
    return;
  }
  const isFr = _zdIsFr;
  const guestId = (typeof _resolvedGuestId !== 'undefined' && _resolvedGuestId) ? _resolvedGuestId : (_resolvedGuestName || '');
  const isDone = !!localStorage.getItem(zdStorageKey(guestId, m.key));
  
  badge.style.display = 'inline-flex';
  if (isDone) {
    badge.innerHTML = isFr
      ? `<span class="zd-picker-icon">✓</span> Étoile de <span class="zd-picker-name">${m.name}</span> déjà illuminée`
      : `<span class="zd-picker-icon">✓</span> نَجْمُ <span class="zd-picker-name">${m.name}</span> أُضِيءَ بالفعل`;
    return;
  }

  const nameLabel = m.name || '';
  const roleLabel = m.role || '';
  
  if (isFr) {
    const who = nameLabel ? `${nameLabel} (${roleLabel})` : (roleLabel || 'Invité');
    badge.innerHTML = `<span class="zd-picker-icon">✨</span> Au tour de : <span class="zd-picker-name">${who}</span> — Choisissez votre signe`;
  } else {
    const who = nameLabel ? `${nameLabel} (${roleLabel})` : (roleLabel || 'الضيف');
    badge.innerHTML = `<span class="zd-picker-icon">✨</span> دَوْرُ : <span class="zd-picker-name">${who}</span> — اختَر برجك الفلكي`;
  }
}

// ── Build the entire fortune section ──
function buildGuestFortune(cfg, ZODIAC) {
  const grid = document.getElementById('zdSignGrid');
  if (!grid) return;
  grid.innerHTML = '';
  grid.style.display = 'grid';

  // Wipe previously appended parchments from any other guest
  const parchmentsContainer = document.getElementById('zdParchments');
  if (parchmentsContainer) parchmentsContainer.innerHTML = '';

  const lockedNotice = document.getElementById('zdLockedNotice');
  if (lockedNotice) lockedNotice.style.display = 'none';

  const revealWrap = document.getElementById('zdRevealWrap');
  if (revealWrap) revealWrap.style.display = 'none';

  _zdIsFr   = cfg.la === 'fr';
  _zdCfg    = cfg;
  _zdZodiac = ZODIAC;
  _zdActiveMember = 0;
  _zdSelectedKey = null;
  _zdSelectedZd  = null;

  const guestName = _resolvedGuestName || '';
  const guestType = (typeof _resolvedGuestType !== 'undefined' && _resolvedGuestType) ? _resolvedGuestType : 'ar_couple';
  const guestId   = (typeof _resolvedGuestId !== 'undefined' && _resolvedGuestId) ? _resolvedGuestId : (guestName || 'guest');

  // Update section title with guest name
  const greeting = document.getElementById('zdFortuneGreeting');
  if (greeting && guestName) {
    greeting.textContent = `مِرآةُ النُّجوم — ${guestName}`;
  }

  // Build member list
  _zdMembers = zdGetMembers(guestName, guestType, _zdIsFr);

  // Check if ALL members already have saved fortunes for THIS specific guest
  const allSaved = _zdMembers.every(m => !!localStorage.getItem(zdStorageKey(guestId, m.key)));
  _zdIsLocked = allSaved;

  if (allSaved) {
    // Show locked notice + all saved parchments
    zdShowLockedState(guestId, ZODIAC);
    return;
  }

  // Show active member badge
  zdUpdateActivePickerBadge(_zdMembers[0]);

  // Build member tabs (only if > 1 member)
  const tabsEl = document.getElementById('zdMemberTabs');
  if (tabsEl) {
    tabsEl.innerHTML = '';
    if (_zdMembers.length > 1) {
      tabsEl.style.display = 'flex';
      _zdMembers.forEach((m, idx) => {
        const saved = localStorage.getItem(zdStorageKey(guestId, m.key));
        const btn = document.createElement('button');
        btn.className = 'zd-member-tab' + (idx === 0 ? ' zd-tab-active' : '') + (saved ? ' zd-tab-done' : '');
        btn.textContent = (m.name ? `${m.name}` : m.role) + (saved ? ' ✦' : '');
        btn.dataset.idx = idx;
        btn.addEventListener('click', () => {
          document.querySelectorAll('.zd-member-tab').forEach(b => b.classList.remove('zd-tab-active'));
          btn.classList.add('zd-tab-active');
          _zdActiveMember = idx;
          zdUpdateActivePickerBadge(m);
          _zdSelectedKey = null;
          document.querySelectorAll('.zd-sign-btn').forEach(b => {
            b.classList.remove('zd-active');
            b.disabled = false;
          });
          document.getElementById('zdRevealWrap').style.display = 'none';
          const savedFortune = localStorage.getItem(zdStorageKey(guestId, m.key));
          if (savedFortune) {
            const data = JSON.parse(savedFortune);
            zdShowSavedParchment(m, data, ZODIAC);
          }
        });
        tabsEl.appendChild(btn);
      });
    } else {
      tabsEl.style.display = 'none';
    }
  }

  // Check if the active member already has a fortune
  const activeM = _zdMembers[0];
  const savedActive = localStorage.getItem(zdStorageKey(guestId, activeM.key));
  if (savedActive) {
    const data = JSON.parse(savedActive);
    zdShowSavedParchment(activeM, data, ZODIAC);
  }

  // Build sign grid (Full Arabic/French names, no awkward truncation)
  const ALL_SIGNS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
  ALL_SIGNS.forEach(key => {
    const zd = ZODIAC[key];
    if (!zd) return;
    const btn = document.createElement('button');
    btn.className = 'zd-sign-btn';
    btn.dataset.sign = key;
    btn.setAttribute('aria-label', `${zd.fr} – ${zd.ar}`);
    const signLabel = _zdIsFr ? zd.fr : zd.ar;
    btn.innerHTML = `<span class="zd-btn-sym">${zd.sym}\uFE0E</span><span class="zd-btn-name">${signLabel}</span>`;
    btn.addEventListener('click', () => zdSelectSign(key, zd, guestId));
    grid.appendChild(btn);
  });
}

// ── Refresh Fortune when guest is resolved ──
function zdRefreshGuestFortune() {
  if (typeof _zdCfg !== 'undefined' && typeof _zdZodiac !== 'undefined' && _zdCfg && _zdZodiac) {
    buildGuestFortune(_zdCfg, _zdZodiac);
  }
}


function zdSelectSign(key, zd, guestId) {
  // Check if current member already revealed
  const m = _zdMembers[_zdActiveMember];
  if (m && localStorage.getItem(zdStorageKey(guestId, m.key))) return; // locked

  _zdSelectedKey = key;
  _zdSelectedZd  = zd;

  document.querySelectorAll('.zd-sign-btn').forEach(b => b.classList.remove('zd-active'));
  document.querySelector(`.zd-sign-btn[data-sign="${key}"]`)?.classList.add('zd-active');

  const revealWrap = document.getElementById('zdRevealWrap');
  if (revealWrap) revealWrap.style.display = '';
  const revealText = document.querySelector('#zdRevealBtn .zd-reveal-text');
  if (revealText) {
    const who = m ? (m.name || m.role) : '';
    revealText.textContent = _zdIsFr
      ? `Allumer l'étoile de ${who} (${zd.fr})`
      : `أضيء نجم ${who} (${zd.ar})`;
  }
}



let _cachedCoupleStars = [];

// ── Render Dynamic Traveling Stars for the Couple (Multi-Star Voyageurs) ──
function zdRenderCoupleSky(stars) {
  _cachedCoupleStars = Array.isArray(stars) ? stars : [];
  const universe = document.getElementById('traveling-stars-universe');
  if (!universe) return;

  const isCouple = _currentRole === 'groom' || _currentRole === 'bride';

  if (!isCouple || _cachedCoupleStars.length === 0) {
    universe.innerHTML = '';
    return;
  }

  // Generate a traveling interactive star for each guest fortune
  universe.innerHTML = _cachedCoupleStars.map((s, idx) => {
    const sym = s.sym || '✦';
    const guest = s.guestName || 'ضيف';
    const flightNum = (idx % 6) + 1; // flights 1 to 6
    const duration = 24 + (idx % 5) * 5; // 24s to 44s smooth flight
    const delay = -(idx * 5.8) % duration; // staggered initial position
    
    return `
      <div class="traveling-star-orb" 
           style="animation: starFlight${flightNum} ${duration}s ease-in-out infinite ${delay}s;" 
           onclick="openCoupleSingleStarModal(${idx})" 
           title="نجمة أضاءها ${guest}">
        <div class="traveling-star-tail"></div>
        <div class="traveling-star-body">
          <span class="star-sparkle-top">✦</span>
          <span class="star-sym-badge">${sym}</span>
        </div>
        <div class="traveling-star-label">✨ ${guest}</div>
      </div>
    `;
  }).join('');
}

window.openCoupleSingleStarModal = function(idx) {
  const s = _cachedCoupleStars[idx];
  if (!s) {
    openCoupleZodiacStarsModal();
    return;
  }
  const overlay = document.getElementById('couple-stars-modal-overlay');
  const titleEl = document.getElementById('couple-stars-modal-title');
  const subEl = document.getElementById('couple-stars-modal-sub');
  const listEl = document.getElementById('couple-stars-modal-list');
  if (!overlay || !listEl) return;

  overlay.style.display = 'flex';
  if (titleEl) titleEl.textContent = `نجمة ${s.guestName || 'الضيف'} المضيئة ✨`;
  if (subEl) subEl.textContent = `أضاء نجمة في سمائكم لتبارك زفافكم المبارك`;

  const sym = s.sym || '✦';
  const guest = s.guestName || 'ضيف';
  const signName = s.ar || s.fr || '';
  const timeStr = s.ts ? new Date(s.ts).toLocaleString('ar-TN', { dateStyle:'medium', timeStyle:'short' }) : '';

  listEl.innerHTML = `
    <div style="background:linear-gradient(135deg, #ffffff 0%, #fcf7ed 100%); padding:20px; border-radius:16px; border:1.5px solid rgba(201,168,76,0.4); text-align:center; box-shadow:0 4px 18px rgba(201,168,76,0.18);">
      <div style="font-size:2.8rem; color:#b8860b; filter:drop-shadow(0 2px 10px rgba(201,168,76,0.5)); margin-bottom:8px; animation:starCoreTwinkle 2s ease-in-out infinite alternate;">${sym}</div>
      <div style="font-size:1.4rem; font-weight:bold; color:var(--brown); margin-bottom:4px;">${guest}</div>
      <div style="font-size:1.05rem; color:var(--gold); font-weight:bold; margin-bottom:12px;">برج ${signName}</div>
      ${timeStr ? `<div style="font-size:0.82rem; color:var(--brown-mid); margin-bottom:16px;">توقيت الإضاءة: ${timeStr}</div>` : ''}
      <button onclick="openCoupleZodiacStarsModal()" style="display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, #f7ebd0 0%, #e2c88e 100%); border:1px solid rgba(201,168,76,0.6); border-radius:22px; padding:7px 18px; font-family:'Amiri',serif; font-size:0.95rem; font-weight:bold; color:#3b2200; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1);">عرض جميع النجوم المضاءة (${_cachedCoupleStars.length}) ➜</button>
    </div>
  `;
};

window.openCoupleZodiacStarsModal = function() {
  const overlay = document.getElementById('couple-stars-modal-overlay');
  const titleEl = document.getElementById('couple-stars-modal-title');
  const subEl = document.getElementById('couple-stars-modal-sub');
  const listEl = document.getElementById('couple-stars-modal-list');
  if (!overlay || !listEl) return;

  overlay.style.display = 'flex';
  if (titleEl) titleEl.textContent = 'سماءُ النُّجوم المضاءة 🌌';
  if (subEl) subEl.textContent = 'الضيوف الذين أضاؤوا نجومهم وبركاتهم في فرحكم';

  if (!_cachedCoupleStars || _cachedCoupleStars.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--brown-mid); font-style:italic;">لا توجد نجوم مضاءة من الضيوف بعد 🌟</div>`;
    return;
  }

  listEl.innerHTML = _cachedCoupleStars.slice().reverse().map((s, idx) => {
    const sym = s.sym || '✦';
    const guest = s.guestName || 'ضيف';
    const signName = s.ar || s.fr || '';
    const timeStr = s.ts ? new Date(s.ts).toLocaleTimeString('ar-TN', { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.92); padding:10px 14px; border-radius:12px; border:1px solid rgba(201,168,76,0.3); box-shadow:0 2px 8px rgba(0,0,0,0.04); cursor:pointer;" onclick="openCoupleSingleStarModal(${_cachedCoupleStars.length - 1 - idx})">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.4rem; line-height:1; filter:drop-shadow(0 1px 3px rgba(201,168,76,0.6)); color:#b8860b;">${sym}</span>
          <div>
            <div style="font-weight:bold; color:var(--brown); font-size:1.05rem;">${guest}</div>
            <div style="font-size:0.8rem; color:var(--brown-mid);">أضاء نجمة برج ${signName} ✨</div>
          </div>
        </div>
        ${timeStr ? `<div style="font-size:0.75rem; color:#8a6010; background:rgba(201,168,76,0.15); padding:2px 6px; border-radius:6px;">${timeStr}</div>` : ''}
      </div>
    `;
  }).join('');
};

window.closeCoupleZodiacStarsModal = function() {
  const overlay = document.getElementById('couple-stars-modal-overlay');
  if (overlay) overlay.style.display = 'none';
};



/* Called from HTML onclick */
function zdRevealMiroir() {
  if (!_zdSelectedKey || !_zdSelectedZd) return;

  const m       = _zdMembers[_zdActiveMember];
  const nameToAnimate = m ? m.name : (_resolvedGuestName || '');
  const guestId = (typeof _resolvedGuestId !== 'undefined' && _resolvedGuestId) ? _resolvedGuestId : (_resolvedGuestName || '');

  // Disable button
  const btn = document.getElementById('zdRevealBtn');
  if (btn) btn.disabled = true;

  zdPlayNameStars(nameToAnimate, () => {
    // Build fortune
    const cfg = _zdCfg || {};
    const gN   = cfg.ga || cfg.gf2 || 'العريس';
    const bN   = cfg.ba || cfg.bf2 || 'العروسة';
    const gNFr = cfg.gf2 || cfg.ga || 'le marié';
    const bNFr = cfg.bf2 || cfg.ba || 'la mariée';
    const FORTUNES = zdGetFortunes(gN, bN, gNFr, bNFr);
    const fortune  = FORTUNES[_zdSelectedKey];

    // Save to localStorage
    const saveData = {
      signKey:  _zdSelectedKey,
      sym:      _zdSelectedZd.sym,
      fr:       _zdSelectedZd.fr,
      ar:       _zdSelectedZd.ar,
      msgAr:    fortune.ar,
      msgFr:    fortune.fr,
      ts:       Date.now()
    };
    if (m) localStorage.setItem(zdStorageKey(guestId, m.key), JSON.stringify(saveData));

    // Send star to Firestore for the couple's sky
    const params = new URLSearchParams(window.location.search);
    const invSlug = params.get('inv') || localStorage.getItem('invitLastSlug') || (window._lastLoadedConfig && window._lastLoadedConfig.id);
    if (invSlug && typeof initFirebase === 'function') {
      try {
        initFirebase();
        const starPayload = {
          guestName: nameToAnimate || 'ضيفنا العزيز',
          signKey: _zdSelectedKey,
          sym: _zdSelectedZd.sym,
          fr: _zdSelectedZd.fr,
          ar: _zdSelectedZd.ar,
          ts: Date.now()
        };
        _db.collection('invitations').doc(invSlug).update({
          zodiacStars: firebase.firestore.FieldValue.arrayUnion(starPayload)
        }).then(() => {
          console.log('[Zodiac Star] Sent to couple sky ✨');
        }).catch(e => console.warn('[Zodiac Star Sync]', e));
      } catch(e) {}
    }

    // Mark tab as done
    const tabBtn = document.querySelector(`.zd-member-tab[data-idx="${_zdActiveMember}"]`);
    if (tabBtn) { tabBtn.classList.add('zd-tab-done'); tabBtn.textContent = tabBtn.textContent.replace(' ✦','') + ' ✦'; }

    // Show parchment
    zdAppendParchment(m, saveData, _zdZodiac);

    // Hide sign grid + reveal button
    document.getElementById('zdRevealWrap').style.display = 'none';
    document.querySelectorAll('.zd-sign-btn').forEach(b => { b.classList.remove('zd-active'); b.disabled = true; });
    _zdSelectedKey = null;

    if (btn) btn.disabled = false;

    // Check if all members done
    const allDone = _zdMembers.every(mem => !!localStorage.getItem(zdStorageKey(guestId, mem.key)));
    if (allDone) {
      const notice = document.getElementById('zdLockedNotice');
      if (notice) notice.style.display = 'flex';
      document.getElementById('zdSignGrid').style.display = 'none';
    }
  });
}


/* Show locked state: hide grid, show all saved parchments */
function zdShowLockedState(guestId, ZODIAC) {
  const grid    = document.getElementById('zdSignGrid');
  const notice  = document.getElementById('zdLockedNotice');
  const tabs    = document.getElementById('zdMemberTabs');
  const revWrap = document.getElementById('zdRevealWrap');
  const badge   = document.getElementById('zdActivePickerBadge');
  if (grid)    grid.style.display    = 'none';
  if (revWrap) revWrap.style.display = 'none';
  if (notice)  notice.style.display  = 'flex';
  if (tabs)    tabs.style.display    = 'none';
  if (badge)   badge.style.display   = 'none';

  _zdMembers.forEach(m => {

    const raw = localStorage.getItem(zdStorageKey(guestId, m.key));
    if (!raw) return;
    try { zdAppendParchment(m, JSON.parse(raw), ZODIAC); } catch(e) {}
  });
}

/* Show one saved parchment (for tab click) */
function zdShowSavedParchment(m, data, ZODIAC) {
  const existing = document.querySelector(`.zd-parchment-wrap[data-member="${m.key}"]`);
  if (existing) { existing.scrollIntoView({ behavior:'smooth', block:'nearest' }); return; }
  zdAppendParchment(m, data, ZODIAC);
}

/* Append a parchment card to #zdParchments */
function zdAppendParchment(member, data, ZODIAC) {
  const container = document.getElementById('zdParchments');
  if (!container) return;
  if (container.querySelector(`[data-member="${member?.key}"]`)) return; // already shown

  const seals   = { fire:'🔥', earth:'🌿', air:'💨', water:'💧' };
  const elMap   = { aries:'fire',leo:'fire',sagittarius:'fire', taurus:'earth',virgo:'earth',capricorn:'earth', gemini:'air',libra:'air',aquarius:'air', cancer:'water',scorpio:'water',pisces:'water' };
  const sealEmoji = seals[elMap[data.signKey]] || '✦';

  const wrap = document.createElement('div');
  wrap.className = 'zd-parchment-wrap zd-open';
  if (member) wrap.dataset.member = member.key;

  const msgMain = _zdIsFr ? data.msgFr : data.msgAr;
  const msgSub  = _zdIsFr ? data.msgAr : data.msgFr;
  const memberName = member ? member.name : '';

  wrap.innerHTML = `
    <div class="zd-parchment">
      <div class="zd-wax-seal">${sealEmoji}</div>
      ${memberName ? `<div class="zd-fortune-guest-name">${memberName}</div>` : ''}
      <div class="zd-fortune-sign">${data.sym}\uFE0E</div>
      <div class="zd-fortune-sign-name">${data.fr}</div>
      <div class="zd-parchment-divider"></div>
      <p class="zd-fortune-msg">${msgMain}</p>
      <div class="zd-parchment-divider" style="margin-top:14px"></div>
      <p class="zd-fortune-msg-fr">${msgSub}</p>
    </div>`;

  container.appendChild(wrap);
  setTimeout(() => wrap.scrollIntoView({ behavior:'smooth', block:'nearest' }), 150);
}

/* Canvas: Arabic name RTL, letters from right → left */
function zdPlayNameStars(name, onComplete) {
  const canvas = document.getElementById('zdSkyCanvas');
  if (!canvas || !name) { onComplete(); return; }

  canvas.style.display = 'block';
  const W = canvas.offsetWidth || 340;
  const H = 90;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // For Arabic: render the whole word as a single unit (shaped), letter-by-letter reveal
  // We render each character in a RTL-shaped word using measureText for correct spacing
  // Draw entire name first to get correct glyph metrics
  const FONT  = `bold ${Math.round(H * 0.5)}px 'Scheherazade New', 'Amiri', serif`;
  ctx.font    = FONT;
  ctx.direction = 'rtl';
  const totalW = ctx.measureText(name).width;
  const chars = [...name]; // Unicode code points
  const total = chars.length;
  const delay = 110;

  // Pre-compute x positions (RTL: right edge → left, but canvas is LTR by default)
  // We'll draw substrings of increasing length, clipped, for the reveal effect
  let revealCount = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (revealCount === 0) return;

    const substr = chars.slice(0, revealCount).join('');
    ctx.save();
    ctx.font      = FONT;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(201,168,76,0.95)';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = '#b8862a';
    ctx.globalAlpha = 1;
    // Draw from right side
    ctx.fillText(substr, W - 12, H / 2);
    ctx.restore();
  }

  function spawnNext(i) {
    if (i > total) {
      setTimeout(() => {
        let a = 1;
        const fade = setInterval(() => {
          a -= 0.05;
          ctx.clearRect(0, 0, W, H);
          if (a <= 0) { clearInterval(fade); canvas.style.display = 'none'; onComplete(); return; }
          ctx.save();
          ctx.globalAlpha = Math.max(0, a);
          ctx.font      = FONT;
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(201,168,76,0.7)';
          ctx.shadowBlur  = 14;
          ctx.fillStyle   = '#b8862a';
          ctx.fillText(name, W - 12, H / 2);
          ctx.restore();
        }, 40);
      }, 1000);
      return;
    }
    revealCount = i;
    draw();
    // Gentle glow pulse on last char
    let pulse = 0;
    const glowInterval = setInterval(() => {
      pulse++;
      ctx.clearRect(0, 0, W, H);
      const substr = chars.slice(0, revealCount).join('');
      ctx.save();
      ctx.font      = FONT;
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(201,168,76,0.95)';
      ctx.shadowBlur  = 24 + Math.sin(pulse * 0.5) * 10;
      ctx.fillStyle   = '#c9a84c';
      ctx.globalAlpha = 1;
      ctx.fillText(substr, W - 12, H / 2);
      ctx.restore();
      if (pulse >= 6) {
        clearInterval(glowInterval);
        setTimeout(() => spawnNext(i + 1), delay);
      }
    }, 30);
  }

  spawnNext(1);
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

    // Hide the guest fortune section (Miroir des Étoiles) — the couple only views their own couple zodiac signs
    const guestFortuneSec = document.getElementById('zdGuestFortuneSection');
    if (guestFortuneSec) guestFortuneSec.style.display = 'none';

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

  // ── 1. ?admin=1 in URL → persist admin mode in localStorage + clean URL ──
  if (params.get('admin') === '1') {
    localStorage.setItem('invitAdminMode', 'true');
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('admin');
    history.replaceState({}, '', cleanUrl.toString());
    console.info('[Admin] Mode admin activé et persisté.');
  }

  // ── 2. No ?inv= param → try to restore last wedding OR show switcher ──
  if (!invSlug && !blobId && !encoded) {
    const lastInv = localStorage.getItem('invitLastSlug');
    if (lastInv) {
      // Redirect to last-used invitation automatically
      window.location.replace(window.location.pathname + '?inv=' + encodeURIComponent(lastInv));
      return;
    }
    // Admin mode active but no last slug → auto-open wedding switcher
    if (localStorage.getItem('invitAdminMode') === 'true' || localStorage.getItem('admin_authenticated') === 'true') {
      setTimeout(() => { if (typeof openWeddingSwitcherModal === 'function') openWeddingSwitcherModal(); }, 900);
    }
    return;
  }

  // ── 3. Store current slug as last-used for next PWA launch ──
  if (invSlug) {
    localStorage.setItem('invitLastSlug', invSlug);
  }

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

        /* Demo Expiration Check */
        if (data.isDemo === true && data.demoExpiresAt) {
          const expTime = new Date(data.demoExpiresAt).getTime();
          if (!isNaN(expTime) && Date.now() > expTime) {
            const isFr = (cfg && cfg.la === 'fr');
            const groomName = isFr ? (cfg.gf2 || cfg.ga) : (cfg.ga || 'العريس');
            const brideName = isFr ? (cfg.bf2 || cfg.ba) : (cfg.ba || 'العروسة');
            const overlay = document.getElementById('pack-expired-overlay');
            if (overlay) {
              overlay.style.display = 'flex';
              if (isFr) {
                overlay.innerHTML = `
                  <div style="font-size:3.2rem; filter:drop-shadow(0 2px 10px rgba(243,156,18,0.5));">⏳</div>
                  <div style="font-size:1.45rem;font-weight:700;color:#c9a84c;font-family:'Amiri',serif">Période d'aperçu d'essai terminée</div>
                  <div style="color:#f5e6c0;font-size:0.98rem;max-width:320px;line-height:1.7;margin-top:4px;">
                    Le lien d'aperçu démo pour le mariage de <strong>${groomName} & ${brideName}</strong> est arrivé à expiration (24h).
                  </div>
                  <div style="color:#a08868;font-size:0.85rem;max-width:300px;line-height:1.6;margin-top:6px;">
                    Pour commander et débloquer votre pack complet avec vos liens personnalisés pour tous vos convives, veuillez contacter l'administrateur 🌸
                  </div>
                  <a href="https://wa.me/?text=${encodeURIComponent('Bonjour, je souhaite commander et activer mon pack de mariage pour ' + groomName + ' & ' + brideName)}" target="_blank" style="margin-top:14px;display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;text-decoration:none;padding:11px 24px;border-radius:25px;font-weight:bold;font-size:0.92rem;box-shadow:0 4px 15px rgba(37,211,102,0.35);">
                    <span>💬 Contacter sur WhatsApp pour Activer</span>
                  </a>
                `;
              } else {
                overlay.innerHTML = `
                  <div style="font-size:3.2rem; filter:drop-shadow(0 2px 10px rgba(243,156,18,0.5));">⏳</div>
                  <div style="font-size:1.55rem;font-weight:700;color:#c9a84c;font-family:'Amiri',serif">انتهت فترة المعاينة التجريبية</div>
                  <div style="color:#f5e6c0;font-size:1.05rem;font-family:'Amiri',serif;max-width:320px;line-height:1.7;margin-top:4px;">
                    لقد انتهت مهلة المعاينة التجريبية لهذا الرابط الخاص بحفل زفاف <strong>${groomName} & ${brideName}</strong>.
                  </div>
                  <div style="color:#a08868;font-size:0.88rem;font-family:'Amiri',serif;max-width:300px;line-height:1.6;margin-top:6px;">
                    يرجى التواصل مع إدارة الموقع لتأكيد وتفعيل باقة الزفاف الرسمية الخاصة بكم وتوليد روابط المدعوين 🌸
                  </div>
                  <a href="https://wa.me/?text=${encodeURIComponent('مرحباً، أود تأكيد وتفعيل باقة الزفاف الرسمية الخاصة بنا: ' + groomName + ' و ' + brideName)}" target="_blank" style="margin-top:14px;display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;text-decoration:none;padding:11px 24px;border-radius:25px;font-weight:bold;font-family:'Amiri',serif;font-size:0.95rem;box-shadow:0 4px 15px rgba(37,211,102,0.35);">
                    <span>💬 تواصل عبر واتساب للتفعيل</span>
                  </a>
                `;
              }
            }
            return;
          }
        }

        /* Guest links (with ?guest= or ?gid=) get unlimited views — no pack check, no count increment */
        const hasGuestLink = !!(params.get('guest') || params.get('gid'));
        // Removed: pack limits the number of added guests, not public view clicks

        /* Process wishes for Groom/Bride private inbox */
        processWishesForRole(data.wishes);

        /* Save config and wedding guests globally for dynamic lookups */
        window._lastLoadedConfig = cfg;
        window._currentWeddingGuests = Array.isArray(data.guests) ? data.guests : [];

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
  const startDate = _parseEventDateTimeHelper(dateRaw, timeRaw);
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
      `📌 Rappel : Veuillez enregistrer cet événement dans votre Google Calendar.\n\n` +
      `Lien de votre invitation personnelle : ${window.location.href}`
    : `${guestHeader}يسرنا ويشرفنا دعوتكم لحضور حفلنا!\n\n` +
      `تذكير: يرجى حفظ المناسبة في Calendrier Google.\n\n` +
      `رابط دعوتك الخاصة: ${window.location.href}`;

  const finalDetails = details || defaultDetails;
  const defaultLoc = (typeof _weatherLocation !== 'undefined' && _weatherLocation) ? _weatherLocation : (isFr ? 'Téboulba, Tunisie' : 'طبلبة، تونس');
  const finalLocation = location || defaultLoc;

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

let _currentCalEventData = null;

function _parseEventDateTimeHelper(dateRaw, timeRaw) {
  let startDate = null;

  if (dateRaw && typeof dateRaw === 'string') {
    if (dateRaw.includes('/')) {
      const parts = dateRaw.split('/').map(p => p.trim());
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          startDate = new Date(y, m, d);
        }
      }
    } else if (dateRaw.includes('-')) {
      const parsed = new Date(dateRaw);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }
  }

  if (!startDate || isNaN(startDate.getTime())) {
    const defaultDateTime = (typeof _weddingDateTime !== 'undefined' && _weddingDateTime) ? _weddingDateTime : '2026-07-16T20:00:00';
    startDate = new Date(defaultDateTime);
  }

  if (timeRaw && typeof timeRaw === 'string') {
    const timeParts = timeRaw.split(':');
    if (timeParts.length >= 2) {
      const h = parseInt(timeParts[0], 10);
      const m = parseInt(timeParts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        startDate.setHours(h, m, 0, 0);
      }
    }
  }

  return startDate;
}

function openCalendarModal(data) {
  _currentCalEventData = data;
  const overlay = document.getElementById('calendar-modal-overlay');
  if (!overlay) return;

  const isFr = document.documentElement.lang === 'fr' || document.body.classList.contains('lang-fr');
  const isTn = document.body.classList.contains('lang-tn');

  const titleEl = document.getElementById('cal-modal-title');
  const subtitleEl = document.getElementById('cal-modal-subtitle');
  const badgeEl = document.getElementById('cal-modal-badge');
  const eventTitleEl = document.getElementById('cal-modal-event-title');
  const dateEl = document.getElementById('cal-modal-event-date');
  const timeEl = document.getElementById('cal-modal-event-time');
  const locEl = document.getElementById('cal-modal-event-location');
  const reminderEl = document.getElementById('cal-modal-reminder-pill');

  const optGcalTitle = document.getElementById('cal-opt-gcal-title');
  const optGcalDesc = document.getElementById('cal-opt-gcal-desc');

  const chip2d = document.getElementById('chip-lbl-2d');
  const chip1d = document.getElementById('chip-lbl-1d');
  const chip2h = document.getElementById('chip-lbl-2h');
  const chip1h = document.getElementById('chip-lbl-1h');
  const remTitle = document.getElementById('cal-reminder-select-title');

  if (isFr) {
    if (titleEl) titleEl.textContent = 'Enregistrer dans Google Calendar';
    if (subtitleEl) subtitleEl.textContent = 'Ajoutez l\'événement à votre Google Calendar en 1 clic';
    if (badgeEl) badgeEl.textContent = '✨ Jour J - Invitation Mariage';
    if (remTitle) remTitle.textContent = '🔔 Choisissez vos rappels préférés :';
    if (chip2d) chip2d.textContent = '2 jours avant (48h)';
    if (chip1d) chip1d.textContent = '1 jour avant (24h)';
    if (chip2h) chip2h.textContent = '2 heures avant';
    if (chip1h) chip1h.textContent = '1 heure avant';
    if (optGcalTitle) optGcalTitle.textContent = 'Ouvrir Google Calendar 📅';
    if (optGcalDesc) optGcalDesc.textContent = 'Enregistrer l\'événement avec tous les détails (lieu, heure et rappels)';
  } else if (isTn) {
    if (titleEl) titleEl.textContent = 'احفظ الموعد في Google Calendar';
    if (subtitleEl) subtitleEl.textContent = 'زيد العرس في Google Calendar بنزلة واحدة';
    if (badgeEl) badgeEl.textContent = '✨ يوم العرس المميز';
    if (remTitle) remTitle.textContent = '🔔 اختار النوتيفيكاسيونات اللي تحب يفكروك :';
    if (chip2d) chip2d.textContent = 'قبل بنهارين (48h)';
    if (chip1d) chip1d.textContent = 'قبل بنهار (24h)';
    if (chip2h) chip2h.textContent = 'قبل بساعتين (2h)';
    if (chip1h) chip1h.textContent = 'قبل بساعة (1h)';
    if (optGcalTitle) optGcalTitle.textContent = 'حل Google Calendar 📅';
    if (optGcalDesc) optGcalDesc.textContent = 'احفظ الموعد بالتفاصيل (الوقت، البلاصة والنوتيفيكاسيون)';
  } else {
    if (titleEl) titleEl.textContent = 'حفظ الموعد في Google Calendar';
    if (subtitleEl) subtitleEl.textContent = 'أضف المناسبة إلى تقويم Google بنقرة واحدة';
    if (badgeEl) badgeEl.textContent = '✨ اليوم المميّز - حفل الزفاف';
    if (remTitle) remTitle.textContent = '🔔 اختر التنبيهات المفضلّة للتذكير:';
    if (chip2d) chip2d.textContent = 'قبل يومين (48 ساعة)';
    if (chip1d) chip1d.textContent = 'قبل يوم واحد (24 ساعة)';
    if (chip2h) chip2h.textContent = 'قبل ساعتين (2h)';
    if (chip1h) chip1h.textContent = 'قبل ساعة واحدة (1h)';
    if (optGcalTitle) optGcalTitle.textContent = 'فتح Google Calendar 📅';
    if (optGcalDesc) optGcalDesc.textContent = 'حفظ المناسبة مع التفاصيل الكاملة (المكان، الوقت والتنبيهات)';
  }

  if (eventTitleEl) eventTitleEl.textContent = data.title || 'Mariage';
  if (dateEl) dateEl.textContent = data.dateStr || '';
  if (timeEl) timeEl.textContent = data.timeStr || '';
  if (locEl) locEl.textContent = data.location || '';

  const modalCard = overlay.querySelector('.cal-modal-content');
  if (modalCard) {
    modalCard.style.direction = isFr ? 'ltr' : 'rtl';
  }

  overlay.style.display = 'flex';
}

function closeCalendarModal() {
  const overlay = document.getElementById('calendar-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function toggleCalReminderChip(chipEl) {
  if (!chipEl) return;
  chipEl.classList.toggle('active');
  if (chipEl.classList.contains('active')) {
    chipEl.classList.remove('inactive');
  } else {
    chipEl.classList.add('inactive');
  }
}

function triggerGoogleCalendarWebFromModal() {
  if (!_currentCalEventData) return;
  const isFr = document.documentElement.lang === 'fr' || document.body.classList.contains('lang-fr');

  const activeChips = document.querySelectorAll('.cal-chip.active');
  const selectedReminders = [];
  activeChips.forEach(chip => {
    const type = chip.getAttribute('data-reminder');
    if (type === '2d') selectedReminders.push(isFr ? '2 jours avant (48h)' : 'قبل يومين (48h)');
    if (type === '1d') selectedReminders.push(isFr ? '1 jour avant (24h)' : 'قبل يوم واحد (24h)');
    if (type === '2h') selectedReminders.push(isFr ? '2 heures avant' : 'قبل ساعتين (2h)');
    if (type === '1h') selectedReminders.push(isFr ? '1 heure avant' : 'قبل ساعة واحدة (1h)');
  });

  let reminderHeader = '';
  if (selectedReminders.length > 0) {
    reminderHeader = isFr
      ? `📌 Rappels choisis par l'invité : ${selectedReminders.join(', ')}\n\n`
      : `📌 التنبيهات المحددة من الضيف: ${selectedReminders.join(' ، ')}\n\n`;
  }

  const title = _currentCalEventData.title;
  const location = _currentCalEventData.location;
  const details = reminderHeader + (_currentCalEventData.details || '');
  const dateRaw = _currentCalEventData.rawDate;
  const timeRaw = _currentCalEventData.rawTime;

  const finalGcalUrl = buildGoogleCalendarUrl(title, dateRaw, timeRaw, location, details);

  window.open(finalGcalUrl, '_blank', 'noopener,noreferrer');
  closeCalendarModal();
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

  const location = (typeof _weatherLocation !== 'undefined' && _weatherLocation) ? _weatherLocation : (isFr ? 'Téboulba, Tunisie' : 'طبلبة، تونس');
  const startDate = _parseEventDateTimeHelper(null, null);
  const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

  const dateStr = startDate.toLocaleDateString(isFr ? 'fr-FR' : 'ar-TN', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = startDate.toLocaleTimeString(isFr ? 'fr-FR' : 'ar-TN', { hour: '2-digit', minute: '2-digit' });

  let guestHeader = '';
  if (guestSalutation) {
    guestHeader = isFr
      ? `Bienvenue ${guestSalutation} ! 🌸\n`
      : `أهلاً وسهلاً بك ${guestSalutation} 🌸\n`;
  }

  const details = isFr
    ? `${guestHeader}Nous avons l'honneur de vous inviter à notre célébration de mariage !\n\nLien de votre invitation personnelle : ${window.location.href}`
    : `${guestHeader}يسرنا ويشرفنا دعوتكم لحضور حفلنا!\n\nرابط دعوتك الخاصة: ${window.location.href}`;

  openCalendarModal({
    title: title,
    dateStr: dateStr,
    timeStr: timeStr,
    location: location,
    details: details,
    startDate: startDate,
    endDate: endDate,
    rawDate: null,
    rawTime: null
  });
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
    fullTitle += ` (${guestSalutation})`;
  }

  let guestHeader = '';
  if (guestSalutation) {
    guestHeader = isFr
      ? `Bienvenue ${guestSalutation} ! 🌸\n`
      : `أهلاً وسهلاً بك ${guestSalutation} 🌸\n`;
  }

  const details = isFr
    ? `${guestHeader}Invitation pour la cérémonie : ${eventTitle}.\nLieu : ${eventLocation}\nLien de votre invitation personnelle : ${window.location.href}`
    : `${guestHeader}دعوة لحضور ${eventTitle}.\nالمكان: ${eventLocation}\nرابط دعوتك الخاصة: ${window.location.href}`;

  const startDate = _parseEventDateTimeHelper(eventDate, eventTime);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

  openCalendarModal({
    title: fullTitle,
    dateStr: eventDate || startDate.toLocaleDateString(isFr ? 'fr-FR' : 'ar-TN'),
    timeStr: eventTime || '20:00',
    location: eventLocation,
    details: details,
    startDate: startDate,
    endDate: endDate,
    gcalUrl: gcalUrl
  });
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
  
  const startSec = parseFloat(audio.dataset.startTime || '0');
  if (startSec > 0 && audio.currentTime < 1) {
    try { audio.currentTime = startSec; } catch (e) {}
  }
  
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
    const startSec = parseFloat(audio.dataset.startTime || '0');
    if (startSec > 0 && audio.currentTime < 1) {
      try { audio.currentTime = startSec; } catch (e) {}
    }
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

/* ────────────────────────────────────────────────
   REALISTIC WAX CRACK & PAPER RUSTLE AUDIO SYNTHESIZER
   Uses Web Audio API (Zero external MP3 dependency)
   ──────────────────────────────────────────────── */
function playRealisticWaxAndPaperSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window._envelopeAudioCtx) {
      window._envelopeAudioCtx = new AudioCtx();
    }
    const ctx = window._envelopeAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // ── 1. WAX FRACTURE (Crisp mechanical snap & brittle crack) ──
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(850, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.045);
    oscGain.gain.setValueAtTime(0.75, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);

    // High frequency wax texture crunch
    const crackBufferLen = Math.floor(ctx.sampleRate * 0.12);
    const crackBuffer = ctx.createBuffer(1, crackBufferLen, ctx.sampleRate);
    const crackData = crackBuffer.getChannelData(0);
    for (let i = 0; i < crackBufferLen; i++) {
      const decay = Math.exp(-i / (ctx.sampleRate * 0.018));
      const micro = (Math.random() > 0.82 ? 1.6 : 0.5);
      crackData[i] = (Math.random() * 2 - 1) * decay * micro;
    }
    const crackSource = ctx.createBufferSource();
    crackSource.buffer = crackBuffer;

    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(3400, now);
    crackFilter.Q.setValueAtTime(3.2, now);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.9, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    crackSource.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(ctx.destination);
    crackSource.start(now);
    crackSource.stop(now + 0.12);

    // ── 2. PAPER UNFOLD & SLIDE FRICTION (t = 0.06s to 1.1s) ──
    const paperDuration = 0.95;
    const paperBufferLen = Math.floor(ctx.sampleRate * paperDuration);
    const paperBuffer = ctx.createBuffer(1, paperBufferLen, ctx.sampleRate);
    const paperData = paperBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < paperBufferLen; i++) {
      const white = Math.random() * 2 - 1;
      paperData[i] = (lastOut + 0.035 * white) / 1.035;
      lastOut = paperData[i];
      paperData[i] *= 3.8;
    }

    const paperSource = ctx.createBufferSource();
    paperSource.buffer = paperBuffer;

    const paperFilter = ctx.createBiquadFilter();
    paperFilter.type = 'bandpass';
    paperFilter.frequency.setValueAtTime(650, now + 0.06);
    paperFilter.frequency.exponentialRampToValueAtTime(2200, now + 0.4);
    paperFilter.frequency.exponentialRampToValueAtTime(550, now + paperDuration);
    paperFilter.Q.setValueAtTime(1.6, now + 0.06);

    const paperGain = ctx.createGain();
    paperGain.gain.setValueAtTime(0.001, now);
    paperGain.gain.linearRampToValueAtTime(0.35, now + 0.15);
    paperGain.gain.linearRampToValueAtTime(0.22, now + 0.55);
    paperGain.gain.exponentialRampToValueAtTime(0.001, now + paperDuration);

    paperSource.connect(paperFilter);
    paperFilter.connect(paperGain);
    paperGain.connect(ctx.destination);
    paperSource.start(now + 0.06);
    paperSource.stop(now + paperDuration + 0.1);

  } catch (err) {
    console.warn('[Audio] Wax/Paper sound playback error:', err);
  }

  // ── Haptic Vibration ──
  if (navigator.vibrate) {
    try {
      navigator.vibrate([35, 30, 75, 40, 20]);
    } catch(e) {}
  }
}

function spawnWaxSparks(cx, cy) {
  const sparkColors = ['#fdf0b0', '#f0c84a', '#c9930c', '#fffdf5', '#e8cc7a'];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'wax-shard-spark';
    const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
    const dist = Math.random() * 95 + 45;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() * 360 - 180) + 'deg';
    const size = Math.random() * 6 + 3;
    const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];

    spark.style.width = size + 'px';
    spark.style.height = size + 'px';
    spark.style.left = cx + 'px';
    spark.style.top = cy + 'px';
    spark.style.background = color;
    spark.style.boxShadow = `0 0 8px ${color}`;
    spark.style.setProperty('--tx', `${tx}px`);
    spark.style.setProperty('--ty', `${ty}px`);
    spark.style.setProperty('--rot', rot);

    document.body.appendChild(spark);
    setTimeout(() => { spark.remove(); }, 900);
  }
}

window.openEnvelopeNow = function() {
  const inv = document.getElementById('invitation');
  if (!inv || inv.classList.contains('open') || inv.classList.contains('opening')) return;

  // 1. Play realistic wax crack & paper rustle sound immediately + haptic
  playRealisticWaxAndPaperSound();

  // 2. Spawn golden wax fracture sparks from the seal
  const seal = document.getElementById('seal');
  if (seal) {
    seal.classList.add('seal-breaking');
    const rect = seal.getBoundingClientRect();
    spawnWaxSparks(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // 3. Mark body and invitation as opening immediately (3D flaps start swinging at t=0)
  document.body.classList.add('env-open');
  inv.classList.add('opening');

  // 4. Release rose petals & golden particles
  setTimeout(() => {
    spawnPetals();
    startHeartClock();
  }, 400);

  // 5. Start wedding music
  setTimeout(() => {
    startWeddingMusic();
  }, 600);

  // 6. Complete transition
  setTimeout(() => {
    inv.classList.add('open');
  }, 1200);
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
    nameInput.value = '';
    messageInput.value = '';
    if (rsvpSelect) rsvpSelect.value = '';
    alert(_currentLang === 'fr' ? 'Votre réponse a été enregistrée ✨' : 'تم إرسال ردك بنجاح ✨');
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

  // ── Synchronize Translucent Envelope Pattern across all invitation sections (Program -> Closing) ──
  const patternEls = document.querySelectorAll('.section-pattern-bg, .photo-section-pattern-bg');
  if (patternEls.length) {
    let patternImg = '';
    let patternOpacity = '0.11';
    if (showNature) {
      patternImg = "url('assets/nature_summer_pattern.png')";
      patternOpacity = '0.13';
    } else if (showVintage) {
      patternImg = "url('assets/vintage_pattern_new.png')";
      patternOpacity = '0.12';
    } else if (showArabesque) {
      patternImg = "url('assets/arabesque_pattern.png')";
      patternOpacity = '0.12';
    } else if (showCalligraphy) {
      patternImg = "url('assets/arabic_calligraphy_pattern.png')";
      patternOpacity = '0.12';
    } else if (showZellige) {
      patternImg = "url('assets/zellige_pattern.png')";
      patternOpacity = '0.12';
    } else if (showDoor) {
      patternImg = "url('assets/tunisian_door_pattern.png')";
      patternOpacity = '0.13';
    } else if (showAmazigh) {
      patternImg = "url('assets/amazigh_pattern.png')";
      patternOpacity = '0.13';
    } else if (showEmbossed) {
      patternImg = "url('assets/embossed_botanical_pattern.png')";
      patternOpacity = '0.13';
    } else if (showSageEmbossed) {
      patternImg = "url('assets/embossed_sage_green_pattern.png')";
      patternOpacity = '0.13';
    } else {
      // Default floral / branches
      patternImg = "radial-gradient(circle at 50% 50%, rgba(201, 168, 76, 0.12) 0%, rgba(201, 168, 76, 0.04) 50%, transparent 80%)";
      patternOpacity = '0.85';
    }
    patternEls.forEach(el => {
      el.style.backgroundImage = patternImg;
      el.style.opacity = patternOpacity;
    });
  }



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
    bismillah_apex: '﷽',
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
    zodiac_title: 'البروج الفلكية للعروسين',
    zodiac_subtitle: 'كتبت النجوم لقاءهما منذ الأزل',
    zd_fortune_title: '✦ مِرآةُ النُّجوم ✦',
    zd_fortune_sub: 'اختر برجك ليُضيء اسمك في سماء هذه الليلة المباركة',
    zd_reveal_btn: 'أضيء نجمي',
    zd_locked: 'نجومكم أُضيئت — رسائل أفراد دعوتكم أدناه',
  },


  fr: {
    bismillah_apex: '✨',
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
    zodiac_title: 'Signes Astrologiques des Mariés',
    zodiac_subtitle: 'Les étoiles ont écrit leur rencontre depuis l\'éternité',
    zd_fortune_title: '✦ Le Miroir Céleste ✦',
    zd_fortune_sub: 'Choisissez votre signe pour illuminer votre nom dans le ciel étoilé',
    zd_reveal_btn: 'Allumer mon étoile',
    zd_locked: 'Vos étoiles sont illuminées — retrouvez vos messages célestes ci-dessous',
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

  // Refresh Zodiac Miroir du Ciel for this specific guest
  zdRefreshGuestFortune();
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
    // Latin: premium cursive script initials (Dancing Script)
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

    // Beautiful cursive monogram: each letter as a styled calligraphic glyph
    const sepHtml = initial2
      ? `<span class="latin-mono-sep">&#x26;</span>`
      : '';
    const html = `
      <div class="latin-script-monogram">
        <div class="latin-script-top-ornament">✦ ✦ ✦</div>
        <div class="latin-script-letters">
          <span class="latin-script-letter">${initial1}</span>${initial2 ? `<span class="latin-mono-sep">&amp;</span><span class="latin-script-letter">${initial2}</span>` : ''}
        </div>
        <div class="latin-script-rule"></div>
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
  if (!cfg) return;
  const MUSIC_MAP = {
    'wedding_march':      'assets/wedding_march.mp3',
    'ziad_gharsa':        'assets/ziad_gharsa.mp3',
    'mabrouk_ramy_ayach': 'assets/mabrouk_ramy_ayach.mp3',
    'mramma_hamza':       'assets/mramma_hamza_bouchnak.mp3',
  };
  const audio = document.getElementById('wedding-audio');
  if (!audio) return;
  
  if (cfg.mst != null) {
    audio.dataset.startTime = cfg.mst;
  }
  
  if (cfg.mu && MUSIC_MAP[cfg.mu]) {
    const src = MUSIC_MAP[cfg.mu];
    if (audio.getAttribute('src') !== src) {
      const wasPlaying = !audio.paused;
      audio.src = src;
      audio.load();
      if (wasPlaying) audio.play().catch(() => {});
    }
  }
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

    // 2. Real-time update for couple's sky of guest stars!
    if (typeof zdRenderCoupleSky === 'function') {
      zdRenderCoupleSky(data.zodiacStars || []);
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
  if (!cfg) return;
  window._lastLoadedConfig = cfg;

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

  // 2. Determine which photos to show based on ?gid= or ?view= or ?guest= in URL or session
  const params         = new URLSearchParams(window.location.search);
  let   gid            = params.get('gid') || sessionStorage.getItem('pwa_override_gid') || null;
  const view           = params.get('view') || null;
  const guestNameParam = params.get('guest') || sessionStorage.getItem('pwa_override_guest') || null;

  const perGuest = (cfg.features && cfg.features.guestPhotos) ? cfg.features.guestPhotos : {};

  // If gid is not matching, try to match by guest name from wedding guests list
  if ((!gid || !perGuest[gid] || perGuest[gid].length === 0) && Array.isArray(window._currentWeddingGuests)) {
    const targetName = (guestNameParam || params.get('guest') || gid || '').trim();
    if (targetName) {
      const match = window._currentWeddingGuests.find(g => g && (g.id === gid || g.name === targetName || (g.name && targetName.includes(g.name))));
      if (match && match.id && perGuest[match.id] && perGuest[match.id].length > 0) {
        gid = match.id;
      }
    }
  }

  let rawPhotos = null;

  if (gid && perGuest[gid] && Array.isArray(perGuest[gid]) && perGuest[gid].length > 0) {
    // Sub-guest link: show photos specifically assigned to this guest
    rawPhotos = perGuest[gid];
  } else if (view === 'groom' || view === 'bride') {
    // Groom/Bride view: look up guestPhotos['groom'] or guestPhotos['bride']
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
    // General link (or guest without custom photos): use global photoStackPhotos or default general photos
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
    localStorage.getItem('admin_authenticated') === 'true' ||
    localStorage.getItem('invitAdminMode') === 'true'
  );
}

// Admin can activate secret mode from browser console:
// localStorage.setItem('invitAdminMode','true')
window._activateAdminMode = function() {
  localStorage.setItem('invitAdminMode', 'true');
  console.info('[Admin] Mode admin activé. Double-clic sur les noms des mariés maintenant disponible.');
};

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
  // Double-click is invisible to guests — no admin check needed here
  // (guests don't know this gesture exists; admin protection is via obscurity)
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

  // Desktop: dblclick handled via HTML ondblclick attribute — no listener needed here
  // (mousedown preventDefault removed to allow dblclick to fire)
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
  console.log('[SWITCHER] modal=', modal, 'container=', container);

  const BASE_URL = 'https://invit-mar-bice.vercel.app/';

  // Use Firestore REST API directly — bypasses SDK offline/cache hang issues
  const projectId = FIREBASE_CONFIG.projectId;
  const apiKey    = FIREBASE_CONFIG.apiKey;
  const restUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/invitations?key=${apiKey}&pageSize=100`;

  console.log('[SWITCHER] Fetching:', restUrl);
  // RED spinner = JS is running (diagnostic)
  container.innerHTML = '<div style="text-align:center;padding:18px;color:#ff4444;font-family:Amiri,serif;font-weight:bold;">&#x23F3; JS actif — chargement Firebase...</div>';

  fetch(restUrl)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      return r.json();
    })
    .then(data => {
      console.log('[SWITCHER] fetch success, data:', JSON.stringify(data).slice(0,200));
      const docs = data.documents || [];
      const count = docs.length;

      const _strVal = (f) => f && (f.stringValue || f.integerValue || '');

      const allDocs = docs.map(doc => {
        const id = doc.name.split('/').pop();
        const fields = doc.fields || {};
        const cfgFields = (fields.config && fields.config.mapValue && fields.config.mapValue.fields) || {};
        const groom = _strVal(cfgFields.gn) || _strVal(cfgFields.ga) || _strVal(cfgFields.groomName) || _strVal(fields.groomName) || '';
        const bride  = _strVal(cfgFields.bn) || _strVal(cfgFields.ba) || _strVal(cfgFields.brideName)  || _strVal(fields.brideName)  || '';
        const label  = (groom || bride)
          ? `💍 ${groom}${groom && bride ? ' & ' : ''}${bride}`.trim()
          : `📄 ${id}`;
        const url = _strVal(cfgFields.url) || `${BASE_URL}?inv=${encodeURIComponent(id)}`;
        return { id, label, url };
      });

      const debugInfo = `<div style="font-size:0.72rem;color:#a0c080;padding:4px 8px;margin-bottom:8px;background:rgba(0,50,0,0.4);border-radius:8px;text-align:right;">
        🔍 REST API: ${count} document(s) dans <em>invitations</em>
      </div>`;

      if (allDocs.length === 0) {
        container.innerHTML = debugInfo + '<div style="text-align:center;padding:14px;color:#f99;font-size:0.85rem;">⚠️ Collection vide</div>';
        return;
      }

      const currentInv = new URLSearchParams(window.location.search).get('inv') || '';
      container.innerHTML = debugInfo + allDocs.map(w => {
        const isCurrent = w.id === currentInv;
        const border = isCurrent ? '2px solid #f7cb4d' : '1.5px solid #c9a84c';
        const bg = isCurrent
          ? 'linear-gradient(135deg,rgba(247,203,77,0.3),rgba(138,96,16,0.35))'
          : 'linear-gradient(135deg,rgba(247,203,77,0.1),rgba(138,96,16,0.15))';
        const badge = isCurrent
          ? '<span style="font-size:0.7rem;color:#0a1912;background:#f7cb4d;padding:2px 7px;border-radius:5px;margin-left:6px;">✓ الحالي</span>'
          : '';
        const docIdSpan = `<span style="font-size:0.63rem;color:#a0c080;display:block;margin-top:2px;direction:ltr;text-align:left;">${w.id}</span>`;
        return `<button onclick="switchWeddingProject('${w.id}','${w.url}')"
          style="display:flex;justify-content:space-between;align-items:center;width:100%;
          padding:10px 14px;background:${bg};border:${border};border-radius:12px;
          font-family:'Amiri',serif;font-size:0.95rem;color:#fff3ad;font-weight:bold;
          cursor:pointer;text-align:right;box-sizing:border-box;margin-bottom:6px;">
          <span>${badge}${w.label}${docIdSpan}</span>
          <span style="font-size:0.8rem;color:#f7cb4d;background:rgba(0,0,0,0.4);
            padding:4px 10px;border-radius:6px;flex-shrink:0;margin-right:4px;">فتح ➜</span>
        </button>`;
      }).join('');
    })
    .catch(err => {
      container.innerHTML =
        '<div style="text-align:center;padding:14px;color:#f66;font-size:0.82rem;">' +
        '❌ REST API Error: ' + err.message +
        '<br><small>Vérifiez les règles Firestore ou la clé API</small></div>';
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
  const invSlug = params.get('inv') || localStorage.getItem('invitLastSlug') || (window._lastLoadedConfig && window._lastLoadedConfig.id) || 'default';

  _db.collection('invitations').doc(invSlug).get()
    .then(doc => {
      let realGuests = [];
      let guestPhotosMap = {};
      if (doc.exists) {
        const data = doc.data() || {};
        guestPhotosMap = data.config?.features?.guestPhotos || {};
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

      function _getPhotosCount(g) {
        if (!guestPhotosMap || typeof guestPhotosMap !== 'object') return 0;
        if (g.id && Array.isArray(guestPhotosMap[g.id]) && guestPhotosMap[g.id].length > 0) return guestPhotosMap[g.id].length;
        if (g.name && Array.isArray(guestPhotosMap[g.name]) && guestPhotosMap[g.name].length > 0) return guestPhotosMap[g.name].length;
        const cName = (g.name || '').trim().toLowerCase();
        for (const [k, v] of Object.entries(guestPhotosMap)) {
          if (Array.isArray(v) && v.length > 0) {
            const cK = k.trim().toLowerCase();
            if (cK === cName || (cName && cName.includes(cK)) || (cK && cK.includes(cName))) {
              return v.length;
            }
          }
        }
        return 0;
      }

      container.innerHTML = realGuests.map(g => {
        const safeName = (g.name || '').replace(/'/g, "\\'");
        const safeType = (g.type || 'ar_couple').replace(/'/g, "\\'");
        const safeId   = (g.id || '').replace(/'/g, "\\'");
        const pCount   = _getPhotosCount(g);
        const photoBadge = pCount > 0
          ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:0.75rem; background:rgba(39,174,96,0.15); color:#27ae60; border:1px solid rgba(39,174,96,0.4); padding:2px 8px; border-radius:10px; margin-right:6px; font-weight:normal;" title="يحتوي على ${pCount} صور خاصة">📸 <b style="font-size:0.7rem">${pCount} صور</b></span>`
          : '';

        return `
        <button onclick="applyPwaGuest('${safeName}', '${safeType}', '${safeId}')" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:10px 14px; background:linear-gradient(135deg, #fffdf5 0%, #f7ebd0 100%); border:1px solid rgba(201,168,76,0.4); border-radius:10px; font-family:'Amiri',serif; font-size:0.98rem; color:#2b1800; font-weight:bold; cursor:pointer; text-align:right;">
          <span style="display:flex; align-items:center; gap:6px;">
            <span>👤 ${g.name}</span>
            ${photoBadge}
          </span>
          <span style="font-size:0.8rem; color:#8a6010; background:rgba(201,168,76,0.2); padding:3px 8px; border-radius:6px; flex-shrink:0;">عرض الدعوة ➜</span>
        </button>
      `;}).join('');
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
  openWeddingSwitcherModal();
}

function applyPwaGuestFromInput() {
  const input = document.getElementById('pwaCustomGuestInput');
  if (!input || !input.value.trim()) return;
  applyPwaGuest(input.value.trim(), 'ar_couple', '');
}

function applyPwaGuest(guestName, guestType = 'ar_couple', guestId = '') {
  if (!guestName) return;
  
  // Persist override in storage
  sessionStorage.setItem('pwa_override_guest', guestName);
  sessionStorage.setItem('pwa_override_type', guestType);
  if (guestId) sessionStorage.setItem('pwa_override_gid', guestId);
  else sessionStorage.removeItem('pwa_override_gid');

  localStorage.setItem('pwa_override_guest', guestName);
  localStorage.setItem('pwa_override_type', guestType);
  if (guestId) localStorage.setItem('pwa_override_gid', guestId);
  else localStorage.removeItem('pwa_override_gid');

  // Close modal first
  const modal = document.getElementById('pwaGuestSwitcherModal');
  if (modal) modal.style.display = 'none';

  // Update URL silently (no reload — PWA would reset to manifest start_url on reload)
  try {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('guest', guestName);
    if (guestType) newUrl.searchParams.set('type', guestType);
    if (guestId) newUrl.searchParams.set('gid', guestId);
    else newUrl.searchParams.delete('gid');
    window.history.pushState({}, '', newUrl.toString());
  } catch(e) {}

  // Apply guest banner and personalized content LIVE without reloading
  _resolvedGuestName = guestName;
  _resolvedGuestType = guestType;
  _applyGuestBanner(guestName, guestType);
  _updatePersonalizedInviteDesc();

  // Re-initialize photo stack for this guest immediately
  if (typeof initPhotoStack === 'function' && window._lastLoadedConfig) {
    initPhotoStack(window._lastLoadedConfig);
  }

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

function closeWeddingSwitcher() {
  const modal = document.getElementById('weddingSwitcherModal');
  if (modal) modal.style.display = 'none';
}

function switchWeddingProject(invSlug, customUrl) {
  if (!invSlug && !customUrl) return;

  // Flag: auto-open guest switcher on next page load
  sessionStorage.setItem('autoOpenGuestSwitcher', '1');

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

/* ─────────────────────────────────────────────────────────────────
   AUTO-OPEN GUEST SWITCHER after wedding navigation
   When admin selects a wedding from the switcher, the next page load
   will automatically open the guest/guest switcher modal
───────────────────────────────────────────────────────────────── */
(function _checkAutoOpenGuestSwitcher() {
  if (sessionStorage.getItem('autoOpenGuestSwitcher') === '1') {
    sessionStorage.removeItem('autoOpenGuestSwitcher');
    // Wait for config to fully load before opening the guest switcher
    setTimeout(() => {
      if (typeof openPwaGuestSwitcher === 'function') {
        openPwaGuestSwitcher();
      }
    }, 1800);
  }
})();
