type Access = "public" | "session" | "learner" | "trainer" | "admin";
type Method = "get" | "post" | "patch";

type OperationDefinition = {
  method: Method;
  path: string;
  operationId: string;
  summary: string;
  access: Access;
  successStatus?: number;
};

const operations: OperationDefinition[] = [
  {
    method: "get",
    path: "/",
    operationId: "getApiInfo",
    summary: "Informations sur l’API",
    access: "public"
  },
  {
    method: "get",
    path: "/health",
    operationId: "getHealth",
    summary: "Vérifier la disponibilité de l’API",
    access: "public"
  },
  {
    method: "get",
    path: "/health/ready",
    operationId: "getReadiness",
    summary: "Vérifier la disponibilité de la base de données",
    access: "public"
  },
  {
    method: "get",
    path: "/openapi.json",
    operationId: "getOpenApiDocument",
    summary: "Récupérer la spécification OpenAPI",
    access: "public"
  },
  {
    method: "get",
    path: "/api/v1/auth/google",
    operationId: "startGoogleSignIn",
    summary: "Démarrer la connexion Google",
    access: "public",
    successStatus: 302
  },
  {
    method: "get",
    path: "/api/v1/auth/google/callback",
    operationId: "completeGoogleSignIn",
    summary: "Finaliser la connexion Google",
    access: "public",
    successStatus: 302
  },
  {
    method: "post",
    path: "/api/v1/auth/register",
    operationId: "register",
    summary: "Créer un compte apprenant",
    access: "public",
    successStatus: 202
  },
  {
    method: "post",
    path: "/api/v1/auth/login",
    operationId: "login",
    summary: "Ouvrir une session",
    access: "public"
  },
  {
    method: "post",
    path: "/api/v1/auth/verify-email",
    operationId: "verifyEmail",
    summary: "Vérifier une adresse e-mail",
    access: "public"
  },
  {
    method: "post",
    path: "/api/v1/auth/resend-verification",
    operationId: "resendVerification",
    summary: "Renvoyer le lien de vérification",
    access: "public"
  },
  {
    method: "post",
    path: "/api/v1/auth/logout",
    operationId: "logout",
    summary: "Fermer la session",
    access: "session"
  },
  {
    method: "get",
    path: "/api/v1/auth/me",
    operationId: "getCurrentUser",
    summary: "Récupérer le compte connecté",
    access: "session"
  },
  {
    method: "get",
    path: "/api/v1/courses",
    operationId: "listCourses",
    summary: "Lister les formations publiées",
    access: "public"
  },
  {
    method: "get",
    path: "/api/v1/courses/:slug",
    operationId: "getCourse",
    summary: "Consulter une formation publiée",
    access: "public"
  },
  {
    method: "get",
    path: "/api/v1/payments/methods",
    operationId: "listPaymentMethods",
    summary: "Lister les moyens de paiement actifs",
    access: "public"
  },
  {
    method: "get",
    path: "/api/v1/orders/mine",
    operationId: "listMyOrders",
    summary: "Lister les commandes de l’apprenant",
    access: "learner"
  },
  {
    method: "get",
    path: "/api/v1/orders/:reference",
    operationId: "getOrder",
    summary: "Consulter une commande",
    access: "learner"
  },
  {
    method: "post",
    path: "/api/v1/orders",
    operationId: "createOrder",
    summary: "Créer une commande de formation",
    access: "learner",
    successStatus: 201
  },
  {
    method: "post",
    path: "/api/v1/orders/:reference/payments",
    operationId: "submitPayment",
    summary: "Déclarer un paiement",
    access: "learner",
    successStatus: 201
  },
  {
    method: "get",
    path: "/api/v1/learner/dashboard",
    operationId: "getLearnerDashboard",
    summary: "Consulter le tableau de bord apprenant",
    access: "session"
  },
  {
    method: "get",
    path: "/api/v1/learner/courses/:courseId/lessons/:lessonId",
    operationId: "getLesson",
    summary: "Accéder à une leçon autorisée",
    access: "learner"
  },
  {
    method: "get",
    path: "/api/v1/learner/live-sessions/:sessionId",
    operationId: "getLiveSession",
    summary: "Accéder à une visioconférence autorisée",
    access: "session"
  },
  {
    method: "get",
    path: "/api/v1/trainer/dashboard",
    operationId: "getTrainerDashboard",
    summary: "Consulter le tableau de bord formateur",
    access: "trainer"
  },
  {
    method: "post",
    path: "/api/v1/trainer/courses",
    operationId: "createTrainerCourse",
    summary: "Créer un brouillon de formation",
    access: "trainer",
    successStatus: 201
  },
  {
    method: "post",
    path: "/api/v1/trainer/courses/:courseId/modules",
    operationId: "createModule",
    summary: "Ajouter un module à une formation",
    access: "trainer",
    successStatus: 201
  },
  {
    method: "post",
    path: "/api/v1/trainer/modules/:moduleId/lessons",
    operationId: "createLesson",
    summary: "Ajouter une leçon à un module",
    access: "trainer",
    successStatus: 201
  },
  {
    method: "patch",
    path: "/api/v1/trainer/lessons/:lessonId",
    operationId: "updateLesson",
    summary: "Modifier une leçon",
    access: "trainer"
  },
  {
    method: "post",
    path: "/api/v1/trainer/lessons/:lessonId/upload-policy",
    operationId: "createUploadPolicy",
    summary: "Obtenir une autorisation d’envoi de média",
    access: "trainer"
  },
  {
    method: "post",
    path: "/api/v1/trainer/lessons/:lessonId/complete-upload",
    operationId: "completeLessonUpload",
    summary: "Finaliser l’envoi d’un média",
    access: "trainer"
  },
  {
    method: "post",
    path: "/api/v1/trainer/courses/:courseId/live-sessions",
    operationId: "scheduleLiveSession",
    summary: "Planifier une visioconférence",
    access: "trainer",
    successStatus: 201
  },
  {
    method: "post",
    path: "/api/v1/trainer/courses/:courseId/submit",
    operationId: "submitCourseForReview",
    summary: "Soumettre une formation à la modération",
    access: "trainer"
  },
  {
    method: "get",
    path: "/api/v1/admin/dashboard",
    operationId: "getAdminDashboard",
    summary: "Consulter le tableau de bord administrateur",
    access: "admin"
  },
  {
    method: "get",
    path: "/api/v1/admin/trainers",
    operationId: "listTrainers",
    summary: "Lister les formateurs actifs",
    access: "admin"
  },
  {
    method: "post",
    path: "/api/v1/admin/trainers",
    operationId: "assignTrainerRole",
    summary: "Donner le rôle formateur à un compte actif",
    access: "admin",
    successStatus: 201
  },
  {
    method: "get",
    path: "/api/v1/admin/courses/submissions",
    operationId: "listCourseSubmissions",
    summary: "Lister les formations à modérer",
    access: "admin"
  },
  {
    method: "patch",
    path: "/api/v1/admin/courses/:courseId/review",
    operationId: "reviewCourse",
    summary: "Approuver ou refuser une formation",
    access: "admin"
  },
  {
    method: "get",
    path: "/api/v1/admin/payment-methods",
    operationId: "listAdminPaymentMethods",
    summary: "Lister les moyens de paiement configurés",
    access: "admin"
  },
  {
    method: "post",
    path: "/api/v1/admin/payment-methods",
    operationId: "createPaymentMethod",
    summary: "Créer un moyen de paiement",
    access: "admin",
    successStatus: 201
  },
  {
    method: "patch",
    path: "/api/v1/admin/payment-methods/:methodId",
    operationId: "updatePaymentMethod",
    summary: "Modifier un moyen de paiement",
    access: "admin"
  },
  {
    method: "get",
    path: "/api/v1/admin/payments",
    operationId: "listPayments",
    summary: "Lister les paiements à traiter",
    access: "admin"
  },
  {
    method: "patch",
    path: "/api/v1/admin/payments/:paymentId/review",
    operationId: "reviewPayment",
    summary: "Valider ou refuser un paiement",
    access: "admin"
  }
];

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function tagForPath(path: string): string {
  if (path === "/health" || path === "/health/ready" || path === "/" || path === "/openapi.json") {
    return "Santé";
  }
  if (path.startsWith("/api/v1/auth/")) return "Authentification";
  if (path.startsWith("/api/v1/admin/")) return "Administration";
  if (path.startsWith("/api/v1/trainer/")) return "Formateur";
  if (
    path.startsWith("/api/v1/learner/") ||
    path === "/api/v1/orders" ||
    path.startsWith("/api/v1/orders/")
  ) {
    return "Apprenant";
  }
  return "Catalogue";
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(([, name]) => ({
    in: "path",
    name,
    required: true,
    schema: { type: "string" }
  }));
}

function operation(definition: OperationDefinition) {
  const { access, path, operationId, summary, successStatus = 200 } = definition;
  const isRedirect = operationId === "startGoogleSignIn" || operationId === "completeGoogleSignIn";
  const secured = access !== "public";
  const parameters = pathParameters(openApiPath(path));

  return {
    operationId,
    summary,
    tags: [tagForPath(path)],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(secured ? { security: [{ sessionCookie: [] }] } : {}),
    ...(access === "learner" || access === "trainer" || access === "admin"
      ? { "x-required-role": access }
      : {}),
    responses: {
      [successStatus]: {
        description: isRedirect
          ? "Redirection vers la page ou le fournisseur concerné."
          : "Requête traitée avec succès."
      },
      ...(isRedirect
        ? {}
        : {
            "400": {
              description: "Requête invalide.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
            }
          }),
      ...(secured
        ? {
            "401": {
              description: "Authentification requise.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
            },
            "403": {
              description: "Droits insuffisants.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
            }
          }
        : {}),
      "500": {
        description: "Erreur interne.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
      }
    }
  };
}

const pathEntries: Array<[string, Record<string, ReturnType<typeof operation>>]> = [];

for (const definition of operations) {
  const path = openApiPath(definition.path);
  const entry = pathEntries.find(([entryPath]) => entryPath === path);
  if (entry) {
    entry[1][definition.method] = operation(definition);
  } else {
    pathEntries.push([path, { [definition.method]: operation(definition) }]);
  }
}

const paths = Object.fromEntries(pathEntries);

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "IPLNI API",
    version: "0.1.0",
    description:
      "Référence des routes REST IPLNI. Les sessions authentifiées utilisent le cookie HttpOnly iplni_session."
  },
  servers: [{ url: "/", description: "Serveur courant" }],
  tags: [
    { name: "Santé", description: "Disponibilité du service et documentation." },
    { name: "Authentification", description: "Comptes, sessions et connexion Google." },
    { name: "Catalogue", description: "Consultation publique des formations et paiements." },
    { name: "Apprenant", description: "Commandes, leçons et visioconférences accessibles." },
    { name: "Formateur", description: "Gestion des contenus et sessions de cours." },
    { name: "Administration", description: "Modération, paiements et configuration." }
  ],
  paths,
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "iplni_session"
      }
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" }
            }
          }
        }
      }
    }
  }
};
