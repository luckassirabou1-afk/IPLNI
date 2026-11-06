# Stockage privé des ressources de formation

L'API utilise Google Cloud Storage (GCS) pour stocker les ressources de cours. Les formateurs peuvent téléverser des PDF de 25 Mo maximum, des documents Word (`.doc`, `.docx`), des feuilles Excel (`.xls`, `.xlsx`) et des présentations PowerPoint (`.ppt`, `.pptx`) de 50 Mo maximum, ainsi que des vidéos MP4/WebM de 500 Mo maximum. Les navigateurs envoient les fichiers directement au bucket à l'aide d'une politique POST signée ; l'API ne met pas les gros fichiers en mémoire. Après contrôle, l'API copie le fichier vers une clé privée non réutilisable. Les apprenants reçoivent une URL de lecture signée valable six heures uniquement après vérification de leur inscription active ou de l'accès de présentation. Les PDF s'ouvrent dans le navigateur ; les documents Office sont téléchargés.

## Configuration du bucket

1. Créez un bucket GCS dans la région de l'API, activez l'accès uniforme au niveau du bucket et la prévention de l'accès public. Ne désactivez pas ces protections et n'accordez pas `allUsers`/`allAuthenticatedUsers`.
2. Configurez `COURSE_MEDIA_BUCKET` avec le nom du bucket dans l'environnement de l'API. N'ajoutez jamais de clé JSON ou de secret au dépôt.
3. Pour Render, créez un compte de service GCP avec les droits minimaux `roles/storage.objectAdmin` sur ce seul bucket et configurez `GCS_SERVICE_ACCOUNT_JSON` avec son JSON complet dans les secrets Render. L'API valide le type du compte de service avant de l'utiliser pour signer les politiques POST et les URL de lecture. En développement, utilisez Application Default Credentials avec un compte habilité à signer. N'exposez jamais de clé dans le navigateur.
4. Autorisez les origines exactes du frontend dans la configuration CORS du bucket. Exemple à adapter avant de l'appliquer :

```json
[
  {
    "origin": ["http://localhost:3000", "https://app.example.org"],
    "method": ["POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Remplacez `https://app.example.org` par l'origine Vercel de production réellement contrôlée. Appliquez la configuration avec `gcloud storage buckets update gs://NOM_DU_BUCKET --cors-file=cors.json`.

Les fichiers incomplets sont placés sous le préfixe `upload-staging/`. Une règle de cycle de vie GCS permet de supprimer les envois abandonnés :

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 1, "matchesPrefix": ["upload-staging/"] }
    }
  ]
}
```

Appliquez cette règle après avoir fusionné avec les règles de cycle de vie existantes ; ne remplacez pas une configuration de bucket utilisée par d'autres données.

## Recette

- Depuis l’espace administrateur, accordez le rôle formateur à un compte actif dont l’adresse e-mail est vérifiée. Le formateur peut ensuite créer un cours brouillon, des modules et leurs leçons.
- Depuis un compte formateur autorisé, créez un cours brouillon, un module, puis une leçon vidéo ou ressource documentaire. Téléversez une vidéo MP4/WebM, un PDF, un document Word, une feuille Excel ou une présentation PowerPoint, attendez la confirmation et soumettez le cours.
- Vérifiez que l'administration voit le type MIME réel du fichier et peut publier la formation.
- Inscrivez un compte apprenant de test, confirmez son accès, vérifiez que les ressources de chaque formation active apparaissent dans son tableau de bord, puis lisez la vidéo, ouvrez le PDF ou téléchargez le document Office.
- Vérifiez qu'un compte sans session et un compte sans inscription active ne peuvent pas obtenir une URL signée de lecture.
- Créez une leçon de session en direct, publiez la formation, puis planifiez une session. Un apprenant inscrit doit voir le calendrier dans son espace et pouvoir rejoindre dans la fenêtre d'ouverture, à partir de 15 minutes avant le début et jusqu'à la fin.
- Testez les limites de taille, les types refusés, les fichiers abandonnés et la configuration CORS sur le domaine de préproduction.

Les sessions live utilisent `meet.jit.si`. La vérification IPLNI protège l'obtention du lien de salle, mais ne rend pas la salle Jitsi elle-même privée : toute personne à qui un participant transmet son accès peut tenter de la rejoindre.
