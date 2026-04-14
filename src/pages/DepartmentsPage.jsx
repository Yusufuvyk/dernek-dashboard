import { useState } from "react";
import { db } from "../firebase";
import {
  collection, doc, addDoc, deleteDoc, updateDoc
} from "firebase/firestore";

import { S } from "../utils/styles";
import { avatarColor, STOIC_NAVY, ROMA_RED, GOLD } from "../utils/constants";
import { hasAdminRole, displayRole } from "../utils/roles";
import Icon from "../components/Icon";
import Modal from "../components/Modal";

export default function DepartmentsPage({ depts, tasks, meetings, users, userProfile }) {
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
