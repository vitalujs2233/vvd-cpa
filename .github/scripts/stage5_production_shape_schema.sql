-- ONLY production structural metadata; no real rows, identifiers, wallets, secrets or credentials.
-- Source: public core table pg_catalog metadata, 2026-10-17.
-- CI PostgreSQL 17 production-shaped subset; non-core auth/storage tables not cloned.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SEQUENCE public."clicks_id_seq";
CREATE SEQUENCE public."withdrawals_id_seq";
CREATE TABLE public."users" (
  "telegram_id" bigint NOT NULL,
  "first_name" character varying(255) NOT NULL,
  "last_name" character varying(255),
  "username" character varying(255),
  "email" character varying(255),
  "photo_url" text,
  "balance" numeric(12,2) DEFAULT 0.00 NOT NULL,
  "hold" numeric(12,2) DEFAULT 0.00 NOT NULL,
  "withdrawn" numeric(12,2) DEFAULT 0.00 NOT NULL,
  "role" character varying(50) DEFAULT 'user'::character varying NOT NULL,
  "status" character varying(50) DEFAULT 'active'::character varying NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "partner_code" character varying,
  "invited_by" bigint,
  "referral_balance" double precision DEFAULT 0,
  "referral_earned" double precision DEFAULT 0
);
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."withdrawals" (
  "id" bigint DEFAULT nextval('withdrawals_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "payment_method" character varying(50) NOT NULL,
  "wallet" text NOT NULL,
  "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp without time zone,
  "partner_code" character varying
);
ALTER TABLE public."withdrawals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."clicks" (
  "id" bigint DEFAULT nextval('clicks_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "partner_code" character varying(50) NOT NULL,
  "click_id" character varying(255) NOT NULL,
  "vertical" character varying(100) NOT NULL,
  "country_code" character varying(20),
  "country_name" character varying(255),
  "ip_address" character varying(255),
  "created_at" timestamp without time zone DEFAULT now(),
  "offer_id" character varying(80),
  "network_id" bigint,
  "smartlink_id" uuid
);
CREATE TABLE public."conversions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "click_id" character varying(255) NOT NULL,
  "user_id" bigint NOT NULL,
  "offer_id" character varying(100) NOT NULL,
  "payout_gross" numeric(12,4) NOT NULL,
  "payout_net" numeric(12,4) NOT NULL,
  "status" character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "processed_at" timestamp with time zone,
  "transaction_id" character varying,
  "network_id" bigint,
  "vertical_slug" character varying(80),
  "partner_code" character varying(60),
  "currency" character varying(3),
  "postback_source" character varying(20),
  "external_status" character varying(80),
  "is_test" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."conversions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."statistics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" bigint NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "conversions" integer DEFAULT 0 NOT NULL,
  "income" numeric(12,4) DEFAULT 0.0000 NOT NULL
);
ALTER TABLE public."statistics" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."country_statistics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" bigint NOT NULL,
  "country_code" text NOT NULL,
  "country_name" text NOT NULL,
  "date" date NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "conversions" integer DEFAULT 0 NOT NULL,
  "income" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tool_wallets" (
  "telegram_id" bigint NOT NULL,
  "available" numeric(14,2) DEFAULT 0 NOT NULL,
  "reserved" numeric(14,2) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'USD'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."tool_wallets" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."star_wallets" (
  "telegram_id" bigint NOT NULL,
  "stars" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."star_wallets" ENABLE ROW LEVEL SECURITY;
ALTER SEQUENCE public."clicks_id_seq" OWNED BY public."clicks"."id";
ALTER SEQUENCE public."withdrawals_id_seq" OWNED BY public."withdrawals"."id";
ALTER TABLE public."clicks" ADD CONSTRAINT "clicks_click_id_key" UNIQUE (click_id);
ALTER TABLE public."clicks" ADD CONSTRAINT "clicks_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversions" ADD CONSTRAINT "conversions_click_id_key" UNIQUE (click_id);
ALTER TABLE public."conversions" ADD CONSTRAINT "conversions_pkey" PRIMARY KEY (id);
ALTER TABLE public."country_statistics" ADD CONSTRAINT "country_statistics_pkey" PRIMARY KEY (id);
ALTER TABLE public."star_wallets" ADD CONSTRAINT "star_wallets_pkey" PRIMARY KEY (telegram_id);
ALTER TABLE public."statistics" ADD CONSTRAINT "statistics_pkey" PRIMARY KEY (id);
ALTER TABLE public."statistics" ADD CONSTRAINT "unique_user_date" UNIQUE (user_id, date);
ALTER TABLE public."tool_wallets" ADD CONSTRAINT "tool_wallets_pkey" PRIMARY KEY (telegram_id);
ALTER TABLE public."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);
ALTER TABLE public."users" ADD CONSTRAINT "users_partner_code_key" UNIQUE (partner_code);
ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (telegram_id);
ALTER TABLE public."withdrawals" ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversions" ADD CONSTRAINT "conversions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE;
ALTER TABLE public."star_wallets" ADD CONSTRAINT "star_wallets_telegram_id_fkey" FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE;
ALTER TABLE public."statistics" ADD CONSTRAINT "statistics_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE;
ALTER TABLE public."tool_wallets" ADD CONSTRAINT "tool_wallets_telegram_id_fkey" FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE;
ALTER TABLE public."conversions" ADD CONSTRAINT "ck_stage4_test_no_payout" CHECK (NOT is_test OR payout_gross = 0::numeric AND payout_net = 0::numeric AND status::text = 'pending'::text);
ALTER TABLE public."tool_wallets" ADD CONSTRAINT "tool_wallets_available_check" CHECK (available >= 0::numeric);
ALTER TABLE public."tool_wallets" ADD CONSTRAINT "tool_wallets_currency_check" CHECK (currency = 'USD'::text);
ALTER TABLE public."tool_wallets" ADD CONSTRAINT "tool_wallets_reserved_check" CHECK (reserved >= 0::numeric);
CREATE INDEX idx_clicks_click_id ON public.clicks USING btree (click_id);
CREATE INDEX idx_clicks_created_at ON public.clicks USING btree (created_at);
CREATE INDEX idx_clicks_network_id ON public.clicks USING btree (network_id);
CREATE INDEX idx_clicks_offer_id ON public.clicks USING btree (offer_id);
CREATE INDEX idx_clicks_user_id ON public.clicks USING btree (user_id);
CREATE INDEX idx_clicks_vertical ON public.clicks USING btree (vertical);
CREATE INDEX idx_conversions_network_id ON public.conversions USING btree (network_id);
CREATE INDEX idx_conversions_user_status ON public.conversions USING btree (user_id, status);
CREATE UNIQUE INDEX ux_stage4_network_transaction ON public.conversions USING btree (network_id, transaction_id) WHERE ((postback_source)::text = 'stage4'::text);
CREATE UNIQUE INDEX ux_stage4_single_test_offer ON public.conversions USING btree (offer_id) WHERE (is_test = true);
CREATE INDEX idx_country_statistics_country ON public.country_statistics USING btree (user_id, country_code);
CREATE INDEX idx_country_statistics_user_date ON public.country_statistics USING btree (user_id, date);
CREATE INDEX idx_country_statistics_user_id ON public.country_statistics USING btree (user_id);
CREATE INDEX idx_statistics_user_date ON public.statistics USING btree (user_id, date);
CREATE INDEX idx_withdrawals_partner_code ON public.withdrawals USING btree (partner_code);
CREATE INDEX idx_withdrawals_status ON public.withdrawals USING btree (status);
CREATE INDEX idx_withdrawals_user_id ON public.withdrawals USING btree (user_id);
-- Synthetic data only. PR22 will be applied to copy AFTER fixtures and before other migrations.
