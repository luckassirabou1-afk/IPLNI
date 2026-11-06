# Architecture technique IPLNI

## Décisions retenues
- Institut unique avec plusieurs apprenants, formateurs et administrateurs.
- Interface française et anglaise dès le MVP.
- Next.js + TypeScript pour le Web.
- Express + TypeScript pour l'API REST.
- PostgreSQL + Prisma.
- Paiement initial manuel : Orange Money, Moov Money et Coris Bank.
- Titulaire des comptes : propriétaire, sous réserve de validation juridique et comptable.
- Expiration des commandes après 72 heures.
- Accès pédagogique à durée limitée, configurable par formation ou module.
- Quiz simples.
- Remboursements manuels et audités.
- Flutter après validation du Web.

## Principes
- Monolithe modulaire, pas de microservices pour le MVP.
- L'API est l'unique source de vérité métier.
- Vérification des permissions côté serveur sur chaque ressource privée.
- Montants stockés en entiers XOF.
- Aucun paiement ne doit être confirmé par une simple capture d'écran.
- Le prix et la durée sont copiés dans la ligne de commande pour préserver l'historique.
