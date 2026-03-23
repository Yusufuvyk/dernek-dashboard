import { useState, useEffect, useMemo } from "react";
import { db, auth } from "./firebase";
import marcusLogo from "./assets/marcus-logo.svg";
import {
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs, limit, where
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
const timeAgo = d => {
  if (!d) return "";
  const diff = Math.floor((Date.now() - new Date(d)) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff}dk önce`;
  if (diff < 1440) return `${Math.floor(diff / 60)}sa önce`;
  return fmtDate(d);
};

const normalizeRole = (role) => {
  const r = String(role || "").trim().toLowerCase();
  if (["admin", "başkan", "yonetici", "yönetici"].includes(r)) return "Başkan";
  return role;
};

// ─ Role helpers (backward-compat: old "Admin"→"Başkan", old "Departman Üyesi"→manager, "Genel Üye"→member)
const hasAdminRole = r => ["Admin", "Başkan"].includes(r);
const roleLevel = r => {
  if (["Admin", "Başkan"].includes(r)) return 0;
  if (["Departman Yöneticisi", "Departman Üyesi"].includes(r)) return 1; // old "Departman Üyesi" = manager level
  return 2; // "Üye", "Genel Üye" = regular member
};
const displayRole = r => {
  if (hasAdminRole(r)) return "Başkan";
  if (["Departman Yöneticisi", "Departman Üyesi"].includes(r)) return "Departman Yöneticisi";
  return "Departman Üyesi";
};

const openPrintableReport = ({ title, bodyHtml }) => {
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:34px;font-size:13px;line-height:1.7;color:#1a1a18;}h1{font-size:20px;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:18px;color:#151515;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}td{padding:7px 10px;border:1px solid #d9d3d1;}td:first-child{font-weight:700;background:#f7f3f2;width:140px;}h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6a5610;margin:20px 0 8px;}.box{border:1px solid #d9d3d1;border-radius:6px;padding:12px;min-height:70px;white-space:pre-wrap;}</style></head><body>${bodyHtml}<script>window.onload=()=>window.print();<\/script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    URL.revokeObjectURL(url);
    alert("Rapor penceresi acilamadi. Lutfen popup engelleyiciyi kapatin.");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
  cardTitle: { fontSize: 11, fontWeight: 800, color: "#2A2927", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.85, fontFamily: FONT_SERIF },
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

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    setErr("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      onLogin(cred.user);
    } catch (e) {
      setErr("E-posta veya şifre hatalı.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px 30px", width: 380, border: "1px solid #E2E2DD", boxShadow: "0 10px 30px rgba(0,0,0,.06)" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 800, letterSpacing: -0.3, fontFamily: FONT_SERIF, color: "#181715" }}>
            <img src={marcusLogo} alt="Marcus logo" style={{ width: 22, height: 22, objectFit: "contain" }} />
            <span>Marcus</span>
          </div>
          <div style={{ fontSize: 13, color: "#5E5A55", marginTop: 3 }}>Panele giris yapin</div>
        </div>
        <div style={{ marginBottom: 11 }}><label style={S.label}>E-posta</label><input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>Şifre</label><input style={S.input} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 11, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
        <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14 }} onClick={handle} disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: "#8A8A8E", textAlign: "center" }}>
          Hesabınız yoksa Admin size oluşturur.
        </div>
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

  return (
    <div>
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

  const visible = useMemo(() => {
    let list = hasAdminRole(userProfile?.role) ? tasks : tasks.filter(t => {
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
      await addDoc(collection(db, "tasks"), { ...t, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, "tasks", t.id), t);
    }
    setModal(null);
  };
  const del = async id => { await deleteDoc(doc(db, "tasks", id)); };
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const emptyTask = { title: "", desc: "", deptId: depts[0]?.id || "", assignedTo: [currentUser?.uid || ""], startDate: today(), endDate: "", notes: "", status: "devam" };

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
        {roleLevel(userProfile?.role) > 0 && <button style={S.btn()} onClick={() => setModal({ mode: "add", task: emptyTask })}><Icon name="plus" size={15} /> Görev Ekle</button>}
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
                    <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", task: { ...t } })}><Icon name="edit" size={13} /></button>
                    {hasAdminRole(userProfile?.role) && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#6A5610" }} onClick={() => del(t.id)}><Icon name="trash" size={13} /></button>}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modal && <TaskModal {...modal} depts={depts} users={users} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

function TaskModal({ mode, task, depts, users, onSave, onClose }) {
  const [f, setF] = useState(task);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  
  const toggleUser = (id) => {
    const arr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean);
    const updated = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    set("assignedTo", updated);
  };

  return (
    <Modal title={mode === "add" ? "Yeni Görev" : "Görevi Düzenle"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={f.desc} onChange={e => set("desc", e.target.value)} /></div>
        
        <div style={S.formRow}>
          <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label style={S.label}>Durum</label><select style={S.select} value={f.status} onChange={e => set("status", e.target.value)}><option value="devam">Devam Ediyor</option><option value="tamamlandı">Tamamlandı</option><option value="gecikmeli">Gecikmeli</option></select></div>
        </div>

        <div>
          <label style={S.label}>Atananlar</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
            {users.map(u => {
              const arr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean);
              const isSelected = arr.includes(u.id);
              return (
                <div key={u.id} onClick={() => toggleUser(u.id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500, background: isSelected ? "#1C1C1E" : "#F2F2F7", color: isSelected ? "#fff" : "#1C1C1E" }}>
                  {u.name}
                </div>
              );
            })}
          </div>
        </div>

        <div style={S.formRow}>
          <div><label style={S.label}>Başlangıç</label><input type="date" style={S.input} value={f.startDate} onChange={e => set("startDate", e.target.value)} /></div>
          <div><label style={S.label}>Bitiş</label><input type="date" style={S.input} value={f.endDate} onChange={e => set("endDate", e.target.value)} /></div>
        </div>
        
        <div><label style={S.label}>Notlar</label><textarea style={S.textarea} value={f.notes} onChange={e => set("notes", e.target.value)} /></div>
        <div style={{ ...S.flex(10), justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
          <button style={S.btn()} onClick={() => onSave(f)}>Kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MEETINGS ─────────────────────────────────────────────────────────────────
function MeetingsPage({ meetings, depts, users, currentUser, userProfile }) {
  const [modal, setModal] = useState(null);
  const [reportModal, setReportModal] = useState(null);
  const [excuseModal, setExcuseModal] = useState(null);
  const visible = hasAdminRole(userProfile?.role) ? meetings : meetings.filter(m => m.deptId === userProfile?.deptId || m.participants?.includes(currentUser?.uid));
  const emptyM = { title: "", deptId: depts[0]?.id || "", datetime: new Date().toISOString().slice(0, 16), participants: [], status: "planlandı", report: null };

  const save = async m => {
    if (modal.mode === "add") await addDoc(collection(db, "meetings"), { ...m, createdAt: serverTimestamp() });
    else await updateDoc(doc(db, "meetings", m.id), m);
    setModal(null);
  };
  const saveExcuse = async (meetingId, reason) => {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) return;
    const excuses = meeting.excuses || {};
    excuses[currentUser.uid] = reason;
    await updateDoc(doc(db, "meetings", meetingId), { excuses });
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

    await Promise.all(attendanceWrites);
    setReportModal(null);
  };
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div />
        {roleLevel(userProfile?.role) > 0 && <button style={S.btn()} onClick={() => setModal({ mode: "add", meeting: emptyM })}><Icon name="plus" size={15} /> Toplantı Ekle</button>}
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
                    {m.status === "planlandı" && <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", meeting: { ...m } })}><Icon name="edit" size={13} /></button>}
                    {m.status === "planlandı" && m.participants?.includes(currentUser?.uid) && !m.excuses?.[currentUser?.uid] && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: GOLD }} onClick={() => setExcuseModal(m)}>İzin Al</button>}
                    {m.status === "planlandı" && m.participants?.includes(currentUser?.uid) && m.excuses?.[currentUser?.uid] && <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>İzinli</span>}
                    <button style={{ ...S.btn("green"), padding: "4px 11px", fontSize: 12 }} onClick={() => setReportModal(m)}><Icon name="reports" size={12} /> Rapor</button>
                    {hasAdminRole(userProfile?.role) && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#6A5610" }} onClick={() => del(m.id)}><Icon name="trash" size={13} /></button>}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modal && <MeetingModal {...modal} depts={depts} users={users} onSave={save} onClose={() => setModal(null)} />}
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

function MeetingModal({ mode, meeting, depts, users, onSave, onClose }) {
  const [f, setF] = useState(meeting);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleP = id => set("participants", f.participants.includes(id) ? f.participants.filter(x => x !== id) : [...f.participants, id]);
  return (
    <Modal title={mode === "add" ? "Yeni Toplantı" : "Toplantı Düzenle"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div style={S.formRow}>
          <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label style={S.label}>Tarih & Saat</label><input type="datetime-local" style={S.input} value={f.datetime} onChange={e => set("datetime", e.target.value)} /></div>
        </div>
        <div><label style={S.label}>Katılımcılar</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
            {users.map(u => <div key={u.id} onClick={() => toggleP(u.id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500, background: f.participants.includes(u.id) ? "#1C1C1E" : "#F2F2F7", color: f.participants.includes(u.id) ? "#fff" : "#1C1C1E" }}>{u.name}</div>)}
          </div>
        </div>
        <div style={{ ...S.flex(10), justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onClose}>İptal</button>
          <button style={S.btn()} onClick={() => onSave(f)}>Kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

function ReportModal({ meeting, users, depts, onSave, onClose }) {
  const [kararlar, setKararlar] = useState(meeting.report?.kararlar || "");
  const [aksiyonlar, setAksiyonlar] = useState(meeting.report?.aksiyonlar || "");
  const [attendedParticipantIds, setAttendedParticipantIds] = useState(
    meeting.report?.attendedParticipantIds || meeting.participants || []
  );
  const getName = id => users.find(u => u.id === id)?.name || id;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const toggleAttended = id => {
    setAttendedParticipantIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const printPdf = () => {
    openPrintableReport({
      title: meeting.title,
      bodyHtml: `<h1>Toplanti Raporu</h1><table><tr><td>Toplanti</td><td>${meeting.title}</td></tr><tr><td>Departman</td><td>${getDept(meeting.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(meeting.datetime)}</td></tr><tr><td>Davetliler</td><td>${(meeting.participants || []).map(getName).join(", ")}</td></tr><tr><td>Katilanlar</td><td>${(attendedParticipantIds || []).map(getName).join(", ") || "-"}</td></tr></table><h2>Alinan Kararlar</h2><div class="box">${kararlar || "-"}</div><h2>Aksiyon Maddeleri</h2><div class="box">${aksiyonlar || "-"}</div>`,
    });
  };
  return (
    <Modal title="Toplantı Raporu" onClose={onClose}>
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 9, padding: "11px 14px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.9 }}>
        <div><strong>Toplantı:</strong> {meeting.title}</div>
        <div><strong>Tarih:</strong> {fmtDateTime(meeting.datetime)}</div>
      </div>
      <div style={{ marginBottom: 11 }}><label style={S.label}>Alınan Kararlar</label><textarea style={{ ...S.textarea, minHeight: 80 }} value={kararlar} onChange={e => setKararlar(e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}>
        <label style={S.label}>Katılanlar (otomatik devamsızlık için işaretleyin)</label>
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
                    cursor: "pointer",
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
      <div style={{ marginBottom: 16 }}><label style={S.label}>Aksiyon Maddeleri</label><textarea style={{ ...S.textarea, minHeight: 80 }} value={aksiyonlar} onChange={e => setAksiyonlar(e.target.value)} /></div>
      <div style={{ ...S.flexBetween }}>
        <button style={S.btn("ghost")} onClick={printPdf}><Icon name="download" size={13} /> PDF</button>
        <div style={S.flex(7)}><button style={S.btn("ghost")} onClick={onClose}>İptal</button><button style={S.btn()} onClick={() => onSave({ meetingId: meeting.id, report: { kararlar, aksiyonlar }, attendedParticipantIds })}>Kaydet</button></div>
      </div>
    </Modal>
  );
}

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
function DepartmentsPage({ depts, tasks, meetings, users, userProfile }) {
  const [modal, setModal] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
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
          const isExp = expandedDept === d.id;
          return (
            <div key={d.id} style={{ ...S.card, position: "relative", cursor: "pointer", border: isExp ? `1px solid ${STOIC_NAVY}` : "1px solid #E5E5E5" }}
              onClick={() => setExpandedDept(isExp ? null : d.id)}>
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
                <div style={{ fontSize: 11, color: isExp ? STOIC_NAVY : "#8A8A8E", fontWeight: 600 }}>{isExp ? "▲ Kapat" : "▼ Üyeler"}</div>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #E5E5E5", marginTop: 14, paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                  {members.length === 0 ? (
                    <div style={{ ...S.empty, padding: "10px 0" }}>Bu departmanda üye yok</div>
                  ) : members.map(u => (
                    <div key={u.id} style={{ ...S.flex(10), padding: "7px 0", borderBottom: "1px solid #F5F5F5" }}>
                      <div style={{ ...S.avatar(avatarColor(u.id)), width: 30, height: 30, fontSize: 10 }}>{u.avatar || u.name?.[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: "#8A8A8E" }}>{u.title || u.role}</div>
                      </div>
                      <span style={{ ...S.badge(STOIC_NAVY), fontSize: 10 }}>{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
function UsersPage({ users, depts, userProfile, currentUser }) {
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  if (!hasAdminRole(userProfile?.role)) return <div style={S.card}><div style={S.empty}>Başkan yetkisi gereklidir.</div></div>;

  const ROLE_COLOR = { "Admin": ROMA_RED, "Başkan": ROMA_RED, "Departman Yöneticisi": STOIC_NAVY, "Departman Üyesi": STOIC_NAVY, "Üye": "#30D158", "Genel Üye": "#30D158" };
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  const createUser = async () => {
    setLoading(true);
    setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, modal.user.email, modal.user.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: modal.user.name,
        email: modal.user.email,
        role: modal.user.role,
        deptId: modal.user.deptId || null,
        title: modal.user.title || "",
        avatar: modal.user.avatar || modal.user.name.slice(0, 2).toUpperCase(),
        managerId: modal.user.managerId || null,
      });
      setModal(null);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const updateUser = async () => {
    await updateDoc(doc(db, "users", modal.user.id), {
      name: modal.user.name,
      role: modal.user.role,
      deptId: modal.user.deptId || null,
      title: modal.user.title || "",
      avatar: modal.user.avatar || "",
      managerId: modal.user.managerId || null,
    });
    setModal(null);
  };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}><div /><button style={S.btn()} onClick={() => setModal({ mode: "add", user: { name: "", email: "", password: "", role: "Üye", deptId: "", title: "", avatar: "", managerId: null } })}><Icon name="plus" size={15} /> Kullanıcı Ekle</button></div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["İsim", "E-posta", "Unvan", "Rol", "Departman", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td style={S.td}><div style={S.flex(8)}><div style={S.avatar(avatarColor(u.id))}>{u.avatar || u.name?.[0]}</div><strong>{u.name}</strong></div></td>
              <td style={S.td}>{u.email}</td>
              <td style={S.td}><span style={{ fontSize: 12.5, color: "#636366" }}>{u.title || "—"}</span></td>
              <td style={S.td}><span style={S.badge(ROLE_COLOR[u.role] || "#999")}>{displayRole(u.role)}</span></td>
              <td style={S.td}>{u.deptId ? getDept(u.deptId) : <span style={{ color: "#8A8A8E" }}>—</span>}</td>
              <td style={S.td}><button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", user: { ...u } })}><Icon name="edit" size={13} /></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
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
            <div><label style={S.label}>Rol</label><select style={S.select} value={modal.user.role} onChange={e => setModal(p => ({ ...p, user: { ...p.user, role: e.target.value } }))}><option value="Başkan">Başkan</option><option value="Departman Yöneticisi">Departman Yöneticisi</option><option value="Üye">Departman Üyesi</option></select></div>
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
  const roleRestrictedDept = hasAdminRole(userProfile?.role) ? null : userProfile?.deptId;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || "—";
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
          <div style={{ border: "1px solid #ECECEF", borderRadius: 12, overflow: "hidden" }}>
            {[ ["Toplam Devamsızlık", personTotals.totalAbsence], ["Gelmedi", personTotals.absent], ["Izinli", personTotals.excused], ["Katildi", personTotals.present], ["Toplam Kayit", personTotals.total] ].map(([label, value], i) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: i === 4 ? "none" : "1px solid #F1F1F3", fontSize: 12.5 }}>
                <span style={{ color: "#64635F" }}>{label}</span>
                <strong style={{ color: "#171717" }}>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                      <td style={{ ...S.td, maxWidth: 220, color: "#66645F" }}>{r.excuse || "—"}</td>
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

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
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
          console.error("E-posta ile profil geri yukleme basarisiz:", err);
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
    ];
    return () => subs.forEach(u => u());
  }, [currentUser]);

  const pendingMsgs = messages.filter(m => (m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId) && m.status === "bekliyor").length;

  if (authLoading) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Yukleniyor...</div>;
  if (!currentUser) return <LoginPage onLogin={u => setCurrentUser(u)} />;
  if (!userProfile) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Profil yukleniyor...</div>;

  const NAV_GROUPS = [
    { label: "Genel", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "tasks", label: "Görevler", icon: "tasks" }, { id: "meetings", label: "Toplantılar", icon: "calendar" }, { id: "attendance", label: "Devamsızlık", icon: "check" }] },
    { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }, { id: "userlist", label: "Kullanıcılar", icon: "users" }] },
    { label: "İletişim", items: [{ id: "messages", label: "Mesajlar", icon: "inbox", badge: pendingMsgs }] },
    { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }] },
  ];
  const TITLES = { dashboard: "Dashboard", tasks: "Görev Yönetimi", meetings: "Toplantılar", attendance: "Devamsızlık Takibi", orgtree: "Yönetim Ağacı", departments: "Departmanlar", userlist: "Kullanıcılar", messages: "Mesajlar", reports: "Raporlar" };
  const props = { tasks, meetings, depts, users, messages, fileRequests, attendance, currentUser, userProfile };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard {...props} />;
      case "tasks": return <TasksPage {...props} />;
      case "meetings": return <MeetingsPage {...props} />;
      case "attendance": return <AttendancePage {...props} />;
      case "orgtree": return <OrgTreePage {...props} />;
      case "departments": return <DepartmentsPage {...props} />;
      case "userlist": return <UsersPage {...props} />;
      case "messages": return <MessagesPage {...props} />;
      case "reports": return <ReportsPage {...props} />;
      default: return null;
    }
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={{ padding: "16px 14px 14px", borderBottom: "1px solid #E4E7EC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 17, fontWeight: 800, color: "#101828", letterSpacing: 1.2 }}>
            <img src={marcusLogo} alt="Marcus logo" style={{ width: 18, height: 18, objectFit: "contain" }} />
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

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function ReportsPage({ meetings, depts, users, currentUser, userProfile }) {
  const [seeding, setSeeding] = useState(false);
  const done = meetings.filter(m => m.report);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || id;

  const seedDemoData = async () => {
    if (!hasAdminRole(userProfile?.role)) {
      alert("Ornek veri yuklemek icin Başkan yetkisi gerekir.");
      return;
    }

    setSeeding(true);
    try {
      const existingDemo = await getDocs(query(collection(db, "meetings"), where("demo", "==", true), limit(1)));
      if (!existingDemo.empty) {
        alert("Ornek veriler zaten eklenmis.");
        setSeeding(false);
        return;
      }

      const deptPool = [...depts];
      if (deptPool.length < 3) {
        const demoDeptDefs = [
          { name: "Operasyon", desc: "Saha planlama ve surec takibi" },
          { name: "Iletisim", desc: "Uyeler ve paydaslarla iletisim" },
          { name: "Finans", desc: "Butce, odeme ve kaynak yonetimi" },
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
          { id: "demo_u2", name: "Can Eren", email: "can.demo@marcus.local", role: "Departman Yöneticisi", deptId: deptPool[1]?.id || null, title: "Iletisim Yöneticisi", avatar: "CE", managerId: null, demo: true },
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
        title: "Nisan Donemi Faaliyet Planlama",
        deptId: deptA,
        datetime: `${today()}T10:00`,
        participants: allUsers.slice(0, 3).map(u => u.id),
        status: "yapıldı",
        report: {
          kararlar: "Aylik etkinlik takvimi onaylandi.",
          aksiyonlar: "Sorumlu atamalari haftalik yapilacak.",
          attendedParticipantIds: allUsers.slice(0, 2).map(u => u.id),
        },
        createdAt: serverTimestamp(),
        demo: true,
      });

      const meetingB = await addDoc(collection(db, "meetings"), {
        title: "Bagisci Iliskileri Degerlendirme",
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
          meetingTitle: "Nisan Donemi Faaliyet Planlama",
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
        title: "Haftalik uye geri bildirim raporu",
        desc: "Departman bazli geri bildirimlerin siniflandirilmasi",
        deptId: deptA,
        assignedTo: allUsers[0]?.id || actorId,
        startDate: today(),
        endDate: today(),
        progress: 65,
        notes: "Demo gorev kaydi",
        status: "devam",
        createdAt: serverTimestamp(),
        demo: true,
      });

      await addDoc(collection(db, "tasks"), {
        title: "Nisan toplanti sunumu",
        desc: "Yonetim ozeti ve KPI kartlari",
        deptId: deptB,
        assignedTo: allUsers[1]?.id || actorId,
        startDate: today(),
        endDate: today(),
        progress: 25,
        notes: "Demo gorev kaydi",
        status: "planlandı",
        createdAt: serverTimestamp(),
        demo: true,
      });

      await addDoc(collection(db, "messages"), {
        type: "bilgi",
        subject: "Faaliyet raporu guncellemesi",
        body: "Nisan donemi verileri sisteme eklendi.",
        fromId: actorId,
        toDeptId: deptA,
        status: "yanıtlandı",
        createdAt: new Date().toISOString(),
        replies: [],
        demo: true,
      });

      await addDoc(collection(db, "fileRequests"), {
        subject: "Butce revizyon dosyasi",
        desc: "Q2 butce tablolarinin paylasilmasi talep edilmistir.",
        fromId: actorId,
        toDeptId: deptC,
        status: "bekliyor",
        createdAt: new Date().toISOString(),
        response: null,
        demo: true,
      });

      await updateDoc(doc(db, "meetings", meetingB.id), { demoLinked: true });
      alert("Ornek veriler basariyla eklendi.");
    } catch (err) {
      console.error("Ornek veri ekleme hatasi:", err);
      alert("Ornek veriler eklenirken hata olustu.");
    }
    setSeeding(false);
  };

  const printReport = m => {
    openPrintableReport({
      title: m.title,
      bodyHtml: `<h1>Toplanti Raporu</h1><table><tr><td>Toplanti</td><td>${m.title}</td></tr><tr><td>Departman</td><td>${getDept(m.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(m.datetime)}</td></tr><tr><td>Katilimcilar</td><td>${(m.participants || []).map(getName).join(", ")}</td></tr></table><h2>Kararlar</h2><div class="box">${m.report?.kararlar || "-"}</div><h2>Aksiyonlar</h2><div class="box">${m.report?.aksiyonlar || "-"}</div>`,
    });
  };
  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#6B6B65" }}>Rapor, toplanti, departman ve gorevler icin ornek veri ekleyebilirsiniz.</div>
        <button style={S.btn("primary")} onClick={seedDemoData} disabled={seeding}>{seeding ? "Ekleniyor..." : "Ornek Veri Yukle"}</button>
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