import { useState, useMemo } from "react";
import { S } from "../utils/styles";
import { ROMA_RED, GOLD, STOIC_NAVY } from "../utils/constants";
import { hasAdminRole } from "../utils/roles";
import { today, fmtDate, monthLabel, openPrintableReport } from "../utils/helpers";
import Icon from "../components/Icon";

export default function AttendancePage({ attendance, users, depts, currentUser, userProfile }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedUser, setSelectedUser] = useState("all");
  const [reportMonth, setReportMonth] = useState(today().slice(0, 7));
  const roleRestrictedDept = hasAdminRole(userProfile?.role) ? null : userProfile?.deptId;
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || "—";

  const generateMonthlyAttendanceReport = () => {
    const ml = monthLabel(reportMonth);
    const base = roleRestrictedDept ? attendance.filter(r => r.deptId === roleRestrictedDept) : attendance;
    const monthRecords = base.filter(r => r.date && r.date.startsWith(reportMonth));

    const byUser = {};
    monthRecords.forEach(r => {
      if (!byUser[r.userId]) byUser[r.userId] = { name: getName(r.userId), dept: getDept(r.deptId), katildi: 0, gelmedi: 0, izinli: 0, records: [] };
      if (r.status === "katildi") byUser[r.userId].katildi++;
      else if (r.status === "gelmedi") byUser[r.userId].gelmedi++;
      else if (r.status === "izinli") byUser[r.userId].izinli++;
      byUser[r.userId].records.push(r);
    });

    const totKatildi = monthRecords.filter(r => r.status === "katildi").length;
    const totGelmedi = monthRecords.filter(r => r.status === "gelmedi").length;
    const totIzinli  = monthRecords.filter(r => r.status === "izinli").length;
    const katilimOrani = monthRecords.length ? Math.round((totKatildi / monthRecords.length) * 100) : 0;

    const personCards = Object.values(byUser)
      .sort((a, b) => b.gelmedi + b.izinli - (a.gelmedi + a.izinli))
      .map(u => {
        const absentRecords = u.records
          .filter(r => r.status === "gelmedi" || r.status === "izinli")
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const absentBlock = absentRecords.length === 0
          ? `<p style="color:#2A7A62;font-size:12px;margin:6px 0 0">Bu dönemde devamsızlık kaydı bulunmamaktadır.</p>`
          : `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">
               <tr style="background:#f0f0f0">
                 <td style="padding:5px 8px;font-weight:700;width:22%">Tarih</td>
                 <td style="padding:5px 8px;font-weight:700;width:28%">Toplantı</td>
                 <td style="padding:5px 8px;font-weight:700;width:15%">Durum</td>
                 <td style="padding:5px 8px;font-weight:700;width:35%">Mazeret</td>
               </tr>
               ${absentRecords.map(r => `
                 <tr style="border-bottom:1px solid #e8e8e8;vertical-align:top">
                   <td style="padding:6px 8px;color:#444">${fmtDate(r.date)}</td>
                   <td style="padding:6px 8px;word-break:break-word">${r.meetingTitle || "Toplantı"}</td>
                   <td style="padding:6px 8px;font-weight:700;color:${r.status === "gelmedi" ? "#8B0000" : "#B98B2C"}">${r.status === "gelmedi" ? "Gelmedi" : "İzinli"}</td>
                   <td style="padding:6px 8px;color:#555;word-break:break-word;white-space:pre-wrap">${r.excuse || "<span style='color:#aaa;font-style:italic'>Mazeret girilmemiş</span>"}</td>
                 </tr>`).join("")}
             </table>`;

        return `
          <div style="border:1px solid #ddd;border-radius:8px;padding:14px 16px;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
              <div>
                <span style="font-size:14px;font-weight:700;color:#1a1a1a">${u.name}</span>
                <span style="font-size:12px;color:#667085;margin-left:8px">${u.dept}</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                <span style="background:#e8f5e9;color:#2A7A62;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ Katıldı: ${u.katildi}</span>
                ${u.gelmedi > 0 ? `<span style="background:#fde8e8;color:#8B0000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✗ Gelmedi: ${u.gelmedi}</span>` : ""}
                ${u.izinli > 0  ? `<span style="background:#fef3cd;color:#8A6000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">~ İzinli: ${u.izinli}</span>` : ""}
                <span style="background:#f0f0f0;color:#444;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">Toplam: ${u.katildi + u.gelmedi + u.izinli}</span>
              </div>
            </div>
            ${u.gelmedi >= 3 ? `<div style="background:#fde8e8;border-left:3px solid #8B0000;padding:4px 10px;font-size:11px;color:#8B0000;font-weight:700;margin-bottom:6px">⚠ Devamsızlık uyarısı: ${u.gelmedi} kez gelmedi</div>` : ""}
            ${absentBlock}
          </div>`;
      }).join("");

    const html = `
      <h1>Aylık Devamsızlık Denetim Raporu</h1>
      <table style="margin-bottom:20px">
        <tr><td>Dönem</td><td><strong>${ml}</strong></td></tr>
        <tr><td>Toplam Kayıt</td><td>${monthRecords.length}</td></tr>
        <tr><td>Toplam Katıldı</td><td style="color:#2A7A62;font-weight:700">${totKatildi}</td></tr>
        <tr><td>Toplam Gelmedi</td><td style="color:#8B0000;font-weight:700">${totGelmedi}</td></tr>
        <tr><td>Toplam İzinli</td><td style="color:#B98B2C;font-weight:700">${totIzinli}</td></tr>
        <tr><td>Katılım Oranı</td><td style="font-weight:700">${katilimOrani}%</td></tr>
      </table>
      <h2>Kişi Bazlı Devamsızlık Detayı</h2>
      ${personCards || "<p style='color:#8A8A8E;text-align:center'>Bu dönemde kayıt bulunamadı.</p>"}
    `;
    openPrintableReport({ title: `Devamsızlık Raporu — ${ml}`, bodyHtml: html });
  };

  const statusLabel = { katildi: "Katildi", gelmedi: "Gelmedi", izinli: "Izinli" };

  const scopedRecords = useMemo(() => {
    return attendance
      .filter(r => users.some(u => u.id === r.userId))
      .filter(r => !roleRestrictedDept || r.deptId === roleRestrictedDept)
      .filter(r => selectedDept === "all" || r.deptId === selectedDept)
      .sort((a, b) => (a.meetingTitle || "").localeCompare(b.meetingTitle || "", "tr"));
  }, [attendance, users, selectedDept, roleRestrictedDept]);

  const records = useMemo(() => scopedRecords.filter(r => r.date === selectedDate), [scopedRecords, selectedDate]);

  const userOptions = useMemo(() => {
    const ids = Array.from(new Set(scopedRecords.map(r => r.userId).filter(Boolean)));
    return ids.map(id => ({ id, name: getName(id) })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [scopedRecords]);

  const personTotals = useMemo(() => {
    if (selectedUser === "all") return { present: 0, absent: 0, excused: 0, total: 0, totalAbsence: 0 };
    const list = scopedRecords.filter(r => r.userId === selectedUser);
    const present = list.filter(r => r.status === "katildi").length;
    const absent = list.filter(r => r.status === "gelmedi").length;
    const excused = list.filter(r => r.status === "izinli").length;
    return { present, absent, excused, total: list.length, totalAbsence: absent + excused };
  }, [scopedRecords, selectedUser]);

  const visibleRecords = useMemo(() => {
    if (selectedUser === "all") return records;
    return records.filter(r => r.userId === selectedUser);
  }, [records, selectedUser]);

  const stats = records.reduce((acc, r) => {
    if (r.status === "katildi") acc.present += 1;
    if (r.status === "gelmedi") acc.absent += 1;
    if (r.status === "izinli") acc.excused += 1;
    return acc;
  }, { present: 0, absent: 0, excused: 0 });

  return (
    <div style={{ background: "#F3F3F4", border: "1px solid #E6E6E8", borderRadius: 20, padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div style={{ ...S.card, borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ ...S.cardTitle, marginBottom: 10 }}>Kişi Toplam Devamsızlık</div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Kişi</label>
            <select style={S.select} value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="all">Kişi seçin</option>
              {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ border: "1px solid #ECECEF", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            {[["Toplam Devamsızlık", personTotals.totalAbsence, personTotals.totalAbsence >= 3 ? ROMA_RED : "#171717"], ["Gelmedi", personTotals.absent, personTotals.absent > 0 ? ROMA_RED : "#171717"], ["İzinli", personTotals.excused, GOLD], ["Katıldı", personTotals.present, "#30D158"], ["Toplam Kayıt", personTotals.total, "#171717"]].map(([label, value, color], i) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: i === 4 ? "none" : "1px solid #F1F1F3", fontSize: 12.5 }}>
                <span style={{ color: "#64635F" }}>{label}</span>
                <strong style={{ color }}>{value}</strong>
              </div>
            ))}
          </div>
          {selectedUser !== "all" && (() => {
            const history = scopedRecords
              .filter(r => r.userId === selectedUser && (r.status === "gelmedi" || r.status === "izinli"))
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            if (history.length === 0) return <div style={{ fontSize: 12, color: "#8A8A8E", textAlign: "center", padding: "8px 0" }}>Devamsızlık kaydı yok</div>;
            return (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#98A2B3", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Devamsızlık Geçmişi</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {history.map(r => (
                    <div key={r.id} style={{ background: "#F9F9FB", borderRadius: 8, padding: "8px 10px", border: "1px solid #ECECEF" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: r.excuse ? 4 : 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1D2939" }}>{r.meetingTitle || "Toplantı"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#8A8A8E" }}>{fmtDate(r.date)}</span>
                          <span style={{ ...S.badge(r.status === "gelmedi" ? ROMA_RED : GOLD), fontSize: 10 }}>{r.status === "gelmedi" ? "Gelmedi" : "İzinli"}</span>
                        </div>
                      </div>
                      {r.excuse && <div style={{ fontSize: 11.5, color: "#636366", fontStyle: "italic" }}>Mazeret: {r.excuse}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...S.card, borderRadius: 16, padding: "12px 16px", background: "#FAFBFF", border: "1px solid #D9E4F5" }}>
            <div style={{ ...S.flexBetween, gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#4F4D49", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.7 }}>Aylık Devamsızlık Raporu</div>
                <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>Seçilen aya ait tüm devamsızlık kaydını PDF olarak indirin</div>
              </div>
              <div style={{ ...S.flex(8), flexWrap: "wrap" }}>
                <div>
                  <label style={S.label}>Ay / Yıl</label>
                  <input type="month" style={{ ...S.input, width: 160 }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
                </div>
                <button style={{ ...S.btn("blue"), marginTop: 20 }} onClick={generateMonthlyAttendanceReport}>
                  <Icon name="download" size={14} /> PDF İndir
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...S.card, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ ...S.flexBetween, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <label style={S.label}>Tarih</label>
                  <input type="date" style={{ ...S.input, width: 170 }} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Departman</label>
                  <select style={{ ...S.select, width: 190 }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                    <option value="all">Tum Departmanlar</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(94px,1fr))", gap: 8, width: "100%", maxWidth: 460 }}>
                {[["Katildi", stats.present, "#2A7A62"], ["Gelmedi", stats.absent, ROMA_RED], ["Izinli", stats.excused, GOLD], ["Kayit", records.length, STOIC_NAVY]].map(([label, num, color]) => (
                  <div key={label} style={{ border: "1px solid #ECECEF", borderRadius: 12, padding: "9px 10px", background: "#FFFFFF" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{num}</div>
                    <div style={{ fontSize: 11, color: "#6B6B65" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...S.card, borderRadius: 16, padding: "8px 0 0" }}>
            <table style={S.table}>
              <thead>
                <tr>{["Toplanti", "Kisi", "Departman", "Durum", "Mazeret", "Kaynak"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRecords.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#8A8A8E" }}>Kayit bulunamadi</td></tr>
                ) : visibleRecords.map(r => {
                  const status = r.status;
                  return (
                    <tr key={r.id}>
                      <td style={S.td}><strong>{r.meetingTitle || "Toplanti"}</strong></td>
                      <td style={S.td}>{getName(r.userId)}</td>
                      <td style={S.td}>{r.deptId ? getDept(r.deptId) : "—"}</td>
                      <td style={S.td}>
                        <span style={S.badge(status === "katildi" ? "#2A7A62" : status === "gelmedi" ? ROMA_RED : status === "izinli" ? GOLD : "#8A8A8E")}>{statusLabel[status] || "—"}</span>
                      </td>
                      <td style={{ ...S.td, maxWidth: 260, color: "#66645F", wordBreak: "break-word", whiteSpace: "normal", lineHeight: 1.5 }}>{r.excuse || "—"}</td>
                      <td style={S.td}><span style={S.tag}>{r.source === "meeting-report" ? "Toplanti" : "Manuel"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
