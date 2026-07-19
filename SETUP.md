# Installer ERPTrisThom

Fais les étapes dans l'ordre. Copie les commandes sans les modifier, sauf quand le guide te le demande.

> **Secret :** ne partage jamais le mot de passe e-mail ni `BETTER_AUTH_SECRET`. Ne les ajoute jamais dans Git.

**Projet déjà installé ?** Va directement à l'étape 3 ou 4.

## 1. Avant de commencer

Il te faut :

- [Git](https://git-scm.com/downloads) ;
- un compte [Convex](https://convex.dev) gratuit ;
- l'adresse `connexion@bouilloncomptoir.fr` ;
- le mot de passe de cette adresse ;
- Bun.

### Installer Bun

**Windows :** ouvre PowerShell et colle :

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

**macOS ou Linux :** ouvre Terminal et colle :

```bash
curl -fsSL https://bun.sh/install | bash
```

Ferme le terminal. Rouvre-le. Vérifie Bun :

```bash
bun --version
```

Tu dois voir un numéro.

## 2. Installer le projet

Colle ces commandes :

```bash
git clone <ADRESSE_DU_DEPOT_GIT>
cd ERPTrisThom
bun install
```

Remplace seulement `<ADRESSE_DU_DEPOT_GIT>` par l'adresse du projet.

Reste dans le dossier `ERPTrisThom` pour la suite.

## 3. Configurer Convex

Lance :

```bash
bun run dev:setup
```

Une page Convex s'ouvre.

1. Connecte-toi.
2. Crée ou sélectionne le projet.
3. Attends la fin de la configuration.
4. Appuie sur `Ctrl` + `C` si la commande continue de tourner.

Le fichier `packages/backend/.env.local` est créé automatiquement.

## 4. Connecter le site

### 4.1 Créer le fichier `.env`

**Windows :**

```powershell
Copy-Item apps/web/.env.example apps/web/.env
```

**macOS ou Linux :**

```bash
cp apps/web/.env.example apps/web/.env
```

### 4.2 Copier les deux adresses Convex

Ouvre :

- `packages/backend/.env.local` ;
- `apps/web/.env`.

Copie les valeurs de `CONVEX_URL` et `CONVEX_SITE_URL` dans `apps/web/.env` :

```dotenv
VITE_CONVEX_URL=https://nom-du-projet.convex.cloud
VITE_CONVEX_SITE_URL=https://nom-du-projet.convex.site
```

Vérifie les fins d'adresse :

- `VITE_CONVEX_URL` finit par `.cloud` ;
- `VITE_CONVEX_SITE_URL` finit par `.site`.

Enregistre le fichier.

## 5. Configurer la connexion par e-mail

Va dans le backend :

```bash
cd packages/backend
```

### 5.1 Créer la clé Better Auth

Colle :

```bash
bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())" | bunx convex env set BETTER_AUTH_SECRET
bunx convex env set SITE_URL http://localhost:3001
```

Si Convex te demande un déploiement, choisis celui de développement.

### 5.2 Configurer OVH

Colle :

```bash
bunx convex env set SMTP_HOST smtp.mail.ovh.net
bunx convex env set SMTP_PORT 465
bunx convex env set SMTP_SECURE true
bunx convex env set SMTP_USER contact@bouilloncomptoir.fr
bunx convex env set SMTP_FROM "Bouillon Comptoir <contact@bouilloncomptoir.fr>"
```

Ajoute le mot de passe :

```bash
bunx convex env set SMTP_PASSWORD
```

Le terminal te demande le mot de passe: Entre le mot de passe genre : `Comp******!` puis appuie sur `Entrée`.

Rien ne s'affiche pendant la saisie. C'est normal.

### 5.3 Vérifier

Lance :

```bash
bunx convex env list --names-only
```

Tu dois voir ces huit noms :

```text
BETTER_AUTH_SECRET
SITE_URL
SMTP_FROM
SMTP_HOST
SMTP_PASSWORD
SMTP_PORT
SMTP_SECURE
SMTP_USER
```

> Utilise toujours `--names-only`. Sans cette option, les secrets s'affichent.

## 6. Lancer et tester

Reviens à la racine :

```bash
cd ../..
```

Lance le projet :

```bash
bun run dev
```

Ouvre <http://localhost:3001>.

Teste la connexion :

1. Entre une adresse e-mail à laquelle tu as accès.
2. Demande le lien de connexion.
3. Vérifie tes e-mails et les spams.
4. Ouvre le lien dans les 10 minutes.

Le lien ne fonctionne qu'une fois.

Pour arrêter le projet, appuie sur `Ctrl` + `C` dans le terminal.

## 7. En cas de problème

### Bun n'est pas reconnu

Ferme et rouvre le terminal. Lance :

```bash
bun --version
```

Toujours rien ? Réinstalle Bun avec la commande de l'étape 1.

### Une variable manque

Va dans le backend :

```bash
cd packages/backend
```

Relance uniquement la commande de la variable manquante.

### Le mot de passe e-mail est incorrect

```bash
bunx convex env set SMTP_PASSWORD
```

Colle le bon mot de passe puis appuie sur `Entrée`.

### L'identifiant e-mail est incorrect

```bash
bunx convex env set SMTP_USER connexion@bouilloncomptoir.fr
```

Utilise toujours l'adresse e-mail complète.

### Erreur SMTP

Essaie l'autre serveur OVH :

```bash
bunx convex env set SMTP_HOST ssl0.ovh.net
```

Arrête puis relance le projet.

### Le lien ouvre la mauvaise adresse

```bash
bunx convex env set SITE_URL http://localhost:3001
```

N'ajoute pas de `/` à la fin.

### Aucun e-mail n'arrive

1. Attends deux minutes.
2. Vérifie les spams.
3. Vérifie les huit variables avec `bunx convex env list --names-only`.
4. Lis l'erreur dans le terminal où `bun run dev` fonctionne.

## 8. Production — facultatif

Fais cette étape seulement quand le site est publié sur Internet.

Va dans `packages/backend`.

Crée une nouvelle clé pour la production :

```bash
bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())" | bunx convex env --prod set BETTER_AUTH_SECRET
```

Ajoute l'adresse publique du site :

```bash
bunx convex env --prod set SITE_URL https://www.exemple.fr
```

Remplace `https://www.exemple.fr` par la vraie adresse.

Configure OVH :

```bash
bunx convex env --prod set SMTP_HOST smtp.mail.ovh.net
bunx convex env --prod set SMTP_PORT 465
bunx convex env --prod set SMTP_SECURE true
bunx convex env --prod set SMTP_USER connexion@bouilloncomptoir.fr
bunx convex env --prod set SMTP_FROM "Bouillon Comptoir <connexion@bouilloncomptoir.fr>"
bunx convex env --prod set SMTP_PASSWORD
```

Vérifie les noms :

```bash
bunx convex env --prod list --names-only
```

N'utilise pas la clé `BETTER_AUTH_SECRET` de développement en production.

## Commandes utiles

| Commande | Action |
|---|---|
| `bun run dev` | Lance tout |
| `bun run dev:web` | Lance seulement le site |
| `bun run dev:server` | Lance seulement le backend |
| `bun run build` | Prépare la production |
| `bun run check-types` | Vérifie TypeScript |
