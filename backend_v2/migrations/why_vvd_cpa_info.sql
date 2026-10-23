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
ALTER TABLE vvd_info_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vvd_info_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vvd_info_versions, vvd_info_state FROM PUBLIC, anon, authenticated;

-- Initial content is published only on first installation; later publications are preserved.
WITH initial AS (
 INSERT INTO vvd_info_versions(content) SELECT '[{"id":"default-1","kind":"section","title":"Кто мы?","description":"О платформе VVD CPA","body":"VVD CPA — партнёрская платформа для работы с офферами, переходами и конверсиями. В личном кабинете доступны инструменты для партнёров и статистика.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-2","kind":"section","title":"Почему выбирают VVD CPA?","description":"Инструменты для партнёров","body":"В кабинете доступны персональные партнёрские ссылки, статистика кликов и конверсий, информация по офферам и связь с поддержкой.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-3","kind":"section","title":"Выплаты партнёрам","description":"Условия и статус выплат","body":"Доступные суммы и статусы отображаются в разделе «Ваш баланс». Условия конкретных выплат уточняйте в личном кабинете и у поддержки. Размеры и сроки выплат зависят от подтверждения конверсий и действующих условий.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-4","kind":"section","title":"Как начать работу?","description":"Первые шаги","body":"Откройте доступные офферы, ознакомьтесь с условиями, получите персональную ссылку и отслеживайте результаты в статистике.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-5","kind":"section","title":"Часто задаваемые вопросы","description":"Ответы на основные вопросы","body":"Где смотреть статистику? В разделе «Статистика».\\nГде найти ссылки? В карточках доступных офферов.\\nКак связаться с командой? Через раздел поддержки.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-6","kind":"section","title":"Правила сотрудничества","description":"Ответственная работа с офферами","body":"Соблюдайте правила выбранной партнёрской программы, требования к источникам трафика и применимое законодательство. Не используйте недостоверные данные или запрещённые методы продвижения.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true},{"id":"default-7","kind":"section","title":"Поддержка и сообщество","description":"Мы на связи","body":"Для вопросов по работе платформы используйте поддержку в приложении. В разделе «Движ» можно следить за жизнью сообщества VVD CPA.","quote":"","icon":"info","image_url":"","button_text":"","button_url":"","visible":true}]'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM vvd_info_versions)
 RETURNING id
)
UPDATE vvd_info_state SET published_version_id=(SELECT id FROM initial)
WHERE id=1 AND published_version_id IS NULL AND EXISTS (SELECT 1 FROM initial);
