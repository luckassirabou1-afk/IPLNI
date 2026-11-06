-- Store administrator feedback and trainer-authored text lesson content.
ALTER TABLE "Course" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "contentText" TEXT;
