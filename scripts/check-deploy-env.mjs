import { loadEnv } from 'vite';

const config = loadEnv('production', process.cwd(), 'VITE_');
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_APP_URL'];
const missing = required.filter(name => {
  const value = config[name]?.trim();
  return !value || /YOUR[-_]/i.test(value);
});

if (missing.length) {
  console.error(`Deployment configuration is missing or uses placeholders: ${missing.join(', ')}`);
  process.exit(1);
}

if (config.VITE_SUPABASE_ANON_KEY.trim().startsWith('sb_secret_')) {
  console.error('VITE_SUPABASE_ANON_KEY must be a publishable/anon key, never a Supabase secret key.');
  process.exit(1);
}

for (const name of ['VITE_SUPABASE_URL', 'VITE_PUBLIC_APP_URL']) {
  let url;
  try {
    url = new URL(config[name]);
  } catch {
    console.error(`${name} must be a complete HTTPS URL.`);
    process.exit(1);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (name === 'VITE_PUBLIC_APP_URL' && url.pathname !== '/')) {
    console.error(`${name} must be an HTTPS origin without credentials, query, fragment or app path.`);
    process.exit(1);
  }
}

console.log('Deployment configuration present. Supabase connectivity still requires a live smoke test.');
