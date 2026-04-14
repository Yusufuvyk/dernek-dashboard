import { useState } from "react";
import { S } from "../utils/styles";
import { hasSuperRole } from "../utils/roles";
import { STOIC_NAVY, ROMA_RED } from "../utils/constants";

export default function DeptAccordionPicker({ label, users, depts, selected, onChange, userProfile }) {
  const [openDepts, setOpenDepts] = useState({});
  const [search, setSearch] = useState("");
  const toggleDept = name => setOpenDepts(p => ({ ...p, [name]: !p[name] }));
  const isSearching = search.trim().length > 0;

  const filteredUsers = isSearching
    ? users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()))
    : users;

  const groups = filteredUsers.reduce((acc, u) => {
    const deptName = depts.find(d => d.id === u.deptId)?.name || "Departmansız";
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(u);
    return acc;
  }, {});

  const toggleUser = id => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const addDept = deptUsers => onChange([...new Set([...selected, ...deptUsers.map(u => u.id)])]);
  const addAll = () => onChange(users.map(u => u.id));
  const clearAll = () => onChange([]);

  const deptEntries = Object.entries(groups);

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 8 }}>
        <label style={{ ...S.label, marginBottom: 0 }}>
          {label}
          {selected.length > 0 && <span style={{ ...S.badge(STOIC_NAVY), marginLeft: 7, fontSize: 10 }}>{selected.length} seçili</span>}
        </label>
        <div style={S.flex(6)}>
          {hasSuperRole(userProfile?.role) && (
            <button type="button" style={{ ...S.btn("ghost"), padding: "4px 9px", fontSize: 11 }} onClick={addAll}>Herkesi Çağır</button>
          )}
          {selected.length > 0 && (
            <button type="button" style={{ ...S.btn("ghost"), padding: "4px 9px", fontSize: 11, color: ROMA_RED }} onClick={clearAll}>Temizle</button>
          )}
          <input style={{ ...S.input, width: 130, padding: "5px 10px", fontSize: 12 }} placeholder="Kişi ara…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div style={{ border: "1px solid #E6E6E8", borderRadius: 10, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
        {deptEntries.length === 0 && (
          <div style={{ padding: "12px", fontSize: 12, color: "#8A8A8E", textAlign: "center" }}>Sonuç bulunamadı</div>
        )}
        {deptEntries.map(([deptName, deptUsers], idx) => {
          const isOpen = isSearching || !!openDepts[deptName];
          const selectedCount = deptUsers.filter(u => selected.includes(u.id)).length;
          return (
            <div key={deptName} style={{ borderBottom: idx < deptEntries.length - 1 ? "1px solid #E6E6E8" : "none" }}>
              <div onClick={() => toggleDept(deptName)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", cursor: "pointer", background: isOpen ? "#F5F5F7" : "#fff", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{deptName}</span>
                  <span style={{ fontSize: 11, color: "#8A8A8E" }}>{deptUsers.length} kişi</span>
                  {selectedCount > 0 && <span style={{ ...S.badge(STOIC_NAVY), fontSize: 10 }}>{selectedCount} seçili</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" style={{ ...S.btn("ghost"), padding: "2px 8px", fontSize: 11 }} onClick={e => { e.stopPropagation(); addDept(deptUsers); }}>+ Hepsini Ekle</button>
                  <span style={{ fontSize: 11, color: "#8A8A8E" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "8px 12px 10px", display: "flex", flexWrap: "wrap", gap: 6, background: "#FAFAFA" }}>
                  {deptUsers.map(u => {
                    const isSel = selected.includes(u.id);
                    return (
                      <div key={u.id} onClick={() => toggleUser(u.id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500, background: isSel ? "#1C1C1E" : "#F2F2F7", color: isSel ? "#fff" : "#1C1C1E", border: isSel ? "1px solid #444" : "1px solid transparent" }}>
                        {u.name}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
