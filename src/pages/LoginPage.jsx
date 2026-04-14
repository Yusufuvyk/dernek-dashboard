import { useState } from "react";
import { db, auth } from "../firebase";
import marcusLogo from "../assets/marcus-logo.png";
import {
  collection, addDoc, getDocs, query, limit, where
} from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";

import { S } from "../utils/styles";

export default function LoginPage({ onLogin }) {
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
      const emailLower = reg.email.trim().toLowerCase();
      const existing = await getDocs(query(collection(db, "registrations"), where("email", "==", emailLower), limit(1)));
      if (!existing.empty) { setErr("Bu e-posta ile zaten bir kayıt talebi mevcut."); setLoading(false); return; }

      const existingUser = await getDocs(query(collection(db, "users"), where("email", "==", emailLower), limit(1)));
      if (!existingUser.empty) { setErr("Bu e-posta adresiyle zaten bir hesap mevcut."); setLoading(false); return; }
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
