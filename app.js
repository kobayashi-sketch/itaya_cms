(function () {
  const STORAGE_KEY = "itaya-signage-cms-v1";
  const DB_NAME = "itaya-signage-media";
  const DB_VERSION = 1;
  const STORE_NAME = "media";
  const STATE_API_URL = "./state.php";
  const AUTH_API_URL = "./login.php";
  const UPLOAD_API_URL = "./upload.php";
  const DEFAULT_SLIDE_SECONDS = 5;
  const VENUE_PAGE_SIZE = 10;
  const VENUE_TAB_DAYS = 7;
  const VENUE_TIME_ZONE = "Asia/Tokyo";
  const SLIDE_TRANSITION_MS = 760;
  const PDFJS_BASE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38";
  const PDFJS_URL = `${PDFJS_BASE_URL}/build/pdf.mjs`;
  const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/build/pdf.worker.mjs`;
  const PDF_RENDER_TARGET_WIDTH = 1600;
  const PDF_RENDER_MAX_PIXELS = 6000000;

  const params = new URLSearchParams(window.location.search);
  const pageScreen = document.body?.dataset?.screen || window.SIGNAGE_SCREEN || "";
  const screenParam = params.get("screen") || pageScreen;
  const AUTH_KEY = "itaya-signage-admin-auth";
  const AUTH_CSRF_KEY = "itaya-signage-admin-csrf";
  const validScreens = new Set(["ad", "ad1", "ad2", "ad-portrait", "ad-landscape", "venue"]);
  const mediaUrlCache = new Map();
  const pdfPageUrlCache = new Map();
  const pdfDocumentCache = new Map();
  const pdfPageInfoCache = new Map();
  const sampleMediaIds = new Set([
    "sample-ad-portrait-1",
    "sample-ad-portrait-2",
    "sample-ad-landscape-top-1",
    "sample-ad-landscape-bottom-1"
  ]);
  let pdfJsPromise;

  const adSampleMedia = {
    portrait: [
      {
        id: "sample-ad-portrait-1",
        name: "chestnut_open-flier_1p.jpg",
        type: "image/jpeg",
        size: 0,
        assetUrl: "./assets/ad-samples/chestnut_open-flier_1p.jpg",
        isSample: true
      },
      {
        id: "sample-ad-portrait-2",
        name: "chestnut_open-flier_2p.jpg",
        type: "image/jpeg",
        size: 0,
        assetUrl: "./assets/ad-samples/chestnut_open-flier_2p.jpg",
        isSample: true
      }
    ],
    landscapeTop: [
      {
        id: "sample-ad-landscape-top-1",
        name: "yoko_1.png",
        type: "image/png",
        size: 0,
        assetUrl: "./assets/ad-samples/yoko_1.png",
        isSample: true
      }
    ],
    landscapeBottom: [
      {
        id: "sample-ad-landscape-bottom-1",
        name: "yoko_2.png",
        type: "image/png",
        size: 0,
        assetUrl: "./assets/ad-samples/yoko_2.png",
        isSample: true
      }
    ]
  };

  const venues = [
    "末広",
    "松風",
    "夕霧",
    "信夫",
    "入舟",
    "千鳥",
    "逢初",
    "有明",
    "千成",
    "蓬莱(西)",
    "蓬莱(東)",
    "天平(西)",
    "天平(東)",
    "桜(西)",
    "桜(東)",
    "菊(北)",
    "菊(南)",
    "藤(北)",
    "藤(南)",
    "ローズ",
    "楓",
    "寿",
    "葵",
    "テイクアウト",
    "コンパート",
    "オーロラ",
    "飯店",
    "飯店(A)",
    "飯店(B)",
    "バー",
    "チェスナット",
    "チェス2",
    "チェス3",
    "マイクロ1",
    "マイクロ2",
    "P大型1",
    "P大型2",
    "アルファード",
    "マーブル"
  ];

  const venueLocations = {
    "末広": "本館3F",
    "松風": "本館2F",
    "夕霧": "本館2F",
    "信夫": "本館2F",
    "入舟": "本館2F",
    "千鳥": "本館2F",
    "逢初": "本館2F",
    "有明": "本館2F",
    "千成": "本館2F",
    "蓬莱": "南館3F",
    "天平": "本館3F",
    "桜": "南館4F",
    "菊": "南館B1F",
    "藤": "南館B1F",
    "ローズ": "南館B1F",
    "ローズルーム": "南館B1F",
    "楓": "本館B1F",
    "寿": "本館B1F",
    "葵": "本館B1F",
    "コンパート": "本館8F",
    "オーロラ": "本館8F",
    "飯店": "南館2F",
    "バー": "南館1F",
    "チェスナット": "南館1F",
    "チェス2": "南館1F",
    "チェス3": "南館1F",
    "マーブル": "本館1F",
    "マイクロ1": "車両",
    "マイクロ2": "車両",
    "P大型1": "駐車場",
    "P大型2": "駐車場",
    "アルファード": "車両"
  };

  const sampleEvents = [
    { time: "07:00", venue: "蓬莱(東)", name: "研進会" },
    { time: "07:00", venue: "葵", name: "3X3 World Tour Utsunomiya スタッフ控室" },
    { time: "11:00", venue: "千鳥", name: "関東郵政退職者同友会 栃木県支部幹事会" },
    { time: "11:30", venue: "マーブル", name: "看なし（松崎）" },
    { time: "12:00", venue: "信夫", name: "清水建設OB会" },
    { time: "12:00", venue: "入舟", name: "なでしこ会（県庁OB会）" },
    { time: "12:00", venue: "逢初", name: "埼玉栃木卸売酒販組合" },
    { time: "14:00", venue: "天平(東)", name: "宇都宮市・上三川町小学校 副校長会" },
    { time: "15:00", venue: "蓬莱(東)", name: "令和8年 栃木県朝日会 総会" },
    { time: "16:00", venue: "ローズ", name: "宇都宮中央地区安全運転管理者協議会 常任理事会" },
    { time: "17:00", venue: "楓", name: "公益社団法人日本医業経営コンサルタント協会 栃木県支部" },
    { time: "17:30", venue: "夕霧", name: "宇都宮中央地区安全運転管理者協議会 常任理事会" },
    { time: "18:00", venue: "入舟", name: "八日会" },
    { time: "18:00", venue: "逢初", name: "公益社団法人日本医業経営コンサルタント協会 栃木県支部" },
    { time: "18:00", venue: "蓬莱(西)", name: "令和8年 栃木県朝日会 懇親会" },
    { time: "18:00", venue: "天平(西)", name: "宇都宮市・上三川町小学校 副校長会歓送迎会" },
    { time: "18:00", venue: "天平(東)", name: "2026年度 栃木MSA進発式" },
    { time: "18:00", venue: "チェスナット", name: "3X3 World Tour Utsunomiya" },
    { time: "18:30", venue: "信夫", name: "辻由会 総会 お花見会" },
    { time: "19:00", venue: "藤(北)", name: "宇都宮陽南ロータリークラブ" }
  ];

  function cloneSampleEvents() {
    return sampleEvents.map((event) => ({
      id: crypto.randomUUID(),
      date: currentDateString(),
      visibleOnSignage: false,
      ...event
    }));
  }

  function displayVenueName(venue) {
    const trimmed = String(venue || "").trim();
    if (trimmed === "チェス1" || trimmed === "チェス１") return "チェスナット";
    return trimmed;
  }

  function venueBaseName(venue) {
    return displayVenueName(venue).replace(/[（(][^）)]*[）)]$/, "");
  }

  function formatVenueLines(venue) {
    return displayVenueName(venue).split(",").map((item) => item.trim()).filter(Boolean).join("、");
  }

  function venueLocationFor(venue) {
    const names = displayVenueName(venue).split(",").map((item) => item.trim()).filter(Boolean);
    for (const name of names) {
      const baseName = venueBaseName(name);
      const exactLocation = venueLocations[name] || venueLocations[baseName];
      if (exactLocation) return exactLocation;
      const matchedVenue = Object.keys(venueLocations)
        .sort((a, b) => b.length - a.length)
        .find((venueName) => name.includes(venueName) || baseName.includes(venueName));
      if (matchedVenue) return venueLocations[matchedVenue];
    }
    return "";
  }

  function eventLocationFor(event) {
    return cleanText(event?.location || "", 60) || venueLocationFor(event?.venue || "");
  }

  function normalizeEventVenue(event) {
    const venue = displayVenueName(event.venue);
    return {
      ...event,
      date: event.date || currentDateString(),
      visibleOnSignage: event.visibleOnSignage === true,
      venue,
      location: cleanText(event.location || venueLocationFor(venue), 60)
    };
  }

  function cloneMediaItems(items) {
    return items.map((item) => ({ ...item }));
  }

  function cloneAdSampleMedia() {
    return {
      portrait: cloneMediaItems(adSampleMedia.portrait),
      landscapeTop: cloneMediaItems(adSampleMedia.landscapeTop),
      landscapeBottom: cloneMediaItems(adSampleMedia.landscapeBottom)
    };
  }

  function isSampleMedia(media) {
    return Boolean(media?.isSample) || sampleMediaIds.has(media?.id);
  }

  function defaultState() {
    const samples = cloneAdSampleMedia();
    return {
      adMedia: cloneMediaItems(samples.portrait),
      adLandscapeTop: cloneMediaItems(samples.landscapeTop),
      adLandscapeBottom: cloneMediaItems(samples.landscapeBottom),
      adLayout: "portrait",
      ad2Media: cloneMediaItems(samples.portrait),
      ad2LandscapeTop: cloneMediaItems(samples.landscapeTop),
      ad2LandscapeBottom: cloneMediaItems(samples.landscapeBottom),
      ad2Layout: "landscape",
      adSamplesInitialized: true,
      venueDisplayMode: "auto",
      venueEndedMode: "show",
      venueTheme: "light",
      venueDate: currentDateString(),
      adPortrait: [],
      adLandscape: [],
      slideSeconds: {
        ad: DEFAULT_SLIDE_SECONDS,
        ad2: DEFAULT_SLIDE_SECONDS,
        venue: DEFAULT_SLIDE_SECONDS,
        adPortrait: DEFAULT_SLIDE_SECONDS,
        adLandscape: DEFAULT_SLIDE_SECONDS
      },
      events: cloneSampleEvents()
    };
  }

  function normalizeStoredState(parsed) {
      const parsedSeconds = parsed.slideSeconds || {};
      const legacyMedia = [
        ...(Array.isArray(parsed.adPortrait) ? parsed.adPortrait : []),
        ...(Array.isArray(parsed.adLandscape) ? parsed.adLandscape : [])
      ];
      const legacyLandscape = Array.isArray(parsed.adLandscape) ? parsed.adLandscape : [];
      const adMedia = Array.isArray(parsed.adMedia) ? parsed.adMedia : legacyMedia;
      const venueDate = normalizeDateString(parsed.venueDate);
      return {
        adMedia: dedupeMedia(adMedia),
        adLandscapeTop: dedupeMedia(Array.isArray(parsed.adLandscapeTop) ? parsed.adLandscapeTop : legacyLandscape.filter((_, index) => index % 2 === 0)),
        adLandscapeBottom: dedupeMedia(Array.isArray(parsed.adLandscapeBottom) ? parsed.adLandscapeBottom : legacyLandscape.filter((_, index) => index % 2 === 1)),
        adLayout: parsed.adLayout === "landscape" ? "landscape" : "portrait",
        ad2Media: dedupeMedia(Array.isArray(parsed.ad2Media) ? parsed.ad2Media : []),
        ad2LandscapeTop: dedupeMedia(Array.isArray(parsed.ad2LandscapeTop) ? parsed.ad2LandscapeTop : []),
        ad2LandscapeBottom: dedupeMedia(Array.isArray(parsed.ad2LandscapeBottom) ? parsed.ad2LandscapeBottom : []),
        ad2Layout: parsed.ad2Layout === "landscape" ? "landscape" : "portrait",
        adSamplesInitialized: parsed.adSamplesInitialized === true,
        venueDisplayMode: parsed.venueDisplayMode === "all" ? "all" : "auto",
        venueEndedMode: parsed.venueEndedMode === "hide" ? "hide" : "show",
        venueTheme: parsed.venueTheme === "dark" ? "dark" : "light",
        venueDate: isVenueDateInCurrentTabs(venueDate) ? venueDate : currentDateString(),
        adPortrait: Array.isArray(parsed.adPortrait) ? parsed.adPortrait : [],
        adLandscape: Array.isArray(parsed.adLandscape) ? parsed.adLandscape : [],
        slideSeconds: {
          ad: normalizeSlideSeconds(parsedSeconds.ad || parsedSeconds.adPortrait || parsedSeconds.adLandscape),
          ad2: normalizeSlideSeconds(parsedSeconds.ad2),
          venue: normalizeSlideSeconds(parsedSeconds.venue),
          adPortrait: normalizeSlideSeconds(parsedSeconds.adPortrait),
          adLandscape: normalizeSlideSeconds(parsedSeconds.adLandscape)
        },
        events: Array.isArray(parsed.events) ? parsed.events.map(normalizeEventVenue) : cloneSampleEvents()
      };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeStoredState(JSON.parse(raw));
    } catch (error) {
      console.warn("Failed to load signage state", error);
      return defaultState();
    }
  }

  let state = defaultState();
  let previewScreen = document.body?.dataset?.adminScreen || "ad1";
  let renderToken = 0;
  let editingEventId = null;
  let saveStateTimer = 0;
  let localMediaMigrationStarted = false;

  function ensureInitialAdSamples() {
    if (state.adSamplesInitialized) return;
    const hasAnyAdMedia = [
      state.adMedia,
      state.adLandscapeTop,
      state.adLandscapeBottom,
      state.ad2Media,
      state.ad2LandscapeTop,
      state.ad2LandscapeBottom
    ].some((items) => Array.isArray(items) && items.length);
    if (!hasAnyAdMedia) {
      const samples = cloneAdSampleMedia();
      state.adMedia = cloneMediaItems(samples.portrait);
      state.adLandscapeTop = cloneMediaItems(samples.landscapeTop);
      state.adLandscapeBottom = cloneMediaItems(samples.landscapeBottom);
      state.ad2Media = cloneMediaItems(samples.portrait);
      state.ad2LandscapeTop = cloneMediaItems(samples.landscapeTop);
      state.ad2LandscapeBottom = cloneMediaItems(samples.landscapeBottom);
      state.ad2Layout = "landscape";
    }
    state.adSamplesInitialized = true;
    saveState();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.clearTimeout(saveStateTimer);
    saveStateTimer = window.setTimeout(saveStateToServer, 200);
  }

  async function saveStateToServer() {
    try {
      const csrfToken = sessionStorage.getItem(AUTH_CSRF_KEY) || "";
      const response = await fetch(STATE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(state)
      });
      if (!response.ok) throw new Error(`State save failed: ${response.status}`);
    } catch (error) {
      console.warn("Failed to save shared state", error);
    }
  }

  async function fetchSharedState() {
    try {
      const response = await fetch(`${STATE_API_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return null;
      const parsed = await response.json();
      if (!parsed || !Object.keys(parsed).length) return null;
      const sharedState = normalizeStoredState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sharedState));
      return sharedState;
    } catch (error) {
      console.warn("Failed to load shared state", error);
      return null;
    }
  }

  async function refreshSharedState() {
    const sharedState = await fetchSharedState();
    if (sharedState) state = sharedState;
  }

  function normalizeSlideSeconds(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_SLIDE_SECONDS;
    return Math.min(120, Math.max(1, Math.round(number)));
  }

  function dedupeMedia(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function slideMsFor(type) {
    if (type === "ad2") return normalizeSlideSeconds(state.slideSeconds.ad2) * 1000;
    if (type === "venue") return normalizeSlideSeconds(state.slideSeconds.venue) * 1000;
    if (type === "ad-portrait") return normalizeSlideSeconds(state.slideSeconds.adPortrait || state.slideSeconds.ad) * 1000;
    if (type === "ad-landscape") return normalizeSlideSeconds(state.slideSeconds.adLandscape || state.slideSeconds.ad) * 1000;
    return normalizeSlideSeconds(state.slideSeconds.ad) * 1000;
  }

  function slideIndexFor(ms) {
    return Math.floor(Date.now() / ms);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putMedia(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  async function getMedia(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  async function deleteMedia(id) {
    if (mediaUrlCache.has(id)) {
      URL.revokeObjectURL(mediaUrlCache.get(id));
      mediaUrlCache.delete(id);
    }
    for (const [key, url] of pdfPageUrlCache.entries()) {
      if (key.startsWith(`${id}:`)) {
        URL.revokeObjectURL(url);
        pdfPageUrlCache.delete(key);
      }
    }
    if (pdfDocumentCache.has(id)) {
      Promise.resolve(pdfDocumentCache.get(id)).then((pdf) => pdf.destroy?.()).catch(() => {});
      pdfDocumentCache.delete(id);
    }
    for (const key of pdfPageInfoCache.keys()) {
      if (key.startsWith(`${id}:`)) {
        pdfPageInfoCache.delete(key);
      }
    }
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  async function resolveMediaUrl(media) {
    if (!media) return "";
    if (media.assetUrl) return media.assetUrl;
    if (mediaUrlCache.has(media.id)) return mediaUrlCache.get(media.id);
    const record = await getMedia(media.id);
    if (!record || !record.blob) return "";
    const url = URL.createObjectURL(record.blob);
    mediaUrlCache.set(media.id, url);
    return url;
  }

  async function loadPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import(PDFJS_URL).then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjsLib;
      });
    }
    return pdfJsPromise;
  }

  function isPdfMedia(media) {
    return (media.type || "").includes("pdf") || media.name.toLowerCase().endsWith(".pdf");
  }

  function isAllowedMediaFile(file) {
    const type = guessType(file);
    return type.startsWith("image/") || type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  function pdfLoadOptions(data) {
    return {
      data,
      cMapPacked: true,
      cMapUrl: `${PDFJS_BASE_URL}/cmaps/`,
      disableFontFace: false,
      standardFontDataUrl: `${PDFJS_BASE_URL}/standard_fonts/`,
      useSystemFonts: true
    };
  }

  async function openPdfFromBlob(blob) {
    const pdfjsLib = await loadPdfJs();
    const data = new Uint8Array(await blob.arrayBuffer());
    return pdfjsLib.getDocument(pdfLoadOptions(data)).promise;
  }

  async function openPdfFromUrl(url) {
    const pdfjsLib = await loadPdfJs();
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    return pdfjsLib.getDocument(pdfLoadOptions(data)).promise;
  }

  async function getPdfDocument(media) {
    if (pdfDocumentCache.has(media.id)) return pdfDocumentCache.get(media.id);
    const promise = (async () => {
      if (media.assetUrl) return openPdfFromUrl(media.assetUrl);
      const record = await getMedia(media.id);
      if (!record || !record.blob) return null;
      return openPdfFromBlob(record.blob);
    })();
    pdfDocumentCache.set(media.id, promise);
    return promise;
  }

  async function readPdfPageCountFromBlob(blob) {
    const pdf = await openPdfFromBlob(blob);
    const pageCount = pdf.numPages || 1;
    await pdf.destroy?.();
    return pageCount;
  }

  async function getPdfPageCount(media) {
    if (!isPdfMedia(media)) return 1;
    if (Number.isFinite(Number(media.pageCount)) && Number(media.pageCount) > 0) {
      return Number(media.pageCount);
    }
    try {
      const pdf = await getPdfDocument(media);
      const pageCount = pdf?.numPages || 1;
      media.pageCount = pageCount;
      saveState();
      return pageCount;
    } catch (error) {
      console.warn("PDF page count failed", error);
      return 1;
    }
  }

  async function renderPdfPageUrl(media, pageNumber = 1) {
    const cacheKey = `${media.id}:${pageNumber}`;
    if (pdfPageUrlCache.has(cacheKey)) return pdfPageUrlCache.get(cacheKey);
    const pdf = await getPdfDocument(media);
    if (!pdf) return "";
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetScale = Math.min(3, Math.max(1, PDF_RENDER_TARGET_WIDTH / Math.max(baseViewport.width, 1)));
    let viewport = page.getViewport({ scale: targetScale });
    const pixels = viewport.width * viewport.height;
    if (pixels > PDF_RENDER_MAX_PIXELS) {
      viewport = page.getViewport({ scale: targetScale * Math.sqrt(PDF_RENDER_MAX_PIXELS / pixels) });
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    pdfPageUrlCache.set(cacheKey, url);
    return url;
  }

  async function getPdfPageInfo(media, pageNumber = 1) {
    const cacheKey = `${media.id}:${pageNumber}`;
    if (pdfPageInfoCache.has(cacheKey)) return pdfPageInfoCache.get(cacheKey);
    const pdf = await getPdfDocument(media);
    if (!pdf) return null;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const info = {
      width: Math.max(1, viewport.width),
      height: Math.max(1, viewport.height)
    };
    pdfPageInfoCache.set(cacheKey, info);
    return info;
  }

  function guessType(file) {
    if (file.type) return file.type;
    if (file.name.toLowerCase().endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function minutesFromTime(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return hours * 60 + minutes;
  }

  function venueDateTimeParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function currentDateString() {
    const parts = venueDateTimeParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function currentTimeString() {
    const parts = venueDateTimeParts();
    return `${parts.hour}:${parts.minute}`;
  }

  function normalizeDateString(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return "";
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  function normalizeTimeString(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return "";
    const hour = Number(match[1]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "";
    return `${String(hour).padStart(2, "0")}:${match[2]}`;
  }

  function cleanText(value, maxLength) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, maxLength);
  }

  function cleanMultilineText(value, maxLength) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, maxLength);
  }

  function dateForVenue(options = {}) {
    const previewDate = normalizeDateString(options.previewDate);
    if (previewDate) return previewDate;
    if (pageScreen === "venue") return currentDateString();
    return normalizeDateString(params.get("date") || state.venueDate) || currentDateString();
  }

  function dateObjectFromString(value) {
    const date = normalizeDateString(value) || currentDateString();
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day) - (9 * 60 * 60 * 1000));
  }

  function dateStringFromOffset(offset) {
    const date = dateObjectFromString(currentDateString());
    date.setUTCDate(date.getUTCDate() + offset);
    const parts = venueDateTimeParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function venueTabDates() {
    return Array.from({ length: VENUE_TAB_DAYS }, (_, index) => dateStringFromOffset(index));
  }

  function isVenueDateInCurrentTabs(date) {
    const normalized = normalizeDateString(date);
    return Boolean(normalized) && venueTabDates().includes(normalized);
  }

  function venueEventIdentity(event) {
    return [
      event.date || currentDateString(),
      event.time || "",
      displayVenueName(event.venue),
      String(event.name || "").trim()
    ].join("|");
  }

  function mergeImportedVenueEvents(importedEvents) {
    const importedDates = new Set(importedEvents.map((event) => event.date || currentDateString()));
    const visibleByIdentity = new Map(
      state.events
        .filter((event) => event.visibleOnSignage === true)
        .map((event) => [venueEventIdentity(event), true])
    );
    const retainedEvents = state.events.filter((event) => !importedDates.has(event.date || currentDateString()));
    const mergedImportedEvents = importedEvents.map((event) => ({
      ...event,
      visibleOnSignage: visibleByIdentity.get(venueEventIdentity(event)) === true
    }));
    return {
      events: sortEvents([...retainedEvents, ...mergedImportedEvents]),
      updatedDateCount: importedDates.size
    };
  }

  function shortDateLabel(value) {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: VENUE_TIME_ZONE,
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).format(dateObjectFromString(value));
  }

  function syncVenueDateInputs() {
    const date = state.venueDate || currentDateString();
    const eventDate = document.getElementById("eventDate");
    const previewDate = document.getElementById("previewDate");
    if (eventDate) eventDate.value = date;
    if (previewDate) previewDate.value = date;
  }

  async function selectVenueDate(date, options = {}) {
    state.venueDate = normalizeDateString(date) || currentDateString();
    syncVenueDateInputs();
    saveState();
    renderEventList();
    if (options.preview !== false) {
      await renderAdminPreview();
    }
  }

  function isEventInActiveWindow(event, referenceTime) {
    return Boolean(eventActiveLabel(event, referenceTime));
  }

  function eventActiveLabel(event, referenceTime) {
    const eventMinutes = minutesFromTime(event.time);
    const referenceMinutes = minutesFromTime(referenceTime);
    if (referenceMinutes >= eventMinutes - 30 && referenceMinutes < eventMinutes) return "もうすぐ開催";
    if (referenceMinutes >= eventMinutes && referenceMinutes <= eventMinutes + 120) return "開催中";
    return "";
  }

  function isEventEnded(event, referenceTime) {
    return minutesFromTime(referenceTime) > minutesFromTime(event.time) + 120;
  }

  function periodForTime(time) {
    const minutes = minutesFromTime(time);
    if (minutes < 12 * 60) return "morning";
    if (minutes < 17 * 60) return "afternoon";
    return "evening";
  }

  function periodLabel(period) {
    if (period === "all") return "終日のご案内";
    if (period === "morning") return "午前のご案内";
    if (period === "afternoon") return "午後のご案内";
    return "夜のご案内";
  }

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  function formatVenueTitleDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: VENUE_TIME_ZONE,
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.month}月${values.day}日（${values.weekday}）の会場案内`;
  }

  function sortEvents(events) {
    return [...events].sort((a, b) => {
      const dateDiff = String(a.date || "").localeCompare(String(b.date || ""), "ja");
      if (dateDiff !== 0) return dateDiff;
      const diff = minutesFromTime(a.time) - minutesFromTime(b.time);
      if (diff !== 0) return diff;
      return a.venue.localeCompare(b.venue, "ja");
    });
  }

  function createEl(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  async function handleUpload(files, key) {
    const uploads = Array.from(files);
    for (const file of uploads) {
      if (!isAllowedMediaFile(file)) continue;
      const type = guessType(file);
      let pageCount = 0;
      if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        try {
          pageCount = await readPdfPageCountFromBlob(file);
        } catch (error) {
          console.warn("PDF page count failed", error);
          pageCount = 1;
        }
      }
      const media = await uploadMediaFile(file, pageCount);
      state[key].push(media);
    }
    saveState();
    renderAdminLists();
    await renderAdminPreview();
  }

  async function uploadMediaFile(file, pageCount = 0, fallbackName = "upload") {
    const csrfToken = sessionStorage.getItem(AUTH_CSRF_KEY) || "";
    const formData = new FormData();
    const fileName = file.name || fallbackName;
    formData.append("file", file, fileName);
    if (pageCount > 0) formData.append("pageCount", String(pageCount));
    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      body: formData
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const result = await response.json();
    if (result?.ok !== true || !result.media?.assetUrl) {
      throw new Error("Upload response is invalid");
    }
    return result.media;
  }

  async function migrateLocalMediaToServer() {
    if (localMediaMigrationStarted) return;
    localMediaMigrationStarted = true;
    const keys = [
      "adMedia",
      "adLandscapeTop",
      "adLandscapeBottom",
      "ad2Media",
      "ad2LandscapeTop",
      "ad2LandscapeBottom"
    ];
    let migrated = false;
    for (const key of keys) {
      const items = Array.isArray(state[key]) ? state[key] : [];
      for (let index = 0; index < items.length; index += 1) {
        const media = items[index];
        if (!media || media.assetUrl || isSampleMedia(media)) continue;
        try {
          const record = await getMedia(media.id);
          if (!record?.blob) continue;
          const uploaded = await uploadMediaFile(record.blob, media.pageCount || 0, media.name || `${media.id}.pdf`);
          items[index] = { ...media, ...uploaded, id: uploaded.id || media.id };
          migrated = true;
        } catch (error) {
          console.warn("Local media migration failed", error);
        }
      }
    }
    if (!migrated) return;
    saveState();
    renderAdminLists();
    await renderAdminPreview();
  }

  async function removeMedia(key, id) {
    state[key] = state[key].filter((media) => media.id !== id);
    saveState();
    if (!sampleMediaIds.has(id)) {
      await deleteMedia(id);
    }
    renderAdminLists();
    await renderAdminPreview();
  }

  async function moveMedia(key, index, direction) {
    const items = state[key];
    const nextIndex = index + direction;
    if (!Array.isArray(items) || nextIndex < 0 || nextIndex >= items.length) return;
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    saveState();
    renderAdminLists();
    await renderAdminPreview();
  }

  function adKeysForSlot(slot) {
    const isAd2 = slot === "ad2";
    return {
      portrait: isAd2 ? "ad2Media" : "adMedia",
      top: isAd2 ? "ad2LandscapeTop" : "adLandscapeTop",
      bottom: isAd2 ? "ad2LandscapeBottom" : "adLandscapeBottom"
    };
  }

  function removeSamplesFromList(items) {
    return items.filter((media) => !isSampleMedia(media));
  }

  async function restoreAdSamples(slot) {
    const keys = adKeysForSlot(slot);
    const samples = cloneAdSampleMedia();
    state[keys.portrait] = [...removeSamplesFromList(state[keys.portrait]), ...cloneMediaItems(samples.portrait)];
    state[keys.top] = [...removeSamplesFromList(state[keys.top]), ...cloneMediaItems(samples.landscapeTop)];
    state[keys.bottom] = [...removeSamplesFromList(state[keys.bottom]), ...cloneMediaItems(samples.landscapeBottom)];
    state.adSamplesInitialized = true;
    saveState();
    renderAdminLists();
    await renderAdminPreview();
  }

  async function clearAdSamples(slot) {
    const keys = adKeysForSlot(slot);
    state[keys.portrait] = removeSamplesFromList(state[keys.portrait]);
    state[keys.top] = removeSamplesFromList(state[keys.top]);
    state[keys.bottom] = removeSamplesFromList(state[keys.bottom]);
    state.adSamplesInitialized = true;
    saveState();
    renderAdminLists();
    await renderAdminPreview();
  }

  function populateVenues() {
    const list = document.getElementById("eventVenueOptions");
    list.replaceChildren();
    venues.forEach((venue) => {
      const option = document.createElement("option");
      option.value = venue;
      list.appendChild(option);
    });
  }

  function setEventFormMode() {
    const submitButton = document.getElementById("eventSubmitButton");
    const cancelButton = document.getElementById("cancelEventEdit");
    if (!submitButton || !cancelButton) return;
    submitButton.textContent = editingEventId ? "更新" : "追加";
    cancelButton.classList.toggle("is-hidden", !editingEventId);
  }

  function resetEventForm() {
    const form = document.getElementById("eventForm");
    if (form) form.reset();
    const dateInput = document.getElementById("eventDate");
    if (dateInput) dateInput.value = state.venueDate || currentDateString();
    const venueSelect = document.getElementById("eventVenue");
    if (venueSelect) venueSelect.value = venues[0];
    const locationInput = document.getElementById("eventLocation");
    if (locationInput) locationInput.value = venueLocationFor(venues[0]);
    editingEventId = null;
    setEventFormMode();
  }

  function startEventEdit(id) {
    const eventItem = state.events.find((item) => item.id === id);
    if (!eventItem) return;
    editingEventId = id;
    document.getElementById("eventDate").value = eventItem.date || state.venueDate || currentDateString();
    document.getElementById("eventTime").value = eventItem.time;
    document.getElementById("eventVenue").value = displayVenueName(eventItem.venue);
    document.getElementById("eventLocation").value = eventLocationFor(eventItem);
    document.getElementById("eventName").value = eventItem.name;
    setEventFormMode();
    renderEventList();
    document.getElementById("eventName").focus();
  }

  async function toggleVenueEventVisibility(id) {
    const eventItem = state.events.find((item) => item.id === id);
    if (!eventItem) return;
    state.events = state.events.map((item) => (
      item.id === id ? { ...item, visibleOnSignage: item.visibleOnSignage !== true } : item
    ));
    await selectVenueDate(eventItem.date || currentDateString());
  }

  function renderMediaList(key, mountId) {
    const mount = document.getElementById(mountId);
    mount.replaceChildren();
    const items = state[key];
    if (!items.length) {
      mount.appendChild(createEl("p", "panel-note", "まだ登録がありません。表示画面では仮の案内が表示されます。"));
      return;
    }
    items.forEach((media, index) => {
      const row = createEl("div", "media-item");
      const text = createEl("div");
      text.appendChild(createEl("strong", "", `${index + 1}. ${media.name}`));
      const pageText = isPdfMedia(media) && media.pageCount ? ` / ${media.pageCount}ページ` : "";
      const sourceText = isSampleMedia(media) ? "サンプル画像" : formatBytes(media.size || 0);
      text.appendChild(createEl("small", "", `${media.type || "file"} / ${sourceText}${pageText}`));
      const actions = createEl("div", "media-item-actions");
      const upButton = createEl("button", "", "↑");
      upButton.type = "button";
      upButton.disabled = index === 0;
      upButton.title = "上へ移動";
      upButton.addEventListener("click", () => moveMedia(key, index, -1));
      const downButton = createEl("button", "", "↓");
      downButton.type = "button";
      downButton.disabled = index === items.length - 1;
      downButton.title = "下へ移動";
      downButton.addEventListener("click", () => moveMedia(key, index, 1));
      const button = createEl("button", "", "削除");
      button.type = "button";
      button.addEventListener("click", () => removeMedia(key, media.id));
      actions.append(upButton, downButton, button);
      row.append(text, actions);
      mount.appendChild(row);
    });
  }

  function renderEventList() {
    const mount = document.getElementById("eventList");
    renderVenueDateTabs();
    mount.replaceChildren();
    const targetDate = state.venueDate || currentDateString();
    const events = sortEvents(state.events).filter((event) => (event.date || currentDateString()) === targetDate);
    if (!events.length) {
      mount.appendChild(createEl("p", "panel-note", "会場案内は空です。必要な行を追加してください。"));
      return;
    }
    events.forEach((event) => {
      const row = createEl("div", "event-row");
      row.classList.toggle("is-editing", event.id === editingEventId);
      row.classList.toggle("is-visible-on-signage", event.visibleOnSignage === true);
      const text = createEl("div");
      text.appendChild(createEl("strong", "", `${event.date || currentDateString()}　${event.time}　${formatVenueLines(event.venue)}`));
      text.appendChild(createEl("small", "", event.name));
      const actions = createEl("div", "event-row-actions");
      const showButton = createEl("button", "", event.visibleOnSignage === true ? "表示中" : "表示");
      showButton.type = "button";
      showButton.addEventListener("click", () => toggleVenueEventVisibility(event.id));
      const editButton = createEl("button", "", event.id === editingEventId ? "編集中" : "編集");
      editButton.type = "button";
      editButton.addEventListener("click", () => startEventEdit(event.id));
      const deleteButton = createEl("button", "", "削除");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", async () => {
        state.events = state.events.filter((item) => item.id !== event.id);
        if (editingEventId === event.id) resetEventForm();
        saveState();
        renderEventList();
        await renderAdminPreview();
      });
      actions.append(showButton, editButton, deleteButton);
      row.append(text, actions);
      mount.appendChild(row);
    });
  }

  function renderVenueDateTabs() {
    const mount = document.getElementById("venueDateTabs");
    if (!mount) return;
    const selectedDate = state.venueDate || currentDateString();
    const counts = new Map();
    state.events.forEach((event) => {
      const date = event.date || currentDateString();
      counts.set(date, (counts.get(date) || 0) + 1);
    });
    mount.replaceChildren();
    venueTabDates().forEach((date, index) => {
      const button = createEl("button", "venue-date-tab", `${index === 0 ? "本日 " : ""}${shortDateLabel(date)} (${counts.get(date) || 0})`);
      button.type = "button";
      button.role = "tab";
      button.ariaSelected = String(date === selectedDate);
      button.classList.toggle("is-active", date === selectedDate);
      button.addEventListener("click", () => selectVenueDate(date));
      mount.appendChild(button);
    });
  }

  function renderAdminLists() {
    renderMediaList("adMedia", "adPortraitList");
    renderMediaList("adLandscapeTop", "adLandscapeTopList");
    renderMediaList("adLandscapeBottom", "adLandscapeBottomList");
    renderMediaList("ad2Media", "ad2PortraitList");
    renderMediaList("ad2LandscapeTop", "ad2LandscapeTopList");
    renderMediaList("ad2LandscapeBottom", "ad2LandscapeBottomList");
    renderEventList();
  }

  function syncAdLayoutControls(slot = "ad1") {
    const isAd2 = slot === "ad2";
    const isLandscape = (isAd2 ? state.ad2Layout : state.adLayout) === "landscape";
    document.getElementById(isAd2 ? "ad2PortraitControls" : "adPortraitControls").classList.toggle("is-hidden", isLandscape);
    document.getElementById(isAd2 ? "ad2LandscapeControls" : "adLandscapeControls").classList.toggle("is-hidden", !isLandscape);
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === "\"" && next === "\"") {
          field += "\"";
          index += 1;
        } else if (char === "\"") {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === "\"") {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter((item) => item.some((cell) => String(cell || "").trim()));
  }

  function csvHeaderIndexes(headers) {
    const pairs = {
      table: "\u30c6\u30fc\u30d6\u30eb",
      name: "\u540d\u524d",
      company: "\u4f1a\u793e\u540d",
      status: "\u30b9\u30c6\u30fc\u30bf\u30b9",
      startDate: "\u958b\u59cb\u65e5",
      startTime: "\u958b\u59cb\u6642\u523b",
      location: "\u5834\u6240",
      section: "\u30bb\u30af\u30b7\u30e7\u30f3",
      groupName: "\u30b0\u30eb\u30fc\u30d7\u540d"
    };
    return Object.fromEntries(Object.entries(pairs).map(([key, label]) => [key, headers.indexOf(label)]));
  }

  function csvValue(row, indexes, key, fallbackIndex = -1) {
    const index = indexes[key] >= 0 ? indexes[key] : fallbackIndex;
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function normalizeCsvTime(value) {
    return normalizeTimeString(String(value || "").trim().slice(0, 5));
  }

  function venueEventsFromCsv(text) {
    const rows = parseCsvRows(text);
    const headerIndex = rows.findIndex((row) => row.length > 20 && row.some((cell) => cell === "\u4e88\u7d04ID"));
    if (headerIndex < 0) return [];
    const indexes = csvHeaderIndexes(rows[headerIndex]);
    return rows.slice(headerIndex + 1).map((row) => {
      const status = csvValue(row, indexes, "status", 24);
      if (status.includes("\u30ad\u30e3\u30f3\u30bb\u30eb")) return null;
      const date = normalizeDateString(csvValue(row, indexes, "startDate", 37)) || state.venueDate || currentDateString();
      const time = normalizeCsvTime(csvValue(row, indexes, "startTime", 38));
      const venue = displayVenueName(cleanText(csvValue(row, indexes, "table", 10) || csvValue(row, indexes, "section", 47), 120));
      const location = cleanText(csvValue(row, indexes, "location"), 60) || venueLocationFor(venue);
      const name = cleanMultilineText(csvValue(row, indexes, "groupName", 50) || csvValue(row, indexes, "company", 14) || csvValue(row, indexes, "name", 12), 240);
      if (!time || !venue || !name) return null;
      return {
        id: crypto.randomUUID(),
        date,
        visibleOnSignage: false,
        time,
        venue,
        location,
        name
      };
    }).filter(Boolean);
  }

  async function readCsvFile(file) {
    const buffer = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementCount < 3) return utf8;
    try {
      return new TextDecoder("shift_jis", { fatal: false }).decode(buffer);
    } catch {
      return utf8;
    }
  }

  async function importVenueCsv() {
    const input = document.getElementById("venueCsvUpload");
    const status = document.getElementById("venueCsvImportStatus");
    const file = input?.files?.[0];
    if (!file) {
      if (status) status.textContent = "CSV file is not selected.";
      return;
    }
    try {
      const events = sortEvents(venueEventsFromCsv(await readCsvFile(file)));
      if (!events.length) {
        if (status) status.textContent = "No venue events were found.";
        return;
      }
      const merged = mergeImportedVenueEvents(events);
      state.events = merged.events;
      state.venueDate = events[0].date || state.venueDate || currentDateString();
      const previewDate = document.getElementById("previewDate");
      const eventDate = document.getElementById("eventDate");
      if (previewDate) previewDate.value = state.venueDate;
      if (eventDate) eventDate.value = state.venueDate;
      resetEventForm();
      saveState();
      renderEventList();
      await renderAdminPreview();
      if (status) status.textContent = `${events.length} events imported. ${merged.updatedDateCount} dates updated.`;
    } catch (error) {
      console.warn("CSV import failed", error);
      if (status) status.textContent = "CSV import failed.";
    }
  }

  function isAdminAuthenticated() {
    return sessionStorage.getItem(AUTH_KEY) === "true";
  }

  async function fetchAuthStatus() {
    try {
      const csrfToken = sessionStorage.getItem(AUTH_CSRF_KEY) || "";
      const response = await fetch(`${AUTH_API_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {}
      });
      if (!response.ok) return false;
      const result = await response.json();
      if (result?.authenticated === true && result.csrfToken) {
        sessionStorage.setItem(AUTH_KEY, "true");
        sessionStorage.setItem(AUTH_CSRF_KEY, result.csrfToken);
        return true;
      }
    } catch (error) {
      console.warn("Failed to check admin session", error);
    }
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_CSRF_KEY);
    return false;
  }

  async function loginAdmin(password) {
    const response = await fetch(AUTH_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result?.authenticated !== true || !result.csrfToken) return false;
    sessionStorage.setItem(AUTH_KEY, "true");
    sessionStorage.setItem(AUTH_CSRF_KEY, result.csrfToken);
    return true;
  }

  function revealAdmin() {
    document.body.classList.remove("auth-locked");
    document.getElementById("loginApp")?.classList.add("is-hidden");
  }

  async function setupAdminAuth(onAuthenticated) {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) {
      onAuthenticated();
      return;
    }
    if (isAdminAuthenticated() && await fetchAuthStatus()) {
      revealAdmin();
      onAuthenticated();
      return;
    }
    const passwordInput = document.getElementById("loginPassword");
    const error = document.getElementById("loginError");
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (error) error.textContent = "";
      const submitButton = loginForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      if (await loginAdmin(passwordInput.value)) {
        revealAdmin();
        onAuthenticated();
        return;
      }
      if (error) error.textContent = "Invalid password.";
      passwordInput.select();
      if (submitButton) submitButton.disabled = false;
    });
    passwordInput?.focus();
  }

  function syncAdminPageChrome() {
    const adminScreen = document.body?.dataset?.adminScreen;
    if (!adminScreen) return;
    previewScreen = adminScreen;
    document.querySelectorAll("[data-preview-screen]").forEach((button) => {
      button.classList.toggle("active", button.dataset.previewScreen === adminScreen);
    });
  }

  function setupAdmin() {
    syncAdminPageChrome();
    populateVenues();
    document.getElementById("adSlideSeconds").value = state.slideSeconds.ad;
    document.getElementById("ad2SlideSeconds").value = state.slideSeconds.ad2;
    document.getElementById("venueSlideSeconds").value = state.slideSeconds.venue;
    document.getElementById("eventDate").value = state.venueDate || currentDateString();
    document.getElementById("previewDate").value = state.venueDate || currentDateString();
    document.getElementById(state.adLayout === "landscape" ? "adLayoutLandscape" : "adLayoutPortrait").checked = true;
    document.getElementById(state.ad2Layout === "landscape" ? "ad2LayoutLandscape" : "ad2LayoutPortrait").checked = true;
    document.getElementById(state.venueDisplayMode === "all" ? "venueModeAll" : "venueModeAuto").checked = true;
    document.getElementById(state.venueEndedMode === "hide" ? "venueEndedHide" : "venueEndedShow").checked = true;
    document.getElementById(state.venueTheme === "dark" ? "venueThemeDark" : "venueThemeLight").checked = true;
    renderAdminLists();
    setEventFormMode();
    syncAdLayoutControls();
    syncAdLayoutControls("ad2");
    migrateLocalMediaToServer();

    document.getElementById("adPortraitUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "adMedia");
      event.target.value = "";
    });

    document.getElementById("adLandscapeTopUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "adLandscapeTop");
      event.target.value = "";
    });

    document.getElementById("adLandscapeBottomUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "adLandscapeBottom");
      event.target.value = "";
    });

    document.getElementById("ad2PortraitUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "ad2Media");
      event.target.value = "";
    });

    document.getElementById("ad2LandscapeTopUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "ad2LandscapeTop");
      event.target.value = "";
    });

    document.getElementById("ad2LandscapeBottomUpload").addEventListener("change", (event) => {
      handleUpload(event.target.files, "ad2LandscapeBottom");
      event.target.value = "";
    });

    document.getElementById("restoreAdSamples").addEventListener("click", () => restoreAdSamples("ad1"));
    document.getElementById("clearAdSamples").addEventListener("click", () => clearAdSamples("ad1"));
    document.getElementById("restoreAd2Samples").addEventListener("click", () => restoreAdSamples("ad2"));
    document.getElementById("clearAd2Samples").addEventListener("click", () => clearAdSamples("ad2"));

    document.querySelectorAll('input[name="adLayout"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        state.adLayout = event.target.value === "landscape" ? "landscape" : "portrait";
        saveState();
        syncAdLayoutControls();
        await renderAdminPreview();
      });
    });

    document.querySelectorAll('input[name="ad2Layout"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        state.ad2Layout = event.target.value === "landscape" ? "landscape" : "portrait";
        saveState();
        syncAdLayoutControls("ad2");
        await renderAdminPreview();
      });
    });

    document.querySelectorAll('input[name="venueDisplayMode"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        state.venueDisplayMode = event.target.value === "all" ? "all" : "auto";
        saveState();
        await renderAdminPreview();
      });
    });

    document.querySelectorAll('input[name="venueEndedMode"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        state.venueEndedMode = event.target.value === "hide" ? "hide" : "show";
        saveState();
        await renderAdminPreview();
      });
    });

    document.querySelectorAll('input[name="venueTheme"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        state.venueTheme = event.target.value === "dark" ? "dark" : "light";
        saveState();
        await renderAdminPreview();
      });
    });

    document.getElementById("adSlideSeconds").addEventListener("change", async (event) => {
      state.slideSeconds.ad = normalizeSlideSeconds(event.target.value);
      event.target.value = state.slideSeconds.ad;
      saveState();
      await renderAdminPreview();
    });

    document.getElementById("ad2SlideSeconds").addEventListener("change", async (event) => {
      state.slideSeconds.ad2 = normalizeSlideSeconds(event.target.value);
      event.target.value = state.slideSeconds.ad2;
      saveState();
      await renderAdminPreview();
    });

    document.getElementById("venueSlideSeconds").addEventListener("change", async (event) => {
      state.slideSeconds.venue = normalizeSlideSeconds(event.target.value);
      event.target.value = state.slideSeconds.venue;
      saveState();
      await renderAdminPreview();
    });

    document.getElementById("previewDate").addEventListener("change", async (event) => {
      state.venueDate = normalizeDateString(event.target.value) || currentDateString();
      document.getElementById("eventDate").value = state.venueDate;
      saveState();
      renderEventList();
      await renderAdminPreview();
    });

    document.getElementById("eventVenue").addEventListener("change", (event) => {
      const locationInput = document.getElementById("eventLocation");
      if (!locationInput) return;
      locationInput.value = venueLocationFor(event.target.value);
    });

    document.getElementById("eventForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const date = normalizeDateString(document.getElementById("eventDate").value) || currentDateString();
      const time = normalizeTimeString(document.getElementById("eventTime").value);
      const venue = cleanText(document.getElementById("eventVenue").value, 120);
      const location = cleanText(document.getElementById("eventLocation").value, 60) || venueLocationFor(venue);
      const name = cleanMultilineText(document.getElementById("eventName").value, 240);
      if (!time || !venue || !name) return;
      state.venueDate = date;
      if (editingEventId) {
        state.events = state.events.map((item) => (
          item.id === editingEventId ? { ...item, date, time, venue, location, name, visibleOnSignage: item.visibleOnSignage === true } : item
        ));
      } else {
        state.events.push({ id: crypto.randomUUID(), date, visibleOnSignage: false, time, venue, location, name });
      }
      state.events = sortEvents(state.events);
      saveState();
      resetEventForm();
      syncVenueDateInputs();
      renderEventList();
      await renderAdminPreview();
    });

    document.getElementById("cancelEventEdit").addEventListener("click", () => {
      resetEventForm();
      renderEventList();
    });

    document.getElementById("previewTime").addEventListener("change", renderAdminPreview);

    document.getElementById("importVenueCsv")?.addEventListener("click", importVenueCsv);

    document.getElementById("loadSampleEvents").addEventListener("click", async () => {
      state.events = cloneSampleEvents();
      resetEventForm();
      saveState();
      renderEventList();
      await renderAdminPreview();
    });

    document.getElementById("clearEvents").addEventListener("click", async () => {
      state.events = [];
      resetEventForm();
      saveState();
      renderEventList();
      await renderAdminPreview();
    });

    document.querySelectorAll("[data-preview-screen]").forEach((button) => {
      button.addEventListener("click", async () => {
        document.querySelectorAll("[data-preview-screen]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        previewScreen = button.dataset.previewScreen;
        await renderAdminPreview();
      });
    });

    renderAdminPreview();
    window.setInterval(renderAdminPreview, 1000);
  }

  async function renderAdminPreview() {
    const mount = document.getElementById("screenPreview");
    if (!mount) return;
    let frame = mount.querySelector(".monitor-preview-frame");
    if (!frame) {
      frame = createEl("div", "monitor-preview-frame");
      mount.replaceChildren(frame);
    }
    await renderSignage(previewScreen, frame, {
      previewDate: document.getElementById("previewDate").value || state.venueDate || currentDateString(),
      previewTime: document.getElementById("previewTime").value || currentTimeString()
    });
  }

  function emptyMediaMessage(message) {
    const wrap = createEl("div", "empty-media");
    wrap.textContent = message;
    return wrap;
  }

  async function expandAdItems(mediaItems) {
    const slides = [];
    for (const media of mediaItems) {
      if (isPdfMedia(media)) {
        const pageCount = await getPdfPageCount(media);
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          slides.push({ ...media, pageNumber });
        }
      } else {
        slides.push(media);
      }
    }
    return slides;
  }

  function estimateAdItems(mediaItems) {
    const slides = [];
    mediaItems.forEach((media) => {
      if (isPdfMedia(media)) {
        const pageCount = Math.max(1, Number(media.pageCount) || 1);
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          slides.push({ ...media, pageNumber });
        }
        return;
      }
      slides.push(media);
    });
    return slides;
  }

  function mediaKey(media) {
    if (!media) return "empty";
    return `${media.id || media.name}:${media.pageNumber || 1}`;
  }

  function adLayoutFor(type) {
    if (type === "ad-portrait") return "portrait";
    if (type === "ad-landscape") return "landscape";
    return type === "ad2" ? state.ad2Layout : state.adLayout;
  }

  function adSourceFor(type) {
    const isAd2 = type === "ad2";
    return {
      portrait: isAd2 ? state.ad2Media : state.adMedia,
      top: isAd2 ? state.ad2LandscapeTop : state.adLandscapeTop,
      bottom: isAd2 ? state.ad2LandscapeBottom : state.adLandscapeBottom
    };
  }

  function adRenderKey(type) {
    const layout = adLayoutFor(type);
    const source = adSourceFor(type);
    const slideMs = slideMsFor(type);
    const slideIndex = slideIndexFor(slideMs);
    if (layout === "portrait") {
      const media = estimateAdItems(source.portrait);
      const slide = media.length ? media[slideIndex % media.length] : null;
      return [type, layout, slideMs, media.length, mediaKey(slide)].join("|");
    }
    const topMedia = estimateAdItems(source.top);
    const bottomMedia = estimateAdItems(source.bottom);
    const topSlide = topMedia.length ? topMedia[slideIndex % topMedia.length] : null;
    const bottomSlide = bottomMedia.length ? bottomMedia[slideIndex % bottomMedia.length] : null;
    return [type, layout, slideMs, topMedia.length, mediaKey(topSlide), bottomMedia.length, mediaKey(bottomSlide)].join("|");
  }

  async function createNativePdfObject(media, url) {
    const pageNumber = media.pageNumber || 1;
    const object = document.createElement("object");
    object.className = "pdf-native-object";
    object.type = "application/pdf";
    object.data = `${url}#page=${pageNumber}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
    object.appendChild(emptyMediaMessage(media.name));
    return object;
  }

  async function renderPdfImageFrame(wrap, media, nativeUrl) {
    try {
      const pdfImageUrl = await renderPdfPageUrl(media, media.pageNumber || 1);
      if (!pdfImageUrl) throw new Error("PDF image render returned empty URL");
      const pageInfo = await getPdfPageInfo(media, media.pageNumber || 1);
      if (pageInfo) {
        wrap.style.setProperty("--pdf-page-ratio", `${pageInfo.width} / ${pageInfo.height}`);
      }
      const image = document.createElement("img");
      image.className = "media-fit-width";
      image.src = pdfImageUrl;
      image.alt = media.pageNumber ? `${media.name} ${media.pageNumber}` : media.name;
      wrap.appendChild(image);
    } catch (error) {
      console.warn("PDF image render failed", error);
      try {
        wrap.appendChild(await createNativePdfObject(media, nativeUrl));
      } catch (nativeError) {
        console.warn("Native PDF display setup failed", nativeError);
        wrap.appendChild(emptyMediaMessage(media.name));
      }
    }
    return wrap;
  }

  async function createMediaFrame(media, fallbackText) {
    const wrap = createEl("div", "media-frame-wrap");
    if (!media) {
      wrap.appendChild(emptyMediaMessage(fallbackText));
      return wrap;
    }
    const url = await resolveMediaUrl(media);
    if (!url) {
      wrap.appendChild(emptyMediaMessage("登録ファイルを読み込めませんでした。管理画面から再登録してください。"));
      return wrap;
    }
    if (isPdfMedia(media)) {
      wrap.classList.add("pdf-native-frame");
      return renderPdfImageFrame(wrap, media, url);
      try {
        const pageInfo = await getPdfPageInfo(media, media.pageNumber || 1);
        if (pageInfo) {
          wrap.style.setProperty("--pdf-page-ratio", `${pageInfo.width} / ${pageInfo.height}`);
        }
        wrap.appendChild(await createNativePdfObject(media, url));
      } catch (error) {
        console.warn("Native PDF display setup failed", error);
        try {
          const pdfImageUrl = await renderPdfPageUrl(media, media.pageNumber || 1);
          if (!pdfImageUrl) {
            wrap.appendChild(emptyMediaMessage("登録PDFを読み込めませんでした。管理画面から再登録してください。"));
            return wrap;
          }
          const image = document.createElement("img");
          image.className = "media-fit-width";
          image.src = pdfImageUrl;
          image.alt = media.pageNumber ? `${media.name} ${media.pageNumber}ページ` : media.name;
          wrap.appendChild(image);
        } catch (renderError) {
          console.warn("PDF render failed", renderError);
          wrap.appendChild(emptyMediaMessage("登録PDFを読み込めませんでした。PDFを軽量化して再登録してください。"));
        }
      }
      return wrap;
    }
    const image = document.createElement("img");
    image.className = "media-fit-width";
    image.src = url;
    image.alt = media.name;
    wrap.appendChild(image);
    return wrap;
  }

  async function renderAdScreen(type) {
    const screen = createEl("section", "signage-screen ad-screen");
    const header = createEl("header", "ad-header");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    title.classList.add("ad-header-title");
    title.setAttribute("viewBox", "0 0 360 72");
    title.setAttribute("role", "img");
    title.setAttribute("aria-label", "INFORMATION");
    const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titleText.setAttribute("x", "180");
    titleText.setAttribute("y", "50");
    titleText.setAttribute("text-anchor", "middle");
    titleText.setAttribute("font-size", "46");
    titleText.setAttribute("textLength", "340");
    titleText.setAttribute("lengthAdjust", "spacingAndGlyphs");
    titleText.textContent = "INFORMATION";
    title.appendChild(titleText);
    header.appendChild(title);
    const layout = adLayoutFor(type);
    const source = adSourceFor(type);
    const stage = createEl("div", `ad-stage ${layout === "portrait" ? "portrait" : "landscape"}`);
    const footer = createEl("footer", "ad-footer");
    const logo = document.createElement("img");
    logo.src = "./assets/logo_itaya.png";
    logo.alt = "HOTEL NEW ITAYA";
    footer.appendChild(logo);
    const slideMs = slideMsFor(type);
    const slideIndex = slideIndexFor(slideMs);

    if (layout === "portrait") {
      const media = await expandAdItems(source.portrait);
      const slide = media.length ? slideIndex % media.length : 0;
      stage.appendChild(await createMediaFrame(media[slide], "A版縦PDFまたは画像を登録してください"));
    } else {
      const topMediaItems = await expandAdItems(source.top);
      const bottomMediaItems = await expandAdItems(source.bottom);
      const topMedia = topMediaItems.length ? topMediaItems[slideIndex % topMediaItems.length] : null;
      const bottomMedia = bottomMediaItems.length ? bottomMediaItems[slideIndex % bottomMediaItems.length] : null;
      stage.appendChild(await createMediaFrame(topMedia, "横表示 上段用のPDFまたは画像を登録してください"));
      stage.appendChild(await createMediaFrame(bottomMedia, "横表示 下段用のPDFまたは画像を登録してください"));
    }

    screen.append(header, stage, footer);
    return screen;
  }

  function getVenueEvents(referenceTime, referenceDate) {
    const period = periodForTime(referenceTime);
    const targetDate = normalizeDateString(referenceDate) || currentDateString();
    const datedEvents = sortEvents(state.events).filter((event) => (
      event.visibleOnSignage === true && (event.date || currentDateString()) === targetDate
    ));
    if (state.venueDisplayMode === "all") {
      return {
        period: "all",
        events: state.venueEndedMode === "hide" ? datedEvents.filter((event) => !isEventEnded(event, referenceTime)) : datedEvents
      };
    }
    const samePeriod = datedEvents.filter((event) => periodForTime(event.time) === period);
    return {
      period,
      events: samePeriod
    };
  }

  function venuePageIndex(events) {
    const pageCount = Math.ceil(events.length / VENUE_PAGE_SIZE);
    if (!pageCount) return 0;
    return slideIndexFor(slideMsFor("venue")) % pageCount;
  }

  function pagedEvents(events) {
    const pages = [];
    for (let index = 0; index < events.length; index += VENUE_PAGE_SIZE) {
      pages.push(events.slice(index, index + VENUE_PAGE_SIZE));
    }
    if (!pages.length) return [];
    return pages[venuePageIndex(events)];
  }

  function venueRenderKey(options = {}) {
    const referenceTime = options.previewTime || params.get("time") || currentTimeString();
    const referenceDate = dateForVenue(options);
    const { period, events } = getVenueEvents(referenceTime, referenceDate);
    const visibleEvents = pagedEvents(events);
    const eventKey = visibleEvents.map((event) => `${event.id}:${event.visibleOnSignage}:${event.time}:${event.venue}:${event.name}:${isEventInActiveWindow(event, referenceTime) ? "active" : "idle"}`).join(",");
    return ["venue", state.venueDisplayMode, state.venueEndedMode, state.venueTheme, referenceDate, referenceTime, period, state.slideSeconds.venue, events.length, venuePageIndex(events), eventKey].join("|");
  }

  function renderKeyFor(type, options = {}) {
    return type === "venue" ? venueRenderKey(options) : adRenderKey(type);
  }

  function renderVenueScreen(options = {}) {
    const referenceTime = options.previewTime || params.get("time") || currentTimeString();
    const referenceDate = dateForVenue(options);
    const { period, events } = getVenueEvents(referenceTime, referenceDate);
    const visibleEvents = pagedEvents(events);
    const themeClass = state.venueTheme === "dark" ? "dark-mode" : "light-mode";
    const screen = createEl("section", `signage-screen venue-screen ${themeClass}`);

    const header = createEl("header", "venue-header");
    const title = createEl("h1", "", formatVenueTitleDate(dateObjectFromString(referenceDate)));
    header.appendChild(title);

    const list = createEl("div", "venue-list");
    if (!visibleEvents.length) {
      list.appendChild(createEl("div", "empty-events", "現在表示する会場案内はありません"));
    } else {
      visibleEvents.forEach((event) => {
        const card = createEl("article", "venue-card");
        const activeLabel = eventActiveLabel(event, referenceTime);
        if (activeLabel) {
          card.classList.add("is-active-window");
        }
        const time = createEl("div", "venue-time");
        if (activeLabel) {
          time.appendChild(createEl("div", "venue-status-label", activeLabel));
        }
        time.appendChild(createEl("span", "", event.time));
        card.appendChild(time);
        const detail = createEl("div", "venue-detail");
        const roomLine = createEl("div", "venue-room-line");
        const location = eventLocationFor(event);
        if (location) roomLine.appendChild(createEl("span", "venue-location-badge", location));
        roomLine.appendChild(createEl("div", "venue-room", formatVenueLines(event.venue)));
        detail.appendChild(roomLine);
        detail.appendChild(createEl("div", "venue-divider"));
        detail.appendChild(createEl("div", "venue-name", event.name));
        card.appendChild(detail);
        list.appendChild(card);
      });
    }

    const footer = createEl("footer", "venue-footer");
    const footerLogo = document.createElement("img");
    footerLogo.src = "./assets/logo_itaya.png";
    footerLogo.alt = "HOTEL NEW ITAYA";
    footer.appendChild(footerLogo);
    screen.append(header, list, footer);
    return screen;
  }

  async function renderSignage(type, mount, options = {}) {
    const nextKey = renderKeyFor(type, options);
    if (mount.dataset.renderKey === nextKey && mount.firstElementChild) return;
    const token = ++renderToken;
    const screen = type === "venue" ? renderVenueScreen(options) : await renderAdScreen(type);
    if (token !== renderToken) return;
    screen.dataset.renderKey = nextKey;
    screen.classList.add("is-entering");
    const previous = mount.querySelector(".signage-screen");
    mount.dataset.renderKey = nextKey;
    mount.appendChild(screen);
    window.requestAnimationFrame(() => {
      screen.classList.add("is-visible");
      if (previous) previous.classList.add("is-leaving");
    });
    if (previous) {
      window.setTimeout(() => previous.remove(), SLIDE_TRANSITION_MS);
    }
  }

  async function setupViewer(type) {
    document.body.classList.add("viewer-mode");
    const mount = document.getElementById("viewerApp");
    await renderSignage(type, mount);
    window.setInterval(() => renderSignage(type, mount), 1000);
    window.setInterval(async () => {
      await refreshSharedState();
      await renderSignage(type, mount);
    }, 5000);
  }

  async function boot() {
    const isViewer = validScreens.has(screenParam);
    const sharedState = await fetchSharedState();
    state = sharedState || loadState();
    ensureInitialAdSamples();
    if (!sharedState && !isViewer) saveState();
    if (isViewer) {
      setupViewer(screenParam);
      return;
    }
    await setupAdminAuth(setupAdmin);
  }

  boot();
})();
