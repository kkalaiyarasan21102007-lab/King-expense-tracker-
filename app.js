/*
  ============================================================
  King Expense Tracker — Application Logic
  Real cloud backend: Firebase Authentication + Cloud Firestore
  (both on Firebase's free "Spark" plan — no credit card needed)
  ============================================================
*/
import { firebaseConfig } from './firebase-config.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Stay logged in until explicit logout.
setPersistence(auth, browserLocalPersistence).catch(() => {});
// Let the app keep working (read-only on cached data) when briefly offline.
enableIndexedDbPersistence(db).catch(() => {});

/* ============================================================
   GLOBAL STATE
   ============================================================ */
const DEFAULT_CATEGORIES = ["Food","Fuel","Shopping","Rent","Bills","Travel","Medical","Education","Entertainment","Other"];
let currentUser = null;   // Firebase User
let expenses = [];        // live-synced list of tx docs {id, ...}
let categories = DEFAULT_CATEGORIES.slice();
let budgets = {};
let reminders = [];
let editingExpenseId = null;
let editingReminderId = null;
let reportRange = 'daily';
let pieChartInstance = null, barChartInstance = null, reportPieInstance = null;
let currentPage = 'dashboard';
let unsubExpenses = null, unsubSettings = null, unsubProfile = null;
let deferredInstallPrompt = null;
let profile = { displayName: '', photoBase64: '', language: 'en', currency: 'INR' };
let isOffline = !navigator.onLine;

function showToast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
function fmt(n) {
  n = Number(n) || 0;
  const symbol = CURRENCY_SYMBOLS[profile.currency] || '₹';
  const locale = profile.currency === 'INR' ? 'en-IN' : 'en-US';
  return symbol + n.toLocaleString(locale, { maximumFractionDigits: 2 });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.remove(); }
function setSync(state) {
  // state: 'online' | 'syncing' | 'offline'
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot) return;
  dot.className = 'sync-dot' + (state === 'online' ? ' online' : state === 'syncing' ? ' syncing' : '');
  label.textContent = state === 'online' ? 'Synced to cloud' : state === 'syncing' ? 'Saving…' : 'Offline — will sync';
}

/* ============================================================
   LANGUAGE (11.12) — English / Tamil
   ============================================================ */
const I18N = {
  en: {
    'nav.dashboard': 'Dashboard', 'nav.expenses': 'Expenses', 'nav.reports': 'Reports',
    'nav.budget': 'Budget Planner', 'nav.reminders': 'Reminders', 'nav.insights': 'Insights', 'nav.settings': 'Settings',
    'dash.totalIncome': 'Total Income', 'dash.totalExpense': 'Total Expenses', 'dash.balance': 'Current Balance',
    'dash.today': "Today's Expenses", 'dash.week': 'Weekly Expenses', 'dash.month': 'Monthly Expenses', 'dash.year': 'Yearly Expenses',
    'dash.categoryBreakdown': 'Category Breakdown', 'dash.last6months': 'Last 6 Months (Income vs Expense)',
    'expenses.allCategories': 'All Categories', 'expenses.allTypes': 'All Types', 'expenses.expense': 'Expense', 'expenses.income': 'Income',
    'expenses.addEntry': '+ Add Entry',
    'reports.daily': 'Daily', 'reports.weekly': 'Weekly', 'reports.monthly': 'Monthly', 'reports.yearly': 'Yearly', 'reports.custom': 'Custom',
    'reports.pdf': 'Download PDF', 'reports.excel': 'Download Excel (.xlsx)', 'reports.whatsapp': 'Share on WhatsApp',
    'settings.tab.profile': 'Profile', 'settings.tab.categories': 'Categories', 'settings.tab.data': 'Backup & Import',
    'settings.tab.language': 'Language & Currency', 'settings.tab.security': 'Security', 'settings.tab.appearance': 'Appearance',
    'settings.profile.title': 'Your Profile', 'settings.profile.changePhoto': 'Change Photo', 'settings.profile.displayName': 'Display Name', 'settings.profile.save': 'Save Profile',
    'settings.categories.title': 'Manage Expense Categories', 'settings.categories.add': 'Add Category',
    'settings.data.backupTitle': 'Backup Database', 'settings.data.backupBtn': 'Backup Now (Download + Save to Cloud)',
    'settings.data.restoreTitle': 'Restore Database', 'settings.data.restoreBtn': 'Choose Backup File',
    'settings.data.importTitle': 'Import Expenses (Excel / CSV)', 'settings.data.importBtn': 'Choose File to Import',
    'settings.language.title': 'Language', 'settings.currency.title': 'Currency',
    'settings.security.title': 'Change Password', 'settings.security.current': 'Current Password', 'settings.security.new': 'New Password', 'settings.security.update': 'Update Password',
    'settings.appearance.title': 'Appearance', 'settings.appearance.desc': 'Switch between Royal Dark and Royal Light themes.', 'settings.appearance.toggle': 'Toggle Dark / Light Mode'
  },
  ta: {
    'nav.dashboard': 'டாஷ்போர்டு', 'nav.expenses': 'செலவுகள்', 'nav.reports': 'அறிக்கைகள்',
    'nav.budget': 'பட்ஜெட் திட்டமிடல்', 'nav.reminders': 'நினைவூட்டல்கள்', 'nav.insights': 'நுண்ணறிவு', 'nav.settings': 'அமைப்புகள்',
    'dash.totalIncome': 'மொத்த வருமானம்', 'dash.totalExpense': 'மொத்த செலவுகள்', 'dash.balance': 'தற்போதைய இருப்பு',
    'dash.today': 'இன்றைய செலவுகள்', 'dash.week': 'வாராந்திர செலவுகள்', 'dash.month': 'மாதாந்திர செலவுகள்', 'dash.year': 'ஆண்டு செலவுகள்',
    'dash.categoryBreakdown': 'வகை பிரிவு', 'dash.last6months': 'கடந்த 6 மாதங்கள் (வருமானம் vs செலவு)',
    'expenses.allCategories': 'அனைத்து வகைகள்', 'expenses.allTypes': 'அனைத்து வகைகள்', 'expenses.expense': 'செலவு', 'expenses.income': 'வருமானம்',
    'expenses.addEntry': '+ புதிய பதிவு',
    'reports.daily': 'தினசரி', 'reports.weekly': 'வாராந்திர', 'reports.monthly': 'மாதாந்திர', 'reports.yearly': 'ஆண்டு', 'reports.custom': 'தனிப்பயன்',
    'reports.pdf': 'PDF பதிவிறக்கம்', 'reports.excel': 'Excel பதிவிறக்கம் (.xlsx)', 'reports.whatsapp': 'WhatsApp-ல் பகிரவும்',
    'settings.tab.profile': 'சுயவிவரம்', 'settings.tab.categories': 'வகைகள்', 'settings.tab.data': 'காப்பு மற்றும் இறக்குமதி',
    'settings.tab.language': 'மொழி & நாணயம்', 'settings.tab.security': 'பாதுகாப்பு', 'settings.tab.appearance': 'தோற்றம்',
    'settings.profile.title': 'உங்கள் சுயவிவரம்', 'settings.profile.changePhoto': 'புகைப்படத்தை மாற்று', 'settings.profile.displayName': 'காட்சிப் பெயர்', 'settings.profile.save': 'சுயவிவரத்தை சேமி',
    'settings.categories.title': 'செலவு வகைகளை நிர்வகி', 'settings.categories.add': 'வகையைச் சேர்',
    'settings.data.backupTitle': 'தரவுத்தளத்தை காப்புப் பிரதி எடு', 'settings.data.backupBtn': 'இப்போது காப்புப் பிரதி (பதிவிறக்கம் + மேகக்கணிக்கு சேமி)',
    'settings.data.restoreTitle': 'தரவுத்தளத்தை மீட்டமை', 'settings.data.restoreBtn': 'காப்புப் பிரதி கோப்பைத் தேர்வுசெய்',
    'settings.data.importTitle': 'செலவுகளை இறக்குமதி செய் (Excel / CSV)', 'settings.data.importBtn': 'இறக்குமதி செய்ய கோப்பைத் தேர்வுசெய்',
    'settings.language.title': 'மொழி', 'settings.currency.title': 'நாணயம்',
    'settings.security.title': 'கடவுச்சொல்லை மாற்று', 'settings.security.current': 'தற்போதைய கடவுச்சொல்', 'settings.security.new': 'புதிய கடவுச்சொல்', 'settings.security.update': 'கடவுச்சொல்லை புதுப்பி',
    'settings.appearance.title': 'தோற்றம்', 'settings.appearance.desc': 'ராயல் டார்க் மற்றும் ராயல் லைட் தீம்களுக்கு இடையே மாறவும்.', 'settings.appearance.toggle': 'இருள் / ஒளி பயன்முறையை மாற்று'
  }
};
function applyTranslations() {
  const dict = I18N[profile.language] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  const titleKey = { dashboard: 'nav.dashboard', expenses: 'nav.expenses', reports: 'nav.reports', budget: 'nav.budget', reminders: 'nav.reminders', insights: 'nav.insights', settings: 'nav.settings' }[currentPage];
  if (titleKey && dict[titleKey]) document.getElementById('page-title').textContent = dict[titleKey];
}
window.setLanguage = async function (lang) {
  profile.language = lang;
  applyTranslations();
  await persistProfile();
};
window.setCurrency = async function (cur) {
  profile.currency = cur;
  await persistProfile();
  renderCurrentPage();
};

/* ============================================================
   AUTH
   ============================================================ */
function authMsg(text, type) {
  document.getElementById('auth-msg').innerHTML = `<div class="auth-${type}">${text}</div>`;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles entering the app.
  } catch (err) {
    authMsg(friendlyAuthError(err), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Log In';
  }
});

document.getElementById('forgot-password-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { authMsg('Enter your admin email above first, then tap "Forgot Password?" again.', 'error'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    authMsg('Password reset email sent. Check your inbox.', 'success');
  } catch (err) {
    authMsg(friendlyAuthError(err), 'error');
  }
});

function friendlyAuthError(err) {
  const code = err && err.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Incorrect email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a moment and try again.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  return 'Something went wrong. Please try again.';
}

window.logout = async function () {
  if (unsubExpenses) unsubExpenses();
  if (unsubSettings) unsubSettings();
  if (unsubProfile) unsubProfile();
  await signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    enterApp(user);
  } else {
    currentUser = null;
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('login-form').reset();
  }
});

/* ============================================================
   APP BOOT + REAL-TIME FIRESTORE SYNC
   ============================================================ */
function userDoc(...segments) { return doc(db, 'users', currentUser.uid, ...segments); }
function expensesCol() { return collection(db, 'users', currentUser.uid, 'expenses'); }

async function enterApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('sidebar-name').textContent = 'Admin';
  document.getElementById('sidebar-email').textContent = user.email;
  document.getElementById('sidebar-avatar').textContent = (user.email || 'K').charAt(0).toUpperCase();

  setSync('syncing');

  // Real-time expenses — auto-saves reflect instantly on every device signed in.
  unsubExpenses = onSnapshot(expensesCol(), (snap) => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSync('online');
    renderCurrentPage();
  }, () => setSync('offline'));

  // Real-time settings doc (categories / budgets / reminders).
  unsubSettings = onSnapshot(userDoc('meta', 'settings'), async (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      categories = data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES.slice();
      budgets = data.budgets || {};
      reminders = data.reminders || [];
    } else {
      // First login ever — seed default categories once.
      categories = DEFAULT_CATEGORIES.slice();
      budgets = {};
      reminders = [];
      await setDoc(userDoc('meta', 'settings'), { categories, budgets, reminders }, { merge: true });
    }
    populateCategoryDropdowns();
    renderCurrentPage();
  }, () => setSync('offline'));

  // Real-time profile doc (11.13 — display name, photo thumbnail, language, currency).
  unsubProfile = onSnapshot(userDoc('meta', 'profile'), async (snap) => {
    if (snap.exists()) {
      profile = { displayName: '', photoBase64: '', language: 'en', currency: 'INR', ...snap.data() };
    } else {
      profile = { displayName: '', photoBase64: '', language: 'en', currency: 'INR' };
      await setDoc(userDoc('meta', 'profile'), profile, { merge: true });
    }
    applyProfileToUI();
    renderCurrentPage();
  }, () => setSync('offline'));

  goPage('dashboard');
  setupInstallPrompt();
}

function applyProfileToUI() {
  const initial = (profile.displayName || currentUser.email || 'K').charAt(0).toUpperCase();
  document.getElementById('sidebar-name').textContent = profile.displayName || 'Admin';
  document.getElementById('sidebar-email').textContent = currentUser.email;
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const profilePreview = document.getElementById('profile-photo-preview');
  if (profile.photoBase64) {
    sidebarAvatar.style.backgroundImage = `url(${profile.photoBase64})`;
    sidebarAvatar.style.backgroundSize = 'cover';
    sidebarAvatar.style.backgroundPosition = 'center';
    sidebarAvatar.textContent = '';
    if (profilePreview) { profilePreview.style.backgroundImage = `url(${profile.photoBase64})`; profilePreview.textContent = ''; }
  } else {
    sidebarAvatar.style.backgroundImage = '';
    sidebarAvatar.textContent = initial;
    if (profilePreview) { profilePreview.style.backgroundImage = ''; profilePreview.textContent = initial; }
  }
  const nameInput = document.getElementById('profile-name');
  if (nameInput) nameInput.value = profile.displayName || '';
  const emailInput = document.getElementById('profile-email');
  if (emailInput) emailInput.value = currentUser.email;
  const langSel = document.getElementById('lang-select');
  if (langSel) langSel.value = profile.language || 'en';
  const curSel = document.getElementById('currency-select');
  if (curSel) curSel.value = profile.currency || 'INR';
  applyTranslations();
}

async function persistProfile() {
  setSync('syncing');
  await setDoc(userDoc('meta', 'profile'), profile, { merge: true });
}

async function persistSettings() {
  setSync('syncing');
  await setDoc(userDoc('meta', 'settings'), { categories, budgets, reminders }, { merge: true });
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGE_TITLES = { dashboard: 'Dashboard', expenses: 'Expenses', reports: 'Reports', budget: 'Budget Planner', reminders: 'Reminders', insights: 'Insights', settings: 'Settings' };
window.goPage = function (page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + page).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('page-title').textContent = PAGE_TITLES[page];
  document.getElementById('sidebar').classList.remove('open');
  applyTranslations();
  renderCurrentPage();
};
function renderCurrentPage() {
  if (!currentUser) return;
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'expenses') renderExpensesTable();
  if (currentPage === 'reports') renderReport();
  if (currentPage === 'budget') renderBudgetPage();
  if (currentPage === 'reminders') renderReminders();
  if (currentPage === 'insights') renderInsights();
  if (currentPage === 'settings') { renderSettingsCategories(); renderBackupList(); }
}
window.toggleSidebar = function () { document.getElementById('sidebar').classList.toggle('open'); };
window.toggleTheme = function () {
  const body = document.body;
  const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', next);
};

/* ============================================================
   CATEGORY DROPDOWNS / MANAGEMENT (Settings page)
   ============================================================ */
function populateCategoryDropdowns() {
  const filterSel = document.getElementById('exp-filter-category');
  filterSel.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
}
function renderSettingsCategories() {
  document.getElementById('settings-categories-list').innerHTML = categories.map(c => `
    <span class="tag-chip">${c}
      ${DEFAULT_CATEGORIES.includes(c) ? '' : `<button onclick="removeCategory('${c}')" title="Remove">×</button>`}
    </span>
  `).join('');
}
window.addCategory = async function () {
  const input = document.getElementById('settings-new-category');
  const name = input.value.trim();
  if (!name) return;
  if (categories.includes(name)) { showToast('Category already exists'); return; }
  categories.push(name);
  await persistSettings();
  input.value = '';
  showToast('Category added');
};
window.removeCategory = async function (name) {
  categories = categories.filter(c => c !== name);
  await persistSettings();
  showToast('Category removed');
};

/* ============================================================
   EXPENSE / INCOME CRUD  (each entry = one Firestore document)
   ============================================================ */
window.openExpenseModal = function (id) {
  editingExpenseId = id || null;
  const tx = id ? expenses.find(x => x.id === id) : null;
  const catOptions = categories.map(c => `<option value="${c}" ${tx && tx.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const modal = `
  <div class="modal-overlay" id="exp-overlay">
    <div class="modal">
      <h3>${id ? 'Edit Entry' : 'Add Entry'}</h3>
      <form id="expense-form">
        <div class="field">
          <label>Type</label>
          <select id="f-type">
            <option value="expense" ${(!tx || tx.type === 'expense') ? 'selected' : ''}>Expense</option>
            <option value="income" ${tx && tx.type === 'income' ? 'selected' : ''}>Income</option>
          </select>
        </div>
        <div class="grid grid-2" style="gap:12px;">
          <div class="field"><label>Date</label><input type="date" id="f-date" value="${tx ? tx.date : todayStr()}" required></div>
          <div class="field"><label>Time</label><input type="time" id="f-time" value="${tx ? tx.time : new Date().toTimeString().slice(0, 5)}" required></div>
        </div>
        <div class="field"><label>Category</label><select id="f-category">${catOptions}</select></div>
        <div class="field"><label>Amount (₹)</label><input type="number" id="f-amount" step="0.01" min="0" value="${tx ? tx.amount : ''}" required></div>
        <div class="field">
          <label>Payment Method</label>
          <select id="f-method">
            ${['Cash', 'Card', 'UPI', 'Net Banking', 'Wallet', 'Other'].map(m => `<option ${tx && tx.method === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Notes</label><textarea id="f-desc" rows="2" placeholder="Optional note">${tx ? tx.description || '' : ''}</textarea></div>
        <div class="modal-close-row">
          <button type="button" class="btn btn-ghost" onclick="closeModal('exp-overlay')">Cancel</button>
          <button type="submit" class="btn btn-gold" style="width:auto;">${id ? 'Save Changes' : 'Add Entry'}</button>
        </div>
      </form>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = modal;
  document.getElementById('expense-form').addEventListener('submit', saveExpense);
};

async function saveExpense(e) {
  e.preventDefault();
  const data = {
    type: document.getElementById('f-type').value,
    date: document.getElementById('f-date').value,
    time: document.getElementById('f-time').value,
    category: document.getElementById('f-category').value,
    amount: parseFloat(document.getElementById('f-amount').value) || 0,
    method: document.getElementById('f-method').value,
    description: document.getElementById('f-desc').value.trim(),
    updatedAt: serverTimestamp()
  };
  setSync('syncing');
  try {
    if (editingExpenseId) {
      await updateDoc(doc(expensesCol(), editingExpenseId), data);
      showToast('Entry updated');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(expensesCol(), data);
      showToast('Entry added');
    }
  } catch (err) {
    showToast('Could not save — check your connection');
  }
  closeModal('exp-overlay');
}
window.closeModal = closeModal;

window.deleteExpense = function (id) {
  const modal = `
  <div class="modal-overlay" id="del-overlay">
    <div class="modal">
      <h3>Delete Entry</h3>
      <p style="color:var(--text-dim);">Are you sure you want to delete this entry? This cannot be undone.</p>
      <div class="modal-close-row">
        <button class="btn btn-ghost" onclick="closeModal('del-overlay')">Cancel</button>
        <button class="btn btn-danger" style="width:auto;" onclick="confirmDeleteExpense('${id}')">Delete</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = modal;
};
window.confirmDeleteExpense = async function (id) {
  setSync('syncing');
  await deleteDoc(doc(expensesCol(), id));
  closeModal('del-overlay');
  showToast('Entry deleted');
};

window.renderExpensesTable = function () {
  const search = (document.getElementById('exp-search').value || '').toLowerCase();
  const filterCat = document.getElementById('exp-filter-category').value;
  const filterType = document.getElementById('exp-filter-type').value;

  let list = expenses.filter(x => {
    if (filterCat && x.category !== filterCat) return false;
    if (filterType && x.type !== filterType) return false;
    if (search) {
      const hay = [x.description, x.category, x.method].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  const tbody = document.getElementById('expenses-tbody');
  document.getElementById('expenses-empty').classList.toggle('hidden', list.length > 0);

  tbody.innerHTML = list.map(x => `
    <tr>
      <td>${x.date}</td>
      <td>${x.time}</td>
      <td><span class="tag">${x.category}</span></td>
      <td>${x.type === 'income' ? 'Income' : 'Expense'}</td>
      <td class="${x.type === 'expense' ? 'amount-neg' : ''}" style="${x.type === 'income' ? 'color:#7FCB9A;font-weight:600;' : ''}">${x.type === 'expense' ? '-' : '+'}${fmt(x.amount)}</td>
      <td>${x.method}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${x.description || '-'}</td>
      <td>
        <div class="row-actions">
          <button onclick="openExpenseModal('${x.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button onclick="deleteExpense('${x.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
};

/* ============================================================
   DATE HELPERS FOR STATS / REPORTS
   ============================================================ */
function startOfWeek(d) { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); return new Date(dt.setDate(diff)); }
function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }
function sumByType(list, type) { return list.filter(x => x.type === type).reduce((s, x) => s + x.amount, 0); }

function computeStats() {
  const now = new Date();
  const todayS = todayStr();
  const weekStart = startOfWeek(now).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const totalIncome = sumByType(expenses, 'income');
  const totalExpense = sumByType(expenses, 'expense');
  const balance = totalIncome - totalExpense;

  const todayList = expenses.filter(x => x.date === todayS);
  const weekList = expenses.filter(x => inRange(x.date, weekStart, todayS));
  const monthList = expenses.filter(x => inRange(x.date, monthStart, todayS));
  const yearList = expenses.filter(x => inRange(x.date, yearStart, todayS));

  return {
    totalIncome, totalExpense, balance,
    todayExpense: sumByType(todayList, 'expense'), todayCount: todayList.length,
    weekExpense: sumByType(weekList, 'expense'),
    monthExpense: sumByType(monthList, 'expense'),
    yearExpense: sumByType(yearList, 'expense')
  };
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const s = computeStats();
  document.getElementById('stat-income').textContent = fmt(s.totalIncome);
  document.getElementById('stat-expense').textContent = fmt(s.totalExpense);
  document.getElementById('stat-balance').textContent = fmt(s.balance);
  document.getElementById('stat-today').textContent = fmt(s.todayExpense);
  document.getElementById('stat-today-count').textContent = s.todayCount + ' transaction' + (s.todayCount !== 1 ? 's' : '');
  document.getElementById('stat-week').textContent = fmt(s.weekExpense);
  document.getElementById('stat-month').textContent = fmt(s.monthExpense);
  document.getElementById('stat-year').textContent = fmt(s.yearExpense);

  renderPieChart();
  renderBarChart();
}

function categoryTotals(list) {
  const map = {};
  list.filter(x => x.type === 'expense').forEach(x => { map[x.category] = (map[x.category] || 0) + x.amount; });
  return map;
}

const CHART_COLORS = ['#D4AF37', '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#8A8A8A', '#3ED17F'];

function renderPieChart() {
  const map = categoryTotals(expenses);
  const labels = Object.keys(map);
  const data = Object.values(map);
  if (pieChartInstance) pieChartInstance.destroy();
  const ctx = document.getElementById('pieChart');
  if (labels.length === 0) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }
  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderColor: '#121212', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#A9A69B', boxWidth: 10, padding: 12, font: { size: 11 } } } } }
  });
}

function renderBarChart() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString('default', { month: 'short' }), key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') });
  }
  const incomeData = months.map(m => expenses.filter(x => x.type === 'income' && x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0));
  const expenseData = months.map(m => expenses.filter(x => x.type === 'expense' && x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0));

  if (barChartInstance) barChartInstance.destroy();
  barChartInstance = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: months.map(m => m.label), datasets: [
        { label: 'Income', data: incomeData, backgroundColor: '#1baf7a', borderRadius: 4 },
        { label: 'Expense', data: expenseData, backgroundColor: '#D4AF37', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { color: '#A9A69B', boxWidth: 10, font: { size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#8A8A8A' } }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8A8A8A' } } }
    }
  });
}

/* ============================================================
   REPORTS
   ============================================================ */
function getReportBounds() {
  const now = new Date();
  const todayS = todayStr();
  if (reportRange === 'daily') return { start: todayS, end: todayS };
  if (reportRange === 'weekly') return { start: startOfWeek(now).toISOString().slice(0, 10), end: todayS };
  if (reportRange === 'monthly') return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: todayS };
  if (reportRange === 'yearly') return { start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), end: todayS };
  const s = document.getElementById('custom-start').value || todayS;
  const en = document.getElementById('custom-end').value || todayS;
  return { start: s, end: en };
}

window.setReportRange = function (r) {
  reportRange = r;
  document.querySelectorAll('#report-tabs button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  document.getElementById('custom-range-row').classList.toggle('hidden', r !== 'custom');
  if (r !== 'custom') renderReport();
};

function currentReportData() {
  const { start, end } = getReportBounds();
  const list = expenses.filter(x => inRange(x.date, start, end));
  const income = sumByType(list, 'income');
  const expense = sumByType(list, 'expense');
  const catMap = categoryTotals(list);
  return { start, end, list, income, expense, balance: income - expense, catMap };
}

window.renderReport = function () {
  const r = currentReportData();
  document.getElementById('rep-income').textContent = fmt(r.income);
  document.getElementById('rep-expense').textContent = fmt(r.expense);
  document.getElementById('rep-balance').textContent = fmt(r.balance);

  const tbody = document.getElementById('rep-category-tbody');
  const total = Object.values(r.catMap).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(r.catMap).sort((a, b) => b[1] - a[1]);
  tbody.innerHTML = rows.length ? rows.map(([cat, amt]) => `
    <tr><td><span class="tag">${cat}</span></td><td>${fmt(amt)}</td><td>${((amt / total) * 100).toFixed(1)}%</td></tr>
  `).join('') : '<tr><td colspan="3" style="color:var(--text-dim);">No expenses in this period.</td></tr>';

  const labels = Object.keys(r.catMap);
  const data = Object.values(r.catMap);
  if (reportPieInstance) reportPieInstance.destroy();
  const ctx = document.getElementById('reportPieChart');
  if (labels.length) {
    reportPieInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderColor: '#121212', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#A9A69B', boxWidth: 10, font: { size: 11 } } } } }
    });
  } else {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
  }
};

/* ---- Export: PDF (via jsPDF) ---- */
window.exportPDF = function () {
  const r = currentReportData();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFillColor(18, 18, 18); pdf.rect(0, 0, 210, 28, 'F');
  pdf.setTextColor(212, 175, 55); pdf.setFontSize(18);
  pdf.text('King Expense Tracker', 14, 14);
  pdf.setFontSize(10); pdf.setTextColor(230, 230, 230);
  pdf.text(`Report: ${r.start} to ${r.end}`, 14, 22);

  pdf.setTextColor(20, 20, 20); pdf.setFontSize(12);
  let y = 40;
  pdf.text(`Total Income: Rs. ${r.income.toLocaleString('en-IN')}`, 14, y); y += 8;
  pdf.text(`Total Expenses: Rs. ${r.expense.toLocaleString('en-IN')}`, 14, y); y += 8;
  pdf.text(`Remaining Balance: Rs. ${r.balance.toLocaleString('en-IN')}`, 14, y); y += 12;

  pdf.setFontSize(13); pdf.setTextColor(180, 148, 31); pdf.text('Category-wise Summary', 14, y); y += 8;
  pdf.setFontSize(10.5); pdf.setTextColor(30, 30, 30);
  Object.entries(r.catMap).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
    pdf.text(cat, 14, y); pdf.text('Rs. ' + amt.toLocaleString('en-IN'), 100, y); y += 7;
    if (y > 270) { pdf.addPage(); y = 20; }
  });

  y += 6;
  pdf.setFontSize(13); pdf.setTextColor(180, 148, 31); pdf.text('Transactions', 14, y); y += 8;
  pdf.setFontSize(9); pdf.setTextColor(30, 30, 30);
  r.list.forEach(x => {
    const line = `${x.date} ${x.time}  |  ${x.category}  |  ${x.type}  |  Rs. ${x.amount}  |  ${x.method}`;
    pdf.text(line, 14, y); y += 6;
    if (y > 280) { pdf.addPage(); y = 20; }
  });

  pdf.save(`King-Expense-Report-${r.start}_to_${r.end}.pdf`);
  showToast('PDF downloaded');
};

/* ---- Export: Excel via SheetJS ---- */
window.exportExcel = function () {
  const r = currentReportData();
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['King Expense Tracker - Report'],
    ['Period', r.start + ' to ' + r.end],
    [],
    ['Total Income', r.income],
    ['Total Expenses', r.expense],
    ['Remaining Balance', r.balance],
    [],
    ['Category', 'Amount']
  ].concat(Object.entries(r.catMap).sort((a, b) => b[1] - a[1])));

  const txSheet = XLSX.utils.json_to_sheet(r.list.map(x => ({
    Date: x.date, Time: x.time, Type: x.type, Category: x.category, Amount: x.amount, Method: x.method, Notes: x.description
  })));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, txSheet, 'Transactions');
  XLSX.writeFile(wb, `King-Expense-Report-${r.start}_to_${r.end}.xlsx`);
  showToast('Excel file downloaded');
};

/* ---- WhatsApp Share ---- */
window.shareWhatsApp = function () {
  const r = currentReportData();
  let text = `*King Expense Tracker Report*\n${r.start} to ${r.end}\n\n`;
  text += `Total Income: ₹${r.income.toLocaleString('en-IN')}\n`;
  text += `Total Expenses: ₹${r.expense.toLocaleString('en-IN')}\n`;
  text += `Balance: ₹${r.balance.toLocaleString('en-IN')}\n\n`;
  text += `Top Categories:\n`;
  Object.entries(r.catMap).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([cat, amt]) => {
    text += `- ${cat}: ₹${amt.toLocaleString('en-IN')}\n`;
  });
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
  showToast('Opening WhatsApp — download the PDF/Excel above first to attach the full file');
};

/* ============================================================
   BUDGET PLANNER
   ============================================================ */
window.renderBudgetPage = function () {
  const grid = document.getElementById('budget-form-grid');
  grid.innerHTML = categories.map(c => `
    <div class="field">
      <label>${c}</label>
      <input type="number" min="0" step="1" data-cat="${c}" class="budget-input" value="${budgets[c] || ''}" placeholder="0">
    </div>
  `).join('');
  renderBudgetProgress();
};
window.saveBudgets = async function () {
  document.querySelectorAll('.budget-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (val > 0) budgets[inp.dataset.cat] = val; else delete budgets[inp.dataset.cat];
  });
  await persistSettings();
  showToast('Budgets saved');
  renderBudgetProgress();
};
function renderBudgetProgress() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthList = expenses.filter(x => x.type === 'expense' && x.date >= monthStart);
  const spent = categoryTotals(monthList);
  const list = document.getElementById('budget-progress-list');
  const entries = Object.entries(budgets);
  if (!entries.length) { list.innerHTML = '<div style="color:var(--text-dim);">No budgets set yet. Add limits above to track your spending.</div>'; return; }
  list.innerHTML = entries.map(([cat, limit]) => {
    const used = spent[cat] || 0;
    const pct = Math.min(100, (used / limit) * 100);
    const over = used > limit;
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
        <span>${cat}</span><span style="color:${over ? '#E0796F' : 'var(--text-dim)'}">${fmt(used)} / ${fmt(limit)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%;"></div></div>
    </div>`;
  }).join('');
}

/* ============================================================
   REMINDERS
   ============================================================ */
window.openReminderModal = function (id) {
  editingReminderId = id || null;
  const rem = id ? reminders.find(r => r.id === id) : null;
  const modal = `
  <div class="modal-overlay" id="rem-overlay">
    <div class="modal">
      <h3>${id ? 'Edit Reminder' : 'New Reminder'}</h3>
      <form id="reminder-form">
        <div class="field"><label>Title</label><input type="text" id="r-title" value="${rem ? rem.title : ''}" placeholder="e.g. Electricity Bill" required></div>
        <div class="field"><label>Due Date</label><input type="date" id="r-date" value="${rem ? rem.date : todayStr()}" required></div>
        <div class="field"><label>Amount (₹, optional)</label><input type="number" id="r-amount" min="0" value="${rem ? rem.amount || '' : ''}"></div>
        <div class="modal-close-row">
          <button type="button" class="btn btn-ghost" onclick="closeModal('rem-overlay')">Cancel</button>
          <button type="submit" class="btn btn-gold" style="width:auto;">Save</button>
        </div>
      </form>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = modal;
  document.getElementById('reminder-form').addEventListener('submit', saveReminder);
};
async function saveReminder(e) {
  e.preventDefault();
  const data = { title: document.getElementById('r-title').value.trim(), date: document.getElementById('r-date').value, amount: parseFloat(document.getElementById('r-amount').value) || 0 };
  if (editingReminderId) {
    const idx = reminders.findIndex(r => r.id === editingReminderId);
    reminders[idx] = { ...reminders[idx], ...data };
  } else {
    data.id = 'rem_' + Date.now();
    reminders.push(data);
  }
  await persistSettings();
  closeModal('rem-overlay');
  showToast('Reminder saved');
}
window.deleteReminder = async function (id) {
  reminders = reminders.filter(r => r.id !== id);
  await persistSettings();
};
window.renderReminders = function () {
  const list = reminders.slice().sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('reminders-empty').classList.toggle('hidden', list.length > 0);
  const todayS = todayStr();
  document.getElementById('reminders-list').innerHTML = list.map(r => {
    const overdue = r.date < todayS;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-weight:600;font-size:14px;">${r.title}</div>
        <div style="font-size:12px;color:${overdue ? '#E0796F' : 'var(--text-dim)'};">${overdue ? 'Overdue - ' : ''}Due ${r.date}${r.amount ? ' · ' + fmt(r.amount) : ''}</div>
      </div>
      <div class="row-actions">
        <button onclick="openReminderModal('${r.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
        <button onclick="deleteReminder('${r.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg></button>
      </div>
    </div>`;
  }).join('');
};

/* ============================================================
   SETTINGS — CHANGE PASSWORD (real Firebase Auth reauth + update)
   ============================================================ */
document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cur = document.getElementById('cp-current').value;
  const next = document.getElementById('cp-new').value;
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, cur);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, next);
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    showToast('Password updated');
  } catch (err) {
    showToast('Current password is incorrect');
  }
});

/* ============================================================
   SETTINGS TABS
   ============================================================ */
window.setSettingsTab = function (tab) {
  document.querySelectorAll('#settings-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('settings-panel-' + tab).classList.remove('hidden');
  if (tab === 'data') renderBackupList();
};

/* ============================================================
   PROFILE (11.13) — display name + small photo thumbnail
   (stored as a compressed base64 string directly in Firestore,
   so no paid Firebase Storage / billing account is required)
   ============================================================ */
window.saveProfile = async function () {
  profile.displayName = document.getElementById('profile-name').value.trim();
  await persistProfile();
  applyProfileToUI();
  showToast('Profile saved');
};

document.getElementById('profile-photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file, 160, 0.75);
    profile.photoBase64 = dataUrl;
    await persistProfile();
    applyProfileToUI();
    showToast('Photo updated');
  } catch (err) {
    showToast('Could not process that image');
  }
  e.target.value = '';
});

function resizeImageToDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
      else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   BACKUP / RESTORE / IMPORT  (11.8, 11.9)
   ============================================================ */
function buildBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    app: 'King Expense Tracker',
    expenses: expenses.map(({ id, ...rest }) => rest),
    categories, budgets, reminders,
    profile: { displayName: profile.displayName, language: profile.language, currency: profile.currency }
  };
}

window.backupNow = async function () {
  const payload = buildBackupPayload();
  // 1) Download as a JSON file the admin keeps themselves.
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `King-Expense-Backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);

  // 2) Also keep a timestamped copy inside Firestore itself (cloud redundancy).
  setSync('syncing');
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'backups'), { ...payload, createdAt: serverTimestamp() });
    showToast('Backup downloaded and saved to cloud');
  } catch (err) {
    showToast('Backup downloaded (cloud copy failed — check connection)');
  }
  renderBackupList();
};

async function renderBackupList() {
  const container = document.getElementById('backup-list');
  if (!container || !currentUser) return;
  try {
    const q = query(collection(db, 'users', currentUser.uid, 'backups'), orderBy('createdAt', 'desc'), limit(5));
    const snap = await getDocs(q);
    if (snap.empty) { container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">No cloud backups yet.</div>'; return; }
    container.innerHTML = '<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px;">Recent cloud backups:</div>' + snap.docs.map(d => {
      const data = d.data();
      const when = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : (data.exportedAt || '');
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${when} · ${(data.expenses || []).length} entries</span>
        <button class="btn btn-outline btn-sm" style="width:auto;" onclick="restoreFromCloudBackup('${d.id}')">Restore</button>
      </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">Could not load backups.</div>';
  }
}

window.restoreFromCloudBackup = function (backupId) {
  confirmRestore(async () => {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'backups', backupId));
    if (snap.exists()) await applyRestoredData(snap.data());
  });
};

document.getElementById('restore-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      confirmRestore(() => applyRestoredData(data));
    } catch (err) {
      showToast('That file is not a valid backup JSON');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function confirmRestore(onConfirm) {
  const modal = `
  <div class="modal-overlay" id="restore-overlay">
    <div class="modal">
      <h3>Restore Database</h3>
      <p style="color:var(--text-dim);">This will replace all current expenses, categories, budgets and reminders with the contents of this backup. This cannot be undone. Continue?</p>
      <div class="modal-close-row">
        <button class="btn btn-ghost" onclick="closeModal('restore-overlay')">Cancel</button>
        <button class="btn btn-danger" style="width:auto;" id="restore-confirm-btn">Restore</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = modal;
  document.getElementById('restore-confirm-btn').addEventListener('click', async () => {
    closeModal('restore-overlay');
    setSync('syncing');
    await onConfirm();
    showToast('Database restored');
  });
}

async function applyRestoredData(data) {
  const batch = writeBatch(db);
  // Remove existing expense docs first.
  const existing = await getDocs(expensesCol());
  existing.forEach(d => batch.delete(d.ref));
  // Add back the restored ones.
  (data.expenses || []).forEach(x => {
    const ref = doc(expensesCol());
    batch.set(ref, x);
  });
  await batch.commit();
  await setDoc(userDoc('meta', 'settings'), {
    categories: data.categories || DEFAULT_CATEGORIES,
    budgets: data.budgets || {},
    reminders: data.reminders || []
  });
  if (data.profile) await setDoc(userDoc('meta', 'profile'), data.profile, { merge: true });
}

/* ---- Import Expenses from Excel / CSV (11.8) ---- */
document.getElementById('import-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const wb = XLSX.read(reader.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      await importRows(rows);
    } catch (err) {
      showToast('Could not read that file — check the column headers');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

async function importRows(rows) {
  if (!rows.length) { showToast('No rows found in that file'); return; }
  const batch = writeBatch(db);
  let count = 0;
  rows.forEach(row => {
    const date = String(row.Date || row.date || '').slice(0, 10) || todayStr();
    const amount = parseFloat(row.Amount || row.amount) || 0;
    if (!amount) return;
    const entry = {
      date,
      time: String(row.Time || row.time || '00:00'),
      type: (String(row.Type || row.type || 'expense').toLowerCase() === 'income') ? 'income' : 'expense',
      category: String(row.Category || row.category || 'Other'),
      amount,
      method: String(row.Method || row.method || 'Cash'),
      description: String(row.Notes || row.notes || row.Description || ''),
      createdAt: serverTimestamp()
    };
    batch.set(doc(expensesCol()), entry);
    count++;
  });
  setSync('syncing');
  await batch.commit();
  showToast(`Imported ${count} entries`);
}

/* ============================================================
   AI FINANCIAL INSIGHTS (11.11) — rule-based, on-device, free
   ============================================================ */
function renderInsights() {
  const grid = document.getElementById('insights-grid');
  if (!grid) return;
  const now = new Date();
  const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0');

  const thisMonthExpenses = expenses.filter(x => x.type === 'expense' && x.date.startsWith(thisMonthKey));
  const lastMonthExpenses = expenses.filter(x => x.type === 'expense' && x.date.startsWith(lastMonthKey));
  const thisTotal = thisMonthExpenses.reduce((s, x) => s + x.amount, 0);
  const lastTotal = lastMonthExpenses.reduce((s, x) => s + x.amount, 0);

  const cards = [];

  // Trend
  if (lastTotal > 0) {
    const pct = (((thisTotal - lastTotal) / lastTotal) * 100).toFixed(1);
    const up = thisTotal > lastTotal;
    cards.push(card('Monthly Trend', `Spending is ${up ? 'up' : 'down'} ${Math.abs(pct)}% vs last month (${fmt(lastTotal)} → ${fmt(thisTotal)}).`, up ? '#E0796F' : '#7FCB9A'));
  } else if (thisTotal > 0) {
    cards.push(card('Monthly Trend', `You've spent ${fmt(thisTotal)} so far this month — no data from last month to compare yet.`, 'var(--gold)'));
  }

  // Top category
  const catMap = categoryTotals(thisMonthExpenses);
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat) cards.push(card('Highest Spending Category', `${topCat[0]} leads this month at ${fmt(topCat[1])}, ${((topCat[1] / (thisTotal || 1)) * 100).toFixed(0)}% of total spending.`, 'var(--gold)'));

  // Budget suggestions — categories with real spend but no budget set
  const noBudget = Object.entries(catMap).filter(([cat, amt]) => !budgets[cat] && amt > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (noBudget.length) cards.push(card('Budget Suggestion', `Consider setting a budget for ${noBudget.map(c => c[0]).join(', ')} — you're spending in ${noBudget.length > 1 ? 'these categories' : 'this category'} without a limit.`, 'var(--gold)'));

  // Overspending alerts
  const overspent = Object.entries(budgets).filter(([cat, limitAmt]) => (catMap[cat] || 0) > limitAmt);
  if (overspent.length) {
    cards.push(card('Overspending Alert', overspent.map(([cat, limitAmt]) => `${cat} is over budget (${fmt(catMap[cat])} of ${fmt(limitAmt)}).`).join(' '), '#E0796F'));
  } else if (Object.keys(budgets).length) {
    cards.push(card('Budget Status', 'All your budgeted categories are within limits this month. Well managed.', '#7FCB9A'));
  }

  // Savings rate
  const thisMonthIncome = expenses.filter(x => x.type === 'income' && x.date.startsWith(thisMonthKey)).reduce((s, x) => s + x.amount, 0);
  if (thisMonthIncome > 0) {
    const savingsRate = (((thisMonthIncome - thisTotal) / thisMonthIncome) * 100).toFixed(1);
    const msg = savingsRate >= 20 ? `Strong savings rate of ${savingsRate}% this month — keep it up.`
      : savingsRate >= 0 ? `You're saving ${savingsRate}% of income this month. Aiming for 20%+ is a healthy target.`
      : `You're spending more than you're earning this month (${Math.abs(savingsRate)}% over income).`;
    cards.push(card('Savings Rate', msg, savingsRate >= 20 ? '#7FCB9A' : savingsRate >= 0 ? 'var(--gold)' : '#E0796F'));
  }

  grid.innerHTML = cards.length ? cards.join('') : `<div class="card"><div class="empty-state" style="padding:30px;">Add a few expenses to see insights here.</div></div>`;
}
function card(title, text, color) {
  return `<div class="card"><h3 class="section-title" style="color:${color};">${title}</h3><p style="color:var(--text);font-size:14px;line-height:1.5;margin:0;">${text}</p></div>`;
}

/* ============================================================
   OFFLINE MODE (11.10) — Firestore's own IndexedDB cache keeps
   reads/writes working offline; this just reflects real status.
   ============================================================ */
window.addEventListener('online', () => { isOffline = false; if (currentUser) setSync('online'); });
window.addEventListener('offline', () => { isOffline = true; setSync('offline'); });

/* ============================================================
   PWA — INSTALL PROMPT + SERVICE WORKER
   ============================================================ */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.remove('hidden');
});
function setupInstallPrompt() {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.classList.add('hidden');
  });
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
