-- Create the match_documents function for vector similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  content text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    documents.created_at,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Create an improved search function with metadata filtering
CREATE OR REPLACE FUNCTION search_documents_with_filters(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 10,
  filter_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  id uuid,
  content text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    documents.created_at,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 
    1 - (documents.embedding <=> query_embedding) > match_threshold
    AND (
      filter_metadata = '{}'::jsonb 
      OR documents.metadata @> filter_metadata
    )
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Create a function to get document statistics
CREATE OR REPLACE FUNCTION get_document_stats()
RETURNS TABLE(
  total_documents bigint,
  unique_project_types bigint,
  unique_service_types bigint,
  latest_document timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) as total_documents,
    COUNT(DISTINCT metadata->>'project_type') as unique_project_types,
    COUNT(DISTINCT metadata->>'service_type') as unique_service_types,
    MAX(created_at) as latest_document
  FROM documents;
$$;

-- Create a function to find similar documents to an existing document
CREATE OR REPLACE FUNCTION find_similar_documents(
  document_id uuid,
  similarity_threshold float DEFAULT 0.8,
  limit_count int DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  WITH target_doc AS (
    SELECT embedding FROM documents WHERE id = document_id
  )
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> target_doc.embedding) AS similarity
  FROM documents d, target_doc
  WHERE 
    d.id != document_id
    AND 1 - (d.embedding <=> target_doc.embedding) > similarity_threshold
  ORDER BY d.embedding <=> target_doc.embedding
  LIMIT limit_count;
$$;
