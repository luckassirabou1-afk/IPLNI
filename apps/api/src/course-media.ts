import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { LessonType } from "@prisma/client";
import { z } from "zod";

const serviceAccountSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().email()
});
const uploadUrlDurationMs = 15 * 60 * 1000;
const downloadUrlDurationMs = 6 * 60 * 60 * 1000;

function createStorageClient(): Storage {
  const credentialsJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) return new Storage();

  let credentials: unknown;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("GCS_SERVICE_ACCOUNT_JSON doit contenir un JSON de compte de service valide.");
  }

  const parsedCredentials = serviceAccountSchema.safeParse(credentials);
  if (!parsedCredentials.success) {
    throw new Error("GCS_SERVICE_ACCOUNT_JSON ne contient pas un compte de service valide.");
  }
  return new Storage({ credentials: parsedCredentials.data });
}

const storage = createStorageClient();

export const courseMediaLimits = {
  pdf: 25 * 1024 * 1024,
  office: 50 * 1024 * 1024,
  spreadsheet: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024
} as const;

export class CourseMediaNotConfiguredError extends Error {
  constructor() {
    super("Le stockage privé des ressources n’est pas configuré.");
    this.name = "CourseMediaNotConfiguredError";
  }
}

export class CourseMediaObjectNotFoundError extends Error {
  constructor() {
    super("Le fichier n’a pas été reçu dans le stockage privé.");
    this.name = "CourseMediaObjectNotFoundError";
  }
}

export class InvalidCourseMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCourseMediaError";
  }
}

export type CourseMediaFile = {
  extension: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "mp4" | "webm";
  maxBytes: number;
};

const officeDocumentExtensions: Record<string, CourseMediaFile["extension"]> = {
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};

export function validateCourseMediaFile(
  lessonType: LessonType,
  mimeType: string,
  sizeBytes: number
): CourseMediaFile {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw new InvalidCourseMediaError("Le fichier sélectionné est vide ou trop volumineux.");
  }

  if (lessonType === LessonType.RESOURCE && mimeType === "application/pdf") {
    if (sizeBytes > courseMediaLimits.pdf) {
      throw new InvalidCourseMediaError("Un fichier PDF ne peut pas dépasser 25 Mo.");
    }
    return { extension: "pdf", maxBytes: courseMediaLimits.pdf };
  }

  const officeExtension = officeDocumentExtensions[mimeType];
  if (
    lessonType === LessonType.RESOURCE &&
    (officeExtension === "xls" || officeExtension === "xlsx")
  ) {
    if (sizeBytes > courseMediaLimits.spreadsheet) {
      throw new InvalidCourseMediaError("Un fichier Excel ne peut pas dépasser 50 Mo.");
    }
    return { extension: officeExtension, maxBytes: courseMediaLimits.spreadsheet };
  }

  if (lessonType === LessonType.RESOURCE && officeExtension) {
    if (sizeBytes > courseMediaLimits.office) {
      throw new InvalidCourseMediaError(
        "Un document Word ou PowerPoint ne peut pas dépasser 50 Mo."
      );
    }
    return { extension: officeExtension, maxBytes: courseMediaLimits.office };
  }

  if (lessonType === LessonType.VIDEO && (mimeType === "video/mp4" || mimeType === "video/webm")) {
    if (sizeBytes > courseMediaLimits.video) {
      throw new InvalidCourseMediaError("Une vidéo ne peut pas dépasser 500 Mo.");
    }
    return {
      extension: mimeType === "video/mp4" ? "mp4" : "webm",
      maxBytes: courseMediaLimits.video
    };
  }

  throw new InvalidCourseMediaError(
    lessonType === LessonType.VIDEO
      ? "Choisissez une vidéo MP4 ou WebM."
      : lessonType === LessonType.RESOURCE
        ? "Choisissez un document PDF, Word, Excel ou PowerPoint."
        : "Les fichiers sont réservés aux leçons vidéo et aux ressources documentaires."
  );
}

function configuredBucket() {
  const bucketName = process.env.COURSE_MEDIA_BUCKET?.trim();
  if (!bucketName) throw new CourseMediaNotConfiguredError();
  return storage.bucket(bucketName);
}

export async function createCourseMediaUploadPolicy(
  courseId: string,
  lessonId: string,
  file: CourseMediaFile,
  mimeType: string
): Promise<{ storageKey: string; url: string; fields: Record<string, string> }> {
  const storageKey = `upload-staging/${courseId}/${lessonId}/${randomUUID()}.${file.extension}`;
  const [policy] = await configuredBucket()
    .file(storageKey)
    .generateSignedPostPolicyV4({
      expires: Date.now() + uploadUrlDurationMs,
      fields: {
        "Content-Type": mimeType,
        success_action_status: "201"
      },
      conditions: [
        ["content-length-range", 1, file.maxBytes],
        ["eq", "$Content-Type", mimeType]
      ]
    });
  return { storageKey, url: policy.url, fields: policy.fields };
}

function objectMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 404;
}

export async function getUploadedCourseMediaMetadata(storageKey: string): Promise<{
  mimeType: string;
  sizeBytes: number;
  generation: string;
}> {
  let metadata;
  try {
    [metadata] = await configuredBucket().file(storageKey).getMetadata();
  } catch (error) {
    if (objectMissing(error)) throw new CourseMediaObjectNotFoundError();
    throw error;
  }

  const mimeType = metadata.contentType;
  const sizeBytes = Number(metadata.size);
  const generation = String(metadata.generation ?? "");
  if (
    !mimeType ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    !/^[1-9]\d*$/.test(generation)
  ) {
    throw new InvalidCourseMediaError("Les métadonnées du fichier téléversé sont invalides.");
  }
  return { mimeType, sizeBytes, generation };
}

export async function promoteCourseMediaUpload(
  stagingKey: string,
  courseId: string,
  lessonId: string,
  file: CourseMediaFile,
  mimeType: string,
  generation: string
): Promise<string> {
  const bucket = configuredBucket();
  const storageKey = `courses/${courseId}/${lessonId}/${randomUUID()}.${file.extension}`;
  const source = bucket.file(stagingKey, { generation });
  const destination = bucket.file(storageKey);
  await source.copy(destination, {
    contentType: mimeType,
    preconditionOpts: { ifGenerationMatch: 0 }
  });
  await deleteCourseMediaObject(stagingKey);
  return storageKey;
}

export async function createCourseMediaReadUrl(
  storageKey: string,
  mimeType: string,
  originalName: string
): Promise<string> {
  const disposition = mimeType === "application/pdf" ? "inline" : "attachment";
  const encodedFileName = encodeURIComponent(originalName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const [url] = await configuredBucket()
    .file(storageKey)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + downloadUrlDurationMs,
      version: "v4",
      responseType: mimeType,
      responseDisposition: `${disposition}; filename*=UTF-8''${encodedFileName}`
    });
  return url;
}

export async function deleteCourseMediaObject(storageKey: string): Promise<void> {
  try {
    await configuredBucket().file(storageKey).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error(
      "IPLNI course media cleanup failed",
      error instanceof Error ? error.message : "Unknown Google Cloud Storage error"
    );
  }
}
