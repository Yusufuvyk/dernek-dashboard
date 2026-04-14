import { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { S } from "../utils/styles";
import { ROMA_RED, STOIC_NAVY, GOLD } from "../utils/constants";
import { avatarColor } from "../utils/constants";
import { today, fmtDate, fmtDateTime, monthLabel, dayFromDateTime, openPrintableReport } from "../utils/helpers";
import Icon from "../components/Icon";

export default function AuditPage({ attendance, tasks, users, depts, meetings, currentUser }) {
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const [taskReportMonth, setTaskReportMonth] = useState(today().slice(0, 7));

  const absenceCounts = {};
  attendance.forEach(r => {
    if (r.status === "gelmedi") {
      absenceCounts[r.userId] = (absenceCounts[r.userId] || 0) + 1;
    }
  });
  const absentWarnings = Object.entries(absenceCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  const delayedTasks = tasks.filter(t => t.status === "gecikmeli");
  const pendingApproval = tasks.filter(t => t.status === "yapıldı");

  const pendingExcuses = [];
  (meetings || []).forEach(m => {
    const excuses = m.excuses || {};
    const statuses = m.excuseStatuses || {};
    Object.entries(excuses).forEach(([userId, reason]) => {
      const st = statuses[userId] || "bekliyor";
      pendingExcuses.push({
        meetingId: m.id, meetingTitle: m.title, meetingDate: m.datetime,
        deptId: m.deptId, userId, reason, status: st,
      });
    });
  });
  const bekleyenExcuses = pendingExcuses.filter(e => e.status === "bekliyor");

  const approveExcuse = async (ex) => {
    const meeting = (meetings || []).find(m => m.id === ex.meetingId);
    if (!meeting) return;
    try {
      const excuseStatuses = { ...(meeting.excuseStatuses || {}), [ex.userId]: "onaylı" };
      await updateDoc(doc(db, "meetings", ex.meetingId), { excuseStatuses });
      await setDoc(doc(db, "attendance", `${ex.meetingId}_${ex.userId}`), {
        meetingId: ex.meetingId, meetingTitle: ex.meetingTitle,
        userId: ex.userId, date: dayFromDateTime(ex.meetingDate),
        deptId: ex.deptId || null, status: "izinli", excuse: ex.reason,
        source: "meeting-report", updatedBy: currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) { alert("Hata: " + e.message); }
  };

  const rejectExcuse = async (ex) => {
    const meeting = (meetings || []).find(m => m.id === ex.meetingId);
    if (!meeting) return;
    try {
      const excuseStatuses = { ...(meeting.excuseStatuses || {}), [ex.userId]: "reddedildi" };
      await updateDoc(doc(db, "meetings", ex.meetingId), { excuseStatuses });
    } catch (e) { alert("Hata: " + e.message); }
  };

  const generateMonthlyTaskReport = () => {
    const ml = monthLabel(taskReportMonth);
    const monthTasks = tasks.filter(t => {
      const d = t.endDate || t.startDate || "";
      return d.slice(0, 7) === taskReportMonth;
    });

    const tamamlandi = monthTasks.filter(t => t.status === "tamamlandı");
    const yapildi    = monthTasks.filter(t => t.status === "yapıldı");
    const gecikmeli  = monthTasks.filter(t => t.status === "gecikmeli");
    const devam      = monthTasks.filter(t => t.status === "devam");
    const planlandi  = monthTasks.filter(t => t.status === "planlandı");

    const taskRow = t =>
      `<tr><td>${t.title}${t.desc ? `<div style="font-size:11px;color:#8A8A8E">${t.desc}</div>` : ""}</td>` +
      `<td>${getDept(t.deptId)}</td>` +
      `<td>${(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(getName).join(", ")}</td>` +
      `<td>${fmtDate(t.endDate || t.startDate)}</td>` +
      `<td style="color:${t.status === "tamamlandı" ? "#30D158" : t.status === "gecikmeli" ? "#8B0000" : "#B98B2C"};font-weight:700">${{ tamamlandı: "Tamamlandı", yapıldı: "Teslim Edildi", gecikmeli: "Gecikmeli", devam: "Devam Ediyor", "planlandı": "Planlandı" }[t.status] || t.status}</td>` +
      `${t.mazeretGecikme ? `<td style="font-style:italic;color:#636366;font-size:12px">${t.mazeretGecikme}</td>` : "<td>—</td>"}` +
      `</tr>`;

    const section = (emoji, title, list) =>
      list.length === 0 ? "" :
      `<h2>${emoji} ${title} (${list.length})</h2>
      <table>
        <tr style="background:#f7f3f2">
          <td><b>Görev</b></td><td><b>Departman</b></td><td><b>Atananlar</b></td><td><b>Bitiş</b></td><td><b>Durum</b></td><td><b>Notlar</b></td>
        </tr>
        ${list.map(taskRow).join("")}
      </table>`;

    openPrintableReport({
      title: `Görev Denetim Raporu — ${ml}`,
      bodyHtml: `
        <h1>Aylık Görev Denetim Raporu</h1>
        <table>
          <tr><td>Dönem</td><td><strong>${ml}</strong></td></tr>
          <tr><td>Toplam Görev</td><td>${monthTasks.length}</td></tr>
          <tr><td>Tamamlandı</td><td style="color:#30D158;font-weight:700">${tamamlandi.length}</td></tr>
          <tr><td>Teslim Edildi (Onay Bekliyor)</td><td style="color:#B98B2C;font-weight:700">${yapildi.length}</td></tr>
          <tr><td>Gecikmeli</td><td style="color:#8B0000;font-weight:700">${gecikmeli.length}</td></tr>
          <tr><td>Devam Ediyor</td><td style="color:#1B1D22;font-weight:700">${devam.length}</td></tr>
          <tr><td>Planlandı</td><td>${planlandi.length}</td></tr>
          <tr><td>Tamamlanma Oranı</td><td style="font-weight:700">${monthTasks.length ? Math.round(((tamamlandi.length + yapildi.length) / monthTasks.length) * 100) : 0}%</td></tr>
        </table>
        ${section("✓", "Tamamlanan Görevler", tamamlandi)}
        ${section("⏳", "Teslim Edildi — Onay Bekleyen", yapildi)}
        ${section("⚠", "Gecikmeli Görevler", gecikmeli)}
        ${section("▸", "Devam Eden Görevler", devam)}
        ${section("·", "Planlandı", planlandi)}
      `,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          ["Devamsızlık Uyarısı", absentWarnings.length, ROMA_RED],
          ["Bekleyen Mazaret", bekleyenExcuses.length, GOLD],
          ["Gecikmeli Görev", delayedTasks.length, "#8A6A16"],
          ["Onay Bekleyen Görev", pendingApproval.length, STOIC_NAVY],
        ].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>{num}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: GOLD }}>📋 Bekleyen Mazaret Talepleri</div>
        {bekleyenExcuses.length === 0 ? (
          <div style={S.empty}>Onay bekleyen mazaret talebi yok</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>{["Kişi", "Toplantı", "Tarih", "Mazeret", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {bekleyenExcuses.map((ex, i) => {
                const u = users.find(x => x.id === ex.userId);
                return (
                  <tr key={i}>
                    <td style={S.td}>
                      <div style={S.flex(7)}>
                        <div style={{ ...S.avatar(avatarColor(ex.userId)), width: 28, height: 28, fontSize: 10 }}>{u?.avatar || u?.name?.[0] || "?"}</div>
                        <strong>{getName(ex.userId)}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: "#8A8A8E", marginTop: 2, marginLeft: 35 }}>{getDept(ex.deptId)}</div>
                    </td>
                    <td style={S.td}><strong>{ex.meetingTitle}</strong></td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmtDateTime(ex.meetingDate)}</td>
                    <td style={{ ...S.td, maxWidth: 280, wordBreak: "break-word", whiteSpace: "normal", color: "#444", lineHeight: 1.5 }}>{ex.reason}</td>
                    <td style={S.td}>
                      <div style={S.flex(6)}>
                        <button style={{ ...S.btn("green"), padding: "4px 10px", fontSize: 12 }} onClick={() => approveExcuse(ex)}><Icon name="check" size={12} /> Onayla</button>
                        <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 12 }} onClick={() => rejectExcuse(ex)}>Reddet</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pendingExcuses.filter(e => e.status !== "bekliyor").length > 0 && (
        <div style={S.card}>
          <div style={{ ...S.cardTitle, marginBottom: 12 }}>Mazeret Geçmişi</div>
          <table style={S.table}>
            <thead><tr>{["Kişi", "Toplantı", "Mazeret", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {pendingExcuses.filter(e => e.status !== "bekliyor").map((ex, i) => (
                <tr key={i}>
                  <td style={S.td}><strong>{getName(ex.userId)}</strong><div style={{ fontSize: 11, color: "#8A8A8E" }}>{getDept(ex.deptId)}</div></td>
                  <td style={S.td}>{ex.meetingTitle}</td>
                  <td style={{ ...S.td, wordBreak: "break-word", whiteSpace: "normal", maxWidth: 260 }}>{ex.reason}</td>
                  <td style={S.td}>
                    <span style={S.badge(ex.status === "onaylı" ? "#30D158" : ROMA_RED)}>
                      {ex.status === "onaylı" ? "Onaylı" : "Reddedildi"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: ROMA_RED }}>⚠ Devamsızlık Uyarıları (3+ Gelmedi)</div>
        {absentWarnings.length === 0 ? (
          <div style={S.empty}>Devamsızlık uyarısı yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Kişi", "Departman", "Gelmedi Sayısı", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {absentWarnings.map(([userId, count]) => {
                const u = users.find(x => x.id === userId);
                return (
                  <tr key={userId}>
                    <td style={S.td}><div style={S.flex(8)}><div style={{ ...S.avatar(avatarColor(userId)), width: 28, height: 28, fontSize: 10 }}>{u?.avatar || u?.name?.[0] || "?"}</div><strong>{getName(userId)}</strong></div></td>
                    <td style={S.td}><span style={S.tag}>{u?.deptId ? getDept(u.deptId) : "—"}</span></td>
                    <td style={S.td}><span style={{ ...S.badge(ROMA_RED), fontSize: 12, fontWeight: 700 }}>{count} kez</span></td>
                    <td style={S.td}><span style={S.badge(ROMA_RED)}>Uyarı</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: GOLD }}>⚠ Gecikmeli Görevler</div>
        {delayedTasks.length === 0 ? (
          <div style={S.empty}>Gecikmeli görev yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Görev", "Departman", "Bitiş Tarihi", "Atananlar", "Mazeret"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {delayedTasks.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><strong>{t.title}</strong>{t.desc && <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{t.desc}</div>}</td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}><span style={{ color: ROMA_RED, fontWeight: 600 }}>{fmtDate(t.endDate)}</span></td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap" }}>{(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={{ ...S.td, maxWidth: 200, color: t.mazeretGecikme ? "#636366" : ROMA_RED, fontStyle: t.mazeretGecikme ? "italic" : "normal" }}>
                    {t.mazeretGecikme || <span style={{ fontWeight: 600 }}>Mazeret girilmedi</span>}
                    {t.mazeretTarih && <div style={{ fontSize: 10.5, color: "#8A8A8E" }}>{fmtDate(t.mazeretTarih)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, marginBottom: 12, color: STOIC_NAVY }}>Onay Bekleyen Görevler</div>
        {pendingApproval.length === 0 ? (
          <div style={S.empty}>Onay bekleyen görev yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Görev", "Departman", "Atananlar", "Bitiş"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {pendingApproval.map(t => (
                <tr key={t.id}>
                  <td style={S.td}><strong>{t.title}</strong></td>
                  <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
                  <td style={S.td}><div style={{ ...S.flex(4), flexWrap: "wrap" }}>{(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).filter(Boolean).map(id => <span key={id} style={S.tag}>{getName(id)}</span>)}</div></td>
                  <td style={S.td}>{fmtDate(t.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...S.card, background: "#FAFBFF", border: "1px solid #D9E4F5" }}>
        <div style={{ ...S.flexBetween, marginBottom: 14 }}>
          <div>
            <div style={{ ...S.cardTitle, marginBottom: 3, color: STOIC_NAVY }}>Aylık Görev Denetim Raporu</div>
            <div style={{ fontSize: 12, color: "#8A8A8E" }}>Seçilen aya ait tüm görevleri PDF olarak indirin</div>
          </div>
          <div style={{ ...S.flex(8), flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div>
              <label style={S.label}>Ay / Yıl</label>
              <input type="month" style={{ ...S.input, width: 160 }} value={taskReportMonth} onChange={e => setTaskReportMonth(e.target.value)} />
            </div>
            <button style={{ ...S.btn("blue"), marginTop: 20 }} onClick={generateMonthlyTaskReport}>
              <Icon name="download" size={14} /> PDF İndir
            </button>
          </div>
        </div>
        {(() => {
          const monthTasks = tasks.filter(t => {
            const d = t.endDate || t.startDate || "";
            return d.slice(0, 7) === taskReportMonth;
          });
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 10 }}>
              {[
                ["Toplam", monthTasks.length, STOIC_NAVY],
                ["Tamamlandı", monthTasks.filter(t => t.status === "tamamlandı").length, "#30D158"],
                ["Teslim Edildi", monthTasks.filter(t => t.status === "yapıldı").length, GOLD],
                ["Gecikmeli", monthTasks.filter(t => t.status === "gecikmeli").length, ROMA_RED],
                ["Devam Ediyor", monthTasks.filter(t => t.status === "devam").length, "#667085"],
              ].map(([label, num, color]) => (
                <div key={label} style={{ border: "1px solid #ECECEF", borderRadius: 12, padding: "9px 10px", background: "#fff", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{num}</div>
                  <div style={{ fontSize: 10.5, color: "#6B6B65" }}>{label}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
