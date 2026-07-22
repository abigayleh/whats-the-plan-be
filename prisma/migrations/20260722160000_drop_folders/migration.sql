-- Reverses add_folders (feature removed). ListPlacement and its position column stay,
-- so per-user list ordering keeps working; only the folder layer is dropped.
ALTER TABLE "ListPlacement" DROP CONSTRAINT "ListPlacement_folderId_fkey";
ALTER TABLE "ListPlacement" DROP COLUMN "folderId";
DROP TABLE "Folder";
