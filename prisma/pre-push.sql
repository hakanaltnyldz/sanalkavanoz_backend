-- `prisma db push` oncesi calisir. Mevcut veritabaninda yeni eklenen ve henuz
-- hep bos (NULL) olan alanlara benzersizlik kurali eklerken Prisma'nin
-- "veri kaybi olabilir" diyerek deploy'u durdurmasini onler.
-- Bos (ilk kurulum) veritabaninda hicbir sey yapmaz.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'User'
  ) THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
  END IF;
END $$;
