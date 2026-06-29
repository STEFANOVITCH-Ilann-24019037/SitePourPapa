'use strict';

const express  = require('express');
const Database = require('better-sqlite3');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT     = process.env.PORT || process.env.LISTEN_PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── SQLite ───────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'distritec.db'));
db.pragma('journal_mode = WAL');   // meilleures performances lecture concurrente
db.pragma('synchronous = NORMAL'); // bon équilibre durabilité/vitesse

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id         REAL    PRIMARY KEY,
    nom        TEXT    NOT NULL DEFAULT '',
    agence     TEXT    DEFAULT '',
    site       TEXT    DEFAULT '',
    date       TEXT    DEFAULT '',
    deb        TEXT    DEFAULT '08:00',
    fin        TEXT    DEFAULT '17:00',
    pause      INTEGER DEFAULT 30,
    h          REAL    DEFAULT 0,
    hn         REAL    DEFAULT 0,
    hs25       REAL    DEFAULT 0,
    hs50       REAL    DEFAULT 0,
    act        TEXT    DEFAULT '',
    taux       REAL    DEFAULT 0,
    taux_repas REAL    DEFAULT 0,
    cout       REAL    DEFAULT 0,
    cout_reel  REAL    DEFAULT 0,
    repas      REAL    DEFAULT 0,
    obs        TEXT    DEFAULT '',
    status     TEXT    DEFAULT 'pending',
    wk         TEXT    DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS weekvalidations (
    wk_key       TEXT PRIMARY KEY,
    status       TEXT DEFAULT 'pending',
    comment      TEXT DEFAULT '',
    validated_by TEXT DEFAULT '',
    validated_at TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    pwd         TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'site',
    sites       TEXT,
    sites_extra TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ─── Utilisateurs par défaut ──────────────────────────────────────────────────
const DEFAULT_USERS = [
  { id:'admin',           label:'Admin D-Groupe',       pwd:'DGroupe2026!',   role:'admin', sites:null,                        sitesExtra:[] },
  { id:'responsable',     label:'Resp. RH Distritec',   pwd:'Distritec2026!', role:'admin', sites:null,                        sitesExtra:[] },
  { id:'lyon',            label:'Lyon',                 pwd:'Lyon2026!',      role:'site',  sites:['Lyon'],                    sitesExtra:[] },
  { id:'bordeaux',        label:'Bordeaux',             pwd:'Bordeaux2026!',  role:'site',  sites:['Bordeaux'],                sitesExtra:[] },
  { id:'nantes',          label:'Nantes',               pwd:'Nantes2026!',    role:'site',  sites:['Nantes'],                  sitesExtra:[] },
  { id:'toulouse',        label:'Toulouse',             pwd:'Toulouse2026!',  role:'site',  sites:['Toulouse'],                sitesExtra:[] },
  { id:'marseille',       label:'Marseille',            pwd:'Marseille2026!', role:'site',  sites:['Marseille'],               sitesExtra:[] },
  { id:'strasbourg',      label:'Strasbourg',           pwd:'Stras2026!',     role:'site',  sites:['Strasbourg'],              sitesExtra:[] },
  { id:'lille',           label:'Lille',                pwd:'Lille2026!',     role:'site',  sites:['Lille'],                   sitesExtra:[] },
  { id:'rouen',           label:'Rouen',                pwd:'Rouen2026!',     role:'site',  sites:['Rouen'],                   sitesExtra:[] },
  { id:'emerainvillehub', label:'Émerainville Hub',     pwd:'EmHub2026!',     role:'site',  sites:['Émerainville Hub'],        sitesExtra:[] },
  { id:'emerainvilleat',  label:'Ém. Atelier',          pwd:'EmAt2026!',      role:'site',  sites:['Émerainville atelier'],    sitesExtra:[] },
  { id:'emerainvillerev', label:'Ém. Reverse',          pwd:'EmRev2026!',     role:'site',  sites:['Émerainville Reverse'],    sitesExtra:[] },
  { id:'morlaix',         label:'Morlaix',              pwd:'Morlaix2026!',   role:'site',  sites:['Morlaix'],                 sitesExtra:[] },
  { id:'tours',           label:'Tours',                pwd:'Tours2026!',     role:'site',  sites:['Tours'],                   sitesExtra:[] },
  { id:'montpellier',     label:'Montpellier',          pwd:'Mtp2026!',       role:'site',  sites:['Montpellier'],             sitesExtra:[] },
  { id:'nice',            label:'Nice',                 pwd:'Nice2026!',      role:'site',  sites:['Nice'],                    sitesExtra:[] },
  { id:'clermont',        label:'Clermont',             pwd:'Cler2026!',      role:'site',  sites:['Clermont'],                sitesExtra:[] },
  { id:'dijon',           label:'Dijon',                pwd:'Dijon2026!',     role:'site',  sites:['Dijon'],                   sitesExtra:[] },
  { id:'nancy',           label:'Nancy',                pwd:'Nancy2026!',     role:'site',  sites:['Nancy'],                   sitesExtra:[] },
  { id:'91distri',        label:'91Distri',             pwd:'91Distri2026!',  role:'site',  sites:['91Distri'],                sitesExtra:[] },
  { id:'77distri',        label:'77Distri',             pwd:'77Distri2026!',  role:'site',  sites:['77Distri'],                sitesExtra:[] },
];

// ─── Valeurs par défaut (config métier) ──────────────────────────────────────
const DEFAULT_SITES = [
  'Lyon','Bordeaux','Nantes','Toulouse','Marseille','Strasbourg','Lille',
  'Rouen','Émerainville Hub','Émerainville atelier','Émerainville Reverse',
  'Morlaix','Tours','Montpellier','Nice','Clermont','Dijon','Nancy','91Distri','77Distri'
];
const DEFAULT_AGENCES = ['Randstad','Synergie','RAS Intérim','LIP Mantrans','Supplay','Autre'];
const DEFAULT_ACTS = [
  'Manutentionnaire','Agent de quai / Cariste CACES 1','Cariste CACES 3-5',
  'Chef équipe de quai','Aide livreur / Livreur','Chauffeur VL',
  'Chauffeur PL (< 11t)','Chauffeur PL (11-19t)','Chauffeur PL (> 19t)',
  'Employé administratif','Employé administratif senior'
];
const DEFAULT_ACTS_CONFIG = {
  'Manutentionnaire':                   { type:'sedentaire', repas:0 },
  'Agent de quai / Cariste CACES 1':    { type:'sedentaire', repas:0 },
  'Cariste CACES 3-5':                  { type:'sedentaire', repas:0 },
  'Chef équipe de quai':                { type:'sedentaire', repas:0 },
  'Aide livreur / Livreur':             { type:'roulant',    repas:0 },
  'Chauffeur VL':                       { type:'roulant',    repas:0 },
  'Chauffeur PL (< 11t)':               { type:'roulant',    repas:0 },
  'Chauffeur PL (11-19t)':              { type:'roulant',    repas:0 },
  'Chauffeur PL (> 19t)':               { type:'roulant',    repas:0 },
  'Employé administratif':              { type:'sedentaire', repas:0 },
  'Employé administratif senior':       { type:'sedentaire', repas:0 },
};

// ─── Seed utilisateurs par défaut ─────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
if (userCount === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO users (id,label,pwd,role,sites,sites_extra) VALUES (?,?,?,?,?,?)`);
  db.transaction(users => {
    for (const u of users) {
      ins.run(u.id, u.label, u.pwd, u.role,
        u.sites ? JSON.stringify(u.sites) : null,
        JSON.stringify(u.sitesExtra || []));
    }
  })(DEFAULT_USERS);
  console.log('Utilisateurs par défaut créés.');
}

// ─── Migration depuis les anciens fichiers JSON ────────────────────────────────
function migrateLegacyFile(filename) {
  const legacy = path.join(DATA_DIR, filename);
  if (!fs.existsSync(legacy)) return;

  try {
    const raw  = fs.readFileSync(legacy, 'utf8');
    const data = JSON.parse(raw);
    if (!data) return;

    if (filename === 'db.json') {
      // Entrées
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const ins = db.prepare(`
          INSERT OR IGNORE INTO entries
            (id,nom,agence,site,date,deb,fin,pause,h,hn,hs25,hs50,act,taux,taux_repas,cout,cout_reel,repas,obs,status,wk)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        db.transaction(entries => {
          for (const e of entries) {
            ins.run(
              e.id, e.nom||'', e.agence||'', e.site||'', e.date||'',
              e.deb||'08:00', e.fin||'17:00', e.pause ?? 30,
              e.h ?? 0, e.hn ?? 0, e.hs25 ?? 0, e.hs50 ?? 0,
              e.act||'', e.taux ?? 0, e.taux_repas ?? 0,
              e.cout ?? 0, e.cout_reel ?? 0, e.repas ?? 0,
              e.obs||'', e.status||'pending', e.wk||''
            );
          }
        })(data.entries);
        console.log(`Migré ${data.entries.length} entrées depuis db.json`);
      }

      // Validations hebdomadaires
      if (data.weekValidations && typeof data.weekValidations === 'object') {
        const ins = db.prepare(`
          INSERT OR IGNORE INTO weekvalidations (wk_key,status,comment,validated_by,validated_at)
          VALUES (?,?,?,?,?)
        `);
        db.transaction(wvs => {
          for (const [key, v] of Object.entries(wvs)) {
            ins.run(key, v.status||'pending', v.comment||'', v.validatedBy||'', v.validatedAt||'');
          }
        })(data.weekValidations);
      }

      // Paramètres
      const insS = db.prepare(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`);
      const KEYS = ['sites','agences','acts','actsConfig','tauxTR','panierRepas','coeff',
                    'coeffAgences','coeffParPoste','tauxMensuels','memo','resp'];
      for (const key of KEYS) {
        if (data[key] !== undefined) {
          insS.run(key, typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key]));
        }
      }

    } else if (filename === 'users.json' && Array.isArray(data)) {
      const ins = db.prepare(`INSERT OR IGNORE INTO users (id,label,pwd,role,sites,sites_extra) VALUES (?,?,?,?,?,?)`);
      db.transaction(users => {
        for (const u of users) {
          ins.run(u.id, u.label, u.pwd, u.role,
            u.sites ? JSON.stringify(u.sites) : null,
            JSON.stringify(u.sitesExtra || []));
        }
      })(data);
      console.log(`Migré ${data.length} utilisateurs depuis users.json`);
    }

    // Renommer pour ne pas migrer deux fois
    fs.renameSync(legacy, legacy + '.migrated');
    console.log(`${filename} → ${filename}.migrated`);

  } catch (e) {
    console.error(`Erreur migration ${filename}:`, e.message);
  }
}

migrateLegacyFile('db.json');
migrateLegacyFile('users.json');

// ─── Helpers base de données ──────────────────────────────────────────────────
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(
    key, typeof value === 'object' ? JSON.stringify(value) : String(value)
  );
}

/** Reconstruit l'objet db complet attendu par le frontend */
function buildDbObject() {
  const entries = db.prepare('SELECT * FROM entries').all();

  const wvRows = db.prepare('SELECT * FROM weekvalidations').all();
  const weekValidations = {};
  for (const r of wvRows) {
    weekValidations[r.wk_key] = {
      status:      r.status,
      comment:     r.comment,
      validatedBy: r.validated_by,
      validatedAt: r.validated_at,
    };
  }

  return {
    entries,
    weekValidations,
    sites:         getSetting('sites',         DEFAULT_SITES),
    agences:       getSetting('agences',       DEFAULT_AGENCES),
    acts:          getSetting('acts',          DEFAULT_ACTS),
    actsConfig:    getSetting('actsConfig',    DEFAULT_ACTS_CONFIG),
    tauxTR:        getSetting('tauxTR',        9.50),
    panierRepas:   getSetting('panierRepas',   15.20),
    coeff:         getSetting('coeff',         2),
    coeffAgences:  getSetting('coeffAgences',  {}),
    coeffParPoste: getSetting('coeffParPoste', {}),
    tauxMensuels:  getSetting('tauxMensuels',  {}),
    memo:          getSetting('memo',          {}),
    resp:          getSetting('resp',          ''),
  };
}

/** Clés de paramètres à persister depuis le corps POST /api/data */
const SETTINGS_KEYS = [
  'sites','agences','acts','actsConfig','tauxTR','panierRepas','coeff',
  'coeffAgences','coeffParPoste','tauxMensuels','memo','resp',
];

// Statements préparés (réutilisés, plus rapide)
const stmtInsEntry = db.prepare(`
  INSERT OR REPLACE INTO entries
    (id,nom,agence,site,date,deb,fin,pause,h,hn,hs25,hs50,act,taux,taux_repas,cout,cout_reel,repas,obs,status,wk)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const stmtInsWv = db.prepare(`
  INSERT OR REPLACE INTO weekvalidations (wk_key,status,comment,validated_by,validated_at)
  VALUES (?,?,?,?,?)
`);
const stmtInsSetting = db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`);

/** Sauvegarde atomique (transaction) de tout l'objet db */
const persistDb = db.transaction((data) => {
  // Entrées — remplacement complet
  if (Array.isArray(data.entries)) {
    db.prepare('DELETE FROM entries').run();
    for (const e of data.entries) {
      stmtInsEntry.run(
        e.id, e.nom||'', e.agence||'', e.site||'', e.date||'',
        e.deb||'08:00', e.fin||'17:00', e.pause ?? 30,
        e.h ?? 0, e.hn ?? 0, e.hs25 ?? 0, e.hs50 ?? 0,
        e.act||'', e.taux ?? 0, e.taux_repas ?? 0,
        e.cout ?? 0, e.cout_reel ?? 0, e.repas ?? 0,
        e.obs||'', e.status||'pending', e.wk||''
      );
    }
  }

  // Validations semaines — remplacement complet
  if (data.weekValidations && typeof data.weekValidations === 'object') {
    db.prepare('DELETE FROM weekvalidations').run();
    for (const [key, v] of Object.entries(data.weekValidations)) {
      stmtInsWv.run(key, v.status||'pending', v.comment||'', v.validatedBy||'', v.validatedAt||'');
    }
  }

  // Paramètres — mise à jour individuelle
  for (const key of SETTINGS_KEYS) {
    if (data[key] !== undefined) {
      stmtInsSetting.run(
        key,
        typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key])
      );
    }
  }
});

// ─── Sérialiser les utilisateurs depuis la BDD ────────────────────────────────
function rowToUser(row, includePwd = false) {
  const u = {
    id:         row.id,
    label:      row.label,
    role:       row.role,
    sites:      row.sites ? JSON.parse(row.sites) : null,
    sitesExtra: JSON.parse(row.sites_extra || '[]'),
  };
  if (includePwd) u.pwd = row.pwd;
  return u;
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '20mb' }));

// Session
const SESSION_SECRET = process.env.SESSION_SECRET || 'distritec-sess-secret-2026';
app.use(session({
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   12 * 60 * 60 * 1000,  // 12 heures
    sameSite: 'lax',
  },
}));

app.use(express.static(__dirname));

// Middleware d'authentification
function requireAuth(req, res, next) {
  if (!req.session?.uid) {
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }
  next();
}

// ── POST /api/login ──────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const uid = String(req.body?.uid || '').trim().toLowerCase();
  const pwd = req.body?.pwd;

  if (!uid || !pwd) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  const row = db.prepare('SELECT * FROM users WHERE id=? AND pwd=?').get(uid, pwd);
  if (!row) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }

  const user = rowToUser(row, false);
  req.session.uid  = user.id;
  req.session.role = user.role;

  res.json({ user });
});

// ── POST /api/logout ─────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── GET /api/data ────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, (req, res) => {
  try {
    res.json(buildDbObject());
  } catch (e) {
    console.error('GET /api/data error:', e);
    res.status(500).json({ error: 'Erreur de lecture des données.' });
  }
});

// ── POST /api/data ───────────────────────────────────────────────────────────
app.post('/api/data', requireAuth, (req, res) => {
  try {
    persistDb(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/data error:', e);
    res.status(500).json({ error: 'Erreur de sauvegarde.' });
  }
});

// ── GET /api/users ───────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM users').all();
    // Inclure les mots de passe pour le panneau admin
    res.json(rows.map(r => rowToUser(r, true)));
  } catch (e) {
    console.error('GET /api/users error:', e);
    res.status(500).json({ error: 'Erreur de lecture des utilisateurs.' });
  }
});

// ── POST /api/users ──────────────────────────────────────────────────────────
app.post('/api/users', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Format invalide : tableau attendu.' });
  }

  try {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO users (id,label,pwd,role,sites,sites_extra) VALUES (?,?,?,?,?,?)
    `);
    db.transaction(users => {
      db.prepare('DELETE FROM users').run();
      for (const u of users) {
        ins.run(
          u.id, u.label, u.pwd, u.role,
          u.sites ? JSON.stringify(u.sites) : null,
          JSON.stringify(u.sitesExtra || [])
        );
      }
    })(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/users error:', e);
    res.status(500).json({ error: 'Erreur de sauvegarde des utilisateurs.' });
  }
});

// ── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Distritec → http://localhost:${PORT}`);
  console.log(`  Base de données : ${path.join(DATA_DIR, 'distritec.db')}`);
});
