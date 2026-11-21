// WhyMessenger 2.0 – Firebase Auth + Firestore + Storage (SDK 10.12.2, ES modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ====== KEEP YOUR OWN FIREBASE CONFIG HERE (paste the values you used before) ====== */
const firebaseConfig = {
  apiKey: "AIzaSyD8P-_gTrehhOHM19IDbJui6_iY6Gmurg8",
  authDomain: "whymessenger.firebaseapp.com",
  projectId: "whymessenger",
  storageBucket: "whymessenger.firebasestorage.app",
  messagingSenderId: "1040150885290",
  appId: "1:1040150885290:web:79b88e44487e1fdf6ef1d3",
  measurementId: "G-9908FN1792"
};
/* =================================================================================== */

const app = initializeApp(firebaseConfig);          // initialised once
const auth = getAuth(app), db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(("authScreen appScreen loading tabLogin tabRegister authForm nameField nameInput emailInput passwordInput authError authSubmit " +
  "meBtn meAvatar meName logoutBtn userSearch clearSearch resultsSection resultsList resultsNote recentList recentEmpty emptyState chatPanel backBtn " +
  "peerAvatar peerName peerEmail messages chatError msgForm msgInput sendBtn navHome navSearch navSettings profileDialog pAvatar pEmojis pColors " +
  "pName pEmail pError pSave pCancel").split(" ").map((i) => [i, $(i)]));

let mode = "login", me = null, myProfile = null, peer = null, busyAuth = false, sending = false;
let unsubChats = null, unsubMessages = null, selectToken = 0;
let chats = [], peerCache = new Map(), searchTimer = null, searchSeq = 0;

const show = (n, on) => n.classList.toggle("hidden", !on);
const initial = (s) => (s || "?").trim().charAt(0).toUpperCase() || "?";
const chatIdFor = (a, b) => [a, b].sort().join("_");
const HUES = [[239,262],[262,292],[199,239],[320,262],[168,217],[18,330]];

const GRADS = HUES.map((g) => `linear-gradient(135deg,hsl(${g[0]} 85% 62%),hsl(${g[1]} 80% 56%))`);
// Avatar: chosen emoji (or initial) on a chosen colour
function paint(node, p) {
  let h = 0; for (const c of p.uid || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = Number.isInteger(p.avatarColor) && p.avatarColor >= 0 && p.avatarColor < GRADS.length ? p.avatarColor : h % GRADS.length;
  node.style.background = GRADS[i]; node.replaceChildren();
  node.textContent = p.avatarEmoji || initial(p.displayName);
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate(), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function friendlyError(err) {
  const map = {
    "auth/invalid-email": "That email address is not valid.",
    "auth/missing-password": "Enter your password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Log in instead.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found for this email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase Console.",
    "permission-denied": "Permission denied by Firestore security rules. Publish the updated firestore.rules."
  };
  return map[err.code] || err.message || "Something went wrong. Please try again.";
}

// ---------- Auth UI ----------
function setMode(next) {
  mode = next;
  el.tabLogin.classList.toggle("active", mode === "login");
  el.tabRegister.classList.toggle("active", mode === "register");
  show(el.nameField, mode === "register");
  el.authSubmit.textContent = mode === "login" ? "Log in" : "Create account";
  el.authError.textContent = "";
}
el.tabLogin.onclick = () => setMode("login");
el.tabRegister.onclick = () => setMode("register");

el.authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busyAuth) return;
  const name = el.nameInput.value.trim(), email = el.emailInput.value.trim(), password = el.passwordInput.value;
  el.authError.textContent = "";
  if (!email || !password) { el.authError.textContent = "Enter your email and password."; return; }
  if (mode === "register" && !name) { el.authError.textContent = "Enter your full name."; return; }
  busyAuth = true; el.authSubmit.disabled = true;
  try {
    if (mode === "register") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      const p = { uid: cred.user.uid, displayName: name, email };
      await setDoc(doc(db, "users", cred.user.uid), { ...p, createdAt: serverTimestamp() });
      myProfile = p; renderMe();
    } else await signInWithEmailAndPassword(auth, email, password);
    el.authForm.reset();
  } catch (err) { console.error(err); el.authError.textContent = friendlyError(err); }
  finally { busyAuth = false; el.authSubmit.disabled = false; }
});

function renderMe() {
  if (!myProfile) return;
  el.meName.textContent = myProfile.displayName || "You";
  paint(el.meAvatar, myProfile);
}

// Create profile if missing; backfill search fields / photoURL on existing profiles
async function ensureProfile(user) {
  if (busyAuth && mode === "register") return;     // registration writes its own profile
  try {
    const r = doc(db, "users", user.uid), s = await getDoc(r);
    if (s.exists()) myProfile = { ...s.data(), uid: user.uid };
    else {
      const p = { uid: user.uid, displayName: user.displayName || (user.email || "").split("@")[0], email: user.email };
      await setDoc(r, { ...p, createdAt: serverTimestamp() }); myProfile = p;
    }
    renderMe();
  } catch (err) { console.error("Profile sync failed:", err); }
}

onAuthStateChanged(auth, (user) => {
  el.loading.classList.add("off");
  clearConversation();
  if (unsubChats) { unsubChats(); unsubChats = null; }
  chats = []; peerCache = new Map(); clearSearch();
  me = user;
  if (user) {
    myProfile = { uid: user.uid, displayName: user.displayName || user.email };
    renderMe(); renderRecent();
    show(el.authScreen, false); show(el.appScreen, true);
    ensureProfile(user); listenChats();
  } else {
    myProfile = null; show(el.appScreen, false); show(el.authScreen, true); setMode("login");
  }
});

// ---------- Cards ----------
function card(u, sub, time, onClick) {
  const li = document.createElement("li");
  li.className = "user-item" + (peer && peer.uid === u.uid ? " active" : ""); li.dataset.uid = u.uid;
  const av = document.createElement("div"); av.className = "avatar"; paint(av, u);
  const meta = document.createElement("div"); meta.className = "meta";
  const n = document.createElement("span"); n.textContent = u.displayName || "Unnamed";
  const s = document.createElement("span"); s.textContent = sub;
  meta.append(n, s); li.append(av, meta);
  if (time) { const t = document.createElement("small"); t.textContent = time; li.append(t); }
  li.onclick = onClick; return li;
}
const markActive = () => document.querySelectorAll(".user-item").forEach((li) => li.classList.toggle("active", !!peer && li.dataset.uid === peer.uid));

// ---------- Search-first discovery ----------
function clearSearch() {
  clearTimeout(searchTimer); searchSeq++;
  el.userSearch.value = ""; show(el.clearSearch, false); show(el.resultsSection, false); el.resultsList.replaceChildren();
}
el.clearSearch.onclick = () => { clearSearch(); el.userSearch.focus(); };
el.userSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const raw = el.userSearch.value, t = raw.trim().toLowerCase();
  show(el.clearSearch, raw.length > 0);
  if (t.length < 2) { searchSeq++; show(el.resultsSection, raw.length > 0); el.resultsList.replaceChildren();
    el.resultsNote.textContent = raw.length ? "Type at least 2 characters to search." : ""; return; }
  show(el.resultsSection, true); el.resultsNote.textContent = "Searching…";
  searchTimer = setTimeout(() => runSearch(t), 300);       // debounce
});

async function runSearch(t) {
  const seq = ++searchSeq;
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(300)));
    if (seq !== searchSeq || !me) return;
    const found = snap.docs.map((d) => ({ ...d.data(), uid: d.id }))
      .filter((u) => u.uid !== me.uid && ((u.displayName || "").toLowerCase().includes(t) || (u.email || "").toLowerCase().includes(t)))
      .slice(0, 15);
    el.resultsList.replaceChildren();
    found.forEach((u) => el.resultsList.appendChild(card(u, u.email || "", "", () => selectUser(u))));
    el.resultsNote.textContent = found.length ? "" : `No people found for “${el.userSearch.value.trim()}”.`;
  } catch (err) { console.error(err); if (seq === searchSeq) el.resultsNote.textContent = "Search failed: " + friendlyError(err); }
}

// ---------- Recent conversations ----------
function listenChats() {
  const uid = me.uid;
  unsubChats = onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", uid)), async (snap) => {
    chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ids = chats.map((c) => c.participants.find((x) => x !== uid)).filter((x) => x && !peerCache.has(x));
    await Promise.all(ids.map(async (id) => { try { const s = await getDoc(doc(db, "users", id)); if (s.exists()) peerCache.set(id, { ...s.data(), uid: id }); } catch (e) { console.error(e); } }));
    if (me && me.uid === uid) renderRecent();
  }, (err) => { console.error("Chats listener error:", err); el.recentEmpty.textContent = "Couldn't load conversations: " + friendlyError(err); show(el.recentEmpty, true); });
}

function renderRecent() {
  el.recentList.replaceChildren();
  const stamp = (c) => (c.lastAt || c.createdAt)?.toMillis?.() || 0;
  chats.sort((a, b) => stamp(b) - stamp(a)).forEach((c) => {
    const pid = c.participants.find((x) => x !== me.uid);
    const u = peerCache.get(pid) || { uid: pid, displayName: "Unknown user", email: "" };
    const preview = c.lastMessage ? (c.lastSenderId === me.uid ? "You: " : "") + c.lastMessage : "No messages yet";
    el.recentList.appendChild(card(u, preview, fmtTime(c.lastAt), () => selectUser(u)));
  });
  el.recentEmpty.textContent = "No conversations yet. Search for someone above to say hello.";
  show(el.recentEmpty, el.recentList.children.length === 0);
}

// ---------- Conversation ----------
function clearConversation() {
  selectToken++;
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  peer = null; el.messages.replaceChildren(); el.chatError.textContent = "";
  show(el.chatPanel, false); show(el.emptyState, true);
  el.appScreen.classList.remove("in-chat"); markActive();
}
function setNote(text) {
  el.messages.replaceChildren();
  const p = document.createElement("p"); p.className = "note"; p.textContent = text; el.messages.appendChild(p);
}

async function selectUser(user) {
  if (!me) return;
  const token = ++selectToken;
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  peer = user; el.chatError.textContent = "";
  el.peerName.textContent = user.displayName || "Unnamed"; el.peerEmail.textContent = user.email || "";
  paint(el.peerAvatar, user);
  show(el.emptyState, false); show(el.chatPanel, true);
  el.appScreen.classList.add("in-chat"); markActive(); setNote("Loading messages…");
  const chatId = chatIdFor(me.uid, user.uid);
  try {
    const chatRef = doc(db, "chats", chatId);
    if (!(await getDoc(chatRef)).exists())      // chat is created only now, after explicit selection
      await setDoc(chatRef, { participants: [me.uid, user.uid].sort(), createdAt: serverTimestamp() });
  } catch (err) { console.error(err); if (token === selectToken) { setNote(""); el.chatError.textContent = friendlyError(err); } return; }
  if (token !== selectToken) return;
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(100));
  unsubMessages = onSnapshot(q, (snap) => {
    if (token === selectToken) renderMessages(snap.docs.map((d) => d.data({ serverTimestamps: "estimate" })).reverse());
  }, (err) => { console.error(err); if (token === selectToken) el.chatError.textContent = friendlyError(err); });
  el.msgInput.focus();
}

function dayLabel(d) {
  const t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}
function renderMessages(list) {
  el.messages.replaceChildren();
  if (!list.length) { setNote("No messages yet. Say hello!"); return; }
  let lastDay = "", lastSender = null;
  list.forEach((m) => {
    const d = m.createdAt ? m.createdAt.toDate() : new Date();
    if (d.toDateString() !== lastDay) {
      const s = document.createElement("div"); s.className = "day"; s.textContent = dayLabel(d);
      el.messages.appendChild(s); lastDay = d.toDateString(); lastSender = null;
    }
    const div = document.createElement("div");
    div.className = "msg " + (m.senderId === me.uid ? "sent" : "received") + (m.senderId === lastSender ? " cont" : "");
    const text = document.createElement("span"); text.textContent = m.text;        // XSS-safe
    const time = document.createElement("small"); time.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    div.append(text, time); el.messages.appendChild(div); lastSender = m.senderId;
  });
  el.messages.scrollTop = el.messages.scrollHeight;
}

el.msgForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.msgInput.value.trim();
  if (!text || sending || !me || !peer) return;
  sending = true; el.sendBtn.disabled = true; el.chatError.textContent = ""; el.msgInput.value = "";
  const chatId = chatIdFor(me.uid, peer.uid);
  try {
    // 1) send the message (this alone must succeed)
    await addDoc(collection(db, "chats", chatId, "messages"), { text, senderId: me.uid, createdAt: serverTimestamp() });
    // 2) update the "Recent conversations" preview; failure here must not block messaging
    updateDoc(doc(db, "chats", chatId), { lastMessage: text.slice(0, 200), lastSenderId: me.uid, lastAt: serverTimestamp() })
      .catch((e) => console.warn("Chat preview not updated (publish the latest firestore.rules):", e.code));
  } catch (err) { console.error(err); el.msgInput.value = text; el.chatError.textContent = "Message not sent: " + friendlyError(err); }
  finally { sending = false; el.sendBtn.disabled = false; el.msgInput.focus(); }
});
el.backBtn.onclick = () => el.appScreen.classList.remove("in-chat");
el.logoutBtn.onclick = async () => { try { clearConversation(); await signOut(auth); } catch (err) { alert("Logout failed: " + friendlyError(err)); } };

// ---------- Navigation rail ----------
const setNav = (btn) => [el.navHome, el.navSearch].forEach((b) => b.classList.toggle("active", b === btn));
el.navHome.onclick = () => { setNav(el.navHome); clearSearch(); el.appScreen.classList.remove("in-chat"); };
el.navSearch.onclick = () => { setNav(el.navSearch); el.appScreen.classList.remove("in-chat"); el.userSearch.focus(); };
el.navSettings.onclick = el.meBtn.onclick = () => openProfile();

// ---------- Profile dialog (emoji + colour avatar) ----------
const EMOJIS = ["😀","😎","🦊","🐼","🐱","🐶","🦁","🐸","🚀","🎧","🔥","🌙","⚡","🍕","🎮","🌈","🦄"];
let draft = null;

function previewDraft() {
  paint(el.pAvatar, { ...myProfile, displayName: el.pName.value.trim() || myProfile.displayName, avatarEmoji: draft.emoji, avatarColor: draft.color });
  el.pEmojis.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.v === draft.emoji));
  el.pColors.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", Number(b.dataset.v) === draft.color));
}
function buildPickers() {
  el.pEmojis.replaceChildren(); el.pColors.replaceChildren();
  ["", ...EMOJIS].forEach((em) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.v = em; b.textContent = em || "Aa";
    b.title = em ? "Use this emoji" : "Use my initial"; b.onclick = () => { draft.emoji = em; previewDraft(); }; el.pEmojis.appendChild(b);
  });
  GRADS.forEach((g, i) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.v = i; b.style.background = g;
    b.setAttribute("aria-label", "Colour " + (i + 1)); b.onclick = () => { draft.color = i; previewDraft(); }; el.pColors.appendChild(b);
  });
}
function openProfile() {
  if (!myProfile) return;
  draft = { emoji: myProfile.avatarEmoji || "", color: Number.isInteger(myProfile.avatarColor) ? myProfile.avatarColor : null };
  el.pName.value = myProfile.displayName || ""; el.pEmail.value = (me && me.email) || myProfile.email || ""; el.pError.textContent = "";
  buildPickers(); previewDraft(); el.profileDialog.showModal();
}
el.pName.addEventListener("input", () => draft && previewDraft());
el.pCancel.onclick = () => el.profileDialog.close();
el.pSave.onclick = async () => {
  const name = el.pName.value.trim();
  if (!name) { el.pError.textContent = "Display name can't be empty."; return; }
  el.pSave.disabled = true; el.pError.textContent = "";
  try {
    const upd = { displayName: name, avatarEmoji: draft.emoji };
    if (draft.color !== null) upd.avatarColor = draft.color;
    await updateDoc(doc(db, "users", me.uid), upd);
    await updateProfile(me, { displayName: name });
    myProfile = { ...myProfile, ...upd }; renderMe(); el.profileDialog.close();
  } catch (err) { console.error(err); el.pError.textContent = friendlyError(err); }
  finally { el.pSave.disabled = false; }
};
