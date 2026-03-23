import { useState, useEffect, useMemo } from "react";
import { db, auth } from "./firebase";
import {
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
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
const AVATAR_COLORS = ["#0A84FF", "#30D158", "#FF9F0A", "#FF3B30", "#BF5AF2", "#FF6B35"];
const avatarColor = id => AVATAR_COLORS[(id?.charCodeAt(id.length - 1) || 0) % AVATAR_COLORS.length];

const S = {
  app: { display: "flex", height: "100vh", fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#F5F4F0", color: "#1C1C1E", overflow: "hidden" },
  sidebar: { width: 232, background: "#1C1C1E", display: "flex", flexDirection: "column", padding: "0 0 16px", flexShrink: 0 },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1 },
  navItem: a => ({ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, cursor: "pointer", color: a ? "#fff" : "#8A8A8E", background: a ? "#2C2C2E" : "transparent", fontSize: 13, fontWeight: a ? 600 : 400, userSelect: "none" }),
  navSection: { fontSize: 10, fontWeight: 700, color: "#3A3A3C", textTransform: "uppercase", letterSpacing: 1, padding: "12px 12px 4px" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { background: "#fff", borderBottom: "1px solid #E5E5EA", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  content: { flex: 1, overflow: "auto", padding: "24px" },
  card: { background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #E5E5EA" },
  cardTitle: { fontSize: 11, fontWeight: 700, color: "#8A8A8E", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.8 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 },
  stat: c => ({ background: c, borderRadius: 12, padding: "18px 22px", color: "#fff" }),
  btn: (v = "primary") => {
    const b = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", whiteSpace: "nowrap", fontFamily: "inherit" };
    return v === "primary" ? { ...b, background: "#1C1C1E", color: "#fff" }
      : v === "ghost" ? { ...b, background: "transparent", color: "#1C1C1E", border: "1px solid #E5E5EA" }
        : v === "green" ? { ...b, background: "#30D158", color: "#fff" }
          : v === "blue" ? { ...b, background: "#0A84FF", color: "#fff" }
            : v === "danger" ? { ...b, background: "#FF3B30", color: "#fff" }
              : b;
  },
  label: { fontSize: 12, fontWeight: 600, color: "#636366", display: "block", marginBottom: 4 },
  input: { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #E5E5EA", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAFA", fontFamily: "inherit" },
  select: { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #E5E5EA", fontSize: 13, outline: "none", background: "#FAFAFA", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #E5E5EA", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", background: "#FAFAFA", minHeight: 72, fontFamily: "inherit" },
  formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 13px", fontSize: 11, fontWeight: 700, color: "#8A8A8E", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #E5E5EA" },
  td: { padding: "11px 13px", fontSize: 13, borderBottom: "1px solid #F2F2F7", verticalAlign: "middle" },
  badge: c => ({ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c + "22", color: c }),
  pb: { height: 5, background: "#E5E5EA", borderRadius: 4, overflow: "hidden" },
  pbF: p => ({ height: "100%", width: `${p}%`, background: p === 100 ? "#30D158" : p < 30 ? "#FF3B30" : "#FF9F0A", borderRadius: 4 }),
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, padding: 26, width: "100%", maxWidth: 540, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.22)" },
  flex: (g = 0) => ({ display: "flex", alignItems: "center", gap: g }),
  flexBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  tag: { display: "inline-block", padding: "2px 7px", borderRadius: 5, fontSize: 11, background: "#F2F2F7", color: "#636366" },
  empty: { textAlign: "center", padding: "40px 0", color: "#8A8A8E", fontSize: 13 },
  avatar: (color = "#0A84FF") => ({ width: 32, height: 32, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }),
};

const STATUS = {
  "tamamlandı": { color: "#30D158", label: "Tamamlandı" },
  "devam": { color: "#FF9F0A", label: "Devam Ediyor" },
  "gecikmeli": { color: "#FF3B30", label: "Gecikmeli" },
  "planlandı": { color: "#0A84FF", label: "Planlandı" },
  "yapıldı": { color: "#30D158", label: "Yapıldı" },
  "bekliyor": { color: "#FF9F0A", label: "Bekliyor" },
  "yanıtlandı": { color: "#30D158", label: "Yanıtlandı" },
  "kapatıldı": { color: "#8A8A8E", label: "Kapatıldı" },
};

const MSG_TYPE = {
  soru: { color: "#0A84FF", label: "Soru" },
  destek: { color: "#FF9F0A", label: "Destek" },
  bilgi: { color: "#30D158", label: "Bilgi" },
  dosya: { color: "#BF5AF2", label: "Dosya İsteği" },
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
    <div style={{ minHeight: "100vh", background: "#1C1C1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "36px 32px", width: 380, boxShadow: "0 32px 80px rgba(0,0,0,.4)" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>🏛 DernekYönetim</div>
          <div style={{ fontSize: 13, color: "#8A8A8E", marginTop: 3 }}>Panele giriş yapın</div>
        </div>
        <div style={{ marginBottom: 11 }}><label style={S.label}>E-posta</label><input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>Şifre</label><input style={S.input} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        {err && <div style={{ color: "#FF3B30", fontSize: 12, marginBottom: 11, padding: "7px 11px", background: "#FF3B3011", borderRadius: 7 }}>{err}</div>}
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
  const mine = userProfile?.role === "Admin" ? tasks : tasks.filter(t => t.deptId === userProfile?.deptId || t.assignedTo === currentUser?.uid);
  const myMsgs = messages.filter(m => m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId);
  const pendingMsgs = myMsgs.filter(m => m.status === "bekliyor").length;
  const pendingFiles = fileRequests.filter(f => f.toDeptId === userProfile?.deptId && f.status === "bekliyor").length;
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  return (
    <div>
      <div style={S.grid4}>
        {[["Toplam Görev", mine.length, "#0A84FF"], ["Tamamlandı", mine.filter(t => t.status === "tamamlandı").length, "#30D158"], ["Bekleyen Mesaj", pendingMsgs, "#FF9F0A"], ["Dosya Talebi", pendingFiles, "#BF5AF2"]].map(([label, num, color]) => (
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
          <thead><tr>{["Görev", "Departman", "Durum", "İlerleme"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{mine.slice(0, 5).map(t => (
            <tr key={t.id}>
              <td style={S.td}><strong>{t.title}</strong></td>
              <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
              <td style={S.td}><span style={S.badge(STATUS[t.status]?.color || "#999")}>{STATUS[t.status]?.label}</span></td>
              <td style={{ ...S.td, minWidth: 100 }}><div style={S.pb}><div style={S.pbF(t.progress)} /></div><div style={{ fontSize: 10.5, color: "#8A8A8E", marginTop: 2 }}>{t.progress}%</div></td>
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
    let list = userProfile?.role === "Admin" ? tasks : tasks.filter(t => t.deptId === userProfile?.deptId || t.assignedTo === currentUser?.uid);
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
  const emptyTask = { title: "", desc: "", deptId: depts[0]?.id || "", assignedTo: currentUser?.uid || "", startDate: today(), endDate: "", progress: 0, notes: "", status: "devam" };

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
        {userProfile?.role !== "Genel Üye" && <button style={S.btn()} onClick={() => setModal({ mode: "add", task: emptyTask })}><Icon name="plus" size={15} /> Görev Ekle</button>}
      </div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Başlık", "Departman", "Atanan", "Bitiş", "Durum", "İlerleme", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {visible.length === 0 ? <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", color: "#8A8A8E" }}>Görev bulunamadı</td></tr>
              : visible.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><div style={{ fontWeight: 600 }}>{t.title}</div>{t.desc && <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{t.desc}</div>}</td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}>{getName(t.assignedTo)}</td>
                  <td style={S.td}>{fmtDate(t.endDate)}</td>
                  <td style={S.td}><span style={S.badge(STATUS[t.status]?.color || "#999")}>{STATUS[t.status]?.label}</span></td>
                  <td style={{ ...S.td, minWidth: 100 }}><div style={S.pb}><div style={S.pbF(t.progress)} /></div><div style={{ fontSize: 10.5, color: "#8A8A8E", marginTop: 2 }}>{t.progress}%</div></td>
                  <td style={S.td}><div style={S.flex(5)}>
                    <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", task: { ...t } })}><Icon name="edit" size={13} /></button>
                    {userProfile?.role === "Admin" && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#FF3B30" }} onClick={() => del(t.id)}><Icon name="trash" size={13} /></button>}
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
  return (
    <Modal title={mode === "add" ? "Yeni Görev" : "Görevi Düzenle"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={f.desc} onChange={e => set("desc", e.target.value)} /></div>
        <div style={S.formRow}>
          <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label style={S.label}>Atanan</label><select style={S.select} value={f.assignedTo} onChange={e => set("assignedTo", e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Başlangıç</label><input type="date" style={S.input} value={f.startDate} onChange={e => set("startDate", e.target.value)} /></div>
          <div><label style={S.label}>Bitiş</label><input type="date" style={S.input} value={f.endDate} onChange={e => set("endDate", e.target.value)} /></div>
        </div>
        <div style={S.formRow}>
          <div><label style={S.label}>Durum</label><select style={S.select} value={f.status} onChange={e => set("status", e.target.value)}><option value="devam">Devam Ediyor</option><option value="tamamlandı">Tamamlandı</option><option value="gecikmeli">Gecikmeli</option></select></div>
          <div><label style={S.label}>İlerleme: {f.progress}%</label><input type="range" min={0} max={100} value={f.progress} onChange={e => set("progress", +e.target.value)} style={{ width: "100%", marginTop: 8 }} /></div>
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
  const visible = userProfile?.role === "Admin" ? meetings : meetings.filter(m => m.deptId === userProfile?.deptId || m.participants?.includes(currentUser?.uid));
  const emptyM = { title: "", deptId: depts[0]?.id || "", datetime: new Date().toISOString().slice(0, 16), participants: [], status: "planlandı", report: null };

  const save = async m => {
    if (modal.mode === "add") await addDoc(collection(db, "meetings"), { ...m, createdAt: serverTimestamp() });
    else await updateDoc(doc(db, "meetings", m.id), m);
    setModal(null);
  };
  const del = async id => await deleteDoc(doc(db, "meetings", id));
  const saveReport = async (id, report) => {
    await updateDoc(doc(db, "meetings", id), { report, status: "yapıldı" });
    setReportModal(null);
  };
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 14 }}>
        <div />
        {userProfile?.role !== "Genel Üye" && <button style={S.btn()} onClick={() => setModal({ mode: "add", meeting: emptyM })}><Icon name="plus" size={15} /> Toplantı Ekle</button>}
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
                    <button style={{ ...S.btn("green"), padding: "4px 11px", fontSize: 12 }} onClick={() => setReportModal(m)}><Icon name="reports" size={12} /> Rapor</button>
                    {userProfile?.role === "Admin" && <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#FF3B30" }} onClick={() => del(m.id)}><Icon name="trash" size={13} /></button>}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modal && <MeetingModal {...modal} depts={depts} users={users} onSave={save} onClose={() => setModal(null)} />}
      {reportModal && <ReportModal meeting={reportModal} users={users} depts={depts} onSave={saveReport} onClose={() => setReportModal(null)} />}
    </div>
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
  const getName = id => users.find(u => u.id === id)?.name || id;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const printPdf = () => {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${meeting.title}</title><style>body{font-family:Calibri,Arial;padding:40px;font-size:13px;line-height:1.7;}h1{font-size:20px;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}td{padding:7px 10px;border:1px solid #ccc;}td:first-child{font-weight:700;background:#f9f9f9;width:130px;}h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;margin:20px 0 8px;}.box{border:1px solid #ccc;border-radius:4px;padding:12px;min-height:70px;white-space:pre-wrap;}</style></head><body><h1>Toplantı Raporu</h1><table><tr><td>Toplantı</td><td>${meeting.title}</td></tr><tr><td>Departman</td><td>${getDept(meeting.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(meeting.datetime)}</td></tr><tr><td>Katılımcılar</td><td>${(meeting.participants || []).map(getName).join(", ")}</td></tr></table><h2>Alınan Kararlar</h2><div class="box">${kararlar || "—"}</div><h2>Aksiyon Maddeleri</h2><div class="box">${aksiyonlar || "—"}</div><script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  };
  return (
    <Modal title="Toplantı Raporu" onClose={onClose}>
      <div style={{ background: "#F5F4F0", borderRadius: 9, padding: "11px 14px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.9 }}>
        <div><strong>Toplantı:</strong> {meeting.title}</div>
        <div><strong>Tarih:</strong> {fmtDateTime(meeting.datetime)}</div>
      </div>
      <div style={{ marginBottom: 11 }}><label style={S.label}>Alınan Kararlar</label><textarea style={{ ...S.textarea, minHeight: 80 }} value={kararlar} onChange={e => setKararlar(e.target.value)} /></div>
      <div style={{ marginBottom: 16 }}><label style={S.label}>Aksiyon Maddeleri</label><textarea style={{ ...S.textarea, minHeight: 80 }} value={aksiyonlar} onChange={e => setAksiyonlar(e.target.value)} /></div>
      <div style={{ ...S.flexBetween }}>
        <button style={S.btn("ghost")} onClick={printPdf}><Icon name="download" size={13} /> PDF</button>
        <div style={S.flex(7)}><button style={S.btn("ghost")} onClick={onClose}>İptal</button><button style={S.btn()} onClick={() => onSave(meeting.id, { kararlar, aksiyonlar })}>Kaydet</button></div>
      </div>
    </Modal>
  );
}

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
function DepartmentsPage({ depts, tasks, meetings, users, userProfile }) {
  const [modal, setModal] = useState(null);
  if (userProfile?.role !== "Admin") return <div style={S.card}><div style={S.empty}>Admin yetkisi gereklidir.</div></div>;

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
      <div style={{ ...S.flexBetween, marginBottom: 14 }}><div /><button style={S.btn()} onClick={() => setModal({ mode: "add", dept: { name: "", desc: "" } })}><Icon name="plus" size={15} /> Departman Ekle</button></div>
      <div style={S.grid3}>
        {depts.map(d => (
          <div key={d.id} style={{ ...S.card, position: "relative" }}>
            <div style={{ position: "absolute", top: 12, right: 12, ...S.flex(5) }}>
              <button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => setModal({ mode: "edit", dept: { ...d } })}><Icon name="edit" size={13} /></button>
              <button style={{ ...S.btn("ghost"), padding: "4px 8px", color: "#FF3B30" }} onClick={() => del(d.id)}><Icon name="trash" size={13} /></button>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, paddingRight: 68 }}>{d.name}</div>
            <div style={{ fontSize: 12.5, color: "#636366", marginBottom: 14 }}>{d.desc}</div>
            <div style={{ display: "flex", gap: 18 }}>
              {[["Görev", tasks.filter(t => t.deptId === d.id).length, "#0A84FF"], ["Toplantı", meetings.filter(m => m.deptId === d.id).length, "#30D158"], ["Üye", users.filter(u => u.deptId === d.id).length, "#FF9F0A"]].map(([label, num, color]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{num}</div>
                  <div style={{ fontSize: 11, color: "#8A8A8E" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
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
  if (userProfile?.role !== "Admin") return <div style={S.card}><div style={S.empty}>Admin yetkisi gereklidir.</div></div>;

  const ROLE_COLOR = { Admin: "#FF3B30", "Departman Üyesi": "#0A84FF", "Genel Üye": "#30D158" };
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
      <div style={{ ...S.flexBetween, marginBottom: 14 }}><div /><button style={S.btn()} onClick={() => setModal({ mode: "add", user: { name: "", email: "", password: "", role: "Genel Üye", deptId: "", title: "", avatar: "", managerId: null } })}><Icon name="plus" size={15} /> Kullanıcı Ekle</button></div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["İsim", "E-posta", "Unvan", "Rol", "Departman", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td style={S.td}><div style={S.flex(8)}><div style={S.avatar(avatarColor(u.id))}>{u.avatar || u.name?.[0]}</div><strong>{u.name}</strong></div></td>
              <td style={S.td}>{u.email}</td>
              <td style={S.td}><span style={{ fontSize: 12.5, color: "#636366" }}>{u.title || "—"}</span></td>
              <td style={S.td}><span style={S.badge(ROLE_COLOR[u.role] || "#999")}>{u.role}</span></td>
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
            <div><label style={S.label}>Rol</label><select style={S.select} value={modal.user.role} onChange={e => setModal(p => ({ ...p, user: { ...p.user, role: e.target.value } }))}><option>Admin</option><option>Departman Üyesi</option><option>Genel Üye</option></select></div>
            <div><label style={S.label}>Departman</label><select style={S.select} value={modal.user.deptId || ""} onChange={e => setModal(p => ({ ...p, user: { ...p.user, deptId: e.target.value || null } }))}><option value="">—</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          </div>
          {err && <div style={{ color: "#FF3B30", fontSize: 12 }}>{err}</div>}
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
            <div key={m.id} onClick={() => setSelected(m.id === selected ? null : m.id)} style={{ padding: "12px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 4, background: selected === m.id ? "#F0F0F5" : "transparent", border: selected === m.id ? "1px solid #E5E5EA" : "1px solid transparent" }}>
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
          <div style={{ padding: "14px", background: "#F9F9F9", borderRadius: 10, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{selMsg.body}</div>
          {(selMsg.replies || []).map(r => (
            <div key={r.id} style={{ ...S.flex(10), marginBottom: 10, alignItems: "flex-start" }}>
              <div style={S.avatar(avatarColor(r.fromId))}>{users.find(u => u.id === r.fromId)?.avatar || "?"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#636366" }}>{getName(r.fromId)}</div>
                <div style={{ fontSize: 13, marginTop: 3, padding: "8px 12px", background: "#F0F0F5", borderRadius: 8 }}>{r.body}</div>
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
  const incoming = fileRequests.filter(f => f.toDeptId === userProfile?.deptId || userProfile?.role === "Admin");
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

// ─── ORG TREE ─────────────────────────────────────────────────────────────────
function OrgTreePage({ users, depts, userProfile }) {
  const [selected, setSelected] = useState(null);
  const roots = users.filter(u => !u.managerId);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  function OrgNode({ user, depth = 0 }) {
    const children = users.filter(u => u.managerId === user.id);
    const isSel = selected === user.id;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div onClick={() => setSelected(isSel ? null : user.id)} style={{ background: isSel ? "#1C1C1E" : "#fff", color: isSel ? "#fff" : "#1C1C1E", border: `2px solid ${isSel ? "#1C1C1E" : "#E5E5EA"}`, borderRadius: 12, padding: "12px 16px", minWidth: 155, cursor: "pointer", boxShadow: isSel ? "0 4px 20px rgba(0,0,0,.18)" : "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ ...S.flex(8), marginBottom: 6 }}>
            <div style={{ ...S.avatar(isSel ? "#ffffff33" : avatarColor(user.id)), color: isSel ? "#fff" : "#fff", width: 28, height: 28, fontSize: 10 }}>{user.avatar || user.name?.[0]}</div>
            <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{user.name}</div><div style={{ fontSize: 10.5, opacity: 0.65 }}>{user.title || user.role}</div></div>
          </div>
          <span style={{ ...S.badge(isSel ? "#ffffff33" : "#0A84FF"), color: isSel ? "#fff" : "#0A84FF", fontSize: 10 }}>{user.role === "Admin" ? "Admin" : getDept(user.deptId)}</span>
        </div>
        {children.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 2, height: 20, background: "#E5E5EA" }} />
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", position: "relative" }}>
              {children.length > 1 && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: `${(children.length - 1) * 175}px`, height: 2, background: "#E5E5EA" }} />}
              {children.map(child => (
                <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 2, height: 20, background: "#E5E5EA" }} />
                  <OrgNode user={child} depth={depth + 1} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const selUser = users.find(u => u.id === selected);
  return (
    <div>
      <div style={{ ...S.card, overflow: "auto", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0", minWidth: 500 }}>
          <div style={{ display: "flex", gap: 32 }}>
            {roots.map(r => <OrgNode key={r.id} user={r} />)}
          </div>
        </div>
      </div>
      {selUser && (
        <div style={{ ...S.card, ...S.flex(16) }}>
          <div style={{ ...S.avatar(avatarColor(selUser.id)), width: 52, height: 52, fontSize: 16 }}>{selUser.avatar || selUser.name?.[0]}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{selUser.name}</div>
            <div style={{ fontSize: 13, color: "#636366" }}>{selUser.title} · {selUser.role}</div>
            <div style={{ fontSize: 12.5, color: "#8A8A8E" }}>{selUser.email}</div>
            <div style={{ ...S.flex(8), marginTop: 8 }}>
              <span style={S.tag}>{getDept(selUser.deptId)}</span>
              {selUser.managerId && <span style={S.tag}>Yöneticisi: {users.find(u => u.id === selUser.managerId)?.name}</span>}
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
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserProfile({ id: snap.id, ...snap.data() });
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
    ];
    return () => subs.forEach(u => u());
  }, [currentUser]);

  const pendingMsgs = messages.filter(m => (m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId) && m.status === "bekliyor").length;
  const pendingFiles = fileRequests.filter(f => f.toDeptId === userProfile?.deptId && f.status === "bekliyor").length;

  if (authLoading) return <div style={{ minHeight: "100vh", background: "#1C1C1E", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>Yükleniyor…</div>;
  if (!currentUser) return <LoginPage onLogin={u => setCurrentUser(u)} />;
  if (!userProfile) return <div style={{ minHeight: "100vh", background: "#1C1C1E", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>Profil yükleniyor…</div>;

  const NAV_GROUPS = [
    { label: "Genel", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "tasks", label: "Görevler", icon: "tasks" }, { id: "meetings", label: "Toplantılar", icon: "calendar" }] },
    { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }, { id: "userlist", label: "Kullanıcılar", icon: "users" }] },
    { label: "İletişim", items: [{ id: "messages", label: "Mesajlar", icon: "inbox", badge: pendingMsgs }, { id: "filerequests", label: "Dosya Talepleri", icon: "file", badge: pendingFiles }] },
    { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }] },
  ];
  const TITLES = { dashboard: "Dashboard", tasks: "Görev Yönetimi", meetings: "Toplantılar", orgtree: "Yönetim Ağacı", departments: "Departmanlar", userlist: "Kullanıcılar", messages: "Mesajlar", filerequests: "Dosya Talepleri", reports: "Raporlar" };
  const props = { tasks, meetings, depts, users, messages, fileRequests, currentUser, userProfile };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard {...props} />;
      case "tasks": return <TasksPage {...props} />;
      case "meetings": return <MeetingsPage {...props} />;
      case "orgtree": return <OrgTreePage {...props} />;
      case "departments": return <DepartmentsPage {...props} />;
      case "userlist": return <UsersPage {...props} />;
      case "messages": return <MessagesPage {...props} />;
      case "filerequests": return <FileRequestsPage {...props} />;
      case "reports": return <ReportsPage {...props} />;
      default: return null;
    }
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #2C2C2E" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>🏛 DernekYönetim</div>
          <div style={{ fontSize: 10.5, color: "#636366", marginTop: 2 }}>v2.0 · Firebase</div>
        </div>
        <nav style={S.nav}>
          {NAV_GROUPS.map(g => (
            <div key={g.label}>
              <div style={S.navSection}>{g.label}</div>
              {g.items.map(n => (
                <div key={n.id} style={S.navItem(page === n.id)} onClick={() => setPage(n.id)}>
                  <Icon name={n.icon} size={16} />
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {n.badge > 0 && <span style={{ background: "#FF3B30", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{n.badge}</span>}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: "0 8px" }}>
          <div style={{ background: "#2C2C2E", borderRadius: 8, padding: "10px 12px" }}>
            <div style={S.flex(8)}>
              <div style={{ ...S.avatar(avatarColor(currentUser.uid)), width: 28, height: 28, fontSize: 10 }}>{userProfile.avatar || userProfile.name?.[0]}</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{userProfile.name}</div><div style={{ fontSize: 10.5, color: "#636366" }}>{userProfile.role}</div></div>
            </div>
            <button onClick={() => signOut(auth)} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, color: "#FF3B30", fontSize: 11.5, cursor: "pointer", background: "none", border: "none", padding: 0, fontWeight: 600, fontFamily: "inherit" }}>
              <Icon name="logout" size={13} /> Çıkış Yap
            </button>
          </div>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{TITLES[page]}</div>
          <div style={{ fontSize: 12.5, color: "#8A8A8E" }}>{new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
        <div style={S.content}>{renderPage()}</div>
      </div>
    </div>
  );
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function ReportsPage({ meetings, depts, users }) {
  const done = meetings.filter(m => m.report);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || id;
  const printReport = m => {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${m.title}</title><style>body{font-family:Calibri,Arial;padding:40px;font-size:13px;line-height:1.7;}h1{font-size:20px;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}td{padding:7px 10px;border:1px solid #ccc;}td:first-child{font-weight:700;background:#f9f9f9;width:130px;}h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;margin:20px 0 8px;}.box{border:1px solid #ccc;padding:12px;min-height:70px;white-space:pre-wrap;}</style></head><body><h1>Toplantı Raporu</h1><table><tr><td>Toplantı</td><td>${m.title}</td></tr><tr><td>Departman</td><td>${getDept(m.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(m.datetime)}</td></tr><tr><td>Katılımcılar</td><td>${(m.participants || []).map(getName).join(", ")}</td></tr></table><h2>Kararlar</h2><div class="box">${m.report?.kararlar || "—"}</div><h2>Aksiyonlar</h2><div class="box">${m.report?.aksiyonlar || "—"}</div><script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  };
  return (
    <div>
      <div style={S.grid3}>
        {[["Toplam", meetings.length, "#0A84FF"], ["Raporlanan", done.length, "#30D158"], ["Bekleyen", meetings.length - done.length, "#FF9F0A"]].map(([label, num, color]) => (
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