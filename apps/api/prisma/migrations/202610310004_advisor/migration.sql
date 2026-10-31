-- AlterTable
ALTER TABLE "ExternalSubscription" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Other',
ADD COLUMN     "importance" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "usage" TEXT NOT NULL DEFAULT 'UNKNOWN',
ALTER COLUMN "nextRenewal" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AdvisorProfile" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "interests" TEXT[],
    "activities" TEXT NOT NULL DEFAULT '',
    "budget" INTEGER,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LifeActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,

    CONSTRAINT "LifeActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "activityId" TEXT,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "LifeActivity_userId_startDate_idx" ON "LifeActivity"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "LifeActivity_userId_sourceRef_key" ON "LifeActivity"("userId", "sourceRef");

-- CreateIndex
CREATE INDEX "SubscriptionIntent_userId_startDate_idx" ON "SubscriptionIntent"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorFeedback_userId_recommendationKey_key" ON "AdvisorFeedback"("userId", "recommendationKey");

-- AddForeignKey
ALTER TABLE "AdvisorProfile" ADD CONSTRAINT "AdvisorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeActivity" ADD CONSTRAINT "LifeActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionIntent" ADD CONSTRAINT "SubscriptionIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionIntent" ADD CONSTRAINT "SubscriptionIntent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ExternalSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionIntent" ADD CONSTRAINT "SubscriptionIntent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "LifeActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorFeedback" ADD CONSTRAINT "AdvisorFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

