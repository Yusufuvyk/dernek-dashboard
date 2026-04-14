import { useState } from "react";
import { db } from "../firebase";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import { S } from "../utils/styles";
import { STOIC_NAVY, MSG_TYPE, STATUS } from "../utils/constants";
import { avatarColor } from "../utils/constants";
import { hasAdminRole } from "../utils/roles";
import { uid, timeAgo } from "../utils/helpers";
import Icon from "../components/Icon";
import Modal from "../components/Modal";

export default function MessagesPage({ messages, users, depts, currentUser, userProfile }) {
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
