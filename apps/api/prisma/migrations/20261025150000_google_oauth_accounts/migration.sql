CREATE TABLE "GoogleAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX "GoogleAccount_googleAccountId_key" ON "GoogleAccount"("googleAccountId");
CREATE INDEX "GoogleAccount_userId_idx" ON "GoogleAccount"("userId");

ALTER TABLE "GoogleAccount"
ADD CONSTRAINT "GoogleAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
