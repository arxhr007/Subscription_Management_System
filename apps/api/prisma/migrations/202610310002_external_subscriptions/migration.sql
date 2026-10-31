CREATE TABLE "brightloop"."ExternalSubscription" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "amount" INTEGER NOT NULL, "interval" TEXT NOT NULL, "nextRenewal" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE', "managementUrl" TEXT NOT NULL DEFAULT '',
 "notes" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ExternalSubscription_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ExternalSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "brightloop"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExternalSubscription_userId_status_nextRenewal_idx" ON "brightloop"."ExternalSubscription"("userId", "status", "nextRenewal");
