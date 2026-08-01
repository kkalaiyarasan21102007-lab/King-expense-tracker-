# 👑 King Expense Tracker

A royal gold/black/white premium personal expense &amp; income manager — single-admin login, real-time
cloud sync, budgets, reminders, reports, PDF/Excel export, WhatsApp sharing, English/Tamil UI, and
installable as a Progressive Web App. Built entirely on **free-tier services**.

---

## Tech stack (all free)

| Layer          | Technology                                   |
|-----------------|-----------------------------------------------|
| Frontend        | Vanilla HTML / CSS / JavaScript (ES modules) |
| Auth + Database | Firebase Authentication (Email/Password) + Cloud Firestore, **Spark (free) plan** |
| Hosting         | Any static host — Firebase Hosting, Netlify, Vercel, or GitHub Pages |
| Charts          | Chart.js (CDN) |
| PDF export      | jsPDF (CDN) |
| Excel export    | SheetJS / xlsx (CDN) |

No build step, no bundler, no npm dependencies required to run the app — it's plain static files.

---

## Project structure

```
king-expense-tracker/
├── index.html              # Main app shell (all pages live in this one HTML file)
├── manifest.json            # PWA manifest (installable app metadata)
├── sw.js                    # Service worker — offline app-shell caching
├── firestore.rules          # Firestore security rules (single-admin lock)
├── package.json              # Optional local dev-server script (no real dependencies)
├── .gitignore
├── .env.example              # See note inside — this app has no runtime secrets
├── LICENSE                   # MIT
├── README.md                  # This file
├── css/
│   └── styles.css            # All app styling (extracted from the original single-file build)
├── js/
│   ├── app.js                 # Application logic: Firebase Auth + Firestore, UI, charts, exports
│   └── firebase-config.js     # Your Firebase project's Web SDK config
└── assets/
    └── icons/
        ├── icon-192.png
        ├── icon-512.png
        └── icon-maskable-512.png
```

---

## 1. Set up your free Firebase project

1. Go to https://console.firebase.google.com and create a project (Spark/free plan — no credit card).
2. **Build → Authentication → Get started → Sign-in method** → enable **Email/Password**.
3. **Authentication → Users → Add user** → create the ONE admin email + password you'll log in
   with. There is no in-app registration by design — this console step is the only way to create
   an account.
4. **Build → Firestore Database → Create database** → start in production mode, pick a region.
5. In Firestore's **Rules** tab, paste the contents of `firestore.rules` from this project and
   click **Publish**. This locks all data to your one authenticated admin UID.
6. **Project settings → Your apps → Add app → Web** → register it → copy the `firebaseConfig`
   object it shows you into `js/firebase-config.js`, replacing the placeholder values.

## 2. Run it locally (optional)

Because `js/app.js` is loaded as an ES module, opening `index.html` directly from disk
(`file://...`) will NOT work — browsers block module scripts on the `file://` protocol. You need
to serve it over `http://` or `https://`, even locally.

With Node.js installed:
```bash
npm start
```
This runs a local static server (via `npx http-server`) at `http://localhost:8080`.

Any other static server works too (Python's `python3 -m http.server 8080`, VS Code's "Live
Server" extension, etc.) — nothing here is Node-specific.

## 3. Deploy to free hosting

Pick any one:

- **Firebase Hosting**: `npm install -g firebase-tools && firebase login && firebase init hosting`
  (public folder = this project's root, single-page app = No) → `firebase deploy`
- **Netlify**: drag-and-drop this whole folder at https://app.netlify.com/drop, or connect the Git repo.
- **Vercel**: `vercel` CLI or import the Git repo at https://vercel.com/new.
- **GitHub Pages**: push this repo to GitHub → **Settings → Pages → Deploy from branch** → `main` / `/ (root)`.

Whichever you use, once you have your live `https://` URL, add it in **Firebase console →
Authentication → Settings → Authorized domains → Add domain** — otherwise login will be blocked.

## 4. Using the app

- Log in with the one admin account you created in Firebase.
- "Forgot Password?" sends a real reset email via Firebase.
- Every add/edit/delete auto-saves to Firestore in real time — the sidebar shows live sync status.
- **Settings** covers Profile (name + small photo thumbnail), Categories, Backup &amp; Import
  (JSON backup/restore, Excel/CSV import), Language &amp; Currency (English/Tamil, INR/USD/EUR/GBP),
  Security (change password), and Appearance (dark/light theme).
- **Insights** gives free, rule-based spending analysis — no paid AI API involved.
- Install as an app via your browser's install icon or "Add to Home Screen" once hosted over `https://`.

## Honest limitations

- **No receipt/file attachment uploads.** Firebase Storage's free quota now requires linking a
  billing account, even though usage stays free within quota. To keep this project genuinely
  zero-setup-cost, that feature isn't included. Everything else here needs no billing account at all.
- **Translation coverage.** English/Tamil currently covers navigation, dashboard, reports tabs, and
  settings — not every single string in the app yet.
- **`.env.example` is informational, not functional** for this build — see the note inside that
  file for why (this is a static site; your real Firebase Web SDK config intentionally lives in
  `js/firebase-config.js` and is safe to commit).

## License

MIT — see [LICENSE](LICENSE). Feel free to use, modify, and deploy this for your own personal
expense tracking.
