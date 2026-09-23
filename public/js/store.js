// Camada de persistencia: Firestore (producao) ou memoria (testes/demo em localhost).
// Toda a colecao do sistema usa o prefixo rh_ para nao colidir com os outros apps do projeto Firebase.

const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));

export function firestoreStore(fb) {
  const db = fb.firestore();
  const ref = (col, id) => db.collection(col).doc(id);
  return {
    kind: 'firestore',
    async list(col) {
      const s = await db.collection(col).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async listWhere(col, field, val) {
      const s = await db.collection(col).where(field, '==', val).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async get(col, id) {
      const d = await ref(col, id).get();
      return d.exists ? { id: d.id, ...d.data() } : null;
    },
    async set(col, id, data, merge = false) { await ref(col, id).set(clean(data), { merge }); },
    async del(col, id) { await ref(col, id).delete(); },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = db.batch();
        for (const o of ops.slice(i, i + 400)) {
          if (o.op === 'del') b.delete(ref(o.col, o.id));
          else b.set(ref(o.col, o.id), clean(o.data), { merge: !!o.merge });
        }
        await b.commit();
      }
    },
  };
}

export function memoryStore(seed = {}) {
  const cols = new Map();
  const c = (n) => { if (!cols.has(n)) cols.set(n, new Map()); return cols.get(n); };
  for (const [n, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) c(n).set(id, clean(d));
  const out = (id, d) => ({ id, ...clean(d) });
  const api = {
    kind: 'memory',
    _cols: cols,
    async list(col) { return [...c(col)].map(([id, d]) => out(id, d)); },
    async listWhere(col, field, val) { return [...c(col)].filter(([, d]) => d[field] === val).map(([id, d]) => out(id, d)); },
    async get(col, id) { return c(col).has(id) ? out(id, c(col).get(id)) : null; },
    async set(col, id, data, merge = false) { c(col).set(id, merge ? { ...(c(col).get(id) || {}), ...clean(data) } : clean(data)); },
    async del(col, id) { c(col).delete(id); },
    async batch(ops) { for (const o of ops) { if (o.op === 'del') c(o.col).delete(o.id); else await api.set(o.col, o.id, o.data, !!o.merge); } },
  };
  return api;
}

// ---------- autenticacao ----------
export const idToEmail = (id) => `${String(id).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@rh.reidogado.app`;

export function firebaseAuth(fb) {
  const auth = fb.auth();
  return {
    async init() { try { await auth.setPersistence(fb.auth.Auth.Persistence.SESSION); } catch (e) { /* segue */ } },
    async signIn(id, pass) {
      try { const r = await auth.signInWithEmailAndPassword(idToEmail(id), pass); return { uid: r.user.uid, id: String(id).trim().toLowerCase() }; }
      catch (e) {
        const m = { 'auth/wrong-password': 'ID ou senha incorretos.', 'auth/user-not-found': 'ID ou senha incorretos.', 'auth/invalid-credential': 'ID ou senha incorretos.', 'auth/invalid-email': 'ID inválido.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', 'auth/network-request-failed': 'Sem conexão com a internet.', 'auth/user-disabled': 'Usuário desativado.' };
        throw new Error(m[e.code] || 'Não foi possível entrar (' + (e.code || e.message) + ').');
      }
    },
    signOut() { return auth.signOut(); },
    onChange(cb) { return auth.onAuthStateChanged((u) => cb(u ? { uid: u.uid, id: (u.email || '').split('@')[0] } : null)); },
    /** Cria um login novo SEM derrubar a sessao atual (usa uma segunda instancia do app). Devolve o uid. */
    async createUser(id, pass) {
      const app2 = fb.apps.find((a) => a.name === 'cadastro') || fb.initializeApp(fb.app().options, 'cadastro');
      const a2 = app2.auth();
      try { await a2.setPersistence(fb.auth.Auth.Persistence.NONE); } catch (e) { /* segue */ }
      try {
        const r = await a2.createUserWithEmailAndPassword(idToEmail(id), pass);
        const uid = r.user.uid; await a2.signOut(); return uid;
      } catch (e) {
        const m = { 'auth/email-already-in-use': 'Já existe um usuário com esse ID.', 'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.', 'auth/invalid-email': 'ID inválido (use letras, números, ponto ou traço).', 'auth/operation-not-allowed': 'Login por e-mail/senha desativado no Firebase (Authentication → Sign-in method).' };
        throw new Error(m[e.code] || 'Não foi possível criar o usuário (' + (e.code || e.message) + ').');
      }
    },
  };
}

export function memoryAuth() {
  let cb = () => {}, cur = null;
  const users = { admin: { pass: 'admin', uid: 'demo-admin' } };
  return {
    async init() {},
    async signIn(id, pass) { const u = users[String(id).trim().toLowerCase()]; if (u && u.pass === pass) { cur = { uid: u.uid, id: String(id).trim().toLowerCase() }; cb(cur); return cur; } throw new Error('ID ou senha incorretos.'); },
    async createUser(id, pass) { const k = String(id).trim().toLowerCase(); if (users[k]) throw new Error('Já existe um usuário com esse ID.'); if (String(pass).length < 6) throw new Error('Senha fraca: use pelo menos 6 caracteres.'); users[k] = { pass, uid: 'demo-' + k }; return users[k].uid; },
    async signOut() { cur = null; cb(null); },
    onChange(f) { cb = f; setTimeout(() => f(cur), 0); },
  };
}
