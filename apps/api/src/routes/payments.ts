import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

router.get("/methods", async (_req, res) => {
  const methods = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      provider: true,
      displayName: true,
      accountHolderName: true,
      accountReference: true,
      instructions: true
    }
  });
  res.json({ methods });
});

export default router;
