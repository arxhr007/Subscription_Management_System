CREATE TABLE "brightloop"."GmailConnection" (
 "userId" TEXT NOT NULL, "email" TEXT NOT NULL, "accessToken" TEXT NOT NULL,
 "refreshToken" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
 "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("userId"),
 CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "brightloop"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
