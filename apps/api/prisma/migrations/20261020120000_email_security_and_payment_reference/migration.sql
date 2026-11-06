-- Fail with an actionable message rather than truncating or merging payment history.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Payment"
        WHERE "providerReference" IS NOT NULL
        GROUP BY "provider", "providerReference"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate payment provider references exist; reconcile them before applying this migration.';
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerReference_key" ON "Payment"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "Payment_status_submittedAt_idx" ON "Payment"("status", "submittedAt");

-- Fail explicitly if payment methods have duplicate operator/account pairs.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "PaymentMethod"
        GROUP BY "provider", "accountReference"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate payment methods exist for the same provider and account reference; reconcile them before applying this migration.';
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_provider_accountReference_key" ON "PaymentMethod"("provider", "accountReference");

-- Require existing accounts without a verified address to verify before their next login.
UPDATE "User"
SET "status" = 'PENDING'
WHERE "status" = 'ACTIVE' AND "emailVerifiedAt" IS NULL;
