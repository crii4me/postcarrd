-- Run this in your Supabase project:
-- Go to supabase.com → your project → SQL Editor → paste this → Run

-- 1. profiles table (stores each user's email + name so we can find them by email)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  created_at timestamptz default now()
);

-- auto-create a profile whenever someone signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2. postcards table
create table if not exists postcards (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  recipient_id uuid references auth.users(id) on delete cascade,
  message text,
  photo_data text,       -- base64 image stored directly
  address text[],        -- array of address lines
  opened boolean default false,
  created_at timestamptz default now()
);

-- 3. Row Level Security: users can only see their own received cards
alter table postcards enable row level security;

create policy "recipients can read own cards"
  on postcards for select
  using (auth.uid() = recipient_id);

create policy "authenticated users can insert"
  on postcards for insert
  with check (auth.uid() = sender_id);

create policy "recipients can update own cards"
  on postcards for update
  using (auth.uid() = recipient_id);

-- 4. profiles: anyone logged in can read profiles (to look up by email)
alter table profiles enable row level security;

create policy "logged in users can read profiles"
  on profiles for select
  using (auth.role() = 'authenticated');
