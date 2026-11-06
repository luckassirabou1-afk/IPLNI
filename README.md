# IPLNI — monorepo de démarrage

Plateforme e-learning de l'Institut de Promotion des Langues Nationales et Internationales.

## Architecture

- `apps/web` : interface Web Next.js, bilingue FR/EN (socle de départ).
- `apps/api` : API REST Express + TypeScript.
- `apps/api/prisma` : schéma PostgreSQL et migrations Prisma.
- `apps/mobile` : réservé à Flutter en phase 2, après recette Web.
- `packages/contracts` : contrats partagés à ajouter lorsque les API seront stabilisées.
- `docs` : décisions d'architecture et règles métier.

Le dépôt est un **socle de développement**, pas encore une plateforme prête à publier. L'interface propose le français et l'anglais ; le choix est mémorisé dans le navigateur et la langue du navigateur est utilisée au premier accès. Le contenu pédagogique saisi par les formateurs (titres, descriptions et leçons) reste dans sa langue d'origine et n'est pas traduit automatiquement. L'inscription/connexion avec vérification d'adresse e-mail, la limitation persistante des tentatives, le tableau de bord apprenant, le catalogue, la déclaration d'un paiement manuel, la validation administrative, la configuration des moyens de paiement, les brouillons de cours formateur et la modération sont reliés à PostgreSQL. Les leçons publiées peuvent contenir du texte, une vidéo MP4/WebM ou un PDF privé dans Google Cloud Storage ; les médias ne sont accessibles qu'aux apprenants disposant d'un accès actif ou d'une leçon d'aperçu. Les formateurs peuvent planifier des visioconférences Jitsi sur leurs formations publiées ; seuls les apprenants avec un accès actif et les formateurs de la formation peuvent rejoindre la salle depuis IPLNI, à partir de 15 minutes avant la session. Le stockage, les quiz et la recette de production doivent encore être configurés.

## Mise en production : Vercel + Render

L'architecture de déploiement prévue est la suivante :

- `apps/web` : Next.js sur **Vercel**.
- `apps/api` : Express/TypeScript sur **Render**.
- PostgreSQL : base Render créée avec le Blueprint [`render.yaml`](./render.yaml), région Frankfurt par défaut.
- Ressources de cours : bucket **Google Cloud Storage** privé.

Le navigateur appelle l'API par le chemin `/api` du site Vercel. La règle Next.js relaie ces requêtes vers Render (`API_PROXY_TARGET`). Ce proxy de même origine est nécessaire : il conserve le cookie de session `SameSite=Lax` sans l'affaiblir. Ne configurez pas `NEXT_PUBLIC_API_URL` vers le domaine Render ; laissez cette variable absente.

### Déployer l'API et PostgreSQL sur Render

1. Importez le dépôt dans Render, créez un **Blueprint** à partir de `render.yaml` et vérifiez la région et les coûts du service et de PostgreSQL avant de confirmer. Le Blueprint installe les dépendances, génère Prisma, applique les migrations pendant le pré-déploiement et vérifie `/health/ready`.
2. Pendant la création, renseignez les variables marquées `sync: false` dans Render. `WEB_URL` et `CORS_ORIGIN` doivent être l'URL HTTPS exacte de production Vercel (origine seulement, sans chemin). `AUTH_RATE_LIMIT_SECRET` est généré par le Blueprint.
3. Configurez un bucket GCS privé et fournissez dans Render `COURSE_MEDIA_BUCKET` et `GCS_SERVICE_ACCOUNT_JSON`, ce dernier contenant le JSON complet d'un compte de service GCP limité au bucket. Ne commitez jamais cette clé. Configurez l'origine exacte Vercel dans le CORS GCS ; voir [stockage des ressources](./docs/course-media-storage.md).
4. Configurez SMTP pour l'inscription et la vérification d'adresse e-mail. Google OAuth est facultatif ; si activé, définissez `GOOGLE_REDIRECT_URI` sur `https://<domaine-vercel>/api/v1/auth/google/callback` et enregistrez exactement la même URL dans Google Cloud Console.

### Déployer le frontend sur Vercel

1. Importez le même dépôt dans Vercel avec `apps/web` comme **Root Directory**, activez l'inclusion des fichiers du monorepo hors de ce dossier, puis gardez le framework Next.js et les commandes de build par défaut.
2. Ajoutez la variable d'environnement `API_PROXY_TARGET` avec l'URL HTTPS de l'API Render, sans chemin final (par exemple `https://iplni-api.onrender.com`). Définissez-la pour Production et Preview si les previews doivent utiliser l'API de production.
3. Laissez `NEXT_PUBLIC_API_URL` non définie, puis redéployez après toute modification de `API_PROXY_TARGET`. Le site doit utiliser `/api/v1/...` et non appeler directement Render.
4. Si un domaine personnalisé est utilisé, configurez-le dans Vercel et mettez à jour `WEB_URL`, `CORS_ORIGIN`, `GOOGLE_REDIRECT_URI` et le CORS du bucket GCS avec la nouvelle origine.

### Après le premier déploiement

- Créez un compte depuis le site et vérifiez son e-mail, puis attribuez le rôle administrateur depuis le Shell Render avec `IPLNI_ADMIN_EMAIL=<adresse-verifiee> pnpm --filter @iplni/api db:promote-admin`. Ne donnez jamais ce rôle à un compte non contrôlé.
- Connectez-vous comme administrateur et configurez le moyen de paiement Orange Money dans l'espace d'administration ; vérifiez le titulaire et la référence avant d'accepter des paiements.
- Testez en production inscription/e-mail, connexion et conservation de session, Google OAuth si activé, paiement manuel, modération des formations, import/lecture de média et les URL `/health` et `/health/ready`.
- Vérifiez les sauvegardes et la restauration PostgreSQL et configurez les alertes/coûts sur les deux fournisseurs avant l'ouverture au public.

Le déploiement nécessite des comptes Vercel, Render et Google Cloud ainsi que les secrets SMTP/GCS et les URL définitives ; cette configuration de dépôt ne crée pas les comptes et ne lance pas un déploiement externe. Le Blueprint sélectionne Frankfurt par défaut et un service/base payants : vérifiez la résidence des données, la disponibilité, les sauvegardes et les tarifs avant de provisionner.

Les visioconférences utilisent le service public meet.jit.si ; examinez ses conditions et sa politique de confidentialité. La protection IPLNI contrôle l'accès au lien, mais ne rend pas la salle Jitsi elle-même privée. Avant l'ouverture au public, terminez la recette fonctionnelle, la politique de confidentialité/conditions de vente et les procédures de support/remboursement.

## Prérequis

- Node.js LTS compatible avec Next.js
- pnpm
- PostgreSQL local ou distant
- Git
- VS Code

Vérifier :
```powershell
node --version
pnpm --version
git --version
```

## Installation sous Windows (PowerShell)

Depuis le dossier racine :
```powershell
Copy-Item .env.example .env
if (-not (Test-Path .\apps\api\.env)) { Copy-Item .env.example .\apps\api\.env }
pnpm install
```

Le service PostgreSQL doit être démarré. Créer la base de développement (avec un rôle local autorisé à créer des bases) :
```powershell
psql -h localhost -p 5432 -U postgres -d postgres
```

Dans l’invite `psql`, exécuter `CREATE DATABASE iplni_dev;`, puis `\q`. Si PostgreSQL utilise un autre rôle ou port, adapter la commande. Configurer `DATABASE_URL` dans `apps/api/.env` avec les identifiants de ce rôle. Ne jamais partager ni committer ce fichier.

Préparer le client Prisma, valider le schéma et appliquer les migrations versionnées :
```powershell
pnpm db:setup
```

Vérifier l’état des migrations à tout moment :
```powershell
pnpm db:status
```

`db:setup` utilise les migrations de `apps/api/prisma/migrations` et `DATABASE_URL` de l’API. Vérifier la cible avant de lancer la commande ; elle ne crée pas la base elle-même.

Lancer l'API et le Web :
```powershell
pnpm dev
```

- Web : http://localhost:3000
- API : http://localhost:4000
- Santé API : http://localhost:4000/health
- État base de données : http://localhost:4000/health/ready
- Documentation OpenAPI : http://localhost:4000/openapi.json
- Inscription : http://localhost:3000/register
- Connexion : http://localhost:3000/login
- Espace apprenant : http://localhost:3000/dashboard
- Vérification admin des paiements : http://localhost:3000/admin/payments
- Configuration admin des moyens de paiement : http://localhost:3000/admin/payment-methods
- Modération admin des formations : http://localhost:3000/admin/courses
- Tableau de bord administrateur : http://localhost:3000/admin
- Espace formateur : http://localhost:3000/trainer
- Catalogue : http://localhost:3000/courses

Pour lancer séparément :
```powershell
pnpm dev:api
pnpm dev:web
```

## Vérifications de qualité

Depuis la racine du monorepo, `pnpm lint` exécute ESLint, vérifie les types TypeScript et contrôle le formatage Prettier. `pnpm format` applique le formatage standard ; `pnpm test` exécute les tests de l'API et `pnpm build` construit l'API et le Web.

## Variables d'environnement

Le fichier `.env.example` ne contient que des valeurs fictives. Ne jamais committer `.env`, mots de passe, clés de stockage ou secrets.

L'API lit `DATABASE_URL` pour PostgreSQL. Le frontend contacte `http://localhost:4000` par défaut ; définir `NEXT_PUBLIC_API_URL` si l'API est hébergée ailleurs. Pour l'inscription par e-mail, configurer SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) et `WEB_URL` ; l'absence de SMTP n'empêche pas l'API de démarrer, mais désactive l'inscription et le renvoi par e-mail.

### Activer la connexion Google sans remplacer PostgreSQL

Les pages d'inscription et de connexion proposent déjà les deux options : e-mail/mot de passe et « Continuer avec Google ». Google sert uniquement à vérifier l'identité ; les comptes, profils, sessions et données IPLNI restent dans PostgreSQL. Firebase Authentication n'est donc pas nécessaire pour ce parcours et n'est pas utilisé par l'application.

Pour activer Google OAuth en développement :

1. Dans [Google Cloud Console](https://console.cloud.google.com/), créez ou sélectionnez un projet Google Cloud. Un projet dédié à IPLNI permet d'isoler ses identifiants ; l'authentification OAuth seule ne nécessite pas de provisionner Firebase ni Cloud SQL.
2. Dans **Google Auth Platform**, configurez l'écran de consentement (nom de l'application, e-mail d'assistance et coordonnées du développeur). Pour une application destinée au public, choisissez le type **External**. Tant que l'application est en mode **Testing**, ajoutez les comptes Google des testeurs dans la liste des utilisateurs de test.
3. Créez un identifiant client OAuth de type **Web application**. Ajoutez comme URI de redirection autorisée la valeur exacte `http://localhost:4000/api/v1/auth/google/callback` pour le développement local. En production, ajoutez l'URI HTTPS exacte de callback de l'API déployée. Le flux est traité par l'API ; n'exposez jamais le secret OAuth dans le frontend.
4. Copiez l'identifiant client et le secret OAuth dans `apps/api/.env` :

   ```dotenv
   GOOGLE_CLIENT_ID="identifiant-client-fourni-par-google"
   GOOGLE_CLIENT_SECRET="secret-client-fourni-par-google"
   GOOGLE_REDIRECT_URI="http://localhost:4000/api/v1/auth/google/callback"
   WEB_URL="http://localhost:3000"
   ```

5. Vérifiez que `DATABASE_URL` pointe toujours vers votre base PostgreSQL, puis appliquez les migrations avant le premier essai Google. Démarrez l'API et le Web et testez les deux options sur `/login` et `/register`.

En production, stockez `GOOGLE_CLIENT_SECRET` dans Secret Manager (ou le gestionnaire de secrets de l'hébergeur), utilisez uniquement des URL HTTPS et indiquez dans Google Cloud l'URI de callback publique exacte. Une application externe encore en mode **Testing** est limitée aux testeurs déclarés ; suivez les vérifications et étapes de publication demandées par Google avant de l'ouvrir à tous les utilisateurs. N'ajoutez pas de clés ou secrets dans `NEXT_PUBLIC_*`, le dépôt ou les fichiers `.env.example`.

L'API démarre en production uniquement avec `AUTH_RATE_LIMIT_SECRET` (au moins 32 caractères aléatoires). Pour les cookies de session en production, utiliser HTTPS et configurer `CORS_ORIGIN` avec l'origine exacte du frontend.

L'inscription par e-mail crée un compte en attente et envoie un lien à usage unique, valide 24 heures. La connexion Google vérifie l'adresse auprès de Google et crée ou relie un compte apprenant actif ; son identifiant Google est stocké pour les connexions ultérieures. Configurez et testez SMTP avant de publier le parcours e-mail et appliquez les migrations avant d'activer Google OAuth. Les limites par fenêtre sont de 5 échecs par adresse e-mail et 30 tentatives non authentifiées par IP en 15 minutes pour la connexion, 5 inscriptions par IP/heure, et 3 renvois par adresse/heure (avec une limite IP). Les connexions réussies libèrent le compteur IP et réinitialisent le compteur e-mail. Les compteurs sont stockés sous forme de HMAC dans PostgreSQL et les entrées inactives sont purgées périodiquement. En production, générer une valeur aléatoire unique pour `AUTH_RATE_LIMIT_SECRET` et la stocker dans le gestionnaire de secrets de l’hébergeur, jamais dans Git.

La migration de sécurité fait repasser en attente les comptes existants sans adresse vérifiée ; ils devront utiliser « Renvoyer le lien de vérification » à leur prochaine connexion. Si l'API est derrière un proxy, configurer explicitement les proxies de confiance d'Express chez l'hébergeur afin que les limites par IP utilisent l'adresse réelle du client et non un en-tête transféré arbitraire.

Pour activer le compte Orange Money, définissez `ORANGE_MONEY_ACCOUNT_REFERENCE` et `ORANGE_MONEY_ACCOUNT_HOLDER_NAME` dans `apps/api/.env` (fichier local ignoré par Git), appliquez d'abord les migrations à votre base de développement, puis exécutez `pnpm --dir .\IPLNI --filter @iplni/api db:configure-orange-money`. La commande est réexécutable sans créer de doublon pour le même numéro. En production, fournissez ces variables via le gestionnaire de secrets/configuration de l’hébergeur et exécutez la commande dans l'environnement de déploiement. Le numéro et le titulaire ne doivent jamais être ajoutés aux sources, captures de logs ou commits.

### Premier compte administrateur

Créez un compte normal depuis l'inscription, vérifiez son e-mail et assurez-vous qu'il est actif. Après avoir vérifié que `DATABASE_URL` pointe sur la base prévue, définissez `IPLNI_ADMIN_EMAIL` avec cette adresse dans l'environnement local de l'API, puis exécutez depuis la racine du monorepo :

```powershell
pnpm --filter @iplni/api db:promote-admin
```

Cette commande réexécutable attribue uniquement le rôle ADMIN à ce compte existant, actif et vérifié ; elle ne crée aucun utilisateur de démonstration et journalise l'opération. L'administrateur peut ensuite consulter `/admin/payments`, une file paginée accessible uniquement avec le rôle ADMIN, et `/admin/payment-methods` pour créer, modifier ou désactiver des coordonnées réelles. Toute modification est journalisée ; la désactivation retire le compte des nouveaux paiements sans effacer les informations. Vérifiez manuellement la transaction auprès de l'opérateur avant de confirmer : la confirmation et l'activation des inscriptions sont atomiques et auditées ; le refus exige un motif et laisse la commande payable tant qu'elle n'a pas expiré. Les migrations d'unicité des références de paiement et des comptes opérateur s'arrêtent explicitement en cas de doublons à rapprocher.

### Compte formateur et rédaction de cours

Créez un compte depuis l'inscription normale et confirmez son adresse e-mail. Après avoir vérifié `DATABASE_URL`, renseignez l'adresse exacte dans `IPLNI_TRAINER_EMAIL` dans l'environnement de l'API puis exécutez :

```powershell
pnpm --filter @iplni/api db:promote-trainer
```

Le script n'invente aucun compte : il attribue le rôle formateur au compte existant, actif et vérifié et journalise l'opération. L'espace `/trainer` permet de créer un brouillon PostgreSQL, d'y structurer des modules, d'écrire et modifier des leçons texte, puis de soumettre le cours à la modération. Le compte formateur ne peut modifier que les cours auxquels il est affecté et les brouillons restent invisibles au catalogue public. Le tableau de bord `/trainer` affiche ses cours, indicateurs, brouillons, soumissions en attente et formations publiées. Il permet de créer des leçons texte, vidéo, PDF et des leçons de session en direct ; les fichiers MP4/WebM (500 Mo maximum) et PDF (25 Mo maximum) peuvent être téléversés depuis l'ordinateur vers le bucket privé. Les cours contenant un direct sont publiés puis les sessions Jitsi sont planifiées depuis la fiche de la formation ; les apprenants inscrits peuvent rejoindre depuis leur tableau de bord ou la leçon live. Les administrateurs examinent et publient les soumissions dans `/admin/courses` ; les retours de refus sont visibles au formateur. Le tableau de bord `/admin` présente les indicateurs PostgreSQL et les opérations à traiter, avec des liens vers la modération, les paiements et la configuration des moyens de paiement.

La migration `20261020140000_trainer_content_workflow` ajoute le texte des leçons et le motif de retour admin. La diffusion des médias utilise des URL de téléversement et de lecture signées de courte durée ; les ressources ne doivent jamais être rendues publiques ni copiées dans un dossier du frontend.

## Arbitrages métier déjà intégrés au cadrage

- Langues de l'interface : français et anglais.
- Accès aux formations : durée limitée et définie par formation/module.
- Commandes : expiration après 72 heures.
- Paiement initial : déclaration par l'apprenant puis rapprochement manuel par un administrateur habilité.
- Remboursement : processus manuel et audité.
- Titulaire des comptes de paiement : propriétaire, sous réserve de validation juridique/comptable avant production.
- Quiz : version simple prévue.
- Flutter : après validation du Web.

## Prochaines étapes

1. Valider les décisions métier encore ouvertes (durée d'accès exacte, règles d'attestation, politique d'inscription gratuite).
2. Ajouter la récupération du compte et surveiller les limitations de connexion.
3. Configurer et tester le bucket privé GCS et ses règles d'accès sur une préproduction ; renforcer l'accès aux salles live selon les besoins métier, puis ajouter les quiz.
4. Compléter les espaces formateur (quiz et suivi des apprenants).
5. Ajouter les contenus pédagogiques, quiz et règles de délivrance des attestations.
6. Exécuter les tests de sécurité, de restauration et de recette avant production.
99