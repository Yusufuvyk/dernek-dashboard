import { useState } from "react";
import { S } from "../utils/styles";
import { ROMA_RED, STOIC_NAVY, GOLD } from "../utils/constants";
import { avatarColor } from "../utils/constants";
import { hasAdminRole, roleKey, displayRole, isDenetmenRole } from "../utils/roles";

export default function OrgTreePage({ users, depts, userProfile }) {
  const [selected, setSelected] = useState(null);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  const nodeColor = r => {
    const k = roleKey(r);
    if (k === "yardimci" || k === "baskan yardimcisi") return "#A855F7";
    if (k === "departman yardimcisi") return "#7C3AED";
    if (k === "denetmen yardimcisi") return "#C084FC";
    if (isDenetmenRole(r)) return GOLD;
    if (hasAdminRole(r)) return ROMA_RED;
    if (["Departman Yöneticisi", "Departman Üyesi"].includes(r)) return STOIC_NAVY;
    return "#30D158";
  };

  // Roots: Başkan/TeknikYönetici — Yardımcı türleri ve Denetmen hariç
  const roots = users.filter(u =>
    hasAdminRole(u.role) &&
    !["yardimci", "baskan yardimcisi"].includes(roleKey(u.role))
  );

  function getChildren(user) {
    const explicit = users.filter(u => u.managerId === user.id);
    const explicitIds = new Set(explicit.map(c => c.id));
    let implicit = [];

    // Root düğüm: Başkan/TeknikYönetici (Yardımcı türleri hariç)
    const isRootNode = hasAdminRole(user.role) &&
      !["yardimci", "baskan yardimcisi"].includes(roleKey(user.role));

    if (isRootNode) {
      const deptManagers = users.filter(u =>
        u.role === "Departman Yöneticisi" &&
        !u.managerId &&
        !explicitIds.has(u.id)
      );

      const orphanedMembers = users.filter(u => {
        if (hasAdminRole(u.role) || u.role === "Departman Yöneticisi" || u.managerId || explicitIds.has(u.id)) return false;
        if (roleKey(u.role) === "denetmen") return false;
        const hasManagerInDept = users.some(other => other.deptId === u.deptId && other.role === "Departman Yöneticisi");
        return !hasManagerInDept;
      });

      // Denetmen ve Denetmen Yardımcısı: managerId yoksa root altında göster
      const implicitDenetmen = users.filter(u =>
        isDenetmenRole(u.role) &&
        !u.managerId &&
        !explicitIds.has(u.id)
      );

      // Başkan Yardımcısı: managerId yoksa root altında göster
      const implicitBYardimci = users.filter(u =>
        ["yardimci", "baskan yardimcisi"].includes(roleKey(u.role)) &&
        !u.managerId &&
        !explicitIds.has(u.id)
      );

      implicit = [...deptManagers, ...orphanedMembers, ...implicitDenetmen, ...implicitBYardimci];
    } else if (["departman yoneticisi", "departman yardimcisi"].includes(roleKey(user.role))) {
      implicit = users.filter(u =>
        !hasAdminRole(u.role) &&
        !["departman yoneticisi", "departman yardimcisi"].includes(roleKey(u.role)) &&
        !isDenetmenRole(u.role) &&
        u.deptId === user.deptId &&
        !u.managerId &&
        !explicitIds.has(u.id)
      );
    }

    return [...explicit, ...implicit];
  }

  function OrgNode({ user }) {
    const children = getChildren(user);
    const isSel = selected === user.id;
    const rc = nodeColor(user.role);

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          onClick={() => setSelected(isSel ? null : user.id)}
          style={{
            background: isSel ? STOIC_NAVY : "#FFFFFF",
            color: isSel ? "#F7F7F5" : "#161513",
            border: `1px solid ${isSel ? STOIC_NAVY : "#E5E5E5"}`,
            borderTop: `3px solid ${rc}`,
            borderRadius: 10,
            padding: "10px 14px",
            minWidth: 160,
            cursor: "pointer",
            boxShadow: isSel ? "0 4px 16px rgba(0,0,0,.14)" : "0 2px 8px rgba(0,0,0,.06)",
          }}
        >
          <div style={{ ...S.flex(8), marginBottom: 6 }}>
            <div style={{ ...S.avatar(avatarColor(user.id)), width: 30, height: 30, fontSize: 10 }}>
              {user.avatar || user.name?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 10.5, color: isSel ? "rgba(255,255,255,.6)" : "#8A8A8E" }}>
                {user.title || displayRole(user.role)}
              </div>
            </div>
          </div>
          <div style={{ ...S.flex(6), flexWrap: "wrap", gap: 5 }}>
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: rc + "22", color: rc, fontWeight: 600 }}>
              {displayRole(user.role)}
            </span>
            {!hasAdminRole(user.role) && user.deptId && (
              <span style={{ fontSize: 10, color: isSel ? "rgba(255,255,255,.5)" : "#8A8A8E" }}>
                {getDept(user.deptId)}
              </span>
            )}
          </div>
        </div>

        {children.length > 0 && (
          <>
            <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />
            {children.length === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />
                <OrgNode user={children[0]} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
                {children.map((child, i) => (
                  <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 14px" }}>
                    <div style={{
                      alignSelf: "stretch", height: 2,
                      background:
                        i === 0
                          ? "linear-gradient(to right, transparent 50%, #D0D0D0 50%)"
                          : i === children.length - 1
                            ? "linear-gradient(to right, #D0D0D0 50%, transparent 50%)"
                            : "#D0D0D0",
                    }} />
                    <div style={{ width: 2, height: 22, background: "#D0D0D0" }} />
                    <OrgNode user={child} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const selUser = users.find(u => u.id === selected);
  return (
    <div>
      <div style={{ ...S.card, overflow: "auto", marginBottom: selUser ? 14 : 0 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 24px", minWidth: 560 }}>
          {roots.length === 0 ? (
            <div style={S.empty}>"Başkan" rolünde kullanıcı bulunamadı</div>
          ) : roots.length === 1 ? (
            <OrgNode user={roots[0]} />
          ) : (
            <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
              {roots.map(r => <OrgNode key={r.id} user={r} />)}
            </div>
          )}
        </div>
      </div>
      {selUser && (
        <div style={{ ...S.card, ...S.flex(16) }}>
          <div style={{ ...S.avatar(avatarColor(selUser.id)), width: 52, height: 52, fontSize: 16 }}>
            {selUser.avatar || selUser.name?.[0]}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{selUser.name}</div>
            <div style={{ fontSize: 13, color: "#636366" }}>{selUser.title} · {displayRole(selUser.role)}</div>
            <div style={{ fontSize: 12.5, color: "#8A8A8E" }}>{selUser.email}</div>
            <div style={{ ...S.flex(8), flexWrap: "wrap", marginTop: 8 }}>
              {selUser.deptId && <span style={S.tag}>{getDept(selUser.deptId)}</span>}
              {selUser.managerId && (
                <span style={S.tag}>Üst: {users.find(u => u.id === selUser.managerId)?.name}</span>
              )}
              {getChildren(selUser).length > 0 && (
                <span style={S.tag}>{getChildren(selUser).length} kişi yönetiyor</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
