import { useState } from "react";
import { db } from "../firebase";
import {
  collection, doc, addDoc, deleteDoc, updateDoc, setDoc, serverTimestamp
} from "firebase/firestore";

import { S } from "../utils/styles";
import { STATUS, GOLD, ROMA_RED } from "../utils/constants";
import { hasSuperRole, hasAdminRole, roleLevel } from "../utils/roles";
import { fmtDateTime, dayFromDateTime, openPrintableReport } from "../utils/helpers";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import DeptAccordionPicker from "../components/DeptAccordionPicker";
import RichTextEditor from "../components/RichTextEditor";

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
  const [dtError, setDtError] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const visibleDepts = hasSuperRole(userProfile?.role)
    ? depts
    : depts.filter(d => d.id === userProfile?.deptId);

  // Minimum seçilebilir tarih/saat = şu an (sadece yeni toplantılarda)
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

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

        <DeptAccordionPicker
          label="Katılımcılar"
          users={users}
          depts={depts}
          selected={f.participants || []}
          onChange={v => set("participants", v)}
          userProfile={userProfile}
        />

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

export default function MeetingsPage({ meetings, depts, users, currentUser, userProfile }) {
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
