-- Migration: API Settings and AI Usage Logging for Admin
-- Create api_settings table
create table if not exists public.api_settings (
    key text primary key default 'current',
    provider text not null default 'gemini', -- 'gemini' or 'openai'
    endpoint text, -- Custom URL for OpenAI compatible endpoints
    model text not null default 'gemini-2.5-flash',
    api_key text not null,
    updated_at timestamptz not null default now()
);

-- Create ai_usage_logs table
create table if not exists public.ai_usage_logs (
    id uuid primary key default gen_random_uuid(),
    username text not null,
    prompt_tokens integer not null default 0,
    completion_tokens integer not null default 0,
    model text not null,
    cost_usd numeric(10, 6) not null default 0.000000,
    created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.api_settings enable row level security;
alter table public.ai_usage_logs enable row level security;

-- Drop existing policies if any
drop policy if exists "Admins can manage api_settings" on public.api_settings;
drop policy if exists "Admins can view ai_usage_logs" on public.ai_usage_logs;

-- Policies for api_settings (Only Admin can manage)
create policy "Admins can manage api_settings"
    on public.api_settings
    for all
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- Policies for ai_usage_logs (Only Admin can view)
create policy "Admins can view ai_usage_logs"
    on public.ai_usage_logs
    for select
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
