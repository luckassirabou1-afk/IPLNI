# Parcours de paiement manuel

1. Seules les formations publiées en XOF sont présentées dans le catalogue.
2. Le backend lit le prix et la durée d'accès dans PostgreSQL ; le montant reçu du navigateur n'est jamais utilisé.
3. Il crée une commande avec une référence unique et une expiration à 72 heures.
4. L'apprenant paie directement via un moyen actif configuré par IPLNI. Les coordonnées affichées proviennent de `PaymentMethod` ; aucune coordonnée fictive n'est proposée.
5. L'apprenant soumet la référence de transaction et le moyen utilisé. Le montant déclaré est fixé côté serveur au montant de la commande.
6. Le paiement reste `SUBMITTED` jusqu'à vérification manuelle par un administrateur habilité.
7. Seule la confirmation administrative doit marquer le paiement confirmé, régler la commande et créer l'inscription. Le parcours apprenant ne peut pas confirmer un paiement ni ouvrir un cours.
8. En cas de refus, le motif doit être enregistré et l'apprenant informé. Une nouvelle référence peut être soumise sur une commande encore valide.
9. Les commandes expirées ne donnent pas accès aux contenus. Une transaction signalée tardivement doit être examinée manuellement.

Les routes du parcours sont `GET /api/v1/courses`, `POST /api/v1/orders`, `GET /api/v1/orders/:reference`, `GET /api/v1/payments/methods` et `POST /api/v1/orders/:reference/payments`. La gestion et la confirmation administrative sont à implémenter dans l'espace admin.

L'opérateur Orange Money et le nom du titulaire ont été confirmés par le propriétaire du projet. Le numéro et le nom sont fournis au script `db:configure-orange-money` via `ORANGE_MONEY_ACCOUNT_REFERENCE` et `ORANGE_MONEY_ACCOUNT_HOLDER_NAME`, jamais stockés dans les sources. Vérifier le compte et les coordonnées dans l'environnement de déploiement avant d'accepter les paiements.

Avant mise en production, configurer les variables SMTP et `AUTH_RATE_LIMIT_SECRET`, appliquer les migrations PostgreSQL avec la commande de déploiement adaptée, tester la délivrance d'e-mails (y compris indésirables et expirations) et utiliser HTTPS. Garder les coordonnées de paiement dans la base/configuration d'exploitation, pas dans les sources ou les journaux. Le rapprochement et l'activation des inscriptions nécessitent encore l'espace administrateur.

Une capture d'écran seule n'est pas une preuve suffisante. Aucun secret bancaire ou mobile money ne doit être stocké dans les journaux.
