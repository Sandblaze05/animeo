// Lightweight stub for client-side auth calls when using local SQLite storage.
export const createClient = () => {
  return {
    auth: {
      async getSession() {
        return { data: { session: null } };
      },
      onAuthStateChange(cb) {
        // Provide the same shape as Supabase: { data: { subscription } }
        const subscription = {
          unsubscribe() {},
        };
        // Return object matching `{ data: { subscription } }`
        const result = { data: { subscription } };
        // Optionally store callback but do not invoke automatically
        return result;
      },
      async signInWithPassword() {
        return { error: null };
      },
      async signUp() {
        return { error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
};
