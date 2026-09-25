-- Add content_type column to studio_documents for note classification
ALTER TABLE studio_documents
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text';

COMMENT ON COLUMN studio_documents.content_type IS
  'Note content type: text, slides, infographic, mindmap, report, quiz, brief, image';
