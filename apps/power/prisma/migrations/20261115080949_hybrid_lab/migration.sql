-- CreateTable
CREATE TABLE "HybridScenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "sampleKey" TEXT,
    "name" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "inputVersion" INTEGER NOT NULL DEFAULT 1,
    "resultVersion" INTEGER,
    "results" JSONB,
    "series" JSONB,
    "decision" TEXT,
    "reviewStage" TEXT NOT NULL DEFAULT 'draft',
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HybridScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HybridReviewEvent" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "checklist" JSONB,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HybridReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HybridCombinationRun" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HybridCombinationRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HybridReviewEvent" ADD CONSTRAINT "HybridReviewEvent_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "HybridScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
