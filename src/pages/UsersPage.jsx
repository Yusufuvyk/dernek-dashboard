import { useState } from "react";
import { db, auth, firebaseConfig } from "../firebase";
import {
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  getDocs, query, where, serverTimestamp
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, getAuth } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";

import { S } from "../utils/styles";
import { avatarColor, ROMA_RED, STOIC_NAVY, GOLD, ROLE_COLOR } from "../utils/constants";
import { hasAdminRole, displayRole, canDeleteUsers } from "../utils/roles";
import { fmtDate, firebaseErrTR } from "../utils/helpers";
import Icon from "../components/Icon";
import Modal from "../components/Modal";

export default function UsersPage({ users, depts, userProfile, currentUser, registrations }) {
  // currentUser kendi kendini silemez — deleteUser fonksiyonunda kontrol edilir
  const [modal, setModal] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  if (!hasAdminRole(userProfile?.role)) return <div style={S.card}><div style={S.empty}>Başkan yetkisi gereklidir.</div></div>;

  const pending = (registrations || []).filter(r => r.status === "bekliyor");
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
      `"${u.name}" adlı kullanıcıyı silmek istiyor musunuz?\n\n` +
      `• Profil silinir\n• Tüm devamsızlık kayıtları silinir\n• Tekrar giriş yapamaz`
    )) return;
    try {
      // 1. Silinen kullanıcı kaydı (UID saklanır, tekrar onaylama için gerekli)
      if (u.email) {
        await setDoc(doc(db, "deletedUsers", u.email.toLowerCase()), {
          email: u.email.toLowerCase(), name: u.name, uid: u.id, deletedAt: new Date().toISOString(),
        });
      }

      // 2. Firestore profilini sil (bu yeterli: profil yoksa app anında signOut yapar)
      await deleteDoc(doc(db, "users", u.id));

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

      // İkincil Firebase app — admin oturumunu bozmadan UID alır
      const secondaryApp = getApps().find(a => a.name === "secondary")
        || initializeApp(firebaseConfig, "secondary");
      const secondaryAuth = getAuth(secondaryApp);

      let uid;
      let needsPasswordReset = false;
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, reg.email, reg.password);
        uid = cred.user.uid;
      } catch (e) {
        if (e.code === "auth/email-already-in-use") {
          // Auth hesabı var — önce yeni şifreyle giriş dene
          try {
            const cred = await signInWithEmailAndPassword(secondaryAuth, reg.email, reg.password);
            uid = cred.user.uid;
          } catch (e2) {
            // Şifre uyuşmuyor — daha önce silinmiş kullanıcı, eski UID'yi al
            const deletedSnap = await getDocs(
              query(collection(db, "deletedUsers"), where("email", "==", reg.email.toLowerCase()))
            );
            if (!deletedSnap.empty) {
              uid = deletedSnap.docs[0].data().uid;
              needsPasswordReset = true;
            } else {
              throw e2;
            }
          }
        } else {
          throw e;
        }
      }

      await setDoc(doc(db, "users", uid), {
        name: reg.name, email: reg.email, role,
        deptId: deptId || null, title: title || "",
        avatar: reg.name.slice(0, 2).toUpperCase(),
        managerId: null, createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, "registrations", reg.id));
      // Silinen hesap yeniden onaylandı — eski UID kullanıldı, şifre sıfırlama maili gönder
      if (needsPasswordReset) {
        await sendPasswordResetEmail(auth, reg.email);
        alert(`Hesap onaylandı.\n\n"${reg.email}" adresine şifre sıfırlama bağlantısı gönderildi. Kullanıcı bu bağlantıyla yeni şifresini belirleyip giriş yapabilir.`);
      }
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
                  {u.id !== currentUser?.uid && canDeleteUsers(userProfile) && (
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
                  <option value="Teknik Yönetici Yardımcısı">Teknik Yönetici Yardımcısı</option>
                  <option value="Başkan Yardımcısı">Başkan Yardımcısı</option>
                  <option value="Departman Yöneticisi">Departman Yöneticisi</option>
                  <option value="Departman Yardımcısı">Departman Yardımcısı</option>
                  <option value="Üye">Departman Üyesi</option>
                  <option value="Denetmen">Denetmen</option>
                  <option value="Denetmen Yardımcısı">Denetmen Yardımcısı</option>
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
            <div><label style={S.label}>Rol</label><select style={S.select} value={modal.user.role} onChange={e => setModal(p => ({ ...p, user: { ...p.user, role: e.target.value } }))}><option value="Başkan">Başkan</option><option value="Teknik Yönetici">Teknik Yönetici</option><option value="Teknik Yönetici Yardımcısı">Teknik Yönetici Yardımcısı</option><option value="Başkan Yardımcısı">Başkan Yardımcısı</option><option value="Departman Yöneticisi">Departman Yöneticisi</option><option value="Departman Yardımcısı">Departman Yardımcısı</option><option value="Üye">Departman Üyesi</option><option value="Denetmen">Denetmen</option><option value="Denetmen Yardımcısı">Denetmen Yardımcısı</option></select></div>
            <div><label style={S.label}>Departman</label><select style={S.select} value={modal.user.deptId || ""} onChange={e => setModal(p => ({ ...p, user: { ...p.user, deptId: e.target.value || null } }))}><option value="">—</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          </div>
          {err && <div style={{ color: "#6A5610", fontSize: 12 }}>{err}</div>}
          <div style={{ ...S.flex(10), justifyContent: "flex-end" }}><button style={S.btn("ghost")} onClick={() => setModal(null)}>İptal</button><button style={S.btn()} onClick={modal.mode === "add" ? createUser : updateUser} disabled={loading}>{loading ? "Kaydediliyor…" : "Kaydet"}</button></div>
        </div>
      </Modal>}
    </div>
  );
}
