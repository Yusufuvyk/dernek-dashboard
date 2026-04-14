import { useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection, doc, addDoc, deleteDoc, updateDoc, serverTimestamp
} from "firebase/firestore";

import { S } from "../utils/styles";
import { STATUS } from "../utils/constants";
import { hasSuperRole, hasAdminRole, roleLevel } from "../utils/roles";
import { today, nowLocalISO, fmtDate } from "../utils/helpers";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import DeptAccordionPicker from "../components/DeptAccordionPicker";

function TaskModal({ mode, task, depts, users, userProfile, onSave, onClose }) {
  const [f, setF] = useState(task);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = mode === "edit";
  // Dept Yöneticisi sadece kendi departmanını görebilir
  const visibleDepts = hasSuperRole(userProfile?.role)
    ? depts
    : depts.filter(d => d.id === userProfile?.deptId);

  const assignedArr = Array.isArray(f.assignedTo) ? f.assignedTo : [f.assignedTo].filter(Boolean);

  return (
    <Modal title={isEdit ? "Görevi Düzenle" : "Yeni Görev"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div><label style={S.label}>Başlık</label><input style={S.input} value={f.title} onChange={e => set("title", e.target.value)} /></div>
        <div><label style={S.label}>Açıklama</label><textarea style={S.textarea} value={f.desc} onChange={e => set("desc", e.target.value)} /></div>

        <div><label style={S.label}>Departman</label><select style={S.select} value={f.deptId} onChange={e => set("deptId", e.target.value)} disabled={visibleDepts.length === 1}>{visibleDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>

        <DeptAccordionPicker
          label="Atananlar"
          users={users}
          depts={depts}
          selected={assignedArr}
          onChange={v => set("assignedTo", v)}
          userProfile={userProfile}
        />

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

export default function TasksPage({ tasks, depts, users, currentUser, userProfile }) {
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
