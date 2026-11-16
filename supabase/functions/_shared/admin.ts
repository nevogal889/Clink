// Supabase Auth admin and Storage calls made with the service role key (function secret only,
// ARCHITECTURE.md 8.5). Behind interfaces so tests can use fakes.

export interface AuthAdmin {
  deleteUser(userId: string): Promise<void>;
}

export interface StorageAdmin {
  remove(bucket: string, names: string[]): Promise<void>;
}

function headers(key: string): HeadersInit {
  return { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };
}

export function authAdminFromEnv(fetchFn: typeof fetch = fetch): AuthAdmin {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return {
    async deleteUser(userId) {
      const res = await fetchFn(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: headers(key),
      });
      await res.body?.cancel();
      // 404: already gone, which is what a retry wants.
      if (!res.ok && res.status !== 404) throw new Error(`auth_delete_${res.status}`);
    },
  };
}

export function storageAdminFromEnv(fetchFn: typeof fetch = fetch): StorageAdmin {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return {
    async remove(bucket, names) {
      // The Storage API deletes up to 1000 objects per call.
      for (let i = 0; i < names.length; i += 1000) {
        const res = await fetchFn(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
          method: 'DELETE',
          headers: headers(key),
          body: JSON.stringify({ prefixes: names.slice(i, i + 1000) }),
        });
        await res.body?.cancel();
        if (!res.ok) throw new Error(`storage_delete_${res.status}`);
      }
    },
  };
}
