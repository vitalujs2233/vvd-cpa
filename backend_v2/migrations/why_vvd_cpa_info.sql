-- Isolated information content; no existing tables modified.
CREATE TABLE IF NOT EXISTS vvd_info_versions (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 content JSONB NOT NULL DEFAULT '[]'::jsonb,
 created_by BIGINT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(content) = 'array')
);
CREATE TABLE IF NOT EXISTS vvd_info_state (
 id SMALLINT PRIMARY KEY CHECK (id=1),
 draft_version_id BIGINT REFERENCES vvd_info_versions(id),
 published_version_id BIGINT REFERENCES vvd_info_versions(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO vvd_info_state(id) VALUES (1) ON CONFLICT DO NOTHING;
REVOKE ALL ON vvd_info_versions, vvd_info_state FROM PUBLIC, anon, authenticated;
