CREATE TABLE "AppUser" (
    "id" SERIAL NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppUser_authUserId_key" ON "AppUser"("authUserId");
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
