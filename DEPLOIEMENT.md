# Déploiement sur Alwaysdata

Ce guide explique comment mettre le site Distritec en ligne sur [alwaysdata.com](https://www.alwaysdata.com) (hébergeur français, plan gratuit disponible).

---

## 1. Créer un compte Alwaysdata

1. Va sur **https://www.alwaysdata.com**
2. Clique sur **"Essai gratuit"** (100 Mo, aucune carte bancaire requise)
3. Remplis le formulaire et confirme ton email

---

## 2. Créer un dépôt GitHub (pour pousser le code)

Si ce n'est pas déjà fait :

```bash
# Dans le dossier du projet
git remote add origin https://github.com/TON_PSEUDO/distritec.git
git push -u origin main
```

> Remplace `TON_PSEUDO` par ton nom d'utilisateur GitHub.  
> Le dépôt doit être **privé** (le code contient les mots de passe utilisateurs).

---

## 3. Configurer Node.js sur Alwaysdata

### 3.1 — Accéder au panneau d'administration

Va sur **https://admin.alwaysdata.com** et connecte-toi.

### 3.2 — Activer SSH

1. Menu gauche → **SSH**
2. Active l'accès SSH si ce n'est pas déjà fait
3. Note ton nom d'utilisateur (ex. `distritec`)

### 3.3 — Se connecter en SSH

```bash
ssh distritec@ssh-distritec.alwaysdata.net
```

> Remplace `distritec` par ton vrai nom de compte Alwaysdata.

### 3.4 — Cloner le projet sur le serveur

```bash
cd ~/www
git clone https://github.com/TON_PSEUDO/distritec.git .
npm install --omit=dev
```

---

## 4. Déclarer le site Node.js

1. Dans le panneau admin → **Web > Sites**
2. Clique **"Ajouter un site"**
3. Remplis les champs :

| Champ | Valeur |
|-------|--------|
| **Adresses** | `distritec.alwaysdata.net` (ou ton domaine) |
| **Type** | `Programme utilisateur` |
| **Commande** | `node /home/distritec/www/server.js` |
| **Répertoire de travail** | `/home/distritec/www` |

4. Clique **"Enregistrer"**

> Alwaysdata injecte automatiquement la variable d'environnement `PORT`. Le serveur la lit déjà (`process.env.PORT || 3000`), rien à changer.

---

## 5. Vérifier que ça marche

Ouvre dans ton navigateur :

```
https://distritec.alwaysdata.net
```

La page de connexion Distritec doit apparaître.

---

## 6. Mettre à jour le site (après une modification)

```bash
# En local : commite et pousse les changements
git add -A
git commit -m "Description du changement"
git push

# En SSH sur le serveur : tire les changements
ssh distritec@ssh-distritec.alwaysdata.net
cd ~/www
git pull
```

Puis redémarre le site depuis le panneau admin :  
**Web > Sites → icône "Redémarrer"** à côté du site.

---

## 7. Données persistantes

Les données sont stockées dans `~/www/data/db.json` sur le serveur. Ce fichier est créé automatiquement au premier enregistrement. Il n'est **pas** dans git (`.gitignore`), donc un `git pull` ne l'écrasera jamais.

Pour sauvegarder les données manuellement :

```bash
# Depuis ton ordinateur
scp distritec@ssh-distritec.alwaysdata.net:~/www/data/db.json ./backup_db.json
```

---

## Résumé des fichiers importants

```
www/
├── index.html       ← Page principale
├── style.css        ← Styles
├── app.js           ← JavaScript frontend
├── server.js        ← Backend Express (point d'entrée)
├── package.json     ← Dépendances Node.js
└── data/
    ├── db.json      ← Données (auto-créé, ignoré par git)
    └── users.json   ← Utilisateurs modifiés (auto-créé, ignoré par git)
```
