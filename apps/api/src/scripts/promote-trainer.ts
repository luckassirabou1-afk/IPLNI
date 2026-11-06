import "dotenv/config";
import { RoleCode } from "@prisma/client";
import { prisma } from "../prisma.js";

async function main(): Promise<void> {
  const email = process.env.IPLNI_TRAINER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("Définissez IPLNI_TRAINER_EMAIL pour désigner un compte existant.");

  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email },
      select: { id: true, status: true, emailVerifiedAt: true }
    });
    if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      throw new Error(
        "Le compte indiqué doit exister, être actif et avoir une adresse e-mail vérifiée."
      );
    }

    const role = await transaction.role.upsert({
      where: { code: RoleCode.TRAINER },
      create: { code: RoleCode.TRAINER, label: "Formateur" },
      update: {},
      select: { id: true }
    });
    await transaction.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {}
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "TRAINER_ROLE_ASSIGNED",
        entityType: "User",
        entityId: user.id
      }
    });
  });

  console.info("Le rôle formateur a été attribué au compte demandé.");
}

main()
  .catch((error: unknown) => {
    console.error(
      "L’attribution du rôle formateur a échoué.",
      error instanceof Error ? error.message : "Erreur inconnue."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
