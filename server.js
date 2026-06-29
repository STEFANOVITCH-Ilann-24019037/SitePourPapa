'use strict';

// node:sqlite est intégré dans Node.js 22+, aucune compilation requise
const { DatabaseSync } = require('node:sqlite');
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT     = process.env.PORT || process.env.LISTEN_PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── SQLite ───────────────────────────────────────────────────────────────────
const db = new DatabaseSync(path.join(DATA_DIR, 'distritec.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

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
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS weekvalidations (
    wk_key       TEXT PRIMARY KEY,
    status       TEXT DEFAULT 'pending',
    comment      TEXT DEFAULT '',
    validated_by TEXT DEFAULT '',
    validated_at TEXT DEFAULT ''
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    pwd         TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'site',
    sites       TEXT,
    sites_extra TEXT DEFAULT '[]'
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT    PRIMARY KEY,
    sess    TEXT    NOT NULL,
    expires INTEGER NOT NULL
  )
`);
// Nettoyage des sessions expirées au démarrage et toutes les heures
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3_600_000).unref();

// ─── Helper transaction ───────────────────────────────────────────────────────
function withTx(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

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
  'Manutentionnaire':                 { type:'sedentaire', repas:0 },
  'Agent de quai / Cariste CACES 1':  { type:'sedentaire', repas:0 },
  'Cariste CACES 3-5':                { type:'sedentaire', repas:0 },
  'Chef équipe de quai':              { type:'sedentaire', repas:0 },
  'Aide livreur / Livreur':           { type:'roulant',    repas:0 },
  'Chauffeur VL':                     { type:'roulant',    repas:0 },
  'Chauffeur PL (< 11t)':             { type:'roulant',    repas:0 },
  'Chauffeur PL (11-19t)':            { type:'roulant',    repas:0 },
  'Chauffeur PL (> 19t)':             { type:'roulant',    repas:0 },
  'Employé administratif':            { type:'sedentaire', repas:0 },
  'Employé administratif senior':     { type:'sedentaire', repas:0 },
};

// ─── Seed utilisateurs par défaut ─────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
if (userCount === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO users (id,label,pwd,role,sites,sites_extra) VALUES (?,?,?,?,?,?)`);
  withTx(() => {
    for (const u of DEFAULT_USERS) {
      ins.run(u.id, u.label, u.pwd, u.role,
        u.sites ? JSON.stringify(u.sites) : null,
        JSON.stringify(u.sitesExtra || []));
    }
  });
  console.log('Utilisateurs par défaut créés.');
}

// ─── Migration depuis les anciens fichiers JSON ────────────────────────────────
function migrateLegacyFile(filename) {
  const legacy = path.join(DATA_DIR, filename);
  if (!fs.existsSync(legacy)) return;
  try {
    const data = JSON.parse(fs.readFileSync(legacy, 'utf8'));
    if (!data) return;

    if (filename === 'db.json') {
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const ins = db.prepare(`
          INSERT OR IGNORE INTO entries
            (id,nom,agence,site,date,deb,fin,pause,h,hn,hs25,hs50,act,taux,taux_repas,cout,cout_reel,repas,obs,status,wk)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        withTx(() => {
          for (const e of data.entries) {
            ins.run(
              e.id, e.nom||'', e.agence||'', e.site||'', e.date||'',
              e.deb||'08:00', e.fin||'17:00', e.pause ?? 30,
              e.h ?? 0, e.hn ?? 0, e.hs25 ?? 0, e.hs50 ?? 0,
              e.act||'', e.taux ?? 0, e.taux_repas ?? 0,
              e.cout ?? 0, e.cout_reel ?? 0, e.repas ?? 0,
              e.obs||'', e.status||'pending', e.wk||''
            );
          }
        });
        console.log(`Migré ${data.entries.length} entrées depuis ${filename}`);
      }
      if (data.weekValidations && typeof data.weekValidations === 'object') {
        const ins = db.prepare(`
          INSERT OR IGNORE INTO weekvalidations (wk_key,status,comment,validated_by,validated_at)
          VALUES (?,?,?,?,?)
        `);
        withTx(() => {
          for (const [key, v] of Object.entries(data.weekValidations)) {
            ins.run(key, v.status||'pending', v.comment||'', v.validatedBy||'', v.validatedAt||'');
          }
        });
      }
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
      withTx(() => {
        for (const u of data) {
          ins.run(u.id, u.label, u.pwd, u.role,
            u.sites ? JSON.stringify(u.sites) : null,
            JSON.stringify(u.sitesExtra || []));
        }
      });
      console.log(`Migré ${data.length} utilisateurs depuis ${filename}`);
    }

    fs.renameSync(legacy, legacy + '.migrated');
    console.log(`${filename} → ${filename}.migrated`);
  } catch (e) {
    console.error(`Erreur migration ${filename}:`, e.message);
  }
}

migrateLegacyFile('db.json');
migrateLegacyFile('users.json');

// ─── Helpers lecture/écriture ─────────────────────────────────────────────────
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
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

const SETTINGS_KEYS = [
  'sites','agences','acts','actsConfig','tauxTR','panierRepas','coeff',
  'coeffAgences','coeffParPoste','tauxMensuels','memo','resp',
];

// Statements préparés réutilisables
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

/** Sauvegarde atomique de tout l'objet db en une transaction SQLite */
function persistDb(data) {
  withTx(() => {
    if (Array.isArray(data.entries)) {
      db.exec('DELETE FROM entries');
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
    if (data.weekValidations && typeof data.weekValidations === 'object') {
      db.exec('DELETE FROM weekvalidations');
      for (const [key, v] of Object.entries(data.weekValidations)) {
        stmtInsWv.run(key, v.status||'pending', v.comment||'', v.validatedBy||'', v.validatedAt||'');
      }
    }
    for (const key of SETTINGS_KEYS) {
      if (data[key] !== undefined) {
        stmtInsSetting.run(
          key,
          typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key])
        );
      }
    }
  });
}

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

// ─── Store de sessions SQLite (survit aux redémarrages serveur) ───────────────
class SQLiteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      const row = db.prepare('SELECT sess FROM sessions WHERE sid=? AND expires>?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 12 * 60 * 60 * 1000;
      db.prepare('INSERT OR REPLACE INTO sessions (sid,sess,expires) VALUES (?,?,?)')
        .run(sid, JSON.stringify(sess), expires);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }
  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '20mb' }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'distritec-sess-secret-2026';
app.use(session({
  store:             new SQLiteSessionStore(),
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
  if (!uid || !pwd) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });

  const row = db.prepare('SELECT * FROM users WHERE id=? AND pwd=?').get(uid, pwd);
  if (!row) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });

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
  try { res.json(buildDbObject()); }
  catch (e) { console.error('GET /api/data:', e); res.status(500).json({ error: 'Erreur lecture.' }); }
});

// ── POST /api/data ───────────────────────────────────────────────────────────
app.post('/api/data', requireAuth, (req, res) => {
  try { persistDb(req.body); res.json({ ok: true }); }
  catch (e) { console.error('POST /api/data:', e); res.status(500).json({ error: 'Erreur sauvegarde.' }); }
});

// ── GET /api/users ───────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, (req, res) => {
  try { res.json(db.prepare('SELECT * FROM users').all().map(r => rowToUser(r, true))); }
  catch (e) { console.error('GET /api/users:', e); res.status(500).json({ error: 'Erreur lecture.' }); }
});

// ── POST /api/users ──────────────────────────────────────────────────────────
app.post('/api/users', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Format invalide.' });
  try {
    const ins = db.prepare(`INSERT OR REPLACE INTO users (id,label,pwd,role,sites,sites_extra) VALUES (?,?,?,?,?,?)`);
    withTx(() => {
      db.exec('DELETE FROM users');
      for (const u of req.body) {
        ins.run(u.id, u.label, u.pwd, u.role,
          u.sites ? JSON.stringify(u.sites) : null,
          JSON.stringify(u.sitesExtra || []));
      }
    });
    res.json({ ok: true });
  } catch (e) { console.error('POST /api/users:', e); res.status(500).json({ error: 'Erreur sauvegarde.' }); }
});

// ── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Distritec → http://localhost:${PORT}`);
  console.log(`  Base de données : ${path.join(DATA_DIR, 'distritec.db')}`);
});
