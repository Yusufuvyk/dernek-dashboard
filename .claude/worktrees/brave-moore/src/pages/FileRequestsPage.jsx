import { useState } from "react";
import { db } from "../firebase";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import { S } from "../utils/styles";
import { STATUS } from "../utils/constants";
import { hasAdminRole } from "../utils/roles";
import { timeAgo } from "../utils/helpers";
import Icon from "../components/Icon";
import Modal from "../components/Modal";

export default function FileRequestsPage({ fileRequests, users, depts, currentUser, userProfile }) {
  const [tab, setTab] = useState("gelen");
  const [compose, setCompose] = useState(false);
  const [responding, setResponding] = useState(null);
  const [responseText, setResponseText] = useState("");
  const getName = id => users.find(u => u.id === id)?.name || "—";
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
