import { useState } from "react";
import { db, auth } from "../firebase";
import marcusLogo from "../assets/marcus-logo.png";
import {
  collection, addDoc, getDocs, query, limit, where
} from "firebase/firestore";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

import { S } from "../utils/styles";
import { ROMA_RED } from "../utils/constants";

export default function LoginPage({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [reg, setReg] = useState({ name: "", email: "", pass: "", title: "", dept: "" });
  const setF = (k, v) => setReg(p => ({ ...p, [k]: v }));
  const [regDone, setRegDone] = useState(false);

  // Şifremi unuttum
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setErr("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      onLogin(cred.user);
    } catch { setErr("E-posta veya şifre hatalı."); }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!resetEmail.trim()) { setErr("E-posta adresi zorunludur."); return; }
    setLoading(true); setErr("");
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetDone(true);
    } catch { setErr("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı."); }
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
        name: reg.name.trim(), email: emailLower,
        password: reg.pass, title: reg.title.trim(), desiredDept: reg.dept.trim(),
        status: "bekliyor", createdAt: new Date().toISOString(),
      });
      setRegDone(true);
    } catch (e) { setErr("Kayıt talebi gönderilemedi: " + e.message); }
    setLoading(false);
  };

  const tabBtn = (id, label) => (
    <button onClick={() => { setTab(id); setErr(""); setResetMode(false); setResetDone(false); }}
      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: tab === id ? "#111827" : "transparent", color: tab === id ? "#fff" : "#667085", transition: "all .15s" }}
    >{label}</button>
  );

  const inputStyle = { ...S.input, padding: "10px 12px", fontSize: 13.5 };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "36px 34px 30px", width: 440, border: "1px solid #E4E7EC", boxShadow: "0 8px 40px rgba(0,0,0,.08)" }}>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <img src={marcusLogo} alt="Marcus" style={{ width: 72, height: 72, objectFit: "contain", mixBlendMode: "multiply", marginBottom: 8 }} />
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3, color: "#101828", textTransform: "uppercase" }}>MARCUS</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Yönetim Sistemi</div>
        </div>

        {/* Tab */}
        {!resetMode && (
          <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {tabBtn("login", "Giriş Yap")}
            {tabBtn("register", "Kayıt Ol")}
          </div>
        )}

        {/* Şifremi Unuttum */}
        {resetMode ? (
          resetDone ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>✉️</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Mail gönderildi!</div>
              <div style={{ fontSize: 13, color: "#667085", lineHeight: 1.7 }}>
                <b>{resetEmail}</b> adresine şifre sıfırlama bağlantısı gönderildi.<br />Gelen kutunuzu kontrol edin.
              </div>
              <button style={{ ...S.btn("ghost"), marginTop: 18, fontSize: 13 }} onClick={() => { setResetMode(false); setResetDone(false); setResetEmail(""); }}>
                Giriş sayfasına dön
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 6, fontSize: 15, fontWeight: 700, color: "#101828" }}>Şifremi Unuttum</div>
              <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 18, lineHeight: 1.6 }}>
                Kayıtlı e-posta adresinizi girin, şifre sıfırlama bağlantısı gönderelim.
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>E-posta</label>
                <input style={inputStyle} type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReset()} autoFocus />
              </div>
              {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 12, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
              <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "11px 0", fontSize: 14 }} onClick={handleReset} disabled={loading}>
                {loading ? "Gönderiliyor…" : "Sıfırlama Bağlantısı Gönder"}
              </button>
              <button style={{ ...S.btn("ghost"), width: "100%", justifyContent: "center", marginTop: 8, fontSize: 13 }} onClick={() => { setResetMode(false); setErr(""); }}>
                Geri dön
              </button>
            </>
          )

        ) : tab === "login" ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>E-posta</label>
              <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={S.label}>Şifre</label>
              <input style={inputStyle} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            <div style={{ textAlign: "right", marginBottom: 18 }}>
              <button onClick={() => { setResetMode(true); setErr(""); setResetEmail(email); }}
                style={{ background: "none", border: "none", fontSize: 12, color: ROMA_RED, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                Şifremi unuttum
              </button>
            </div>
            {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 12, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "11px 0", fontSize: 14 }} onClick={handleLogin} disabled={loading}>
              {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
            </button>
          </>

        ) : regDone ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Talebiniz alındı!</div>
            <div style={{ fontSize: 13, color: "#667085", lineHeight: 1.7 }}>Kayıt talebiniz admin onayına gönderildi.<br />Onaylandıktan sonra giriş yapabilirsiniz.</div>
            <button style={{ ...S.btn("ghost"), marginTop: 18 }} onClick={() => { setTab("login"); setRegDone(false); setReg({ name: "", email: "", pass: "", title: "", dept: "" }); }}>
              Giriş sayfasına dön
            </button>
          </div>
        ) : (
          <>
            <div style={S.formRow}>
              <div style={{ marginBottom: 12 }}><label style={S.label}>Ad Soyad</label><input style={inputStyle} value={reg.name} onChange={e => setF("name", e.target.value)} /></div>
              <div style={{ marginBottom: 12 }}><label style={S.label}>Unvan / Görev</label><input style={inputStyle} value={reg.title} onChange={e => setF("title", e.target.value)} placeholder="ör. Muhasebe Uzmanı" /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>Departman</label><input style={inputStyle} value={reg.dept} onChange={e => setF("dept", e.target.value)} placeholder="ör. Finans, Operasyon…" /></div>
            <div style={S.formRow}>
              <div style={{ marginBottom: 12 }}><label style={S.label}>E-posta</label><input style={inputStyle} type="email" value={reg.email} onChange={e => setF("email", e.target.value)} /></div>
              <div style={{ marginBottom: 18 }}><label style={S.label}>Şifre</label><input style={inputStyle} type="password" value={reg.pass} onChange={e => setF("pass", e.target.value)} /></div>
            </div>
            {err && <div style={{ color: "#6A5610", fontSize: 12, marginBottom: 12, padding: "7px 11px", background: "#F7EFC7", borderRadius: 7 }}>{err}</div>}
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "11px 0", fontSize: 14 }} onClick={handleRegister} disabled={loading}>
              {loading ? "Gönderiliyor…" : "Kayıt Talebi Gönder"}
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Talebiniz admin tarafından incelenerek onaylanacaktır.</div>
          </>
        )}
      </div>
    </div>
  );
}
