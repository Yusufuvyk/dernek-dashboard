import { useState, useEffect, useMemo, useRef } from "react";
import { db, auth } from "./firebase";
import marcusLogo from "./assets/marcus-logo.svg";
import {
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs, limit, where, getDoc
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const dayFromDateTime = dt => (dt ? String(dt).slice(0, 10) : today());
const fmtDate = d => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const fmtDateTime = d => d ? new Date(d).toLocaleString("tr-TR") : "—";
// Şu anki zamanı yerel saat dilimiyle datetime-local formatında döndürür
const nowLocalISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" }); };
const timeAgo = d => {
  if (!d) return "";
  const diff = Math.floor((Date.now() - new Date(d)) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff}dk önce`;
  if (diff < 1440) return `${Math.floor(diff / 60)}sa önce`;
  return fmtDate(d);
};

// Firebase hata kodlarını Türkçe mesaja çevirir
const firebaseErrTR = (e) => {
  const code = e?.code || "";
  if (code === "auth/email-already-in-use")    return "Bu e-posta adresi zaten kullanımda. Farklı bir e-posta deneyin.";
  if (code === "auth/invalid-email")            return "Geçersiz e-posta adresi. Lütfen geçerli bir e-posta girin.";
  if (code === "auth/weak-password")            return "Şifre çok zayıf. En az 6 karakter olmalıdır.";
  if (code === "auth/user-not-found")           return "Kullanıcı bulunamadı.";
  if (code === "auth/wrong-password")           return "Şifre hatalı.";
  if (code === "auth/too-many-requests")        return "Çok fazla deneme yapıldı. Lütfen bir süre bekleyin.";
  if (code === "auth/network-request-failed")  return "Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.";
  if (code === "auth/user-disabled")            return "Bu kullanıcı hesabı devre dışı bırakılmış.";
  if (code === "auth/requires-recent-login")    return "Bu işlem için tekrar giriş yapmanız gerekiyor.";
  if (code === "auth/invalid-credential")       return "Geçersiz e-posta veya şifre.";
  return e?.message || "Bilinmeyen bir hata oluştu.";
};

const normalizeRole = (role) => {
  const r = String(role || "").trim().toLowerCase();
  if (["admin", "başkan", "yonetici", "yönetici"].includes(r)) return "Başkan";
  return role;
};

// ─ Role helpers
const roleKey = (role) => String(role || "")
  .trim()
  .toLowerCase()
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ü/g, "u")
  .replace(/ş/g, "s")
  .replace(/ö/g, "o")
  .replace(/ç/g, "c");

// Level 0: Başkan + Teknik Yönetici (tam yetki)
// Level 1: Departman Yöneticisi (sadece kendi departmanı)
// Level 2: Departman Üyesi / Üye (okuma)
// Level 3: Denetmen (sadece denetim paneli)
const hasSuperRole = r => ["admin", "baskan", "teknik yoneticisi"].includes(roleKey(r));
const hasAdminRole = hasSuperRole; // backward-compat alias
const roleLevel = r => {
  const key = roleKey(r);
  if (["admin", "baskan", "teknik yoneticisi"].includes(key)) return 0;
  if (key === "departman yoneticisi") return 1;
  if (key === "denetmen") return 3;
  return 2; // Üye, Departman Üyesi
};
const isDenetmenRole = r => roleKey(r) === "denetmen";
const displayRole = r => {
  const key = roleKey(r);
  if (key === "teknik yoneticisi") return "Teknik Yönetici";
  if (hasSuperRole(r)) return "Başkan";
  if (key === "departman yoneticisi") return "Departman Yöneticisi";
  if (key === "denetmen") return "Denetmen";
  return "Departman Üyesi";
};

const openPrintableReport = ({ title, bodyHtml }) => {
  // Türkçe karakter desteği için Google Fonts ve UTF-8 meta eklendi.
  // @media screen body gizlenir → kullanıcı HTML görmez, direkt Yazdır/PDF diyaloğu açılır.
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap');
    *{box-sizing:border-box;}
    @media screen{body{visibility:hidden;overflow:hidden;margin:0;}}
    @media print{body{visibility:visible;}}
    body{font-family:'Noto Sans','Segoe UI',Arial,sans-serif;padding:28px 34px;font-size:13px;line-height:1.75;color:#1a1a18;max-width:900px;margin:0 auto;}
    h1{font-size:19px;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:18px;color:#151515;}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6a5610;margin:20px 0 8px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;word-break:break-word;}
    td,th{padding:6px 9px;border:1px solid #d9d3d1;vertical-align:top;word-break:break-word;overflow-wrap:break-word;}
    td:first-child{font-weight:700;background:#f7f3f2;width:160px;}
    thead td,th{background:#f7f3f2 !important;font-weight:700;}
    .box{border:1px solid #d9d3d1;border-radius:6px;padding:12px;min-height:60px;line-height:1.75;word-break:break-word;}
    ul,ol{margin:6px 0;padding-left:22px;}li{margin-bottom:2px;}
    @media print{body{padding:12px;}@page{margin:1.2cm;}}
  `;
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
${bodyHtml}
<script>
  window.onload = function() {
    window.focus();
    window.print();
    setTimeout(function(){ window.close(); }, 800);
  };
<\/script>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", "width=900,height=700,noopener");
  if (!popup) {
    URL.revokeObjectURL(url);
    alert("Yazdır penceresi açılamadı. Lütfen tarayıcının popup engelleyicisini kapatın.");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
};

// ─── ICONS ───────────────────────────────────────────────────────────────────
const PATHS = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  tasks: "M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z",
  calendar: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  users: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  reports: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8v-2zm0-4h8v2H8v-2z",
  logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  inbox: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5v-3h3.56c.69 1.19 1.97 2 3.45 2s2.75-.81 3.45-2H19v3zm0-5h-4.99c0 1.1-.9 2-2.01 2s-2.01-.9-2.01-2H5V5h14v9z",
  file: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  tree: "M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
};
function Icon({ name, size = 18 }) {
  const d = PATHS[name];
  if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d={d} /></svg>;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#1F2937", "#374151", "#4B5563", "#6B7280", "#0F766E", "#8A6A16"];
const avatarColor = id => AVATAR_COLORS[(id?.charCodeAt(id.length - 1) || 0) % AVATAR_COLORS.length];
const ROMA_RED = "#8B0000";
const STOIC_NAVY = "#1B1D22";
const MARBLE = "#FFFFFF";
const GOLD = "#B98B2C";
const FONT_SERIF = "'Cinzel','Cormorant Garamond','Times New Roman',serif";

const S = {
  app: { display: "flex", height: "100vh", fontFamily: "'Manrope','DM Sans','Segoe UI',sans-serif", background: "#ECEDEF", color: "#171717", overflow: "hidden", padding: 10, boxSizing: "border-box" },
  sidebar: { width: 210, background: "#F6F7F8", border: "1px solid #DFE2E6", borderRadius: 14, display: "flex", flexDirection: "column", padding: "0 0 12px", flexShrink: 0, boxShadow: "0 1px 2px rgba(16,24,40,.04)" },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 },
  navItem: a => ({ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", color: a ? "#101828" : "#5D6673", background: a ? "#DDEBF8" : "transparent", border: a ? "1px solid #CFE2F5" : "1px solid transparent", fontSize: 12.5, fontWeight: a ? 700 : 600, userSelect: "none" }),
  navSection: { fontSize: 10, fontWeight: 700, color: "#98A2B3", textTransform: "uppercase", letterSpacing: 1, padding: "12px 10px 4px" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", marginLeft: 10, background: "#F3F4F6", border: "1px solid #DFE2E6", borderRadius: 18, boxShadow: "0 8px 24px rgba(16,24,40,.05)" },
  topbar: { background: "transparent", borderBottom: "1px solid #E3E6EA", padding: "0 22px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  content: { flex: 1, overflow: "auto", padding: "16px" },
  card: { background: "#FFFFFF", borderRadius: 12, padding: "16px 18px", border: "1px solid #E7E8EA", boxShadow: "0 1px 2px rgba(16,24,40,.04)" },
  cardTitle: { fontSize: 11, fontWeight: 800, color: "#2A2927", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.85 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 },
  stat: c => ({ background: "#FFFFFF", borderRadius: 14, padding: "16px 18px", color: "#191918", border: "1px solid #E5E5E5", boxShadow: "0 1px 0 rgba(0,0,0,.02)", borderTop: `3px solid ${c}` }),
  btn: (v = "primary") => {
    const b = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 650, cursor: "pointer", border: "none", whiteSpace: "nowrap", fontFamily: "inherit" };
    return v === "primary" ? { ...b, background: ROMA_RED, color: "#fff", border: "1px solid #580000" }
      : v === "ghost" ? { ...b, background: "#fff", color: STOIC_NAVY, border: "1px solid #d2d0cb" }
        : v === "green" ? { ...b, background: "#1F8F5F", color: "#fff" }
        : v === "blue" ? { ...b, background: STOIC_NAVY, color: "#fff", border: "1px solid #0f1013" }
            : v === "danger" ? { ...b, background: "#2B2B2B", color: "#fff" }
              : b;
  },
  label: { fontSize: 12, fontWeight: 650, color: "#4F4D49", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FFFFFF", fontFamily: "inherit" },
  select: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", background: "#FFFFFF", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", background: "#FFFFFF", minHeight: 72, fontFamily: "inherit" },
  formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #ECEEF2" },
  td: { padding: "12px 13px", fontSize: 12.5, borderBottom: "1px solid #F0F2F5", verticalAlign: "middle", color: "#1D2939" },
  badge: c => ({ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c + "22", color: c }),
  pb: { height: 5, background: "#EAEAEA", borderRadius: 4, overflow: "hidden" },
  pbF: p => ({ height: "100%", width: `${p}%`, background: p === 100 ? "#1F8F5F" : p < 30 ? ROMA_RED : GOLD, borderRadius: 4 }),
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, padding: 26, width: "100%", maxWidth: 540, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.22)" },
  flex: (g = 0) => ({ display: "flex", alignItems: "center", gap: g }),
  flexBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  tag: { display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 11, background: "#F8FAFC", color: "#475467", border: "1px solid #E4E7EC" },
  empty: { textAlign: "center", padding: "40px 0", color: "#7b7975", fontSize: 13 },
  avatar: (color = STOIC_NAVY) => ({ width: 32, height: 32, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }),
};

const STATUS = {
  "tamamlandı": { color: "#30D158", label: "Tamamlandı" },
  "devam": { color: GOLD, label: "Devam Ediyor" },
  "gecikmeli": { color: ROMA_RED, label: "Gecikmeli" },
  "planlandı": { color: STOIC_NAVY, label: "Planlandı" },
  "yapıldı": { color: "#30D158", label: "Yapıldı" },
  "bekliyor": { color: GOLD, label: "Bekliyor" },
  "yanıtlandı": { color: "#30D158", label: "Yanıtlandı" },
  "kapatıldı": { color: "#8A8A8E", label: "Kapatıldı" },
};

const MSG_TYPE = {
  soru: { color: STOIC_NAVY, label: "Soru" },
  destek: { color: GOLD, label: "Destek" },
  bilgi: { color: "#30D158", label: "Bilgi" },
  dosya: { color: ROMA_RED, label: "Dosya İsteği" },
};

function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ ...S.flexBetween, marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{ ...S.btn("ghost"), padding: "4px 8px" }}><Icon name="close" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── RICH TEXT EDITOR ────────────────────────────────────────────────────────
function RichTextEditor({ value, onChange, minHeight = 90, readOnly = false }) {
  const ref = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.innerHTML = value || "";
      initialized.current = true;
    }
  }, []);

  const exec = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    onChange(ref.current?.innerHTML || "");
  };

  const toolbarBtn = (label, cmd, title) => (
    <button key={cmd} type="button" title={title} onMouseDown={e => { e.preventDefault(); exec(cmd); }}
      style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid #DADADA", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: "#1D2939" }}
    >{label}</button>
  );

  return (
    <div style={{ border: "1px solid #DADADA", borderRadius: 10, overflow: "hidden", background: readOnly ? "#F9F9F9" : "#fff" }}>
      {!readOnly && (
        <div style={{ display: "flex", gap: 5, padding: "6px 8px", borderBottom: "1px solid #EAEAEA", background: "#F9FAFB" }}>
          {toolbarBtn("B", "bold", "Kalın")}
          {toolbarBtn("İ", "italic", "İtalik")}
          {toolbarBtn("• Liste", "insertUnorderedList", "Madde işaretli liste")}
          {toolbarBtn("1. Liste", "insertOrderedList", "Numaralı liste")}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={e => !readOnly && onChange(e.currentTarget.innerHTML)}
        style={{ padding: "9px 12px", minHeight, outline: "none", fontSize: 13, lineHeight: 1.75, fontFamily: "inherit", background: readOnly ? "#F9F9F9" : "#fff" }}
      />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [reg, setReg] = useState({ name: "", email: "", pass: "", title: "", dept: "" });
  const setF = (k, v) => setReg(p => ({ ...p, [k]: v }));
  const [regDone, setRegDone] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setErr("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      onLogin(cred.user);
    } catch { setErr("E-posta veya şifre hatalı."); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!reg.name.trim() || !reg.email.trim() || !reg.pass.trim()) { setErr("Ad, e-posta ve şifre zorunludur."); return; }
    if (reg.pass.length < 6) { setErr("Şifre en az 6 karakter olmalıdır."); return; }
    setLoading(true); setErr("");
    try {
      const existing = await getDocs(query(collection(db, "registrations"), where("email", "==", reg.email.trim().toLowerCase()), limit(1)));
      if (!existing.empty) { setErr("Bu e-posta ile zaten bir kayıt talebi mevcut."); setLoading(false); return; }
      await addDoc(collection(db, "registrations"), {
        name: reg.name.trim(), email: reg.email.trim().toLowerCase(),
        password: reg.pass, title: reg.title.trim(), desiredDept: reg.dept.trim(),
        status: "bekliyor", createdAt: new Date().toISOString(),
      });
      setRegDone(true);
    } catch (e) { setErr("Kayıt talebi gönderilemedi: " + e.message); }
    setLoading(false);
  };

  const tabBtn = (id, label) => (
    <button onClick={() => { setTab(id); setErr(""); }}
      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: tab === id ? "#111827" : "transparent", color: tab === id ? "#fff" : "#667085" }}
    >{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px 30px", width: 420, border: "1px solid #E2E2DD", boxShadow: "0 10px 30px rgba(0,0,0,.06)" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: "#181715" }}>
            <img src={marcusLogo} alt="Marcus logo" style={{ width: 34, height: 34, objectFit: "contain" }} />
            <span>Marcus</span>
          </div>
        </div>
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 22 }}>
          {tabBtn("login", "Giriş Yap")}
          {tabBtn("register", "Kayıt Ol")}
        </div>

        {tab === "login" ? (
          <>
            <div style={{ marginBottom: 11 }}><label style={S.label}>E-posta</label><input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            <div style={{ marginBottom: 18 }}><label style={S.label}>Şifre</label><input style={S.input} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 11, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14 }} onClick={handleLogin} disabled={loading}>
              {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
            </button>
          </>
        ) : regDone ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Talebiniz alındı!</div>
            <div style={{ fontSize: 13, color: "#667085", lineHeight: 1.7 }}>Kayıt talebiniz admin onayına gönderildi.<br />Onaylandıktan sonra giriş yapabilirsiniz.</div>
            <button style={{ ...S.btn("ghost"), marginTop: 18 }} onClick={() => { setTab("login"); setRegDone(false); setReg({ name: "", email: "", pass: "", title: "", dept: "" }); }}>Giriş sayfasına dön</button>
          </div>
        ) : (
          <>
            <div style={S.formRow}>
              <div style={{ marginBottom: 11 }}><label style={S.label}>Ad Soyad</label><input style={S.input} value={reg.name} onChange={e => setF("name", e.target.value)} /></div>
              <div style={{ marginBottom: 11 }}><label style={S.label}>Unvan / Görev</label><input style={S.input} value={reg.title} onChange={e => setF("title", e.target.value)} placeholder="ör. Muhasebe Uzmanı" /></div>
            </div>
            <div style={{ marginBottom: 11 }}><label style={S.label}>Departman</label><input style={S.input} value={reg.dept} onChange={e => setF("dept", e.target.value)} placeholder="ör. Finans, Operasyon…" /></div>
            <div style={S.formRow}>
              <div style={{ marginBottom: 11 }}><label style={S.label}>E-posta</label><input style={S.input} type="email" value={reg.email} onChange={e => setF("email", e.target.value)} /></div>
              <div style={{ marginBottom: 16 }}><label style={S.label}>Şifre</label><input style={S.input} type="password" value={reg.pass} onChange={e => setF("pass", e.target.value)} /></div>
            </div>
            {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 11, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14 }} onClick={handleRegister} disabled={loading}>
              {loading ? "Gönderiliyor…" : "Kayıt Talebi Gönder"}
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: "#8A8A8E", textAlign: "center" }}>Talebiniz admin tarafından incelenerek onaylanacaktır.</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ tasks, meetings, depts, users, messages, fileRequests, currentUser, userProfile }) {
  const mine = hasAdminRole(userProfile?.role) ? tasks : tasks.filter(t => {
    const arr = Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo];
    return t.deptId === userProfile?.deptId || arr.includes(currentUser?.uid);
  });
  const myMsgs = messages.filter(m => m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId);
  const pendingMsgs = myMsgs.filter(m => m.status === "bekliyor").length;
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  // Yaklaşan toplantılar: sadece planlandı + gelecekte + kullanıcıya ait
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const myUpcomingMeetings = meetings
    .filter(m => {
      if (m.status !== "planlandı") return false;
      const mDate = new Date(m.datetime);
      if (mDate <= now) return false;
      if (hasAdminRole(userProfile?.role)) return true;
      return m.participants?.includes(currentUser?.uid) || m.deptId === userProfile?.deptId;
    })
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const todayMeetings = myUpcomingMeetings.filter(m => {
    const d = new Date(m.datetime);
    return d >= todayStart && d < todayEnd;
  });

  const minutesUntilNext = myUpcomingMeetings.length > 0
    ? Math.round((new Date(myUpcomingMeetings[0].datetime) - now) / 60000)
    : null;

  return (
    <div>
      {/* Bugün toplantı bildirimi */}
      {todayMeetings.length > 0 && (
        <div style={{ background: "#FFF8E1", border: "1px solid #F9C74F", borderRadius: 10, padding: "11px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#7A5C00" }}>
              Bugün {todayMeetings.length} toplantınız var!
            </span>
            <div style={{ fontSize: 12, color: "#8A6A16", marginTop: 2 }}>
              {todayMeetings.map(m => `${m.title} — ${fmtDateTime(m.datetime)}`).join(" · ")}
            </div>
          </div>
          {minutesUntilNext !== null && minutesUntilNext <= 60 && (
            <span style={{ ...S.badge(ROMA_RED), fontSize: 11, whiteSpace: "nowrap" }}>
              {minutesUntilNext < 1 ? "Şimdi başlıyor!" : `${minutesUntilNext} dk sonra`}
            </span>
          )}
        </div>
      )}

      <div style={S.grid3}>
        {[["Toplam Görev", mine.length, STOIC_NAVY], ["Tamamlandı", mine.filter(t => t.status === "tamamlandı").length, "#30D158"], ["Bekleyen Mesaj", pendingMsgs, GOLD]].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>{num}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.cardTitle}>Departman Özeti</div>
          {depts.map(d => {
            const dT = tasks.filter(t => t.deptId === d.id);
            const pct = dT.length ? Math.round((dT.filter(t => t.status === "tamamlandı").length / dT.length) * 100) : 0;
            return (
              <div key={d.id} style={{ marginBottom: 13 }}>
                <div style={{ ...S.flexBetween, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                  <span style={{ fontSize: 11.5, color: "#8A8A8E" }}>{dT.length} görev · %{pct}</span>
                </div>
                <div style={S.pb}><div style={S.pbF(pct)} /></div>
              </div>
            );
          })}
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>Son Mesajlar</div>
          {messages.slice(0, 4).map(m => (
            <div key={m.id} style={{ ...S.flex(10), marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ ...S.avatar(avatarColor(m.fromId)), marginTop: 2 }}>{users.find(u => u.id === m.fromId)?.avatar || "?"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.flexBetween}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.subject}</span>
                  <span style={S.badge(MSG_TYPE[m.type]?.color || "#999")}>{MSG_TYPE[m.type]?.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{getName(m.fromId)} · {timeAgo(m.createdAt)}</div>
              </div>
            </div>
          ))}
          {messages.length === 0 && <div style={S.empty}>Henüz mesaj yok</div>}
        </div>
      </div>
      <div style={{ height: 16 }} />

      {/* Yaklaşan Toplantılar Kartı */}
      <div style={S.card}>
        <div style={S.cardTitle}>Yaklaşan Toplantılar</div>
        {myUpcomingMeetings.length === 0 ? (
          <div style={S.empty}>Yaklaşan toplantı yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Toplantı", "Departman", "Tarih / Saat", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{myUpcomingMeetings.slice(0, 5).map(m => {
              const mDate = new Date(m.datetime);
              const diffMin = Math.round((mDate - now) / 60000);
              const diffLabel = diffMin < 60
                ? <span style={S.badge(ROMA_RED)}>{diffMin < 1 ? "Şimdi!" : `${diffMin}dk`}</span>
                : diffMin < 1440
                ? <span style={S.badge(GOLD)}>{Math.round(diffMin / 60)}sa</span>
                : <span style={S.badge(STOIC_NAVY)}>{Math.round(diffMin / 1440)}g</span>;
              return (
                <tr key={m.id}>
                  <td style={S.td}><strong>{m.title}</strong></td>
                  <td style={S.td}><span style={S.tag}>{getDept(m.deptId)}</span></td>
                  <td style={S.td}>{fmtDateTime(m.datetime)}</td>
                  <td style={S.td}>{diffLabel}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>

      <div style={{ height: 16 }} />
      <div style={S.card}>
        <div style={S.cardTitle}>Son Görevler</div>
        <table style={S.table}>
          <thead><tr>{["Görev", "Departman", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{mine.slice(0, 5).map(t => (
            <tr key={t.id}>
              <td style={S.td}><strong>{t.title}</strong></td>
              <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
              <td style={S.td}><span style={S.badge(STATUS[t.status]?.color || "#999")}>{STATUS[t.status]?.label}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
function TasksPage({ tasks, depts, users, currentUser, userProfile }) {
  const [fDept, setFDept] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [delayModal, setDelayModal] = useState(null);

  const rLevel = roleLevel(userProfile?.role);
  const canManage = rLevel <= 1; // Başkan, Teknik Yönetici, Dept Yöneticisi
  const canCreate = hasSuperRole(userProfile?.role) || rLevel === 1;

  const visible = useMemo(() => {
    let list = hasSuperRole(userProfile?.role) ? tasks : tasks.filter(t => {
      const arr = Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo];
      return t.deptId === userProfile?.deptId || arr.includes(currentUser?.uid);
    });
    if (fDept !== "all") list = list.filter(t => t.deptId === fDept);
    if (fStatus !== "all") list = list.filter(t => t.status === fStatus);
    if (search) list = list.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [tasks, fDept, fStatus, search, userProfile, currentUser]);

  const save = async t => {
    if (modal.mode === "add") {
      await addDoc(collection(db, "tasks"), { ...t, createdAt: serverTimestamp(), status: "devam" });
    } else {
      // In edit mode, preserve original dates and status
      const { startDate, endDate, status, mazeretGecikme, ...rest } = t;
      await updateDoc(doc(db, "tasks", t.id), rest);
    }
    setModal(null);
  };
  const del = async id => { await deleteDoc(doc(db, "tasks", id)); };
  const finishTask = async id => { await updateDoc(doc(db, "tasks", id), { status: "yapıldı" }); };
  const approveTask = async id => { await updateDoc(doc(db, "tasks", id), { status: "tamamlandı" }); };
  const saveDelay = async (id, mazeret) => {
    await updateDoc(doc(db, "tasks", id), { status: "gecikmeli", mazeretGecikme: mazeret, mazeretTarih: today() });
    setDelayModal(null);
  };
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const emptyTask = { title: "", desc: "", deptId: depts[0]?.id || "", assignedTo: [currentUser?.uid || ""], startDate: nowLocalISO(), endDate: "", notes: "" };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 16 }}>
        <div style={S.flex(8)}>
          <input style={{ ...S.input, width: 170 }} placeholder="Ara…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...S.select, width: 155 }} value={fDept} onChange={e => setFDept(e.target.value)}>
            <option value="all">Tüm Departmanlar</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select style={{ ...S.select, width: 145 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="all">Tüm Durumlar</option>
            <option value="devam">Devam Ediyor</option>
            <option value="tamamlandı">Tamamlandı</option>
            <option value="gecikmeli">Gecikmeli</option>
          </select>
        </div>
        {canCreate && <button style={S.btn()} onClick={() => setModal({ mode: "add", task: emptyTask })}><Icon name="plus" size={15} /> Görev Ekle</button>}
      </div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Başlık", "Departman", "Atananlar", "Bitiş", "Durum", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {visible.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#8A8A8E" }}>Görev bulunamadı</td></tr>
              : visible.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><div style={{ fontWeight: 600 }}>{t.title}</div>{t.desc && <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{t.desc}</div>}</td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap", maxWidth: 200 }}>{(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={S.td}>{fmtDate(t.endDate)}</td>
                  <td style={S.td}><span style={S.badge(STATUS[t.status]?.color || "#999")}>{STATUS[t.status]?.label}</span></td>
                  <td style={S.td}><div style={S.flex(5)}>
                    {t.status === "devam" && t.endDate && today() >= t.endDate.slice(0, 10) && canManage && (
                      <>
                        <button style={{ ...S.btn("green"), padding: "4px 8px", fontSize: 12 }} onClick={() => finishTask(t.id)}><Icon name="check" size={13} /> Bitir</button>
                        <button style={{ ...S.btn("danger"), padding: "4px 8px", fontSize: 12 }} onClick={() => setDelayModal(t)}>Gecikme</button>
                      </>
                    )}
                    {t.status === "yapıldı" && hasAdminRole(userProfile?.role) && (
                      <button style={{ ...S.btn("green"), padding: "4px 8px", fontSize: 12 }} onClick={() => approveTask(t.id)}><Icon name="check" size={13} /> Onayla</button>
                    )}
                    {canManage && <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", task: { ...t } })}><Icon name="edit" size={13} /></button>}
                    {hasAdminRole(userProfile?.role) && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#6A5610" }} onClick={() => del(t.id)}><Icon name="trash" size={13} /></button>}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modal && <TaskModal {...modal} depts={depts} users={users} userProfile={userProfile} onSave={save} onClose={() => setModal(null)} />}
      {delayModal && <TaskDelayModal task={delayModal} onSave={saveDelay} onClose={() => setDelayModal(null)} />}
    </div>
  );
}

function TaskModal({ mode, task, depts, users, userProfile, onSave, onClose }) {
  const [f, setF] = useState(task);
  const [userSearch, setUserSearch] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = mode === "edit";
  // Dept Yöneticisi sadece kendi departmanını görebilir
  const visibleDepts = hasSuperRole(userProfile?.role)
    ? depts
    : depts.filter(d => d.id === userProfile?.deptId);

  const toggleUser = (id) => {
    const arr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean);
    const updated = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    set("assignedTo", updated);
  };

  const filteredUsers = userSearch.trim()
    ? users.filter(u => u.name?.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  return (
    <Modal title={isEdit ? "Görevi Düzenle" : "Yeni Görev"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={f.desc} onChange={e => set("desc", e.target.value)} /></div>

        <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)} disabled={visibleDepts.length === 1}>{visibleDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>

        <div>
          <div style={{ ...S.flexBetween, marginBottom: 6 }}>
            <label style={{ ...S.label, marginBottom: 0 }}>
              Atananlar
              {(() => { const arr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean); return arr.length > 0 ? <span style={{ ...S.badge(STOIC_NAVY), marginLeft: 7, fontSize: 10 }}>{arr.length} seçili</span> : null; })()}
            </label>
            <input
              style={{ ...S.input, width: 160, padding: "5px 10px", fontSize: 12 }}
              placeholder="Kişi ara…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, maxHeight: 140, overflowY: "auto", padding: "2px 0" }}>
            {filteredUsers.map(u => {
              const arr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean);
              const isSelected = arr.includes(u.id);
              return (
                <div key={u.id} onClick={() => toggleUser(u.id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500, background: isSelected ? "#1C1C1E" : "#F2F2F7", color: isSelected ? "#fff" : "#1C1C1E", border: isSelected ? "1px solid #444" : "1px solid transparent" }}>
                  {u.name}
                </div>
              );
            })}
            {filteredUsers.length === 0 && <div style={{ fontSize: 12, color: "#8A8A8E" }}>Sonuç bulunamadı</div>}
          </div>
        </div>

        <div style={S.formRow}>
          <div>
            <label style={S.label}>Başlangıç</label>
            <input
              type="datetime-local"
              style={{ ...S.input, background: isEdit ? "#F5F5F5" : "#fff", color: isEdit ? "#8A8A8E" : "inherit" }}
              value={f.startDate}
              min={!isEdit ? nowLocalISO() : undefined}
              onChange={e => !isEdit && set("startDate", e.target.value)}
              readOnly={isEdit}
            />
          </div>
          <div>
            <label style={S.label}>Bitiş</label>
            <input
              type="datetime-local"
              style={{ ...S.input, background: isEdit ? "#F5F5F5" : "#fff", color: isEdit ? "#8A8A8E" : "inherit" }}
              value={f.endDate}
              min={!isEdit ? (f.startDate || nowLocalISO()) : undefined}
              onChange={e => !isEdit && set("endDate", e.target.value)}
              readOnly={isEdit}
            />
          </div>
        </div>
        {isEdit && <div style={{ fontSize: 11.5, color: "#8A8A8E", marginTop: -6 }}>Tarihler oluşturulduktan sonra değiştirilemez.</div>}

        <div><label style={S.label}>Notlar</label><textarea style={S.textarea} value={f.notes} onChange={e => set("notes", e.target.value)} /></div>
        <div style={{ ...S.flex(10), justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
          <button style={S.btn()} onClick={() => onSave(f)}>Kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

function TaskDelayModal({ task, onSave, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Gecikme Mazereti" onClose={onClose}>
      <div style={{ marginBottom: 10, fontSize: 13, color: "#4F4D49" }}>
        <strong>{task.title}</strong> görevi gecikti. Mazereti girin:
      </div>
      <textarea style={S.textarea} value={reason} onChange={e => setReason(e.target.value)} placeholder="Gecikme nedeni…" />
      <div style={{ ...S.flex(10), justifyContent: "flex-end", marginTop: 14 }}>
        <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
        <button style={S.btn("danger")} onClick={() => onSave(task.id, reason)} disabled={!reason.trim()}>Kaydet</button>
      </div>
    </Modal>
  );
}

// ─── MEETINGS ─────────────────────────────────────────────────────────────────
function MeetingsPage({ meetings, depts, users, currentUser, userProfile }) {
  const [modal, setModal] = useState(null);
  const [reportModal, setReportModal] = useState(null);
  const [excuseModal, setExcuseModal] = useState(null);
  const mRLevel = roleLevel(userProfile?.role);
  const canCreateMeeting = hasSuperRole(userProfile?.role) || mRLevel === 1;
  const visible = hasSuperRole(userProfile?.role) ? meetings : meetings.filter(m => m.deptId === userProfile?.deptId || m.participants?.includes(currentUser?.uid));
  const defaultDeptId = hasSuperRole(userProfile?.role) ? (depts[0]?.id || "") : (userProfile?.deptId || depts[0]?.id || "");
  const emptyM = { title: "", deptId: defaultDeptId, datetime: new Date().toISOString().slice(0, 16), participants: [], status: "planlandı", report: null };

  const save = async m => {
    try {
      if (modal.mode === "add") {
        await addDoc(collection(db, "meetings"), { ...m, createdAt: serverTimestamp() });
      } else {
        const { id, createdAt, ...updateData } = m;
        await updateDoc(doc(db, "meetings", id), updateData);
      }
    } catch (e) {
      console.error("Toplantı kaydedilemedi:", e);
      alert("Kayıt sırasında hata oluştu: " + e.message);
    }
    setModal(null);
  };
  const saveExcuse = async (meetingId, reason) => {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) return;
    try {
      const excuses = { ...(meeting.excuses || {}), [currentUser.uid]: reason };
      // Yeni mazeret → denetim panelinde "bekliyor" olarak görünsün
      const excuseStatuses = { ...(meeting.excuseStatuses || {}), [currentUser.uid]: "bekliyor" };
      await updateDoc(doc(db, "meetings", meetingId), { excuses, excuseStatuses });
    } catch (e) {
      console.error("İzin kaydedilemedi:", e);
      alert("Kayıt sırasında hata oluştu: " + e.message);
    }
    setExcuseModal(null);
  };
  const del = async id => await deleteDoc(doc(db, "meetings", id));
  const saveReport = async ({ meetingId, report, attendedParticipantIds }) => {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const invitedParticipantIds = meeting.participants || [];
    const attendedSet = new Set(attendedParticipantIds || []);
    const date = dayFromDateTime(meeting.datetime);

    await updateDoc(doc(db, "meetings", meetingId), {
      report: { ...report, attendedParticipantIds: Array.from(attendedSet), invitedParticipantIds },
      status: "yapıldı",
    });

    const attendanceWrites = invitedParticipantIds.map(userId => {
      let status = "gelmedi";
      if (attendedSet.has(userId)) status = "katildi";
      else if (meeting.excuses && meeting.excuses[userId]) status = "izinli";

      return setDoc(doc(db, "attendance", `${meetingId}_${userId}`), {
        meetingId,
        meetingTitle: meeting.title,
        userId,
        date,
        deptId: meeting.deptId || null,
        status,
        excuse: meeting.excuses && meeting.excuses[userId] ? meeting.excuses[userId] : null,
        source: "meeting-report",
        updatedBy: currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });

    try {
      await Promise.all(attendanceWrites);
    } catch (e) {
      console.error("Rapor kaydedilemedi:", e);
      alert("Kayıt sırasında hata oluştu: " + e.message);
    }
    setReportModal(null);
  };
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div />
        {canCreateMeeting && <button style={S.btn()} onClick={() => setModal({ mode: "add", meeting: emptyM })}><Icon name="plus" size={15} /> Toplantı Ekle</button>}
      </div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Başlık", "Departman", "Tarih / Saat", "Katılımcılar", "Durum", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {visible.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#8A8A8E" }}>Toplantı yok</td></tr>
              : visible.map(m => (
                <tr key={m.id}>
                  <td style={S.td}><strong>{m.title}</strong></td>
                  <td style={S.td}><span style={S.tag}>{getDept(m.deptId)}</span></td>
                  <td style={S.td}>{fmtDateTime(m.datetime)}</td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap" }}>{(m.participants || []).slice(0, 3).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={S.td}><span style={S.badge(STATUS[m.status]?.color || "#999")}>{STATUS[m.status]?.label}</span></td>
                  <td style={S.td}><div style={S.flex(5)}>
                    {m.status === "planlandı" && roleLevel(userProfile?.role) <= 1 && <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", meeting: { ...m } })}><Icon name="edit" size={13} /></button>}
                    {m.status === "planlandı" && m.participants?.includes(currentUser?.uid) && !m.excuses?.[currentUser?.uid] && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: GOLD }} onClick={() => setExcuseModal(m)}>İzin Al</button>}
                    {m.status === "planlandı" && m.participants?.includes(currentUser?.uid) && m.excuses?.[currentUser?.uid] && <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>İzinli</span>}
                    {m.status === "planlandı" && roleLevel(userProfile?.role) <= 1 && <button style={{ ...S.btn("green"), padding: "4px 11px", fontSize: 12 }} onClick={() => setReportModal({ ...m, readOnly: false })}><Icon name="check" size={12} /> Onayla</button>}
                    {m.status === "yapıldı" && <button style={{ ...S.btn("ghost"), padding: "4px 11px", fontSize: 12 }} onClick={() => setReportModal({ ...m, readOnly: true })}><Icon name="reports" size={12} /> Rapor</button>}
                    {hasAdminRole(userProfile?.role) && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#6A5610" }} onClick={() => del(m.id)}><Icon name="trash" size={13} /></button>}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modal && <MeetingModal {...modal} depts={depts} users={users} userProfile={userProfile} onSave={save} onClose={() => setModal(null)} />}
      {reportModal && <ReportModal meeting={reportModal} users={users} depts={depts} onSave={saveReport} onClose={() => setReportModal(null)} />}
      {excuseModal && <ExcuseModal meeting={excuseModal} onSave={saveExcuse} onClose={() => setExcuseModal(null)} />}
    </div>
  );
}

function ExcuseModal({ meeting, onSave, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="İzin Al" onClose={onClose}>
      <div style={{ marginBottom: 11, fontSize: 13, color: "#4F4D49" }}>
        <strong>{meeting.title}</strong> toplantısına katılamayacağınız için mazeretinizi belirtin:
      </div>
      <textarea style={S.textarea} value={reason} onChange={e => setReason(e.target.value)} placeholder="Mazeretiniz..." />
      <div style={{ ...S.flex(10), justifyContent: "flex-end", marginTop: 14 }}>
        <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
        <button style={S.btn()} onClick={() => onSave(meeting.id, reason)} disabled={!reason.trim()}>Kaydet</button>
      </div>
    </Modal>
  );
}

function MeetingModal({ mode, meeting, depts, users, userProfile, onSave, onClose }) {
  const [f, setF] = useState(meeting);
  const [userSearch, setUserSearch] = useState("");
  const [dtError, setDtError] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleP = id => set("participants", (f.participants || []).includes(id) ? f.participants.filter(x => x !== id) : [...(f.participants || []), id]);
  const visibleDepts = hasSuperRole(userProfile?.role)
    ? depts
    : depts.filter(d => d.id === userProfile?.deptId);

  // Minimum seçilebilir tarih/saat = şu an (sadece yeni toplantılarda)
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const filteredUsers = userSearch.trim()
    ? users.filter(u => u.name?.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const handleSave = () => {
    if (mode === "add" && f.datetime && new Date(f.datetime) <= new Date()) {
      setDtError("Geçmiş bir tarih/saat seçemezsiniz. Lütfen gelecekteki bir zaman seçin.");
      return;
    }
    setDtError("");
    onSave(f);
  };

  return (
    <Modal title={mode === "add" ? "Yeni Toplantı" : "Toplantı Düzenle"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div style={S.formRow}>
          <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)} disabled={visibleDepts.length === 1}>{visibleDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div>
            <label style={S.label}>Tarih & Saat</label>
            <input
              type="datetime-local"
              style={{ ...S.input, borderColor: dtError ? ROMA_RED : undefined }}
              value={f.datetime}
              min={mode === "add" ? nowLocal : undefined}
              onChange={e => { set("datetime", e.target.value); setDtError(""); }}
            />
          </div>
        </div>
        {dtError && <div style={{ fontSize: 12, color: ROMA_RED, background: "#FFF0F0", borderRadius: 7, padding: "7px 10px", marginTop: -6 }}>{dtError}</div>}

        <div>
          <div style={{ ...S.flexBetween, marginBottom: 6 }}>
            <label style={{ ...S.label, marginBottom: 0 }}>
              Katılımcılar
              {(f.participants || []).length > 0 && <span style={{ ...S.badge(STOIC_NAVY), marginLeft: 7, fontSize: 10 }}>{f.participants.length} seçili</span>}
            </label>
            <input
              style={{ ...S.input, width: 160, padding: "5px 10px", fontSize: 12 }}
              placeholder="Kişi ara…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, maxHeight: 140, overflowY: "auto", padding: "2px 0" }}>
            {filteredUsers.map(u => {
              const isSelected = (f.participants || []).includes(u.id);
              return (
                <div key={u.id} onClick={() => toggleP(u.id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500, background: isSelected ? "#1C1C1E" : "#F2F2F7", color: isSelected ? "#fff" : "#1C1C1E", border: isSelected ? "1px solid #444" : "1px solid transparent" }}>
                  {u.name}
                </div>
              );
            })}
            {filteredUsers.length === 0 && <div style={{ fontSize: 12, color: "#8A8A8E" }}>Sonuç bulunamadı</div>}
          </div>
        </div>

        <div style={{ ...S.flex(10), justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
          <button style={S.btn()} onClick={handleSave}>Kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

function ReportModal({ meeting, users, depts, onSave, onClose }) {
  const readOnly = meeting.readOnly === true;
  const [kararlar, setKararlar] = useState(meeting.report?.kararlar || "");
  const [aksiyonlar, setAksiyonlar] = useState(meeting.report?.aksiyonlar || "");
  const [attendedParticipantIds, setAttendedParticipantIds] = useState(
    meeting.report?.attendedParticipantIds || meeting.participants || []
  );
  const getName = id => users.find(u => u.id === id)?.name || id;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const toggleAttended = id => {
    if (readOnly) return;
    setAttendedParticipantIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const printPdf = () => {
    openPrintableReport({
      title: meeting.title,
      bodyHtml: `<h1>Toplanti Raporu</h1><table><tr><td>Toplanti</td><td>${meeting.title}</td></tr><tr><td>Departman</td><td>${getDept(meeting.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(meeting.datetime)}</td></tr><tr><td>Davetliler</td><td>${(meeting.participants || []).map(getName).join(", ")}</td></tr><tr><td>Katilanlar</td><td>${(attendedParticipantIds || []).map(getName).join(", ") || "-"}</td></tr></table><h2>Alinan Kararlar</h2><div class="box">${kararlar || "-"}</div><h2>Aksiyon Maddeleri</h2><div class="box">${aksiyonlar || "-"}</div>`,
    });
  };
  return (
    <Modal title={readOnly ? "Toplantı Raporu (Onaylı)" : "Toplantıyı Onayla"} onClose={onClose}>
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 9, padding: "11px 14px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.9 }}>
        <div><strong>Toplantı:</strong> {meeting.title}</div>
        <div><strong>Tarih:</strong> {fmtDateTime(meeting.datetime)}</div>
        {readOnly && <div style={{ marginTop: 4 }}><span style={{ ...S.badge("#30D158"), fontSize: 11 }}>Yapıldı ✓</span></div>}
      </div>
      <div style={{ marginBottom: 11 }}><label style={S.label}>Alınan Kararlar</label><RichTextEditor value={kararlar} onChange={v => !readOnly && setKararlar(v)} minHeight={80} readOnly={readOnly} /></div>
      <div style={{ marginBottom: 12 }}>
        <label style={S.label}>{readOnly ? "Katılanlar" : "Katılanlar (devamsızlık için işaretleyin)"}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
          {(meeting.participants || []).map(id => {
            const active = attendedParticipantIds.includes(id);
            const excuse = meeting.excuses?.[id];
            return (
              <div key={id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div
                  onClick={() => toggleAttended(id)}
                  style={{
                    padding: "4px 11px",
                    borderRadius: 20,
                    fontSize: 12,
                    cursor: readOnly ? "default" : "pointer",
                    fontWeight: 600,
                    background: active ? "#1C1C1E" : "#FFFFFF",
                    color: active ? "#fff" : "#1C1C1E",
                    border: active ? `1px solid ${GOLD}` : "1px solid #DADADA",
                    textAlign: "center"
                  }}
                >
                  {getName(id)}
                </div>
                {excuse && !active && <div style={{ fontSize: 10, color: GOLD, maxWidth: 80, lineHeight: 1.1, textAlign: "center" }} title={excuse}>İzinli</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}><label style={S.label}>Aksiyon Maddeleri</label><RichTextEditor value={aksiyonlar} onChange={v => !readOnly && setAksiyonlar(v)} minHeight={80} readOnly={readOnly} /></div>
      <div style={{ ...S.flexBetween }}>
        <button style={S.btn("ghost")} onClick={printPdf}><Icon name="download" size={13} /> PDF</button>
        <div style={S.flex(7)}>
          <button style={S.btn("ghost")} onClick={onClose}>{readOnly ? "Kapat" : "İptal"}</button>
          {!readOnly && <button style={S.btn()} onClick={() => onSave({ meetingId: meeting.id, report: { kararlar, aksiyonlar }, attendedParticipantIds })}>Onayla ve Kaydet</button>}
        </div>
      </div>
    </Modal>
  );
}

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
function DepartmentsPage({ depts, tasks, meetings, users, userProfile }) {
  const [modal, setModal] = useState(null);
  const [memberModal, setMemberModal] = useState(null);
  const isAdmin = hasAdminRole(userProfile?.role);

  const save = async d => {
    if (modal.mode === "add") await addDoc(collection(db, "depts"), d);
    else await updateDoc(doc(db, "depts", d.id), d);
    setModal(null);
  };
  const del = async id => {
    if (tasks.some(t => t.deptId === id)) { alert("Bağlı görev var, önce silin."); return; }
    await deleteDoc(doc(db, "depts", id));
  };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "#8A8A8E" }}>Departmana tıklayarak üyeleri görüntüleyin</div>
        {isAdmin && <button style={S.btn()} onClick={() => setModal({ mode: "add", dept: { name: "", desc: "" } })}><Icon name="plus" size={15} /> Departman Ekle</button>}
      </div>
      <div style={S.grid3}>
        {depts.map(d => {
          const members = users.filter(u => u.deptId === d.id);
          return (
            <div key={d.id} style={{ ...S.card, position: "relative", cursor: "pointer", border: "1px solid #E5E5E5", transition: "border-color 0.15s" }}
              onClick={() => setMemberModal(d)}>
              <div style={{ position: "absolute", top: 12, right: 12, ...S.flex(5) }} onClick={e => e.stopPropagation()}>
                {isAdmin && <>
                  <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", dept: { ...d } })}><Icon name="edit" size={13} /></button>
                  <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#6A5610" }} onClick={() => del(d.id)}><Icon name="trash" size={13} /></button>
                </>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, paddingRight: 68 }}>{d.name}</div>
              <div style={{ fontSize: 12.5, color: "#636366", marginBottom: 14 }}>{d.desc}</div>
              <div style={{ display: "flex", gap: 18, alignItems: "flex-end", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 18 }}>
                  {[["Görev", tasks.filter(t => t.deptId === d.id).length, STOIC_NAVY], ["Toplantı", meetings.filter(m => m.deptId === d.id).length, "#30D158"], ["Üye", members.length, GOLD]].map(([label, num, color]) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{num}</div>
                      <div style={{ fontSize: 11, color: "#8A8A8E" }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#8A8A8E", fontWeight: 600 }}>▼ Üyeler</div>
              </div>
            </div>
          );
        })}
      </div>
      {memberModal && (() => {
        const members = users.filter(u => u.deptId === memberModal.id);
        return (
          <Modal title={`${memberModal.name} — Üyeler`} onClose={() => setMemberModal(null)}>
            {members.length === 0 ? (
              <div style={S.empty}>Bu departmanda üye yok</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {members.map(u => (
                  <div key={u.id} style={{ ...S.flex(10), padding: "10px 12px", borderRadius: 10, background: "#F9F9FB", border: "1px solid #ECECEF" }}>
                    <div style={{ ...S.avatar(avatarColor(u.id)), width: 34, height: 34, fontSize: 11 }}>{u.avatar || u.name?.[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "#8A8A8E" }}>{u.title || "—"}</div>
                    </div>
                    <span style={{ ...S.badge(hasAdminRole(u.role) ? ROMA_RED : STOIC_NAVY), fontSize: 10 }}>{displayRole(u.role)}</span>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        );
      })()}
      {modal && <Modal title={modal.mode === "add" ? "Yeni Departman" : "Düzenle"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div><label style={S.label}>Ad</label><input style={S.input} value={modal.dept.name} onChange={e => setModal(p => ({ ...p, dept: { ...p.dept, name: e.target.value } }))} /></div>
          <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={modal.dept.desc} onChange={e => setModal(p => ({ ...p, dept: { ...p.dept, desc: e.target.value } }))} /></div>
          <div style={{ ...S.flex(10), justifyContent: "flex-end" }}><button style={S.btn("ghost")} onClick={() => setModal(null)}>İptal</button><button style={S.btn()} onClick={() => save(modal.dept)}>Kaydet</button></div>
        </div>
      </Modal>}
    </div>
  );
}

// ─── USERS ADMIN ──────────────────────────────────────────────────────────────
function UsersPage({ users, depts, userProfile, currentUser, registrations }) {
  // currentUser kendi kendini silemez — deleteUser fonksiyonunda kontrol edilir
  const [modal, setModal] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  if (!hasAdminRole(userProfile?.role)) return <div style={S.card}><div style={S.empty}>Başkan yetkisi gereklidir.</div></div>;

  const pending = (registrations || []).filter(r => r.status === "bekliyor");
  const ROLE_COLOR = { "Admin": ROMA_RED, "Başkan": ROMA_RED, "Teknik Yönetici": ROMA_RED, "Departman Yöneticisi": STOIC_NAVY, "Departman Üyesi": STOIC_NAVY, "Üye": "#30D158", "Genel Üye": "#30D158", "Denetmen": GOLD };
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  const createUser = async () => {
    if (!modal.user.email?.trim()) { setErr("E-posta adresi zorunludur."); return; }
    if (!modal.user.password || modal.user.password.length < 6) { setErr("Şifre en az 6 karakter olmalıdır."); return; }
    if (!modal.user.name?.trim()) { setErr("İsim zorunludur."); return; }
    setLoading(true); setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, modal.user.email.trim(), modal.user.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: modal.user.name.trim(),
        email: modal.user.email.trim(),
        role: modal.user.role,
        deptId: modal.user.deptId || null,
        title: modal.user.title || "",
        avatar: modal.user.avatar || modal.user.name.slice(0, 2).toUpperCase(),
        managerId: modal.user.managerId || null,
      });
      setModal(null);
    } catch (e) {
      setErr(firebaseErrTR(e));
    }
    setLoading(false);
  };

  const deleteUser = async (u) => {
    if (!window.confirm(
      `"${u.name}" adlı kullanıcıyı tamamen silmek istiyor musunuz?\n\n` +
      `• Profil silinir\n• Tüm devamsızlık kayıtları silinir\n• Hesap kara listeye alınır (tekrar giriş yapamaz)`
    )) return;
    try {
      // 1. Firestore kullanıcı profilini sil
      await deleteDoc(doc(db, "users", u.id));

      // 2. Kara listeye ekle — e-posta + uid ile engellenir
      await setDoc(doc(db, "deletedUsers", u.id), {
        uid: u.id,
        email: (u.email || "").toLowerCase(),
        name: u.name || "",
        deletedAt: serverTimestamp(),
        deletedBy: currentUser?.uid || null,
      });

      // 3. Devamsızlık kayıtlarını sil
      const attSnap = await getDocs(query(collection(db, "attendance"), where("userId", "==", u.id)));
      await Promise.all(attSnap.docs.map(d => deleteDoc(d.ref)));

    } catch (e) {
      alert("Silinemedi: " + firebaseErrTR(e));
    }
  };

  const updateUser = async () => {
    await updateDoc(doc(db, "users", modal.user.id), {
      name: modal.user.name, role: modal.user.role,
      deptId: modal.user.deptId || null, title: modal.user.title || "",
      avatar: modal.user.avatar || "", managerId: modal.user.managerId || null,
    });
    setModal(null);
  };

  const confirmApprove = async () => {
    if (!approveModal) return;
    setLoading(true); setErr("");
    try {
      const { reg, role, deptId, title } = approveModal;
      const cred = await createUserWithEmailAndPassword(auth, reg.email, reg.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: reg.name, email: reg.email, role,
        deptId: deptId || null, title: title || "",
        avatar: reg.name.slice(0, 2).toUpperCase(),
        managerId: null, createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, "registrations", reg.id));
      setApproveModal(null);
    } catch (e) { setErr("Onaylama hatası: " + firebaseErrTR(e)); }
    setLoading(false);
  };

  const rejectRegistration = async (reg) => {
    if (!window.confirm(`"${reg.name}" adlı kullanıcının kaydını reddet?`)) return;
    await deleteDoc(doc(db, "registrations", reg.id));
  };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div style={S.flex(8)}>
          <button style={S.btn(tab === "users" ? "primary" : "ghost")} onClick={() => setTab("users")}>Kullanıcılar</button>
          <button style={S.btn(tab === "pending" ? "primary" : "ghost")} onClick={() => setTab("pending")}>
            Kayıt Bekleyenler
            {pending.length > 0 && <span style={{ background: ROMA_RED, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginLeft: 6 }}>{pending.length}</span>}
          </button>
        </div>
        {tab === "users" && <button style={S.btn()} onClick={() => setModal({ mode: "add", user: { name: "", email: "", password: "", role: "Üye", deptId: "", title: "", avatar: "", managerId: null } })}><Icon name="plus" size={15} /> Kullanıcı Ekle</button>}
      </div>
      {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 10, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}

      {tab === "pending" && (
        <div style={S.card}>
          {pending.length === 0 ? <div style={S.empty}>Bekleyen kayıt talebi yok.</div> : (
            <table style={S.table}>
              <thead><tr>{["Ad Soyad", "Talep Edilen Kadro", "Tarih", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{pending.map(r => (
                <tr key={r.id}>
                  <td style={S.td}>
                    <div style={S.flex(8)}>
                      <div style={S.avatar(avatarColor(r.id))}>{r.name?.slice(0, 2).toUpperCase()}</div>
                      <div><div style={{ fontWeight: 700 }}>{r.name}</div><div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{r.email}</div></div>
                    </div>
                  </td>
                  <td style={S.td}>
                    {r.title && <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.title}</div>}
                    {r.desiredDept && <span style={S.tag}>{r.desiredDept}</span>}
                  </td>
                  <td style={S.td}>{fmtDate(r.createdAt)}</td>
                  <td style={S.td}>
                    <div style={S.flex(6)}>
                      <button style={S.btn("green")} onClick={() => setApproveModal({ reg: r, role: "Üye", deptId: "", title: r.title || "" })}>Onayla</button>
                      <button style={{ ...S.btn("ghost"), color: ROMA_RED }} onClick={() => rejectRegistration(r)}>Reddet</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === "users" && <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["İsim", "E-posta", "Unvan", "Rol", "Departman", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td style={S.td}><div style={S.flex(8)}><div style={S.avatar(avatarColor(u.id))}>{u.avatar || u.name?.[0]}</div><strong>{u.name}</strong></div></td>
              <td style={S.td}>{u.email}</td>
              <td style={S.td}><span style={{ fontSize: 12.5, color: "#636366" }}>{u.title || "—"}</span></td>
              <td style={S.td}><span style={S.badge(ROLE_COLOR[u.role] || "#999")}>{displayRole(u.role)}</span></td>
              <td style={S.td}>{u.deptId ? getDept(u.deptId) : <span style={{ color: "#8A8A8E" }}>—</span>}</td>
              <td style={S.td}>
                <div style={S.flex(5)}>
                  <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", user: { ...u } })}><Icon name="edit" size={13} /></button>
                  {u.id !== currentUser?.uid && (
                    <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: ROMA_RED }} onClick={() => deleteUser(u)} title="Kullanıcıyı sil"><Icon name="trash" size={13} /></button>
                  )}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>}

      {approveModal && (
        <Modal title="Kullanıcıyı Onayla" onClose={() => setApproveModal(null)}>
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 9, padding: "12px 14px", marginBottom: 16, fontSize: 12.5, lineHeight: 1.9 }}>
            <div><strong>Ad:</strong> {approveModal.reg.name}</div>
            <div><strong>E-posta:</strong> {approveModal.reg.email}</div>
            {approveModal.reg.title && <div><strong>Talep ettiği unvan:</strong> {approveModal.reg.title}</div>}
            {approveModal.reg.desiredDept && <div><strong>Talep ettiği departman:</strong> {approveModal.reg.desiredDept}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={S.formRow}>
              <div><label style={S.label}>Sistem Rolü</label>
                <select style={S.select} value={approveModal.role} onChange={e => setApproveModal(p => ({ ...p, role: e.target.value }))}>
                  <option value="Başkan">Başkan</option>
                  <option value="Teknik Yönetici">Teknik Yönetici</option>
                  <option value="Departman Yöneticisi">Departman Yöneticisi</option>
                  <option value="Üye">Departman Üyesi</option>
                  <option value="Denetmen">Denetmen</option>
                </select>
              </div>
              <div><label style={S.label}>Departman</label>
                <select style={S.select} value={approveModal.deptId} onChange={e => setApproveModal(p => ({ ...p, deptId: e.target.value }))}>
                  <option value="">— Atanmadı —</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div><label style={S.label}>Unvan / Görev</label>
              <input style={S.input} value={approveModal.title} onChange={e => setApproveModal(p => ({ ...p, title: e.target.value }))} />
            </div>
            {err && <div style={{ color: "#6A5610", fontSize: 12, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
            <div style={{ ...S.flex(8), justifyContent: "flex-end" }}>
              <button style={S.btn("ghost")} onClick={() => setApproveModal(null)}>İptal</button>
              <button style={S.btn("green")} onClick={confirmApprove} disabled={loading}>{loading ? "Onaylanıyor…" : "Hesabı Oluştur ve Onayla"}</button>
            </div>
          </div>
        </Modal>
      )}
      {modal && <Modal title={modal.mode === "add" ? "Yeni Kullanıcı" : "Düzenle"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={S.formRow}>
            <div><label style={S.label}>İsim</label><input style={S.input} value={modal.user.name} onChange={e => setModal(p => ({ ...p, user: { ...p.user, name: e.target.value } }))} /></div>
            <div><label style={S.label}>Unvan</label><input style={S.input} value={modal.user.title || ""} onChange={e => setModal(p => ({ ...p, user: { ...p.user, title: e.target.value } }))} /></div>
          </div>
          {modal.mode === "add" && <>
            <div><label style={S.label}>E-posta</label><input style={S.input} value={modal.user.email} onChange={e => setModal(p => ({ ...p, user: { ...p.user, email: e.target.value } }))} /></div>
            <div><label style={S.label}>Şifre</label><input type="password" style={S.input} value={modal.user.password} onChange={e => setModal(p => ({ ...p, user: { ...p.user, password: e.target.value } }))} /></div>
          </>}
          <div style={S.formRow}>
            <div><label style={S.label}>Rol</label><select style={S.select} value={modal.user.role} onChange={e => setModal(p => ({ ...p, user: { ...p.user, role: e.target.value } }))}><option value="Başkan">Başkan</option><option value="Teknik Yönetici">Teknik Yönetici</option><option value="Departman Yöneticisi">Departman Yöneticisi</option><option value="Üye">Departman Üyesi</option><option value="Denetmen">Denetmen</option></select></div>
            <div><label style={S.label}>Departman</label><select style={S.select} value={modal.user.deptId || ""} onChange={e => setModal(p => ({ ...p, user: { ...p.user, deptId: e.target.value || null } }))}><option value="">—</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          </div>
          {err && <div style={{ color: "#6A5610", fontSize: 12 }}>{err}</div>}
          <div style={{ ...S.flex(10), justifyContent: "flex-end" }}><button style={S.btn("ghost")} onClick={() => setModal(null)}>İptal</button><button style={S.btn()} onClick={modal.mode === "add" ? createUser : updateUser} disabled={loading}>{loading ? "Kaydediliyor…" : "Kaydet"}</button></div>
        </div>
      </Modal>}
    </div>
  );
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
function MessagesPage({ messages, users, depts, currentUser, userProfile }) {
  const [tab, setTab] = useState("gelen");
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(false);
  const [replyText, setReplyText] = useState("");
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const incoming = messages.filter(m => m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId);
  const outgoing = messages.filter(m => m.fromId === currentUser?.uid);
  const list = tab === "gelen" ? incoming : outgoing;
  const selMsg = messages.find(m => m.id === selected);

  const sendReply = async () => {
    if (!replyText.trim() || !selMsg) return;
    const replies = [...(selMsg.replies || []), { id: uid(), fromId: currentUser.uid, body: replyText.trim(), createdAt: new Date().toISOString() }];
    await updateDoc(doc(db, "messages", selMsg.id), { replies, status: "yanıtlandı" });
    setReplyText("");
  };

  const sendMessage = async msg => {
    await addDoc(collection(db, "messages"), { ...msg, fromId: currentUser.uid, status: "bekliyor", createdAt: new Date().toISOString(), replies: [] });
    setCompose(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.5fr" : "1fr", gap: 16 }}>
      <div>
        <div style={{ ...S.flexBetween, marginBottom: 14 }}>
          <div style={S.flex(8)}>
            <button style={S.btn(tab === "gelen" ? "primary" : "ghost")} onClick={() => { setTab("gelen"); setSelected(null); }}>Gelen</button>
            <button style={S.btn(tab === "giden" ? "primary" : "ghost")} onClick={() => { setTab("giden"); setSelected(null); }}>Giden</button>
          </div>
          <button style={S.btn("blue")} onClick={() => setCompose(true)}><Icon name="plus" size={14} /> Yeni Mesaj</button>
        </div>
        <div style={S.card}>
          {list.length === 0 ? <div style={S.empty}>Mesaj yok</div> : list.map(m => (
            <div key={m.id} onClick={() => setSelected(m.id === selected ? null : m.id)} style={{ padding: "12px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 4, background: selected === m.id ? "#FFFFFF" : "transparent", border: selected === m.id ? "1px solid #DADADA" : "1px solid transparent" }}>
              <div style={S.flexBetween}>
                <div style={S.flex(8)}>
                  <div style={S.avatar(avatarColor(m.fromId))}>{users.find(u => u.id === m.fromId)?.avatar || "?"}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: m.status === "bekliyor" ? 700 : 500 }}>{m.subject}</div>
                    <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{getName(m.fromId)} · {timeAgo(m.createdAt)}</div>
                  </div>
                </div>
                <span style={S.badge(MSG_TYPE[m.type]?.color || "#999")}>{MSG_TYPE[m.type]?.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {selMsg && (
        <div style={S.card}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{selMsg.subject}</div>
          <div style={{ fontSize: 12, color: "#8A8A8E", marginBottom: 16 }}>{getName(selMsg.fromId)} → {selMsg.toId ? getName(selMsg.toId) : getDept(selMsg.toDeptId)} · {timeAgo(selMsg.createdAt)}</div>
          <div style={{ padding: "14px", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{selMsg.body}</div>
          {(selMsg.replies || []).map(r => (
            <div key={r.id} style={{ ...S.flex(10), marginBottom: 10, alignItems: "flex-start" }}>
              <div style={S.avatar(avatarColor(r.fromId))}>{users.find(u => u.id === r.fromId)?.avatar || "?"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#636366" }}>{getName(r.fromId)}</div>
                <div style={{ fontSize: 13, marginTop: 3, padding: "8px 12px", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8 }}>{r.body}</div>
              </div>
            </div>
          ))}
          <div><label style={S.label}>Yanıtla</label><textarea style={{ ...S.textarea, minHeight: 64 }} value={replyText} onChange={e => setReplyText(e.target.value)} /></div>
          <div style={{ ...S.flex(8), justifyContent: "flex-end", marginTop: 8 }}><button style={S.btn("blue")} onClick={sendReply}><Icon name="send" size={14} /> Gönder</button></div>
        </div>
      )}
      {compose && (
        <Modal title="Yeni Mesaj" onClose={() => setCompose(false)}>
          <ComposeForm users={users} depts={depts} currentUser={currentUser} onSend={sendMessage} onClose={() => setCompose(false)} />
        </Modal>
      )}
    </div>
  );
}

function ComposeForm({ users, depts, currentUser, onSend, onClose }) {
  const [form, setForm] = useState({ type: "soru", toType: "kişi", toId: "", toDeptId: "", subject: "", body: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={S.formRow}>
        <div><label style={S.label}>Tür</label><select style={S.select} value={form.type} onChange={e => set("type", e.target.value)}><option value="soru">Soru</option><option value="destek">Destek</option><option value="bilgi">Bilgi</option><option value="dosya">Dosya İsteği</option></select></div>
        <div><label style={S.label}>Alıcı Türü</label>
          <div style={{ ...S.flex(8), marginTop: 4 }}>
            {["kişi", "departman"].map(t => <div key={t} onClick={() => set("toType", t)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: form.toType === t ? "#1C1C1E" : "#F2F2F7", color: form.toType === t ? "#fff" : "#1C1C1E" }}>{t === "kişi" ? "Kişi" : "Departman"}</div>)}
          </div>
        </div>
      </div>
      {form.toType === "kişi"
        ? <div><label style={S.label}>Kişi</label><select style={S.select} value={form.toId} onChange={e => set("toId", e.target.value)}><option value="">Seçiniz</option>{users.filter(u => u.id !== currentUser?.uid).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        : <div><label style={S.label}>Departman</label><select style={S.select} value={form.toDeptId} onChange={e => set("toDeptId", e.target.value)}><option value="">Seçiniz</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      }
      <div><label style={S.label}>Konu</label><input style={S.input} value={form.subject} onChange={e => set("subject", e.target.value)} /></div>
      <div><label style={S.label}>Mesaj</label><textarea style={{ ...S.textarea, minHeight: 100 }} value={form.body} onChange={e => set("body", e.target.value)} /></div>
      <div style={{ ...S.flex(10), justifyContent: "flex-end" }}>
        <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
        <button style={S.btn("blue")} onClick={() => onSend({ ...form, toId: form.toType === "kişi" ? form.toId : null, toDeptId: form.toType === "departman" ? form.toDeptId : null })}><Icon name="send" size={14} /> Gönder</button>
      </div>
    </div>
  );
}

// ─── FILE REQUESTS ────────────────────────────────────────────────────────────
function FileRequestsPage({ fileRequests, users, depts, currentUser, userProfile }) {
  const [tab, setTab] = useState("gelen");
  const [compose, setCompose] = useState(false);
  const [responding, setResponding] = useState(null);
  const [responseText, setResponseText] = useState("");
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const incoming = fileRequests.filter(f => f.toDeptId === userProfile?.deptId || hasAdminRole(userProfile?.role));
  const outgoing = fileRequests.filter(f => f.fromId === currentUser?.uid);
  const list = tab === "gelen" ? incoming : outgoing;

  const sendRequest = async fr => {
    await addDoc(collection(db, "fileRequests"), { ...fr, fromId: currentUser.uid, status: "bekliyor", createdAt: new Date().toISOString(), response: null });
    setCompose(false);
  };
  const respond = async id => {
    await updateDoc(doc(db, "fileRequests", id), { status: "tamamlandı", response: responseText.trim() });
    setResponding(null);
    setResponseText("");
  };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div style={S.flex(8)}>
          <button style={S.btn(tab === "gelen" ? "primary" : "ghost")} onClick={() => setTab("gelen")}>Gelen</button>
          <button style={S.btn(tab === "giden" ? "primary" : "ghost")} onClick={() => setTab("giden")}>Gönderilenler</button>
        </div>
        <button style={S.btn("blue")} onClick={() => setCompose(true)}><Icon name="plus" size={14} /> Dosya Talep Et</button>
      </div>
      <div style={S.card}>
        {list.length === 0 ? <div style={S.empty}>Dosya talebi yok</div> : (
          <table style={S.table}>
            <thead><tr>{["Konu", "Talep Eden", "Tarih", "Durum", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{list.map(f => (
              <tr key={f.id}>
                <td style={S.td}><div style={{ fontWeight: 600 }}>{f.subject}</div><div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{f.desc}</div></td>
                <td style={S.td}>{getName(f.fromId)}</td>
                <td style={S.td}>{timeAgo(f.createdAt)}</td>
                <td style={S.td}><span style={S.badge(STATUS[f.status]?.color || "#999")}>{STATUS[f.status]?.label}</span></td>
                <td style={S.td}>
                  {tab === "gelen" && f.status === "bekliyor" && <button style={S.btn("green")} onClick={() => { setResponding(f.id); setResponseText(""); }}><Icon name="check" size={13} /> Yanıtla</button>}
                  {f.response && <div style={{ fontSize: 12, color: "#636366", marginTop: 4 }}><strong>Yanıt:</strong> {f.response}</div>}
                  {responding === f.id && <div style={{ marginTop: 8 }}>
                    <textarea style={{ ...S.textarea, minHeight: 56, marginBottom: 6 }} value={responseText} onChange={e => setResponseText(e.target.value)} />
                    <div style={S.flex(6)}><button style={S.btn("ghost")} onClick={() => setResponding(null)}>İptal</button><button style={S.btn("green")} onClick={() => respond(f.id)}>Onayla</button></div>
                  </div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {compose && <Modal title="Dosya Talebi" onClose={() => setCompose(false)}>
        <FileRequestForm depts={depts} userProfile={userProfile} onSend={sendRequest} onClose={() => setCompose(false)} />
      </Modal>}
    </div>
  );
}

function FileRequestForm({ depts, userProfile, onSend, onClose }) {
  const [form, setForm] = useState({ toDeptId: depts[0]?.id || "", subject: "", desc: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div><label style={S.label}>Talep Edilen Departman</label><select style={S.select} value={form.toDeptId} onChange={e => set("toDeptId", e.target.value)}>{depts.filter(d => d.id !== userProfile?.deptId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div><label style={S.label}>Konu</label><input style={S.input} value={form.subject} onChange={e => set("subject", e.target.value)} /></div>
      <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={form.desc} onChange={e => set("desc", e.target.value)} /></div>
      <div style={{ ...S.flex(10), justifyContent: "flex-end" }}><button style={S.btn("ghost")} onClick={onClose}>İptal</button><button style={S.btn("blue")} onClick={() => onSend(form)}><Icon name="file" size={14} /> Gönder</button></div>
    </div>
  );
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
function AttendancePage({ attendance, users, depts, currentUser, userProfile }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedUser, setSelectedUser] = useState("all");
  const [reportMonth, setReportMonth] = useState(today().slice(0, 7));
  const roleRestrictedDept = hasAdminRole(userProfile?.role) ? null : userProfile?.deptId;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || "—";

  const generateMonthlyAttendanceReport = () => {
    const ml = monthLabel(reportMonth);
    const base = roleRestrictedDept ? attendance.filter(r => r.deptId === roleRestrictedDept) : attendance;
    const monthRecords = base.filter(r => r.date && r.date.startsWith(reportMonth));

    // Kişi bazlı gruplama
    const byUser = {};
    monthRecords.forEach(r => {
      if (!byUser[r.userId]) byUser[r.userId] = { name: getName(r.userId), dept: getDept(r.deptId), katildi: 0, gelmedi: 0, izinli: 0, records: [] };
      if (r.status === "katildi") byUser[r.userId].katildi++;
      else if (r.status === "gelmedi") byUser[r.userId].gelmedi++;
      else if (r.status === "izinli") byUser[r.userId].izinli++;
      byUser[r.userId].records.push(r);
    });

    const totKatildi = monthRecords.filter(r => r.status === "katildi").length;
    const totGelmedi = monthRecords.filter(r => r.status === "gelmedi").length;
    const totIzinli  = monthRecords.filter(r => r.status === "izinli").length;
    const katilimOrani = monthRecords.length ? Math.round((totKatildi / monthRecords.length) * 100) : 0;

    // Her kişi için ayrı kart
    const personCards = Object.values(byUser)
      .sort((a, b) => b.gelmedi + b.izinli - (a.gelmedi + a.izinli))
      .map(u => {
        const absentRecords = u.records
          .filter(r => r.status === "gelmedi" || r.status === "izinli")
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const absentBlock = absentRecords.length === 0
          ? `<p style="color:#2A7A62;font-size:12px;margin:6px 0 0">Bu dönemde devamsızlık kaydı bulunmamaktadır.</p>`
          : `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">
               <tr style="background:#f0f0f0">
                 <td style="padding:5px 8px;font-weight:700;width:22%">Tarih</td>
                 <td style="padding:5px 8px;font-weight:700;width:28%">Toplantı</td>
                 <td style="padding:5px 8px;font-weight:700;width:15%">Durum</td>
                 <td style="padding:5px 8px;font-weight:700;width:35%">Mazeret</td>
               </tr>
               ${absentRecords.map(r => `
                 <tr style="border-bottom:1px solid #e8e8e8;vertical-align:top">
                   <td style="padding:6px 8px;color:#444">${fmtDate(r.date)}</td>
                   <td style="padding:6px 8px;word-break:break-word">${r.meetingTitle || "Toplantı"}</td>
                   <td style="padding:6px 8px;font-weight:700;color:${r.status === "gelmedi" ? "#8B0000" : "#B98B2C"}">${r.status === "gelmedi" ? "Gelmedi" : "İzinli"}</td>
                   <td style="padding:6px 8px;color:#555;word-break:break-word;white-space:pre-wrap">${r.excuse || "<span style='color:#aaa;font-style:italic'>Mazeret girilmemiş</span>"}</td>
                 </tr>`).join("")}
             </table>`;

        const statusColor = (u.gelmedi >= 3) ? "#8B0000" : (u.gelmedi > 0 || u.izinli > 0) ? "#B98B2C" : "#2A7A62";
        return `
          <div style="border:1px solid #ddd;border-radius:8px;padding:14px 16px;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
              <div>
                <span style="font-size:14px;font-weight:700;color:#1a1a1a">${u.name}</span>
                <span style="font-size:12px;color:#667085;margin-left:8px">${u.dept}</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                <span style="background:#e8f5e9;color:#2A7A62;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ Katıldı: ${u.katildi}</span>
                ${u.gelmedi > 0 ? `<span style="background:#fde8e8;color:#8B0000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✗ Gelmedi: ${u.gelmedi}</span>` : ""}
                ${u.izinli > 0  ? `<span style="background:#fef3cd;color:#8A6000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">~ İzinli: ${u.izinli}</span>` : ""}
                <span style="background:#f0f0f0;color:#444;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">Toplam: ${u.katildi + u.gelmedi + u.izinli}</span>
              </div>
            </div>
            ${u.gelmedi >= 3 ? `<div style="background:#fde8e8;border-left:3px solid #8B0000;padding:4px 10px;font-size:11px;color:#8B0000;font-weight:700;margin-bottom:6px">⚠ Devamsızlık uyarısı: ${u.gelmedi} kez gelmedi</div>` : ""}
            ${absentBlock}
          </div>`;
      }).join("");

    const html = `
      <h1>Aylık Devamsızlık Denetim Raporu</h1>
      <table style="margin-bottom:20px">
        <tr><td>Dönem</td><td><strong>${ml}</strong></td></tr>
        <tr><td>Toplam Kayıt</td><td>${monthRecords.length}</td></tr>
        <tr><td>Toplam Katıldı</td><td style="color:#2A7A62;font-weight:700">${totKatildi}</td></tr>
        <tr><td>Toplam Gelmedi</td><td style="color:#8B0000;font-weight:700">${totGelmedi}</td></tr>
        <tr><td>Toplam İzinli</td><td style="color:#B98B2C;font-weight:700">${totIzinli}</td></tr>
        <tr><td>Katılım Oranı</td><td style="font-weight:700">${katilimOrani}%</td></tr>
      </table>
      <h2>Kişi Bazlı Devamsızlık Detayı</h2>
      ${personCards || "<p style='color:#8A8A8E;text-align:center'>Bu dönemde kayıt bulunamadı.</p>"}
    `;

    openPrintableReport({ title: `Devamsızlık Raporu — ${ml}`, bodyHtml: html });
  };
  const statusLabel = {
    katildi: "Katildi",
    gelmedi: "Gelmedi",
    izinli: "Izinli",
  };
  const scopedRecords = useMemo(() => {
    return attendance
      .filter(r => !roleRestrictedDept || r.deptId === roleRestrictedDept)
      .filter(r => selectedDept === "all" || r.deptId === selectedDept)
      .sort((a, b) => (a.meetingTitle || "").localeCompare(b.meetingTitle || "", "tr"));
  }, [attendance, selectedDept, roleRestrictedDept]);

  const records = useMemo(() => {
    return scopedRecords.filter(r => r.date === selectedDate);
  }, [scopedRecords, selectedDate]);

  const userOptions = useMemo(() => {
    const ids = Array.from(new Set(scopedRecords.map(r => r.userId).filter(Boolean)));
    return ids
      .map(id => ({ id, name: getName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [scopedRecords]);

  const personTotals = useMemo(() => {
    if (selectedUser === "all") return { present: 0, absent: 0, excused: 0, total: 0, totalAbsence: 0 };
    const list = scopedRecords.filter(r => r.userId === selectedUser);
    const present = list.filter(r => r.status === "katildi").length;
    const absent = list.filter(r => r.status === "gelmedi").length;
    const excused = list.filter(r => r.status === "izinli").length;
    return { present, absent, excused, total: list.length, totalAbsence: absent + excused };
  }, [scopedRecords, selectedUser]);

  const visibleRecords = useMemo(() => {
    if (selectedUser === "all") return records;
    return records.filter(r => r.userId === selectedUser);
  }, [records, selectedUser]);

  const stats = records.reduce((acc, r) => {
    const status = r.status;
    if (status === "katildi") acc.present += 1;
    if (status === "gelmedi") acc.absent += 1;
    if (status === "izinli") acc.excused += 1;
    return acc;
  }, { present: 0, absent: 0, excused: 0 });

  return (
    <div style={{ background: "#F3F3F4", border: "1px solid #E6E6E8", borderRadius: 20, padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div style={{ ...S.card, borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ ...S.cardTitle, marginBottom: 10 }}>Kişi Toplam Devamsızlık</div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Kişi</label>
            <select style={S.select} value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="all">Kişi seçin</option>
              {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ border: "1px solid #ECECEF", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            {[ ["Toplam Devamsızlık", personTotals.totalAbsence, personTotals.totalAbsence >= 3 ? ROMA_RED : "#171717"], ["Gelmedi", personTotals.absent, personTotals.absent > 0 ? ROMA_RED : "#171717"], ["İzinli", personTotals.excused, GOLD], ["Katıldı", personTotals.present, "#30D158"], ["Toplam Kayıt", personTotals.total, "#171717"] ].map(([label, value, color], i) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: i === 4 ? "none" : "1px solid #F1F1F3", fontSize: 12.5 }}>
                <span style={{ color: "#64635F" }}>{label}</span>
                <strong style={{ color }}>{value}</strong>
              </div>
            ))}
          </div>
          {selectedUser !== "all" && (() => {
            const history = scopedRecords
              .filter(r => r.userId === selectedUser && (r.status === "gelmedi" || r.status === "izinli"))
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            if (history.length === 0) return <div style={{ fontSize: 12, color: "#8A8A8E", textAlign: "center", padding: "8px 0" }}>Devamsızlık kaydı yok</div>;
            return (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#98A2B3", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Devamsızlık Geçmişi</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {history.map(r => (
                    <div key={r.id} style={{ background: "#F9F9FB", borderRadius: 8, padding: "8px 10px", border: "1px solid #ECECEF" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: r.excuse ? 4 : 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1D2939" }}>{r.meetingTitle || "Toplantı"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#8A8A8E" }}>{fmtDate(r.date)}</span>
                          <span style={{ ...S.badge(r.status === "gelmedi" ? ROMA_RED : GOLD), fontSize: 10 }}>{r.status === "gelmedi" ? "Gelmedi" : "İzinli"}</span>
                        </div>
                      </div>
                      {r.excuse && <div style={{ fontSize: 11.5, color: "#636366", fontStyle: "italic" }}>Mazeret: {r.excuse}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Aylık PDF Rapor Satırı */}
          <div style={{ ...S.card, borderRadius: 16, padding: "12px 16px", background: "#FAFBFF", border: "1px solid #D9E4F5" }}>
            <div style={{ ...S.flexBetween, gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#4F4D49", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.7 }}>Aylık Devamsızlık Raporu</div>
                <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>Seçilen aya ait tüm devamsızlık kaydını PDF olarak indirin</div>
              </div>
              <div style={{ ...S.flex(8), flexWrap: "wrap" }}>
                <div>
                  <label style={S.label}>Ay / Yıl</label>
                  <input type="month" style={{ ...S.input, width: 160 }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
                </div>
                <button style={{ ...S.btn("blue"), marginTop: 20 }} onClick={generateMonthlyAttendanceReport}>
                  <Icon name="download" size={14} /> PDF İndir
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...S.card, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ ...S.flexBetween, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <label style={S.label}>Tarih</label>
                  <input type="date" style={{ ...S.input, width: 170 }} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Departman</label>
                  <select style={{ ...S.select, width: 190 }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                    <option value="all">Tum Departmanlar</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(94px,1fr))", gap: 8, width: "100%", maxWidth: 460 }}>
                {[ ["Katildi", stats.present, "#2A7A62"], ["Gelmedi", stats.absent, ROMA_RED], ["Izinli", stats.excused, GOLD], ["Kayit", records.length, STOIC_NAVY] ].map(([label, num, color]) => (
                  <div key={label} style={{ border: "1px solid #ECECEF", borderRadius: 12, padding: "9px 10px", background: "#FFFFFF" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{num}</div>
                    <div style={{ fontSize: 11, color: "#6B6B65" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...S.card, borderRadius: 16, padding: "8px 0 0" }}>
            <table style={S.table}>
              <thead>
                <tr>{["Toplanti", "Kisi", "Departman", "Durum", "Mazeret", "Kaynak"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRecords.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#8A8A8E" }}>Kayit bulunamadi</td></tr>
                ) : visibleRecords.map(r => {
                  const status = r.status;
                  return (
                    <tr key={r.id}>
                      <td style={S.td}><strong>{r.meetingTitle || "Toplanti"}</strong></td>
                      <td style={S.td}>{getName(r.userId)}</td>
                      <td style={S.td}>{r.deptId ? getDept(r.deptId) : "—"}</td>
                      <td style={S.td}>
                        <span style={S.badge(status === "katildi" ? "#2A7A62" : status === "gelmedi" ? ROMA_RED : status === "izinli" ? GOLD : "#8A8A8E")}>{statusLabel[status] || "—"}</span>
                      </td>
                      <td style={{ ...S.td, maxWidth: 260, color: "#66645F", wordBreak: "break-word", whiteSpace: "normal", lineHeight: 1.5 }}>{r.excuse || "—"}</td>
                      <td style={S.td}><span style={S.tag}>{r.source === "meeting-report" ? "Toplanti" : "Manuel"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ORG TREE ─────────────────────────────────────────────────────────────────
function OrgTreePage({ users, depts, userProfile }) {
  const [selected, setSelected] = useState(null);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  const nodeColor = r => {
    if (hasAdminRole(r)) return ROMA_RED;
    if (["Departman Yöneticisi", "Departman Üyesi"].includes(r)) return STOIC_NAVY;
    return "#30D158";
  };

  // Build tree roots: Başkan/Admin users at top
  const roots = users.filter(u => hasAdminRole(u.role));

  function getChildren(user) {
    const explicit = users.filter(u => u.managerId === user.id);
    const explicitIds = new Set(explicit.map(c => c.id));
    let implicit = [];

    if (hasAdminRole(user.role)) {
      // 1. Departman Yöneticileri doğrudan Başkana bağlanır
      const deptManagers = users.filter(u => 
        u.role === "Departman Yöneticisi" && 
        !u.managerId && 
        !explicitIds.has(u.id)
      );
      
      // 2. Kendi departmanında "Departman Yöneticisi" olmayan üyeler yetim kalıp gizlenmesin diye doğrudan Başkana bağlanır
      const orphanedMembers = users.filter(u => {
        if (hasAdminRole(u.role) || u.role === "Departman Yöneticisi" || u.managerId || explicitIds.has(u.id)) return false;
        const hasManagerInDept = users.some(other => other.deptId === u.deptId && other.role === "Departman Yöneticisi");
        return !hasManagerInDept;
      });

      implicit = [...deptManagers, ...orphanedMembers];
    } else if (user.role === "Departman Yöneticisi") {
      // 3. Departman Yöneticisine doğrudan bağlı olanlar, aynı departmandaki diğer normal üyelerdir
      implicit = users.filter(u => 
        !hasAdminRole(u.role) && 
        u.role !== "Departman Yöneticisi" && 
        u.deptId === user.deptId && 
        !u.managerId && 
        !explicitIds.has(u.id)
      );
    }

    return [...explicit, ...implicit];
  }

  function OrgNode({ user }) {
    const children = getChildren(user);
    const isSel = selected === user.id;
    const rc = nodeColor(user.role);

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Card */}
        <div
          onClick={() => setSelected(isSel ? null : user.id)}
          style={{
            background: isSel ? STOIC_NAVY : "#FFFFFF",
            color: isSel ? "#F7F7F5" : "#161513",
            border: `1px solid ${isSel ? STOIC_NAVY : "#E5E5E5"}`,
            borderTop: `3px solid ${rc}`,
            borderRadius: 10,
            padding: "10px 14px",
            minWidth: 160,
            cursor: "pointer",
            boxShadow: isSel ? "0 4px 16px rgba(0,0,0,.14)" : "0 2px 8px rgba(0,0,0,.06)",
          }}
        >
          <div style={{ ...S.flex(8), marginBottom: 6 }}>
            <div style={{ ...S.avatar(avatarColor(user.id)), width: 30, height: 30, fontSize: 10 }}>
              {user.avatar || user.name?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 10.5, color: isSel ? "rgba(255,255,255,.6)" : "#8A8A8E" }}>
                {user.title || displayRole(user.role)}
              </div>
            </div>
          </div>
          <div style={{ ...S.flex(6), flexWrap: "wrap", gap: 5 }}>
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: rc + "22", color: rc, fontWeight: 600 }}>
              {displayRole(user.role)}
            </span>
            {!hasAdminRole(user.role) && user.deptId && (
              <span style={{ fontSize: 10, color: isSel ? "rgba(255,255,255,.5)" : "#8A8A8E" }}>
                {getDept(user.deptId)}
              </span>
            )}
          </div>
        </div>

        {/* Connector + children */}
        {children.length > 0 && (
          <>
            {/* Vertical stem from parent */}
            <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />

            {children.length === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />
                <OrgNode user={children[0]} />
              </div>
            ) : (
              /* Railroad connector: gap=0, padding creates spacing so adjacent bars touch */
              <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
                {children.map((child, i) => (
                  <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 14px" }}>
                    {/* Top bar — gradient hides outside half on edge nodes */}
                    <div style={{
                      alignSelf: "stretch",
                      height: 2,
                      background:
                        i === 0
                          ? "linear-gradient(to right, transparent 50%, #D0D0D0 50%)"
                          : i === children.length - 1
                            ? "linear-gradient(to right, #D0D0D0 50%, transparent 50%)"
                            : "#D0D0D0",
                    }} />
                    <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />
                    <OrgNode user={child} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const selUser = users.find(u => u.id === selected);
  return (
    <div>
      <div style={{ ...S.card, overflow: "auto", marginBottom: selUser ? 14 : 0 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 24px", minWidth: 560 }}>
          {roots.length === 0 ? (
            <div style={S.empty}>"Başkan" rolünde kullanıcı bulunamadı</div>
          ) : roots.length === 1 ? (
            <OrgNode user={roots[0]} />
          ) : (
            <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
              {roots.map(r => <OrgNode key={r.id} user={r} />)}
            </div>
          )}
        </div>
      </div>
      {selUser && (
        <div style={{ ...S.card, ...S.flex(16) }}>
          <div style={{ ...S.avatar(avatarColor(selUser.id)), width: 52, height: 52, fontSize: 16 }}>
            {selUser.avatar || selUser.name?.[0]}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{selUser.name}</div>
            <div style={{ fontSize: 13, color: "#636366" }}>{selUser.title} · {displayRole(selUser.role)}</div>
            <div style={{ fontSize: 12.5, color: "#8A8A8E" }}>{selUser.email}</div>
            <div style={{ ...S.flex(8), flexWrap: "wrap", marginTop: 8 }}>
              {selUser.deptId && <span style={S.tag}>{getDept(selUser.deptId)}</span>}
              {selUser.managerId && (
                <span style={S.tag}>Üst: {users.find(u => u.id === selUser.managerId)?.name}</span>
              )}
              {getChildren(selUser).length > 0 && (
                <span style={S.tag}>{getChildren(selUser).length} kişi yönetiyor</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");

  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [fileRequests, setFileRequests] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [registrations, setRegistrations] = useState([]);

  // Auth listener — silinen kullanıcılar kara listede kontrol edilir
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        try {
          // UID ile kara liste kontrolü
          const delSnap = await getDoc(doc(db, "deletedUsers", user.uid));
          if (delSnap.exists()) {
            await signOut(auth);
            setCurrentUser(null);
            setAuthLoading(false);
            return;
          }
          // E-posta ile kara liste kontrolü
          if (user.email) {
            const delByEmail = await getDocs(query(collection(db, "deletedUsers"), where("email", "==", user.email.toLowerCase()), limit(1)));
            if (!delByEmail.empty) {
              await signOut(auth);
              setCurrentUser(null);
              setAuthLoading(false);
              return;
            }
          }
        } catch (err) {
          console.error("Kara liste kontrolü başarısız:", err);
        }
      }
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load user profile
  useEffect(() => {
    if (!currentUser) { setUserProfile(null); return; }
    const userRef = doc(db, "users", currentUser.uid);
    const unsub = onSnapshot(userRef, async snap => {
      if (snap.exists()) {
        const data = snap.data();
        let normalizedRole = normalizeRole(data.role);

        // Otomatik olarak Yusuf'u Başkan yap
        if (data.email === "yusufuveyik@gmail.com" && normalizedRole !== "Başkan") {
          normalizedRole = "Başkan";
          await updateDoc(userRef, { role: "Başkan", title: "Başkan" });
        }

        setUserProfile({ id: snap.id, ...data, role: normalizedRole });
        return;
      }

      // Kara liste: bu kullanıcı silinmiş mi?
      try {
        const delSnap = await getDoc(doc(db, "deletedUsers", currentUser.uid));
        if (delSnap.exists()) { await signOut(auth); return; }
        if (currentUser.email) {
          const delByEmail = await getDocs(query(collection(db, "deletedUsers"), where("email", "==", currentUser.email.toLowerCase()), limit(1)));
          if (!delByEmail.empty) { await signOut(auth); return; }
        }
      } catch (_) {}

      // If UID changed, try to recover existing profile by email automatically.
      if (currentUser.email) {
        try {
          const byEmail = await getDocs(query(collection(db, "users"), where("email", "==", currentUser.email), limit(1)));
          if (!byEmail.empty) {
            const legacyData = byEmail.docs[0].data();
            const normalizedRole = normalizeRole(legacyData.role);
            await setDoc(userRef, {
              ...legacyData,
              email: currentUser.email,
              role: normalizedRole,
              migratedFromUidChange: true,
            }, { merge: true });
            return;
          }
        } catch (err) {
          console.error("E-posta ile profil geri yükleme başarısız:", err);
        }
      }

      // Bootstrap profile automatically: first user becomes Admin.
      try {
        const firstUserSnap = await getDocs(query(collection(db, "users"), limit(1)));
        const role = firstUserSnap.empty ? "Başkan" : "Üye";
        const fallbackName = (currentUser.email || "Kullanici").split("@")[0];
        const name = currentUser.displayName || fallbackName;

        await setDoc(userRef, {
          name,
          email: currentUser.email || "",
          role,
          deptId: null,
          title: role === "Başkan" ? "Yönetici" : "",
          avatar: name.slice(0, 2).toUpperCase(),
          managerId: null,
          createdAt: serverTimestamp(),
          autoCreated: true,
        });
      } catch (err) {
        console.error("Kullanici profili olusturulamadi:", err);
      }
    });
    return unsub;
  }, [currentUser]);

  // Realtime listeners
  useEffect(() => {
    if (!currentUser) return;
    const subs = [
      onSnapshot(collection(db, "users"), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "depts"), s => setDepts(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "tasks"), s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "meetings"), s => setMeetings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "messages"), s => setMessages(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "fileRequests"), s => setFileRequests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "attendance"), s => setAttendance(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "registrations"), s => setRegistrations(s.docs.map(d => ({ id: d.id, ...d.data() })))),
    ];
    return () => subs.forEach(u => u());
  }, [currentUser]);

  const pendingMsgs = messages.filter(m => (m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId) && m.status === "bekliyor").length;
  const pendingRegs = hasSuperRole(userProfile?.role) ? registrations.filter(r => r.status === "bekliyor").length : 0;

  if (authLoading) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Yükleniyor...</div>;
  if (!currentUser) return <LoginPage onLogin={u => setCurrentUser(u)} />;
  if (!userProfile) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Profil yükleniyor...</div>;

  const isDenetmen = isDenetmenRole(userProfile?.role);
  const canAudit = hasSuperRole(userProfile?.role) || isDenetmen;
  const rLevel = roleLevel(userProfile?.role);

  // Nav grupları role göre filtrelenir
  const NAV_GROUPS = (() => {
    if (isDenetmen) {
      // Denetmen: sadece Denetim paneli
      return [{ label: "Denetim", items: [{ id: "audit", label: "Denetim", icon: "reports" }] }];
    }
    const genel = { label: "Genel", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "tasks", label: "Görevler", icon: "tasks" }, { id: "meetings", label: "Toplantılar", icon: "calendar" }, { id: "attendance", label: "Devamsızlık", icon: "check" }] };
    const iletisim = { label: "İletişim", items: [{ id: "messages", label: "Mesajlar", icon: "inbox", badge: pendingMsgs }] };
    if (rLevel === 0) {
      // Başkan / Teknik Yönetici: tam erişim
      return [
        genel,
        { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }, { id: "userlist", label: "Kullanıcılar", icon: "users", badge: pendingRegs }] },
        iletisim,
        { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }, { id: "audit", label: "Denetim", icon: "reports" }] },
      ];
    }
    if (rLevel === 1) {
      // Departman Yöneticisi: kendi departmanı kapsamında
      return [
        genel,
        { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }] },
        iletisim,
        { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }] },
      ];
    }
    // Departman Üyesi — yönetim ağacını görebilir
    return [
      genel,
      { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }] },
      iletisim,
    ];
  })();
  const TITLES = { dashboard: "Dashboard", tasks: "Görev Yönetimi", meetings: "Toplantılar", attendance: "Devamsızlık Takibi", orgtree: "Yönetim Ağacı", departments: "Departmanlar", userlist: "Kullanıcılar", messages: "Mesajlar", reports: "Raporlar", audit: "Denetim Paneli" };
  const props = { tasks, meetings, depts, users, messages, fileRequests, attendance, currentUser, userProfile, registrations };

  const noAccess = <div style={S.card}><div style={S.empty}>Bu sayfaya erişim yetkiniz yok.</div></div>;
  const renderPage = () => {
    // Denetmen sadece audit sayfasına erişebilir
    if (isDenetmen && page !== "audit") return noAccess;
    switch (page) {
      case "dashboard": return <Dashboard {...props} />;
      case "tasks": return <TasksPage {...props} />;
      case "meetings": return <MeetingsPage {...props} />;
      case "attendance": return <AttendancePage {...props} />;
      case "orgtree": return <OrgTreePage {...props} />;
      case "departments": return <DepartmentsPage {...props} />;
      case "userlist": return hasSuperRole(userProfile?.role) ? <UsersPage {...props} /> : noAccess;
      case "messages": return <MessagesPage {...props} />;
      case "reports": return <ReportsPage {...props} />;
      case "audit": return canAudit ? <AuditPage {...props} /> : noAccess;
      default: return null;
    }
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={{ padding: "16px 14px 14px", borderBottom: "1px solid #E4E7EC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 17, fontWeight: 800, color: "#101828", letterSpacing: 1.2 }}>
            <img src={marcusLogo} alt="Marcus logo" style={{ width: 30, height: 30, objectFit: "contain" }} />
            <span>MARCUS</span>
          </div>
        </div>
        <nav style={S.nav}>
          {NAV_GROUPS.map(g => (
            <div key={g.label}>
              <div style={S.navSection}>{g.label}</div>
              {g.items.map(n => (
                <div key={n.id} style={S.navItem(page === n.id)} onClick={() => setPage(n.id)}>
                  <Icon name={n.icon} size={16} />
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {n.badge > 0 && <span style={{ background: "#111827", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{n.badge}</span>}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: "0 8px" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 10, padding: "10px 12px", border: "1px solid #E4E7EC" }}>
            <div style={S.flex(8)}>
              <div style={{ ...S.avatar(avatarColor(currentUser.uid)), width: 28, height: 28, fontSize: 10 }}>{userProfile.avatar || userProfile.name?.[0]}</div>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: "#101828" }}>{userProfile.name}</div><div style={{ fontSize: 10.5, color: "#667085" }}>{userProfile.role}</div></div>
            </div>
            <button onClick={() => signOut(auth)} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, color: "#475467", fontSize: 11.5, cursor: "pointer", background: "none", border: "none", padding: 0, fontWeight: 700, fontFamily: "inherit" }}>
              <Icon name="logout" size={13} /> Çıkış Yap
            </button>
          </div>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 24, borderRadius: 2, background: "#111827" }} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: "#101828", lineHeight: 1 }}>{TITLES[page]}</div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "#667085" }}>{new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
        <div style={S.content}>{renderPage()}</div>
      </div>
    </div>
  );
}

// ─── AUDIT ───────────────────────────────────────────────────────────────────
function AuditPage({ attendance, tasks, users, depts, meetings, currentUser }) {
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const [taskReportMonth, setTaskReportMonth] = useState(today().slice(0, 7));

  // Users with 3+ "gelmedi" absences
  const absenceCounts = {};
  attendance.forEach(r => {
    if (r.status === "gelmedi") {
      absenceCounts[r.userId] = (absenceCounts[r.userId] || 0) + 1;
    }
  });
  const absentWarnings = Object.entries(absenceCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  // Delayed tasks
  const delayedTasks = tasks.filter(t => t.status === "gecikmeli");

  // Tasks pending approval
  const pendingApproval = tasks.filter(t => t.status === "yapıldı");

  // Bekleyen mazaretler — tüm toplantılardan topla
  const pendingExcuses = [];
  (meetings || []).forEach(m => {
    const excuses = m.excuses || {};
    const statuses = m.excuseStatuses || {};
    Object.entries(excuses).forEach(([userId, reason]) => {
      const st = statuses[userId] || "bekliyor";
      pendingExcuses.push({
        meetingId: m.id, meetingTitle: m.title, meetingDate: m.datetime,
        deptId: m.deptId, userId, reason, status: st,
      });
    });
  });
  const bekleyenExcuses = pendingExcuses.filter(e => e.status === "bekliyor");

  const approveExcuse = async (ex) => {
    const meeting = (meetings || []).find(m => m.id === ex.meetingId);
    if (!meeting) return;
    try {
      const excuseStatuses = { ...(meeting.excuseStatuses || {}), [ex.userId]: "onaylı" };
      await updateDoc(doc(db, "meetings", ex.meetingId), { excuseStatuses });
      // Devamsızlık kaydını izinli olarak güncelle
      await setDoc(doc(db, "attendance", `${ex.meetingId}_${ex.userId}`), {
        meetingId: ex.meetingId, meetingTitle: ex.meetingTitle,
        userId: ex.userId, date: dayFromDateTime(ex.meetingDate),
        deptId: ex.deptId || null, status: "izinli", excuse: ex.reason,
        source: "meeting-report", updatedBy: currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) { alert("Hata: " + e.message); }
  };

  const rejectExcuse = async (ex) => {
    const meeting = (meetings || []).find(m => m.id === ex.meetingId);
    if (!meeting) return;
    try {
      const excuseStatuses = { ...(meeting.excuseStatuses || {}), [ex.userId]: "reddedildi" };
      await updateDoc(doc(db, "meetings", ex.meetingId), { excuseStatuses });
    } catch (e) { alert("Hata: " + e.message); }
  };

  const generateMonthlyTaskReport = () => {
    const ml = monthLabel(taskReportMonth);
    // Hem startDate hem endDate'e göre bu aya ait görevler
    const monthTasks = tasks.filter(t => {
      const d = t.endDate || t.startDate || "";
      return d.slice(0, 7) === taskReportMonth;
    });

    const tamamlandi = monthTasks.filter(t => t.status === "tamamlandı");
    const yapildi    = monthTasks.filter(t => t.status === "yapıldı");
    const gecikmeli  = monthTasks.filter(t => t.status === "gecikmeli");
    const devam      = monthTasks.filter(t => t.status === "devam");
    const planlandi  = monthTasks.filter(t => t.status === "planlandı");

    const taskRow = t =>
      `<tr><td>${t.title}${t.desc ? `<div style="font-size:11px;color:#8A8A8E">${t.desc}</div>` : ""}</td>` +
      `<td>${getDept(t.deptId)}</td>` +
      `<td>${(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(getName).join(", ")}</td>` +
      `<td>${fmtDate(t.endDate || t.startDate)}</td>` +
      `<td style="color:${t.status === "tamamlandı" ? "#30D158" : t.status === "gecikmeli" ? "#8B0000" : "#B98B2C"};font-weight:700">${{ tamamlandı: "Tamamlandı", yapıldı: "Teslim Edildi", gecikmeli: "Gecikmeli", devam: "Devam Ediyor", "planlandı": "Planlandı" }[t.status] || t.status}</td>` +
      `${t.mazeretGecikme ? `<td style="font-style:italic;color:#636366;font-size:12px">${t.mazeretGecikme}</td>` : "<td>—</td>"}` +
      `</tr>`;

    const section = (emoji, title, list, showMazeret = false) =>
      list.length === 0 ? "" :
      `<h2>${emoji} ${title} (${list.length})</h2>
      <table>
        <tr style="background:#f7f3f2">
          <td><b>Görev</b></td><td><b>Departman</b></td><td><b>Atananlar</b></td><td><b>Bitiş</b></td><td><b>Durum</b></td><td><b>${showMazeret ? "Gecikme Mazereti" : "Notlar"}</b></td>
        </tr>
        ${list.map(taskRow).join("")}
      </table>`;

    openPrintableReport({
      title: `Görev Denetim Raporu — ${ml}`,
      bodyHtml: `
        <h1>Aylık Görev Denetim Raporu</h1>
        <table>
          <tr><td>Dönem</td><td><strong>${ml}</strong></td></tr>
          <tr><td>Toplam Görev</td><td>${monthTasks.length}</td></tr>
          <tr><td>Tamamlandı</td><td style="color:#30D158;font-weight:700">${tamamlandi.length}</td></tr>
          <tr><td>Teslim Edildi (Onay Bekliyor)</td><td style="color:#B98B2C;font-weight:700">${yapildi.length}</td></tr>
          <tr><td>Gecikmeli</td><td style="color:#8B0000;font-weight:700">${gecikmeli.length}</td></tr>
          <tr><td>Devam Ediyor</td><td style="color:#1B1D22;font-weight:700">${devam.length}</td></tr>
          <tr><td>Planlandı</td><td>${planlandi.length}</td></tr>
          <tr><td>Tamamlanma Oranı</td><td style="font-weight:700">${monthTasks.length ? Math.round(((tamamlandi.length + yapildi.length) / monthTasks.length) * 100) : 0}%</td></tr>
        </table>
        ${section("✓", "Tamamlanan Görevler", tamamlandi)}
        ${section("⏳", "Teslim Edildi — Onay Bekleyen", yapildi)}
        ${section("⚠", "Gecikmeli Görevler", gecikmeli, true)}
        ${section("▸", "Devam Eden Görevler", devam)}
        ${section("·", "Planlandı", planlandi)}
      `,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          ["Devamsızlık Uyarısı", absentWarnings.length, ROMA_RED],
          ["Bekleyen Mazaret", bekleyenExcuses.length, GOLD],
          ["Gecikmeli Görev", delayedTasks.length, "#8A6A16"],
          ["Onay Bekleyen Görev", pendingApproval.length, STOIC_NAVY],
        ].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>{num}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Bekleyen Mazaretler */}
      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: GOLD }}>📋 Bekleyen Mazaret Talepleri</div>
        {bekleyenExcuses.length === 0 ? (
          <div style={S.empty}>Onay bekleyen mazaret talebi yok</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>{["Kişi", "Toplantı", "Tarih", "Mazeret", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {bekleyenExcuses.map((ex, i) => {
                const u = users.find(x => x.id === ex.userId);
                return (
                  <tr key={i}>
                    <td style={S.td}>
                      <div style={S.flex(7)}>
                        <div style={{ ...S.avatar(avatarColor(ex.userId)), width: 28, height: 28, fontSize: 10 }}>{u?.avatar || u?.name?.[0] || "?"}</div>
                        <strong>{getName(ex.userId)}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: "#8A8A8E", marginTop: 2, marginLeft: 35 }}>{getDept(ex.deptId)}</div>
                    </td>
                    <td style={S.td}><strong>{ex.meetingTitle}</strong></td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmtDateTime(ex.meetingDate)}</td>
                    <td style={{ ...S.td, maxWidth: 280, wordBreak: "break-word", whiteSpace: "normal", color: "#444", lineHeight: 1.5 }}>{ex.reason}</td>
                    <td style={S.td}>
                      <div style={S.flex(6)}>
                        <button style={{ ...S.btn("green"), padding: "4px 10px", fontSize: 12 }} onClick={() => approveExcuse(ex)}>
                          <Icon name="check" size={12} /> Onayla
                        </button>
                        <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 12 }} onClick={() => rejectExcuse(ex)}>
                          Reddet
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Onaylı / Reddedilen mazaretler özeti */}
      {pendingExcuses.filter(e => e.status !== "bekliyor").length > 0 && (
        <div style={{ ...S.card }}>
          <div style={{ ...S.cardTitle, marginBottom: 12 }}>Mazaret Geçmişi</div>
          <table style={S.table}>
            <thead><tr>{["Kişi", "Toplantı", "Mazeret", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {pendingExcuses.filter(e => e.status !== "bekliyor").map((ex, i) => (
                <tr key={i}>
                  <td style={S.td}><strong>{getName(ex.userId)}</strong><div style={{ fontSize: 11, color: "#8A8A8E" }}>{getDept(ex.deptId)}</div></td>
                  <td style={S.td}>{ex.meetingTitle}</td>
                  <td style={{ ...S.td, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 260 }}>{ex.reason}</td>
                  <td style={S.td}>
                    <span style={S.badge(ex.status === "onaylı" ? "#30D158" : ROMA_RED)}>
                      {ex.status === "onaylı" ? "Onaylı" : "Reddedildi"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: ROMA_RED }}>⚠ Devamsızlık Uyarıları (3+ Gelmedi)</div>
        {absentWarnings.length === 0 ? (
          <div style={S.empty}>Devamsızlık uyarısı yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Kişi", "Departman", "Gelmedi Sayısı", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {absentWarnings.map(([userId, count]) => {
                const u = users.find(x => x.id === userId);
                return (
                  <tr key={userId}>
                    <td style={S.td}><div style={S.flex(8)}><div style={{ ...S.avatar(avatarColor(userId)), width: 28, height: 28, fontSize: 10 }}>{u?.avatar || u?.name?.[0] || "?"}</div><strong>{getName(userId)}</strong></div></td>
                    <td style={S.td}><span style={S.tag}>{u?.deptId ? getDept(u.deptId) : "—"}</span></td>
                    <td style={S.td}><span style={{ ...S.badge(ROMA_RED), fontSize: 12, fontWeight: 700 }}>{count} kez</span></td>
                    <td style={S.td}><span style={{ ...S.badge(ROMA_RED) }}>Uyarı</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: GOLD }}>⚠ Gecikmeli Görevler</div>
        {delayedTasks.length === 0 ? (
          <div style={S.empty}>Gecikmeli görev yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Görev", "Departman", "Bitiş Tarihi", "Atananlar", "Mazeret"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {delayedTasks.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><strong>{t.title}</strong>{t.desc && <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{t.desc}</div>}</td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}><span style={{ color: ROMA_RED, fontWeight: 600 }}>{fmtDate(t.endDate)}</span></td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap" }}>{(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={{ ...S.td, maxWidth: 200, color: t.mazeretGecikme ? "#636366" : ROMA_RED, fontStyle: t.mazeretGecikme ? "italic" : "normal" }}>
                    {t.mazeretGecikme || <span style={{ fontWeight: 600 }}>Mazeret girilmedi</span>}
                    {t.mazeretTarih && <div style={{ fontSize: 10.5, color: "#8A8A8E" }}>{fmtDate(t.mazeretTarih)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: STOIC_NAVY }}>Onay Bekleyen Görevler</div>
        {pendingApproval.length === 0 ? (
          <div style={S.empty}>Onay bekleyen görev yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Görev", "Departman", "Atananlar", "Bitiş"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {pendingApproval.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><strong>{t.title}</strong></td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap" }}>{(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={S.td}>{fmtDate(t.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Aylık Görev Denetim Raporu Kartı */}
      <div style={{ ...S.card, background: "#FAFBFF", border: "1px solid #D9E4F5" }}>
        <div style={{ ...S.flexBetween, marginBottom: 14 }}>
          <div>
            <div style={{ ...S.cardTitle, marginBottom: 3, color: STOIC_NAVY }}>Aylık Görev Denetim Raporu</div>
            <div style={{ fontSize: 12, color: "#8A8A8E" }}>Seçilen aya ait tüm görevleri PDF olarak indirin (tamamlanan, gecikmeli, devam eden)</div>
          </div>
          <div style={{ ...S.flex(8), flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div>
              <label style={S.label}>Ay / Yıl</label>
              <input type="month" style={{ ...S.input, width: 160 }} value={taskReportMonth} onChange={e => setTaskReportMonth(e.target.value)} />
            </div>
            <button style={{ ...S.btn("blue"), marginTop: 20 }} onClick={generateMonthlyTaskReport}>
              <Icon name="download" size={14} /> PDF İndir
            </button>
          </div>
        </div>
        {/* Özet istatistikler */}
        {(() => {
          const monthTasks = tasks.filter(t => {
            const d = t.endDate || t.startDate || "";
            return d.slice(0, 7) === taskReportMonth;
          });
          const ml = monthLabel(taskReportMonth);
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 10 }}>
              {[
                ["Toplam", monthTasks.length, STOIC_NAVY],
                ["Tamamlandı", monthTasks.filter(t => t.status === "tamamlandı").length, "#30D158"],
                ["Teslim Edildi", monthTasks.filter(t => t.status === "yapıldı").length, GOLD],
                ["Gecikmeli", monthTasks.filter(t => t.status === "gecikmeli").length, ROMA_RED],
                ["Devam Ediyor", monthTasks.filter(t => t.status === "devam").length, "#667085"],
              ].map(([label, num, color]) => (
                <div key={label} style={{ border: "1px solid #ECECEF", borderRadius: 12, padding: "9px 10px", background: "#fff", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{num}</div>
                  <div style={{ fontSize: 10.5, color: "#6B6B65" }}>{label}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function ReportsPage({ meetings, depts, users, currentUser, userProfile }) {
  const [seeding, setSeeding] = useState(false);
  const done = meetings.filter(m => m.report);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || id;

  const seedDemoData = async () => {
    if (!hasAdminRole(userProfile?.role)) {
      alert("Örnek veri yüklemek için Başkan yetkisi gerekir.");
      return;
    }

    setSeeding(true);
    try {
      const existingDemo = await getDocs(query(collection(db, "meetings"), where("demo", "==", true), limit(1)));
      if (!existingDemo.empty) {
        alert("Örnek veriler zaten eklenmiş.");
        setSeeding(false);
        return;
      }

      const deptPool = [...depts];
      if (deptPool.length < 3) {
        const demoDeptDefs = [
          { name: "Operasyon", desc: "Saha planlama ve süreç takibi" },
          { name: "İletişim", desc: "Üyeler ve paydaşlarla iletişim" },
          { name: "Finans", desc: "Bütçe, ödeme ve kaynak yönetimi" },
        ];
        for (const d of demoDeptDefs) {
          const ref = await addDoc(collection(db, "depts"), { ...d, demo: true });
          deptPool.push({ id: ref.id, ...d, demo: true });
        }
      }

      const userPool = [...users];
      if (userPool.length < 4) {
        const demoUsers = [
          { id: "demo_u1", name: "Aylin Demir", email: "aylin.demo@marcus.local", role: "Departman Yöneticisi", deptId: deptPool[0]?.id || null, title: "Operasyon Sorumlusu", avatar: "AD", managerId: null, demo: true },
          { id: "demo_u2", name: "Can Eren", email: "can.demo@marcus.local", role: "Departman Yöneticisi", deptId: deptPool[1]?.id || null, title: "İletişim Yöneticisi", avatar: "CE", managerId: null, demo: true },
          { id: "demo_u3", name: "Mina Kaya", email: "mina.demo@marcus.local", role: "Üye", deptId: deptPool[0]?.id || null, title: "Operasyon Analisti", avatar: "MK", managerId: "demo_u1", demo: true },
        ];
        for (const u of demoUsers) {
          await setDoc(doc(db, "users", u.id), u, { merge: true });
          userPool.push(u);
        }
      }

      const actorId = currentUser?.uid || userPool[0]?.id;
      const deptA = deptPool[0]?.id || null;
      const deptB = deptPool[1]?.id || null;
      const deptC = deptPool[2]?.id || null;
      const allUsers = userPool.filter(u => u.id !== actorId);

      const meetingA = await addDoc(collection(db, "meetings"), {
        title: "Nisan Dönemi Faaliyet Planlama",
        deptId: deptA,
        datetime: `${today()}T10:00`,
        participants: allUsers.slice(0, 3).map(u => u.id),
        status: "yapıldı",
        report: {
          kararlar: "Aylık etkinlik takvimi onaylandı.",
          aksiyonlar: "Sorumlu atamaları haftalık yapılacak.",
          attendedParticipantIds: allUsers.slice(0, 2).map(u => u.id),
        },
        createdAt: serverTimestamp(),
        demo: true,
      });

      const meetingB = await addDoc(collection(db, "meetings"), {
        title: "Bağışçı İlişkileri Değerlendirme",
        deptId: deptB,
        datetime: `${today()}T14:30`,
        participants: allUsers.slice(1, 4).map(u => u.id),
        status: "planlandı",
        report: null,
        createdAt: serverTimestamp(),
        demo: true,
      });

      const attendedA = new Set(allUsers.slice(0, 2).map(u => u.id));
      for (const participantId of allUsers.slice(0, 3).map(u => u.id)) {
        await setDoc(doc(db, "attendance", `${meetingA.id}_${participantId}`), {
          meetingId: meetingA.id,
          meetingTitle: "Nisan Dönemi Faaliyet Planlama",
          userId: participantId,
          date: today(),
          deptId: deptA,
          status: attendedA.has(participantId) ? "katildi" : "gelmedi",
          source: "meeting-report",
          updatedBy: actorId,
          updatedAt: serverTimestamp(),
          demo: true,
        }, { merge: true });
      }

      await addDoc(collection(db, "tasks"), {
        title: "Haftalık üye geri bildirim raporu",
        desc: "Departman bazlı geri bildirimlerin sınıflandırılması",
        deptId: deptA,
        assignedTo: allUsers[0]?.id || actorId,
        startDate: today(),
        endDate: today(),
        progress: 65,
        notes: "Demo görev kaydı",
        status: "devam",
        createdAt: serverTimestamp(),
        demo: true,
      });

      await addDoc(collection(db, "tasks"), {
        title: "Nisan toplantı sunumu",
        desc: "Yönetim özeti ve KPI kartları",
        deptId: deptB,
        assignedTo: allUsers[1]?.id || actorId,
        startDate: today(),
        endDate: today(),
        progress: 25,
        notes: "Demo görev kaydı",
        status: "planlandı",
        createdAt: serverTimestamp(),
        demo: true,
      });

      await addDoc(collection(db, "messages"), {
        type: "bilgi",
        subject: "Faaliyet raporu güncellemesi",
        body: "Nisan dönemi verileri sisteme eklendi.",
        fromId: actorId,
        toDeptId: deptA,
        status: "yanıtlandı",
        createdAt: new Date().toISOString(),
        replies: [],
        demo: true,
      });

      await addDoc(collection(db, "fileRequests"), {
        subject: "Bütçe revizyon dosyası",
        desc: "Q2 bütçe tablolarının paylaşılması talep edilmiştir.",
        fromId: actorId,
        toDeptId: deptC,
        status: "bekliyor",
        createdAt: new Date().toISOString(),
        response: null,
        demo: true,
      });

      await updateDoc(doc(db, "meetings", meetingB.id), { demoLinked: true });
      alert("Örnek veriler başarıyla eklendi.");
    } catch (err) {
      console.error("Örnek veri ekleme hatası:", err);
      alert("Örnek veriler eklenirken hata oluştu.");
    }
    setSeeding(false);
  };

  const printReport = m => {
    openPrintableReport({
      title: m.title,
      bodyHtml: `<h1>Toplantı Raporu</h1><table><tr><td>Toplantı</td><td>${m.title}</td></tr><tr><td>Departman</td><td>${getDept(m.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(m.datetime)}</td></tr><tr><td>Katılımcılar</td><td>${(m.participants || []).map(getName).join(", ")}</td></tr></table><h2>Alınan Kararlar</h2><div class="box">${m.report?.kararlar || "-"}</div><h2>Aksiyon Maddeleri</h2><div class="box">${m.report?.aksiyonlar || "-"}</div>`,
    });
  };
  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#6B6B65" }}>Rapor, toplantı, departman ve görevler için örnek veri ekleyebilirsiniz.</div>
        <button style={S.btn("primary")} onClick={seedDemoData} disabled={seeding}>{seeding ? "Ekleniyor..." : "Örnek Veri Yükle"}</button>
      </div>
      <div style={S.grid3}>
        {[ ["Toplam", meetings.length, STOIC_NAVY], ["Raporlanan", done.length, "#30D158"], ["Bekleyen", meetings.length - done.length, GOLD] ].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}><div style={{ fontSize: 30, fontWeight: 800 }}>{num}</div><div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div></div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div style={S.card}>
        <div style={S.cardTitle}>Tamamlanan Raporlar</div>
        {done.length === 0 ? <div style={S.empty}>Henüz raporlanmış toplantı yok.</div> : (
          <table style={S.table}>
            <thead><tr>{["Toplantı", "Departman", "Tarih", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{done.map(m => (
              <tr key={m.id}>
                <td style={S.td}><strong>{m.title}</strong></td>
                <td style={S.td}><span style={S.tag}>{getDept(m.deptId)}</span></td>
                <td style={S.td}>{fmtDateTime(m.datetime)}</td>
                <td style={S.td}><button style={S.btn("ghost")} onClick={() => printReport(m)}><Icon name="download" size={13} /> PDF</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}